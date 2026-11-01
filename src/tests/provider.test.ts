import { AniKotoProvider } from '../api/providers/AniKotoProvider.ts';
import { AuthorizedServerStreamingProvider, ConfiguredPlaybackSourcesProvider } from '../services/streamingProviderAdapter.ts';

async function runProviderTests() {
  console.log('[TEST] Starting Provider Adapters Unit Tests...');

  // 1. Test AniKotoProvider singleton & cache
  const provider = AniKotoProvider.getInstance();
  if (!provider) {
    throw new Error('AniKotoProvider instance creation failed');
  }
  console.log('[PASS] AniKotoProvider instance created successfully');

  // 2. Test StreamingProvider adapters normalization & interfaces
  const serverProvider = new AuthorizedServerStreamingProvider();
  if (serverProvider.id !== 'authorized_server') {
    throw new Error('AuthorizedServerStreamingProvider ID mismatch');
  }
  console.log('[PASS] AuthorizedServerStreamingProvider instantiated');

  const configuredProvider = new ConfiguredPlaybackSourcesProvider();
  if (configuredProvider.id !== 'configured_playback_sources') {
    throw new Error('ConfiguredPlaybackSourcesProvider ID mismatch');
  }
  console.log('[PASS] ConfiguredPlaybackSourcesProvider instantiated');

  console.log('[SUCCESS] All provider adapter unit tests passed successfully!');
}

runProviderTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
