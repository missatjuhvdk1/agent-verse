/**
 * Agent Smith - Playwright Web Fetch MCP Server
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * MCP server that provides web scraping via Playwright.
 * Bypasses 403 errors by using a real browser.
 */

import { chromium, type Browser, type Page } from 'playwright';
import TurndownService from 'turndown';

/**
 * Fetch options
 */
export interface PlaywrightFetchOptions {
  url: string;
  waitFor?: string; // CSS selector to wait for
  waitTime?: number; // Max wait time in ms
  screenshot?: boolean; // Take screenshot
  contentSelector?: string; // CSS selector to extract main content (e.g., 'main', 'article', '.content')
}

/**
 * Extracted link
 */
export interface ExtractedLink {
  text: string;
  href: string;
  isInternal: boolean;
}

/**
 * Fetch result
 */
export interface PlaywrightFetchResult {
  success: boolean;
  url: string;
  title: string;
  content: string; // HTML content
  textContent: string; // Plain text
  markdown: string; // Markdown content
  links: ExtractedLink[]; // Extracted links
  screenshot?: string; // Base64 screenshot
  error?: string;
}

/**
 * Playwright Web Fetcher
 *
 * Provides a headless browser for fetching web pages.
 * Bypasses 403 errors and handles JavaScript-rendered content.
 */
export class PlaywrightFetcher {
  private browser: Browser | null = null;
  private initialized = false;

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Use bundled Chromium (Windows Chrome has WSL pipe issues)
      console.log('[Playwright] Using bundled Chromium');

      this.browser = await chromium.launch({
        headless: true,
        // Don't specify executablePath - use bundled Chromium
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      this.initialized = true;
      console.log('[Playwright] Browser initialized successfully');
    } catch (error) {
      console.error('[Playwright] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Fetch a web page
   */
  async fetch(options: PlaywrightFetchOptions): Promise<PlaywrightFetchResult> {
    if (!this.initialized || !this.browser) {
      await this.initialize();
    }

    const page: Page = await this.browser!.newPage();

    try {
      console.log(`[Playwright] Fetching: ${options.url}`);

      // Set a realistic user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      });

      // Navigate to the page
      await page.goto(options.url, {
        waitUntil: 'networkidle',
        timeout: options.waitTime || 30000,
      });

      // Wait for specific element if requested
      if (options.waitFor) {
        await page.waitForSelector(options.waitFor, {
          timeout: options.waitTime || 30000,
        });
      }

      // Extract title
      const title = await page.title();
      const pageUrl = new URL(options.url);

      // Extract links from the page
      const links = await page.evaluate((baseUrl) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const baseUrlObj = new URL(baseUrl);

        return anchors.map(a => {
          const href = (a as HTMLAnchorElement).href;
          const text = (a as HTMLAnchorElement).textContent?.trim() || '';

          try {
            const linkUrl = new URL(href);
            const isInternal = linkUrl.hostname === baseUrlObj.hostname;
            return { text, href, isInternal };
          } catch {
            return { text, href, isInternal: false };
          }
        }).filter(link => link.href && link.href !== '#');
      }, options.url);

      // Extract content (optionally from a specific selector)
      let content: string;
      let textContent: string;

      if (options.contentSelector) {
        // Try to select main content area
        const element = await page.$(options.contentSelector);
        if (element) {
          content = await element.evaluate(el => el.outerHTML);
          textContent = await element.evaluate(el => (el as HTMLElement).innerText);
          console.log(`[Playwright] Using content selector: ${options.contentSelector}`);
        } else {
          // Fallback to full page if selector not found
          console.log(`[Playwright] Content selector '${options.contentSelector}' not found, using full page`);
          content = await page.content();
          textContent = await page.evaluate(() => document.body.innerText);
        }
      } else {
        // Use full page content
        content = await page.content();
        textContent = await page.evaluate(() => document.body.innerText);
      }

      // Convert HTML to Markdown
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      });

      const markdown = turndownService.turndown(content);

      // Take screenshot if requested
      let screenshot: string | undefined;
      if (options.screenshot) {
        const buffer = await page.screenshot({ type: 'png' });
        screenshot = buffer.toString('base64');
      }

      await page.close();

      console.log(`[Playwright] Success: ${title} (${links.length} links found)`);

      return {
        success: true,
        url: options.url,
        title,
        content,
        textContent,
        markdown,
        links,
        screenshot,
      };

    } catch (error) {
      await page.close();

      console.error(`[Playwright] Error fetching ${options.url}:`, error);

      return {
        success: false,
        url: options.url,
        title: '',
        content: '',
        textContent: '',
        markdown: '',
        links: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.initialized = false;
      console.log('[Playwright] Browser closed');
    }
  }
}

// Singleton instance
let fetcherInstance: PlaywrightFetcher | null = null;

/**
 * Get the global Playwright fetcher instance
 */
export function getPlaywrightFetcher(): PlaywrightFetcher {
  if (!fetcherInstance) {
    fetcherInstance = new PlaywrightFetcher();
  }
  return fetcherInstance;
}

/**
 * Cleanup on process exit
 */
process.on('exit', () => {
  if (fetcherInstance) {
    fetcherInstance.close();
  }
});

process.on('SIGINT', async () => {
  if (fetcherInstance) {
    await fetcherInstance.close();
  }
  process.exit(0);
});
