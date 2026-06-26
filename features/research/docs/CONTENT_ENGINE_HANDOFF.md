# Research Content Engine — Build Handoff

> **For the next agent.** Living status of the "research → content engine" build (the vision in [`VISION_AND_GAPS.md`](./VISION_AND_GAPS.md), plan at `~/.claude/plans/mutable-gathering-oasis.md`). Last updated 2026-06-16 by the build agent. Read this first, then the plan's PROGRESS LOG.

---

## TL;DR — where we are

The **Output Engine is built and verified end-to-end** for all four formats. A research topic with a report can now produce a **podcast, blog, slide deck, and SEO package** from the `/research/topics/[id]/outputs` Studio — each a real generation, persisted, rendered. Plus two correctness fixes (agent version-duplication, report-loading). The deeper layers (citations-from-spine, distribution/WordPress, the workflow-native pipeline, source expansion) are **designed but not yet built** — they're the next agent's job.

---

## ✅ Done & verified (committed on `main`)

| Piece | What | Verified |
|---|---|---|
| **Wave 0 foundations** | `tone_profile` ("Voice & Lens") + `outputs` JSONB on `rs_topic` (migration `0014`, applied+ledgered); ConsolidationView renders real output; Suggest-tags UI; `XAI_API_KEY` in aidream env_validation; optional auto-tag/auto-consolidate passes in `run_initial_pass` | FE live; **aidream `084ec9a1` deploy-pending** for suggest-tags/auto-tag/XAI |
| **Podcast output** | `/research/topics/[id]/outputs` Studio reuses `usePodcastRun` → live `/podcast/generate` (FULL_CONTENT = report) → `pc_episodes` | ✅ real episode `e9304180` with audio |
| **Blog output** | `content_to_blog` agent (`d5a17f12`) via `useRunAgent` → cited markdown → `ContentActionBar` (WordPress copy/export) | ✅ real 5.3KB cited article |
| **Slides output** | `research_to_slides` agent (`8f0bbfc2`) → JSON deck → `Slideshow` renderer inline | ✅ real 10-slide deck "The Mediterranean Diet" rendered + persisted |
| **SEO output** | `research_to_seo` agent (`de3e5a62`) → JSON (title/meta/slug/keywords/schema.org/OG/FAQ) → `SeoView` card | ✅ real package: 8 keywords, 4 FAQ, JSON-LD |
| **Agent Copy & Update fix** | `agx_duplicate_version(p_version_id, p_as_system)` RPC — forks the PINNED `agx_version` the server runs, not the (drift/corruption-prone) master; FE carries pinned version_ids (`SYSTEM_AGENT_VERSION_UUIDS`); real-error surfacing | ✅ copy matches version md5 exactly |
| **Report-loading fix** | OutputsStudio loads the report via a self-contained client fetch (`getDocument`/`getSynthesis` in a `useEffect`) + a loading state, instead of the shared query hook that got stuck | ✅ post-restart |

**Demo topic:** "Mediterranean diet research" `08870b47-1c29-497a-be0f-2fe1904fde54` (admin-owned) now has all four outputs generated. A representative report was seeded on it for testing (disclosed to owner) — it's real, accurate content.

---

## 🔑 The pattern that unlocks everything (reuse it)

**Output generators are saved agents run live via `POST /ai/agents/{agent_id}` — NO aidream deploy needed.**
- FE primitive: `useRunAgent` (`features/agents/run/useRunAgent.ts`) → `run({agentId, userInput, onChunk})` returns accumulated markdown (or, for `output_schema` agents, `completion.result.output`).
- Agents are created as **data rows** in `agx_agent`. The proven recipe: `INSERT ... SELECT` from a known-good runnable agent (the blog agent `d5a17f12`, a Gemini writer, model `56363cb1`), overriding `name` + `messages` (a single `{role:"system", content:"…"}`). `is_public=true`, `agent_type='builtin'`. The auto-version trigger creates v1.
- Studio cards live in `features/research/components/outputs/OutputsStudio.tsx`; the outputs **index** model is `outputs.ts` (`rs_topic.outputs` JSONB — refs/light content only; heavy assets belong in domain tables).

