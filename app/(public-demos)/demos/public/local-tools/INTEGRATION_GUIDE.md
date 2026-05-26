# Matrx Local — Frontend Integration Guide

> **Audience:** React frontend team building the AI Matrx web app.
> **Purpose:** Everything you need to connect to Matrx Local, test all 23 tools, and build UI for the new scraper system.

---

## Table of Contents

1. [Connection Overview](#1-connection-overview)
2. [REST API](#2-rest-api)
3. [WebSocket API](#3-websocket-api)
4. [All Available Tools](#4-all-available-tools)
5. [Scraper Engine Tools (New)](#5-scraper-engine-tools-new)
6. [Testing Checklist](#6-testing-checklist)
7. [UI Recommendations](#7-ui-recommendations)

---

## 1. Connection Overview

Matrx Local runs on the user's desktop. Its default port is **22140**, chosen specifically to avoid conflicts with common dev ports (3000, 5173, 8000, 8001, etc.). If the default is taken, it auto-scans ports 22140-22159 until it finds a free one.

**Two transport options:**

| Transport | Endpoint | Use Case |
|-----------|----------|----------|
| **REST** | `POST http://127.0.0.1:{port}/tools/invoke` | One-shot, stateless tool calls |
| **WebSocket** | `ws://127.0.0.1:{port}/ws` | Persistent session, concurrent calls, cancellation, background processes |

**CORS** is configured to allow `localhost:3000-3002`, `localhost:5173`, `127.0.0.1` equivalents, `aimatrx.com`, and `www.aimatrx.com`.

### Port Discovery

Matrx Local writes its connection info to **`~/.matrx/local.json`** on startup:

```json
{
  "port": 22140,
  "host": "127.0.0.1",
  "url": "http://127.0.0.1:22140",
  "ws": "ws://127.0.0.1:22140/ws",
  "pid": 12345,
  "version": "0.3.0"
}
```

**On the web (browser):** The browser cannot read local files, so use a port scan approach — try the known port range:

```typescript
const MATRX_LOCAL_PORT_START = 22140;
const MATRX_LOCAL_PORT_RANGE = 20;

async function discoverMatrxLocal(): Promise<{ url: string; ws: string } | null> {
  for (let offset = 0; offset < MATRX_LOCAL_PORT_RANGE; offset++) {
    const port = MATRX_LOCAL_PORT_START + offset;
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/tools/list`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        return { url, ws: `ws://127.0.0.1:${port}/ws` };
      }
    } catch {
      // Port not responding, try next
    }
  }
  return null;
}
```

**On mobile / Electron / Node.js:** Read `~/.matrx/local.json` directly — it's the fastest path.

**Important:** Cache the discovered port for the session. Don't re-scan on every request. Re-scan only if a request fails with a connection error (Matrx Local may have restarted on a different port).

### Connection Detection

```typescript
async function isMatrxLocalRunning(): Promise<boolean> {
  const connection = await discoverMatrxLocal();
  return connection !== null;
}
```

---

## 2. REST API

### List Tools

```
GET /tools/list
```

Response:
```json
{
  "tools": [
    "Bash", "BashOutput", "ClipboardRead", "ClipboardWrite",
    "DownloadFile", "Edit", "FetchUrl", "FetchWithBrowser",
    "Glob", "Grep", "ListDirectory", "Notify", "OpenPath",
    "OpenUrl", "Read", "Research", "Scrape", "Screenshot",
    "Search", "SystemInfo", "TaskStop", "UploadFile", "Write"
  ]
}
```

### Invoke Tool

```
POST /tools/invoke
Content-Type: application/json

{
  "tool": "<ToolName>",
  "input": { ... }
}
```

Response:
```json
{
  "type": "success" | "error",
  "output": "Human-readable text output",
  "image": null | { "media_type": "image/png", "base64_data": "..." },
  "metadata": null | { ... }
}
```

**Important:** REST creates a fresh session per request. Working directory, background processes, and other state do **not** persist between calls. Use WebSocket for stateful workflows.

---

## 3. WebSocket API

### Connect

```typescript
// Use the discovered connection info (see Port Discovery above)
const { ws: wsUrl } = await discoverMatrxLocal();
const ws = new WebSocket(wsUrl); // e.g. ws://127.0.0.1:22140/ws
```

### Message Format

All messages are JSON.

**Send a tool call:**
```json
{
  "id": "unique-request-id",
  "tool": "Scrape",
  "input": {
    "urls": ["https://example.com"]
  }
}
```

**Receive a response:**
```json
{
  "id": "unique-request-id",
  "type": "success",
  "output": "URL: https://example.com\nStatus: 200\n...",
  "metadata": {
    "status": "success",
    "url": "https://example.com",
    "status_code": 200,
    "content_type": "html"
  }
}
```

### Control Messages

```json
// Ping (check connection)
{"action": "ping"}
// → {"type": "success", "output": "pong"}

// Cancel a specific task
{"id": "req-1", "action": "cancel"}

// Cancel all running tasks
{"action": "cancel_all"}
```

### Concurrency

Multiple tool calls can run simultaneously on the same WebSocket. Each gets its own `id` and responds independently. The session state (working directory, background processes) is shared across all calls in the same connection.

---

## 4. All Available Tools

### File Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `Read` | `path: string` | Read file contents |
| `Write` | `path: string, content: string` | Write/overwrite a file |
| `Edit` | `path: string, old_text: string, new_text: string` | Find-and-replace in a file |
| `Glob` | `pattern: string, path?: string` | Find files matching a glob pattern |
| `Grep` | `pattern: string, path?: string, include?: string` | Search file contents with regex |

### Shell Execution

| Tool | Parameters | Description |
|------|-----------|-------------|
| `Bash` | `command: string, timeout?: int` | Execute a shell command (fg or bg) |
| `BashOutput` | `shell_id: string` | Read output from a background shell |
| `TaskStop` | `shell_id: string` | Kill a background shell process |

### System

| Tool | Parameters | Description |
|------|-----------|-------------|
| `SystemInfo` | *(none)* | OS, CPU, memory, disk, Python version |
| `Screenshot` | *(none)* | Capture screen, returns base64 PNG |
| `ListDirectory` | `path?: string` | List directory contents |
| `OpenUrl` | `url: string` | Open URL in default browser |
| `OpenPath` | `path: string` | Open file/folder in OS default app |

### Clipboard

| Tool | Parameters | Description |
|------|-----------|-------------|
| `ClipboardRead` | *(none)* | Read clipboard text |
| `ClipboardWrite` | `content: string` | Write text to clipboard |

### Notifications

| Tool | Parameters | Description |
|------|-----------|-------------|
| `Notify` | `title: string, message: string` | Send native OS notification |

### Network — Simple

| Tool | Parameters | Description |
|------|-----------|-------------|
| `FetchUrl` | `url: string, method?: string, headers?: object, body?: string, follow_redirects?: bool, timeout?: int` | Direct HTTP request from user's IP |
| `FetchWithBrowser` | `url: string, wait_for?: string, wait_timeout?: int, extract_text?: bool` | Playwright headless browser fetch |

### Network — Scraper Engine (New)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `Scrape` | `urls: string[], use_cache?: bool, output_mode?: string, get_links?: bool, get_overview?: bool` | Full scraper engine |
| `Search` | `keywords: string[], country?: string, count?: int, freshness?: string` | Brave Search API |
| `Research` | `query: string, country?: string, effort?: string, freshness?: string` | Deep research (search + scrape + compile) |

### File Transfer

| Tool | Parameters | Description |
|------|-----------|-------------|
| `DownloadFile` | `url: string, path: string` | Download file to local path |
| `UploadFile` | `path: string, url: string` | Upload local file to URL |

---

## 5. Scraper Engine Tools (New)

These are the most important new tools. They use a production-grade scraping engine with:
- Multi-strategy fetching (HTTP → curl-cffi with browser impersonation → Playwright fallback)
- Cloudflare/bot detection and automatic retry
- Proxy rotation (datacenter + residential)
- Content extraction for HTML, PDF, images (OCR)
- In-memory caching (and PostgreSQL persistence when configured)
- Domain-specific parsing rules

### `Scrape`

Scrape one or more URLs with the full engine.

**Request:**
```json
{
  "tool": "Scrape",
  "input": {
    "urls": ["https://example.com", "https://news.ycombinator.com"],
    "use_cache": true,
    "output_mode": "rich",
    "get_links": false,
    "get_overview": false
  }
}
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `urls` | `string[]` | *(required)* | URLs to scrape (max 100) |
| `use_cache` | `bool` | `true` | Use cached results if available |
| `output_mode` | `string` | `"rich"` | `"rich"` for full content, `"research"` for AI-optimized text |
| `get_links` | `bool` | `false` | Include extracted links in response |
| `get_overview` | `bool` | `false` | Include page overview (title, description, etc.) |

**Response (single URL):**
```json
{
  "type": "success",
  "output": "URL: https://example.com\nStatus: 200\nContent-Type: html\n\n<extracted text content>",
  "metadata": {
    "status": "success",
    "url": "https://example.com",
    "status_code": 200,
    "content_type": "html",
    "from_cache": false,
    "cms": "wordpress",
    "firewall": "cloudflare",
    "elapsed_ms": 1523
  }
}
```

**Response (multiple URLs):**
```json
{
  "type": "success",
  "output": "Scraped 3 URLs in 4521ms\nSuccess: 2/3\n\n--- Result 1/3 ---\n...",
  "metadata": {
    "results": [
      { "status": "success", "url": "...", "status_code": 200, "content_type": "html" },
      { "status": "success", "url": "...", "status_code": 200, "content_type": "html" },
      { "status": "error", "url": "...", "error": "cloudflare_block" }
    ],
    "total": 3,
    "success_count": 2,
    "elapsed_ms": 4521
  }
}
```

**Metadata fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"success"` or `"error"` |
| `url` | `string` | Final URL (after redirects) |
| `status_code` | `int` | HTTP status code |
| `content_type` | `string` | `html`, `pdf`, `json`, `xml`, `txt`, `image`, `md`, `other` |
| `from_cache` | `bool` | Whether result came from cache |
| `cms` | `string?` | Detected CMS: `wordpress`, `shopify`, `unknown` |
| `firewall` | `string?` | Detected WAF: `cloudflare`, `aws_waf`, `datadome`, `none` |
| `error` | `string?` | Error description if status is `"error"` |
| `overview` | `object?` | Page overview (if `get_overview: true`) |
| `links` | `object?` | Extracted links (if `get_links: true`) |
| `elapsed_ms` | `int` | Total execution time |

---

### `Search`

Search the web using Brave Search API.

**Request:**
```json
{
  "tool": "Search",
  "input": {
    "keywords": ["latest AI frameworks 2026"],
    "country": "us",
    "count": 10,
    "freshness": null
  }
}
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `keywords` | `string[]` | *(required)* | Search queries (max 10) |
| `country` | `string` | `"us"` | Country code for localized results |
| `count` | `int` | `10` | Results per keyword (max 20) |
| `freshness` | `string?` | `null` | Time filter: `"pd"` (past day), `"pw"` (past week), `"pm"` (past month), `"py"` (past year) |

**Response:**
```json
{
  "type": "success",
  "output": "Found 10 results in 832ms\n\n1. Title of First Result\n   https://example.com/page\n   Description...\n\n2. ...",
  "metadata": {
    "results": [
      {
        "keyword": "latest AI frameworks 2026",
        "title": "Top AI Frameworks in 2026",
        "url": "https://example.com/ai-frameworks",
        "description": "A comprehensive guide...",
        "age": "2 days ago"
      }
    ],
    "total": 10,
    "elapsed_ms": 832
  }
}
```

**Note:** Requires `BRAVE_API_KEY` to be configured on the Matrx Local instance. If not set, returns:
```json
{ "type": "error", "output": "Search not available — BRAVE_API_KEY not configured." }
```

---

### `Research`

Deep research: search for a query, scrape all result pages, compile findings.

**Request:**
```json
{
  "tool": "Research",
  "input": {
    "query": "how does transformer attention mechanism work",
    "country": "us",
    "effort": "medium",
    "freshness": null
  }
}
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `query` | `string` | *(required)* | Research query |
| `country` | `string` | `"us"` | Country code |
| `effort` | `string` | `"medium"` | How many pages to scrape: `"low"` (10), `"medium"` (25), `"high"` (50), `"extreme"` (100) |
| `freshness` | `string?` | `null` | Time filter (same as Search) |

**Response:**
```json
{
  "type": "success",
  "output": "Research complete: how does transformer attention mechanism work\nPages scraped: 18 | Failed: 7\nTime: 34521ms\n\n--- https://arxiv.org/... ---\n<content>\n\n--- https://blog.example.com/... ---\n<content>\n...",
  "metadata": {
    "query": "how does transformer attention mechanism work",
    "pages_scraped": 18,
    "pages_failed": 7,
    "elapsed_ms": 34521,
    "content_length": 245000
  }
}
```

**Important:** Research can take 10-60+ seconds depending on effort level. Over WebSocket, you can cancel it mid-flight. Over REST, the HTTP request will block until completion.

---

## 6. Testing Checklist

### Quick Smoke Test

These can be tested immediately with no configuration:

```bash
# Default port is 22140 — check ~/.matrx/local.json for actual port
PORT=22140

# Check if running
curl http://127.0.0.1:$PORT/tools/list

# List tools
curl http://127.0.0.1:$PORT/tools/list | jq

# Simple scrape (no API key needed)
curl -X POST http://127.0.0.1:$PORT/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "Scrape", "input": {"urls": ["https://httpbin.org/html"], "use_cache": false}}'

# Simple fetch
curl -X POST http://127.0.0.1:$PORT/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "FetchUrl", "input": {"url": "https://httpbin.org/get"}}'

# System info
curl -X POST http://127.0.0.1:$PORT/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "SystemInfo", "input": {}}'
```

### Full Scraper Test Matrix

| Test | Tool | Input | Expected |
|------|------|-------|----------|
| Basic HTML scrape | `Scrape` | `{"urls": ["https://httpbin.org/html"]}` | Status: success, content_type: html, has text_data |
| Multiple URLs | `Scrape` | `{"urls": ["https://httpbin.org/html", "https://example.com"]}` | Both succeed, metadata.results has 2 items |
| Cache hit | `Scrape` | Same URL twice with `use_cache: true` | Second call returns `from_cache: true` |
| Cache bypass | `Scrape` | Same URL with `use_cache: false` | Always fetches fresh |
| Get links | `Scrape` | `{"urls": ["https://news.ycombinator.com"], "get_links": true}` | metadata.links populated |
| Get overview | `Scrape` | `{"urls": ["https://en.wikipedia.org/wiki/Python_(programming_language)"], "get_overview": true}` | metadata.overview populated |
| PDF extraction | `Scrape` | `{"urls": ["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"]}` | content_type: pdf, has text_data |
| Error handling | `Scrape` | `{"urls": ["https://thisdomaindoesnotexist12345.com"]}` | Status: error, has error message |
| Cloudflare site | `Scrape` | `{"urls": ["https://www.cloudflare.com"]}` | May succeed or report firewall: cloudflare |
| Simple fetch vs engine | `FetchUrl` vs `Scrape` | Same URL | FetchUrl returns raw HTML; Scrape returns extracted text |
| Browser fetch | `FetchWithBrowser` | `{"url": "https://httpbin.org/html", "extract_text": true}` | Returns rendered text content |
| Search (requires BRAVE_API_KEY) | `Search` | `{"keywords": ["AI frameworks 2026"]}` | Returns search results with titles and URLs |
| Research (requires BRAVE_API_KEY) | `Research` | `{"query": "what is rust programming language", "effort": "low"}` | Scrapes ~10 pages, returns compiled content |

### WebSocket Concurrency Test

1. Open a WebSocket to `ws://127.0.0.1:22140/ws` (or the discovered port)
2. Send 3 scrape requests simultaneously with different IDs
3. Verify all 3 responses come back (in any order) with correct IDs
4. Send a `{"action": "cancel_all"}` during a Research call
5. Verify the Research is cancelled

### Edge Cases to Test

- **No Matrx Local running** — UI should detect and show "Matrx Local not connected" state
- **Scrape of very large page** — Output is truncated at 500KB with `"... [truncated at 500KB]"` message
- **Scrape timeout** — Very slow sites may timeout; error message explains what happened
- **Invalid URL** — Returns error with `"Invalid URL"` message
- **Empty URL list** — Pydantic validation catches this in scraper-service

---

## 7. UI Recommendations

### Connection Status Indicator

Show a persistent indicator of Matrx Local connection status. Poll `/tools/list` every 10-30 seconds, or maintain a WebSocket with periodic pings.

States: **Connected** (green) | **Disconnected** (red) | **Connecting** (yellow)

### Scraper Testing Panel

A dedicated panel for testing the scraper engine. Suggested layout:

#### URL Input Section
- Text area for entering URLs (one per line or comma-separated)
- Options toggles: `use_cache`, `get_links`, `get_overview`
- Output mode selector: `rich` / `research`
- "Scrape" button

#### Results Display
- For each URL: status badge (success/error/cached), URL, content type, CMS, firewall detected
- Expandable text content area (the extracted text)
- Metadata panel showing all returned metadata
- Timing information

#### Search Panel
- Keyword input (supports multiple)
- Country selector dropdown
- Count slider (1-20)
- Freshness filter (any/day/week/month/year)
- Results displayed as a list with title, URL, description, age

#### Research Panel
- Query input (single text field)
- Effort level selector: Low (10 pages) / Medium (25) / High (50) / Extreme (100)
- Progress indicator showing pages scraped vs total
- Cancel button (via WebSocket cancel)
- Compiled research output in a scrollable, formatted text area

### Comparison View

Side-by-side comparison of the three fetch methods for the same URL:

| Method | Response |
|--------|----------|
| `FetchUrl` | Raw HTTP response (headers + body) |
| `FetchWithBrowser` | Rendered page content |
| `Scrape` | Extracted, cleaned, structured text |

This helps demonstrate the value of the scraper engine over simple fetching.

### Tool Explorer

A generic tool testing interface:

1. Dropdown to select any tool from `/tools/list`
2. Dynamic form that renders input fields based on the tool's parameters
3. "Execute" button
4. Response display with output, image (if any), and metadata

This is useful for testing all 23 tools without building dedicated UI for each.

### WebSocket Monitor

A developer-facing panel (maybe under a "Debug" menu):

- Real-time log of all WebSocket messages (sent and received)
- Connection status and latency
- Active request tracking (which tool calls are in flight)
- Cancel buttons per request

---

## Appendix: TypeScript Types

```typescript
interface ToolRequest {
  tool: string;
  input: Record<string, unknown>;
}

interface ToolResponse {
  type: 'success' | 'error';
  output: string;
  image?: {
    media_type: string;
    base64_data: string;
  };
  metadata?: Record<string, unknown>;
}

interface WebSocketToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
}

interface WebSocketResponse {
  id: string;
  type: 'success' | 'error';
  output: string;
  image?: {
    media_type: string;
    base64_data: string;
  };
  metadata?: Record<string, unknown>;
}

interface WebSocketControl {
  action: 'ping' | 'cancel' | 'cancel_all';
  id?: string;
}

// Scrape-specific metadata
interface ScrapeMetadata {
  status: 'success' | 'error';
  url: string;
  status_code?: number;
  content_type?: string;
  from_cache?: boolean;
  cms?: 'wordpress' | 'shopify' | 'unknown';
  firewall?: 'cloudflare' | 'aws_waf' | 'datadome' | 'none';
  error?: string;
  overview?: Record<string, unknown>;
  links?: Record<string, unknown>;
  elapsed_ms?: number;
}

interface BatchScrapeMetadata {
  results: ScrapeMetadata[];
  total: number;
  success_count: number;
  elapsed_ms: number;
}

interface SearchResult {
  keyword: string;
  title: string;
  url: string;
  description: string;
  age?: string;
}

interface SearchMetadata {
  results: SearchResult[];
  total: number;
  elapsed_ms: number;
}

interface ResearchMetadata {
  query: string;
  pages_scraped: number;
  pages_failed: number;
  elapsed_ms: number;
  content_length: number;
}
```
