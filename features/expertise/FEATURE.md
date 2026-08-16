# Expertise — packs, rules, desks (the SME system's UI home)

> **The one-line law (cross-repo, canonical: common-docs `systems/expertise-packs/FEATURE.md`):**
> an expert's knowledge lives in a PACK (data, versioned, citable), never in prose inside an
> agent prompt. Desks are COMPILED from packs; auditors consume pack principles verbatim;
> every audit verdict cites a rule id. This feature is the UI where a non-technical expert
> sees, edits, and grows their pack — Arman's ruling: *nothing is real until a normal user
> can see it and do it in the UI.*

## Status

- **Live:** `/expertise` (entity-list shell), `/expertise/[id]` (rule editor + "Create a desk"
  compile dialog + "From a source" ingest dialog + "Interview me" side sheet), `/expertise/[id]/desks`
  (compiled desks + version-drift flags), `/expertise/admin` (feature map).
- **The guided start (2026-08-15):** "New pack" is now the four-question intake from the
  distillation vision (goal · who runs it · where the knowledge lives · stakes → stored on
  `metadata.intake`), then routes by source: knowledge in-head/unsure → `/expertise/[id]?interview=1`
  (interview sheet auto-opens); written-down/someone-else's → the pack page with the document lane.
- **The interview lane:** `PackInterviewPanel` (AskTutor pattern — useAgentLauncher +
  AgentConversationColumn in a Sheet) talks to the **Expertise Interviewer** agent
  (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`, Sonnet 5, variable `pack_id`), which holds the
  server-side `expertise_pack` tool and lands draft rules on the pack AS the expert talks; the
  panel watches the pack row's `version` while open and refreshes the page behind the sheet.
- **The file lane (2026-08-16):** "From a source" now offers *Paste the text* or *Upload a file*.
  An upload goes through the canonical file handler (`useFileUpload` — never a hand-rolled
  upload) and then `POST /expertise-desks/ingest-file`: a document is read page by page
  (content_processing + a page-extraction job running the same distiller slots), so each rule
  comes back anchored to real pages; a recording is transcribed first and takes the text lane.
  `RuleProvenance` renders those anchors as DOORS — the page numbers, a link to the source file,
  and a link to the extraction that read it — and flags a quote that failed verbatim
  verification.
- **Server half:** aidream `services/expertise_desks` (compile) + `services/expertise_ingest`
  (text + file/PDF/audio lanes + the `expertise_pack` tool, one shared rule builder
  `build_draft_rules` and one shared CAS write path `pack_writes.py`).
- **Next (work order: docs/handoffs/expertise-system-productization.md):** the Arman-SEO honest test
  (pack `arman-seo-method` scaffolded, draft, owned by Arman — the interview lane now unblocks it).

## Data

- **Table:** `platform.expertise_pack` (Matrx Main). JSONB columns get their app shapes in ONE place:
  [`types.ts`](./types.ts) (`PackPrinciple`, `PackSections`, `PackSource`). Never re-declare beside a consumer.
- **Rules (`principles` JSONB array):** `{id, name, section, statement, rationale?, quote?, detection?,
  severity, retired?, draft?, source_ref?}`. `id` is the citable handle — audits cite it; never rewrite
  an existing rule's id. `retired` keeps history; `draft` marks agent-suggested rules awaiting the
  expert's line-by-line approval (human-first invariant — ingestion NEVER auto-activates).
- **Versioning:** every save through `savePrinciples` bumps `version` with an optimistic lock on the
  loaded version (concurrent edit → readable conflict error, no silent overwrite).
- **Desks:** `workflow.definition` rows whose `metadata` carries `compiled_from_pack` + `pack_version`
  (the compiler stamp). Drift = `pack_version < pack.version` → the desks page flags "recompile"
  AND opens the rule-level diff (below) — a drift badge without it states a timestamp, not a verdict.
- **Version history — NO pack-specific table.** `platform.expertise_pack` was enrolled in the
  platform-wide version capture on 2026-08-16 (`platform._version_capture` → `history.row_versions`,
  the same store 138 tables already use); the pack had declared `is_versioned` since day one and
  simply never had the trigger. The browser cannot read the `history` schema, so two SECURITY DEFINER
  RPCs expose ONE pack's history — `expertise_pack_versions` / `expertise_pack_snapshot` — behind a
  gate that mirrors the table's own `std_select` RLS predicate exactly. Migration record: aidream
  `db/migrations/platform_expertise_pack_version_history.sql`.
- **The diff is a pure module:** [`packDiff.ts`](./packDiff.ts). It counts only the COMPILED set
  (the aidream compiler drops `draft` and `retired` rules), so an unapproved draft is never reported
  as drift — it is listed separately as "waiting on you". A version older than capture has NO
  snapshot: the dialog says so and never invents a diff.

## Files

- `service.ts` — detail reads/writes (getPack, savePrinciples, createDraftPack, updatePackMeta,
  softDeletePack, listDesksForPack). Direct supabase-js, RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain PostgREST —
  no per-feature RPC yet at this population; upgrade to `exp_list_scoped` RPCs when packs are many),
  `columns.tsx`, `listConfig.tsx`, `useExpertiseRowActions.tsx`, `components/ExpertiseBrowsePage.tsx`,
  `components/NewPackDialog.tsx`.
- `components/detail/PackDetailPage.tsx` + `RuleEditorDialog.tsx` — the expert surface. Plain language
  only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a requirement,
  not a style choice (THE MISMATCH RULE).
- `components/desks/PackDesksPage.tsx` — desks list, run links into workflows.aimatrx.com,
  recent-run history, and the owner-only backtest + feedback doors.
- `components/desks/TryDeskBox.tsx` — "Try your desk" in place: starts the run (adoptForeignStream +
  followWorkflowRunStream), narrates real node stages, renders the verdict through RichDocument.
  **A refresh rejoins the run** — the run id is kept per desk in sessionStorage
  (`matrx.expertise.desk-run.<deskId>`), and on mount the run row decides: still going →
  `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed replays the node
  lifecycle so the stage list rebuilds), finished → the verdict shows directly.
