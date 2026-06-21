# Tool-Viz Overhaul — Agent Handoff (read me first when resuming)

**Purpose:** survive a context wipe without repeating mistakes. This is the WHY + LESSONS + navigation + cleanup-debt. The WHAT (task list, 9 tracks) lives in `OVERHAUL_STATUS.md` — read that next. Architecture lives in `FEATURE.md`.

> If you read only one thing: **the dynamic tool-render path is CODE-first, built ON the existing Agent Apps applet runtime. It is NOT a "store data and render it" system. Don't reinvent a runtime. Don't repair the `tool_ui` Babel duplicate. Build on `features/agent-apps`.**

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
