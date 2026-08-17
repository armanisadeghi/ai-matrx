# Masterwork — Distillation → Rulebook → Build → a Masterwork

> **🚨 VOCABULARY FIRST — the lexicon is the only authority on names:**
> [`common-docs/systems/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md).
> Arman ruled every open term 2026-08-16. **The code has NOT been swept** — it still says
> pack / desk / compile / backtest everywhere. Part 3 of this doc is that work order.
> **Write the new words in anything new**, and never adopt the old ones.

**The spine, in one line:**
> an **Expert** → **Distillation** (many **Approaches**) → a **Rulebook** → **Build** →
> a **Masterwork** (**draft** → **released**), proved by an **Audition**, run by an
> **Operator** as an **Encore**.

**This is core Masterwork, not a sibling system** (Arman, 2026-08-16). It drifted out and got
built outside the system it belongs to *because of vocabulary*. Everything below is one
program.

| Old word (still in code) | Canonical |
|---|---|
| pack · expertise pack | **Rulebook** |
| desk (Copy Desk, Edit Desk) | **a Masterwork** |
| compile · compiler | **Build** |
| backtest | **Audition** |
| Expertise Interviewer | **Scout** |
| lane · mode · Method (the category word) | **Approach** |
| the expert-distillation system (program name) | **Masterwork** |

---

## Part 0 — Arman's vision (2026-08-09, in his words — do not lose this)

1. **UI-first is the reality test.** "Nothing is real unless there's a user-friendly UI that a
   normal user can use." Every capability needs a home in the UI. Steps are fine; no home is not.
2. **The system is for HUMANS first.** The goal is NOT auto-distilling books. It is a world-best
   Expert building their system **step by step, however they want**. Ingestion is the
   accelerant, not the product. The dream: *"just talk for an hour, upload the audio, and we'll
   do the rest."*
3. **chunk → extract → table → reference-back is the ingestion play.** Reuse the existing
   document pipeline; never invent a parallel one. Every rule links back to its source pages.
4. **The honest-evaluation caveat.** Hopkins and Strunk are famous — the models already know
   them, so results flatter us. The REAL test is expertise that is unique, non-obvious, even
   **contrary to what AI does by default**. The benchmark is Arman's own SEO method, judged by
   whether HE agrees with the output. **This is still the gate. It has not been run.**
5. **Agents are legitimate UI.** If a step needs what a coding agent did by hand, build a
   platform agent that does it for the user.

**The correction that defines this project (2026-08-15):** the original failure was an agent
hand-rolling Rulebooks instead of building THE SYSTEM that distills. The product is the
PROCESS — a button, a guided intake, an interviewer that works with whatever the human gives,
ingestion when there's a document, imitation when there's no human at all.

---

## Part 1 — STATUS: the loop is LIVE end-to-end

Every item below is browser- or production-verified. Compressed deliberately — read Part 3
for what's left.

**The loop:** guided intake (4 questions + the ChatGPT benchmark band → `metadata.intake`) →
**Scout** interview (draft rules land beside the conversation, elicitation chips) **or**
source/exemplar/file ingest → Expert approves drafts → **Build** → run the Masterwork **in
place** (stage narration + ruling, refresh-proof) → *"What did it get wrong?"* → **Audition**
against the real published work → gaps become new draft rules → rebuild.

| Piece | Where | Note |
|---|---|---|
| Rulebook home + rule editor + approval | `/expertise`, `/expertise/[id]` | Per-row Approve, Approve-all, edit-saves-approves; Build gates on approved count |
| Guided intake | `NewPackDialog` | goal · who runs it · knowledge location · stakes · **benchmark** → routes to the right Approach |
| **Scout** (interview Approach) | `PackInterviewPanel` + agent `expertise_interviewer` `4a0b2f8e-…` (Sonnet 5) | Non-modal sheet; drafts land live via the `expertise_pack` tool; elicitation chips stage editable text |
| Source + exemplar Approaches | `POST /expertise-desks/ingest` (`mode=instructional\|exemplar`) | R2 prod-verified: 3 news briefs → 4 draft rules, quotes verbatim |
| File/PDF/audio Approach | `POST /expertise-desks/ingest-file` | Routes through `content_processing` + page-extraction; page anchors preserved |
| Build | `POST /expertise-desks/compile` | Two shapes (edit / generate); auditor fan-out sized to the Rulebook's sections |
| Run in place | `TryDeskBox` on `/expertise/[id]/desks` | Typed `POST /workflows/{id}/runs` + `adoptForeignStream` + `followWorkflowRunStream`; run-row terminal **backstop** (loud) covers a dead stream; sessionStorage re-attach survives refresh |
| Run history + drift | `PackDesksPage`, `PackDriftDialog` | status · age · duration · summed cost; drift states the verdict and offers rebuild |
| Feedback loop | *"What did it get wrong?"* | Seeds the Scout with run context; complaints become draft rules |
| **Audition** | `POST /expertise-desks/backtest` + `BacktestDialog` | Rule-by-rule verdict, gaps captured as drafts |
| Versions | `expertise_pack_versions` / `_snapshot` RPCs over `history.row_versions` | No new table — reused platform history |

**The distillers and Build templates are Mandates, not code.** `expertise.source_distiller`,
`expertise.exemplar_distiller`, `expertise.pack_auditor`, `expertise.desk_template.{editor,
chief_edit,maker,chief_generate}`. **There is no system prompt and no model constant in the
distillation modules, and there may never be one — not even as a fallback for a missing
Mandate** (Arman's ruling, 2026-08-16). A Mandate that is unseeded or broken fails that chunk
with its reason.

**One shared write path:** `aidream/services/expertise_ingest/pack_writes.py` (CAS on
`version`, draft-only for AI, loud conflicts). Every Approach lands here. Never re-roll it.

---

## Part 2 — 🔴 DECISIONS ARMAN OWES (nothing below can be swept until these land)

**① The route + feature namespace.** `/expertise` is the Expert's build surface — the lexicon
calls that **Masterwork Studio**. But the page lists *Rulebooks*, and Masterworks live one
level in (`/expertise/[id]/desks`). Options:
- **(a) `/masterwork`** — one Studio home; Rulebooks and Masterworks are sections inside it.
  *Recommended:* matches the lexicon's surface name, one door, room to grow (Encore later).
- **(b) `/rulebooks` + `/masterworks`** — two top-level nouns, honest about the data model,
  but splits one workflow across two homes.
- **(c) keep `/expertise`** — no. It is the superseded program name in the URL.

**② Mandate key namespace.** `expertise.*` → `masterwork.*`? (7 keys.) Mandate keys are DB
contracts; Law 4 says yes, but they are also *values people have bound* — confirm.

**③ Does a RELEASED Masterwork pin its agents, or track its Mandates?**
Build calls `resolve_mandate(...)` and then **freezes the resulting agent UUID** into the
workflow definition (`compile.py:391`, then `"agent_id": …` at `:628,654,663,785,830,872`).
So a Binding change reaches the *next* Build, never an existing Masterwork. `ai.agent.start`
cannot resolve a `mandate_key` at run time (`matrx_ai/graph_nodes/agent_action.py:84` takes
`agent_id: str`), so today there is no other option.
- *Recommended:* **keep it pinned** — a released Masterwork is an artifact the Expert signed
  off on, and reproducibility is the accountability claim. **Then close the gap the honest
  way:** extend the existing drift surface to also detect *template* drift (the Mandate's
  Holder changed since Build), so the Expert is told and can rebuild in one click. That reuses
  `PackDriftDialog` instead of adding a mechanism.
- *If you rule the other way*, `ai.agent.start` needs a `mandate_key` input first — that is a
  matrx-ai/matrx-graph change affecting every workflow, not a Masterwork change.

**④ Doc home.** `common-docs/systems/expertise-packs/FEATURE.md` → `systems/masterwork/FEATURE.md`?
(The banner there already points here.) And does `projects/advanced-expert-capture-system/`
get renamed, or stay as the historical design set?

---

## Part 3 — THE RENAME WORK ORDER

**Sweep inventory (2026-08-17, file:line evidence per item).** Nothing renamed yet;
"Masterwork" and "Encore" appear **zero** times in either repo.

### Sequence (each step is one commit, in this order)

**Step 1 — Tier A, user-visible strings.** The cheapest, highest-value pass; no contracts move.
Two leak the retired words in the worst way and go first:
- `features/expertise/components/detail/CompileDeskDialog.tsx:67` — `"Starting the compiler…"`
  *(the exact string the Build ruling was made to kill)*, plus `:102,108,270`.
- `aidream/api/routers/expertise_desks.py:34` — `initial_message="Compiling your desk..."`;
  `:76` — `"Judging your desk against the original..."`.
Then the ~90 remaining strings across `listConfig.tsx`, `PackDetailPage`, `PackDesksPage`,
`PackDriftDialog`, `BacktestDialog`, `IngestSourceDialog`, `NewPackDialog`,
`useExpertiseRowActions`, `nav-data.ts`, `app/(core)/expertise/admin/page.tsx`, and the
aidream user-facing error sentences in `ingest.py` / `pack_writes.py` / `file_ingest.py` /
`tools.py` / `compile.py`.
⚠️ **Also Tier A:** generated **agent names and instructions** written into the DB by Build
(`compile.py:558,565,579,587,672,716,722,741,749,768,881` — `f"{desk_name} — Editor"`,
`f"{author} ({desk_name} Chief)"`, `"— Ruling"` / `"— Verdict"`), and the **Mandate
labels/descriptions** (`template_mandates.py:30-66`, `ingest.py:51-64`, `compile.py:67-70`) —
those show in the admin UI.

**Step 2 — Tier B, identifiers.** Directories `expertise_desks/`, `expertise_ingest/`,
`features/expertise/`, `components/desks/`; components `NewPackDialog`, `PackDetailPage`,
`PackDesksPage`, `PackDriftDialog`, `PackInterviewPanel`, `CompileDeskDialog`, `TryDeskBox`,
`BacktestDialog`; types `PackPrinciple`, `PackDesk`, `DeskRun`, `PackDiff`; functions
`getPack`, `savePrinciples`, `listDesksForPack`, `compile_expertise_desk`, `backtest_compare`.
**Move `aidream/scripts/check_hardcoded_agent_prompts.py:17` in the same commit** — it names
`expertise_desks` in its guard list and would silently stop covering Build.

**Step 3 — Tier C, DB + wire contracts (migrations; lockstep both repos).**

| Contract | Count | Current |
|---|---|---|
| Table + constraints/index/trigger + 2 RPCs | 1 family | `platform.expertise_pack`, `expertise_pack_versions`, `expertise_pack_snapshot` |
| Entity token + sharing registry (`url_path_template`) | 1 | `expertise_pack` → `/expertise/{id}` |
| `tool.definition` row | 1 | `expertise_pack` |
| Mandate keys | 7 | `expertise.*` (see decision ②) |
| API paths + OpenAPI tag | 4 + 1 | `/expertise-desks/{compile,ingest,ingest-file,backtest}` |
| Stream-event literals | 5 | `desk_compile_progress`, `desk_compile_complete`, `expertise_ingest_progress`, `expertise_ingest_complete`, `expertise_backtest_verdict` |
| Error-type literals | 15 | `expertise_pack_not_found`, `…_forbidden`, `…_conflict`, `…_empty`, `expertise_source_*` (4), `expertise_distill_failed`, `expertise_distiller_unavailable`, `expertise_transcription_failed`, `expertise_transcript_too_short`, `expertise_extraction_*` (2), `expertise_desk_template_invalid` |
| Workflow metadata keys + tags + stamp | — | `compiled_from_pack`, `pack_slug`, `pack_version`, tags `expertise-pack` / `pack:<slug>`, `COMPILER_STAMP="expertise_desks v3"`, `source_feature:"expertise"` |
| Extraction-job marker keys | 2 | `expertise_pack_id`, `expertise_mode` |
| Live rows to rename | — | agent `expertise_interviewer` → Scout; 4 `expertise_desk_template_*` agents; `expertise_pack_distiller`, `expertise_pack_exemplar_distiller`, `expertise_backtest_judge` |

**Generated files are regenerated, never hand-edited:** `types/python-generated/*`,
`types/generated/entity-types.generated.ts`, `features/matrx-envelope/catalog-nouns.generated.ts`,
`aidream/api/generated/*`. Commands: `pnpm sync-types` / `pnpm db-types`, `python db/generate.py`.

**Step 4 — Tier D, docs.** `features/expertise/FEATURE.md` (72 hits) ·
`expertise_ingest/FEATURE.md` (~60) · `expertise_desks/FEATURE.md` (~45) · both `CLAUDE.md`
pointer lines · `common-docs/systems/expertise-packs/FEATURE.md` (banner already updated;
body not) · `projects/sme-poc-hopkins/**` · this handoff.

### 🚫 DO NOT RENAME (verified false positives)

- **"desk" that is not a Masterwork:** the marketing **brand asset desk** (`features/marketing/**`,
  ~12 files), the podcast "mixing-desk strip", education/canvas sample copy, the outreach
  out-of-office regex `away from (my|the) (desk|office|email)`, newsroom byline "desk"
  (`coverage/bylines.py`), and the Orchestra test fixtures "Weather Desk" / "Markets Desk".
- **"pack" that means something else:** "head of the pack", the `search-pack` bundle-slug
  placeholder, "packs" as a verb (serialize), cytoscape's "Pack disconnected components", and
  everything matching `package`.
- **`re.compile(...)`** everywhere, and `method: "POST"` (HTTP verb).
- **"expertise" as plain English** — e.g. the landing page's *"No technical expertise required."*

---

## Part 4 — Open defects and gaps

| # | What | Where | Severity |
|---|---|---|---|
| 1 | **Build freezes agent UUIDs into every Masterwork** — a Binding never reaches a released one; `ai.agent.start` has no `mandate_key` input | `compile.py:391` + `agent_action.py:84` | Needs decision ③ |
| 2 | **Duplicate agent row** — `expertise_backtest_judge` exists twice (`c330c8fa-…`, `c55b52c9-…`); only one can be the Mandate's Holder | `agent.definition` | Real; dedupe |
| 3 | **Mid-word name truncation** — intake derives the Rulebook name from the goal at 60 chars, producing *"An assistant that writes cold-email first lines exactly the"*, and Build appends `" Desk"` → a double-space nonsense name on a live row | `NewPackDialog` name derivation + `compile.py:484` | Cosmetic but user-visible; truncate on a word boundary |
| 4 | **Test residue on live data** — Rulebook `an-assistant-that-writes-cold-email-first-lines-exactly-the` (draft) and its Masterwork `13e4ba12-…`, from browser verification | live DB | Clean up |
| 5 | **Build hand-rolls a compiler** — `compile.py` (~962 lines) re-implements `_var()`/`_node()`/`_edge()` where `matrx_ai/plans/compiler.py::compile_plan` exists and is what Orchestra / `agent_plans` / `workflow_plans` use. It genuinely does two things that one cannot: data-driven cast width (N auditors = N Rulebook sections) and non-agent utility nodes | `expertise_desks/compile.py` | Duplication finding ② in the vocabulary campaign — **bring a plan, do not delete first** |
| 6 | **Four Scouts, no shared primitive** — this one, SEO Site Strategy Interviewer, GSC Site Intake Interviewer, Vision Interview's opening pair; each has its own intake storage and follow-up loop | cross-feature | Duplication finding ③ |
| 7 | **No Encore surface** — the Operator-facing invocation of a released Masterwork does not exist. Today an Operator has no door | — | Design gap, named in the lexicon |
| 8 | **No distillation → Engram interface** — Distillation emits rules; the runtime spec (`common-docs/systems/engram/VISION.md` §5) also wants candidate specialists, contracts, class taxonomy, and acceptance criteria | — | Next milestone after the honest test |

---

## Part 5 — Working notes that save hours

- **Live ids:** Rulebooks `hopkins-scientific-advertising` `f6267bca-…`, `strunk-elements-of-style`
  `e492a07f-…`, `arman-seo-method` `5d353449-…` (draft, owned by arman@titaniumsuccess.com).
  Masterworks: Strunk `bf711bce-…`, Hopkins `b0865c3b-…`. Scout agent `4a0b2f8e-…`.
- **A real run costs ~$0.19 and takes ~4 min**, detaches server-side, and is safe to walk away
  from. Model tiers: cheap `bd68e0a8…`, mid `979205fd…`, top `617abdcd…` (Claude Sonnet 5).
- **Verify like this:** `pnpm preview:start` (port 3001, shared — never `pnpm dev`), then
  `/expertise/e492a07f-a1d4-4a4b-98e7-bc929a0f40fd/desks`. `pnpm type-check` is the only type
  gate. In-process aidream checks beat unit tests for this feature — the live DB is truth.
- **Never**: hand-render a stream (use `RichDocument` / `MarkdownStream`); re-roll the CAS write
  path; auto-activate an AI-written rule (draft-only is the human-first invariant); put a system
  prompt or model constant in a distillation module (Mandates only).

## Definition of done (Arman's bar)

An Expert who cannot code opens the Studio, answers four questions, talks for twenty minutes,
approves the rules they agree with, presses one button, runs the result, disagrees with it once,
and watches that disagreement become a rule — then runs it again and **agrees with the output
where they never agree with vanilla AI.** Until Arman's own SEO method clears that bar, this is
not done.
