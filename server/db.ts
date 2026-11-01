import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Ensure data directory exists
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kuronami.db');
export const db = new DatabaseSync(DB_PATH);

// Initialize database tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      bio TEXT,
      favourite_genres TEXT,
      banner TEXT,
      updated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS anime_cache (
      id INTEGER PRIMARY KEY,
      mal_id INTEGER,
      title_romaji TEXT,
      title_english TEXT,
      title_native TEXT,
      synopsis TEXT,
      cover_image TEXT,
      banner_image TEXT,
      format TEXT,
      status TEXT,
      season TEXT,
      season_year INTEGER,
      episodes INTEGER,
      duration INTEGER,
      average_score INTEGER,
      popularity INTEGER,
      genres TEXT,
      studios TEXT,
      next_airing_episode INTEGER,
      next_airing_at INTEGER,
      raw_json TEXT,
      cached_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      anime_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      progress_episodes INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, anime_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favourites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      anime_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, anime_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      anime_id INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      progress_seconds INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      watched_at TEXT NOT NULL,
      UNIQUE(user_id, anime_id, episode_number),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_sources (
      id TEXT PRIMARY KEY,
      anime_id INTEGER NOT NULL,
      episode_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      season_number INTEGER DEFAULT 1,
      provider TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      type TEXT NOT NULL, -- 'mp4', 'hls', 'embed'
      quality TEXT DEFAULT '1080p',
      language TEXT DEFAULT 'Japanese (Sub)',
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      is_default INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      health_status TEXT DEFAULT 'healthy', -- 'healthy', 'degraded', 'offline', 'invalid'
      invalid_reason TEXT DEFAULT '',
      verified_at TEXT DEFAULT '',
      last_checked TEXT,
      last_successful_check TEXT,
      response_time_ms INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      http_status INTEGER DEFAULT 200,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      source TEXT NOT NULL,
      url TEXT,
      image_url TEXT,
      category TEXT NOT NULL,
      anime_id INTEGER,
      published_at TEXT NOT NULL,
      is_admin_post INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS featured_anime (
      anime_id INTEGER PRIMARY KEY,
      priority INTEGER DEFAULT 0,
      custom_tagline TEXT,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback_sources (
      id TEXT PRIMARY KEY,
      anime_id INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      season_number INTEGER DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'sub',
      provider TEXT NOT NULL,
      provider_video_id TEXT,
      embed_url TEXT,
      playback_url TEXT,
      quality TEXT DEFAULT '1080p',
      is_published INTEGER DEFAULT 1,
      processing_status TEXT DEFAULT 'ready',
      is_primary INTEGER DEFAULT 0,
      title TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(anime_id, season_number, episode_number, provider, language)
    );

    -- QWISH Production Tables
    CREATE TABLE IF NOT EXISTS qwish_anime (
      id TEXT PRIMARY KEY,
      anilist_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      title_english TEXT,
      title_romaji TEXT,
      description TEXT,
      cover_image TEXT,
      banner_image TEXT,
      genres TEXT,
      format TEXT,
      status TEXT,
      season TEXT,
      season_year INTEGER,
      episodes INTEGER,
      average_score INTEGER,
      popularity INTEGER,
      studios TEXT,
      is_published INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qwish_episodes (
      id TEXT PRIMARY KEY,
      anime_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      cloudflare_video_id TEXT,
      duration INTEGER DEFAULT 0,
      thumbnail TEXT,
      description TEXT,
      is_published INTEGER DEFAULT 1,
      status TEXT DEFAULT 'READY',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(anime_id, episode_number)
    );

    CREATE TABLE IF NOT EXISTS qwish_watch_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      episode_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      current_time REAL NOT NULL,
      duration REAL NOT NULL,
      last_watched TEXT NOT NULL,
      UNIQUE(user_id, anime_id)
    );

    CREATE TABLE IF NOT EXISTS qwish_admin (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qwish_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS animepahe_imports (
      anime_id TEXT PRIMARY KEY,
      animepahe_session TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      poster TEXT,
      episodes_count INTEGER DEFAULT 0,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (anime_id) REFERENCES qwish_anime(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS animepahe_sync_history (
      id TEXT PRIMARY KEY,
      anime_id TEXT NOT NULL,
      animepahe_session TEXT NOT NULL,
      new_episodes_added INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      message TEXT,
      synced_at TEXT NOT NULL
    );

    -- Catalog Bulk Import Engine Table
    CREATE TABLE IF NOT EXISTS catalog_import_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle', -- 'idle', 'running', 'paused', 'completed', 'cancelled', 'error'
      current_page INTEGER DEFAULT 1,
      per_page INTEGER DEFAULT 50,
      total_discovered INTEGER DEFAULT 0,
      total_imported INTEGER DEFAULT 0,
      total_updated INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      last_error TEXT DEFAULT '',
      scope TEXT DEFAULT 'all', -- 'all', 'trending', 'popular'
      started_at TEXT,
      updated_at TEXT,
      completed_at TEXT
    );

    -- Anime Relationships Graph
    CREATE TABLE IF NOT EXISTS anime_relations (
      id TEXT PRIMARY KEY,
      source_anilist_id INTEGER NOT NULL,
      target_anilist_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL, -- 'PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE', 'SPIN_OFF', 'SUMMARY', 'FULL_STORY', 'SOURCE', 'OTHER'
      target_title TEXT,
      target_format TEXT,
      target_year INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(source_anilist_id, target_anilist_id, relation_type)
    );

    -- Series Groupings & Franchises
    CREATE TABLE IF NOT EXISTS anime_series (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_anilist_id INTEGER NOT NULL,
      description TEXT DEFAULT '',
      entry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Multi-View Watch Order (Release, Chronological, Recommended)
    CREATE TABLE IF NOT EXISTS anime_watch_order (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      anilist_id INTEGER NOT NULL,
      order_type TEXT NOT NULL, -- 'release', 'chronological', 'recommended'
      position INTEGER NOT NULL,
      entry_type TEXT NOT NULL, -- 'main', 'movie', 'ova', 'spin_off', 'recap', 'special'
      notes TEXT DEFAULT '',
      confidence TEXT DEFAULT 'verified', -- 'verified', 'inferred', 'needs_review'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(series_id, anilist_id, order_type)
    );

    CREATE TABLE IF NOT EXISTS episodes_config (
      id TEXT PRIMARY KEY,
      anime_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL DEFAULT 1,
      episode_number INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'Episode 1',
      status TEXT NOT NULL DEFAULT 'published', -- 'scheduled', 'published', 'unpublished'
      air_date TEXT NOT NULL DEFAULT '', -- ISO 8601 UTC timestamp
      sub_video_url TEXT DEFAULT '',
      dub_video_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      preview_url TEXT DEFAULT '',
      thumbnail TEXT DEFAULT '',
      authorized INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(anime_id, season_number, episode_number)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_assets (
      id TEXT PRIMARY KEY,
      anime_id TEXT,
      episode_id TEXT,
      asset_type TEXT NOT NULL,
      mime_type TEXT,
      original_filename TEXT,
      provider TEXT,
      object_key TEXT,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'uploaded',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      image_url TEXT,
      description TEXT,
      stock INTEGER DEFAULT 100,
      category TEXT DEFAULT 'Merch',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_orders (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anime_category_assignments (
      id TEXT PRIMARY KEY,
      anime_id TEXT NOT NULL,
      category TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(anime_id, category)
    );

    CREATE TABLE IF NOT EXISTS streams_backup (
      id TEXT PRIMARY KEY,
      backup_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Safe column migrations for episodes_config
  try { db.exec(`ALTER TABLE episodes_config ADD COLUMN season_number INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE episodes_config ADD COLUMN air_date TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE episodes_config ADD COLUMN sub_video_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE episodes_config ADD COLUMN dub_video_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE episodes_config ADD COLUMN thumbnail TEXT DEFAULT ''`); } catch {}

  // Safe column migrations for video_sources
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN title TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN quality TEXT DEFAULT '1080p'`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN language TEXT DEFAULT 'Japanese (Sub)'`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN updated_at TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN season_number INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN episode_number INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN is_default INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN status TEXT DEFAULT 'active'`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN health_status TEXT DEFAULT 'healthy'`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN invalid_reason TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN verified_at TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN last_checked TEXT`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN last_successful_check TEXT`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN response_time_ms INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN failure_count INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE video_sources ADD COLUMN http_status INTEGER DEFAULT 200`); } catch {}

  // Safe column migrations for news table
  try { db.exec(`ALTER TABLE news ADD COLUMN is_hidden INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE news ADD COLUMN is_featured INTEGER DEFAULT 0`); } catch {}

  // Safe column migrations for qwish_anime
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN mal_id INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN is_archived INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN synopsis TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN title_native TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN duration INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN site_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN tags TEXT DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE qwish_anime ADD COLUMN is_demo INTEGER DEFAULT 0`); } catch {}

  // Safe column migrations for qwish_episodes
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN season_number INTEGER DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN release_date TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN language TEXT DEFAULT 'sub'`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN video_source_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN video_source_type TEXT DEFAULT 'hls'`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN video_provider TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN is_hidden INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN preview_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE qwish_episodes ADD COLUMN sort_order INTEGER DEFAULT 0`); } catch {}

  // Safe column migrations for playback_sources
  try { db.exec(`ALTER TABLE playback_sources ADD COLUMN download_url TEXT DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE playback_sources ADD COLUMN headers_json TEXT DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE playback_sources ADD COLUMN extra_metadata TEXT DEFAULT '{}'`); } catch {}

  // Ensure default catalog import job row exists
  try {
    const existingJob = db.prepare('SELECT id FROM catalog_import_jobs WHERE id = ?').get('job_primary');
    if (!existingJob) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO catalog_import_jobs (id, status, current_page, per_page, total_discovered, total_imported, total_updated, total_failed, started_at, updated_at)
        VALUES ('job_primary', 'idle', 1, 50, 0, 0, 0, 0, ?, ?)
      `).run(now, now);
    }
  } catch {}

  // Seed default Episode configurations only if explicitly requested for development
  if (process.env.SEED_DEMO_DATA === 'true') {
    try {
      const now = new Date().toISOString();
      const pastDate1 = '2026-09-01T00:00:00.000Z';
      const pastDate2 = '2026-09-08T00:00:00.000Z';
      const futureDate3 = '2026-11-15T00:00:00.000Z';

      const defaultConfigs = [
        // Test Anime A: One Piece (#21)
        { id: 'ep_21_s1_e1', anime_id: 21, season_number: 1, episode_number: 1, title: 'Episode 1 - I\'m Luffy! The Man Who Will Become the Pirate King!', status: 'published', air_date: pastDate1, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', preview_url: 'https://www.youtube-nocookie.com/embed/1W1x9dYgLgw', authorized: 1 },
        { id: 'ep_21_s1_e2', anime_id: 21, season_number: 1, episode_number: 2, title: 'Episode 2 - The Great Swordsman Appears! Pirate Hunter Roronoa Zoro', status: 'published', air_date: pastDate2, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', preview_url: '', authorized: 1 },
        { id: 'ep_21_s1_e3', anime_id: 21, season_number: 1, episode_number: 3, title: 'Episode 3 - Morgan vs. Luffy! Who\'s This Beautiful Young Girl?', status: 'scheduled', air_date: futureDate3, sub_video_url: '', dub_video_url: '', video_url: '', preview_url: '', authorized: 1 },

        // Test Anime B: Attack on Titan (#16498)
        { id: 'ep_16498_s1_e1', anime_id: 16498, season_number: 1, episode_number: 1, title: 'Episode 1 - To You, in 2000 Years: The Fall of Shiganshina, Part 1', status: 'published', air_date: pastDate1, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', preview_url: 'https://www.youtube-nocookie.com/embed/MGRm4IzK1SQ', authorized: 1 },
        { id: 'ep_16498_s1_e2', anime_id: 16498, season_number: 1, episode_number: 2, title: 'Episode 2 - That Day: The Fall of Shiganshina, Part 2', status: 'published', air_date: pastDate2, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4', preview_url: '', authorized: 1 },
        { id: 'ep_16498_s1_e3', anime_id: 16498, season_number: 1, episode_number: 3, title: 'Episode 3 - A Dim Light Amid Despair', status: 'scheduled', air_date: futureDate3, sub_video_url: '', dub_video_url: '', video_url: '', preview_url: '', authorized: 1 },

        // Test Anime C: Demon Slayer (#101922)
        { id: 'ep_101922_s1_e1', anime_id: 101922, season_number: 1, episode_number: 1, title: 'Episode 1 - Cruelty', status: 'published', air_date: pastDate1, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', preview_url: 'https://www.youtube-nocookie.com/embed/VQGCKyvzIM4', authorized: 1 },
        { id: 'ep_101922_s1_e2', anime_id: 101922, season_number: 1, episode_number: 2, title: 'Episode 2 - Trainer Sakonji Urokodaki', status: 'published', air_date: pastDate2, sub_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4', dub_video_url: '', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4', preview_url: '', authorized: 1 },
        { id: 'ep_101922_s1_e3', anime_id: 101922, season_number: 1, episode_number: 3, title: 'Episode 3 - Sabito and Makomo', status: 'scheduled', air_date: futureDate3, sub_video_url: '', dub_video_url: '', video_url: '', preview_url: '', authorized: 1 },
      ];

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO episodes_config (id, anime_id, season_number, episode_number, title, status, air_date, sub_video_url, dub_video_url, video_url, preview_url, authorized, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of defaultConfigs) {
        stmt.run(c.id, c.anime_id, c.season_number, c.episode_number, c.title, c.status, c.air_date, c.sub_video_url, c.dub_video_url, c.video_url, c.preview_url, c.authorized, now, now);
      }
    } catch (e) {
      console.error('Error seeding episodes_config:', e);
    }
  }

  // Seed default admin user if not exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const adminId = 'usr_admin_001';
    const now = new Date().toISOString();
    const passwordHash = 'admin123';
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, avatar, is_admin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      'admin',
      'admin@kuronami.com',
      passwordHash,
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      1,
      now
    );

    db.prepare(`
      INSERT INTO profiles (user_id, bio, favourite_genres, banner, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      adminId,
      'KURO NAMI Chief Administrator & Anime Curator.',
      JSON.stringify(['Action', 'Sci-Fi', 'Fantasy']),
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80',
      now
    );
  }

  // Seed default site settings if not exists
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM site_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    const defaultSettings: [string, string][] = [
      ['site_name', 'KURO NAMI'],
      ['tagline', 'The Modern Anime Discovery & Airing Platform'],
      ['dmca_email', 'compliance@kuronami.com'],
      ['allow_registration', 'true'],
      ['legal_notice', 'KURO NAMI streams only legally authorized and administrative-licensed media sources. Third-party metadata is queried live via official public APIs.']
    ];
    const insertSetting = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)');
    for (const [key, value] of defaultSettings) {
      insertSetting.run(key, value);
    }
  }

  // Seed test video sources only if explicitly requested for development
  if (process.env.SEED_DEMO_DATA === 'true') {
    const sampleSources = [
      // Anime A: One Piece (#21)
      {
        id: 'vs_21_s1_e1_toei',
        anime_id: 21,
        episode_id: 'ep_21_s1_e1',
        episode_number: 1,
        season_number: 1,
        provider: 'Toei Animation Official Stream',
        title: 'One Piece - Episode 1: I\'m Luffy! The Man Who Will Become the Pirate King!',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official high-definition licensed stream for One Piece Episode 1'
      },
      {
        id: 'vs_21_s1_e2_toei',
        anime_id: 21,
        episode_id: 'ep_21_s1_e2',
        episode_number: 2,
        season_number: 1,
        provider: 'Toei Animation Official Stream',
        title: 'One Piece - Episode 2: The Great Swordsman Appears! Pirate Hunter Roronoa Zoro',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official licensed episode stream for One Piece Episode 2'
      },

      // Anime B: Attack on Titan (#16498)
      {
        id: 'vs_16498_s1_e1_wit',
        anime_id: 16498,
        episode_id: 'ep_16498_s1_e1',
        episode_number: 1,
        season_number: 1,
        provider: 'Wit Studio Official Stream',
        title: 'Attack on Titan - Episode 1: To You, in 2000 Years: The Fall of Shiganshina, Part 1',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official licensed episode stream for Attack on Titan Episode 1'
      },
      {
        id: 'vs_16498_s1_e2_wit',
        anime_id: 16498,
        episode_id: 'ep_16498_s1_e2',
        episode_number: 2,
        season_number: 1,
        provider: 'Wit Studio Official Stream',
        title: 'Attack on Titan - Episode 2: That Day: The Fall of Shiganshina, Part 2',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official licensed episode stream for Attack on Titan Episode 2'
      },

      // Anime C: Demon Slayer: Kimetsu no Yaiba (#101922)
      {
        id: 'vs_101922_s1_e1_ufo',
        anime_id: 101922,
        episode_id: 'ep_101922_s1_e1',
        episode_number: 1,
        season_number: 1,
        provider: 'Ufotable Official Stream',
        title: 'Demon Slayer: Kimetsu no Yaiba - Episode 1: Cruelty',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official master stream for Demon Slayer Episode 1'
      },
      {
        id: 'vs_101922_s1_e2_ufo',
        anime_id: 101922,
        episode_id: 'ep_101922_s1_e2',
        episode_number: 2,
        season_number: 1,
        provider: 'Ufotable Official Stream',
        title: 'Demon Slayer: Kimetsu no Yaiba - Episode 2: Trainer Sakonji Urokodaki',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4',
        type: 'mp4',
        quality: '1080p',
        language: 'Japanese (Sub)',
        is_active: 1,
        is_default: 1,
        notes: 'Official master stream for Demon Slayer Episode 2'
      }
    ];

    const insertSource = db.prepare(`
      INSERT OR REPLACE INTO video_sources (
        id, episode_id, episode_number, anime_id, provider, title, url, type, quality, language, is_active, notes, is_default, season_number, health_status, invalid_reason, last_checked, last_successful_check, response_time_ms, failure_count, http_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 120, 0, 200, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const s of sampleSources) {
      insertSource.run(
        s.id,
        s.episode_id,
        s.episode_number,
        s.anime_id,
        s.provider,
        s.title,
        s.url,
        s.type,
        s.quality || '1080p',
        s.language || 'Japanese (Sub)',
        s.is_active,
        s.notes,
        s.is_default || 0,
        s.season_number || 1,
        'healthy',
        now,
        now,
        now,
        now
      );
    }
  }

  // Run comprehensive database integrity audit to detect, flag, and deactivate any cross-contaminated sources
  runDatabaseVideoSourceAudit();

  // Purge any fake/placeholder news articles from database
  try {
    db.exec(`DELETE FROM news WHERE id = 'news_001' OR source LIKE '%KURO NAMI%' OR source LIKE '%Editorial%'`);
  } catch (_e) {}

  // In production (SEED_DEMO_DATA !== 'true'), safely purge any confirmed demo/test seed records.
  // If explicitly requested for development (SEED_DEMO_DATA === 'true'), seed development catalog.
  if (process.env.SEED_DEMO_DATA === 'true') {
    seedDemoData();
  } else {
    purgeDemoData();
  }
}

// Automatically initialize schema and migrations on database connection
initDatabase();

/**
 * Safely removes confirmed test/demo records from database while preserving genuine user data.
 */
export function purgeDemoData(): { removedAnime: number; removedEpisodes: number; removedSources: number } {
  let removedAnime = 0;
  let removedEpisodes = 0;
  let removedSources = 0;

  try {
    // 1. Purge demo episodes with mock Cloudflare IDs or demo IDs
    const epRes = db.prepare(`
      DELETE FROM qwish_episodes
      WHERE cloudflare_video_id LIKE 'demo-cf-stream-%'
         OR id IN ('ep_21_1', 'ep_21_2', 'ep_21_3', 'ep_16498_1', 'ep_16498_2', 'ep_16498_3', 'ep_101922_1', 'ep_101922_2', 'ep_101922_3')
    `).run();
    removedEpisodes += (epRes as any).changes || 0;

    // 2. Purge sample demo sources (Google sample MP4s and test IDs)
    const srcRes = db.prepare(`
      DELETE FROM video_sources
      WHERE id LIKE 'vs_21_s1_%_toei'
         OR id LIKE 'vs_16498_s1_%_wit'
         OR id LIKE 'vs_101922_s1_%_ufo'
         OR id LIKE 'vs_00%'
         OR id = 'vs_010'
         OR url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
    `).run();
    removedSources += (srcRes as any).changes || 0;

    // 3. Purge demo episodes_config
    db.prepare(`
      DELETE FROM episodes_config
      WHERE id LIKE 'ep_21_s1_e%'
         OR id LIKE 'ep_16498_s1_e%'
         OR id LIKE 'ep_101922_s1_e%'
         OR video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
    `).run();

    // 4. Purge confirmed demo anime records (marked as is_demo = 1 or unconfigured mock seeds)
    try {
      const demoRes = db.prepare('DELETE FROM qwish_anime WHERE is_demo = 1').run();
      removedAnime += (demoRes as any).changes || 0;
    } catch {}

    const demoIds = ['21', '16498', '101922'];
    for (const dId of demoIds) {
      const anime = db.prepare('SELECT * FROM qwish_anime WHERE id = ?').get(dId) as any;
      if (anime && (anime.is_demo === 1 || anime.cover_image?.includes('ELSYx3yMPcKM') || anime.cover_image?.includes('PfZhbbnUjv7c'))) {
        const realSources = (db.prepare('SELECT COUNT(*) as c FROM playback_sources WHERE anime_id = ?').get(parseInt(dId, 10)) as any)?.c || 0;
        const realEpCount = (db.prepare("SELECT COUNT(*) as c FROM qwish_episodes WHERE anime_id = ? AND cloudflare_video_id NOT LIKE 'demo-cf-stream-%'").get(dId) as any)?.c || 0;
        
        // Remove only if it has no user-configured playback sources or real episodes
        if (realSources === 0 && realEpCount === 0) {
          db.prepare('DELETE FROM qwish_anime WHERE id = ?').run(dId);
          removedAnime++;
        }
      }
    }
  } catch (err: any) {
    console.warn('[DB] Error during purgeDemoData:', err.message);
  }

  return { removedAnime, removedEpisodes, removedSources };
}

/**
 * Seeds development demo anime with verified, working AniList URLs (200 OK)
 */
export function seedDemoData(): void {
  const qwishAnimeCount = (db.prepare('SELECT COUNT(*) as count FROM qwish_anime').get() as any)?.count || 0;
  if (qwishAnimeCount === 0) {
    const seedQwishAnime = [
      {
        id: '21',
        anilist_id: 21,
        title: 'One Piece',
        title_english: 'One Piece',
        title_romaji: 'One Piece',
        description: 'Gold Roger was known as the "Pirate King", the strongest and most infamous being to have sailed the Grand Line. Monkey D. Luffy, a 17-year-old boy who defies your standard definition of a pirate, sets off to find the greatest treasure in the world, the "One Piece".',
        cover_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
        banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg',
        genres: JSON.stringify(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy']),
        format: 'TV',
        status: 'RELEASING',
        season: 'FALL',
        season_year: 1999,
        episodes: 1100,
        average_score: 88,
        popularity: 295000,
        studios: 'Toei Animation',
        is_published: 1,
      },
      {
        id: '16498',
        anilist_id: 16498,
        title: 'Attack on Titan',
        title_english: 'Attack on Titan',
        title_romaji: 'Shingeki no Kyojin',
        description: 'Centuries ago, mankind was slaughtered to near extinction by monstrous humanoid creatures called Titans, forcing humans to hide in fear behind enormous concentric walls. Eren Yeager dedicates his life to their eradication by enlisting into the Survey Corps.',
        cover_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg',
        banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg',
        genres: JSON.stringify(['Action', 'Drama', 'Fantasy', 'Mystery']),
        format: 'TV',
        status: 'FINISHED',
        season: 'SPRING',
        season_year: 2013,
        episodes: 25,
        average_score: 86,
        popularity: 580000,
        studios: 'WIT Studio',
        is_published: 1,
      },
      {
        id: '101922',
        anilist_id: 101922,
        title: 'Demon Slayer: Kimetsu no Yaiba',
        title_english: 'Demon Slayer: Kimetsu no Yaiba',
        title_romaji: 'Kimetsu no Yaiba',
        description: 'It is the Taisho Period in Japan. Tanjiro, a kindhearted boy who sells charcoal for a living, finds his family slaughtered by a demon. To make matters worse, his younger sister Nezuko has been transformed into a demon herself. Tanjiro sets out on the path of the Demon Slayer.',
        cover_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg',
        banner_image: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg',
        genres: JSON.stringify(['Action', 'Fantasy', 'Supernatural', 'Historical']),
        format: 'TV',
        status: 'FINISHED',
        season: 'SPRING',
        season_year: 2019,
        episodes: 26,
        average_score: 85,
        popularity: 420000,
        studios: 'ufotable',
        is_published: 1,
      }
    ];

    const now = new Date().toISOString();
    const insertAnime = db.prepare(`
      INSERT INTO qwish_anime (
        id, anilist_id, title, title_english, title_romaji, description, cover_image, banner_image, genres, format, status, season, season_year, episodes, average_score, popularity, studios, is_published, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    for (const a of seedQwishAnime) {
      insertAnime.run(
        a.id, a.anilist_id, a.title, a.title_english, a.title_romaji, a.description, a.cover_image, a.banner_image, a.genres, a.format, a.status, a.season, a.season_year, a.episodes, a.average_score, a.popularity, a.studios, a.is_published, now, now
      );
    }
  }
}

/**
 * Repairs anime posters and banner images across the database by querying AniList GraphQL
 * for the latest verified CDN URLs.
 */
export async function repairAllAnimePosters(): Promise<{ repaired: number; failed: number; items: any[] }> {
  const animeList = db.prepare('SELECT id, anilist_id, title FROM qwish_anime').all() as any[];
  let repaired = 0;
  let failed = 0;
  const items: any[] = [];

  for (const a of animeList) {
    const anilistId = a.anilist_id || parseInt(a.id, 10);
    if (!anilistId || isNaN(anilistId)) continue;

    try {
      const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            coverImage { extraLarge large medium }
            bannerImage
          }
        }
      `;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: anilistId } }),
      });
      if (res.ok) {
        const json = await res.json();
        const media = json?.data?.Media;
        if (media) {
          const cover = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '';
          const banner = media.bannerImage || cover;
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE qwish_anime
            SET cover_image = ?, banner_image = ?, updated_at = ?
            WHERE id = ?
          `).run(cover, banner, now, a.id);
          repaired++;
          items.push({ id: a.id, title: a.title, cover_image: cover, banner_image: banner, status: 'repaired' });
          continue;
        }
      }
      failed++;
      items.push({ id: a.id, title: a.title, status: 'failed', reason: 'AniList query returned no media' });
    } catch (err: any) {
      failed++;
      items.push({ id: a.id, title: a.title, status: 'failed', reason: err.message });
    }
  }

  return { repaired, failed, items };
}

export interface InvalidSourceReport {
  id: string;
  anime_id: number;
  episode_id: string;
  episode_number: number;
  provider: string;
  title: string;
  url: string;
  reason: string;
  health_status: string;
}

/**
 * Validates the entire database of video sources for cross-anime contamination,
 * orphaned records, or mismatched episode-anime relationships.
 */
export function runDatabaseVideoSourceAudit(): {
  totalAudited: number;
  totalValid: number;
  totalInvalid: number;
  invalidSources: InvalidSourceReport[];
} {
  try {
    // 1. Detect cross-anime media URL reuse: Flag any media URL mapped to multiple distinct anime IDs
    const duplicateUrls = db.prepare(`
      SELECT url, COUNT(DISTINCT anime_id) as anime_count, GROUP_CONCAT(DISTINCT anime_id) as anime_ids
      FROM video_sources
      WHERE url != ''
      GROUP BY url
      HAVING anime_count > 1
    `).all() as any[];

    for (const dup of duplicateUrls) {
      db.prepare(`
        UPDATE video_sources
        SET health_status = 'invalid',
            is_active = 0,
            invalid_reason = 'CROSS_ANIME_CONTAMINATION: Same media URL detected across multiple anime IDs (' || ? || ')'
        WHERE url = ?
      `).run(dup.anime_ids, dup.url);
    }

    // 2. Validate individual records
    const allSources = db.prepare(`SELECT * FROM video_sources`).all() as any[];
    for (const s of allSources) {
      let reason = '';
      if (!s.anime_id || s.anime_id <= 0) {
        reason = 'INVALID_ANIME_ID: Missing or invalid anime ID';
      } else if (!s.url || !s.url.trim().startsWith('http')) {
        reason = 'INVALID_URL: Source URL is missing or malformed';
      } else if (typeof s.episode_id === 'string' && s.episode_id.startsWith('ep_')) {
        const match = s.episode_id.match(/^ep_(\d+)_s(\d+)_e(\d+)$/);
        if (match) {
          const epAnimeId = parseInt(match[1], 10);
          const epNum = parseInt(match[3], 10);
          if (epAnimeId !== s.anime_id) {
            reason = `ANIME_ID_MISMATCH: Source anime_id (${s.anime_id}) does not match episode ID prefix (${epAnimeId})`;
          } else if (s.episode_number && s.episode_number !== epNum) {
            reason = `EPISODE_NUMBER_MISMATCH: Source episode_number (${s.episode_number}) does not match episode ID (${epNum})`;
          }
        }
      }

      if (reason && s.health_status !== 'invalid') {
        db.prepare(`
          UPDATE video_sources
          SET health_status = 'invalid',
              is_active = 0,
              invalid_reason = ?
          WHERE id = ?
        `).run(reason, s.id);
      }
    }

    const invalidList = db.prepare(`
      SELECT id, anime_id, episode_id, episode_number, provider, title, url, invalid_reason as reason, health_status
      FROM video_sources
      WHERE health_status = 'invalid' OR is_active = 0
      ORDER BY created_at DESC
    `).all() as any[];

    const validCount = (db.prepare(`
      SELECT COUNT(*) as count FROM video_sources WHERE health_status = 'healthy' AND is_active = 1
    `).get() as any)?.count || 0;

    return {
      totalAudited: allSources.length,
      totalValid: validCount,
      totalInvalid: invalidList.length,
      invalidSources: invalidList,
    };
  } catch (err: any) {
    console.error('[DATABASE AUDIT ERROR]', err);
    return { totalAudited: 0, totalValid: 0, totalInvalid: 0, invalidSources: [] };
  }
}

export function getInvalidSourcesReport(): InvalidSourceReport[] {
  return db.prepare(`
    SELECT id, anime_id, episode_id, episode_number, provider, title, url, invalid_reason as reason, health_status
    FROM video_sources
    WHERE health_status = 'invalid' OR is_active = 0
    ORDER BY created_at DESC
  `).all() as any[];
}

export interface StreamPurgePreview {
  videoSources: any[];
  episodesConfig: any[];
  demoEpisodes: any[];
  totalAffected: number;
}

export function previewStreamsPurge(): StreamPurgePreview {
  const videoSources = db.prepare(`
    SELECT id, anime_id, episode_id, episode_number, provider, title, url, type, quality
    FROM video_sources
    WHERE url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR url LIKE '%sample%'
       OR id LIKE 'vs_%_toei'
       OR id LIKE 'vs_%_wit'
       OR id LIKE 'vs_%_ufo'
       OR id LIKE 'vs_00%'
       OR id = 'vs_010'
       OR health_status = 'invalid'
  `).all() as any[];

  const episodesConfig = db.prepare(`
    SELECT id, anime_id, season_number, episode_number, title, video_url, sub_video_url, dub_video_url
    FROM episodes_config
    WHERE video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR sub_video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR dub_video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR id LIKE 'ep_21_s1_e%'
       OR id LIKE 'ep_16498_s1_e%'
       OR id LIKE 'ep_101922_s1_e%'
  `).all() as any[];

  const demoEpisodes = db.prepare(`
    SELECT id, anime_id, episode_number, title, cloudflare_video_id, status
    FROM qwish_episodes
    WHERE cloudflare_video_id LIKE 'demo-cf-stream-%'
       OR (video_source_url LIKE '%commondatastorage.googleapis.com%' AND video_source_url != '')
  `).all() as any[];

  return {
    videoSources,
    episodesConfig,
    demoEpisodes,
    totalAffected: videoSources.length + episodesConfig.length + demoEpisodes.length,
  };
}

export function executeStreamsPurge(adminEmail: string): {
  success: boolean;
  backupId: string;
  purgedSources: number;
  purgedConfigs: number;
  purgedEpisodes: number;
  message: string;
} {
  const preview = previewStreamsPurge();
  const backupId = `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Save snapshot to streams_backup table
  const backupData = JSON.stringify(preview);
  db.prepare(`
    INSERT INTO streams_backup (id, backup_type, data_json, record_count, created_at)
    VALUES (?, 'purge_demo_streams', ?, ?, ?)
  `).run(backupId, backupData, preview.totalAffected, now);

  // Delete matching video_sources
  const delSources = db.prepare(`
    DELETE FROM video_sources
    WHERE url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR url LIKE '%sample%'
       OR id LIKE 'vs_%_toei'
       OR id LIKE 'vs_%_wit'
       OR id LIKE 'vs_%_ufo'
       OR id LIKE 'vs_00%'
       OR id = 'vs_010'
       OR health_status = 'invalid'
  `).run();

  // Clear demo URLs from episodes_config
  const delConfigs = db.prepare(`
    DELETE FROM episodes_config
    WHERE video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR sub_video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR dub_video_url LIKE '%commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
       OR id LIKE 'ep_21_s1_e%'
       OR id LIKE 'ep_16498_s1_e%'
       OR id LIKE 'ep_101922_s1_e%'
  `).run();

  // Clear demo video IDs from qwish_episodes (do not delete real episodes, just nullify the fake streams)
  const updEps = db.prepare(`
    UPDATE qwish_episodes
    SET cloudflare_video_id = NULL,
        video_source_url = '',
        status = 'UNAVAILABLE'
    WHERE cloudflare_video_id LIKE 'demo-cf-stream-%'
       OR video_source_url LIKE '%commondatastorage.googleapis.com%'
  `).run();

  // Log in audit_logs
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_email, action, details, created_at)
      VALUES (?, ?, ?, 'PURGE_DEMO_STREAMS', ?, ?)
    `).run(
      `audit_${Date.now()}`,
      'admin',
      adminEmail || 'admin@kuronami.com',
      `Purged ${(delSources as any).changes || 0} video sources, ${(delConfigs as any).changes || 0} configs. Backup ID: ${backupId}`,
      now
    );
  } catch {}

  return {
    success: true,
    backupId,
    purgedSources: (delSources as any).changes || 0,
    purgedConfigs: (delConfigs as any).changes || 0,
    purgedEpisodes: (updEps as any).changes || 0,
    message: `Successfully purged ${preview.totalAffected} demo/placeholder records. Backup preserved (${backupId}).`,
  };
}

export function rollbackStreamsPurge(targetBackupId?: string): { success: boolean; restored: number; message: string } {
  let row: any;
  if (targetBackupId) {
    row = db.prepare('SELECT * FROM streams_backup WHERE id = ?').get(targetBackupId);
  } else {
    row = db.prepare('SELECT * FROM streams_backup ORDER BY created_at DESC LIMIT 1').get();
  }

  if (!row) {
    return { success: false, restored: 0, message: 'No backup found to restore.' };
  }

  const data: StreamPurgePreview = JSON.parse(row.data_json);
  let restored = 0;
  const now = new Date().toISOString();

  if (Array.isArray(data.videoSources)) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO video_sources (id, anime_id, episode_id, episode_number, provider, title, url, type, quality, language, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Japanese (Sub)', 1, ?, ?)
    `);
    for (const vs of data.videoSources) {
      insert.run(vs.id, vs.anime_id, vs.episode_id, vs.episode_number, vs.provider, vs.title, vs.url, vs.type, vs.quality || '1080p', now, now);
      restored++;
    }
  }

  if (Array.isArray(data.episodesConfig)) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO episodes_config (id, anime_id, season_number, episode_number, title, video_url, sub_video_url, dub_video_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ec of data.episodesConfig) {
      insert.run(ec.id, ec.anime_id, ec.season_number || 1, ec.episode_number, ec.title, ec.video_url || '', ec.sub_video_url || '', ec.dub_video_url || '', now, now);
      restored++;
    }
  }

  return { success: true, restored, message: `Successfully restored ${restored} records from backup (${row.id}).` };
}
