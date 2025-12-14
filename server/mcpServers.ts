/**
 * agent-verse - Modern chat interface for Claude Agent SDK
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { ProviderType } from '../client/config/models';

interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

interface McpStdioServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig;

/**
 * MCP servers configuration for different providers
 * - Shared MCP servers (grep.app): Available to all providers
 * - Provider-specific MCP servers: Z.AI has additional web-search and media analysis tools
 *
 * IMPORTANT: MCP Server Accessibility
 * ====================================
 * - Main agent: Has FULL access to all MCP servers configured here
 * - Spawned sub-agents (via Task tool): DO NOT inherit MCP servers from parent
 *
 * This is a Claude Agent SDK architectural limitation. When an agent spawns a sub-agent,
 * the sub-agent runs in a separate subprocess without inheriting the parent's MCP configuration.
 *
 * WORKAROUND: Spawned agents use Bash to call scripts directly
 * - fetch-web-fast.ts: Fast web fetch via Playwright (CLI wrapper)
 * - grep.app MCP: Works because it's HTTP-based (stateless)
 *
 * Why the MCP tool list in agents.ts doesn't work for spawned agents:
 * - Tools array in agent definitions is for RESTRICTION, not ADDITION
 * - Even if 'mcp__web__fetch_page' is listed, the MCP server isn't available in the subprocess
 * - Grep MCP (mcp__grep__searchGitHub) works because it's HTTP (no subprocess state needed)
 */
export const MCP_SERVERS_BY_PROVIDER: Record<ProviderType, Record<string, McpServerConfig>> = {
  'anthropic': {
    // Grep.app MCP - code search across public GitHub repositories
    'grep': {
      type: 'http',
      url: 'https://mcp.grep.app',
    },
    // Puppeteer MCP - web fetching with JavaScript support (bypasses 403, Windows-compatible)
    'web': {
      type: 'stdio',
      command: 'bun',
      args: ['run', 'server/mcp/puppeteer-mcp-server.ts'],
    },
  },
  'z-ai': {
    // Grep.app MCP - code search across public GitHub repositories
    'grep': {
      type: 'http',
      url: 'https://mcp.grep.app',
    },
    // Puppeteer MCP - web fetching with JavaScript support (bypasses 403, Windows-compatible)
    'web': {
      type: 'stdio',
      command: 'bun',
      args: ['run', 'server/mcp/puppeteer-mcp-server.ts'],
    },
    // GLM models use Z.AI MCP servers
    'web-search-prime': {
      type: 'http',
      url: 'https://api.z.ai/api/mcp/web_search_prime/mcp',
      headers: {
        'Authorization': `Bearer ${process.env.ZAI_API_KEY || ''}`,
      },
    },
    'zai-mcp-server': {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@z_ai/mcp-server'],
      env: {
        'Z_AI_API_KEY': process.env.ZAI_API_KEY || '',
        'Z_AI_MODE': 'ZAI',
      },
    },
  },
  'moonshot': {
    // Grep.app MCP - code search across public GitHub repositories
    'grep': {
      type: 'http',
      url: 'https://mcp.grep.app',
    },
    // Puppeteer MCP - web fetching with JavaScript support (bypasses 403, Windows-compatible)
    'web': {
      type: 'stdio',
      command: 'bun',
      args: ['run', 'server/mcp/puppeteer-mcp-server.ts'],
    },
  },
};

/**
 * Get MCP servers for a specific provider
 *
 * @param provider - The provider type
 * @param _modelId - Optional model ID for model-specific MCP server restrictions
 */
export function getMcpServers(provider: ProviderType, _modelId?: string): Record<string, McpServerConfig> {
  const servers = MCP_SERVERS_BY_PROVIDER[provider] || {};
  console.log(`🔧 [MCP DEBUG] getMcpServers called for provider "${provider}":`, Object.keys(servers));
  return servers;
}

/**
 * Get allowed tools for a provider's MCP servers
 *
 * @param provider - The provider type
 * @param _modelId - Optional model ID for model-specific tool restrictions
 */
export function getAllowedMcpTools(provider: ProviderType, _modelId?: string): string[] {
  // Grep.app MCP tools - available to all providers
  const grepTools = [
    'mcp__grep__searchGitHub',
  ];

  let tools: string[] = [];

  if (provider === 'anthropic') {
    tools = [
      ...grepTools,
      'mcp__web__fetch_page',
    ];
  } else if (provider === 'z-ai') {
    tools = [
      ...grepTools,
      'mcp__web__fetch_page',
      'mcp__web-search-prime__search',
      'mcp__zai-mcp-server__image_analysis',
      'mcp__zai-mcp-server__video_analysis',
    ];
  } else if (provider === 'moonshot') {
    tools = [
      ...grepTools,
      'mcp__web__fetch_page',
    ];
  }

  console.log(`🔧 [MCP DEBUG] getAllowedMcpTools for provider "${provider}":`, tools);
  return tools;
}
