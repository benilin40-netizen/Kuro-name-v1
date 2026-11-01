import assert from 'node:assert';
import { MiruroService } from '../../server/services/miruroService.ts';

async function runMiruroTests() {
  console.log('[TEST] Starting Miruro TV API Integration Test Suite...');

  // Test 1: Autocomplete suggestions
  console.log('[TEST 1] Testing /suggestions?query=naruto...');
  const sugs = await MiruroService.getSuggestions('naruto');
  assert(sugs, 'Suggestions response should be defined');
  const sugsList = sugs.suggestions || sugs.results || [];
  assert(Array.isArray(sugsList), 'Suggestions should return an array');
  assert(sugsList.length > 0, 'Should find at least one suggestion for Naruto');
  assert(sugsList.length <= 8, 'Suggestions should return a maximum of 8 items');
  console.log(`[PASS] Autocomplete suggestions returned ${sugsList.length} items (First: "${sugsList[0].title}")`);

  // Test 2: Search anime
  console.log('[TEST 2] Testing /search?query=naruto...');
  const searchRes = await MiruroService.searchAnime('naruto', 1, 10);
  assert(searchRes, 'Search response should be defined');
  const searchResults = searchRes.results || searchRes.media || [];
  assert(Array.isArray(searchResults), 'Search should return array of results');
  assert(searchResults.length > 0, 'Should return search results for Naruto');
  const firstAnime = searchResults[0];
  assert(firstAnime.id, 'Search result must contain id');
  assert(firstAnime.title, 'Search result must contain title');
  assert(firstAnime.coverImage, 'Search result must contain coverImage');
  console.log(`[PASS] Search returned ${searchResults.length} results. First ID: #${firstAnime.id} ("${firstAnime.title.english || firstAnime.title.romaji}")`);

  // Test 3: Trending anime
  console.log('[TEST 3] Testing /trending...');
  const trending = await MiruroService.getTrending(1, 5);
  const trendList = trending.results || trending.media || [];
  assert(Array.isArray(trendList), 'Trending should return array');
  assert(trendList.length > 0, 'Trending should have items');
  console.log(`[PASS] Trending returned ${trendList.length} items`);

  // Test 4: Popular anime
  console.log('[TEST 4] Testing /popular...');
  const popular = await MiruroService.getPopular(1, 5);
  const popList = popular.results || popular.media || [];
  assert(Array.isArray(popList), 'Popular should return array');
  assert(popList.length > 0, 'Popular should have items');
  console.log(`[PASS] Popular returned ${popList.length} items`);

  // Test 5: Upcoming anime
  console.log('[TEST 5] Testing /upcoming...');
  const upcoming = await MiruroService.getUpcoming(1, 5);
  const upcList = upcoming.results || upcoming.media || [];
  assert(Array.isArray(upcList), 'Upcoming should return array');
  console.log(`[PASS] Upcoming returned ${upcList.length} items`);

  // Test 6: Recent anime
  console.log('[TEST 6] Testing /recent...');
  const recent = await MiruroService.getRecent(1, 5);
  const recList = recent.results || recent.media || [];
  assert(Array.isArray(recList), 'Recent should return array');
  assert(recList.length > 0, 'Recent should have items');
  console.log(`[PASS] Recent returned ${recList.length} items`);

  // Test 7: Spotlight anime
  console.log('[TEST 7] Testing /spotlight...');
  const spotlight = await MiruroService.getSpotlight();
  const spotList = spotlight.spotlight || spotlight.results || [];
  assert(Array.isArray(spotList), 'Spotlight should return array');
  assert(spotList.length > 0, 'Spotlight should have items');
  console.log(`[PASS] Spotlight returned ${spotList.length} items`);

  // Test 8: Airing schedule
  console.log('[TEST 8] Testing /schedule...');
  const schedule = await MiruroService.getSchedule();
  const schedList = schedule.schedule || schedule.results || [];
  assert(Array.isArray(schedList), 'Schedule should return array');
  console.log(`[PASS] Schedule returned ${schedList.length} items`);

  // Test 9: Complete anime information for Naruto (#20)
  console.log('[TEST 9] Testing /info/20...');
  const info = await MiruroService.getAnimeInfo(20);
  assert(info, 'Anime info must be defined');
  assert(info.id === 20, 'Anime info must match requested ID');
  assert(info.title, 'Anime info must have title');
  assert(info.genres && info.genres.length > 0, 'Anime info must have genres');
  console.log(`[PASS] Anime info resolved for ID #20 ("${info.title.english || info.title.romaji}")`);

  // Test 10: Characters, relations, recommendations for Naruto (#20)
  console.log('[TEST 10] Testing characters, relations, recommendations...');
  const [chars, rels, recs] = await Promise.all([
    MiruroService.getAnimeCharacters(20, 1, 5),
    MiruroService.getAnimeRelations(20),
    MiruroService.getAnimeRecommendations(20),
  ]);
  assert(chars.characters && Array.isArray(chars.characters), 'Characters should return array');
  assert(rels.relations && Array.isArray(rels.relations), 'Relations should return array');
  assert(recs.recommendations && Array.isArray(recs.recommendations), 'Recommendations should return array');
  console.log(`[PASS] Characters (${chars.characters.length}), Relations (${rels.relations.length}), Recommendations (${recs.recommendations.length}) resolved`);

  // Test 11: Episode list for Naruto (#20)
  console.log('[TEST 11] Testing /episodes/20...');
  const eps = await MiruroService.getEpisodes(20);
  assert(eps, 'Episodes response must be defined');
  assert(Array.isArray(eps.episodes), 'Episodes should have an array of episodes');
  assert(eps.episodes.length > 0, 'Should have episodes for Naruto');
  const firstEp = eps.episodes[0];
  assert(firstEp.number === 1, 'First episode should be number 1');
  assert(firstEp.slug, 'Episode must have a slug for stream resolution');
  console.log(`[PASS] Episodes resolved: total ${eps.episodes.length} episodes (First ep slug: "${firstEp.slug}")`);

  // Test 12: Stream sources for Naruto (#20)
  console.log('[TEST 12] Testing /watch/gogoanime/20/sub/ep-1...');
  const watch = await MiruroService.getStreamingSources('gogoanime', 20, 'sub', firstEp.slug);
  assert(watch, 'Watch response must be defined');
  assert(Array.isArray(watch.sources), 'Watch response must have sources array');
  assert(watch.sources.length > 0, 'Should return at least one stream source');
  console.log(`[PASS] Watch resolved ${watch.sources.length} sources (Primary type: "${watch.sources[0].type}")`);

  // Test 13: Diagnostics suite
  console.log('[TEST 13] Testing runHealthDiagnostics()...');
  const diag = await MiruroService.runHealthDiagnostics();
  assert(diag, 'Diagnostics must be returned');
  assert(diag.endpoints && diag.endpoints.length > 0, 'Diagnostics must include endpoint test results');
  console.log(`[PASS] Health diagnostics executed. Upstream connected: ${diag.upstreamConnected}, Total tested endpoints: ${diag.endpoints.length}`);

  console.log('[SUCCESS] All Miruro TV API integration tests passed successfully!');
}

runMiruroTests().catch((err) => {
  console.error('[FAIL] Miruro test error:', err);
  process.exit(1);
});
