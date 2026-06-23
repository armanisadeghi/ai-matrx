# Streaming & Tool-Render Alignment Overhaul

**Owner directive — 2026-06-23.** The tool renderers wait for the final result then dump it, ignoring the real-time intermediary data the server streams; they're built/verified against FAKE demo data that doesn't match reality; and we've been ignoring the server repo. This plan fixes all of it, across **both repos** (matrx-frontend + aidream).

> Status: PLAN. Execute with parallel agents per the assignment table. Append findings under "Investigation log" as agents report.

---

## Non-negotiable principles (NEW — these override prior assumptions)

1. **NO FAKE DATA. EVER.** Fake samples make something that looks good to us but isn't reality. The current "live search" demo examples don't exist in the real app. To get samples: query real `cx_tool_call` runs, and/or trigger the tool via a test agent (the owner is also running tools through the admin account to generate fresh real samples). A demo page may ONLY use **actual results from real tool runs** — and if a sample is older than ~1 month, **confirm the server still emits that exact shape** (some tools changed) before using it.
2. **USE BOTH REPOS. Server-side is in scope.** If the data shape is wrong for rendering, **change the server (aidream) to emit/save the shape we need.** Example hypothesis: web search converts results to a TEXT blob (fine for the model, terrible to render) — the server may need to ALSO save a structured JSON version. It may already do this and we haven't found it. "Stop acting like you can't navigate the codebase."
3. **TWO SHAPES, ONE BEHAVIOR.** There are two data variations: the **live real-time stream** and the **DB-saved** version. Every renderer must handle BOTH and treat them **identically**. Easiest correct fix: **normalize them server-side** so they're the same shape. Either way both must work.
4. **HONEST PACED REVEAL OF REAL BATCHES.** When results genuinely arrive as one big batch (e.g. ~20 at once), do NOT pretend each item streamed. Receive the batch as the batch it is, then have the UI **pace the display over ~2–3s** to mimic the streaming feel. The demo must reflect this real behavior.
5. **CONTRAST — both modes.** No unreadable token combinations (e.g. white text on a light-green background). Every tint must pass contrast in light AND dark mode.
6. **BEAUTIFUL TOOLS DON'T COLLAPSE.** Research produces a genuinely beautiful result — it's a conversation, the user can scroll. Do NOT fold it into a compact collapsed card.

---

## The method: per-tool alignment audit (the core sweep)

For **every tool**, confirm three things are aligned, and fix where they aren't:
- **(S) Server emit** — what aidream actually emits during execution (intermediary stream events) AND saves.
- **(D) DB saved** — the `cx_tool_call` row shape (`arguments`, `output`, `output_type`, `output_preview`, `execution_events`).
- **(C) Client render** — what the renderer reads and shows.

Misalignment = the renderer reads the wrong field or the shapes differ live-vs-saved. **Prefer fixing it once on the server (normalize) over patching each client.** Assign parallel agents, **1–3 tools each**, each reviewing server + client. Web search already proven broken (came back "horrible") — so this is happening across multiple tools, not just one.

---

## Repos & key locations

- **Frontend (this repo):** renderers `features/tool-call-visualization/renderers/*`; stream ingest `features/agents/redux/execution-system/thunks/process-stream.ts` + `active-requests.slice.ts` (`upsertToolLifecycle`, `events[]`, `latestData`, `resultPreview`); wire types `types/python-generated/stream-events.ts`.
- **Server (aidream):** Python backend. **First task: locate the repo** (sibling dir — agents confirm path) and the tool implementations + the stream-emit layer (`ToolStreamManager` / `tools/streaming.py`, `tools/logger.py`, the web-search / research tools, the subagent runner).
- **DB:** Supabase project `txzxabzwovsujtloxrus`, table `cx_tool_call` (+ `execution_events`).

---

## Workstreams & tasks

### WS0 — Dark/light contrast fix (quick, immediate)
White text on light-green background is unreadable. Audit `success`/`destructive`/tinted backgrounds in the new search + patch renderers (`AnimatedDiffReveal`, `TextDiff`, `SearchInline`/`SearchOverlay`, badges) in BOTH modes; ensure foreground text always contrasts the tinted bg. Fix all unreadable combos.

