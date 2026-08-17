> # 🔶 NAMING IS UNSETTLED IN THIS FILE — READ BEFORE YOU WRITE A WORD
>
> **The canonical lexicon is the ONLY authority on names:** `/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md`
>
> This document's vocabulary conflicts with it. Specifically:
>
> - **🚨 Arman's ruling, 2026-08-16 — THE MOST IMPORTANT LINE IN THIS FILE: everything described here is part of the CORE MASTERWORK SYSTEM.** It is not a separate product, a sibling system, or an adjacent feature. It drifted out and got built *completely outside* the system it belongs to **for one reason: vocabulary.** It was misnamed, therefore misplaced, therefore lost. **These systems only work when all the parts of them are there** — treat every future decision here as a Masterwork decision.
> - Masterwork's own design docs are `/Users/armanisadeghi/code/common-docs/projects/advanced-expert-capture-system/` (folder name also superseded). **Read `initial-plan-docs/32-distillation-methods.md` first** — this lane is one of Masterwork's **Distillation Methods**, exactly as the shipped `vision-interview` system is (that one is **Vision Extraction**).
> - **pack** → recommendation **Rulebook** (this app's own UI already says *"a pack is one expert's rulebook"* in three places). Arman: *"Rulebook might be a good one."* Closest to decided of anything here — still UNSETTLED.
> - 🔴 **desk** → **Arman, 2026-08-16: "desk means nothing to me."** The hardest no in the set. Standing recommendation is **Masterwork** (a desk is precisely "an Expert's judgment as a running AI system"; one Rulebook can yield several; running one is an **Encore**) — but he has NOT ruled. UNSETTLED.
> - **compile / compiler** (leaks to users as "Starting the compiler…") → recommendation **Build**. UNSETTLED.
> - **backtest** → recommendation is this UI's own honest words, **"Compare to the original"**. **Replay** is reserved for Hindsight and means something different (re-running a past request under a change). UNSETTLED.
> - **"Expertise System" / "expertise capture" / "expert distillation" as the name of the program is SETTLED — it is Masterwork.** Fix that on sight. Route `/expertise`, table `platform.expertise_pack`, services `expertise_desks` / `expertise_ingest`, the `expertise` source-feature slug and entity token all still carry the drifted name; under Law 4 a rename goes all the way, so this is planned work with a data migration — **not** something to half-do.
> - **SME** is fine in internal prose, but is **Expert** in every product surface.
>
> **🔴 Arman's position, 2026-08-16 — he does not love these names.** **"Desk" means nothing
> to him.** *Rulebook* might be right. Several others are confusing. *Engram* only makes sense
> if the thing it names doesn't already have a name. In his words, he **doesn't even know what
> they should be — "which makes them not right, but also not wrong until we properly name
> them."** So treat every term above as **provisional in both directions**: do not defend it,
> do not spread it, do not read shipped code as endorsement — and do not declare it wrong and
> substitute your own. It is undecided, and the owner has said so.
>
> **A dedicated naming session is queued** — the full Masterwork inventory and the prompt that
> runs it: `/Users/armanisadeghi/code/common-docs/systems/vocabulary/MASTERWORK-NAMING-SESSION.md`
>
> **Law 1 — agents never coin, rename, or "improve" a name.** **Law 5 — an Unsettled term is
> not authority; do not treat the recommendations as decided.** If you are working on this
> file, or on any part of the feature it describes, then **settling the nomenclature with
> Arman is one of your most important tasks** — not a footnote and not someone else's job.
> Bring him the specific choices above, get a ruling, record it in the lexicon, and only then
> sweep it everywhere in one campaign (**Law 4 — a rename goes ALL the way:** docs, code,
> routes, components, services, DB tables, entity tokens, slot keys). Never split the
> difference. Never invent a third word. Never adopt the drifted term because it is already
> in the code.

# Masterwork — the shipped Distillation lane ("Expertise System") — the full end-to-end work order

> **Read this first, execute top to bottom.** This is the complete handoff for turning the
> SME proof-of-concept (2026-08-09, "the Hopkins/Strunk desks") into the real, UI-first
> product. Everything referenced here EXISTS and WORKS today — but almost none of it has a
> user-facing UI, and **Arman's standing ruling is: nothing is real until a normal,
> non-technical user can see it and do it in the UI.** That ruling is the spec.

---

## 0. Arman's vision (captured 2026-08-09, in his words — do not lose this)

1. **UI-first is the reality test.** "Nothing is real unless there's a user-friendly UI
   that a normal user can use." APIs, scripts, and agent-driven builds are fine as
   machinery, but every capability needs a home in the UI where a user can at least *see
   and track* what they have. Complicated things may take steps — that's fine and even
   good — but there must be a home.
2. **The system is for HUMANS first.** The big goal is NOT auto-distilling books. It is a
   world-best expert (doctor, lawyer, SEO expert) building their system **step by step,
   however he or she wants**, through a great UI. Book/document/audio/video ingestion is
   the impressive accelerant ("plop in a 500-page book and boom"), not the product. The
   end-state dream: "just talk for an hour, upload the audio, and we'll do the rest."
3. **The chunk→extract→table→reference-back pattern is the ingestion play.** Our PDF
   extraction utility already embodies it: split large content, send manageable chunks
   (10/20/50 pages) to an agent with instructions + a content-IR schema, extract into a
   FLAT TABULAR structure where every row links back to its source pages. Multiple agents
   can sweep the same content for different things, all writing to the same table. The big
   expensive agent then works from the small table and follows references back to the
   source when needed. Reuse THIS for "source → Expertise Pack", don't invent a parallel.
4. **The honest-evaluation caveat.** Hopkins and Strunk are old, famous, well-studied
   books — the models already "know" them, so results flatter us. The REAL test is
   expertise that is unique, non-obvious, even **contrary to what AI does by default**
   (Arman: "when I ask an AI to do SEO keyword research, I never agree until I tell it how
   to do it MY way"). The system must prove it can make an AI work AGAINST its priors,
   holding the expert's opinionated line. The benchmark: Arman's own SEO methodology as a
   pack, judged by whether HE agrees with the output.
5. **Agents are legitimate UI.** If a step needs what a coding agent did by hand, build a
   platform agent that does it for the user. "Don't think of what we need as only buttons
   and inputs."

## 0.5 What exists RIGHT NOW (all live, all working — the raw material)

| Thing | Where | Id / slug |
|---|---|---|
| `platform.expertise_pack` table | Matrx Main DB — base-conformant, entity token `expertise_pack`, sharing-registry row, canonical RLS (`iam.apply_rls` 'system' variant), grants | migration record: aidream `db/migrations/platform_expertise_pack_create.sql` |
| Pack #1: Hopkins (advertising) | 115 principles, sections A/B/C, verbatim-verified quotes | slug `hopkins-scientific-advertising`, id `f6267bca-30c6-43cd-8e8e-64606af9b20f` |
| Pack #2: Strunk (editing) | 97 rules, sections U/C/W | slug `strunk-elements-of-style`, id `e492a07f-a1d4-4a4b-98e7-bc929a0f40fd` |
| Hopkins Copy Desk workflow (generate-shape) | workflows.aimatrx.com | `0001b1ba-24b6-4f97-8f58-8fc6671bbf23` |
| Strunk Edit Desk workflow (edit-shape) | workflows.aimatrx.com, COMPILED from pack #2 by compiler v3 | `bf711bce-78a9-41b4-b8fd-2a5a047c31de` (the v1-compiler desk `4b21a75f…` was soft-deleted 2026-08-16 when this replaced it; restore with `deleted_at = null` if ever needed) |
| Generic Pack Auditor agent (cheap tier, works for ANY pack) | agent catalog | `7c3a0689-d075-4c9f-8a7b-f023ced6a87c` |
| 7 desk-specific agents (Hopkins ×5, Strunk editor + chief) | agent catalog, search "Hopkins"/"Strunk" | ids in common-docs `projects/sme-poc-hopkins/build/agents_registry.json` |
| pack→desk compiler (script v1) | common-docs `projects/sme-poc-hopkins/build/pack_to_desk.py` | fetches pack via PostgREST, authors agents, emits workflow stamped `compiled_from_pack`+`pack_version` |
| Proof runs + expert verdicts | common-docs `projects/sme-poc-hopkins/deliverables/` | runs `041c1856…`, `82b8f7c8…`, `1294a17e…` ($0.19–$0.37 each) |
| System-of-record doc | common-docs `systems/expertise-packs/FEATURE.md` | invariants + compilation contract |

Model tiers used (keep): cheap `bd68e0a8…` Gemini 3.1 Flash Lite · mid `979205fd…` Gemini 3.5 Flash · top `617abdcd…` Claude Sonnet 5.

---

## STATUS (2026-08-15) — Phase 4's interview lane SHIPPED; the system now DISTILLS

**Arman's correction (2026-08-15, read this first):** the original failure of this project was
an agent hand-rolling packs instead of building THE SYSTEM that distills expertise. The product
is the PROCESS — a button an expert clicks, a guided intake, an interviewer that works with
whatever the human gives (helpful, terse, or difficult), document ingestion when there's a book,
and (next) imitation from best-in-class exemplar outputs when there's no human at all (the
news-writer case). Every remaining phase serves that. The Engram runtime doc
(`/Users/armanisadeghi/code/common-docs/systems/engram/VISION.md`) §5 defines
what distillation must eventually produce for the runtime: candidate specialists, contracts,
class taxonomy, acceptance criteria, across regimes R1 (dialogue+artifacts) / R2 (artifacts
only) / R3 (dialogue only).

Shipped 2026-08-15 (verified in browser + in-process against the live DB):
- **The button:** "New pack" is now the guided intake (goal · who runs it · where the knowledge
  lives · stakes → `metadata.intake`), routing to the interview or document lane.
- **The interview lane (was "Phase 4 REMAINING"):** `expertise_pack` tool (aidream
  `services/expertise_ingest/tools.py`; draft-only writes, one shared CAS write path
  `pack_writes.py`) + **Expertise Interviewer** agent (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`,
  Sonnet 5, elicitation-menu prompt) + `PackInterviewPanel` sheet on `/expertise/[id]`
  (auto-opens via `?interview=1`; page refreshes as drafts land).
- Hygiene: api-types casts dropped, `sourceFeature: "expertise"`.

Also shipped since (each browser- or production-verified): the **R2 exemplar ingest mode**
(`mode=exemplar` on `/expertise-desks/ingest` + the source-kind choice in the dialog —
prod-verified 2026-08-16: 3 news briefs → 4 draft rules, all quotes verbatim,
`source_ref.exemplar=true`); **desk run-history** on `/expertise/[id]/desks` (status · age ·
duration · summed node cost from `workflow.run`/`node_outcome`, rows open the run); the
**"What did it get wrong?" feedback loop** — each completed run row opens the interview panel
seeded with the run context, so complaints become draft rules through the same tool.

**2026-08-16 milestone pass (adversarial check + fixes + backtest, all verified):**
- **The approval loop is CLOSED** — both adversarial reviews found the same CRITICAL: nothing
  ever cleared `draft:true`, so distilled rules could never power a desk. Now: per-row Approve,
  Approve-all, edit-and-save approves, Create-a-desk gates on approved count. Browser-verified
  (v1→v2, badges cleared, Create-a-desk appeared) + DB-confirmed.
- **R2 backtest harness live:** `POST /expertise-desks/backtest` — comparison judge scores desk
  output vs the real published exemplar rule-by-rule (verbatim rules, invented ids dropped),
  gaps land as draft rules (`source_ref.backtest`). In-process verified: correct verdict, real
  rule citations, gap captured. No FE surface yet (next).
- **Server hardened** (aidream `147a7c686`): ingest cost caps (600k chars / 80 chunks),
  word-window chunk fallback + all-chunks-failed fatal, non-Latin-safe dedupe, tool batch/field/
  read caps, `update_meta` via CAS with `{label}` sections, `load_readable_pack` for reads,
  fail-closed ownership, retryable CAS-conflict errors.
- **FE hardened:** non-modal interview sheet (watch drafts land beside the conversation),
  version-conflict saves self-recover, owner-gated interview/feedback entries, run-id-stamped
  feedback seeds that re-stage per run.

**Shipped 2026-08-16 (second batch):** "Try your desk" IN PLACE on each desk card
(`TryDeskBox` — typed `POST /workflows/{id}/runs` + `adoptForeignStream` +
`followWorkflowRunStream`, real node-stage narration, verdict/corrected-text via
`getDeskRunVerdict` rendered through RichDocument; studio demoted to "Open in studio");
"Compare to the original" (`BacktestDialog` → `/expertise-desks/backtest`, verdict +
rule findings + gap drafts, owner-only); the benchmark intake band
(`metadata.intake.benchmark`); one-tap elicitation chips above the interview composer
(stage editable text, never auto-send). Types resynced once the deploy carried the
backtest path.

**Ledger (real, not yet built):** ④ stakes → default severity/gate intensity (currently
inert); ⑤ ~~file/PDF/audio lane~~ **SHIPPED 2026-08-16** (see below) — the intake-aware
empty states half of that row is still open; ⑥ AccessGate + share-levels on
both pages (canEdit is owner-only; edit-level sharees read-only silently); ⑦ vocabulary
polish + a door to the interview conversation from a rule's provenance; ⑧ coverage/progress
strip on the pack header; ⑨ desks-page toast fires on ANY version bump while feedback panel
open (false "drafts captured" on unrelated edits).

**Shipped 2026-08-16 (was ledger ⑩ ⑪):** TryDeskBox survives a refresh — the run id is kept
per desk in sessionStorage and on mount the run row decides: still going → the new
`attachWorkflowRun` primitive (execution-system) rejoins the SSE feed, which replays the node
lifecycle so the stage list rebuilds; finished → the verdict shows directly. A finished run
offers "Compare to the original" beside the verdict, prefilled with the desk's own output
(owner-only, one compare entry per desk). `getDeskRunVerdict` now unwraps the editor node's
JSON envelope, so both the "Corrected text" panel and the backtest candidate are prose.
Browser-verified on the Strunk desk with a real run (refresh mid-run rejoined; verdict landed;
dialog opened prefilled).

Next, in order: ① the honest test — `arman-seo-method` with Arman (needs him; review-queue
row filed with the walkthrough); ② the distillation→Engram interface (emit candidate task
classes + acceptance criteria alongside rules — spec: common-docs
`inbox-from-arman-to-be-processed/engram-expert-distillation-runtime.md` §5).

**Shipped 2026-08-16 (was ledger ⑤) — the file/PDF/audio lane.** `POST
/expertise-desks/ingest-file` (aidream `services/expertise_ingest/file_ingest.py`) + the
"Upload a file" option in `IngestSourceDialog`. NOT a parallel pipeline, exactly as the design
said: a document runs through content_processing (processed_documents + pages) and a
`docproc.page_extraction_jobs` row pointing the SAME distiller slots
(`expertise.source_distiller` / `expertise.exemplar_distiller`, re-resolved and re-stamped on
every run) at the pages, so every rule lands with real `source_ref.source_pages`; audio/video
transcribes first (`transcribe_managed_file`) and takes the text lane unchanged. Rule
construction now lives once in `distill.build_draft_rules`, shared by every lane; the
page-extraction fan-out runs under `SubPipelineEmitter`, promoted out of
`graph_actions/_shared.py` into `aidream/context/` so a non-workflow caller can drive a
streaming pipeline as one step (it now CAPTURES a swallowed `fatal_error` instead of dropping
it). FE uploads through the canonical `useFileUpload`; the new `RuleProvenance` turns the
anchors into doors — pages, a link to the source file, a link to the extraction that read it —
and a stream `fatal_error` finally reaches the user instead of "the ingestion reported a
problem" (that was swallowed on BOTH lanes). Verified end-to-end against the live DB with a
real 2-page PDF, in-process and again through the browser dialog: 4 page-anchored draft rules,
every quote verbatim, nothing auto-activated.

**Phase 6 hardening DONE (2026-08-16) — both items, verified:**
- **Pack version snapshots — NO new table.** `platform.expertise_pack` declared `is_versioned`
  from day one but its hand-written create migration (pre `create_entity_table`) never attached
  `platform._version_capture`, so it bumped `version` on every save while nothing recorded the
  prior state. It is now enrolled in the SAME store 138 other tables use (`history.row_versions`),
  with one BASELINE row per live pack; two SECURITY DEFINER RPCs
  (`expertise_pack_versions`/`expertise_pack_snapshot`) expose ONE pack's history to the browser
  behind a gate that mirrors the table's `std_select` RLS predicate (the `history` schema is not
  exposed to `authenticated`, and widening it platform-wide is a far bigger decision than this
  feature). `_touch_row` was deliberately NOT attached — it bumps `version` on every update and
  would fight the app's CAS on that column. The desks-page drift flag now carries
  **"See what changed"** → `PackDriftDialog` + the pure `packDiff.ts`: rules gained, rules
  retired, rules reworded field by field, counting only what a desk actually compiles (drafts are
  listed separately, never as drift). A version older than capture says so instead of inventing a
  diff. Browser-verified on a desk built from v3 of a live pack, in both states.
- **Structured outputs + the citation gate (compiler v3).** Auditor / Editor / Maker moved to
  `output_schema` (json_schema) — that column is what engages provider-native structured output,
  and the schema gate inside `update_agent` validates it, so a bad contract fails COMPILATION not
  a paid run. `ai.util.parse_llm_json` is deleted from the generate shape. "Cited principle ids ⊆
  the section passed" is no longer prompt-only: per section the compiler emits `cite_<code>`
  (`data.filter` over `structured_output.verdicts`, allowed ids inlined as a literal — the graph
  sandbox has no calls) + `gate_<code>` (`data.assert`, count == 0), and the audit sheet is routed
  THROUGH the assert node so no Editor, Chief or gather can receive a sheet the gate has not
  cleared. Both shapes proven offline (`validate_definition` + `compile_graph` + `dry_run`);
  8 new tests in `aidream/services/expertise_desks/tests/test_citation_gate.py`.
  **Strunk recompiled and run end-to-end against production** (run
  `aa4ced76-031e-494c-b6cb-e0be9487933d`, $0.2163, completed): 3 auditors × structured output =
  97 verdicts for 97 rules, all three `cite_` filters `kept=0`, all three gates `passed=true`,
  Editor structured (9 edits), Chief ruling real and citing real rule ids.

**In-place run verified end-to-end (2026-08-16):** two production runs through TryDeskBox;
breadcrumbs show the full event flow to `run_completed`, ruling + corrected text render on the
card. One earlier run was killed by a mid-flight server deploy (recorded `cancelled`) — the
class is covered by the run-row terminal backstop (loud when it fires).

## PRIOR STATUS (2026-08-10) — Phases 1-3 SHIPPED

- **Phase 1 DONE (live, FE v0.4.366):** `/expertise` entity-list home (mine/orgs/public),
  `/expertise/[id]` rule editor (plain-language add/edit/retire, version bump w/ optimistic lock),
  `/expertise/[id]/desks` (drift flags, run links), `/expertise/admin`. Sidebar + entity registry +
  peek (RegistryPeek) wired; `shareable_resource_registry.url_path_template` → `/expertise/{id}`.
- **Phase 2 DONE (FE live v0.4.369; server merged to aidream main, ⚠️ NOT DEPLOYED — needs the next
  aidream `./scripts/release.sh` run, this container had no Coolify/DB creds):**
  `aidream/services/expertise_desks/` — POST `/api/expertise-desks/compile`, both shapes (edit +
  generate) generalized for ANY pack/sections, generic Pack Auditor reused (re-created if missing),
  `compiled_from_pack`+`pack_version` stamps, typed `desk_compile_*` events, `expertise`
  SOURCE_FEATURES slug. FE "Create a desk" dialog streams it.
- **Phase 3 DONE (FE live v0.4.371; server merged, same deploy note):**
  `aidream/services/expertise_ingest/` — POST `/api/expertise-desks/ingest` (text lane): chunk →
  llm_to_pydantic distill per chunk → dedupe (cross-chunk + vs pack) → VERBATIM quote verification
  (whitespace/curly-quote normalization; failures flagged `source_ref.quote_unverified`, never kept
  as anchors) → draft-only append with `source_ref` + version CAS. FE "From a source" dialog.
- **Phase 4 DONE (2026-08-15/16, live end-to-end):** the guided distillation start + live
  interview lane. NewPackDialog is now the four-question intake (goal / who runs it / where the
  knowledge lives / stakes → `metadata.intake`) and routes head-shaped knowledge to
  `/expertise/{id}?interview=1`, which auto-opens `PackInterviewPanel` — a real conversation with
  the **Expertise Interviewer** agent (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`, Sonnet 5, FE
  constant `features/expertise/agents.ts`). The agent reads intake + rules and lands DRAFT rules
  via the server `expertise_pack` tool (aidream `services/expertise_ingest/tools.py`; one shared
  CAS write path `pack_writes.py` with the ingest lane; drafts-only edit/retire enforced). The
  panel watches pack `version` and refreshes the rule list live beside the conversation.
  Browser-verified against prod aidream: one spoken answer → 3 draft rules on the page in ~8s,
  and the interviewer used the "what did it get wrong" lever unprompted. Composer is jargon-free
  via the new `variablesPanelStyle: "hidden"` platform style.
- **Phase 5:** pack `arman-seo-method` (id 5d353449-5a2c-4034-ac00-97b5defb23ca) scaffolded as a
  DRAFT owned by arman@titaniumsuccess.com (personal org, sections R/S/F). Prior-override hardening
  is IN the compiled prompts (PRIOR_OVERRIDE_CLAUSE + mandatory "Conflicts With Common Practice"
  Chief section + auditor rule 6). REMAINING: update the LIVE generic Pack Auditor's prompt (the MCP
  account here lacked admin; the compile service's canonical prompt in
  `aidream/services/expertise_desks/prompts.py::PACK_AUDITOR_PROMPT` is the text to apply), fill the
  SEO pack with Arman, compile, run, judge.
