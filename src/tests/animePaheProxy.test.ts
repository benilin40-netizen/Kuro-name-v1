import {
  extractAnimePaheSession,
  AnimePaheProxyError,
  animePaheProxy,
  proxySearchAnimePahe,
  proxyGetAnimePaheEpisodes,
  proxyGetAnimePaheStreams,
  fetchFromAnimePaheProxy,
  setAnimePaheProxyBaseUrl,
} from '../services/anime/proxy.ts';

async function runTests() {
  console.log('[TEST] Starting AnimePahe Proxy Wrapper Unit Tests...');

  // 1. Test Session Extraction
  console.log('[TEST 1] Testing session extraction...');
  if (extractAnimePaheSession('https://animepahe.ru/anime/abc123session?ref=share') !== 'abc123session') {
    throw new Error('Failed to extract session from animepahe url');
  }
  if (extractAnimePaheSession('xyz987ep') !== 'xyz987ep') {
    throw new Error('Failed to return raw session string');
  }
  console.log('[PASS] Session extraction correctly parsed session IDs.');

  // 2. Test Timeout Handling
  console.log('[TEST 2] Testing request timeout...');
  const originalFetch = global.fetch;

  try {
    // Mock fetch that respects abort signal
    (global as any).fetch = (_url: any, opts?: any) =>
      new Promise((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true }
          );
        }
      });

    let timedOut = false;
    try {
      await fetchFromAnimePaheProxy('/test-timeout', { timeoutMs: 50, retries: 0 });
    } catch (err: any) {
      if (err instanceof AnimePaheProxyError && err.isTimeout) {
        timedOut = true;
      }
    }

    if (!timedOut) {
      throw new Error('Expected AnimePaheProxyError with isTimeout=true');
    }
    console.log('[PASS] Timeout correctly aborted and raised AnimePaheProxyError with isTimeout=true.');

    // 3. Test "Failed to fetch" Network Error Handling & Diagnostic Message
    console.log('[TEST 3] Testing "Failed to fetch" diagnosis...');
    (global as any).fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    let caughtNetworkErr = false;
    try {
      await fetchFromAnimePaheProxy('/test-network-error', { retries: 0 });
    } catch (err: any) {
      if (
        err instanceof AnimePaheProxyError &&
        err.isNetworkError &&
        err.message.includes('Failed to fetch from AnimePahe proxy')
      ) {
        caughtNetworkErr = true;
      }
    }

    if (!caughtNetworkErr) {
      throw new Error('Expected AnimePaheProxyError with isNetworkError=true and diagnostic guidance');
    }
    console.log('[PASS] "Failed to fetch" properly converted to diagnostic AnimePaheProxyError.');

    // 4. Test Successful Search, Episode, and Stream Parsing
    console.log('[TEST 4] Testing search, episodes, and stream parsing...');
    (global as any).fetch = (async (url: any) => {
      if (url.includes('/search/')) {
        return new Response(
          JSON.stringify({
            results: [
              { session: 'session_frieren', title: 'Frieren: Beyond Journey’s End', year: 2023, episodes: 28 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/episodes/')) {
        return new Response(
          JSON.stringify({
            results: [
              { episode: 1, title: 'The Journey’s End', session: 'ep_session_01' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/episode/')) {
        return new Response(
          JSON.stringify({
            streams: [
              {
                quality: '1080p',
                audio: 'jpn',
                url: 'https://kwik.cx/e/sample',
                proxiedUrl: 'https://proxy.example.com/hls/sample.m3u8',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }) as any;

    const searchResults = await proxySearchAnimePahe('Frieren', { retries: 0 });
    if (searchResults.length !== 1 || searchResults[0].session !== 'session_frieren') {
      throw new Error('Search parsing failed');
    }
    console.log('[PASS] proxySearchAnimePahe returned expected search items.');

    const episodeResults = await proxyGetAnimePaheEpisodes('session_frieren', { retries: 0 });
    if (episodeResults.length !== 1 || episodeResults[0].session !== 'ep_session_01') {
      throw new Error('Episode parsing failed');
    }
    console.log('[PASS] proxyGetAnimePaheEpisodes returned expected episodes.');

    const streamResults = await proxyGetAnimePaheStreams('session_frieren', 'ep_session_01', { retries: 0 });
    if (streamResults.length !== 1 || !streamResults[0].url) {
      throw new Error('Stream parsing failed');
    }
    console.log('[PASS] proxyGetAnimePaheStreams parsed stream variants.');

    console.log('[SUCCESS] All AnimePahe Proxy Wrapper tests passed successfully!');
  } finally {
    global.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
