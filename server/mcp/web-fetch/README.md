# Web Fetch MCP Server

Professional MCP server for web fetching using Puppeteer, built with the official MCP SDK boilerplate.

## Features

✅ **Bypasses 403 errors** - Realistic browser fingerprinting
✅ **Handles JavaScript** - Full Puppeteer browser automation
✅ **Clean markdown output** - Turndown service for HTML→MD conversion
✅ **Link extraction** - Internal/external navigation links
✅ **Windows-compatible** - Built and tested on Windows
✅ **Structured logging** - JSON logs to stderr (stdio-safe)
✅ **Zod validation** - Type-safe input validation
✅ **Modular architecture** - Clean separation of concerns

## Architecture

```
web-fetch/
├── src/
│   ├── tools/          # Tool handlers
│   │   └── fetch-page.ts
│   ├── schemas/        # Zod validation schemas
│   │   └── tool-schemas.ts
│   ├── utils/          # Logger, errors
│   │   ├── logger.ts
│   │   └── errors.ts
│   └── index.ts        # MCP server entry point
├── build/              # Compiled JavaScript (TypeScript output)
└── package.json
```

## Usage

### As MCP Server

The server is configured in `server/mcpServers.ts`:

```typescript
'web': {
  type: 'stdio',
  command: 'node',
  args: ['server/mcp/web-fetch/build/index.js'],
}
```

### Tool: fetch_page

Fetches a web page and returns markdown content with links.

**Parameters:**
- `url` (required): The URL to fetch
- `contentSelector` (optional): CSS selector for main content
- `waitFor` (optional): CSS selector to wait for before extraction
- `waitTime` (optional): Timeout in milliseconds (default: 15000)

**Example:**
```json
{
  "url": "https://dev.epicgames.com/documentation/en-us/fortnite/verse",
  "contentSelector": "main",
  "waitTime": 10000
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Test with MCP inspector
npm run inspector
```

## Logging

All logs are JSON-formatted and written to stderr (safe for stdio transport):

```json
{
  "timestamp": "2025-12-14T19:57:04.937Z",
  "level": "info",
  "message": "Server connected and ready",
  "context": "web-fetch-mcp:server"
}
```

## Why This Works (vs. Previous Version)

The previous `puppeteer-mcp-server.ts` had:
- ❌ Logs went to stderr but SDK didn't forward them
- ❌ No structured logging
- ❌ No input validation
- ❌ Compiled on-the-fly with `bun run`

This version has:
- ✅ Pre-compiled JavaScript (faster startup)
- ✅ Uses Node.js (better SDK compatibility)
- ✅ Structured JSON logging
- ✅ Zod schema validation
- ✅ Professional error handling
- ✅ Modular, testable architecture

## License

AGPL-3.0-or-later (same as agent-smith)