### WS1 — Web search alignment (server + client)
"Horrible" result = reading the wrong part of the data OR live/saved shapes differ. Investigate the server emit: does aidream convert search results to a TEXT blob only, or also a structured JSON? **If JSON isn't emitted/saved, change the server to emit+save a structured JSON** (`{query, results:[{title,url,description,image,ai_review,...}]}`), normalized for live + DB. Then render from JSON (not text-scraping). This unblocks a truly beautiful, correct search component. AI-augmented enrichment fields must be surfaced.

### WS2 — Per-tool alignment sweep (all remaining tools)
Parallel agents, 1–3 tools each, server+client, write findings + fix misalignments. Cover the registered + DB renderers (ctx_*, sql/db_*, fs_*, memory, data, scrape/read, news, rag, get_user_lists, travel_*, navigate/click/tabs/find, etc.).

### WS3 — Streaming infra: consume intermediary events (the crux)
The renderers wait for `tool_completed`; the server streams **intermediary steps in real time** (search results, scrapes, subagent tokens) — often **before the agent itself has them**. Wire the FE to consume those live events (`entry.events` / a richer accumulation) and render them, with the **two-shape normalization** so live and persisted look identical. This is the foundation WS4 depends on.

### WS4 — Research tool streaming rebuild (THE BIG ONE)
`research_web` / `core_web_search_and_read`. Currently: keywords show beautifully, then ~1 minute of dead waiting (we ignore everything the server streams), then a dump; the subagent's stream is rendered as if it's the main agent; order and separation are wrong. Rebuild to this exact flow and order:

**Final rendered order (do NOT collapse):** search results → page-reading results → subagent research report → main agent response.

