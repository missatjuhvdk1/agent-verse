/**
 * Fetch page tool - web fetching with Puppeteer.
 */

import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
import { FetchPageSchema, type FetchPageInput } from '../schemas/tool-schemas.js';
import { logger } from '../utils/logger.js';
import { ValidationError, FetchError } from '../utils/errors.js';

const toolLogger = logger.child('fetch-page');

interface ExtractedLink {
  text: string;
  href: string;
  isInternal: boolean;
}

/**
 * Fetch page tool handler with Zod validation and Puppeteer.
 */
export async function fetchPageTool(args: unknown) {
  toolLogger.info('Fetch page tool called');

  // Validate input with Zod
  const result = FetchPageSchema.safeParse(args);

  if (!result.success) {
    toolLogger.warn('Validation failed', { errors: result.error.flatten() });
    throw new ValidationError('Invalid input', result.error.flatten());
  }

  const { url, contentSelector, waitFor, waitTime = 15000 } = result.data;

  toolLogger.info('Fetching URL', { url, contentSelector, waitFor, waitTime });

  let browser;
  try {
    // Launch browser
    toolLogger.debug('Launching browser');
    browser = await puppeteer.launch({
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

    // Set realistic headers to bypass 403 errors
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      DNT: '1',
    });

    // Override webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Navigate to URL
    toolLogger.debug('Navigating to URL');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: waitTime,
    });

    // Wait for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Wait for specific element if requested
    if (waitFor) {
      toolLogger.debug('Waiting for selector', { selector: waitFor });
      await page.waitForSelector(waitFor, { timeout: 5000 });
    }

    // Extract page title
    const title = await page.title();
    toolLogger.debug('Page loaded', { title });

    // Extract links
    const links: ExtractedLink[] = await page.evaluate((baseUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 150);
      const baseUrlObj = new URL(baseUrl);

      return anchors
        .map((a) => {
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
        .filter((link) => link.href && link.href !== '#' && link.text.length > 0);
    }, url);

    toolLogger.debug('Links extracted', { count: links.length });

    // Extract content
    let content: string = '';

    if (contentSelector) {
      const element = await page.$(contentSelector);
      if (element) {
        content = await page.evaluate((el) => el.outerHTML, element);
        toolLogger.debug('Using custom selector', { selector: contentSelector });
      } else {
        toolLogger.warn('Custom selector not found, falling back to body', {
          selector: contentSelector,
        });
        content = await page.evaluate(() => document.body.outerHTML);
      }
    } else {
      // Try common content selectors
      const selectors = ['main', 'article', '[role="main"]', '.content', '#content'];
      let found = false;

      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          content = await page.evaluate((el) => el.outerHTML, element);
          toolLogger.debug('Auto-detected content selector', { selector });
          found = true;
          break;
        }
      }

      if (!found) {
        content = await page.evaluate(() => document.body.outerHTML);
        toolLogger.debug('Using full body content');
      }
    }

    await browser.close();
    toolLogger.debug('Browser closed');

    // Convert HTML to Markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    const cleaned = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

    const markdown = turndown.turndown(cleaned);
    const finalMarkdown =
      markdown.length > 100000
        ? markdown.slice(0, 100000) + '\n\n[... content truncated ...]'
        : markdown;

    // Format links
    const internalLinks = links.filter((l) => l.isInternal);
    const externalLinks = links.filter((l) => !l.isInternal);

    let linksSection = '';

    if (internalLinks.length > 0) {
      linksSection += `\n\n---\n\n## 🔗 Navigation - Internal Links (${internalLinks.length})\n\n`;
      const displayLinks = internalLinks.slice(0, 80);
      linksSection += displayLinks.map((link) => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (internalLinks.length > 80) {
        linksSection += `\n\n_... and ${internalLinks.length - 80} more internal links_`;
      }
    }

    if (externalLinks.length > 0) {
      linksSection += `\n\n## 🌐 External References (${externalLinks.length})\n\n`;
      const displayLinks = externalLinks.slice(0, 20);
      linksSection += displayLinks.map((link) => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (externalLinks.length > 20) {
        linksSection += `\n\n_... and ${externalLinks.length - 20} more external links_`;
      }
    }

    toolLogger.info('Page fetched successfully', {
      title,
      contentLength: finalMarkdown.length,
      linksCount: links.length,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `# ${title}\n\n${finalMarkdown}${linksSection}`,
        },
      ],
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    toolLogger.error('Fetch failed', error);

    if (error instanceof ValidationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new FetchError(`Failed to fetch page: ${message}`, url, error as Error);
  }
}
