#!/usr/bin/env node
/**
 * Puppeteer MCP Server (Windows-compatible)
 *
 * Model Context Protocol server for Puppeteer web fetching.
 * Provides the fetch_page tool to agents.
 */

console.error('🚀 [Puppeteer MCP] Starting server initialization...');
console.error('🔧 [Puppeteer MCP] Node version:', process.version);
console.error('🔧 [Puppeteer MCP] Platform:', process.platform);

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';

console.error('✅ [Puppeteer MCP] All imports loaded successfully');

interface ExtractedLink {
  text: string;
  href: string;
  isInternal: boolean;
}

/**
 * Create MCP server
 */
console.error('🔨 [Puppeteer MCP] Creating server instance...');
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
console.error('✅ [Puppeteer MCP] Server instance created successfully');

/**
 * List available tools
 */
console.error('🔧 [Puppeteer MCP] Setting up ListTools handler...');
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('📋 [Puppeteer MCP] ListTools request received!');
  const tools = {
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
  console.error('✅ [Puppeteer MCP] Returning tools:', JSON.stringify(tools, null, 2));
  return tools;
});
console.error('✅ [Puppeteer MCP] ListTools handler registered');

/**
 * Handle tool calls
 */
console.error('🔧 [Puppeteer MCP] Setting up CallTool handler...');
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error('🔔 [Puppeteer MCP] Tool call received:', request.params.name);
  console.error('📝 [Puppeteer MCP] Arguments:', JSON.stringify(request.params.arguments, null, 2));

  if (request.params.name !== "fetch_page") {
    console.error('❌ [Puppeteer MCP] Unknown tool:', request.params.name);
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { url, waitFor, waitTime, contentSelector } = request.params.arguments as {
    url: string;
    waitFor?: string;
    waitTime?: number;
    contentSelector?: string;
  };

  if (!url) {
    console.error('❌ [Puppeteer MCP] Missing URL argument');
    throw new Error("Missing required argument: url");
  }

  try {
    console.error(`🌐 [Puppeteer MCP] Fetching: ${url}`);

    console.error('🚀 [Puppeteer MCP] Launching browser...');
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
    console.error('✅ [Puppeteer MCP] Browser launched');

    console.error('📄 [Puppeteer MCP] Creating new page...');
    const page = await browser.newPage();
    console.error('✅ [Puppeteer MCP] Page created');

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

    console.error('🌍 [Puppeteer MCP] Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: waitTime || 15000,
    });
    console.error('✅ [Puppeteer MCP] Page loaded');

    // Wait a bit for dynamic content
    console.error('⏳ [Puppeteer MCP] Waiting for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Wait for specific element if requested
    if (waitFor) {
      await page.waitForSelector(waitFor, {
        timeout: waitTime || 5000,
      });
    }

    const title = await page.title();
    console.error('📰 [Puppeteer MCP] Page title:', title);

    // Extract links
    console.error('🔗 [Puppeteer MCP] Extracting links...');
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
    console.error(`✅ [Puppeteer MCP] Extracted ${links.length} links`);

    // Extract content
    console.error('📝 [Puppeteer MCP] Extracting content...');
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

    console.error('🚪 [Puppeteer MCP] Closing browser...');
    await browser.close();
    console.error('✅ [Puppeteer MCP] Browser closed');

    // Convert to markdown
    console.error('📄 [Puppeteer MCP] Converting to markdown...');
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
    console.error(`✅ [Puppeteer MCP] Markdown generated (${markdown.length} chars)`);

    const finalMarkdown = markdown.length > 100000
      ? markdown.slice(0, 100000) + '\n\n[... content truncated ...]'
      : markdown;

    if (markdown.length > 100000) {
      console.error('✂️ [Puppeteer MCP] Content truncated to 100k chars');
    }

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

    console.error(`✅ [Puppeteer MCP] Success: ${title} (${links.length} links)`);
    console.error(`📊 [Puppeteer MCP] Final content length: ${finalMarkdown.length + linksSection.length} chars`);

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
    console.error(`❌ [Puppeteer MCP] Error occurred:`, error);
    console.error('🔍 [Puppeteer MCP] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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
console.error('✅ [Puppeteer MCP] CallTool handler registered');

/**
 * Start server
 */
async function main() {
  console.error('🚀 [Puppeteer MCP] Starting main() function...');

  try {
    console.error('🔌 [Puppeteer MCP] Creating StdioServerTransport...');
    const transport = new StdioServerTransport();
    console.error('✅ [Puppeteer MCP] Transport created');

    console.error('🔗 [Puppeteer MCP] Connecting server to transport...');
    await server.connect(transport);
    console.error('✅ [Puppeteer MCP] Server connected successfully!');
    console.error('🎉 [Puppeteer MCP] Server is now running on stdio and ready to receive requests');
  } catch (error) {
    console.error('❌ [Puppeteer MCP] Failed to start server:', error);
    console.error('🔍 [Puppeteer MCP] Error details:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

console.error('🏁 [Puppeteer MCP] Calling main()...');
main().catch((error) => {
  console.error("💥 [Puppeteer MCP] Fatal error in main():", error);
  console.error("🔍 [Puppeteer MCP] Fatal error stack:", error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
