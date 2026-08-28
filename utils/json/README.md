# utils/json — Unified JSON Extraction System

Centralized JSON extraction, repair, and streaming for all AI Matrx products. Replaces scattered regex parsers, duplicate `progressive-json-parser` files, and ad-hoc `JSON.parse` wrappers.

---

## Architecture

```
Layer 0  json-structural.ts          Character-level: balanced braces, fenced blocks
Layer 1  extract-json.ts             Core extractor: extractAllJson / extractFirstJson
Layer 2  json-utils.ts               Repair, formatting, flexible parse
Layer 3  streaming-json-tracker.ts   Stateful streaming wrapper (chunk-by-chunk)
Layer 4  scan-text.ts                High-level façade: scanText / TextScanner
Hook     hooks/use-streaming-json.ts React hook for standalone components
Redux    active-requests.slice.ts    Integrated into process-stream for LLM responses
```

---

## Quick Start (default — when in doubt, use this)

```ts
import { scanText, TextScanner } from "@/utils/json/scan-text";

// Have the full text in hand?
const { text, data } = scanText(aiResponse);
//   text  → the input verbatim (never trimmed, never had fences stripped)
//   data  → ScannedJson[] with { value, isComplete, type, source, ... }

// Streaming chunks?
const scanner = new TextScanner();
for await (const chunk of stream) {
  const { text, data } = scanner.append(chunk);
  // data[0]?.isComplete === false until the JSON closes.
  // data[0]?.value is auto-closed during streaming so you always have
  // something to render.
}
const { data } = scanner.finalize(); // optional final pass
```

`scanText` / `TextScanner` accept JSON in any form — fenced (` ```json...``` `), bare (`{...}` / `[...]`), or whole-string. Detection is order-preserving and you can have many JSON values in one input. Non-JSON prose is returned untouched in `text`.

---

## Which API to Use

### LLM streaming responses (Redux)

If you're in the agent execution system and the response is streamed via `processStream`, opt in with the `jsonExtraction` config:

```ts
// In your thunk or wherever you call processStream:
await processStream({
  requestId,
  conversationId,
  response,
  // ... other args
  jsonExtraction: {
    enabled: true,
    fuzzyOnFinalize: true, // bare blocks + whole-string on final pass
    maxResults: 5, // optional cap
  },
});
```

Then read from Redux in your component:

```ts
import {
  selectExtractedJson,
  selectFirstExtractedObject,
  selectFirstExtractedJson,
  selectJsonExtractionComplete,
  selectJsonExtractionRevision,
  selectAllJsonComplete,
  selectExtractedJsonCount,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

// All results (live-updates during stream)
const results = useAppSelector(selectExtractedJson(requestId));

// First object (skips arrays/primitives)
const configObj = useAppSelector(selectFirstExtractedObject(requestId));

// Only re-render when results actually change
const revision = useAppSelector(selectJsonExtractionRevision(requestId));

// Wait for the final pass before acting on results
const isComplete = useAppSelector(selectJsonExtractionComplete(requestId));
```

**Key point:** The revision counter is a primitive number. Use it to gate expensive work — your component only re-renders when the actual extraction output changes, not on every text chunk.

### Non-streaming (database content, user input, clipboard)

Import directly from `@/utils/json`:

```ts
import {
  extractAllJson,
  extractFirstJson,
  extractFirstObject,
} from "@/utils/json";

// Get all JSON from a markdown string
const results = extractAllJson(markdownText, { allowFuzzy: true });

// Get just the first one
const first = extractFirstJson(markdownText);
if (first) {
  console.log(first.value, first.type, first.isComplete);
}

// Quick boolean check
import { containsJson } from "@/utils/json";
if (containsJson(text)) {
  /* ... */
}
```

### Streaming without Redux (standalone component)

Use the React hook:

```ts
import { useStreamingJson } from "@/utils/json/hooks/use-streaming-json";

const { state, append, finalize, reset } = useStreamingJson({
  repairEnabled: true,
  fuzzyOnFinalize: true,
});

// Feed chunks as they arrive:
append(chunk);

// When stream ends:
finalize();

// Read results:
state.results.forEach((r) => console.log(r.value));
```

Or use the class directly for non-React contexts:

```ts
import { StreamingJsonTracker } from "@/utils/json";

const tracker = new StreamingJsonTracker({ repairEnabled: true });
tracker.append(chunk1);
tracker.append(chunk2);
const final = tracker.finalize();
```

---

## ExtractionOptions Reference

