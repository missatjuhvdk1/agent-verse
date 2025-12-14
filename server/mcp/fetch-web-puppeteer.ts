#!/usr/bin/env bun
/**
 * Fast Web Fetch with Puppeteer (Windows-compatible)
 *
 * Puppeteer has better Windows compatibility than Playwright.
 * This is the recommended version for Windows users.
 *
 * Usage:
 *   bun run server/mcp/fetch-web-puppeteer.ts <url> [contentSelector]
 *
 * Examples:
 *   bun run server/mcp/fetch-web-puppeteer.ts "https://dev.epicgames.com/documentation/en-us/uefn/verse-api-reference"
 */

import puppeteer from 'puppeteer';
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
  content: string;
  navigation: {
    internal: ExtractedLink[];
    external: ExtractedLink[];
  };
  stats: {
    fetchTimeMs: number;
    contentLength: number;
    linkCount: number;
  };
  error?: string;
}

async function fetchPage(url: string, contentSelector?: string): Promise<FetchResult> {
  const startTime = Date.now();

  try {
    console.error(`[fetch-web] 🚀 Launching browser...`);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });

    const page = await browser.newPage();

    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
    });

    // Override webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    console.error(`[fetch-web] 📡 Navigating to ${url}...`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 500));

    const title = await page.title();
    console.error(`[fetch-web] ✓ Loaded: ${title}`);

    // Extract content
    let content: string;

    if (contentSelector) {
      const element = await page.$(contentSelector);
      if (element) {
        content = await page.evaluate(el => el.outerHTML, element);
        console.error(`[fetch-web] ✓ Using selector: ${contentSelector}`);
      } else {
        console.error(`[fetch-web] ⚠ Selector not found, using body`);
        content = await page.evaluate(() => document.body.outerHTML);
      }
    } else {
      // Try common content selectors
      const selectors = ['main', 'article', '[role="main"]', '.content', '#content'];
      let found = false;

      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          content = await page.evaluate(el => el.outerHTML, element);
          console.error(`[fetch-web] ✓ Auto-detected: ${selector}`);
          found = true;
          break;
        }
      }

      if (!found) {
        content = await page.evaluate(() => document.body.outerHTML);
      }
    }

    // Extract links
    console.error(`[fetch-web] 🔗 Extracting links...`);
    const links = await page.evaluate((baseUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 150);
      const baseUrlObj = new URL(baseUrl);

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
    }, url);

    await browser.close();

    // Convert to markdown
    console.error(`[fetch-web] 📝 Converting to markdown...`);
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Clean HTML
    const cleaned = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

    const markdown = turndown.turndown(cleaned);
    const finalMarkdown = markdown.length > 100000
      ? markdown.slice(0, 100000) + '\n\n[... content truncated ...]'
      : markdown;

    const fetchTimeMs = Date.now() - startTime;

    const internalLinks = links.filter(l => l.isInternal);
    const externalLinks = links.filter(l => !l.isInternal);

    console.error(`[fetch-web] ✅ Success! (${fetchTimeMs}ms, ${links.length} links)`);

    return {
      success: true,
      url,
      title,
      content: finalMarkdown,
      navigation: {
        internal: internalLinks.slice(0, 100),
        external: externalLinks.slice(0, 20),
      },
      stats: {
        fetchTimeMs,
        contentLength: finalMarkdown.length,
        linkCount: links.length,
      },
    };

  } catch (error) {
    const fetchTimeMs = Date.now() - startTime;
    console.error(`[fetch-web] ❌ Error (${fetchTimeMs}ms):`, error);

    return {
      success: false,
      url,
      title: '',
      content: '',
      navigation: { internal: [], external: [] },
      stats: {
        fetchTimeMs,
        contentLength: 0,
        linkCount: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun run server/mcp/fetch-web-puppeteer.ts <url> [contentSelector]');
  process.exit(1);
}

const [url, contentSelector] = args;

fetchPage(url, contentSelector)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
