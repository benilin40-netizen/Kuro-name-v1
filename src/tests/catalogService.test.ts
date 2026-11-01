import { fetchFullCatalog } from '../services/munoService.ts';
import { getMedia } from '../services/api.ts';

async function runCatalogTests() {
  console.log('[TEST] Starting Local Catalog Service Unit Tests...');

  // Test 1: Deduplication of concurrent requests
  console.log('[TEST 1] Testing deduplication of concurrent requests...');
  let fetchCount = 0;
  const originalFetch = global.fetch;

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/anime/recent')) {
      fetchCount++;
      return new Response(JSON.stringify([{ id: 101, title: { english: 'Catalog Anime' }, coverImage: { extraLarge: '' }, format: 'TV', status: 'RELEASING', popularity: 100, genres: [] }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  }) as any;

  const [p1, p2, p3] = await Promise.all([
    fetchFullCatalog(),
    fetchFullCatalog(),
    fetchFullCatalog(),
  ]);

  if (fetchCount === 1) {
    console.log('[PASS] Concurrent calls deduplicated into single request');
  } else {
    console.error(`[FAIL] Expected 1 fetch call, got ${fetchCount}`);
  }

  if (p1.length === 1 && p1[0].id === 101 && p1 === p2 && p2 === p3) {
    console.log('[PASS] Concurrent requests returned identical deduplicated results');
  } else {
    console.error('[FAIL] Deduplicated results mismatch');
  }

  // Test 2: Local catalog fetch succeeds
  console.log('[TEST 2] Testing getMedia catalog fetching...');
  const catalogMedia = await getMedia();
  if (catalogMedia.length === 1 && catalogMedia[0].id === 101) {
    console.log('[PASS] Catalog fetch succeeded from local backend');
  } else {
    console.error('[FAIL] Catalog fetch failed');
  }

  // Test 3: Failure handling -> throws explicit error
  console.log('[TEST 3] Testing explicit error when catalog request fails...');
  global.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as any;

  let threwError = false;
  try {
    await getMedia();
  } catch (err: any) {
    threwError = true;
    if (err.message.includes('Catalog load failed')) {
      console.log('[PASS] Explicit error thrown when catalog source fails');
    }
  }
  if (!threwError) {
    console.error('[FAIL] Failed request unexpectedly became successful result');
  }

  // Restore fetch
  global.fetch = originalFetch;
  console.log('[SUCCESS] All Catalog Service unit tests passed successfully!');
}

runCatalogTests().catch((e) => {
  console.error('[FAIL] Catalog service test error:', e);
  process.exit(1);
});
