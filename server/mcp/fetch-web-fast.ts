#!/usr/bin/env bun
/**
 * Fast Web Fetch with Playwright
 *
 * High-performance docs scraper that bypasses 403 errors (including Epic Games).
 * Works for both main agents and sub-agents via CLI.
 *
 * Usage:
 *   bun run server/mcp/fetch-web-fast.ts <url> [contentSelector]
 *
 * Examples:
 *   bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/uefn/verse-api-reference"
 *   bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/docs" "main"
 *
 * Output: JSON with { success, url, title, markdown, links, error? }
 */

import { chromium, type Browser } from 'playwright';
import TurndownService from 'turndown';

interface ExtractedLink {
  text: string;
  href: string;
  isInternal: boolean;
}

interface FetchResult {
  success: boolean;
  url: string;
  title: string;
  markdown: string;
  links: ExtractedLink[];
  stats: {
    fetchTimeMs: number;
    contentLength: number;
    linkCount: number;
  };
  error?: string;
}

/**
 * Extract links from page for easy navigation
 */
async function extractLinks(page: any, baseUrl: string, maxLinks = 150): Promise<ExtractedLink[]> {
  try {
    return await page.evaluate((args: { baseUrl: string; maxLinks: number }) => {
      const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, args.maxLinks);
      const baseUrlObj = new URL(args.baseUrl);

      return anchors
        .map(a => {
          const href = (a as HTMLAnchorElement).href;
          const text = (a as HTMLAnchorElement).textContent?.trim() || '';

          try {
            const linkUrl = new URL(href);
            const isInternal = linkUrl.hostname === baseUrlObj.hostname;
            return { text, href, isInternal };
          } catch {
            return { text, href, isInternal: false };
          }
        })
        .filter(link => link.href && link.href !== '#' && link.text.length > 0);
    }, { baseUrl, maxLinks });
  } catch (error) {
    console.error('[fetch-web-fast] Failed to extract links:', error);
    return [];
  }
}

/**
 * Clean and convert HTML to Markdown
 */
function convertToMarkdown(html: string): string {
  // Pre-clean HTML before conversion (faster)
  const cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '') // Remove navigation
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '') // Remove footers
    .replace(/<!--[\s\S]*?-->/g, ''); // Remove comments

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Keep code blocks properly formatted
  turndown.addRule('codeBlock', {
    filter: ['pre'],
    replacement: (content) => {
      return '\n```\n' + content + '\n```\n';
    }
  });

  return turndown.turndown(cleaned);
}

/**
 * Fetch a web page with Playwright
 */
async function fetchPage(url: string, contentSelector?: string): Promise<FetchResult> {
  const startTime = Date.now();
  let browser: Browser | null = null;

  try {
    console.error(`[fetch-web-fast] 🚀 Fetching: ${url}`);

    // Launch browser with Epic Games-friendly settings
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled', // Hide automation detection
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security', // For CORS issues
      ],
    });

    const context = await browser.newContext({
      // Realistic browser fingerprint to bypass 403
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Override navigator.webdriver to hide automation
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();

    console.error(`[fetch-web-fast] 📡 Navigating...`);

    // Navigate with optimal timeout
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Fast, don't wait for all resources
      timeout: 8000, // 8 seconds max
    });

    // Wait a tiny bit for dynamic content (Epic Games docs load via JS)
    await page.waitForTimeout(500);

    const title = await page.title();
    console.error(`[fetch-web-fast] ✓ Page loaded: ${title}`);

    // Extract content
    let content: string;

    if (contentSelector) {
      const element = await page.$(contentSelector);
      if (element) {
        content = await element.evaluate(el => el.outerHTML);
        console.error(`[fetch-web-fast] ✓ Using selector: ${contentSelector}`);
      } else {
        console.error(`[fetch-web-fast] ⚠ Selector '${contentSelector}' not found, using body`);
        content = await page.evaluate(() => document.body.outerHTML);
      }
    } else {
      // Try common content selectors for better extraction
      const commonSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];
      let found = false;

      for (const selector of commonSelectors) {
        const element = await page.$(selector);
        if (element) {
          content = await element.evaluate(el => el.outerHTML);
          console.error(`[fetch-web-fast] ✓ Auto-detected content area: ${selector}`);
          found = true;
          break;
        }
      }

      if (!found) {
        content = await page.evaluate(() => document.body.outerHTML);
      }
    }

    // Extract links for navigation
    console.error(`[fetch-web-fast] 🔗 Extracting links...`);
    const links = await extractLinks(page, url);

    await page.close();
    await context.close();
    await browser.close();

    // Convert to markdown
    console.error(`[fetch-web-fast] 📝 Converting to markdown...`);
    const limitedContent = content.length > 800000 ? content.slice(0, 800000) : content;
    const markdown = convertToMarkdown(limitedContent);

    // Limit final markdown to prevent overwhelming context
    const finalMarkdown = markdown.length > 100000 ? markdown.slice(0, 100000) + '\n\n[... content truncated for length ...]' : markdown;

    const fetchTimeMs = Date.now() - startTime;

    console.error(`[fetch-web-fast] ✅ Success! (${fetchTimeMs}ms, ${links.length} links, ${finalMarkdown.length} chars)`);

    return {
      success: true,
      url,
      title,
      markdown: finalMarkdown,
      links,
      stats: {
        fetchTimeMs,
        contentLength: finalMarkdown.length,
        linkCount: links.length,
      },
    };

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    const fetchTimeMs = Date.now() - startTime;
    console.error(`[fetch-web-fast] ❌ Error (${fetchTimeMs}ms):`, error);

    return {
      success: false,
      url,
      title: '',
      markdown: '',
      links: [],
      stats: {
        fetchTimeMs,
        contentLength: 0,
        linkCount: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format result for agent consumption
 */
function formatResult(result: FetchResult): string {
  if (!result.success) {
    return JSON.stringify(result, null, 2);
  }

  // Group links by type for better organization
  const internalLinks = result.links.filter(l => l.isInternal);
  const externalLinks = result.links.filter(l => !l.isInternal);

  // Create a nicely formatted output
  const output = {
    success: true,
    url: result.url,
    title: result.title,
    stats: result.stats,
    content: result.markdown,
    navigation: {
      internal: internalLinks.slice(0, 100), // Limit to 100 most relevant
      external: externalLinks.slice(0, 20),  // Limit external links
    },
  };

  return JSON.stringify(output, null, 2);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun run server/mcp/fetch-web-fast.ts <url> [contentSelector]');
  console.error('');
  console.error('Examples:');
  console.error('  bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/uefn"');
  console.error('  bun run server/mcp/fetch-web-fast.ts "https://example.com" "main"');
  process.exit(1);
}

const [url, contentSelector] = args;

// Fetch and output
fetchPage(url, contentSelector)
  .then(result => {
    console.log(formatResult(result));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
