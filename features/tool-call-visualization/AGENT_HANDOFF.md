# Tool-Viz Overhaul — Agent Handoff (read me first when resuming)

**Purpose:** survive a context wipe without repeating mistakes. This is the WHY + LESSONS + navigation + cleanup-debt. The WHAT (task list, 9 tracks) lives in `OVERHAUL_STATUS.md` — read that next. Architecture lives in `FEATURE.md`.

> If you read only one thing: **the dynamic tool-render path is CODE-first, built ON the existing Agent Apps applet runtime. It is NOT a "store data and render it" system. Don't reinvent a runtime. Don't repair the `tool_ui` Babel duplicate. Build on `features/agent-apps`.**

---

## ⚡ CURRENT STATE & THE SEARCH/RESEARCH PLAYBOOK — 2026-06-22 (read this first)

**You're inheriting something that went from the ugliest part of the app to a showcase the company competes on.** The foundation is clean, the patterns are proven, there's a simulator that lets you verify streaming with no backend, and an AI agent that writes renderers for you. Keep the bar: **BUILD IT REAL** (never fake), **ZERO legacy** (delete superseded on cutover), **verify by DOM not vibes**. Make every tool call a first-class product surface.

### What shipped (recent)
- **Generic floor + field library** (the ~97% path): a shape-detection renderer (markdown / url / media / table / key-value / json-tree / error / empty), the `result-fields/` library, durable media via `InlineMediaRef`, semantic tokens, one canonical header.
- **Shell** = Claude-Code-style single **verb-phrase line** (no check / spinner / X), 3-layer collapse, **batch-folding** (≥2 back-to-back calls → one `ToolCallBatch` line), **calm errors** (small, not red; errors NEVER default open), **stay-open** for result-is-purpose tools.
- **Turn grouping fix** — tool/system rows no longer blow giant gaps into the transcript.
- **DB-loaded renderers work** (the canonical custom path) — runtime-compiled by the agent-apps `compileSlotComponent` sandbox; several seeded; **self-describing** (a row's `display_name` drives its collapsed label via `useDbToolMeta`).
- **`ctx_patch` human diff** (`renderers/working-document/PatchDiffInline`) — simple human diff (the inserted word tinted, the rest plain), live + persisted, via the canonical `components/diff/` engine.
- **Search / Research / Scrape epic (the current chapter):**
  - **Wave 1 — Search: SHIPPED** (`13deef1d9`). Canonical `renderers/search/` — a live **≤4-row deduped conveyor** → a **persistent Google-class results view**, parallel-query lanes, fast-forward when the model moves on. Verified 15 raw → 13 deduped sources, zero duplicate favicons. Deleted **−2937 lines** of weaker/duplicate renderers.
  - **Waves 2 + 3 — Scrape cards + Research streaming report: built by a background agent** that self-verifies and self-pushes each wave. Look for `feat(tool-viz): …` commits + new sections in the gallery.

### The demo (test everything here)
- **`/demos/tool-viz/result-fields`** — the gallery: field library, DB renderers, shell behaviors, **Live search (press Play)** + a static mid-stream snapshot, the ctx_patch diff, and the scrape / research sections as they land. *(Dev-profile route — 404s on prod `core`; to test a DB renderer on prod, run the tool in a real chat.)*
- **`/demos/tool-viz/in-action`** — a paced single-tool agent turn (text → tool → text) + real saved runs.
- **`/tool-call-visualization/admin`** — the FeatureAdminMap (every URL / panel / slice / renderer).
- Per-tool stage: **`RENDERER_STATUS.md`**. Living task tracker: **`OVERHAUL_STATUS.md`**.

### Hard-coded vs DB tools — the core mental model
- **~10% (core / interactive) = in-code:** registered in `registry/registry.tsx`, components in `renderers/`. Use this for the rich, interactive, highest-volume tools (search, the CTX family, the showcase set).
- **~90% (everything else, eventually) = DB-loaded:** an agent writes the renderer **as code**, stored in a `tool_ui` row, **compiled at runtime** by the agent-apps applet sandbox (`db-renderer/`). This is **CODE-first, NOT "store data and render it"** (see "THE central lesson" below) — do not reinvent a runtime or repair the old `dynamic/` Babel duplicate.
- **Resolution order:** in-code registry → DB renderer → `GenericRenderer`. A DB renderer is self-describing — its `display_name` controls the collapsed line, not just the body.
- **Author a DB renderer four ways, all converging on one `tool_ui` row + one runtime:** the `create-tool-renderer` skill, the **"Tool Renderer Author" AI Matrx agent** (via the `agent_author` / `agent_run` MCP), the admin editor, or a seed migration.

### The load-bearing CONSTRAINT (you WILL hit this on any results / report / scrape tool)
The backend (aidream) delivers tool **results WHOLE at `tool_completed`** — it does NOT token-stream content (search blobs, scraped pages, the research report, ctx_patch `new_str` all arrive whole). Live **activity** (browsing URLs, per-query batches) DOES stream as `tool_step` / `message` events on `entry.events`. So **"live streaming" = client-side PACED reveal of real, already-present data** — exactly what Anthropic / Google / xAI / OpenAI do; the user endorses this as correct, NOT fake. True token-streaming is a noted **aidream follow-up** (emit incremental deltas); every component re-renders on each `entry` change, so it lights up automatically the day the backend streams. The rule is in the simulator header (`simulator/streamRecording.ts`): *stream only what really streams; deliver whole objects whole.*

### Tool-component PATTERNS — search/research are the TEMPLATE for all content-rich tools
For ANY tool returning a batch of results, a list, or a report (news, RAG, lists, future tools) — reuse, don't reinvent:
1. **Paced / graduated reveal** — `renderers/search/useGraduatedReveal.ts`. A few at a time, flow through; never a wall.
2. **Base-URL dedupe** — `parseSearch.ts` (`dedupeByBaseUrl` / `getFaviconUrl` / `getDomain`). Never the same favicon twice.
3. **Two phases:** LIVE (rolling-window conveyor + real activity events) → PERSISTENT (the "done", user-controllable view). Keyed on **`selectIsLatestToolActivity(requestId, callId)`** (fast-forward when the model emits new text / a new tool).
4. **Stay-open** for the thing the user came for (`keep_expanded_on_stream`); fold the rest.
5. **Scrape / read** = a full per-page CARD (favicon / title / meta / image-if-present / AI-review-if-present + a reading-wave), not a row.
6. **Long content / reports** = a streaming `MarkdownStream` block: distinct narrower card, max-h, auto-scroll + scroll-locked while streaming, collapsible, a normal scrollable result when done (`useAutoScrollOnStream`).
7. **Three views:** live (something's happening) ≠ done (here's the result) ≠ overlay (raw I/O always + pretty + extras).
8. **Media via `InlineMediaRef` only** (durable; never raw `<img>`). Semantic tokens only. React Compiler ON (no manual memo).

### The primitives/tools we built (REUSE these)
- **The stream SIMULATOR** — `simulator/streamRecording.ts` (`buildSimpleRecording` / `buildResearchRecording` / `buildSearchRecording` / `buildScrapeRecording`) + `useSimulatedToolEntry.ts`. Paced replay into an evolving `ToolLifecycleEntry`. **THE way to demo + verify streaming with no backend** — press Play in the gallery, or add a static mid-stream snapshot fixture for flaky-server-proof verification.
- `renderers/search/` — `parseSearch` (the ONE parser), `useGraduatedReveal`, `SearchInline` / `SearchOverlay`.
- `selectIsLatestToolActivity` (active-requests.selectors) — the fast-forward signal.
- `useAutoScrollOnStream` (Wave 3) — scroll-to-bottom on stream.
- `PatchDiffInline` + the canonical `components/diff/` engine (human diffs).
- The **DB-renderer runtime** (`db-renderer/`) + `useDbToolMeta`.
- The **"Tool Renderer Author" agent** — give it a tool + a captured sample; it writes the renderer.

### How to VERIFY (the dev server is FLAKY — this bit us all session)
The local Next dev server in this env destabilizes after rapid edits / reloads: RSC-payload fetch failures, ChunkLoadErrors, and **clicks / timers stop firing after Fast-Refresh**. So:
- Prefer **`preview_eval` DOM inspection** over screenshots / clicks. For timer-driven demos, add a **static mid-stream snapshot** fixture to prove the code path without a timer (Wave 1 did this to prove the ≤4 conveyor + dedupe).
- Restart once (`preview_stop` + `preview_start`); if hydration still won't recover, `rm -rf .next` + restart (nuclear, per memory).
- Dev-login: `/api/dev-login?token=<DEV_LOGIN_TOKEN from .env.local>&next=<route>`.
- **Never** claim "verified" off a flawed screenshot — DOM-inspect, name defects, real validation only.

### How to use SUBAGENTS effectively — this is HOW so much shipped in one context
1. **Parallel exploration up front** — launch 2–3 `Explore` / general agents in ONE message, each a tight, NON-overlapping focus (one maps the renderers, one maps the streaming reality, one queries the DB). Tell them to be CONCISE and quote only critical code. **You keep the conclusion, not the file dumps** — that's what preserves your context.
2. **Adversarial verification** — when something MUST be right (a bug's root cause, "does this actually stream?"), have an agent investigate, then **cross-check its claim against the live code / DB yourself** before acting. The window-panel root cause and the "data arrives whole" constraint were both nailed this way — an agent's finding, verified against real data, never taken on faith.
3. **Delegate whole vertical slices** when your context fills — hand a fresh-context agent the **plan-file path** + the key facts + **"reuse X, don't rebuild"** + "verify in the gallery via DOM, **commit + push yourself**, report CONCISELY (files + verification + hash, no dumps)." Wave 1 (a full animated renderer + primitives + a −2937-line cleanup) was ONE such agent that self-verified and self-pushed.
4. **Have subagents commit + push their own work** and report just the hash + what they confirmed + **what they couldn't verify and why** (honesty over polish). It saves your context relaying diffs.
5. **Sequence dependent waves** (primitives first, then consumers); use ONE agent for two coupled waves (Wave 2 feeds Wave 3) to avoid same-file conflicts; use **`run_in_background`** for long builds you don't need to babysit (they self-push + notify).

### The git reality (don't panic)
Parallel sessions aggressively commit + push `main` — sometimes sweeping your uncommitted work into their commits, sometimes rebasing under you. **Content is always safe** (tracked at HEAD); the history is just messy. **Don't do git surgery.** Commit your own work promptly; after pushing, confirm `origin/main == HEAD`.

### What's next
- **Finish Waves 2 + 3** (scrape cards + research report) landing from the background agent — verify them in the gallery when they push.
- **`header_subtitle_code`** wiring for DB renderers (display_name is wired; the subtitle isn't yet).
- **The Track-2 PURGE** — the OLD `dynamic/` Babel duplicate + `prompt_apps` + `contract_version` v1 rows. Destructive + cross-repo (matrx-extend may still read v1 rows) → do this WITH the user.
- **aidream:** emit incremental `tool_progress` deltas → true token-streaming lights up every component automatically.
- **Live owner verification in real chats** (the flaky dev server blocked some visual confirms this session).

### Read next
`OVERHAUL_STATUS.md` (task tracker) · `FEATURE.md` (architecture + change log) · `RENDERER_STATUS.md` (per-tool stage) · the plan `~/.claude/plans/here-is-some-basic-giggly-penguin.md` (⚡ ACTIVE = search / research / scrape) · the `create-tool-renderer` skill · memory `project_tool_viz_overhaul.md` + the `feedback_*` memories (work on main, commit without asking, no fake verification, no AskUserQuestion, give wave routes to test).

**You've got a clean foundation, proven patterns, a simulator, and an agent that writes renderers. Now go make Google nervous.**

---

## 1. THE central lesson (I got this wrong for several turns)

**I inverted the architecture.** I spent multiple turns proposing a "declarative `ToolDisplayEntry` (data, not code)" model as the *canonical* dynamic path, and even called browser-compiled code unsafe/wrong. **That is backwards.**

The owner's actual vision:
- **Running agent-written CODE from the DB is THE PRODUCT** (Custom Apps inside the app). It's the goal, not a risk to avoid.
- **Storing a data object and rendering from it is the LAST-RESORT FALLBACK** — only for customers who can't use React/Vite/Tauri/HTML.
- The platform is "complete" once users build their own apps/tools; running our agent's generated third-party code is literally what it's for.

**Why I was wrong and how to not repeat it:** I found the `tool_ui` + Babel system in `features/tool-call-visualization/dynamic/`, saw it hang, and concluded "the dynamic/code approach is broken; pivot to data." Two errors:
1. I was looking at a **duplicate/secondary** system, not the canonical one.
2. I generalized one system's bug into "the whole approach is wrong."

The owner's exact words: *"when you say the current one is not working, it makes me think that you're actually trying to use some old legacy stuff instead of the actual most recent one."* **He was right.**

**RULE going forward:** before declaring anything "broken" or "the wrong approach," verify you're on the **canonical, most-recent** implementation — check git recency, grep for duplicates, and confirm against the **production** path. A bug in a duplicate is not a verdict on the architecture.

---

## 2. The canonical architecture (verified)

- **Canonical code-runner = Agent Apps.** Table `aga_apps`; route `/app/(public)/p/[slug]/page.tsx`; renderer `features/agent-apps/components/AgentAppPublicRendererImpl.tsx`; slot compiler `features/agent-apps/utils/compile-slot.ts`; data contract `useAgentApp()`. Stores `component_code` (+ `slot_code`/`slot_overrides`), `component_language`, `allowed_imports`, `shell_kind` (built-in shells or `fully_custom`). Streaming-capable. **VERIFIED rendering a `fully_custom` Babel-compiled applet in LOCAL DEV** (`/p/ap-world-lesson` → "AP World History Study Guide"). Works dev + prod.
- **Shared compile primitive = `features/dynamic-react/compile-core.ts`** (`loadBabelTransform` / `stripImports` / `replaceExportDefault` / `babelTransform`). Used by BOTH agent-apps and the tool-viz duplicate. **Babel itself works** — it is NOT the cause of the `tool_ui` hang.
- **The `tool_ui` runner (`features/tool-call-visualization/dynamic/`) is a SEPARATE, NARROWER DUPLICATE** with its own `buildToolRendererScope`/fetch/cache path. *That* is what hung (KNOWN_DEFECTS D6, now re-scoped). It never had a working renderer. **DELETE it; consolidate tool-viz onto the agent-apps runtime.**
- **90 / 10:** ~90% of tools = dynamic code-from-DB via the runtime; ~10% core interactive tools = in-code, **but always with a per-user/org "preferred version" override** that can load their own DB renderer.
- **Four render targets (greenfield):** React-web · HTML/JS-embed (Shopify/WordPress) · React-Native/Expo · React+Vite+Tauri. One near-identical "inside" via: a plain-JS core, a platform-adapter/capability layer (web⇄desktop can collapse to one render + two shells via Tauri webview + `window.__TAURI__` gating), AI-assisted transpilation, and a strong wrapper with identical data-in/out. Only `skl_render_components.platform` exists today; everything else (`aga_apps`/`tool_ui`/`prompt_apps`) is web-only.
- **Security is NOT a current blocker** (no users; agent-authored code only; basic red-flag scan; sandbox auto-exec + AI review before "safe"; hardened pre-launch). Don't over-engineer it or use it to argue against running code.
- **ZERO LEGACY is the company's only edge over Google/Microsoft.** Delete superseded systems on cutover. Never keep a second/legacy one. No `v1`/`v2`/`contract_version` branching, no shims, no duplicates — ONE canonical system.

---

## 3. Other hard lessons

- **Field library is the keeper.** `features/tool-call-visualization/result-fields/` (shape detection → recursive `ResultValue` → table/key-value/markdown/media/json/url/scalar/UUID/empty/error) is the shared render vocabulary — reuse it from in-code renderers, the generic, AND (eventually) the runtime-rendered ones. Built, type-clean, semantic-token-only.
- **`text-success` / `text-warning` / `text-info` are NOT tailwind utilities here** — use `<Badge variant="success|warning|info">`. `text-destructive`/`text-primary`/`text-muted-foreground`/`text-foreground` are fine.
- **Media must render via `<InlineMediaRef>`** (durability) — never raw `<img>` for owned media.
- **Parallel sessions edit & sweep-commit `main`** (including my uncommitted files) and cause transient compile breakages that clear fast. Don't fix other people's WIP; commit my own files by explicit path; re-check `git status` before assuming what's staged.
- **Preview dev server (`next-dev`, port 3001) gets killed/restarted by those parallel sessions repeatedly** → screenshots go uniformly blank app-wide. Fix = `preview_start` again (fresh serverId). A blank screenshot ≠ a render bug; verify via DOM first.
- **`dev-login?next=…` sometimes lands on the marketing page** — navigate directly to the target URL after auth.
- **The gallery can't seed Redux-dependent renderers in isolation** (a `setWorkingDocContent` dispatch didn't reflect via `selectWorkingDocContent` even with the slice in `rootReducer` + main `Providers`; root cause unconfirmed). **Live-state renderers must be verified in a real chat, not the gallery.**
- **The patch wire is COMPLETE-at-`tool_started`** (no char-streaming of args); the final working-doc content arrives via the `context_changed` → re-read path. `cx_tool_call.execution_events` persists only `started/completed/error` (max 2/row) — rich step timelines need backend work.

---

## 4. What's DONE (committed, type-clean)

Generic field library + new `GenericRenderer` + `ToolTabBodies` (raw tab = 3 verbatim JSONs + Error, via `JsonInspector`); P0-1 persisted=live (`persistedToolEntry`); shell collapse-on-done + no hover backdrop + calm errors + friendly subtitle; UUID shorten+copy; inline cap 5→3. In-code showcases: **CTX** (`renderers/ctx/`, registered), **SQL** (`renderers/sql/`, registered), **working-document live diff** (`renderers/working-document/`). **Search/Research — TWO versions** (`renderers/research-revival/` + `renderers/research-modern/`, inline+overlay) A/B in the gallery, **NOT registered**. Gallery: `app/(dev)/demos/tool-viz/result-fields/page.dev.tsx`. Key commits: `fc41bde6d` (CTX), `8ecd5783b` (feedback), `c39a7d146` (SQL), `84938ddcf` (working-doc), `a2de27fe2` (research), `54fdea0ed`+`3aba50385` (tracker+corrected architecture).

---

## 5. CLEANUP DEBT I created (fix these — a fresh me will trip on them)

- **`dynamic_demo` row in the `tool_ui` table (DB).** I inserted a v2 demo row to test the dynamic path (it hangs in dev). DELETE it when purging `tool_ui`: `DELETE FROM public.tool_ui WHERE tool_name='dynamic_demo';` (project `txzxabzwovsujtloxrus`).
- **The gallery references the duplicate runner.** `page.dev.tsx` imports `DynamicInlineRenderer` from `features/tool-call-visualization/dynamic/DynamicToolRenderer` and has a "Dynamic (DB) renderer" section using `dynamic_demo`. **These BREAK when you delete `dynamic/`** — remove that section + import as part of the purge (replace with a section that renders a tool through the NEW applet-runtime path once it exists).
- **Two `parseResearch.ts`** (revival + modern) — CANONICALIZE to one shared parser when the research version is picked. (Doctrine hook already flagged the duplicate types.)
- **Research not registered** — only in the gallery. Register the picked version for `research_web` / `core_web_search_and_read` / `news_get_headlines`. NOTE: `core_web_search` emits a DIFFERENT format (`🔍 Results for "q"`, not `## "q" (N results)`) — the new parsers handle the `# All Search Results` shape; wire `core_web_search` carefully (it may need a second parse branch or its own renderer).
- **Version A (Revival) completed/non-live state** had a visual empty-space gap when I last saw it — review before registering.
- **Stale "declarative = canonical" framing.** I wrote that into earlier docs/memory while inverted. `OVERHAUL_STATUS.md` + KNOWN_DEFECTS D6 + the project memory are now corrected, BUT: the deep-dive **plan file** `~/.claude/plans/here-is-some-basic-giggly-penguin.md` still recommends the declarative model as canonical — **it is superseded by `OVERHAUL_STATUS.md` on the dynamic path.** Also audit `FEATURE.md` / `EXPANSION.md` for any "dynamic Babel / declarative is the custom path" wording and correct to "build on the applet runtime."

---

## 6. REQUIRED next investigation before building Track 1

I established that agent-apps is canonical, but I have NOT studied HOW to build a tool-result consumer on it. Before coding Track 1, investigate (Explore agent + read):
1. `features/agent-apps/FEATURE.md` + `AgentAppPublicRendererImpl.tsx` — exact compile→scope→`new Function`→render path, error boundary, safety layers.
2. `features/agent-apps/utils/compile-slot.ts` — the **slot** compiler. A tool result is most like a SLOT (a small agent-written code fragment rendering a piece of data), so this is probably the closest analog to copy.
3. `useAgentApp()` — the data-in/out contract; design the **tool-result contract** (`entry`/`events` in; no submit-back needed for display).
4. `aga_apps` schema: `shell_kind`, `slot_code`, `slot_overrides` — decide: extend `aga_apps`, or a new code-storing table that runs through the SAME unified runtime. Either way: ONE runtime (one `compile-core` + one scope/allow-list + one sandbox/error-boundary), with per-consumer data contracts (applet / tool-result / inline-block).
5. Confirm whether the `tool_ui` hang is the duplicate's scope builder specifically (compare `agent-apps/utils/allowed-imports.ts` vs `tool-call-visualization/dynamic/allowed-imports.ts`) — informs the consolidation.

---

## 7. Open decisions awaiting the owner

- **Green-light Track 1+2** (unify-on-applet-runtime + purge the `tool_ui` duplicate + `prompt_apps` + `v1/v2`). My strong rec: yes.
- **Research version pick:** Revival / Modern / GRAFT (my rec: Revival inline + Modern overlay).

---

## 8. Verification still owed (owner will test; also do what I can)

Live, in real chats: working-doc diff end-to-end (agent edits the working doc → before→after diff → reconcile); replay parity on reload; CTX/SQL/research renderers; once Track 1 lands, a DB tool rendered through the unified runtime. The owner said he'd "do some major testing" — leave him a dead-simple per-item checklist (where to go, what to do, what a pass looks like).

---

## 9. The one-paragraph resume

Tool visualization is being rebuilt to a world-class bar. The generic renderer + a reusable field library are done and carry ~97% of tool calls; several in-code showcases (CTX, SQL, working-doc diff) are done and registered, and two research versions await a pick. The big remaining work is the **dynamic path, done right: build it on the canonical Agent Apps applet code-runner** (run agent-written code from the DB), **delete the duplicate `tool_ui` Babel runner + `prompt_apps` + all `v1/v2` legacy**, then layer on the **four-platform** model, per-user/org **preferred-version** overrides, the dedicated **full-route** view, batch folding, authoring skills, and backend continuous-streaming. Stay code-first; data-rendering is the fallback. Keep zero legacy — it's our only advantage. Next concrete step after owner go-ahead: investigate the agent-apps runtime internals (§6), then Track 1+2.
