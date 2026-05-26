# Research Streaming API — Frontend Integration Guide

All research streaming endpoints return a **JSONL** (newline-delimited JSON) stream via `Content-Type: text/event-stream`. Every line is a self-contained JSON object — one event per line.

---

## Wire Format

Every JSONL line has this envelope:

```typescript
interface StreamEvent {
  event: EventType;
  data: Record<string, unknown>;
}
```

The top-level `event` field is one of the **system event types** below. Research-specific payloads arrive inside `data` events, where `data.event` discriminates the research event type.

---

## System Event Types

These are the top-level event types that wrap all streaming data:

| `event`          | Purpose                                         | `data` shape                    |
|------------------|------------------------------------------------ |---------------------------------|
| `chunk`          | LLM token-by-token text streaming               | `{ text: string }`             |
| `status_update`  | Human-readable progress messages                 | `StatusUpdate`                  |
| `data`           | Structured research events (see next section)    | `ResearchDataEvent`             |
| `tool_event`     | Tool execution lifecycle (start/progress/done)   | `ToolEvent`                     |
| `completion`     | LLM call finished                                | `Completion`                    |
| `error`          | Something went wrong                             | `ErrorPayload`                  |
| `heartbeat`      | Keep-alive ping (~every 5s)                      | `{ timestamp: number }`         |
| `end`            | Stream is done, close the connection             | `{ reason: string }`            |

### System Payload Types

```typescript
interface StatusUpdate {
  status: string;
  system_message?: string | null;
  user_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ErrorPayload {
  error_type: string;
  message: string;
  user_message: string;
  code?: string | null;
  details?: Record<string, unknown> | null;
}

interface Completion {
  status: "complete" | "failed" | "max_iterations_exceeded";
  output?: unknown;
  iterations?: number | null;
  total_usage?: Record<string, unknown> | null;
  timing_stats?: Record<string, unknown> | null;
  tool_call_stats?: Record<string, unknown> | null;
  finish_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ToolEvent {
  event: "tool_started" | "tool_progress" | "tool_step" | "tool_result_preview" | "tool_completed" | "tool_error";
  call_id: string;
  tool_name: string;
  timestamp: number;
  message?: string | null;
  show_spinner: boolean;
  data: Record<string, unknown>;
}
```

---

## Research Data Events

When `event === "data"`, the `data` object is a **research event**. Every research event has an `event` field that discriminates its type. This is the `data.event` field — **not** the top-level `event`.

### How to Parse

```typescript
// Each line from the stream:
const line = '{"event":"data","data":{"event":"scrape_complete","source_id":"abc","url":"https://...","status":"success","char_count":15432,"is_good_scrape":true}}';

const envelope = JSON.parse(line);

if (envelope.event === "data") {
  const researchEvent = envelope.data;

  switch (researchEvent.event) {
    case "scrape_complete":
      // researchEvent is ScrapeComplete
      updateSourceStatus(researchEvent.source_id, researchEvent.status);
      break;
    case "search_page_complete":
      // researchEvent is SearchPageComplete
      updateSearchProgress(researchEvent.keyword, researchEvent.page);
      break;
    // ... handle all event types
  }
}
```

---

## All Research Event Types

### Search Events

Emitted during keyword search operations (per-keyword, per-page granularity).

#### `search_page_start`

Fired before each page of search results is fetched.

```typescript
interface SearchPageStart {
  event: "search_page_start";
  keyword: string;      // The search keyword text
  keyword_id: string;   // UUID of the keyword row
  page: number;         // 1-indexed page number
  total_pages: number;  // Always 5 (max pages per keyword)
}
```

#### `search_page_complete`

Fired after each page of search results is fetched successfully.

```typescript
interface SearchPageComplete {
  event: "search_page_complete";
  keyword: string;
  keyword_id: string;
  page: number;        // Which page just finished (1-indexed)
  page_count: number;  // How many results were on this page
  total_so_far: number; // Cumulative result count for this keyword
}
```

#### `search_sources_stored`

Fired after search results for a keyword are persisted to the database (fire-and-forget, so this arrives after the search itself completes).

```typescript
interface SearchSourcesStored {
  event: "search_sources_stored";
  keyword_id: string;
  stored_count: number; // How many unique sources were stored/upserted
}
```

#### `search_complete`

Fired once at the end of the entire search phase (all keywords done). Only emitted by the `/topics/{id}/search` endpoint.

