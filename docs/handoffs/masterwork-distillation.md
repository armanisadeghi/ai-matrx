# Masterwork — Distillation → Rulebook → Build → a Masterwork

> Vocabulary authority: [`common-docs/systems/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md).
> Cross-repo system-of-record: [`common-docs/systems/masterwork/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/masterwork/FEATURE.md).

**The spine:** an **Expert** → **Distillation** (many **Approaches**) → a **Rulebook** →
**Build** → a **Masterwork** (draft → released), proved by an **Audition**, run by an
**Operator** as an **Encore**.

## Part 0 — Arman's vision (unchanged; do not lose)

1. **UI-first is the reality test** — nothing is real without a UI a normal user can use.
2. **The system is for HUMANS first** — the product is the PROCESS that distills, never
   hand-authored rules. The dream: *"just talk for an hour, upload the audio, we do the rest."*
3. **chunk → extract → table → reference-back** is the ingestion play; reuse the document
   pipeline; every rule links to its source pages.
4. **The honest-evaluation caveat:** Hopkins/Strunk flatter us (models know them). The REAL
   test is Arman's own SEO method, judged by whether HE agrees with the output.
   **Still the gate. Still not run.**
5. **Agents are legitimate UI.**

## STATUS — live and verified (compressed)

- **CONVERSATIONS MADE FIRST-CLASS + THE INTERVIEW GOT A URL (2026-08-17, from Arman's live
  feedback: "I still can't seem to get the conversation chain back… if it's in the UI, it's
  hidden").** Diagnosis: NOT a data bug — his interview `4706f9c0-…` ↔ rulebook `8d1d4f08-…`
  edge exists, `assoc_for_entity` returns it under his uid, the conversation row is his and
  titled honestly; the chooser simply only ever rendered INSIDE the "Interview me" sheet. Fixes:
  `ConversationsSection` (features/masterwork/record/) now on `/masterwork/[id]` — every
  interview with Continue (in-panel resume), open-in-/chat, full-screen door, New interview,
  empty state; new route `/masterwork/[id]/interview` (`?conversation=` resume · `?new=1`
  fresh) rendering the SAME exported `ScoutInterviewContent` as the sheet ("Full page" door in
  the sheet header); admin map gained the interview + record routes. Verified in-browser on the
  Strunk Rulebook (2 interviews): section renders, Continue rehydrates history, route +
  deep-link resume load by URL, empty state on Hopkins, mobile 375 clean.
- **THE IMPROVEMENT BRAIN SHIPPED (2026-08-17, Arman GO on all recommendations).** The Approach
  selector + elicitation-move producer: `aidream/services/masterwork_assists/` (system of record:
  its FEATURE.md) raises `platform.assists` chips on `/masterwork/[id]` (AssistStrip under the KPI
  strip, surface `matrx-user/masterwork-rulebook`) — deterministic layer (thin/one-sided section →
  seeded section interview · 3+ approved rules → critique-a-bad-draft with a REAL weak draft
  generated at sweep time · unaddressed weak/losing Audition → the failure lever · no
  exemplar-sourced rules → ask for examples), move ledger on `rulebook.metadata.elicitation`
  (7-day re-offer gate; `research` move key registered but deferred), and the
  `masterwork.approach_selector` Mandate firing ONLY when deterministic found nothing (once/day
  cap). Two new DB agents on Gemini 3.7 Flash behind Mandates `masterwork.approach_selector` +
  `masterwork.bad_draft` (no seed fallback). Chips navigate to `?assist=<key>`; the page's
  `fetchAssistLaunch` (features/masterwork/assists.ts) opens the Scout panel seeded (never
  auto-sends) or the ingest dialog. Always the NORMAL priority band; live-cap 2 chips/Rulebook;
  hourly system task `masterwork_assists` (…386, handler-gated, migration 0386 ledgered). Proven
  live 11/11 by `aidream/scripts/_verify_masterwork_assists.py` on the SEO + Strunk Rulebooks,
  incl. dedupe/ledger idempotence and a generated bad draft.

- **THE UNDERSTUDY SHIPPED (2026-08-17, Arman approved all recommendations + ruled Gemini 3.7
  Flash).** The system runs from minute one: every Rulebook gets ONE free one-agent Masterwork
  (`ask -> understudy -> show`; mandate `masterwork.understudy`, DB agent `8bb1d53f-…`, model on
  the row) built at Rulebook creation with ZERO rules, rebuilt free + in place on every rules
  save from BOTH funnels (FE `saveRules`/`createDraftRulebook` → `POST
  /masterworks/understudy/refresh`; server `rulebook_writes` pokes itself for Scout writes).
  Approved rules are doctrine, drafts ride in a labeled unconfirmed block, rejected/retired never
  appear; every run ends with "How this gets better". Row: `metadata.understudy=true`,
  `engram_state='improvised'` (ladder untouched), never releasable, filtered out of the built
  list. FE: `features/masterwork/understudy/` — the "Your system is already running — try it"
  card on `/masterwork/[id]` (TryMasterworkBox verbatim, self-heals old Rulebooks) + KPI `live`
  hook. Verified live on Strunk: Understudy `118b9509-…`, refresh idempotence asserted, a REAL
  run completed on Gemini 3.7 Flash obeying the approved rules. Details: aidream
  `services/masterworks/FEATURE.md` § The Understudy.
- Scout `pack_id` variable residue: **FIXED live 2026-08-17** — `variable_definitions` renamed to `rulebook_id` with Rulebook-vocabulary helpText (direct DB write; agent_author refuses variables edits).

- **THE GUIDED START REBUILT IN THE HOUSE PATTERN (2026-08-17, Arman's "those stupid little small
  bubbles are horrible").** `NewRulebookDialog` DELETED; `/masterwork/new`
  (`features/masterwork/intake/NewRulebookFlow.tsx`) is now the one intake — a full page with big
  default-filled option tiles (every question pre-selected), the Approach picker as large
  registry-driven cards (suggested one pre-selected), wizard-draft persistence, and all entry
  points rewired (home buttons, Start-here tiles → `?approach=<key>`, Studio list button). House
  pattern is now written down: FEATURE.md § Guided intake follows the house pattern + a
  pattern-patrol nomination.
- **THE RECORD SHIPPED + interviews are properly associated (2026-08-17, Arman's "that's
  critical").** A Rulebook and its Scout conversations now share a canonical
  `platform.associations` edge (`conversation --interview--> rulebook`, registered pair;
  historical links backfilled from rule provenance + `chat.tool_trace`, including Arman's own
  37,455-character SEO interview, whose stale "Auto: expertise_interviewer" title was fixed).
  "Interview me" on a Rulebook with prior interviews now offers each of them (when, turns, words,
  rules produced, first line) with **Continue** / **Start a new interview** instead of silently
  minting a new conversation; Continue truly resumes. `/masterwork/[id]/record` ("Your words")
  shows every message, upload, and recording for one Rulebook with doors + copy-everything.
  `getExpertCorpus(rulebookId, rules)` is the ONE corpus contract the Final Checkup auditor should
  consume — do not re-derive it. Also extracted `features/agents/hooks/useConversationResume.ts`,
  the canonical resume sequence previously inline in `ChatRoomClient`.
- **DICTATED AUDIO IS NOW ATTRIBUTED AND PLAYS IN THE RECORD (2026-08-17, Arman's "we need that
  full tracking").** New generic `RecordingOrigin` (`features/audio/recordingOrigin.ts`) +
  `RecordingOriginProvider` — a surface WRAPS its subtree and every recording started inside is
  stamped at `transcripts.transcripts.metadata.origin` (existing jsonb column, **no schema
  change**); nothing was threaded through the shared mic chain and no other ProTextarea changed.
  `getExpertCorpus` gained `contribution.dictations[]` (additive), matched to a message only by
  VERBATIM substring — never guessed; unmatched audio becomes its own contribution. Door back on
  the transcript via `RecordingOriginRef`. **Arman's own 7 recordings are backfilled** onto
  conversation `4706f9c0…` at contiguous verbatim offsets. Open: pre-2026-08-17 dictations cannot
  be attributed without guessing, so they stay unattached. See `features/masterwork/FEATURE.md`
  § The Record and `features/audio/FEATURE.md` § The Recording Origin.
- **The Final Checkup UI is BUILT (2026-08-17)** — `features/masterwork/checkup/`, the
  `masterworkCheckupWindow` split-pane WindowPanel opened from the Rulebook header: findings streamed
  one at a time off the durable `checkup` run (`useMasterworkRun` surface `checkup`, final event
  `masterwork_checkup_complete`, per-finding event `masterwork_checkup_finding`), keyboard
  disposition (Y / N / arrows / U), an "Approve with AI" that only takes ≥80%-confidence findings and
  can be undone before anything is saved, and ONE CAS apply through `saveRules` (add appends · modify
  keeps the rule id · remove RETIRES) with a receipt + Undo. Dismissals are remembered on
  `platform.rulebook.metadata.checkup.dismissed`, fingerprinted `kind:target_rule_id:proposed_name`
  — **the checkup service should read that to suppress what the Expert already refused; this surface
  is its only writer.** Verified end-to-end against the live DB on the Strunk Rulebook (add → new
  rule, modify → rewritten in place with its id kept, dismiss → memory row, Undo → rules restored).
  **Waiting on the server lane only:** `POST /masterworks/checkup` does not exist yet, so the launch
  path is typed through a single documented cast in `useCheckupRun.ts` (`CHECKUP_PATH`) that becomes
  a plain constant the moment the route ships and `pnpm sync-types` runs. The FE also expects an
  optional `alternatives: proposed[]` on a finding (Arman: "where we have options they click to
  select the one that they want") — additive, ignored when absent.
- **The Final Checkup SERVER lane is LIVE (2026-08-17)** — aidream
  `services/masterwork_checkup/` (its `FEATURE.md` is the contract). `POST /api/masterworks/checkup`
  (durable operation `checkup`) and `POST /api/masterworks/clean-corpus` (operation `clean_corpus`)
  both exist, so `CHECKUP_PATH`'s documented cast in `useCheckupRun.ts` becomes a plain constant
  after `pnpm sync-types`. Event names match what the UI already listens for
  (`masterwork_checkup_progress` / `_finding` / `_complete`, plus `masterwork_corpus_progress` /
  `masterwork_corpus_cleaned`), the finding shape matches, `alternatives: proposed[]` is on the wire
  (empty until a producer offers choices), and the terminal event adds `evidence_rejected` /
  `already_dismissed` / `notes` / `corpus_cleaned`. **Your dismissal memory is read:** the service
  suppresses any finding whose `kind:target_rule_id:proposed_name` fingerprint is in
  `metadata.checkup.dismissed` — keep `dismissalFingerprint` byte-identical, it is a cross-repo
  contract now. Producer #1 is Mandate `masterwork.checkup_auditor` (Opus 5); cleanup is Mandate
  `masterwork.corpus_cleaner` and stays MANUAL (Arman's ruling) — the checkup consumes a saved clean
  from `rulebook.metadata.expert_corpus` but never triggers one. Proved live twice on Arman's SEO
  Rulebook `8d1d4f08-…`: identical 2 findings both runs, 0 evidence rejections, both real (a rule
  encoding a timeline Arman explicitly retracted, and a missing "match everything the page holding
  your target spot does well" rule).
- **Approaches are a REGISTRY, not an `if` (2026-08-17):** `platform.approach` (canonical
  system-variant catalog via `create_entity_table`; seeded interview/source/exemplar/file with
  mandate_key + intake_query) drives the NewRulebookDialog picker (registry cards, "Suggested
  for you" from the knowledge answer, row's `intake_query` routes); every lane stamps
  `source_ref.approach` through `build_draft_rules` / the `rulebook` tool; RuleProvenance shows
  it. Add-an-Approach-with-an-existing-lane = a row, zero code — contract in both FEATURE.mds.
- **The monologue (recording) lane is real (2026-08-17)** — "just talk for an hour, upload
  the audio" no longer delegates to the text lane. Audio/video → timed transcript chunks →
  mandate `masterwork.monologue_distiller` (new DB agent purpose-built for rambling spoken
  monologue; per-rule `confidence`, emits `gaps`) → drafts anchored with
  `source_ref.time_range` (start/end seconds) + `approach: "monologue"` (registered
  `platform.approach` row, enabled=false — the entry point stays the file card);
  RuleProvenance renders "at 12:34–15:02" and flags low-confidence rules. Gaps dedupe into
  `masterwork_ingest_complete.followup_seed`; the ingest dialog offers "Interview me about
  the gaps" → the Scout panel opens seeded. Transcript cap 320 chunks (long sessions grind
  under bounded concurrency with per-portion progress, never refuse; matrx-batch is the
  noted route if that cap is ever hit for real). Verified in-process against the live DB;
  document ingest still runs the source distiller. Details: aidream
  `services/distillation/FEATURE.md`.
- **The full loop is LIVE on `/masterwork`:** guided intake → Scout interview
  (`masterwork_scout` `4a0b2f8e-…`, `rulebook` tool) or source/exemplar/file ingest → Expert
  review → Build → run in place → "What did it get wrong?" → Audition → gaps become drafts.
- **The vocabulary rename EXECUTED end-to-end 2026-08-17** — DB (`platform.rulebook` + `rules`
  col, `platform.masterwork_run`, RPCs `rulebook_versions`/`rulebook_snapshot`, entity tokens,
  8 mandate keys `masterwork.*`, tool `rulebook`, all live agent/workflow/Rulebook rows incl.
  instruction text + `[[masterwork_name]]`/`[[rulebook_source_line]]` template placeholders),
  aidream (`services/masterworks/` + `services/distillation/`, `/masterworks/{build,ingest,
  ingest-file,audition,runs/{id}/rejoin}`, `masterwork_*` events, `rulebook_*`/`masterwork_*`
  error literals, attribution slug `masterwork`), matrx-frontend (`features/masterwork/`,
  `/masterwork` routes — old namespace deleted, no redirects), docs, generated types both
  repos, migration record `aidream/db/migrations/masterwork_vocabulary_rename.sql` (ledgered).
  Type-check green; registry parity tests green; browser-verified on the dev server.
- **The review loop closes both ways (2026-08-17, Arman's feedback):** per-rule
  **Reject with feedback** (transient `rejected` + `feedback`; rule keeps `draft:true` so a
  Build can never include it) and **Request changes** on any rule (approved stays approved).
  The `rulebook` tool returns `open_feedback` on read; the Scout's instructions require
  clearing every item each turn — rewrite-and-requeue (fresh draft), or withdraw; applying
  feedback consumes it; the Expert approving clears it. Approve-all never touches rejected.
  **Focus wizard** ("Review one by one" — card at a time, approve/reject/edit/skip,
  auto-advance) + **gamified KPI strip** (approved/waiting/with-the-interviewer tiles,
  review-progress bar, next-step encouragement). Every textarea in the module is
  **ProTextarea** (mic + live transcription). Browser-verified end-to-end: a live rejected
  rule (`never-open-with-brand-name`, Strunk) is sitting in the Scout's queue as a demo.
- **Adversarial round (2026-08-17) closed:** an independent attacker confirmed wire parity,
  mandate sync, CAS discipline, the citation gate, and agent-write invariants all HELD; its 8
  confirmed defects are FIXED and pushed — the editor path now consumes review state (a
  hand-fixed rejected rule can never reach a Build while reading "with the interviewer"),
  the wizard stops on failed saves instead of counting them, rejected rules have a
  self-service "Reconsider" exit, pre-rename history rows retagged (version log/snapshots
  whole again), stored `expertise_pack` envelopes resolve via a legacy alias (+ manifests
  remirrored), the Scout now runs through the `masterwork.scout` Mandate (hardcoded UUID
  deleted; mandate seeded live), the auditor agent row/tool copy renamed, matrx-extend
  generated types refreshed, the tool sees `retired` and coerces section shapes, Audition
  judges APPROVED rules only, and stale `processing` run rows are repaired in the ledger.
- **Hindsight enrollment LIVE for all five mandate agents (2026-08-17):** Scout re-armed
  (`604cfd49`), source/exemplar distillers + audition judge created (`19d16422`/`c550588c`/
  `195e6747`, all n=10), rulebook auditor was already active (`37b7dedb`, n=5). The Expert's
  reject/change-request verdicts already reach the reviewer through the Scout's own transcripts
  (`open_feedback` on every `rulebook` read); enrollment `goal`s point the reviewer at them —
  no new outcome pipeline built, on purpose. Details: aidream
  `aidream/services/masterworks/FEATURE.md` § Hindsight enrollment.
- **Encore SHIPPED (2026-08-17) — the Operator door exists.** Draft→released lifecycle on the
  Masterwork (`workflow.definition.metadata.released_at`; Release/Un-release on the Studio's
  Masterworks page, guarded CAS on `version`, direct supabase-js — RLS `std_update` covers it,
  no server hop). `/masterwork/encore` (moved from `/encore` 2026-08-17, pre-launch, no
  redirects) lists released Masterworks by declared scope (mine/orgs/public,
  VIEW-LAW predicates; "shared" shelf deferred until the generic shared-with-me filter exists —
  lib/list-scope Brief 3A) with jargon-free cards; `/masterwork/encore/[id]` is the run
  experience reusing
  `TryMasterworkBox` verbatim + the Operator's OWN run history. Doors both ways (By <expert> →
  Rulebook when readable; owner → Studio; Studio → View in Encore). Strunk `24df673f` is
  RELEASED and live on Encore (browser-verified, desktop+mobile+dark). Found+fixed live:
  `TERMINAL_STATUSES` missed `errored` (box spun forever on an errored run); live definition
  descriptions carried retired vocabulary + raw UUIDs (rows cleaned, build.py no longer embeds
  the id). NOTE: an Encore run start 422s / errors until production aidream picks up the
  mandate-aware runtime commits already on main — the FE surfaces both honestly.
- **Audition = the benchmark harness (2026-08-17):** judge routed through the platform Judge
  primitive (contract `masterwork.audition_judge` v2, agent v12, payload_json shape) writing
  `platform.judge_verdict` per arm; derived `quality_score` + Expert's own
  `expert_score`/`expert_verdict` land on `platform.masterwork_run`; opt-in three-way
  (`compare_vanilla` + `vanilla_input`, vanilla arm on the Masterwork's own primary-agent
  model) states "The Masterwork beat vanilla AI on N of M rules" — or the honest opposite.
  AuditionDialog now durable (`useMasterworkRun`), with history strip + "Your call" rating
  (100/50/0 = better-than-me / as-good / not-there, the judge's future calibration signal).
  Proven live on Strunk (run `244bdc6f`: quality 25.0, vanilla 0.0, beat 2 of 4 rules).
  Details: aidream `aidream/services/masterworks/FEATURE.md` § Audition.
- Fixed along the way: word-boundary name truncation (was defect 3), duplicate Audition judge
  soft-deleted (mandate pins `c55b52c9-…`), test residue removed (was defect 4), two
  unmirrored shareable-registry rows (`interview_session`, `workflow_runtime_surface`) added
  to the FE TS mirror.

- **The landing SHIPPED + routes settled (2026-08-17, Arman's green-lit brief).** `/masterwork`
  is now the module landing: guests get the marketing page (`MasterworkLanding` via the shared
  `ModuleLanding` shell, registered in `MODULE_LANDING_DIRECTORY` → appears on `/features`;
  spine: talk → rules you approve → a system that works exactly your way → proof against vanilla
  AI); signed-in Experts get the Masterwork HOME (`features/masterwork/home/`): Rulebook cards
  with review-progress KPIs, Masterworks with release state + quality trend
  (`platform.masterwork_run.quality_score` latest vs. previous), recent runs in Expert words,
  `platform.approach` "Start here" tiles (each opens NewRulebookDialog), and "How it's
  improving". The Rulebook list moved to `/masterwork/all`; Encore moved to
  `/masterwork/encore` (+ `/[id]`; old `/encore` deleted, no redirects). Nav children,
  FeatureAdminMap, and every internal link updated. Browser-verified: guest SSR (curl, 200 +
  marketing copy), authed home with live data, `/masterwork/all`, `/masterwork/encore` +
  run page, mobile 375, dark. Old `/encore` 404s; guest `/masterwork/all` → `/masterwork`;
  guest `/masterwork/encore` → login with destination preserved.
- **🚨 THE HINDSIGHT READ GAP (2026-08-17) — "How it's improving" renders the honest floor.**
  Arman ruled the Expert-facing panel in; the intended read (recent reviews, what they found,
  what changed) is NOT browser-readable today for two independent reasons: (1) the `hindsight`
  schema is not in PostgREST's exposed schemas (`schema_truth_snapshot.exposed_schemas`), so
  `supabase.schema("hindsight")` fails before RLS is even consulted; (2) RLS scopes
  `hindsight.enrollment` (and its components via `enrollment_id`) to `created_by` /
  `iam.has_access` — the five Masterwork enrollments are `visibility='personal'` rows owned by
  two admin accounts, and the two views (`v_change_history`, `v_finding_effectiveness`) are
  `security_invoker`, so they don't launder it. The aidream `/hindsight/*` REST surface is
  ownership/admin-scoped the same way, and adding an endpoint was explicitly out of this lane's
  scope. The shipped panel therefore reads ONLY truth a user can reach: `agent.mandate` (public
  rows, via `fetchMandatePins`) + `agent.definition` revision count / last-changed date /
  `updated_by_tier|updated_by_system` for the five bound agents — zero fabricated activity.
  **Closing it properly** = a deliberate access decision (likely a `SECURITY DEFINER` aggregate
  RPC returning de-identified review summaries for the five Masterwork mandates — never widening
  the enrollments to public, which would expose reviewer transcripts), then swapping
  `fetchImprovementRows` to consume it. Files: `features/masterwork/home/service.ts`
  (§ "How it's improving") + `HowItsImprovingPanel.tsx`.

## Decisions — RULED and EXECUTED 2026-08-17

**① RULED (Arman): a released Masterwork TRACKS its Mandates** — "all agents need to be mandate
aware." `ai.agent.start` now takes `mandate_key` (resolved on EVERY run; refuses when
unresolvable — no seed fallback); when `agent_id` sits beside it, the mandate wins and the id is
the build-time snapshot for drift display. Build (`masterwork_build v5`) stamps every shared
auditor node with `mandate_key: masterwork.rulebook_auditor` + snapshot; Editor/Maker/Chief stay
true pins (per-Masterwork authored artifacts no Mandate names). A Binding change reaches every
released Masterwork on its next run, no rebuild.

**② CLOSED: auditor contract renamed end-to-end** — `pack_source`→`rulebook_source`,
`principles`→`rules`, `principle_id`→`rule_id` across the live auditor agent row (prompt,
variables, output schema — via `update_agent`, auto-versioned), the mandate contract,
`build.py` schemas + citation gates, and BOTH live Masterworks rebuilt in-process as their
owner: Strunk `24df673f-d252-4075-b134-44ccbfdc5910`, Hopkins
`10daeb58-bde4-4c98-a2cc-e95164700a3b` (old rows kept — versioned artifacts, list is
newest-first). Verified from the DB: no old-contract token in either new definition.

## 🚨 THE 2026-08-17 DATA-LOSS INCIDENT — read before touching a live table rename

**What happened:** the live rename `platform.expertise_pack` → `platform.rulebook` was applied
while production still ran the pre-rename code. Arman was mid-interview dictating his SEO method.
Five tool calls died on `42P01 relation does not exist` — one carrying **11 finished expert rules**
(8,773 chars). From his side: he talked for an hour, the agent said it was saving, and the rules
never existed.

**Recovered** (2026-08-17): all 11 rules + 1 rationale update replayed from `chat.tool_trace.args`
through `rulebook_writes` into `8d1d4f08-…` (now v25, 28 rules, 12 awaiting review). They carry
`source_ref.recovered_from_failed_call`. Recovery was only possible because the trace happened to
store `args` — **forensics, not a feature.**

**The standing rules this earned:**
1. **Renaming a live table is a DEPLOY-ORDERED operation.** The old name keeps working until the
   new code is live (alias/view, or rename after deploy). Users are mid-session; the DB and the
   deployed code are never renamed in the same breath.
2. **An expert-content write that fails must never be silently lost** — the Expert gets a way back
   to their words without a database session. (Being built; see In flight.)
3. **The Expert's words are the asset.** Anything that makes them unreachable is a Sev-1 defect,
   even when the rows technically exist.

- **No raw UUID reaches the Expert (2026-08-17).** The first-turn variables strip printed
  `Rulebook id: 56d96d67-…` mid-interview — a machine-wired value the Expert never typed. Fixed
  generically in the ONE shared component (`FirstTurnVariables`, consumed only by
  `AgentUserMessage`, so every surface is covered): a bare UUID whose key names a known entity
  renders as an `EntityRef` (icon + open + peek); one that resolves to nothing is dropped, because
  an id the user can neither read nor open is noise. No per-surface patching needed.

## In flight (dispatched 2026-08-17, parallel sessions — do not duplicate)

Arman's post-incident directives, each with its own session. Coordinate by contract, not by
editing another lane's files.

| Lane | Scope |
|---|---|
| **The Record** | `platform.associations` edge Rulebook↔conversation (today there is NO link — a conversation is findable only by grepping `tool_trace.args`); resume-or-start-new on "Interview me"; a surface showing **everything the Expert has said** (every message, upload, transcript, and the audio if the ProTextarea mic persists it — that research is part of the lane). Exposes `getExpertCorpus(rulebookId)`. Owns `features/masterwork/record/` + `ScoutInterviewPanel`. |
| **Cleanup + the audit Mandate** | Reuses the Scribe/War-Room transcript cleanup to make a durable CLEAN version of the Expert's words, then a new Mandate `masterwork.checkup_auditor` (Opus 5, DB-defined) whose only job is *"did we screw up?"* — every finding grounded in a verbatim quote, scored for certainty, an empty result is a legitimate outcome. Owns `aidream/services/masterwork_checkup/`. |
| **Never lose a payload** | A failed expert-content write becomes a one-click restore for the owner (assists chip replaying through the CAS path, idempotent) + a loud `system_error`; plus the live-rename ordering rule written into the DB doctrine. Owns the tool-failure path. |

**The finding contract all lanes share:**
`{ id, kind: add|modify|remove, target_rule_id?, proposed?, reason, evidence (verbatim quote),
evidence_ref {conversation_id?, message_id?, file_id?, time_range?}, confidence 0-1, source }`

A second Checkup producer (a final pass through the interview agent) is a **seam, deliberately not
built** — Arman floated it and was explicitly unsure it earns its cost.

## Open work, in order

1. **The honest test (the gate).** Arman fills his SEO method through the Scout —
   `seo-keyword-optimization` `8d1d4f08-…` is the live one (28 rules; `arman-seo-method`
   `5d353449-…` is the older empty draft). The reject/feedback loop is ready for exactly this.
2. **Build-service consolidation** (vocabulary-campaign duplication finding ②):
   `services/masterworks/build.py` (~960 lines) hand-rolls what
   `matrx_ai/plans/compiler.py::compile_plan` does, except data-driven cast width + non-agent
   utility nodes. Bring a plan before touching; never delete first.
3. **Four Scouts, no shared primitive** (duplication finding ③): masterwork_scout, SEO Site
   Strategy Interviewer, GSC Site Intake Interviewer, Vision Interview openers.
4. **Distillation → Engram interface** (`common-docs/systems/engram/VISION.md` §5): emit
   candidate specialists/contracts/acceptance criteria, not just rules.

### Arman's rulings, 2026-08-17 (evening) — all five lanes GO

- **All lane recommendations approved as pitched** (Understudy, body_of_work corpus, dump,
  selector/moves, transcript import). All five Phase-2 builds dispatched simultaneously.
- **Model tiers:** the Masterwork mid-tier default is **Gemini 3.7 Flash** (promo pricing —
  Arman: "amazing for this stuff"); the smart tier is Opus 5 / a GPT model, later. Model
  choice ALWAYS lives on the DB agent row, resolved from the live catalog — never in code.
- **THE EXTERNAL-SOURCES RULE:** our own systems must never blind a lane to where the real
  data lives. Meetings: Google Meet, Teams, and Zoom are the leaders — the Meeting Scavenger
  must offer easy connections/import guides for them, not just our transcripts. Messages:
  email + SMS threads from iCloud, Google phones, WhatsApp. The transcript-import lane's
  provider-gallery + hand-holding-guide-page pattern is the HOUSE PATTERN for all external
  source onboarding; its components must be reusable for future galleries.

## The Approach build list — Arman's ruling 2026-08-17: "No idea is turned away until we test it and it sucks"

Every Approach below gets BUILT. The goal: so many ways of distilling that it is impossible
to get it wrong. Status moves here as lanes land.

**Pitched, awaiting Arman's per-lane answers (agents parked, briefs self-contained):**
1. Understudy (runs from minute one) · 2. Corpus / "Everything you've published" ·
3. Resource dump (+ company SOPs framing) · 4. Approach selector + move ledger + bad-draft
critique lane · 5. AI-transcript import (provider gallery + guides + zero-upload AI Matrx card)

**The creative ten (all approved to build; sequence after the five above):**
6. Meeting Scavenger — distill judgment moments from meetings the expert already records
   (MUST tap the platform's own meeting/transcript machinery)
7. Shadow-the-inbox — Understudy drafts real replies; the expert's edit diff is distilled
8. Red-Pen lane — markup + 5-second mic "why?" per strike-through
9. Bad Example probe — "what's wrong with this?" over generated decoys (feeds `detection`)
10. Oracle tap — capture the questions colleagues ask the expert + the answers. Arman's
    channel spec: (a) email-in address, (b) SMS (we have text messaging), (c) ✅ in-app: the
    message "..." actions menu gets "Add to Rulebook" beside create-task/create-note
    (SHIPPED 2026-08-17), and (d) ✅ the thumbs up/down on ANY agent response gets a tiny
    non-disruptive follow-up popover: "does this belong in one of your Rulebooks?" — a
    thumbs-up is Rulebook material whether or not a Masterwork produced it (SHIPPED
    2026-08-17; see STATUS). (a)+(b) remain open.
11. ✅ Hardest-Case Debrief — Critical Decision Method over one war story (interview
    variant) — SHIPPED 2026-08-17 (chip + Scout CDM instructions; see STATUS)
12. Exception Hunter — "when does this rule NOT apply?" per approved rule
13. Triad game — which two of three cases are alike, and why (repertory grid)
14. Prediction Ledger — cheap predictions on real cases, scored against outcomes
15. ✅ Vacation Trigger — succession-framed interview variant — SHIPPED 2026-08-17 (chip +
    Scout instructions; the registry row is deliberately not minted yet — the chip is the
    entry point, same as the monologue precedent)
Plus the cross-cutting **Masterwork M&M** — a standing 15-minute weekly worst-run review
ritual (delivery vehicle for 9/12 and the failure lever, not a lane).

### The overlap map (2026-08-17) — what each idea taps, verified against code

- ONE landing point for every lane: `rulebook_writes.py` — never a second write path.
- **Near-free** (existing machinery, content/config variants): #11 Hardest-Case Debrief +
  #15 Vacation Trigger (new ELICITATION_CHIPS sets + seedText on the existing panel);
  Oracle-tap in-app half — "Add to Rulebook" is one MenuItem in
  `messageActionRegistry.ts` beside create-task/create-note, and the thumbs follow-up
  popover rides `lib/output-feedback` (which ALREADY stores originalContent/
  correctedContent/prose on every thumbs click — no new table).
- **Harness reuse:** #9 Bad Example probe = Audition run in reverse-emphasis (same judge →
  gaps → draft rules); #12 Exception Hunter = one new producer in the `masterwork_checkup`
  harness (parallel-run, stream findings, approve/dismiss all reusable); #6 Meeting
  Scavenger reads the transcripts/War Room `studio_sessions` the platform already produces —
  the missing piece is only the judgment-moment detector.
- **#7 Shadow-the-inbox's diff primitive already exists**: `useOutputFeedback.captureCorrection`
  (AI draft vs corrected content, live on every thumbs button). Missing: the Understudy
  inbound path (outreach_inbound is CRM-shaped; needs a lightweight generic mode).
- **Transports confirmed live** for Oracle tap: inbound Gmail pipeline (needs a non-CRM
  correlation mode), SMS assistant programs (`sms_assistant.py` + `features/sms`), and the
  message-actions registry. Twilio voice relay exists if a voice Oracle is ever wanted.
- **Genuinely new, small:** the Triad item type (a proper content-ir kind through the quiz
  machinery, never a bespoke game engine); the Prediction Ledger's pending→resolved state
  table (scoring still via the ONE Judge mandate — never a second grader).

## Working notes that save hours

- Live ids: Rulebooks `hopkins-scientific-advertising` `f6267bca-…`, `strunk-elements-of-style`
  `e492a07f-…` (has 1 rejected rule waiting as a live demo), `arman-seo-method` `5d353449-…`
  (draft). Masterworks (current, mandate-aware): Strunk `24df673f-…`, Hopkins `10daeb58-…`
  (superseded builds `bf711bce-…` / `b0865c3b-…` kept as versioned artifacts). Scout `4a0b2f8e-…`.
- A real run costs ~$0.19, ~4 min, detaches server-side; safe to walk away.
- Verify: `pnpm preview:start` (port 3001, shared), `/masterwork/e492a07f-…`. `pnpm type-check`
  is the only type gate; the live DB is truth.
- **Never:** hand-render a stream; re-roll the CAS write path (`rulebook_writes.py`);
  auto-activate an AI-written rule; put a prompt/model constant in a distillation module
  (Mandates only); let an agent touch a clean approved rule (feedback is the only key).
- **TRANSFERABLE LESSON (2026-08-17, Arman's ruling):** every creation/working mode gets a real
  URL route (`/x/[id]/<mode>`), and conversations tied to an entity are FIRST-CLASS visible on
  the entity page — never buried inside a sheet or dialog. Building the machinery (edges, resume,
  chooser) without a page-level surface is how a shipped feature reads as missing to its user.

## Definition of done (Arman's bar)

An Expert who cannot code opens the Studio, answers four questions, talks for twenty minutes,
approves the rules they agree with, rejects one with a spoken reason and watches it come back
rewritten, presses one button, runs the result, disagrees with it once, and watches that
disagreement become a rule — then runs it again and **agrees with the output where they never
agree with vanilla AI.** Until Arman's own SEO method clears that bar, this is not done.