1. **Keywords → searches.** The primary agent emits keywords (already shown). Each keyword fires a search returning ~20 AI-augmented results, **streamed back in real time — render them.** Pacing option A (preferred): hold the keywords back; when the first results arrive, reveal keyword #1 and stream its results over ~2–3s; **buffer** incoming; play sequentially (keyword → its results → next keyword → its results). Option B: two keywords side-by-side. Goal: put on a show. These are enriched, not raw, results.
2. **Page reading.** Then it scrapes pages one by one. As each completes, show **"Reading <page>"** (never "scraping" — meaningless to users). Do NOT show raw scrape content (ugly). Instead stream the page's **AI review** if present (clean); else its **meta description / clean content**. Show the page's **primary image** alongside, so it looks like the model is actively reading it. As new pages arrive, **older ones fold up** (smaller), current one prominent. **Buffer** (arrival timing is uneven) with a **small debug indicator of buffer count** (to tune pacing); when the buffer holds >1–2 items, **speed up** the display so we don't fall behind.
3. **Subagent report.** Then the subagent writes its report. **Detect and identify this stream in real time** and render it AS a subagent report **while it streams** (today we render it as raw main-agent text and only convert to a "subagent report" after the fact). It appears **below** the search + page-reading results.
4. **Main agent response.** Starts after the subagent report. **Clearly separate** it from the subagent report (today they're duplicated/undistinguished).

WS4 requires WS3 (consume intermediary events) + likely server work to clearly tag the subagent stream vs the main-agent stream (normalize identification).

---

## Parallel-agent assignment (initial)

| Agent | Scope | Repos |
|---|---|---|
| A | WS1 web_search + research_web SERVER emit/save shapes + whether intermediary events stream (the data we're ignoring) | aidream + FE |
| B | WS0 dark/light contrast fix | FE |
| C…N | WS2 per-tool sweep, 1–3 tools each | aidream + FE |
| (after grounding) | WS3 infra + WS4 research rebuild | both |

**Rule for every agent:** real data only; verify both light/dark; handle live AND saved shapes; prefer server normalization; write findings to "Investigation log" below.

---

## Sample acquisition
- Query `cx_tool_call` for recent REAL runs (and confirm the server still emits that shape if >~1 month old).
- Owner is running tools through the admin account to generate fresh real samples.
- Trigger a tool via a test agent when a fresh sample is needed.
- Any demo page is fed ONLY real results, paced to mimic streaming, reflecting reality.

---

## Investigation log
_(agents append findings here: per-tool S/D/C shapes, misalignments, server changes needed)_

### 2026-06-23 — Cross-repo grounding (web_search + research_web). Agent A.

**aidream repo path:** `/Users/armanisadeghi/code/aidream` (confirmed; sibling of cwd). Server backend root `aidream/`; the AI/tool engine is a workspace package at `packages/matrx-ai/`. Tool impls live in `packages/matrx-ai/matrx_ai/tools/implementations/web.py`. Scraper/search engine is a separate package `packages/matrx-scraper/`.

**Headline:** Every claim in the directive is confirmed by code. The structured/enriched data **exists in memory** but is **flattened to one big text blob** before return/save, and the rich intermediary stream events are **either suppressed or never persisted**. Live-vs-saved diverge hard. Most fixes require **server changes** (this is not a pure-FE job), but the FE ingest is genuinely the *innocent* party here.

---

#### A. `web_search` (the standalone "horrible" tool) — S / D / C

- **(S) Server emit/return** — `web_search()` @ `web.py:45`. For each query it calls `search_web_mcp_quick(queries=[q], ...)` @ `packages/matrx-scraper/matrx_scraper/features/quick_search.py:12`. That wrapper calls `wrapped_brave_search()` @ `packages/matrx-scraper/matrx_scraper/search/search.py:155`, which **returns BOTH** `{"original_results": [...full Brave dicts...], "unique_text_summary": "<text>"}` (search.py:202-205) — but `search_web_mcp_quick` **throws away `original_results`** and returns only `{"status":"success","result": unique_text_summary + guidance}` (quick_search.py:34-48). Back in `web_search`, only `results.get("result","")` (the text) is read (web.py:66) and concatenated into `combined_text`, returned as `ToolResult(output=combined_text)` (web.py:90-97). **Final output is a plain text blob. No structured form survives.**
  - **Structured JSON DOES exist upstream**: the full Brave result per query has `web.results[]` / `news.results[]` / `videos.results[]`, each item `{title, url, description, extra_snippets[], age|page_age, ...}` (see `generate_search_text_summary` reading those exact keys, search.py:20-51). This is the enrichment. It is computed (`original_results`) then discarded.
  - **Live intermediary events:** `web_search` only emits `stream.progress("Searching: <q>")` then `stream.progress("Search complete …")` (web.py:57, 88) — **text-only progress, no result payload.** Critically, it calls `search_web_mcp_quick` **without** passing `emitter`/`call_id` (quick_search.py:12-32 doesn't forward them), so the **one structured event that `wrapped_brave_search` CAN emit** — `tool_progress` with `data:{type:"brave_default_page", content:<full Brave response>}` (search.py:186-196) — **is suppressed for the standalone web_search tool.** So standalone `web_search` streams nothing structured and saves nothing structured. That is why it came back "horrible."
- **(D) DB saved** — `output_type:"text"`, `output` = the blob, `output_preview` = `{"chars": N}` (a char count, not a preview), `execution_events` = just the executor's `tool_started`/`tool_completed` (same executor path as research_web — see §B/§E).
- **(C) Client render** — renderer has only a text blob to show → generic text dump.

**JSON-vs-TEXT answer for web_search:** Structured JSON is **available in memory but never returned, never saved, and (for the standalone tool) never streamed.** To render properly we MUST change the server. Two options:
  1. **Minimal (return JSON):** have `web_search` return `ToolResult(output={ "queries":[...], "results":[ {title,url,description,extra_snippets,age,source} ] })` with `output_type:"json"` — i.e. read `wrapped_brave_search()["original_results"]` and reshape, instead of `search_web_mcp_quick`'s text. Requires `search_web_mcp_quick` to also surface `original_results`, or `web_search` to call `wrapped_brave_search` directly. (web.py:45-97 + a small normalizer.)
  2. **Also stream it:** forward `emitter`/`call_id` through `search_web_mcp_quick` → `wrapped_brave_search` so the per-query `brave_default_page` structured event reaches the wire live.

> **Sample caveat:** there are **zero recent `web_search` / `core_web_search` rows** in `cx_tool_call` (last 8 web-tool rows are all `research_web`). web_search is rarely called standalone; research_web dominates. Get a fresh real `web_search` row before building its demo (owner trigger).

---

#### B. `research_web` (THE BIG ONE) — intermediary stream + subagent

- **(S) Server flow** — `research_web()` @ `web.py:210`. Real flow vs the owner's model:
  - **Phase 1 search** (web.py:241-311): fires all queries concurrently via `async_brave_search` (search.py:77). The **full structured Brave result per query is held in `queries_with_results`** (web.py:271) — same enriched `{title,url,description,extra_snippets,age}` items. Emits **`stream.progress("Searched: <q>")`** per query (web.py:273) — **text only; the ~20 enriched results are NOT in the event payload.**
  - **Phase 2 page read** (web.py:301-330): each selected URL → `scrape_urls_from_search_result` → `scrape_url_core` @ `mcp_tool_helpers.py:52`. Per page it emits **ONE** event *before* fetching: `_emit_progress(... "Browsing <url>")` → `{event:"tool_progress", tool_name:"web_research", message:"Browsing <url>", data:{}}` (mcp_tool_helpers.py:26-49, 68-69). **`data` is empty.** The rich page dict it then builds — `{url, title, date_info(Published/Modified), content, char_count, is_good_scrape}` where `content` = `parsed["ai_research_with_images"]` (the **AI review WITH embedded primary image**, mcp_tool_helpers.py:86; field defined orchestrator.py:64 / extraction_rules.py:13) — is **returned to memory but NEVER emitted.** So: no per-page completion event, no AI review on the wire, no image on the wire, no meta on the wire. The owner's "each page streams its AI review + image + meta" **does not exist** — only a pre-fetch "Browsing <url>" ping with empty data.
  - **Phase 3 subagent report** (web.py:404-433): calls `scrape_research_condenser_agent_1(...)` @ `packages/matrx-ai/matrx_ai/agent_runners/research.py`. The subagent runs through the normal executor and is **NOT** given a `SilentEmitter` / `suppress_stream=True`, so **its LLM tokens DO stream to the wire** — but as ordinary assistant chunks (`{"e":"c","t":...}`), **with no marker distinguishing them from the main agent.** Its `.output` string is then spliced into the final text (web.py:426-432).
  - **Phase 4 main agent**: research_web returns; the main agent reads the tool output and responds afterward (not "during").
- **Subagent-vs-main marker on the wire: MISSING.** There is **no `agent_id` / `role` / `is_subagent` / `source` field** on either tool events (`ToolStreamEvent`, streaming.py:23-37 — fields are `event, call_id, tool_name, timestamp, message, show_spinner, data`; **no agent identity**) or on LLM chunk events. The subagent shares the parent emitter via `child_agent_context` with no override. **This is a REQUIRED server change** for WS4: tag subagent-originated events (e.g. add `agent_role:"subagent"|"main"` + a stable `agent_label`/`sub_call_id` to both tool events and chunk events, or wrap the condenser run in a distinguishable sub-stream envelope). Without it the FE cannot detect "this is the subagent report" in real time — exactly the bug WS4 describes.
- **(D) DB saved** — `output_type:"text"`; `output` = one giant `final_text` (web.py:456-461: "Comprehensive research using…" + all-search-results-text + `# Curated Research Results` report + next-steps); `output_preview` = `{"chars": N}`. **`execution_events` = EXACTLY `["tool_started","tool_completed"]`, `data` types `[null]`** (verified across the 3 most-recent rows). **The crux:** `research_web`'s own `stream.progress/step` calls AND the scraper's direct `emitter.send_tool_event(...)` calls **go straight to the wire but are NOT captured in the persisted `execution_events`.** Reason: persistence reads `stream.get_events_for_persistence()` from the **executor's** `ToolStreamManager` (which only logs the started/completed it emits itself, streaming.py:45-48,162-163); the tool's *internal* manager instance and the scraper's *direct* emitter writes are a different object / different path and aren't gathered. So **live has more than saved** — replaying from the DB row is impossible today even for the meager events that did stream.
- **(C) Client render** — today: keywords show (from args), then ~1 min dead wait (FE ignores the `Searched:`/`Browsing` pings — see §C), then the text blob dumps; the subagent tokens render as main-agent text because nothing marks them.

**research_web server changes required (for WS4):**
  1. **Emit structured search results** per query (attach the enriched `results[]` to the `Searched: <q>` event's `data`, or a new `tool_step` "search_results" with `data:{query, results:[…]}`).
  2. **Emit a per-page COMPLETION event** carrying `{url, title, date_info, ai_review (the ai_research_with_images / a clean variant), primary_image, char_count, is_good_scrape}` — i.e. emit AFTER `scrape_url_core` builds the dict, not just the "Browsing" ping. The data already exists in the returned dict; it just needs to be sent.
  3. **Tag the subagent stream** (agent_role/label on tool + chunk events) so the report is identifiable live.
  4. **Persist what streams** — make `execution_events` capture the tool-internal + scraper events (unify the emit path or gather both managers), so live == saved.

---

#### C. Is the FE dropping data the server already sends? **NO — the FE ingest is correct; the server isn't sending the rich data.**

Traced `lib/api/stream-parser.ts` → `features/agents/redux/execution-system/thunks/process-stream.ts` → `active-requests/active-requests.slice.ts`:
- **Parser** (`stream-parser.ts:336-337`) recognizes the unified `tool_event` and fires `onToolEvent` for **every** tool event type (`tool_started|progress|step|result_preview|completed|error|delegated`) — no wire-level filtering. Types in `types/python-generated/stream-events.ts:56-63` + the typed `data` shapes (`ToolProgressData{percent,metadata}`, `ToolStepData{step,metadata}`, etc.) all exist and are wired.
- **Processor** (`process-stream.ts:853-933`) routes every non-`delegated` tool event into `upsertToolLifecycle` with `status` (`"tool_"` stripped), `message`, **`data: toolData.data`** (the full wire `data`), the raw `event`, and appends a `tool_event` timeline entry. Nothing dropped.
- **Slice** (`active-requests.slice.ts` `upsertToolLifecycle`, ~lines 531-578): `events[]` is **APPENDED** (full raw payload, line ~556) — a complete in-order log; `latestData` / `latestMessage` are **last-wins overwrite** (lines ~545-546). So **the data IS retained** in `entry.events` (the renderer can read the whole sequence), it's just that `latestData` alone is last-wins. **The FE already has everything the wire carries.** The reason WS4's middle is empty is that the wire only carries `Searched:`/`Browsing` text pings with empty `data` — there's nothing rich to render. **WS3/WS4 are blocked on SERVER emit, not FE plumbing.** (FE polish still needed: render from `entry.events`, not just `latestData`.)

#### D. Live-vs-saved shape diff + where to normalize

- **LIVE** (`ToolLifecycleEntry`): `{status, latestMessage, latestData, result, resultPreview, events: ToolEventPayload[]}` — rich, ordered, but ephemeral.
- **SAVED** (`cx_tool_call` → `CxToolCallRecord`, observability slice): `{arguments, output:string, output_type, output_preview, output_chars, execution_events}` where for these tools `output`=text blob, `output_preview`=`{chars:N}`, `execution_events`=`[tool_started, tool_completed]` only. The selector `selectMessageInterleavedContent` (`messages.selectors.ts` ~438) joins the saved record to the live entry by `callId`.
- **Diff:** live has the per-step `events[]`; saved has effectively none of them (2 executor bookends) and a flat text `output`. **They are NOT the same shape and saved is strictly poorer.** Replay-from-DB cannot reproduce the live experience.
- **Where to normalize:** **server-side is the right fix** (directive principle #3) — make `research_web`/`web_search` (a) save a **structured `output`** (`output_type:"json"`, e.g. `{queries, results, pages:[{url,title,ai_review,image,meta}], report, subagent:{...}}`) and (b) **persist the full `execution_events`** so the saved row replays identically to live. FE-side, add **one adapter** (e.g. under `features/tool-call-visualization/utils/` or a `tool-call-adapters.ts`) mapping both `ToolLifecycleEntry` (live) and `CxToolCallRecord` (saved) → a single normalized render model the renderers consume, so even pre-fix rows degrade gracefully.

#### E. Real samples (DB, project `txzxabzwovsujtloxrus`, `cx_tool_call`)

- Last 8 success rows for the web tools are **all `research_web`** (none `web_search`/`core_web_search`/`core_web_search_and_read`). Latest **2026-06-17** (≈6 days old — recent enough; shape current).
- Every `research_web` row: `output_type:"text"`, `output` = "Comprehensive research using the following queries: …" big markdown blob (`output_chars` ranged ~1.8k–110k across the 8 rows), `output_preview` = `{"chars": N}`, `execution_events` = `["tool_started","tool_completed"]`, `data` types `[null]`.
- **Action:** owner should trigger a fresh **`web_search`** standalone run to get a real sample for that renderer's demo (none exist to ground it).