```typescript
interface SearchComplete {
  event: "search_complete";
  total_sources: number; // Total results across all keywords
}
```

---

### Scrape Events

Emitted during web scraping operations (per-URL granularity).

#### `scrape_start`

Fired before each individual URL is fetched.

```typescript
interface ScrapeStart {
  event: "scrape_start";
  source_id: string; // UUID of the source row
  url: string;       // The URL being scraped
}
```

#### `scrape_complete`

Fired after a URL is successfully scraped (even if content is thin).

```typescript
interface ScrapeComplete {
  event: "scrape_complete";
  source_id: string;
  url: string;
  status: "success" | "thin" | "failed"; // Scrape outcome
  char_count: number;    // Number of extracted characters
  is_good_scrape: boolean; // true if char_count >= threshold (default 1000)
}
```

#### `scrape_failed`

Fired when a URL cannot be fetched at all (network error, blocked, no content).

```typescript
interface ScrapeFailed {
  event: "scrape_failed";
  source_id: string; // May be "unknown" if error occurs at batch level
  url: string;       // May be "unknown" if error occurs at batch level
  reason: string;    // Human-readable failure reason
}
```

#### `rescrape_complete`

Fired by the single-source rescrape endpoint (`POST /topics/{id}/sources/{id}/rescrape`).

```typescript
interface RescrapeComplete {
  event: "rescrape_complete";
  source_id: string;
  is_good_scrape: boolean;
  char_count: number;
}
```

---

### Analysis Events

Emitted during LLM-powered page analysis (per-source granularity). The LLM response itself streams token-by-token via `chunk` events.

#### `analysis_start`

Fired before each source is sent to the LLM for analysis.

```typescript
interface AnalysisStart {
  event: "analysis_start";
  source_id: string;
  total: number; // Total sources being analyzed in this batch
}
```

#### `analysis_complete`

Fired after a source is successfully analyzed by the LLM.

```typescript
interface AnalysisComplete {
  event: "analysis_complete";
  source_id: string;
  agent_type: string;       // e.g. "page_summary"
  model_id: string | null;  // The LLM model used (e.g. "gpt-4o")
  result_length: number;    // Character length of the analysis text
}
```

#### `analysis_failed`

Fired when an LLM analysis fails for a source.

```typescript
interface AnalysisFailed {
  event: "analysis_failed";
  source_id: string;
  error: string;
}
```

#### `analyze_all_complete`

Fired once at the end of the bulk analysis endpoint (`POST /topics/{id}/analyze-all`).

```typescript
interface AnalyzeAllComplete {
  event: "analyze_all_complete";
  count: number; // How many sources were successfully analyzed
}
```

#### `retry_complete`

Fired by the single retry endpoint (`POST /topics/{id}/analyses/{id}/retry`).

```typescript
interface RetryComplete {
  event: "retry_complete";
  analysis_id: string;
  result: Record<string, unknown>; // The analysis result row
}
```

#### `retry_all_complete`

Fired by the retry-all endpoint (`POST /topics/{id}/retry-failed`).

```typescript
interface RetryAllComplete {
  event: "retry_all_complete";
  retried: number;   // Total analyses retried
  succeeded: number; // How many succeeded on retry
}
```

---

### Synthesis Events

Emitted during LLM synthesis (keyword-level and project-level). The LLM response streams token-by-token via `chunk` events.

#### `synthesis_start`

Fired before synthesis begins.

```typescript
interface SynthesisStart {
  event: "synthesis_start";
  scope: "keyword" | "project";
  keyword_id?: string | null;  // Present for keyword scope
  keyword?: string | null;     // The keyword text, present for keyword scope
}
```

#### `synthesis_complete`

Fired after synthesis succeeds.

```typescript
interface SynthesisComplete {
  event: "synthesis_complete";
  scope: "keyword" | "project";
  keyword_id?: string | null;
  keyword?: string | null;
  result_length: number;       // Character length of the synthesis
  model_id: string | null;     // LLM model used
  version: number;             // Synthesis version number (increments)
}
```

#### `synthesis_failed`

Fired when synthesis fails.

```typescript
interface SynthesisFailed {
  event: "synthesis_failed";
  scope: "keyword" | "project";
  keyword_id?: string | null;
  error: string;
}
```

---

### Suggest Events

Emitted by the `POST /suggest` endpoint (LLM-powered topic setup assistant).

#### `suggest_complete`

