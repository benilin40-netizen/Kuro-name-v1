import { db } from '../db.ts';

export interface WatchOrderItem {
  anilistId: number;
  title: string;
  format: string;
  year: number | null;
  entryType: 'main' | 'movie' | 'ova' | 'spin_off' | 'recap' | 'special';
  relationToRoot?: string;
  position: number;
  confidence: 'verified' | 'inferred' | 'needs_review';
  notes: string;
  isImported: boolean;
  coverImage?: string;
}

export interface WatchOrderResult {
  rootAnilistId: number;
  rootTitle: string;
  seriesName: string;
  totalEntries: number;
  releaseOrder: WatchOrderItem[];
  chronologicalOrder: WatchOrderItem[];
  recommendedOrder: WatchOrderItem[];
  seriesGrouping: {
    mainSeries: WatchOrderItem[];
    moviesAndOvas: WatchOrderItem[];
    sideStories: WatchOrderItem[];
    spinOffsAndRecaps: WatchOrderItem[];
  };
  reviewQueue: WatchOrderItem[];
}

const GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

export async function fetchAndStoreRelations(anilistId: number): Promise<void> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        format
        startDate { year month day }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english }
              format
              startDate { year month day }
              status
              coverImage { medium }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
    });

    if (!res.ok) return;
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media || !media.relations?.edges) return;

    const now = new Date().toISOString();
    const insertRel = db.prepare(`
      INSERT OR IGNORE INTO anime_relations (
        id, source_anilist_id, target_anilist_id, relation_type, target_title, target_format, target_year, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const edge of media.relations.edges) {
      const targetId = edge.node?.id;
      if (!targetId || targetId === anilistId) continue;
      const rType = edge.relationType || 'OTHER';
      const targetTitle = edge.node.title?.english || edge.node.title?.romaji || 'Related Anime';
      const targetFormat = edge.node.format || 'TV';
      const targetYear = edge.node.startDate?.year || null;
      const relId = `rel_${anilistId}_${targetId}_${rType}`;
      insertRel.run(relId, anilistId, targetId, rType, targetTitle, targetFormat, targetYear, now);
    }
  } catch (err: any) {
    console.warn(`[WATCH ORDER] Could not fetch relations for ${anilistId}:`, err.message);
  }
}

export async function getWatchOrderForAnime(anilistId: number): Promise<WatchOrderResult> {
  // 1. Fetch relations if none exist locally
  const existingRels = db.prepare('SELECT * FROM anime_relations WHERE source_anilist_id = ?').all(anilistId);
  if (!existingRels || existingRels.length === 0) {
    await fetchAndStoreRelations(anilistId);
  }

  // 2. Discover related network (BFS up to depth 2)
  const discoveredIds = new Set<number>([anilistId]);
  const frontier = [anilistId];

  while (frontier.length > 0 && discoveredIds.size < 40) {
    const currentId = frontier.shift()!;
    const rels = db.prepare('SELECT target_anilist_id FROM anime_relations WHERE source_anilist_id = ?').all(currentId) as any[];
    for (const r of rels) {
      if (!discoveredIds.has(r.target_anilist_id)) {
        discoveredIds.add(r.target_anilist_id);
        if (discoveredIds.size < 25) {
          frontier.push(r.target_anilist_id);
          // If related item not in relations table, populate in background
          const hasTargetRels = db.prepare('SELECT id FROM anime_relations WHERE source_anilist_id = ? LIMIT 1').get(r.target_anilist_id);
          if (!hasTargetRels) {
            fetchAndStoreRelations(r.target_anilist_id).catch(() => {});
          }
        }
      }
    }
  }

  // 3. Gather metadata for all discovered entries
  const allEntries: WatchOrderItem[] = [];
  const rootAnime = db.prepare('SELECT * FROM qwish_anime WHERE anilist_id = ?').get(anilistId) as any;
  const rootTitle = rootAnime?.title || `Anime #${anilistId}`;

  for (const id of discoveredIds) {
    const local = db.prepare('SELECT * FROM qwish_anime WHERE anilist_id = ?').get(id) as any;
    const relRecord = db.prepare(`
      SELECT relation_type, target_title, target_format, target_year
      FROM anime_relations
      WHERE (source_anilist_id = ? AND target_anilist_id = ?)
         OR (source_anilist_id = ? AND target_anilist_id = ?)
      LIMIT 1
    `).get(anilistId, id, id, anilistId) as any;

    const title = local?.title || relRecord?.target_title || `Anime #${id}`;
    const format = local?.format || relRecord?.target_format || 'TV';
    const year = local?.season_year || relRecord?.target_year || null;
    const relationType = id === anilistId ? 'ROOT' : (relRecord?.relation_type || 'RELATED');

    let entryType: WatchOrderItem['entryType'] = 'main';
    if (format === 'MOVIE') entryType = 'movie';
    else if (format === 'OVA' || format === 'ONA' || format === 'SPECIAL') entryType = 'ova';
    else if (relationType === 'SPIN_OFF') entryType = 'spin_off';
    else if (relationType === 'SUMMARY') entryType = 'recap';
    else if (relationType === 'SIDE_STORY') entryType = 'ova';

    let confidence: WatchOrderItem['confidence'] = 'verified';
    let notes = '';

    if (id === anilistId) {
      notes = 'Selected base series';
    } else if (relationType === 'PREQUEL') {
      notes = 'Direct prequel storyline';
    } else if (relationType === 'SEQUEL') {
      notes = 'Direct sequel storyline';
    } else if (relationType === 'SUMMARY') {
      notes = 'Recap movie / special; optional viewing';
    } else if (relationType === 'SPIN_OFF') {
      notes = 'Standalone alternate universe / spin-off';
      confidence = 'inferred';
    } else if (relationType === 'SIDE_STORY') {
      notes = 'Canon side story / OVA episode';
    } else {
      notes = 'Related franchise media';
      confidence = 'needs_review';
    }

    allEntries.push({
      anilistId: id,
      title,
      format,
      year,
      entryType,
      relationToRoot: relationType,
      position: 1,
      confidence,
      notes,
      isImported: Boolean(local),
      coverImage: local?.cover_image || undefined,
    });
  }

  // 4. Construct Order A: Release Order (sorted by year then id)
  const releaseOrder = [...allEntries].sort((a, b) => {
    if (a.year && b.year && a.year !== b.year) return a.year - b.year;
    if (a.year && !b.year) return -1;
    if (!a.year && b.year) return 1;
    return a.anilistId - b.anilistId;
  }).map((item, idx) => ({ ...item, position: idx + 1 }));

  // 5. Construct Order B: Chronological Order
  // Prequels first, then Root, then Sequels, with side stories placed according to release year
  const prequels = allEntries.filter((e) => e.relationToRoot === 'PREQUEL').sort((a, b) => (a.year || 0) - (b.year || 0));
  const main = allEntries.filter((e) => e.relationToRoot === 'ROOT');
  const sequels = allEntries.filter((e) => e.relationToRoot === 'SEQUEL').sort((a, b) => (a.year || 0) - (b.year || 0));
  const sideAndMovies = allEntries.filter((e) => !['PREQUEL', 'ROOT', 'SEQUEL'].includes(e.relationToRoot || '')).sort((a, b) => (a.year || 0) - (b.year || 0));

  const chronologicalOrder = [...prequels, ...main, ...sequels, ...sideAndMovies].map((item, idx) => ({
    ...item,
    position: idx + 1,
  }));

  // 6. Construct Order C: Recommended Watch Order
  // Main story sequence (Root + Sequels) first, then significant Canon OVAs/Prequels, then Movies, then Spin-offs/Recaps
  const recMain = [...main, ...sequels];
  const recCanonSide = [...prequels, ...allEntries.filter((e) => e.entryType === 'ova' && !['PREQUEL', 'ROOT', 'SEQUEL'].includes(e.relationToRoot || ''))];
  const recMovies = allEntries.filter((e) => e.entryType === 'movie' && !['PREQUEL', 'ROOT', 'SEQUEL'].includes(e.relationToRoot || ''));
  const recOther = allEntries.filter((e) => (e.entryType === 'spin_off' || e.entryType === 'recap') && !['PREQUEL', 'ROOT', 'SEQUEL'].includes(e.relationToRoot || ''));

  const recommendedOrder = [...recMain, ...recCanonSide, ...recMovies, ...recOther].map((item, idx) => ({
    ...item,
    position: idx + 1,
  }));

  // 7. Groupings
  const seriesGrouping = {
    mainSeries: allEntries.filter((e) => e.entryType === 'main' || ['ROOT', 'PREQUEL', 'SEQUEL'].includes(e.relationToRoot || '')),
    moviesAndOvas: allEntries.filter((e) => e.entryType === 'movie' || (e.entryType === 'ova' && e.relationToRoot !== 'PREQUEL')),
    sideStories: allEntries.filter((e) => e.relationToRoot === 'SIDE_STORY'),
    spinOffsAndRecaps: allEntries.filter((e) => e.entryType === 'spin_off' || e.entryType === 'recap'),
  };

  const reviewQueue = allEntries.filter((e) => e.confidence === 'needs_review');

  return {
    rootAnilistId: anilistId,
    rootTitle,
    seriesName: rootTitle.split(':')[0]?.split('Season')[0]?.trim() || rootTitle,
    totalEntries: allEntries.length,
    releaseOrder,
    chronologicalOrder,
    recommendedOrder,
    seriesGrouping,
    reviewQueue,
  };
}
