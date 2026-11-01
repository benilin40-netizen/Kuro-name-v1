import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  STREAMING_PROVIDERS_REGISTRY,
  getEnabledProviders,
  isAllowedEmbedOrigin,
  getProviderById,
} from '../services/streamingProvidersRegistry.ts';
import {
  previewStreamsPurge,
  executeStreamsPurge,
  rollbackStreamsPurge,
  db,
} from '../../server/db.ts';

console.log('[TEST] Starting Anime Management, Registry, and Purge Unit Tests...');

// 1. Streaming Provider Registry Tests
const vidlink = getProviderById('vidlink');
assert.ok(vidlink, 'VidLink provider should be in registry');
assert.strictEqual(vidlink.enabled, true, 'VidLink must be enabled');
assert.ok(vidlink.requiredIdType === 'mal_id' || vidlink.requiredIdType === 'any', 'VidLink must accept valid id');

// Test VidLink URL Builder
const vidlinkSubUrl = vidlink.buildUrl({ malId: 52991, episodeNumber: 1, language: 'sub' });
assert.strictEqual(vidlinkSubUrl, 'https://vidlink.pro/anime/52991/1/sub');

const vidlinkDubUrl = vidlink.buildUrl({ malId: 52991, episodeNumber: 2, language: 'dub' });
assert.strictEqual(vidlinkDubUrl, 'https://vidlink.pro/anime/52991/2/dub');

const vidlinkMissingMal = vidlink.buildUrl({ malId: null, tmdbId: null, episodeNumber: 1, language: 'sub' });
assert.strictEqual(vidlinkMissingMal, null, 'VidLink should reject null mal_id');

// Test NontonGo
const nontongo = getProviderById('nontongo');
assert.ok(nontongo, 'NontonGo provider should be in registry');
assert.strictEqual(nontongo.enabled, true, 'NontonGo must be enabled');
assert.strictEqual(nontongo.requiredIdType, 'any', 'NontonGo must accept valid id');

const nontongoUrl = nontongo.buildUrl({ anilistId: 154587, episodeNumber: 1, language: 'sub' });
assert.strictEqual(nontongoUrl, 'https://nontongo.win/anime/154587/1/play');

// Test AnimePahe provider presence
const animepahe = getProviderById('animepahe');
assert.ok(animepahe, 'AnimePahe provider must exist in registry');
assert.strictEqual(animepahe.enabled, true, 'AnimePahe must be enabled');
assert.ok(animepahe.allowedOrigins.includes('https://animepahe.pw'), 'animepahe.pw must be in allowed origins');

// Test Origin check
assert.strictEqual(isAllowedEmbedOrigin('https://vidlink.pro/embed/123'), true);
assert.strictEqual(isAllowedEmbedOrigin('https://nontongo.win/anime/123'), true);
assert.strictEqual(isAllowedEmbedOrigin('https://malicious-fake-site.com/video'), false);

console.log('[PASS] Central Streaming Provider Registry validations passed.');

// 2. Stream Purge & Rollback Tests
const preview = previewStreamsPurge();
assert.ok(preview, 'Purge preview must return object');
assert.ok(typeof preview.totalAffected === 'number', 'totalAffected must be numeric');

// Insert a temporary test demo source to test purge and rollback
const testId = `vs_test_demo_${Date.now()}`;
db.prepare(`
  INSERT INTO video_sources (id, anime_id, episode_id, episode_number, season_number, provider, title, url, type, quality, language, is_active, created_at, updated_at)
  VALUES (?, 999999, 'ep_999999_1', 1, 1, 'Sample Demo Source', 'Test Demo Episode 1', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 'mp4', '1080p', 'Japanese (Sub)', 1, '2026-01-01', '2026-01-01')
`).run(testId);

// Verify inserted
const inserted = db.prepare('SELECT id FROM video_sources WHERE id = ?').get(testId);
assert.ok(inserted, 'Test demo stream was inserted');

// Execute Purge
const purgeRes = executeStreamsPurge('admin@kuronami.com');
assert.strictEqual(purgeRes.success, true, 'Purge must report success');
assert.ok(purgeRes.backupId, 'Purge must create a backup record');

// Verify deleted
const afterPurge = db.prepare('SELECT id FROM video_sources WHERE id = ?').get(testId);
assert.strictEqual(afterPurge, undefined, 'Test demo stream must be purged');

// Rollback
const rollbackRes = rollbackStreamsPurge(purgeRes.backupId);
assert.strictEqual(rollbackRes.success, true, 'Rollback must report success');
assert.ok(rollbackRes.restored >= 1, 'Rollback must restore at least 1 record');

// Clean up test record after test
db.prepare('DELETE FROM video_sources WHERE id = ?').run(testId);
db.prepare('DELETE FROM streams_backup WHERE id = ?').run(purgeRes.backupId);

console.log('[PASS] Stream purge preview, execution with snapshot, and rollback validations passed.');
console.log('[SUCCESS] All Anime Management and Stream Purge tests passed successfully!');
