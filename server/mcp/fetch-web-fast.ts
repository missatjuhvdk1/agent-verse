#!/usr/bin/env bun
/**
 * Fast web fetch using Playwright
 *
 * CLI wrapper for Playwright web fetching that can be called via Bash tool.
 * Much faster than MCP server approach - agents call this directly via Bash.
 *
 * Usage:
 *   bun run server/mcp/fetch-web-fast.ts <url> [contentSelector]
 *
 * Output: JSON to stdout
 */

import { chromium, type Browser } from 'playwright';
import TurndownService from 'turndown';

interface FetchResult {
  success: boolean;
  url: string;
  title: string;
  markdown: string;
  error?: string;
}

async function fetchPage(url: string, contentSelector?: string): Promise<FetchResult> {
  let browser: Browser | null = null;

  try {
    console.error(`[fetch-web-fast] Launching browser for ${url}...`);

    // Launch browser with timeout
    browser = await chromium.launch({
      headless: true,
      timeout: 10000, // 10s max for browser launch
    });

    const page = await browser.newPage();

    // Set realistic user agent
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    console.error(`[fetch-web-fast] Navigating to ${url}...`);

    // Navigate with faster timeout and domcontentloaded (not networkidle!)
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Don't wait for ALL network requests
      timeout: 15000, // 15s max for page load
    });

    const title = await page.title();
    console.error(`[fetch-web-fast] Page loaded: ${title}`);

    // Extract content
    let content: string;

    if (contentSelector) {
      const element = await page.$(contentSelector);
      if (element) {
        content = await element.evaluate(el => el.outerHTML);
        console.error(`[fetch-web-fast] Using selector: ${contentSelector}`);
      } else {
        console.error(`[fetch-web-fast] Selector '${contentSelector}' not found, using body`);
        content = await page.evaluate(() => document.body.outerHTML);
      }
    } else {
      content = await page.evaluate(() => document.body.outerHTML);
    }

    await page.close();
    await browser.close();

    // Convert to markdown (fast - no complex processing)
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });

    // Remove scripts and styles before conversion
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    const markdown = turndown.turndown(content);

    console.error(`[fetch-web-fast] Success! Markdown length: ${markdown.length} chars`);

    return {
      success: true,
      url,
      title,
      markdown: markdown.slice(0, 50000), // Limit to 50K chars to avoid overwhelming context
    };

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error(`[fetch-web-fast] Error:`, error);

    return {
      success: false,
      url,
      title: '',
      markdown: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Parse CLI args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun run server/mcp/fetch-web-fast.ts <url> [contentSelector]');
  process.exit(1);
}

const [url, contentSelector] = args;

// Run fetch
fetchPage(url, contentSelector)
  .then(result => {
    // Output JSON to stdout (agents will parse this)
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
