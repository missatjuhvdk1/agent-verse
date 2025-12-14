# Web Fetching Tools

High-performance documentation scraper that bypasses 403 errors (including Epic Games).

## Features

✅ **Fast**: < 5 seconds for most pages (8s max timeout)
✅ **Reliable**: Bypasses 403 errors with realistic browser fingerprint
✅ **Rich Output**: Extracts nested URLs for easy navigation
✅ **Universal**: Works for both main agents and sub-agents
✅ **Smart Content Detection**: Auto-detects main content areas

## Usage

### For Agents (via Bash Tool)

**✅ Recommended:** Use Puppeteer version (Windows-compatible, no pipe issues)

```bash
# Basic fetch
bun run server/mcp/fetch-web-puppeteer.ts "https://dev.epicgames.com/documentation/en-us/uefn/verse-api-reference"

# With content selector (optional)
bun run server/mcp/fetch-web-puppeteer.ts "https://example.com" "main"

# Parse the JSON output
bun run server/mcp/fetch-web-puppeteer.ts "URL" | jq -r '.content'
bun run server/mcp/fetch-web-puppeteer.ts "URL" | jq -r '.navigation.internal[] | "\(.text): \(.href)"'
```

**Alternative:** Playwright version (may have Windows pipe communication issues)

```bash
# Use if Puppeteer has issues or on Linux/Mac
bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/uefn/verse-api-reference"
```

### Output Format

```json
{
  "success": true,
  "url": "https://...",
  "title": "Page Title",
  "stats": {
    "fetchTimeMs": 3456,
    "contentLength": 45678,
    "linkCount": 120
  },
  "content": "# Page Title\n\n...",
  "navigation": {
    "internal": [
      { "text": "Link Text", "href": "https://...", "isInternal": true }
    ],
    "external": [
      { "text": "External Link", "href": "https://...", "isInternal": false }
    ]
  }
}
```

### For Main Agents (via MCP Tool)

Main agents can also use the MCP tool:

```typescript
// Use mcp__web__fetch_page tool
{
  url: "https://example.com",
  contentSelector: "main" // optional
}
```

## How It Works

### Anti-Detection Features

- Realistic browser fingerprint (Windows 10, Chrome 131)
- Hides automation markers (`navigator.webdriver`)
- Proper HTTP headers (Accept, Accept-Language, etc.)
- Timezone and locale settings
- No sandbox for better compatibility

### Content Extraction

1. **Auto-detection**: Tries common selectors (`main`, `article`, `[role="main"]`, etc.)
2. **Custom selector**: Use second argument for specific CSS selector
3. **Fallback**: Falls back to `body` if no selector works

### Link Extraction

- Extracts up to 150 links from page
- Groups by internal/external
- Filters out empty links and anchors (#)
- Returns first 100 internal, 20 external

### Performance Optimizations

- `domcontentloaded` instead of `networkidle` (3-5x faster)
- 8 second max timeout
- 500ms wait for dynamic content (Epic Games)
- Content size limits (800KB HTML, 100KB markdown)
- No screenshots by default

## Examples

### Epic Games Documentation

```bash
# Fetch Verse API reference
bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/uefn/verse-api-reference"

# Fetch specific device docs
bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/fortnite/verse-api/fortnitedotcom/devices/button_device"
```

### Navigate Internal Links

```bash
# Get all internal links
result=$(bun run server/mcp/fetch-web-fast.ts "https://dev.epicgames.com/documentation/en-us/uefn")
echo "$result" | jq -r '.navigation.internal[] | "- [\(.text)](\(.href))"'
```

### Extract Just Content

```bash
# Get markdown content only
bun run server/mcp/fetch-web-fast.ts "https://example.com" | jq -r '.content'

# Get title
bun run server/mcp/fetch-web-fast.ts "https://example.com" | jq -r '.title'
```

## Troubleshooting

### First Run

On first run, Playwright will download browser binaries (~100MB). This may take 30-60 seconds.

### Timeouts

If fetches timeout:
- Check internet connection
- Try with a simpler URL first
- Increase timeout in code if needed (currently 8s)

### 403 Errors

If you still get 403 errors:
- Ensure browser fingerprint is up to date
- Check if site requires specific headers
- Try with different user agent

### Content Not Found

If content is empty:
- Verify URL is correct
- Try with explicit content selector
- Check if page requires authentication

## Architecture

```
fetch-web-fast.ts
├── CLI wrapper for agents (Bash tool)
├── Returns JSON output
└── Fast, standalone

playwrightFetch.ts
├── Class-based fetcher
├── Persistent browser
└── Used by MCP server

playwright-mcp-server.ts
├── MCP server wrapper
├── Formats output for agents
└── Available to main agents only
```

## Why Two Approaches?

**CLI Script (`fetch-web-fast.ts`)**:
- ✅ Works for sub-agents (no MCP inheritance)
- ✅ Fast (no MCP overhead)
- ✅ Simple JSON output
- ✅ Easy to test/debug

**MCP Tool (`mcp__web__fetch_page`)**:
- ✅ Nicer formatting for main agents
- ✅ Persistent browser (faster for multiple fetches)
- ❌ Not available to sub-agents

**Recommendation**: Use CLI script via Bash tool for universal compatibility.
