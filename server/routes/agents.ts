/**
 * Agent Smith - Modern chat interface for Claude Agent SDK
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AGENT_REGISTRY } from '../agents';
import * as fs from 'fs/promises';
import * as path from 'path';

const AGENTS_CONFIG_PATH = path.join(process.cwd(), '.claude', 'agents.json');

interface AgentConfig {
  enabled: Record<string, boolean>;
  custom: Record<string, { description: string; prompt: string; tools?: string[] }>;
}

/**
 * Load agent configuration from file
 */
async function loadAgentConfig(): Promise<AgentConfig> {
  try {
    const data = await fs.readFile(AGENTS_CONFIG_PATH, 'utf-8');
    return JSON.parse(data) as AgentConfig;
  } catch {
    // Initialize with all agents enabled
    const config: AgentConfig = {
      enabled: {},
      custom: {}
    };

    // Enable all built-in agents by default
    Object.keys(AGENT_REGISTRY).forEach(key => {
      config.enabled[key] = true;
    });

    return config;
  }
}

/**
 * Save agent configuration to file
 */
async function saveAgentConfig(config: AgentConfig): Promise<void> {
  const dir = path.dirname(AGENTS_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(AGENTS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Handle agent management routes
 */
export async function handleAgentRoutes(req: Request, url: URL): Promise<Response | undefined> {
  // GET /api/agents - List all agents with their status
  if (req.method === 'GET' && url.pathname === '/api/agents') {
    const config = await loadAgentConfig();

    const agents = Object.entries(AGENT_REGISTRY).map(([key, def]) => ({
      id: key,
      description: def.description,
      enabled: config.enabled[key] ?? true,
      builtin: true
    }));

    // Add custom agents
    Object.entries(config.custom).forEach(([key, def]) => {
      agents.push({
        id: key,
        description: def.description,
        enabled: config.enabled[key] ?? true,
        builtin: false
      });
    });

    return new Response(JSON.stringify({ success: true, agents }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/agents/:id/toggle - Enable/disable an agent
  const toggleMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/toggle$/);
  if (req.method === 'POST' && toggleMatch) {
    const id = toggleMatch[1];
    const config = await loadAgentConfig();

    // Toggle the enabled state
    const currentState = config.enabled[id] ?? true;
    config.enabled[id] = !currentState;

    await saveAgentConfig(config);

    return new Response(JSON.stringify({
      success: true,
      id,
      enabled: config.enabled[id]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // DELETE /api/agents/:id - Remove a custom agent
  const deleteMatch = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const id = deleteMatch[1];
    const config = await loadAgentConfig();

    // Can only delete custom agents
    if (!config.custom[id]) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cannot delete built-in agents'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    delete config.custom[id];
    delete config.enabled[id];

    await saveAgentConfig(config);

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/agents - Add a new custom agent
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const body = await req.json() as {
      id: string;
      description: string;
      prompt: string;
      tools?: string[];
    };

    const { id, description, prompt, tools } = body;

    // Validate input
    if (!id || !description || !prompt) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: id, description, prompt'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate ID format (lowercase alphanumeric + dashes)
    if (!/^[a-z0-9-]+$/.test(id)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Agent ID must be lowercase alphanumeric with dashes'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const config = await loadAgentConfig();

    // Check if agent already exists
    if (AGENT_REGISTRY[id] || config.custom[id]) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Agent with this ID already exists'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add custom agent
    config.custom[id] = { description, prompt, tools };
    config.enabled[id] = true;

    await saveAgentConfig(config);

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Route not handled
  return undefined;
}
