# SEARCH/REPLACE Content Block

Full specification of the SEARCH/REPLACE protocol used across AI Matrx — covering the text format AI models must emit, the client-side parsing pipeline, and the server-side structured `content_block` protocol Python must implement.

---

## 1. Overview

The SEARCH/REPLACE system is how AI models express **targeted text/code changes** without returning the entire modified file. It exists in three layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| **AI Text Format** | Prompt system instruction | What the LLM writes in its response |
| **Client Parser Pipeline** | `features/code-editor/utils/` and `features/text-diff/lib/` | Parses raw LLM text → structured edits |
| **Server Structured Protocol** | `content_block` stream event | Python pre-parses and sends structured data to the client |

---

## 2. AI Text Format (What the LLM Emits)

### 2.1 SEARCH/REPLACE Block

The primary format. The LLM must wrap code/text in exactly this structure:

```
SEARCH:
<<<
[exact text to find — must match uniquely in the target]
>>>

REPLACE:
<<<
[replacement text — can be empty to delete]
>>>
```

**Rules (enforced by all parsers):**
- `SEARCH:` and `REPLACE:` keywords must be followed immediately by a newline
- Opening delimiter (`<<<`) must be on its own line
- Closing delimiter (`>>>`) must be on its own line
- Delimiters must match: `<<<`/`>>>`, or `<<`/`>>`, or `<`/`>` (all work; `<<<`/`>>>` preferred)
- Multiple blocks are allowed — each is applied independently and sequentially
- The SEARCH content must match **exactly one** location in the target (exact or whitespace-fuzzy)
- REPLACE content can be empty (deletion)
- Any text before the first `SEARCH:` is treated as an explanation

### 2.2 LINE-RANGE Block (text-diff only)

Available for the `features/text-diff` system. Selects lines by number instead of content:

```
LINES:
<<<
START: 5
END: 12
>>>

REPLACE:
<<<
replacement content
>>>
```

**Rules:**
- Line numbers are 1-indexed
- `START` must be ≤ `END`
- `END` must not exceed the total line count
- Line-range blocks and SEARCH/REPLACE blocks can coexist in one response

### 2.3 Multiple Blocks

A single AI response can contain any number of blocks. They are applied **sequentially** (each block operates on the result of the previous):

```
Here are the changes I'll make:

SEARCH:
<<<
const foo = 1;
>>>

REPLACE:
<<<
const foo = 42;
>>>

SEARCH:
<<<
return foo;
>>>

REPLACE:
<<<
return foo * 2;
>>>
```

---

## 3. Client-Side Parsing Pipeline

### 3.1 Systems

Two independent client-side systems implement this protocol. They share identical logic but are not yet unified:

#### System A — Code Editor (`features/code-editor/utils/`)

Used by the AI Code Editor modal. Operates on source code files.

| Step | File | Function | What it does |
|------|------|----------|-------------|
| Parse | `parseCodeEdits.ts` | `parseCodeEdits(response)` | Extracts `CodeEdit[]` from raw AI text |
| Validate | `parseCodeEdits.ts` | `validateEdits(code, edits)` | Checks each SEARCH matches exactly once |
| Apply | `applyCodeEdits.ts` | `applyCodeEdits(code, edits)` | Applies edits to source string |
| Diff | `generateDiff.ts` | `generateUnifiedDiff(orig, modified)` | Myers LCS diff for display |

#### System B — Text Diff (`features/text-diff/lib/`)

Used for general text content (notes etc.) with version history and accept/reject UX.

| Step | File | Function | What it does |
|------|------|----------|-------------|
| Parse | `parseDiff.ts` | `parseDiff(response)` | Extracts `TextDiff[]` (SEARCH/REPLACE + LINE-RANGE) |
| Validate | `parseDiff.ts` | `validateSearchReplaceDiffs()` / `validateLineRangeDiffs()` | Validates all diffs |
| Match | `matchText.ts` | `matchText(text, search)` | Canonical exact→fuzzy match (returns start/end indices) |
| Apply | `applyDiff.ts` | `applyDiffs(text, diffs)` | Applies all diffs sequentially |

### 3.2 Matching Strategy (identical in both systems)