```typescript
interface SuggestSetupComplete {
  event: "suggest_complete";
  title: string;
  description: string;
  suggested_keywords: string[];
  initial_insights?: string | null;
}
```

---

### Tag Events

#### `consolidate_complete`

Fired by `POST /topics/{id}/tags/{id}/consolidate` after tag consolidation.

```typescript
interface ConsolidateComplete {
  event: "consolidate_complete";
  tag_id: string;
  result: Record<string, unknown>;
}
```

#### `suggest_tags_complete`

Fired by `POST /topics/{id}/sources/{id}/suggest-tags`.

```typescript
interface SuggestTagsComplete {
  event: "suggest_tags_complete";
  source_id: string;
  result: Record<string, unknown>;
}
```

---

### Document Events

#### `document_complete`

Fired by `POST /topics/{id}/document` after document assembly.

```typescript
interface DocumentComplete {
  event: "document_complete";
  result: Record<string, unknown>;
}
```

---

### Pipeline Events

The full pipeline (`POST /topics/{id}/run`) runs search, scrape, analysis, and synthesis end-to-end. It emits **all of the above events** in real time as each phase progresses, plus these pipeline-specific events.

#### `pipeline_complete`

Fired once when the entire pipeline finishes successfully.

```typescript
interface PipelineComplete {
  event: "pipeline_complete";
  topic_id: string;
}
```

---

## LLM Streaming

During analysis and synthesis, the LLM response streams **token by token**. These arrive as top-level `chunk` events:

```json
{"event":"chunk","data":{"text":"The"}}
{"event":"chunk","data":{"text":" key"}}
{"event":"chunk","data":{"text":" findings"}}
{"event":"chunk","data":{"text":" indicate"}}
```

Concatenate `data.text` to build the full response. Multiple LLM calls may happen in sequence (e.g., multiple keyword syntheses), so use `synthesis_start` / `synthesis_complete` boundaries to know which synthesis each chunk belongs to.

---

## Status Updates

Progress messages arrive as `status_update` events throughout all operations. The `status` field indicates the current phase, and `user_message` contains a human-readable progress string suitable for direct display:

```json
{"event":"status_update","data":{"status":"searching","user_message":"Found 47 results for \"machine learning\""}}
{"event":"status_update","data":{"status":"scraping","user_message":"Scraped 12 pages, 8 good so far..."}}
{"event":"status_update","data":{"status":"analyzing","user_message":"Analyzed page 3/10..."}}
{"event":"status_update","data":{"status":"synthesizing","user_message":"Generating full research report..."}}
{"event":"status_update","data":{"status":"complete","user_message":"Research pipeline complete!"}}
```

The `status` field values during a full pipeline run follow this sequence:

1. `"searching"` — keyword search phase
2. `"scraping"` — web scraping phase
3. `"analyzing"` — LLM analysis phase
4. `"synthesizing"` — LLM synthesis phase
5. `"retrying"` — retry operations
6. `"complete"` — everything done

---

## Stream Lifecycle

Every streaming endpoint follows this pattern:

```
Connection opened
  → status_update (initial message)
  → heartbeat (every ~5 seconds)
  → [data events, chunk events, status_update events — in real time]
  → end { reason: "complete" }
Connection closed
```

On error:

```
  → error { error_type, message, user_message }
  → end { reason: "complete" }
Connection closed
```

The `end` event **always** terminates the stream. Close the connection after receiving it.

---

## Discriminated Union Type (TypeScript)

Use this to type-check all research data events:

```typescript
type ResearchDataEvent =
  | SearchPageStart
  | SearchPageComplete
  | SearchSourcesStored
  | SearchComplete
  | ScrapeStart
  | ScrapeComplete
  | ScrapeFailed
  | RescrapeComplete
  | AnalysisStart
  | AnalysisComplete
  | AnalysisFailed
  | AnalyzeAllComplete
  | RetryComplete
  | RetryAllComplete
  | SynthesisStart
  | SynthesisComplete
  | SynthesisFailed
  | SuggestSetupComplete
  | ConsolidateComplete
  | SuggestTagsComplete
  | DocumentComplete
  | PipelineComplete;
```

Discriminate on `event`:

```typescript
function handleResearchEvent(evt: ResearchDataEvent) {
  switch (evt.event) {
    case "search_page_start":
      // evt is SearchPageStart — TypeScript narrows automatically
      break;
    case "scrape_complete":
      // evt is ScrapeComplete
      break;
    // ...
  }
}
```

