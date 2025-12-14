#!/usr/bin/env node

/**
 * Web Fetch MCP Server
 *
 * A professional MCP server for web fetching using Puppeteer.
 * Features:
 * - Bypasses 403 errors with realistic browser fingerprinting
 * - Handles JavaScript-heavy sites
 * - Extracts clean markdown content
 * - Provides internal/external link navigation
 * - Windows-compatible
 * - Structured JSON logging to stderr (stdio-safe)
 * - Zod schema validation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FetchPageSchema, zodToJsonSchema } from './schemas/tool-schemas.js';
import { fetchPageTool } from './tools/fetch-page.js';
import { logger } from './utils/logger.js';
import { ValidationError, FetchError } from './utils/errors.js';

const serverLogger = logger.child('server');

/**
 * Create MCP server with tool capabilities.
 */
const server = new Server(
  {
    name: 'web-fetch-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler for listing available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  serverLogger.info('Listing tools');
  return {
    tools: [
      {
        name: 'fetch_page',
        description:
          'Fetch a web page using Puppeteer (bypasses 403 errors, handles JavaScript). Returns Markdown content with extracted links.',
        inputSchema: zodToJsonSchema(FetchPageSchema),
      },
    ],
  };
});

/**
 * Handler for tool execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  serverLogger.info('Tool called', { tool: toolName });

  try {
    switch (toolName) {
      case 'fetch_page':
        return await fetchPageTool(request.params.arguments);

      default:
        serverLogger.warn('Unknown tool requested', { tool: toolName });
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    serverLogger.error('Tool execution failed', error);

    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Validation error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    if (error instanceof FetchError) {
      return {
        content: [
          {
            type: 'text' as const,
            text: error.message,
          },
        ],
        isError: true,
      };
    }

    throw error;
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  serverLogger.info('Starting Web Fetch MCP server');

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    serverLogger.info('Server connected and ready');
  } catch (error) {
    serverLogger.error('Failed to start server', error);
    throw error;
  }
}

main().catch((error) => {
  serverLogger.error('Fatal server error', error);
  process.exit(1);
});