1. **Exact match** — `text.indexOf(search)`. If found exactly once → success. If found multiple times → error (ambiguous).
2. **Fuzzy fallback** — If exact fails: trim each line, drop blank lines, rejoin, compare. If one fuzzy match → success. If multiple → error.
3. **No match** → error with diagnostic output.

The canonical implementation is in `features/text-diff/lib/matchText.ts`.

### 3.3 Streaming Display

While the AI is still generating, `diff-blocks/` provides real-time visualization:

| Phase | What client sees | Trigger condition |
|-------|-----------------|-------------------|
| Detecting | "Analyzing diff format…" loader | Content < 15 chars OR confidence < 0.6 |
| Buffering SEARCH | "Analyzing code…" loader | `SEARCH:` seen but `>>>` not yet closed |
| Streaming REPLACE | Code block with "GENERATING" badge | `searchComplete && !replaceComplete` |
| Complete | Collapsed diff view | `isComplete === true` |
| Fallback | Raw code block | Stream ended, confidence never reached 0.6 |

**Detection confidence** (from `diff-style-registry.ts`):
- Sees `SEARCH:` → +40%
- Sees `REPLACE:` → +40%
- Sees delimiters `<{1,3}` + `>{1,3}` → +20%
- `SEARCH:` + delimiters together → floor to 80%
- Minimum 60% required to render as diff

---

## 4. Server-Side Structured Protocol (Python → Client)

### 4.1 When to Use This Protocol

Use the `content_block` event for `search_replace` blocks **instead of** embedding raw text in the streamed response when:
- The server is orchestrating a code/text editing workflow
- You want the client to render the structured diff UI (not just show text)
- The server has pre-parsed the SEARCH/REPLACE blocks from the LLM response

For fully streaming responses where the server just passes through LLM output, the client handles raw text detection automatically via `StreamingDiffBlock`.

### 4.2 Event Schema

The server sends a stream event of type `content_block` with the following payload:

```python
# Python dataclass / Pydantic model
class SearchReplaceBlockData(BaseModel):
    search: str              # Exact text to find (already trimmed)
    replace: str             # Replacement text (can be empty string)
    search_complete: bool    # True once search section fully emitted
    replace_complete: bool   # True once replace section fully emitted
    is_complete: bool        # True when both sections done (== search_complete && replace_complete)
    language: str | None     # Source language for syntax highlighting, e.g. "typescript"

class ContentBlockEvent(BaseModel):
    event: Literal["content_block"] = "content_block"
    data: ContentBlockPayload

class ContentBlockPayload(BaseModel):
    block_id: str                        # Unique ID for this block in the message
    block_index: int                     # 0-based position in the overall block sequence
    type: Literal["search_replace"]      # Must be exactly "search_replace"
    status: Literal["streaming", "complete", "error"]
    content: str | None = None           # Raw text (optional, for fallback)
    data: SearchReplaceBlockData | None  # Structured data (primary path)
    metadata: dict = {}                  # Optional extras (e.g. {"file_path": "src/foo.ts"})
```

**Wire format (NDJSON, one line per event):**

```json
{"event":"content_block","data":{"block_id":"edit-1","block_index":0,"type":"search_replace","status":"streaming","data":{"search":"","replace":"","search_complete":false,"replace_complete":false,"is_complete":false,"language":"typescript"},"metadata":{"file_path":"src/components/Foo.tsx"}}}
```

### 4.3 Streaming Sequence

The server should send multiple `content_block` events for the same `block_id` as it processes:

```
Event 1 — SEARCH section begins streaming:
  status: "streaming"
  data.search: "" (or partial)
  data.search_complete: false
  data.replace_complete: false
  data.is_complete: false

Event 2 — SEARCH section complete:
  status: "streaming"
  data.search: "const foo = 1;\nreturn foo;"   ← full search text
  data.search_complete: true
  data.replace_complete: false
  data.is_complete: false

Event 3 — REPLACE section begins:
  status: "streaming"
  data.search: "const foo = 1;\nreturn foo;"
  data.replace: "const foo = 42;"               ← partial replace
  data.search_complete: true
  data.replace_complete: false
  data.is_complete: false

Event 4 — Both complete:
  status: "complete"
  data.search: "const foo = 1;\nreturn foo;"
  data.replace: "const foo = 42;\nreturn foo * 2;"
  data.search_complete: true
  data.replace_complete: true
  data.is_complete: true
```

