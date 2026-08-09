# Expertise System productization — the full end-to-end work order

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
| Strunk Edit Desk workflow (edit-shape) | workflows.aimatrx.com, COMPILED from pack #2 | `4b21a75f-0b6a-4d87-987d-e8e404355f15` |
| Generic Pack Auditor agent (cheap tier, works for ANY pack) | agent catalog | `7c3a0689-d075-4c9f-8a7b-f023ced6a87c` |
| 7 desk-specific agents (Hopkins ×5, Strunk editor + chief) | agent catalog, search "Hopkins"/"Strunk" | ids in common-docs `projects/sme-poc-hopkins/build/agents_registry.json` |
| pack→desk compiler (script v1) | common-docs `projects/sme-poc-hopkins/build/pack_to_desk.py` | fetches pack via PostgREST, authors agents, emits workflow stamped `compiled_from_pack`+`pack_version` |
| Proof runs + expert verdicts | common-docs `projects/sme-poc-hopkins/deliverables/` | runs `041c1856…`, `82b8f7c8…`, `1294a17e…` ($0.19–$0.37 each) |
| System-of-record doc | common-docs `systems/expertise-packs/FEATURE.md` | invariants + compilation contract |

Model tiers used (keep): cheap `bd68e0a8…` Gemini 3.1 Flash Lite · mid `979205fd…` Gemini 3.5 Flash · top `617abdcd…` Claude Sonnet 5.

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

### Phase 6 — Hardening (parallel-friendly small tasks)

- Structured outputs: move auditor/generator/editor agents to `response_format=json_schema`
  (schema gate exists) instead of fence-parsing; enforce "cited principle ids ⊆ passed
  section" mechanically in the workflow (data.assert node) — today it's prompt-only.
- Regenerate aidream ORM model for `expertise_pack` (`python db/generate.py` on a machine
  with DB env) — tracked in aidream FOUND_DEFECTS, plus these other filed defects worth
  fixing en route: workflow validation should catch registered-literal failures pre-run;
  `source_feature` should be data not a code tuple; agent variables render dicts as
  Python repr (`str(value)` in matrx_ai/agents/variables.py); `iam.apply_rls` doesn't
  GRANT (new tables 42501 until granted by hand); a `register_entity()` helper for the
  entity_types + sharing-registry + apply_rls + grants four-step.
- Pack versioning UX: immutable version snapshots (add `expertise_pack_version` sibling
  table or JSONB history) so a desk can show a diff between its compiled version and head.
- Run-history surface on the desk page: cost, duration, verdicts per run (all in
  `workflow.run` + `workflow.node_outcome` already — just render it).

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