So the next generators (a fact-checker, a `gen_visuals`, etc.) follow the same 30-minute pattern: create the agent row, add a card, verify live.

---

## 🗺️ Remaining roadmap (next agent — priority order)

**1. Citation / quality layer (the owner's #1 "hard part" — the moat).** Today blog/slides/SEO cite best-effort from the report prose. Make it real:
   - Build the **structured synthesis spine** (§10.0 of VISION) — a `spine_extractor` agent (live-runnable, no deploy) that turns the report + source list into `{sections, claims[{text, source_refs}], stats, entities, timeline}` persisted to `rs_synthesis.result_structured`. Feed the spine (claims + source_refs) to every generator so citations map to real `rs_content`/`rs_source` ids.
   - Add a **`citation_reviewer` / `fact_checker`** agent (model on `internal_agents/ner_suggestion_reviewer.md`'s over-propose→judge pattern) that verifies every output claim traces to a source and flags fabrications. Owner said: "tune generator instructions + add reviewer/fact-checker layers."

**2. Distribution / publish.** Make outputs public:
   - **Blog → WordPress**: greenfield WordPress REST publish (application-password auth) + reuse `markdownToWordPressHTML` (`features/html-pages/utils/`). Also generalize `pc_articles` (nullable `topic_id`) to reuse the live `/podcast/[slug]/blog` public page.
   - **Slides → public web slideshow**: the `Slideshow` card already has a "Canvas" button → wire research decks to a canvas item → `/canvas/shared/[token]` (public route exists).
   - **Podcast → RSS**: `/podcast/[slug]/feed.xml` already exists (Apple/Spotify).

**3. Deploy-gated backend (the workflow-native North Star).** Owner: "the workflow system is complete when it can regenerate this, better." Build in aidream (commit, owner deploys):
   - `research_studio_v1.py` matrx-graph DAG: `synth → [gen_document ‖ gen_podcast ‖ gen_slides ‖ gen_seo ‖ gen_blog ‖ gen_visuals] → fact_check → finalize` — model on `study_pack_v1.py` (channel for the spine, fan-in, partial-failure isolation).
   - **Source expansion** (§5/§13): `SearchSurface` + `SourceAdapter` registries; YouTube via **Gemini URL ingestion** (built, unused — `media_config.py:1091`), X via Grok `x_search`, plus free no-auth surfaces (Hacker News Algolia, arXiv, GitHub — testable immediately).

**4. Polish.** Per-asset status/regenerate/version in the Studio (`OutputAsset.status` exists); `gen_visuals` node (charts/tables/timelines from the spine); Monitor Mode (`research_monitor_v1` delta runs); `/research/admin` FeatureAdminMap.

---

## ⚠️ Environment gotchas (READ — these cost hours)

- **Highly concurrent repo.** Multiple agent sessions commit the **shared working tree** on `main` simultaneously; git history is rewritten often; your uncommitted edits may be swept into another session's commit. Don't fight it — verify your code is present (`grep` the file), don't `git reset`/rebase, stage narrowly. There were ~195 modified files in the tree from parallel work.
- **An in-progress `hierarchySlice` refactor** (another session, uncommitted) removed `isPersonalPseudoOrgId`, breaking 8 named-import consumers (`lib/api/call-api.ts`, `features/projects/*`, etc.). This is **not on origin/main** and **not ours** — don't fix it unless it lands broken on main.
- **Turbopack HMR corrupts after many rapid edits** — symptom: a page hook gets stuck loading / "module factory not available". A browser reload does NOT fix it; **restart the preview/dev server** (this exact bug ate ~10 verification cycles on the report-loading check).
- **Preview `document.body.innerText` returns 0** in the eval context (needs layout/focus) — use **`textContent`** for text assertions, and **screenshots** for visual truth.
- **MCP tools (Supabase, Preview) disconnect** intermittently across session boundaries; they reconnect. Supabase MCP project is always `txzxabzwovsujtloxrus`.
- **Supabase RPCs that use `auth.uid()`** (e.g. `agx_duplicate_version`) can't be called via the MCP (service role → `auth.uid()` is NULL); verify them through the live UI, not MCP.
- **dev-login:** `http://localhost:<port>/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/…` (token in `.env.local`). Fresh server = fresh session, re-login.

---

## Key files & IDs

- Studio UI: `features/research/components/outputs/OutputsStudio.tsx` · index model: `…/outputs/outputs.ts`
- Generator agents (agx_agent ids): blog `d5a17f12-c06e-4b07-8222-3fd1dfbdd85b` · slides `8f0bbfc2-85d9-4913-8cea-b09a50c62be6` · seo `de3e5a62-559b-406a-a6bd-c6064b4ba3fe`
- Version-dup: `migrations/agx_duplicate_version.sql` · FE pinned versions: `features/research/components/agents/constants.ts` (`SYSTEM_AGENT_VERSION_UUIDS`) · aidream source of truth: `research/agents.py` (`declare_pinned_agent`)
- Pinned research-agent versions (server runs these, NOT masters): page_summary `17bceb8d…`, keyword_synthesis `fd13758e…`, research_report `faf63fa3…`, updater `bf9c2101…`, consolidation `dbe2f6d1…` (master corrupted), auto_tagger `550b8d0e…` (master corrupted), document_assembly `92cdbe93…`, suggest `f7555ac0…`
- aidream Wave-0 commit (deploy-pending verify): `084ec9a1`

---

## Adversarial review findings (tracked in the feedback system)

A skeptical code review of the built work surfaced these (all submitted to the feedback tracker, status `new`). Note: OutputsStudio is being **concurrently rewritten by another session** (now 1306 lines, with a row-locked `rs_topic_append_output` RPC that already fixed the client read-modify-write race) — fix these in coordination, don't blind-edit.

- **🔴 P1 — Double-click → double (billed) generation** (`OutputsStudio.tsx` Generate buttons ~452/785/983/1117). Buttons gate only on `disabled={!hasReport}`, not `running`; a fast double-click fires two concurrent agent runs (two bills, two assets). Fix: `disabled={!hasReport || running}` per button + a synchronous in-flight ref guard. *(feedback `4830a194`)*
- **🟡 P2 — Slideshow has no error boundary** — malformed agent JSON can throw in render and blank the card. Wrap `<Slideshow>` in a boundary + validate slide shape. *(feedback `e6073e78`)*
- **🟢 persistOutput** discards the append RPC's returned merged outputs + doesn't optimistically update the list; the saved asset only appears after `refresh()` round-trips. *(feedback `29d1ba6a`)*
- **Clean:** no XSS (SEO/slide fields are React text nodes / `JSON.stringify` in `<pre>`); the `agx_duplicate_version` access model + column-copy verified correct.

## Creative expansion ideas (tracked)

Highest-leverage, in order: **(1) the citation-lineage spine** (the moat + keystone — feedback `07e7e0bd`); (2) reusable Topic Templates / "Engine Recipes" + one-click derivative formats (X thread / newsletter / short-script / carousel — each ~30 min per the agent-row+card pattern — feedback `b84930ff`); (3) Monitor Mode scheduled delta runs; (4) multi-seat collaboration on the curation gate; (5) RAG-ingest the cited spine so org agents can query "what did our research say about X, with sources."

## Open decisions for the owner

1. **Access model for `agx_duplicate_version`**: it currently allows forking any **builtin** system agent (no public-directory exposure). Tighten to research-only if undesired.
2. **Blog storage**: outputs JSONB inlines blog markdown for the MVP — move to `pc_articles` (+ public page + WordPress) in distribution.
3. The seeded demo report + 4 generated outputs on the Mediterranean topic — keep as a demo or delete.