- `components/desks/BacktestDialog.tsx` — "Compare to the original" (R2 outcome signal). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.

## Registration

- Entity token `expertise_pack` (platform.entity_types, pre-registered) + FE overlay in
  `features/scopes/registry/entityRegistry.ts` (`hrefFor` → `/expertise/{id}`; peek falls back to
  RegistryPeek automatically).
- `platform.shareable_resource_registry.url_path_template` = `/expertise/{id}` (updated live 2026-08-10).
- Sidebar: `features/shell/constants/nav-data.ts` ("Expertise").

## Invariants

1. **Human-first:** anything machine-generated lands as `draft: true` rules or a `status='draft'` pack;
   the expert approves in this UI. No auto-activation, ever.
2. **Version honesty:** desks display the pack version they were compiled from; a stale desk is flagged,
   never silently drifting — and the flag opens the rule-level diff of what actually moved.
   Absent history is stated, never papered over with a diff against the current rules.
3. **Copy is for a brilliant NON-technical expert** — a doctor must be able to correct their rulebook here.

## Change log

- 2026-08-10 — Feature created (Phase 1): list, detail rule editor (add/edit/retire, version bump,
  optimistic lock), desks page with drift flags, admin map, sidebar + entity registry wiring.
- 2026-08-10 — Phase 2 FE: CompileDeskDialog ("Create a desk", streams /api/expertise-desks/compile).
- 2026-08-10 — Phase 3 FE: IngestSourceDialog ("From a source", streams /api/expertise-desks/ingest;
  drafts + quote-verification summary).
- 2026-08-12 — Verified both aidream services in the production SHA and removed the stale
  pre-deploy status.
- 2026-08-15 — The distillation start: intake-first NewPackDialog (four questions →
  metadata.intake → lane routing), PackInterviewPanel + InterviewButton (live interview lane,
  Expertise Interviewer agent + expertise_pack tool), empty state offers interview first;
  dropped the stale api-types casts; listConfig sourceFeature → "expertise".
- 2026-08-16 — File/PDF/audio ingest lane: IngestSourceDialog gained the upload option
  (canonical `useFileUpload` → `/expertise-desks/ingest-file`), `RuleProvenance` renders page
  anchors + links back to the source file and its extraction, and a stream `fatal_error` now
  reaches the user instead of "the ingestion reported a problem" (both lanes). Browser-verified:
  a 2-page PDF → 4 page-anchored draft rules, every quote verified word-for-word.
- 2026-08-16 — Desks page: per-desk recent-run history (status, age, duration, summed node cost; each row opens the run in the studio).
- 2026-08-16 — TryDeskBox survives a page refresh (remembered run id + `attachWorkflowRun` rejoin,
  or the verdict it reached while away), and a finished run offers "Compare to the original" beside
  the verdict with the desk's own output prefilled into the backtest (owner-only).
- 2026-08-16 — Pack version snapshots: the table joined the platform-wide version capture (no new
  table — see Data), and the desks-page drift flag gained "See what changed" (`PackDriftDialog` +
  the pure `packDiff.ts`) showing rules gained, rules retired, and rules reworded field by field.
  Browser-verified against a desk built from v3 of a live pack: with only drafts added it reported
  "nothing this desk enforces has changed" plus the pending-draft count; after one real rule edit it
  reported "1 rule reworded" with the before/after text.
