import { db } from '../db.ts';

export interface CatalogJobState {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  currentPage: number;
  perPage: number;
  totalDiscovered: number;
  totalImported: number;
  totalUpdated: number;
  totalFailed: number;
  lastError: string;
  scope: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

let isJobRunning = false;
let pauseRequested = false;
let cancelRequested = false;

const GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

export async function getJobState(): Promise<CatalogJobState> {
  const row = db.prepare('SELECT * FROM catalog_import_jobs WHERE id = ?').get('job_primary') as any;
  if (!row) {
    const now = new Date().toISOString();
    return {
      id: 'job_primary',
      status: 'idle',
      currentPage: 1,
      perPage: 50,
      totalDiscovered: 0,
      totalImported: 0,
      totalUpdated: 0,
      totalFailed: 0,
      lastError: '',
      scope: 'all',
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };
  }

  return {
    id: row.id,
    status: row.status,
    currentPage: row.current_page || 1,
    perPage: row.per_page || 50,
    totalDiscovered: row.total_discovered || 0,
    totalImported: row.total_imported || 0,
    totalUpdated: row.total_updated || 0,
    totalFailed: row.total_failed || 0,
    lastError: row.last_error || '',
    scope: row.scope || 'all',
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function startCatalogImport(scope = 'all', reset = false): Promise<CatalogJobState> {
  if (isJobRunning) {
    return getJobState();
  }

  const now = new Date().toISOString();
  if (reset) {
    db.prepare(`
      UPDATE catalog_import_jobs
      SET status = 'running',
          current_page = 1,
          total_discovered = 0,
          total_imported = 0,
          total_updated = 0,
          total_failed = 0,
          last_error = '',
          scope = ?,
          started_at = ?,
          updated_at = ?,
          completed_at = NULL
      WHERE id = 'job_primary'
    `).run(scope, now, now);
  } else {
    db.prepare(`
      UPDATE catalog_import_jobs
      SET status = 'running',
          scope = ?,
          last_error = '',
          updated_at = ?
      WHERE id = 'job_primary'
    `).run(scope, now);
  }

  pauseRequested = false;
  cancelRequested = false;

  // Run in background
  runImportWorker().catch((err) => {
    console.error('[CATALOG WORKER ERROR]', err);
  });

  return getJobState();
}

export async function pauseCatalogImport(): Promise<CatalogJobState> {
  pauseRequested = true;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE catalog_import_jobs
    SET status = 'paused',
        updated_at = ?
    WHERE id = 'job_primary'
  `).run(now);
  return getJobState();
}

export async function resumeCatalogImport(): Promise<CatalogJobState> {
  return startCatalogImport('all', false);
}

export async function cancelCatalogImport(): Promise<CatalogJobState> {
  cancelRequested = true;
  pauseRequested = false;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE catalog_import_jobs
    SET status = 'cancelled',
        updated_at = ?
    WHERE id = 'job_primary'
  `).run(now);
  return getJobState();
}

async function runImportWorker(): Promise<void> {
  if (isJobRunning) return;
  isJobRunning = true;

  try {
    let state = await getJobState();
    let page = state.currentPage;
    let hasNextPage = true;

    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            total
            currentPage
            lastPage
            hasNextPage
            perPage
          }
          media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
            id
            title {
              romaji
              english
              native
              userPreferred
            }
            description(asHtml: false)
            coverImage {
              extraLarge
              large
              medium
            }
            bannerImage
            genres
            tags {
              id
              name
              rank
            }
            format
            status
            season
            seasonYear
            episodes
            duration
            averageScore
            popularity
            studios(isMain: true) {
              nodes {
                id
                name
                isAnimationStudio
              }
            }
            siteUrl
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                    english
                  }
                  format
                  startDate {
                    year
                    month
                    day
                  }
                  status
                }
              }
            }
          }
        }
      }
    `;

    while (hasNextPage && !pauseRequested && !cancelRequested) {
      const now = new Date().toISOString();

      try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query,
            variables: { page, perPage: 50 },
          }),
        });

        if (response.status === 429) {
          console.warn(`[CATALOG WORKER] Rate limited on page ${page}. Waiting 10s...`);
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }

        if (!response.ok) {
          throw new Error(`AniList returned HTTP ${response.status}`);
        }

        const json = await response.json();
        const pageData = json?.data?.Page;
        if (!pageData) {
          throw new Error('Malformed GraphQL response');
        }

        const mediaList = pageData.media || [];
        const pageInfo = pageData.pageInfo;
        const totalDiscovered = pageInfo?.total || state.totalDiscovered;
        hasNextPage = Boolean(pageInfo?.hasNextPage);

        let importedThisPage = 0;
        let updatedThisPage = 0;

        // Process batch in transaction
        for (const item of mediaList) {
          try {
            const anilistId = item.id;
            const existing = db.prepare('SELECT id FROM qwish_anime WHERE anilist_id = ?').get(anilistId) as any;

            const id = String(anilistId);
            const title = item.title?.english || item.title?.romaji || item.title?.userPreferred || 'Untitled Anime';
            const titleEnglish = item.title?.english || null;
            const titleRomaji = item.title?.romaji || null;
            const titleNative = item.title?.native || null;
            const description = item.description || '';
            const coverImage = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '';
            const bannerImage = item.bannerImage || coverImage;
            const genres = JSON.stringify(item.genres || []);
            const tags = JSON.stringify(item.tags?.map((t: any) => t.name) || []);
            const format = item.format || 'TV';
            const status = item.status || 'FINISHED';
            const season = item.season || null;
            const seasonYear = item.seasonYear || null;
            const episodes = item.episodes || null;
            const duration = item.duration || null;
            const averageScore = item.averageScore || 0;
            const popularity = item.popularity || 0;
            const studios = item.studios?.nodes?.[0]?.name || '';
            const siteUrl = item.siteUrl || `https://anilist.co/anime/${anilistId}`;

            db.prepare(`
              INSERT INTO qwish_anime (
                id, anilist_id, title, title_english, title_romaji, title_native, description,
                cover_image, banner_image, genres, tags, format, status, season, season_year,
                episodes, duration, average_score, popularity, studios, site_url, is_published,
                is_demo, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
              ON CONFLICT(anilist_id) DO UPDATE SET
                title = excluded.title,
                title_english = excluded.title_english,
                title_romaji = excluded.title_romaji,
                title_native = excluded.title_native,
                description = excluded.description,
                cover_image = excluded.cover_image,
                banner_image = excluded.banner_image,
                genres = excluded.genres,
                tags = excluded.tags,
                format = excluded.format,
                status = excluded.status,
                season = excluded.season,
                season_year = excluded.season_year,
                episodes = excluded.episodes,
                duration = excluded.duration,
                average_score = excluded.average_score,
                popularity = excluded.popularity,
                studios = excluded.studios,
                site_url = excluded.site_url,
                is_demo = 0,
                updated_at = excluded.updated_at
            `).run(
              id, anilistId, title, titleEnglish, titleRomaji, titleNative, description,
              coverImage, bannerImage, genres, tags, format, status, season, seasonYear,
              episodes, duration, averageScore, popularity, studios, siteUrl, now, now
            );

            // Seed initial episodes shells
            const epCount = episodes && episodes > 0 ? Math.min(episodes, 24) : 12;
            const insertEp = db.prepare(`
              INSERT OR IGNORE INTO qwish_episodes (id, anime_id, episode_number, title, is_published, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, 'READY', ?, ?)
            `);
            for (let e = 1; e <= epCount; e++) {
              insertEp.run(`ep_${anilistId}_${e}`, id, e, `Episode ${e}`, now, now);
            }

            // Store relations
            if (item.relations?.edges) {
              const insertRel = db.prepare(`
                INSERT OR IGNORE INTO anime_relations (
                  id, source_anilist_id, target_anilist_id, relation_type, target_title, target_format, target_year, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `);

              for (const edge of item.relations.edges) {
                const targetId = edge.node?.id;
                if (!targetId || targetId === anilistId) continue;
                const rType = edge.relationType || 'OTHER';
                const targetTitle = edge.node.title?.english || edge.node.title?.romaji || 'Related Anime';
                const targetFormat = edge.node.format || 'TV';
                const targetYear = edge.node.startDate?.year || null;
                const relId = `rel_${anilistId}_${targetId}_${rType}`;

                insertRel.run(relId, anilistId, targetId, rType, targetTitle, targetFormat, targetYear, now);
              }
            }

            if (existing) {
              updatedThisPage++;
            } else {
              importedThisPage++;
            }
          } catch (itemErr: any) {
            console.warn(`[CATALOG WORKER] Error saving anime ${item.id}:`, itemErr.message);
          }
        }

        state = await getJobState();
        page++;

        db.prepare(`
          UPDATE catalog_import_jobs
          SET current_page = ?,
              total_discovered = ?,
              total_imported = total_imported + ?,
              total_updated = total_updated + ?,
              updated_at = ?
          WHERE id = 'job_primary'
        `).run(page, totalDiscovered, importedThisPage, updatedThisPage, now);

        // Sleep briefly to be a good citizen on AniList API rate limits
        await new Promise((r) => setTimeout(r, 750));
      } catch (err: any) {
        console.error(`[CATALOG WORKER] Failed page ${page}:`, err.message);
        db.prepare(`
          UPDATE catalog_import_jobs
          SET total_failed = total_failed + 1,
              last_error = ?,
              updated_at = ?
          WHERE id = 'job_primary'
        `).run(err.message, now);

        // Wait before retry
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    const finalNow = new Date().toISOString();
    if (!hasNextPage) {
      db.prepare(`
        UPDATE catalog_import_jobs
        SET status = 'completed',
            completed_at = ?,
            updated_at = ?
        WHERE id = 'job_primary'
      `).run(finalNow, finalNow);
    }
  } finally {
    isJobRunning = false;
  }
}
