# Masterwork — Rulebooks, rules, Masterworks (Masterwork Studio's UI home)

> **Vocabulary is settled** ([`common-docs/systems/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md)
> § Settled — Masterwork; work order: [`docs/handoffs/masterwork-distillation.md`](/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/masterwork-distillation.md)):
> **Rulebook** (was pack) · **a Masterwork** (was desk) · **Build** (was compile) ·
> **Audition** (was backtest) · **Scout** (was Expertise Interviewer) · **Approach**
> (was lane/mode). This feature directory was renamed from `features/expertise/`
> on 2026-08-17 and the code now speaks the canonical words.

> **The one-line law:** an Expert's knowledge lives in a RULEBOOK (data, versioned,
> citable), never in prose inside an agent prompt. Masterworks are BUILT from
> Rulebooks; auditors consume the rules verbatim; every audit verdict cites a rule
> id. This feature is the UI where a non-technical Expert sees, edits, and grows
> their Rulebook — Arman's ruling: *nothing is real until a normal user can see it
> and do it in the UI.*

## Status

- **Live:** `/masterwork` (Masterwork Studio — entity-list shell), `/masterwork/[id]`
  (rule editor + "Build a Masterwork" dialog + "From a source" ingest dialog +
  "Interview me" side sheet), `/masterwork/[id]/masterworks` (built Masterworks +
  version-drift flags), `/masterwork/admin` (feature map), `/encore` + `/encore/[id]`
  (the Operator surface — see the Encore bullet below).
- **The guided start (2026-08-15):** "New Rulebook" is the four-question intake from the
  Distillation vision (goal · who runs it · where the knowledge lives · stakes → stored on
  `metadata.intake`), then routes by source: knowledge in-head/unsure → `/masterwork/[id]?interview=1`
  (Scout interview sheet auto-opens); written-down/someone-else's → the Rulebook page with the
  document Approach.
- **The Scout interview Approach:** `ScoutInterviewPanel` (AskTutor pattern — useAgentLauncher +
  AgentConversationColumn in a Sheet) talks to the **Scout** agent
  (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`, Sonnet 5, variable `rulebook_id`), which holds the
  server-side `rulebook` tool and lands draft rules on the Rulebook AS the Expert talks; the
  panel watches the Rulebook row's `version` while open and refreshes the page behind the sheet.
- **The file Approach (2026-08-16):** "From a source" offers *Paste the text* or *Upload a file*.
  An upload goes through the canonical file handler (`useFileUpload` — never a hand-rolled
  upload) and then `POST /masterworks/ingest-file`: a document is read page by page
  (content_processing + a page-extraction job running the distiller Mandates), so each rule
  comes back anchored to real pages; a recording is transcribed first and takes the text lane.
  `RuleProvenance` renders those anchors as DOORS — the page numbers, a link to the source file,
  and a link to the extraction that read it — and flags a quote that failed verbatim
  verification.
- **Encore (2026-08-17) — the Operator door.** `/encore` (released Masterworks the viewer can
  reach, shelved mine / my-orgs / public) and `/encore/[id]` (the run experience). A Masterwork
  is **draft** until the Expert presses **Release** on the Studio's Masterworks page
  (`metadata.released_at` stamp on workflow.definition, guarded CAS on `version` via
  `setMasterworkReleased`); **only released Masterworks appear on Encore**, and the Encore run
  page refuses a draft (doors the Rulebook owner to the Studio instead). Operator copy is
  jargon-free (THE MISMATCH RULE): "Run", "What it does", "By <expert>" — never "workflow" /
  "compile" / version numbers. Doors both ways: card/name → `/encore/{id}`; "By <expert>" →
  `/masterwork/{rulebookId}` (rendered only when the viewer can read the Rulebook); Rulebook
  owner gets a quiet "Open in Studio"; Studio gets "View in Encore" once released; every run
  row opens in the workflows app. Run machinery is the canonical `TryMasterworkBox` (typed run
  start + adoptForeignStream + followWorkflowRunStream + refresh rejoin) — never a second
  renderer. Files: `encore/service.ts` (VIEW-LAW scoped reads + per-Operator run history),
  `encore/EncoreHomePage.tsx`, `encore/EncoreRunPage.tsx`; nav child "Encore" under
  Masterwork Studio. Deliberately deferred: a "shared with me" shelf (no generic
  shared-with-me list filter exists yet — lib/list-scope Brief 3A; add the shelf when it lands).
- **Server half:** aidream Masterwork services (Build + ingest Approaches + the `rulebook`
  tool, one shared rule builder and one shared CAS write path).
- **Next (work order: docs/handoffs/masterwork-distillation.md):** the Arman-SEO honest test
  (Rulebook `arman-seo-method` scaffolded, draft, owned by Arman — the interview Approach
  unblocks it).

## Data

- **Runs — `platform.masterwork_run` (2026-08-17; renamed from `expertise_run`).** Every long
  pipeline (build · ingest · ingest-file · audition) claims a row here BEFORE its first AI call,
  heartbeats every 60s, and persists its terminal status + error + result. It is a **COMPONENT
  of its Rulebook** — access IS the Rulebook's access, so `created_by` is an audit stamp and
  appears in no policy (THE COMPONENT OWNERSHIP LAW), and `is_versioned` is false so a heartbeat
  never writes a history row. The browser stores only the run id and rejoins by it; **never**
  re-derive a run's state client-side. Server: aidream durable-run services ·
  `POST /masterworks/runs/{run_id}/rejoin`.
- **Table:** `platform.rulebook` (Matrx Main; renamed from `expertise_pack`, JSONB column
  `rules` renamed from `principles`). JSONB columns get their app shapes in ONE place:
  [`types.ts`](./types.ts) (`RulebookRule`, `RulebookSections`, `RulebookSource`). Never
  re-declare beside a consumer.
- **Rules (`rules` JSONB array):** `{id, name, section, statement, rationale?, quote?, detection?,
  severity, retired?, draft?, source_ref?}`. `id` is the citable handle — audits cite it; never rewrite
  an existing rule's id. `retired` keeps history; `draft` marks agent-suggested rules awaiting the
  Expert's line-by-line approval (human-first invariant — ingestion NEVER auto-activates).
- **Versioning:** every save through `saveRules` bumps `version` with an optimistic lock on the
  loaded version (concurrent edit → readable conflict error, no silent overwrite).
- **Masterworks:** `workflow.definition` rows whose `metadata` carries `built_from_rulebook` +
  `rulebook_version` + `masterwork_kind` (the Build stamp) + `released_at` (the Expert's
  release stamp; absent = draft, Studio-only — an Operator can never run a draft). Drift = `rulebook_version <
  rulebook.version` → the Masterworks page flags "rebuild" AND opens the rule-level diff (below)
  — a drift badge without it states a timestamp, not a verdict.
- **Version history — NO Rulebook-specific table.** `platform.rulebook` was enrolled in the
  platform-wide version capture on 2026-08-16 (`platform._version_capture` → `history.row_versions`,
  the same store 138 tables already use). The browser cannot read the `history` schema, so two
  SECURITY DEFINER RPCs expose ONE Rulebook's history — `rulebook_versions` / `rulebook_snapshot`
  (args `p_rulebook_id`) — behind a gate that mirrors the table's own `std_select` RLS predicate
  exactly.
- **The diff is a pure module:** [`rulebookDiff.ts`](./rulebookDiff.ts). It counts only the
  ENFORCED set (the aidream Build drops `draft` and `retired` rules), so an unapproved draft is
  never reported as drift — it is listed separately as "waiting on you". A version older than
  capture has NO snapshot: the dialog says so and never invents a diff.

## Files

- `service.ts` — detail reads/writes (getRulebook, saveRules, createDraftRulebook,
  updateRulebookMeta, softDeleteRulebook, listMasterworksForRulebook). Direct supabase-js,
  RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain
  PostgREST — no per-feature RPC yet at this population), `columns.tsx`, `listConfig.tsx`,
  `useRulebookRowActions.tsx`, `components/MasterworkStudioPage.tsx`,
  `components/NewRulebookDialog.tsx`.