### 4.4 camelCase / snake_case Normalisation

The client (`StreamAwareChatMarkdown.tsx`) normalises both forms:
```typescript
const blockId = (raw.blockId ?? raw.block_id) as string;
```
Python can send either `block_id` or `blockId` — the client accepts both. Recommended: use **snake_case** on the wire (Python convention) and let the client normalise.

### 4.5 Multiple Blocks in One Message

Each SEARCH/REPLACE block in the AI response gets its own `block_id` and `block_index`:

```
block_index: 0 — first edit (e.g. fix function signature)
block_index: 1 — second edit (e.g. update return statement)
block_index: 2 — a plain text block (type: "text") explaining the changes
```

Client sorts by `block_index` before rendering.

### 4.6 Metadata Recommendations

Use the `metadata` dict for optional display hints:

```json
{
  "file_path": "src/components/Foo.tsx",
  "change_type": "refactor",
  "description": "Replace magic number with named constant"
}
```

These are not required but improve the UX (e.g. showing the file path in the diff header).

---

## 5. Component: `SearchReplaceBlock`

**Location:** `components/mardown-display/blocks/search-replace/SearchReplaceBlock.tsx`

**Registered in:**
- `BlockComponentRegistry.tsx` as `BlockComponents.SearchReplaceBlock`
- `BlockRenderer.tsx` under `case "search_replace"`
- `@ai-matrx/agents/generated/content-blocks` as `BlockType.SEARCH_REPLACE` and `SearchReplaceBlockData`

**Props:**

```typescript
interface SearchReplaceBlockProps {
  serverData?: SearchReplaceBlockData | Record<string, unknown>;
  content?: string;       // raw fallback
  isStreamActive?: boolean;
  language?: string;      // default: "typescript"
  className?: string;
}
```

**Render paths:**
1. `serverData` present → `SearchReplaceDiffRenderer` directly (structured, fastest)
2. `content` present → `StreamingDiffBlock` (auto-detects from raw text)
3. Neither → loading indicator

---

## 6. Isolation Status

| File | Isolated? | Notes |
|------|-----------|-------|
| `features/text-diff/lib/matchText.ts` | ✅ Fully | Pure function, zero imports |
| `features/text-diff/lib/applyDiff.ts` | ✅ Fully | Depends only on matchText + parseDiff types |
| `features/text-diff/lib/parseDiff.ts` | ⚠️ Partial | Has local `normalizeForMatching`/`findFuzzyMatches` — should import from matchText |
| `features/code-editor/utils/parseCodeEdits.ts` | ⚠️ Partial | Duplicates normalise/fuzzy logic — should import from matchText |
| `features/code-editor/utils/applyCodeEdits.ts` | ⚠️ Partial | Duplicates normalise/fuzzy/extract logic — should import from matchText |
| `diff-style-registry.ts` | ✅ Fully | Pure detection/parsing |
| `generateDiff.ts` | ✅ Fully | Pure LCS algorithm |
| `SearchReplaceBlock.tsx` | ✅ Fully | New component — no coupling |

**Known tech debt:** `normalizeForMatching` and `findFuzzyMatches` are duplicated in 3 files. The canonical version with correct char-position tracking is in `matchText.ts`. Future cleanup: refactor `parseCodeEdits.ts` and `applyCodeEdits.ts` to import from `features/text-diff/lib/matchText.ts` (or move matchText to a shared location).

---

## 7. System Prompt Instructions for LLMs

When prompting a model to produce SEARCH/REPLACE output, use these instructions verbatim:

```
To make code changes, use SEARCH/REPLACE blocks. Format each change as:

SEARCH:
<<<
[exact code to find — copy it verbatim from the file, including indentation]
>>>

REPLACE:
<<<
[replacement code]
>>>

Rules:
- The SEARCH text must match exactly one location in the file (be specific enough to be unique)
- SEARCH: and REPLACE: must each be on their own line
- <<< and >>> must each be on their own line
- You may include multiple SEARCH/REPLACE blocks for multiple changes
- Leave REPLACE empty to delete code
- Preserve indentation exactly as it appears in the original
```