- **Phase 6 — DONE.** ORM model regen was already done; run-history, file/PDF ingest, path casts,
  sourceFeature slug and the Hopkins recompile all shipped earlier; structured outputs + the
  citation gate and pack version snapshots landed 2026-08-16 (details in STATUS above). Nothing
  remains under Phase 6 except the incidental aidream defects it listed, which stay filed in
  aidream `FOUND_DEFECTS.md` on their own merits.
- **2026-08-16:** Hopkins recompiled onto the generate shape via the production compiler —
  desk `b0865c3b-774c-44a3-91e4-ddaef205ae67`, pack-stamped v1 (old unstamped desk
  `0001b1ba…` left as history). Exemplar ingest mode shipped + prod-verified; desk
  run-history and the "what did it get wrong" feedback loop shipped + browser-verified
  (see STATUS above).
- **First actions for the next agent:** ① run the honest test — open `arman-seo-method`
  with Arman and fill it through the interview lane, ② the distillation→Engram interface.

---

## The build plan — 6 phases, in order

### Phase 1 — THE HOME: `/expertise` in the main app (ai-matrx) 【biggest gap, do first】

A `(core)` feature where an expert sees and manages everything. Per platform doctrine:
list-first entry page (like `/agents`), `lib/entity-list/` shell, PageHeader chrome,
direct supabase-js reads (`.schema('platform').from('expertise_pack')` — RLS is live;
regenerate types first with `pnpm db-types`, the schema list already includes `platform`).