| Option          | Default    | Effect                                                                                                                                                    |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isStreaming`   | `false`    | When `true`, runs the streaming auto-closer so trailing partial JSON still parses (used by `StreamingJsonTracker` and `TextScanner`)                      |
| `allowFuzzy`    | `false`    | Enables bare-block detection (raw `{...}`/`[...]`), inline scanning, and whole-string fallback. Defaulted to `true` by the higher-level `scanText` façade |
| `repairEnabled` | `true`     | Fix trailing commas, Python `True`/`False`/`None`, and JSON5-style model output (single quotes, unquoted keys, comments)                                  |
| `maxResults`    | `Infinity` | Cap the number of extracted values                                                                                                                        |

### ScanOptions Reference (high-level façade)

| Option          | Default    | Effect                                                                                     |
| --------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `allowBare`     | `true`     | Detect bare JSON in addition to fenced blocks. Set to `false` to restrict to fenced output |
| `repairEnabled` | `true`     | Same as above                                                                              |
| `maxResults`    | `Infinity` | Same as above                                                                              |

---

## Migrating Existing Extraction Logic

### Step 1: Replace the import

Old:

```ts
import { extractJsonFromText } from "@/features/agents/utils/json-extraction";
import {
  extractJsonBlock,
  extractNonJsonContent,
} from "@/features/prompts/utils/json-extraction";
```

New:

```ts
import {
  extractFirstJson,
  extractAllJson,
  findAllFencedBlocks,
} from "@/utils/json";
```

### Step 2: Swap the call

| Old call                                            | New equivalent                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `extractJsonFromText(text)` → `{ success, data }`   | `extractFirstJson(text)` → `{ value, isComplete, ... }` or `null`        |
| `extractJsonBlock(text)` → raw string               | `findAllFencedBlocks(text)[0]?.content`                                  |
| `extractNonJsonContent(text)` → `{ before, after }` | Use `findAllFencedBlocks(text)` and slice around `fenceStart`/`fenceEnd` |
| `parsePartialJson(text)` (progressive)              | `extractAllJson(text, { isStreaming: true })`                            |

### Step 3: Keep your domain logic separate

The extraction system gives you parsed `value` and metadata (`type`, `isComplete`, `source`, `warnings`). Your feature should handle:

- **Validation** — Does the extracted object match your expected schema?
- **Transformation** — Convert the raw value into your domain type.
- **Fallback** — What happens when extraction returns no results?

```ts
// Good pattern: extract first, then validate
const result = extractFirstObject(streamText);
if (result && isMyExpectedSchema(result.value)) {
  applyConfig(result.value as MyConfig);
}
```

Don't duplicate fence-scanning, brace-balancing, or repair logic in your feature code. If the core extractor doesn't handle your case, open an issue against `utils/json/` rather than adding a local workaround.

### Step 4: Streaming migration

If your feature currently does `progressive-json-parser` style field-by-field parsing during a stream:

1. Switch to `useStreamingJson()` hook or `StreamingJsonTracker` class
2. Feed each chunk via `append()`
3. Read `state.results` for the latest extracted values
4. Check `state.isAllComplete` to know if all JSON structures are balanced
5. Call `finalize()` when the stream ends for a final repair pass

The tracker handles the hard part (partial fences, incomplete objects, revision tracking). Your component only needs to react to `state.results`.

---

## Testing

- **Unit tests:** `utils/json/__tests__/` — 84 tests covering all layers
- **Interactive tester:** Markdown Tester → "JSON Extract" tab (one-shot and simulated streaming with configurable chunking strategies)

---

## Migration Checklist

Files to migrate, grouped by priority. Check off each as completed.

### Priority 1 — Duplicate parsers (delete after migration)

- [ ] `features/agents/agent-creators/prompt-generator/progressive-json-parser.ts` — full duplicate parser with `parsePartialJson`, `extractJsonBlock`, `extractNonJsonContent`
- [ ] `features/prompts/components/actions/prompt-generator/progressive-json-parser.ts` — identical copy of the above

### Priority 2 — Legacy wrapper shims (delete when no consumers remain)

- [ ] `features/agents/utils/json-extraction.ts` — legacy `extractJsonFromText` / `extractJsonBlock` / `extractNonJsonContent` wrapper
- [ ] `features/prompts/utils/json-extraction.ts` — re-exports from agents wrapper

### Priority 3 — Components using progressive-json-parser

- [ ] `features/agents/agent-creators/prompt-generator/PromptJsonDisplay.tsx` — uses `parsePartialJson` + `extractJsonBlock` for live streaming preview
- [ ] `features/agents/agent-creators/prompt-generator/PromptGenerator.tsx` — uses `extractNonJsonContent` + `extractJsonFromText`
- [ ] `features/prompts/components/actions/prompt-generator/PromptGenerator.tsx` — same as above (prompts copy)
- [ ] `features/agents/agent-creators/interactive-builder/AgentGenerator.tsx` — uses `extractNonJsonContent` + `extractJsonFromText`

### Priority 4 — Components using extractJsonFromText wrapper

- [ ] `features/prompts/components/actions/prompt-optimizers/FullPromptOptimizer.tsx` — `extractJsonFromText` on stream end
- [ ] `features/agents/agent-creators/prompt-optimizers/FullPromptOptimizer.tsx` — `extractJsonFromText` on stream end
- [ ] `components/admin/GeneratePromptForSystemModal.tsx` — `extractJsonFromText` on completed response
- [ ] `features/prompt-builtins/admin/GeneratePromptForBuiltinModal.tsx` — `extractJsonFromText` on completed response

### Priority 5 — Custom hand-rolled extractors

- [ ] `components/admin/ToolUiComponentGenerator.tsx` — custom `extractJsonFromResponse` with `## METADATA` + fence regex
- [ ] `components/admin/mcp-tools/ToolComponentPreview.tsx` — custom `parseRevision` with same METADATA pattern
- [ ] `features/agents/import/agent-import-converters.ts` — `parsePasted` with fence-strip regex + bare `{...}` fallback

### Priority 6 — Deep integration (incremental adoption)

- [ ] `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` — tightly coupled to streaming markdown pipeline; adopt structural primitives (`findAllFencedBlocks`) incrementally

### Already migrated

- [x] `features/agents/redux/execution-system/thunks/process-stream.ts` — uses `StreamingJsonTracker`
- [x] `lib/redux/prompt-execution/thunks/executeBuiltinWithJsonExtractionThunk.ts` — uses `extractFirstJson`
- [x] `components/admin/MarkdownTester.tsx` — uses both `extractAllJson` and `StreamingJsonTracker`