---

## Streaming Endpoints Reference

| Method | Path | Streams | Final Event |
|--------|------|---------|-------------|
| `POST` | `/suggest` | `chunk`, `suggest_complete` | `end` |
| `POST` | `/topics/{id}/search` | `search_page_start/complete`, `search_sources_stored`, `search_complete` | `end` |
| `POST` | `/topics/{id}/scrape` | `scrape_start/complete/failed` | `end` |
| `POST` | `/topics/{id}/sources/{id}/rescrape` | `scrape_start/complete/failed`, `rescrape_complete` | `end` |
| `POST` | `/topics/{id}/sources/{id}/analyze` | `chunk`, `analysis_complete` | `end` |
| `POST` | `/topics/{id}/analyze-all` | `analysis_start`, `chunk`, `analysis_complete/failed`, `analyze_all_complete` | `end` |
| `POST` | `/topics/{id}/analyses/{id}/retry` | `chunk`, `retry_complete` | `end` |
| `POST` | `/topics/{id}/retry-failed` | `chunk`, `retry_all_complete` | `end` |
| `POST` | `/topics/{id}/synthesize` | `synthesis_start`, `chunk`, `synthesis_complete/failed` | `end` |
| `POST` | `/topics/{id}/run` | **All of the above** + `pipeline_complete` | `end` |
| `POST` | `/topics/{id}/tags/{id}/consolidate` | `chunk`, `consolidate_complete` | `end` |
| `POST` | `/topics/{id}/sources/{id}/suggest-tags` | `chunk`, `suggest_tags_complete` | `end` |
| `POST` | `/topics/{id}/document` | `chunk`, `document_complete` | `end` |

---

## Non-Streaming Endpoints (JSON responses)