- **/expertise** — list of the user's packs (Mine/Org/Public scopes; the two PoC packs are
  public so they appear for everyone). Columns: name, source author/year, principle count,
  version, status. New Pack button (name + description + source → empty draft pack).
- **/expertise/[id]** — the pack detail: principles grouped by section, each row showing
  statement / severity / detection, expandable to rationale + verbatim quote. **Inline
  edit + add + retire principles** (bump `version` on save). This is THE expert surface —
  a doctor must be able to read and correct their own rulebook here. Zero jargon: call
  them "rules", not principles/JSONB/sections internally if copy reads better.
- **/expertise/[id]/desks** — desks compiled from this pack (query `workflow.definition`
  where `nodes/metadata.compiled_from_pack = pack id`; the registry url_path_template is
  already `/expertise-packs/{id}` — update it to the route you ship). Each desk: name,
  pack version it was compiled from (flag "pack has newer version" when drifted), link to
  run it, link to past runs.
- Register the feature per doctrine: FEATURE.md, admin map (`/expertise/admin`),
  review-queue entry when done. Sidebar entry. The `expertise_pack` entity token is
  already registered for peek/reference wiring.

### Phase 2 — Compile-a-desk as a BUTTON (aidream + FE)

Port `pack_to_desk.py` into an aidream service: `aidream/services/expertise_desks/`
(`compile_desk(emitter, CompileDeskRequest{pack_id, desk_kind, name})`), thin router,
reusing the agent_service create/update functions and workflow definition_store — the
script is the exact recipe, including the desk shapes:
- `edit` shape (Strunk): intake → N parallel section audits (generic Pack Auditor, cheap)
  → Editor applies violations (mid) → persona Chief rules once (top).
