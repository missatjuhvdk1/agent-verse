/**
 * Fetch Verse Documentation
 *
 * CLI tool to fetch and cache Verse documentation using Playwright.
 * Bypasses 403 errors by using a real browser.
 *
 * Usage:
 *   bun run server/fetch-verse-doc.ts <url>
 *   bun run server/fetch-verse-doc.ts "https://dev.epicgames.com/documentation/en-us/fortnite/verse-api/fortnitedotcom/devices/button_device"
 */

import { getVerseDocsCache } from './verseDocsCache';
import { getPlaywrightFetcher } from './mcp/playwrightFetch';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: bun run server/fetch-verse-doc.ts <url>');
    console.error('Example: bun run server/fetch-verse-doc.ts "https://dev.epicgames.com/documentation/en-us/fortnite/verse-api/fortnitedotcom/devices/button_device"');
    process.exit(1);
  }

  console.log('🚀 Fetching Verse documentation...\n');
  console.log(`URL: ${url}\n`);

  const cache = getVerseDocsCache();
  const fetcher = getPlaywrightFetcher();

  try {
    // Initialize Playwright
    await fetcher.initialize();

    // Fetch and cache
    const doc = await cache.get(url, { forceRefresh: true });

    if (!doc) {
      console.error('❌ Failed to fetch documentation');
      process.exit(1);
    }

    console.log('\n✅ SUCCESS!\n');
    console.log(`Title: ${doc.title}`);
    console.log(`Cached at: ${doc.cachedAt}`);
    console.log(`Expires at: ${doc.expiresAt}`);
    console.log(`\nContent preview (first 500 chars):`);
    console.log(doc.textContent.slice(0, 500) + '...\n');

    // Close browser
    await fetcher.close();

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await fetcher.close();
    process.exit(1);
  }
}

main();
