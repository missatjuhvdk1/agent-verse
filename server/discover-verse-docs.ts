/**
 * Verse Documentation Discovery Tool
 *
 * Discovers all available Verse documentation pages from Epic's site
 * without actually scraping them. Shows what we'd get before full scrape.
 */

interface DiscoveredPage {
  url: string;
  type: 'device' | 'language' | 'tutorial' | 'api';
  title?: string;
}

/**
 * Known entry points for Verse documentation
 */
const ENTRY_POINTS = [
  {
    url: 'https://dev.epicgames.com/documentation/en-us/fortnite/verse-api',
    type: 'api' as const,
    description: 'Main Verse API Reference',
  },
  {
    url: 'https://dev.epicgames.com/documentation/en-us/uefn/verse-language-reference',
    type: 'language' as const,
    description: 'Verse Language Reference',
  },
  {
    url: 'https://dev.epicgames.com/documentation/en-us/fortnite/verse-language-quick-reference',
    type: 'language' as const,
    description: 'Verse Quick Reference',
  },
];

/**
 * Extract links from HTML content
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];

  // Match href attributes - handle both relative and absolute URLs
  const hrefRegex = /href=["']([^"']+)["']/g;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    let link = match[1];

    // Skip anchors and external links
    if (link.startsWith('#') || link.startsWith('http') && !link.includes('dev.epicgames.com')) {
      continue;
    }

    // Convert relative to absolute
    if (link.startsWith('/')) {
      link = 'https://dev.epicgames.com' + link;
    }

    // Only include Verse-related documentation
    if (link.includes('/fortnite/verse-') ||
        link.includes('/uefn/verse-') ||
        link.includes('/fortnite-creative/') ||
        link.includes('/devices/')) {
      links.push(link);
    }
  }

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Categorize discovered pages
 */
function categorizePage(url: string): DiscoveredPage['type'] {
  if (url.includes('/devices/')) return 'device';
  if (url.includes('language')) return 'language';
  if (url.includes('tutorial') || url.includes('learn')) return 'tutorial';
  return 'api';
}

/**
 * Fetch a page and extract links
 */
async function discoverFromPage(url: string): Promise<DiscoveredPage[]> {
  console.log(`🔍 Discovering from: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const links = extractLinks(html, url);

    const discovered: DiscoveredPage[] = links.map(link => ({
      url: link,
      type: categorizePage(link),
    }));

    console.log(`✅ Found ${discovered.length} links`);
    return discovered;

  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error);
    return [];
  }
}

/**
 * Main discovery function
 */
async function discoverAllPages(): Promise<void> {
  console.log('🚀 Starting Verse Documentation Discovery\n');
  console.log('=' .repeat(60));

  const allDiscovered = new Map<string, DiscoveredPage>();

  // Discover from each entry point
  for (const entry of ENTRY_POINTS) {
    console.log(`\n📖 ${entry.description}`);
    console.log(`   ${entry.url}`);
    console.log('-'.repeat(60));

    const discovered = await discoverFromPage(entry.url);

    for (const page of discovered) {
      allDiscovered.set(page.url, page);
    }

    // Be nice to Epic's servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Categorize and display results
  console.log('\n' + '='.repeat(60));
  console.log('📊 DISCOVERY RESULTS');
  console.log('='.repeat(60) + '\n');

  const byType = {
    device: [] as DiscoveredPage[],
    language: [] as DiscoveredPage[],
    tutorial: [] as DiscoveredPage[],
    api: [] as DiscoveredPage[],
  };

  for (const page of allDiscovered.values()) {
    byType[page.type].push(page);
  }

  // Display by category
  console.log(`🎮 DEVICES (${byType.device.length}):`);
  byType.device.slice(0, 10).forEach(page => {
    const deviceName = page.url.split('/devices/')[1] || 'unknown';
    console.log(`   • ${deviceName}`);
  });
  if (byType.device.length > 10) {
    console.log(`   ... and ${byType.device.length - 10} more`);
  }

  console.log(`\n📚 LANGUAGE REFERENCES (${byType.language.length}):`);
  byType.language.slice(0, 10).forEach(page => {
    const title = page.url.split('/').pop()?.replace(/-/g, ' ') || 'unknown';
    console.log(`   • ${title}`);
  });

  console.log(`\n📖 TUTORIALS (${byType.tutorial.length}):`);
  byType.tutorial.slice(0, 10).forEach(page => {
    const title = page.url.split('/').pop()?.replace(/-/g, ' ') || 'unknown';
    console.log(`   • ${title}`);
  });

  console.log(`\n🔧 API REFERENCES (${byType.api.length}):`);
  byType.api.slice(0, 10).forEach(page => {
    const title = page.url.split('/').pop()?.replace(/-/g, ' ') || 'unknown';
    console.log(`   • ${title}`);
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total pages discovered: ${allDiscovered.size}`);
  console.log(`   • Devices: ${byType.device.length}`);
  console.log(`   • Language refs: ${byType.language.length}`);
  console.log(`   • Tutorials: ${byType.tutorial.length}`);
  console.log(`   • API docs: ${byType.api.length}`);

  // Save to file for inspection
  const outputPath = './discovered-verse-docs.json';
  await Bun.write(
    outputPath,
    JSON.stringify({
      discoveredAt: new Date().toISOString(),
      totalPages: allDiscovered.size,
      pages: Array.from(allDiscovered.values()),
      byType,
    }, null, 2)
  );

  console.log(`\n✅ Full list saved to: ${outputPath}`);
  console.log('\n💡 Next step: Review the list and approve full scrape');
}

// Run discovery
discoverAllPages().catch(console.error);
