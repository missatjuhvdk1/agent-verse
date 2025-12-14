#!/usr/bin/env node
/**
 * Playwright MCP Server
 *
 * Model Context Protocol server for Playwright web fetching.
 * Provides the fetch_page tool to agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getPlaywrightFetcher } from './playwrightFetch';

/**
 * Create MCP server
 */
const server = new Server(
  {
    name: "playwright-fetch",
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
        description: "Fetch a web page using Playwright (bypasses 403 errors, handles JavaScript). Returns Markdown content with extracted links for easy navigation.",
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
              description: "Maximum time to wait in milliseconds (default: 30000)",
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
    const fetcher = getPlaywrightFetcher();
    await fetcher.initialize();

    const result = await fetcher.fetch({
      url,
      waitFor,
      waitTime: waitTime || 30000,
      contentSelector,
    });

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching ${url}: ${result.error}`,
          },
        ],
      };
    }

    // Format links for display
    const internalLinks = result.links.filter(link => link.isInternal);
    const externalLinks = result.links.filter(link => !link.isInternal);

    let linksSection = '';

    if (internalLinks.length > 0) {
      linksSection += `\n\n---\n\n## 🔗 Navigation - Internal Links (${internalLinks.length})\n\n`;
      // Limit to first 80 internal links for better navigation
      const displayLinks = internalLinks.slice(0, 80);
      linksSection += displayLinks.map(link => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (internalLinks.length > 80) {
        linksSection += `\n\n_... and ${internalLinks.length - 80} more internal links_`;
      }
    }

    if (externalLinks.length > 0) {
      linksSection += `\n\n## 🌐 External References (${externalLinks.length})\n\n`;
      // Limit to first 20 external links
      const displayLinks = externalLinks.slice(0, 20);
      linksSection += displayLinks.map(link => `- [${link.text || 'Link'}](${link.href})`).join('\n');
      if (externalLinks.length > 20) {
        linksSection += `\n\n_... and ${externalLinks.length - 20} more external links_`;
      }
    }

    // Return Markdown content with links
    return {
      content: [
        {
          type: "text",
          text: `# ${result.title}\n\n${result.markdown}${linksSection}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
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
  console.error("Playwright MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