- `generate` shape (Hopkins): brief intake → variant generator → per-variant × per-section
  audit fan-out (control.map) → persona Chief verdict. (Hopkins desk predates the
  compiler — recompile it from pack #1 with this shape so both desks are pack-stamped.)
FE: "Create a desk from this pack" button on `/expertise/[id]` → pick shape + persona
tone → streams progress → lands on the new desk. Register `source_feature` slug
(add `expertise` to `source_attribution.SOURCE_FEATURES` — stop borrowing `marketing`).

### Phase 3 — Source → Pack ingestion (the "plop in a book" flow)

**Reuse the PDF-extraction chunking utility** (Arman's directive #3 — it's already
generalized beyond PDFs): source document → splitter → chunks of N pages → extraction
agent per chunk with the distillation instructions (the exact prompt that worked twice is
in common-docs `projects/sme-poc-hopkins/` — principle schema: id, name, statement,
rationale, verbatim quote, detection, severity, section) → rows accumulate into a FLAT
structure, **every principle keeping `source_ref` (page/chunk) so the expert can click
back to the original text**. Then: dedupe pass (the PoC found cross-chapter duplicates),
**mechanical verbatim-quote verification** (normalize whitespace/curly quotes; the PoC
verifier logic is in the project docs — port it, it caught 9 bad quotes), section
assignment, and a draft pack INSERT (`status='draft'`). The expert reviews/edits in the
Phase 1 UI and activates. Audio/video sources: transcript first (existing transcription
feature), then the same pipeline. **Human-first invariant: ingestion always lands a DRAFT
the expert curates — never an auto-activated pack.**

### Phase 4 — Build-it-by-hand flow (the actual product)

For the expert with no book: guided pack building in the UI. Start empty → add rules one
at a time (plain-language form: "What's the rule? Why? How would you catch someone
breaking it? How bad is breaking it?") → optional interview agent ("tell me how you do
keyword research; I'll draft rules, you correct them" — conversation → draft principles
into the same draft-pack table). This phase is where directive #2 lives. Keep the
interview agent's drafts clearly marked as drafts for the expert to approve line by line.

### Phase 5 — The honest test: Arman's SEO pack

Sit with Arman (or his recorded hour of audio). Build `arman-seo-method` pack via Phase
3/4. Compile a desk. Run real keyword-research jobs. Success criterion is directive #4:
**Arman agrees with the output** where he never agrees with vanilla AI. Expect prompt
hardening: the persona/auditor prompts must instruct the model that the PACK OVERRIDES its
own instincts — add an explicit "when your training disagrees with the pack, the pack
wins; flag the conflict, don't smooth it over" clause to the Pack Auditor + Chief
templates, and add a per-run "conflicts with model priors" section to the Chief's output
so we can SEE it holding the line.

### Phase 6 — Hardening — COMPLETE (2026-08-16)

Structured outputs + the mechanical citation gate, pack version snapshots + the drift diff,
run-history, and the ORM regen have all shipped; see STATUS above for what was built and how it
was verified. **Note for anyone re-reading the original plan:** it proposed an
`expertise_pack_version` sibling table — that was the WRONG answer. The platform already has one
version store (`history.row_versions`) and the pack table simply had never been enrolled in it.

The incidental aidream defects this phase listed are unrelated to expertise and stay filed in
aidream `FOUND_DEFECTS.md` on their own merits: workflow validation should catch
registered-literal failures pre-run; `source_feature` should be data not a code tuple; agent
variables render dicts as Python repr (`str(value)` in `matrx_ai/agents/variables.py`);
`iam.apply_rls` doesn't GRANT; a `register_entity()` helper for the four-step registration.

## Working notes that will save you hours

- Auth for scripted platform work: sign in as `$AI_ADMIN_USERNAME`/`$AI_ADMIN_PASSWORD`
  (Supabase password grant) → JWT. **Set a custom User-Agent — the edge 403s default
  python-urllib on POSTs.**
- Agent authoring: `POST /api/agent-service/agents` (meta-agent) then PATCH the exact
  definition (messages/model_id/variable_definitions/settings) — that's the manual-edit
  surface, deterministic.
- Workflow defs: `version` must be the STRING "1"; `variables` a LIST; run inputs via
  `POST /api/workflows/{id}/runs` `{inputs:{...}}`; runs detach — read progress from
  `workflow.node_outcome` (per-node output + usage.cost_usd = free telemetry).
- Everything above is documented with full history in common-docs
  `projects/sme-poc-hopkins/` (MORNING_REPORT, MORNING_SESSION, FINDINGS) and
  `systems/expertise-packs/FEATURE.md`. The compiler + prompts + canons are in that
  project's `build/`, `prompts/`, `canon/`, `strunk/` folders.

## Definition of done (Arman's bar)

An expert who cannot code opens `/expertise`, sees their packs, opens one, reads and
edits their rules in plain language, presses one button to get a working desk, runs it
from the UI, and can always click from any audit verdict back to the rule — and from any
ingested rule back to the source page it came from. Until that's true in the UI, it isn't
real.
