#!/usr/bin/env node
/**
 * Puppeteer MCP Server (Windows-compatible)
 *
 * Model Context Protocol server for Puppeteer web fetching.
 * Provides the fetch_page tool to agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';

interface ExtractedLink {
  text: string;
  href: string;
  isInternal: boolean;
}

/**
 * Create MCP server
 */
const server = new Server(
  {
    name: "puppeteer-fetch",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch_page",
        description: "Fetch a web page using Puppeteer (bypasses 403 errors, handles JavaScript). Windows-compatible. Returns Markdown content with extracted links for easy navigation.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to fetch",
            },
            waitFor: {
              type: "string",
              description: "Optional CSS selector to wait for before returning",
            },
            waitTime: {
              type: "number",
              description: "Maximum time to wait in milliseconds (default: 15000)",
            },
            contentSelector: {
              type: "string",
              description: "Optional CSS selector to extract main content only (e.g., 'main', 'article', '.content'). Falls back to full page if not found.",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "fetch_page") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { url, waitFor, waitTime, contentSelector } = request.params.arguments as {
    url: string;
    waitFor?: string;
    waitTime?: number;
    contentSelector?: string;
  };

  if (!url) {
    throw new Error("Missing required argument: url");
  }

  try {
    console.error(`[Puppeteer MCP] Fetching: ${url}`);

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

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: waitTime || 15000,
    });

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 500));

    // Wait for specific element if requested
    if (waitFor) {
      await page.waitForSelector(waitFor, {
        timeout: waitTime || 5000,
      });
    }

    const title = await page.title();

    // Extract links
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

    // Extract content
    let content: string;

    if (contentSelector) {
      const element = await page.$(contentSelector);
      if (element) {
        content = await page.evaluate(el => el.outerHTML, element);
        console.error(`[Puppeteer MCP] Using selector: ${contentSelector}`);
      } else {
        console.error(`[Puppeteer MCP] Selector not found, using body`);
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
          console.error(`[Puppeteer MCP] Auto-detected: ${selector}`);
          found = true;
          break;
        }
      }

      if (!found) {
        content = await page.evaluate(() => document.body.outerHTML);
      }
    }

    await browser.close();

    // Convert to markdown
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
    const finalMarkdown = markdown.length > 100000
      ? markdown.slice(0, 100000) + '\n\n[... content truncated ...]'
      : markdown;

    // Format links for display
    const internalLinks = links.filter(l => l.isInternal);
    const externalLinks = links.filter(l => !l.isInternal);

    let linksSection = '';

    if (internalLinks.length > 0) {
      linksSection += `\n\n---\n\n## 🔗 Navigation - Internal Links (${internalLinks.length})\n\n`;
      const displayLinks = internalLinks.slice(0, 80);
      linksSection += displayLinks.map(link => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (internalLinks.length > 80) {
        linksSection += `\n\n_... and ${internalLinks.length - 80} more internal links_`;
      }
    }

    if (externalLinks.length > 0) {
      linksSection += `\n\n## 🌐 External References (${externalLinks.length})\n\n`;
      const displayLinks = externalLinks.slice(0, 20);
      linksSection += displayLinks.map(link => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (externalLinks.length > 20) {
        linksSection += `\n\n_... and ${externalLinks.length - 20} more external links_`;
      }
    }

    console.error(`[Puppeteer MCP] Success: ${title} (${links.length} links)`);

    return {
      content: [
        {
          type: "text",
          text: `# ${title}\n\n${finalMarkdown}${linksSection}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(`[Puppeteer MCP] Error:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to fetch page: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Puppeteer MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
