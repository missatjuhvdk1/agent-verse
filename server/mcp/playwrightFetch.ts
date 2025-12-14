/**
 * agent-verse - Playwright Web Fetch MCP Server
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * MCP server that provides web scraping via Playwright.
 * Bypasses 403 errors (including Epic Games) by using a real browser with realistic fingerprint.
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
      console.log('[Playwright] Initializing browser with anti-detection...');

      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled', // Hide automation detection
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
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

    // Create context with realistic browser fingerprint
    const context = await this.browser!.newContext({
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

    const page: Page = await context.newPage();

    try {
      console.log(`[Playwright] Fetching: ${options.url}`);

      // Navigate to the page (domcontentloaded is faster than networkidle)
      await page.goto(options.url, {
        waitUntil: 'domcontentloaded',
        timeout: options.waitTime || 8000, // 8s default
      });

      // Wait a bit for dynamic content (Epic Games docs load via JS)
      await page.waitForTimeout(500);

      // Wait for specific element if requested
      if (options.waitFor) {
        await page.waitForSelector(options.waitFor, {
          timeout: options.waitTime || 5000,
        });
      }

      // Extract title
      const title = await page.title();
      const pageUrl = new URL(options.url);

      // Extract links from the page (limit to first 150 for speed)
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
        // Try common content selectors for better extraction
        const commonSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];
        let found = false;

        for (const selector of commonSelectors) {
          const element = await page.$(selector);
          if (element) {
            content = await element.evaluate(el => el.outerHTML);
            textContent = await element.evaluate(el => (el as HTMLElement).innerText);
            console.log(`[Playwright] Auto-detected content area: ${selector}`);
            found = true;
            break;
          }
        }

        if (!found) {
          content = await page.content();
          textContent = await page.evaluate(() => document.body.innerText);
        }
      }

      // Convert HTML to Markdown (limit content size first for speed)
      const contentToConvert = content.length > 800000 ? content.slice(0, 800000) : content;
      const markdown = convertToMarkdown(contentToConvert);

      // Limit final markdown to prevent overwhelming context
      const finalMarkdown = markdown.length > 100000
        ? markdown.slice(0, 100000) + '\n\n[... content truncated for length ...]'
        : markdown;

      // Take screenshot if requested
      let screenshot: string | undefined;
      if (options.screenshot) {
        const buffer = await page.screenshot({ type: 'png' });
        screenshot = buffer.toString('base64');
      }

      await page.close();
      await context.close();

      console.log(`[Playwright] Success: ${title} (${links.length} links found)`);

      return {
        success: true,
        url: options.url,
        title,
        content,
        textContent,
        markdown: finalMarkdown,
        links,
        screenshot,
      };

    } catch (error) {
      await page.close();
      await context.close();

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