These return standard JSON, not streams:

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/templates/list` | `Template[]` |
| `POST` | `/templates` | `Template` |
| `GET` | `/templates/{id}` | `Template` |
| `POST` | `/projects/{id}/topics` | `TopicResponse` |
| `GET` | `/projects/{id}/topics` | `TopicResponse[]` |
| `GET` | `/topics/{id}` | `TopicResponse` (includes `progress`) |
| `PATCH` | `/topics/{id}` | `TopicResponse` |
| `POST` | `/topics/{id}/keywords` | `KeywordResponse[]` |
| `GET` | `/topics/{id}/keywords` | `KeywordResponse[]` |
| `DELETE` | `/topics/{id}/keywords/{id}` | `{ status: "ok" }` |
| `GET` | `/topics/{id}/sources` | `Source[]` (filterable) |
| `PATCH` | `/topics/{id}/sources/{id}` | `Source` |
| `PATCH` | `/topics/{id}/sources/bulk` | `{ updated: number }` |
| `GET` | `/topics/{id}/sources/{id}/content` | `Content[]` |
| `PATCH` | `/topics/{id}/content/{id}` | `Content` |
| `POST` | `/topics/{id}/sources/{id}/content` | `Content` |
| `GET` | `/topics/{id}/synthesis` | `Synthesis[]` |
| `GET` | `/topics/{id}/tags` | `Tag[]` |
| `POST` | `/topics/{id}/tags` | `Tag` |
| `PATCH` | `/topics/{id}/tags/{id}` | `Tag` |
| `DELETE` | `/topics/{id}/tags/{id}` | `{ status: "ok" }` |
| `POST` | `/topics/{id}/sources/{id}/tags` | `SourceTag[]` |
| `GET` | `/topics/{id}/document` | `Document \| null` |
| `GET` | `/topics/{id}/document/versions` | `Document[]` |
| `GET` | `/topics/{id}/links` | `LinkExplorerItem[]` |
| `POST` | `/topics/{id}/links/add-to-scope` | `Source[]` |
| `GET` | `/topics/{id}/media` | `Media[]` |
| `PATCH` | `/topics/{id}/media/{id}` | `Media` |
| `GET` | `/topics/{id}/costs` | `CostSummary` |
| `GET` | `/topics/{id}/document/export` | `Document` (JSON) |

---

## Example: Full Pipeline Stream

Here's a condensed example of what a full pipeline stream (`POST /topics/{id}/run`) looks like:

```
{"event":"status_update","data":{"status":"searching","user_message":"Searching 3 keyword(s)..."}}
{"event":"data","data":{"event":"search_page_start","keyword":"machine learning","keyword_id":"abc","page":1,"total_pages":5}}
{"event":"data","data":{"event":"search_page_complete","keyword":"machine learning","keyword_id":"abc","page":1,"page_count":20,"total_so_far":20}}
{"event":"heartbeat","data":{"timestamp":1740000000}}
{"event":"data","data":{"event":"search_page_start","keyword":"machine learning","keyword_id":"abc","page":2,"total_pages":5}}
{"event":"data","data":{"event":"search_page_complete","keyword":"machine learning","keyword_id":"abc","page":2,"page_count":18,"total_so_far":38}}
{"event":"status_update","data":{"status":"searching","user_message":"Found 38 results for \"machine learning\""}}
{"event":"data","data":{"event":"search_sources_stored","keyword_id":"abc","stored_count":35}}
{"event":"data","data":{"event":"scrape_start","source_id":"s1","url":"https://example.com/article"}}
{"event":"data","data":{"event":"scrape_complete","source_id":"s1","url":"https://example.com/article","status":"success","char_count":15432,"is_good_scrape":true}}
{"event":"data","data":{"event":"scrape_start","source_id":"s2","url":"https://example.com/page2"}}
{"event":"data","data":{"event":"scrape_failed","source_id":"s2","url":"https://example.com/page2","reason":"403 Forbidden"}}
{"event":"status_update","data":{"status":"scraping","user_message":"Scraped 2 pages, 1 good so far..."}}
{"event":"data","data":{"event":"analysis_start","source_id":"s1","total":1}}
{"event":"chunk","data":{"text":"The article"}}
{"event":"chunk","data":{"text":" discusses key"}}
{"event":"chunk","data":{"text":" advances in..."}}
{"event":"data","data":{"event":"analysis_complete","source_id":"s1","agent_type":"page_summary","model_id":"gpt-4o","result_length":1523}}
{"event":"status_update","data":{"status":"analyzing","user_message":"Analyzed 1 page(s) so far..."}}
{"event":"data","data":{"event":"synthesis_start","scope":"keyword","keyword_id":"abc","keyword":"machine learning"}}
{"event":"chunk","data":{"text":"# Keyword Synthesis"}}
{"event":"chunk","data":{"text":"\n\nBased on..."}}
{"event":"data","data":{"event":"synthesis_complete","scope":"keyword","keyword_id":"abc","keyword":"machine learning","result_length":3201,"model_id":"gpt-4o","version":1}}
{"event":"data","data":{"event":"synthesis_start","scope":"project"}}
{"event":"chunk","data":{"text":"# Research Report"}}
{"event":"chunk","data":{"text":"\n\n## Executive Summary..."}}
{"event":"data","data":{"event":"synthesis_complete","scope":"project","result_length":8750,"model_id":"gpt-4o","version":1}}
{"event":"status_update","data":{"status":"complete","user_message":"Research pipeline complete!"}}
{"event":"data","data":{"event":"pipeline_complete","topic_id":"topic-123"}}
{"event":"end","data":{"reason":"complete"}}
```

---

## Key Implementation Notes

1. **Overlapping phases**: Search, scrape, and analysis run concurrently in the pipeline. You will see `scrape_start` events **before** all searches complete, and `analysis_start` events before all scrapes complete. Build your UI to handle interleaved events.

2. **Multiple LLM streams**: During analysis and synthesis, multiple LLM calls happen. `chunk` events from different calls may interleave. Use the surrounding `analysis_start`/`analysis_complete` or `synthesis_start`/`synthesis_complete` boundaries to associate chunks with the correct operation.

3. **Fire-and-forget DB writes**: Events like `search_sources_stored` arrive asynchronously after the search itself finishes. Don't block on them — they're informational.

4. **Heartbeats**: The server sends heartbeat events every ~5 seconds. Use these to detect stale connections and show a "still working" indicator.

5. **Error recovery**: If an individual operation fails (one scrape, one analysis), the pipeline continues. You'll see `scrape_failed` or `analysis_failed` for that item, followed by the next item starting. The stream does **not** close on individual failures.

6. **Stream termination**: The `end` event always terminates the stream. On catastrophic failure, you'll get an `error` event followed by `end`.

---

## Source of Truth

The Pydantic models that generate these events live in:

```
research/stream_events.py
```

If you need the exact field types and defaults, that file is the definitive reference. Every event sent by the backend is constructed from one of these models and serialized via `.model_dump()`.