- `durable-run/useMasterworkRun.ts` — the ONE way a dialog here runs something long. A face over
  `lib/durable-run/useDurableRun.ts` (shared with SEO): remembers the run id, rejoins on load,
  settles from server truth, keeps a finished answer across a refresh. Both ingest lanes share one
  run (one dialog, one answer, one pointer). Never fork it — add a `DurableRunWire` instead.
- `components/detail/RulebookDetailPage.tsx` + `RuleEditorDialog.tsx` — the Expert surface. Plain
  language only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a
  requirement, not a style choice (THE MISMATCH RULE).
- `components/detail/BuildMasterworkDialog.tsx` — "Build a Masterwork" (streams
  `POST /masterworks/build` as a durable run).
- `components/detail/IngestSourceDialog.tsx` — "From a source" (paste →
  `POST /masterworks/ingest`; upload → `POST /masterworks/ingest-file`).
- `components/detail/ScoutInterviewPanel.tsx` — the Scout interview Approach (side sheet).
- `components/masterworks/MasterworksPage.tsx` — Masterworks list, run links into
  workflows.aimatrx.com, recent-run history, and the owner-only Audition + feedback doors.
- `components/masterworks/TryMasterworkBox.tsx` — "Try your Masterwork" in place: starts the run
  (adoptForeignStream + followWorkflowRunStream), narrates real node stages, renders the verdict
  through RichDocument. **A refresh rejoins the run** — the run id is kept per Masterwork in
  sessionStorage (`matrx.masterwork.run.<masterworkId>`), and on mount the run row decides:
  still going → `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed
  replays the node lifecycle so the stage list rebuilds), finished → the verdict shows directly.
- `components/masterworks/AuditionDialog.tsx` — "Compare to the original" (the Audition). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.
  Streams `POST /masterworks/audition`; verdict event `masterwork_audition_verdict`.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.

## The Approach Registry — `platform.approach` (2026-08-17)

**"Intake is a registry of Approaches, never a hardcoded flow."** The
"how do you want to do this?" step of `NewRulebookDialog` renders the ENABLED
rows of `platform.approach` (canonical system-variant catalog table; family
`'distillation'`; seeded: `interview` · `source` · `exemplar` · `file`) as
Expert-language cards — label, blurb, "You bring", time shape — read directly
via supabase-js in [`browse/approaches.ts`](./browse/approaches.ts). The
knowledge-lives answer marks one card "Suggested for you" (soft hint, never a
route); the chosen row's `intake_query` is appended to `/masterwork/{id}`
(interview carries `{"interview":"1"}` so the Scout opens on arrival), and the
chosen key lands on `metadata.intake.approach` for the Scout to read.

**Every rule says which Approach produced it:** the server lanes stamp
`source_ref.approach = <key>` through the one shared rule builder (aidream
`services/distillation/` — see its FEATURE.md § The Approach Registry);
`RuleProvenance` shows it subtly ("via the … Approach"). Additive — old rules
keep their shape.

**Adding Approach #5 = a ROW** when its `mandate_key` exists and its
`intake_query` points at an existing lane surface — it shows in the picker
with zero code. A genuinely new lane implementation (new surface, new server
pipeline) is what still takes code. Never hardcode an Approach list again.

## Registration

- Entity token `rulebook` (platform.entity_types; renamed from `expertise_pack`) + FE overlay in
  `features/scopes/registry/entityRegistry.ts` (`hrefFor` → `/masterwork/{id}`; peek falls back to
  RegistryPeek automatically).
- `platform.shareable_resource_registry.url_path_template` = `/masterwork/{id}`.
- Sidebar: `features/shell/constants/nav-data.ts` ("Masterwork Studio").

## Invariants

1. **Human-first:** anything machine-generated lands as `draft: true` rules or a `status='draft'`
   Rulebook; the Expert approves in this UI. No auto-activation, ever.
2. **Version honesty:** Masterworks display the Rulebook version they were built from; a stale
   Masterwork is flagged, never silently drifting — and the flag opens the rule-level diff of what
   actually moved. Absent history is stated, never papered over with a diff against the current
   rules.
3. **Copy is for a brilliant NON-technical Expert** — a doctor must be able to correct their
   Rulebook here.
4. **Review states are transient, and the Scout must clear them.** A rule can be `draft`,
   approved, `rejected` (+ the Expert's written reason in `feedback`), or `retired`
   (`ruleState()` in `types.ts` is the ONE precedence). `feedback` on any rule is a
   request-changes note. The Scout resolves all open feedback every turn through the `rulebook`
   tool: a rejected rule is rewritten per the feedback (re-queued as a fresh draft) or
   withdrawn; a change request is applied in place (an APPROVED rule stays approved). Applying
   feedback consumes it; the Expert approving clears it. A rejected rule always keeps
   `draft: true` so a Build can never include it. Approve-all never touches rejected rules.
5. **Every textarea in this module is `ProTextarea`** (mic + transcription) — the Expert talks,
   never types, unless they want to.

## Change log

- 2026-08-17 — **Encore shipped** (the Operator door): `/encore` + `/encore/[id]`, the
  draft→released lifecycle (`metadata.released_at`, Release/Un-release in the Studio with a
  guarded version CAS), Studio↔Encore doors both ways, per-Operator run history, nav entry.
  Also fixed: `TERMINAL_STATUSES` missed `errored`/`abandoned`, so a run that errored mid-run
  left TryMasterworkBox "Working…" forever; live Masterwork descriptions cleaned of retired
  vocabulary ("Compiled from Expertise Pack") and raw UUIDs (build.py no longer embeds the id).
- 2026-08-17 — **The review loop closes both ways** (Arman's feedback): Reject-with-feedback and
  Request-changes on every rule (`RuleFeedbackDialog`), rejected/change-requested badges + the
  feedback shown on the rule row, the Scout receives `open_feedback` from the `rulebook` tool
  read and its instructions require clearing it every turn (aidream
  `services/distillation/tools.py` + the `masterwork_scout` DB agent). Plus the focus review
  wizard (`RuleReviewWizard` — one rule at a time, approve/reject/edit/skip, auto-advance) and
  the gamified KPI strip (`RulebookKpiStrip` — approved/waiting/rejected counts, review-progress
  bar, next-step encouragement). All module textareas moved to `ProTextarea`.
- 2026-08-17 — **The Masterwork rename executed** (lexicon ruled 2026-08-16). Feature dir
  `features/expertise/` → `features/masterwork/`; routes `/expertise*` → `/masterwork*` (no
  redirects — the old namespace is gone); components renamed (NewRulebookDialog,
  RulebookDetailPage, MasterworksPage, MasterworkDriftDialog, ScoutInterviewPanel,
  BuildMasterworkDialog, TryMasterworkBox, AuditionDialog, MasterworkStudioPage); types renamed
  (Rulebook/RulebookRule/Masterwork/…); DB contract moved to `platform.rulebook` (`rules`
  column), `platform.masterwork_run`, RPCs `rulebook_versions`/`rulebook_snapshot`; API prefix
  `/masterworks/*`; stream events `masterwork_*`; workflow metadata `built_from_rulebook` /
  `rulebook_slug` / `rulebook_version` / `masterwork_kind`; entity token `rulebook`; all ~90
  user-visible strings speak Rulebook / Masterwork / Build / Audition / Scout. Also fixed the
  intake name derivation to truncate on a word boundary (handoff defect #3).
- 2026-08-17 — Guided-start authoring fields now use the canonical `ProTextarea` / `ProInput`
  primitives.
- 2026-08-17 — **Refresh-fragility CLOSED (THE FLOATING LAW's durable half).** Both dialogs
  survive a reload via the durable run row (`platform.masterwork_run`), announced as the first
  stream event, heartbeated, rejoined with `POST /masterworks/runs/{run_id}/rejoin`. A dialog
  whose run is still going REOPENS ITSELF after a reload; a finished run's answer is restored
  from the row.
- 2026-08-16 — File/PDF/audio ingest Approach; RuleProvenance page anchors + doors; per-Masterwork
  recent-run history; TryMasterworkBox refresh rejoin; version snapshots + rule-level drift dialog.
- 2026-08-15 — The Distillation start: intake-first dialog (four questions → metadata.intake →
  Approach routing), Scout interview panel, empty state offers the interview first.
- 2026-08-10 — Feature created: list, detail rule editor, Masterworks page with drift flags,
  admin map, sidebar + entity registry wiring; Build + ingest dialogs.
