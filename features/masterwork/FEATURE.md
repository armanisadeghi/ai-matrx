# Masterwork — local mechanics for `features/masterwork/`

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/masterwork/STATE.md — read it before touching this feature in ANY repo.

Product truth, the page IA law, the review-verb state matrix, the Approach catalog contract,
the Record/corpus contract, the Checkup window's five rules and every Arman ruling now live in
the node kit, NOT here:

- `common-docs/systems/masterwork/rulebook-surface-contract.md` — this feature's own contract
- `common-docs/systems/masterwork/distillation-contract.md` — the lanes behind the intake surfaces
- `common-docs/systems/masterwork/build-and-audition-contract.md` — Build · Understudy · Audition · Encore lifecycle
- `common-docs/systems/masterwork/expert-corpus-and-checkup-contract.md` — `getExpertCorpus` and the Checkup
- `common-docs/systems/masterwork/improvement-brain-contract.md` — `journey.ts` and the `?assist=` contract
- `common-docs/systems/masterwork/USABILITY-VERDICT-2026-08-21.md` — the Expert's open punch list

This directory was renamed from `features/expertise/` on 2026-08-17; the code speaks the
canonical words (Rulebook · a Masterwork · Build · Audition · Scout · Approach).

## Rules an agent editing this directory must obey

1. **Human-first.** Anything machine-generated lands as `draft: true` rules or a `status='draft'`
   Rulebook. Never auto-activate.
2. **`saveRules` is the ONE write path**, and it is a CAS on `version`. Never write
   `platform.rulebook.rules` beside it; never build a second improve/apply funnel. Metadata-only
   writes (`metadata.checkup`, `metadata.coherence`, `metadata.expert_corpus`,
   `metadata.elicitation`) CAS-guard on `version` but must **never bump it** — `version` is the
   RULES version a Masterwork drifts against.
3. **Saving an edit is NEVER approving.** `applyManualRuleEdit` in `types.ts` is the one merge;
   `ruleState()` is the one precedence. Approve is only ever the explicit Approve action.
4. **The four verbs are ONE primitive.** Render them through `review/RuleDecisionActions.tsx`
   (all four handlers are REQUIRED props) and run improve through `review/useRuleImproveRun.ts`.
   Never construct a second improve run. A surface that genuinely cannot offer one of the four
   must say why in a code comment beside the component.
5. **Never fetch the Rulebook from an agent's first tool call.** `rulebook_document` is a
   `required_variable` on `masterwork.scout` and `masterwork.conductor`; render it with
   `agent-context/rulebookDocument.ts` and load it with `agent-context/useRulebookDocument.ts`
   BEFORE the conversation is minted. A blank string counts as missing and is refused.
6. **A structured-output Mandate must never be offered the page's write tool.** Set
   `tool_config.auto_tools_disabled = true` on the agent, or it calls `apply_surface_write`
   instead of returning JSON and the run pauses forever.
7. **Every `/masterwork/[id]/*` lane route renders inside `components/RulebookLaneRoute.tsx`** —
   it owns `SurfaceRuntimeProvider`, `buildRulebookSurfaceScope`, the
   `masterwork_refresh_rulebook` client tool, and `<AccessGate token="rulebook" id/>`. Never
   hand-roll any of the four, and never swallow a denial in a `.catch`.
8. **`getExpertCorpus` assembles NOTHING** — it calls `GET /masterworks/{rulebook_id}/corpus`.
   A second corpus assembly in any repo is a defect. Any surface showing the corpus **must
   render `limits`**; a partial record presented as complete is the failure that contract exists
   to kill. `listRulebookInterviewsWithAccess` is a different question and keeps its own read.
9. **Filter conversation edges on ROLE.** `interview` = the Expert's own words (feeds the
   Record); `conducting` = the Conductor talking about the rules. Never read a `conducting`
   session as something the Expert said.
10. **`fetchDistillationApproaches()` returns the WHOLE catalog. Consumers filter.** A filtered
    query is exactly how six approved Approaches went invisible. `enabled` answers only "may
    this Approach START a Rulebook"; `metadata.availability` answers "does this lane exist".
    Never hardcode an Approach list.
11. **`journey.ts` is a MIRROR of `aidream/services/masterwork_assists/journey.py`.** Precedence,
    thresholds and headline sentences must match byte for byte; change one, change both in the
    same commit, and keep the named test twins (`journey.test.ts` ↔ `tests/test_journey.py`).
11a. 🚨 **ONE PREDICATE decides what an open question is: `coherence/types.ts::openTensions`**
    — `state: "open"` AND every rule it names still live (mirror of the server's
    `coherence.askable_tensions`). The headline count and the panel list both come from it
    (`openTensionCount`); counting `state === "open"` anywhere else is refused by
    `coherence/onePredicate.test.ts`. A `moot` tension was closed server-side because its rules
    were removed — it is never open and never counted as something the Expert settled. The
    defect this pins (2026-09-12, "Montessori Parenting Adviser"): the header said "4 questions
    only you can settle are still open." above a panel showing none of them, an hour after a
    repair removed the rules those four were about.
12. **Every textarea in this module is `ProTextarea`** (mic + transcription) and every
    creation/working mode gets a real URL under `/masterwork/[id]/`. Creation/editing flows of
    substance are WindowPanels, never blocking modals; open them only through their
    `useOpen*Window()` opener.
13. **AI tidy is a proposal, never a write.** `applyRuleTidy` mechanically freezes the verbatim
    quote, severity and section. `masterwork.rule_cleanup` was retired into
    `masterwork.rule_improver` — both DB rows are soft-deleted; never re-bind or re-split them.
14. **Never add `mr-*` to a button icon** — the Button's own `gap-2` handles it (icon + gap +
    margin was the "giant gap" defect).
15. **Never re-declare a JSONB shape beside a consumer.** `types.ts` owns `RulebookRule`,
    `RulebookSections`, `RulebookSource`. Never rewrite an existing rule's `id` — audits cite it.
16. **The Understudy is never releasable to Encore** and is filtered out of the built-Masterworks
    list; release is gated on a real Build. Never describe the Understudy as the finished system.
17. **`TryMasterworkBox` asks `runIsOver` (`features/workflow-runtime/types.ts`), never a narrower
    set** — a run the engine records as `errored` is over for anything WATCHING it, but the
    generated `TERMINAL_RUN_STATUSES` answers the engine's resume question and excludes it. Asking
    that set directly is how a run that errored left the box "Working…" forever, with nothing told
    to the caller until a row poll happened to notice. Guarded by `TryMasterworkBox.test.tsx`
    (proven failing-then-passing 2026-09-09). It also **never re-attaches to a run that is
    over**: the remembered sessionStorage id is a CANDIDATE, its row is read first, and a run
    `runIsOver` answers true for is FORGOTTEN rather than adopted — a finished run belongs in Past
    runs, not in the box that is waiting for one. A freshly started run always replaces the
    remembered id (a re-attach check still in flight stands down against a start generation), and
    the box SAYS which run it is showing. Wall W15, 2026-09-10.
18. **Every Rulebook door adopts the Rulebook's own organization** — `RulebookLaneRoute` and
    `RulebookDetailPage` both call `useAdoptRecordOrganization`
    (`features/organizations/useAdoptRecordOrganization.ts`) and hold their body until it answers.
    The row carries `organization_id`, so a reload must never leave the Expert's every action
    dying on "Select an organization before sending this request." (wall W3, 2026-09-10). Nothing
    is guessed: an unreadable organization row means "not your workspace" and the page falls back
    to the old fail-closed behaviour, and the adoption ANNOUNCES itself with a toast naming the
    workspace. Guarded by `components/__tests__/RulebookLaneRoute.organization.test.tsx`.

19. 🚨 **A PER-PIECE RULE IS EVIDENCE, NOT A QUESTION — `standing: "evidence"`.** On 2026-09-12
    the body-of-work lane turned 20 published pieces into 416 per-piece drafts plus 4 synthesized
    cross-piece rules, this page counted all 420 as "Waiting on you", and the Expert pressed
    Approve-all — the failure the review lane exists to prevent. `ruleState()` returns
    `"evidence"` for those rules (precedence retired > rejected > evidence > draft > approved), so
    every surface that asks "is this waiting on her?" gets NO for free: `computeKpis`, the review
    wizard, Approve-all, the journey. They are **not rows in the rule list** — they are reached
    behind the synthesized rule that cites their piece, through `RuleEvidenceDisclosure` ("proven
    by N pieces — see them") with a one-click **Make it a rule** that calls `promoteEvidenceRule`
    (raises standing only — the rule stays a draft awaiting Approve, and not one word changes). A
    search still reaches them, so nothing the Rulebook holds is unreachable. Never re-derive any
    of this: `isEvidenceRule` / `evidenceFor` / `evidenceSupport` in `types.ts` are the ONE set,
    mirroring `distill.is_evidence_rule` on the server. Cross-repo SoR:
    `../../../common-docs/systems/masterwork/distillation-contract.md` § THE EVIDENCE STANDING.
    Guard: `__tests__/evidence-standing.test.ts`.

## Files

- `service.ts` — detail reads/writes (getRulebook, saveRules, createDraftRulebook,
  updateRulebookMeta, softDeleteRulebook, listMasterworksForRulebook). Direct supabase-js,
  RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain
  PostgREST — no per-feature RPC yet at this population), `columns.tsx`, `listConfig.tsx`,
  `useRulebookRowActions.tsx`, `components/MasterworkStudioPage.tsx`, plus the Approach registry
  read `approaches.ts`.
- `intake/NewRulebookFlow.tsx` — the guided start at `/masterwork/new` (house guided-intake pattern).
  The old `NewRulebookDialog` was DELETED 2026-08-17 — a cramped dialog with chip-bubble pickers
  is exactly what the house pattern forbids.
- `components/detail/IngestTimelineDialog.tsx` — the `timeline` Approach: a case pasted in the
  order it happened, read one moment at a time with the ending withheld by default.
- `triage/` — "Sort the drafts by what this Rulebook is for" (W59 + W61): `TriageDraftsDialog.tsx`
  (two plain-English fields, the first prefilled from the Expert's own intake goal, plus a
  "show me the plan first" switch = `dry_run`), `useTriageRun.ts` (durable-run surface `triage`
  → `POST /masterworks/triage`), `types.ts` (the terminal payload + `triageSummary`). It is the
  THIRD door on a pile of drafts, beside Review (one at a time) and Approve all.
- `durable-run/useMasterworkRun.ts` — the ONE way a dialog here runs something long. A face over
  `lib/durable-run/useDurableRun.ts` (shared with SEO): remembers the run id, rejoins on load,
  settles from server truth, keeps a finished answer across a refresh. Both ingest lanes share one
  run (one dialog, one answer, one pointer). Never fork it — add a `DurableRunWire` instead.
  **A lost stream is never a failed run (2026-09-12).** The live replay channel is per-PROCESS and
  the API runs many workers, so a rejoin that lands elsewhere gets the durable ROW — mid-run that
  row says `processing`. The hook used to print `unfinishedMessage` ("nothing was saved") over it:
  on 2026-09-12 03:11Z an ingest whose socket was cut at +60s said that while run
  `4587e534-316c-4db1-af3a-02241f7b551f` went on to land 115 rules at 03:15Z, and the Expert paid
  for a second full distillation. `useDurableRun` now reconnects instead — "Lost the live view —
  the run is still going on the server. Reconnecting…" — and only a TERMINAL row status may end a
  run on screen (`lib/durable-run/useDurableRun.stream-loss.test.tsx`).
- `components/detail/RulebookDetailPage.tsx` + `RuleEditorDialog.tsx` — the Expert surface. Plain
  language only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a
  requirement, not a style choice (THE MISMATCH RULE). Its summary keeps rule KPIs and rule actions
  together; built Masterworks have a separate summary between the Rulebook and Sources with their
  own Built, Current, and Released KPIs. For a new Rulebook with no approved rules or builds, that
  Masterworks summary stays hidden so Sources remain the next task. Rule textareas open at six rows. **Clean
  up with AI** runs Mandate `masterwork.rule_improver` in its TIDY shape (empty `expert_input`;
  `masterwork.rule_cleanup` was retired into it 2026-08-18 — both DB rows are soft-deleted, never
  re-bind them) through the ONE runner `review/useRuleImproveRun.ts`, streams through
  `LiveRunDisplay`, and stages the validated result for review; only Save writes. The source quote, severity, and section are mechanically
  protected from AI changes. The generic `wizardDraftSlice` preserves a paid cleanup until Save,
  explicit Cancel, or Undo.
- `build/BuildWindow.tsx` — "Build a Masterwork" as a WindowPanel (streams
  `POST /masterworks/build` as a durable run; progress through
  `LiveRunProgress`; result carries doors + `TryMasterworkBox`). Openers:
  `features/overlays/openers/masterworkBuildWindow.tsx`; run + progress
  translation: `build/useBuildRun.ts`; page callbacks: `build/callbacks.ts`.
- `components/detail/IngestSourceDialog.tsx` — "From a source" (paste →
  `POST /masterworks/ingest`; upload → `POST /masterworks/ingest-file`).
- `sourceTypes.ts` — 🚨 THE ONE LIST. Every Masterwork upload picker takes its
  `accept` from `MASTERWORK_UPLOAD_ACCEPT` and nowhere else, and that string is
  the server's own readable-type list (`aidream/aidream/services/distillation/
  source_types.py`), diffed by a guard in aidream that fails on any drift. Born
  2026-09-12: the picker advertised `.txt,.md,.rtf,.epub,.doc` and the server
  read none of them, so a person's own 599-byte `.txt` was invited by the file
  dialog and refused by the backend. Never hand-type an accept string here.
- `components/detail/ScoutInterviewPanel.tsx` — the Scout interview Approach (side sheet).
- `components/masterworks/MasterworksPage.tsx` — Masterworks list, run links into
  workflows.aimatrx.com, recent-run history, and the owner-only Audition + feedback doors. Its
  Built, Current, and Released KPIs filter the inventory directly; compact card-header doors open
  each Masterwork in Studio, Encore, or its run history.
- `components/masterworks/TryMasterworkBox.tsx` — "Try your Masterwork" in place: starts the run
  (adoptForeignStream + followWorkflowRunStream), narrates real node stages, renders the verdict
  through RichDocument. **A refresh rejoins the run** — the run id is kept per Masterwork in
  sessionStorage (`matrx.masterwork.run.<masterworkId>`), and on mount the run row decides:
  still going → `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed
  replays the node lifecycle so the stage list rebuilds), finished → the verdict shows directly.
  Its terminal choreography asks `runIsOver` from `features/workflow-runtime/types.ts`; it must
  never ask a narrower set that misses `errored` and waits for the row-poll recovery backstop.
- `components/masterworks/AuditionDialog.tsx` — "Compare to the original" (the Audition). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.
  Streams `POST /masterworks/audition`; verdict event `masterwork_audition_verdict`.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.

## Change Log

- `2026-09-13` — 🚨 **The live-lane probe is a LIVE fact, and every explicit door names its lane (Bugbot, second follow-up).** `useLiveIngestLane` read the pointers once at mount, so a lane that was in flight then stayed selected for the life of the page: after a refresh that rejoined a case distillation, "From a source" and the assist `open: "ingest"` chip opened the TIMELINE dialog long after that run had settled, and could launch the wrong pipeline. Two halves. (1) The probe re-reads on a five-second beat while the tab is visible, and on `storage` / `focus` (another tab's launch or finish), so its answer clears within a beat of `useDurableRun` marking the pointer settled. (2) `RulebookDetailPage` routes every explicit door — the "From a source" menu item, the assist chip, the Approach picker — through one `openIngestLane(lane)` that sets `requestedIngestLane`, which outranks the probe; the probe now only ever answers "nobody asked, and something is still running". `DEFAULT_INGEST_LANE` is the named lane those doors open. Tests in `durable-run/__tests__/live-ingest-lane.test.tsx`: the probe drops its answer on a frozen clock once the run settles; "From a source" opens ingest with a live and with a stale timeline pointer; and a source-level guard fails on any door that opens the dialog with a bare `setIngestOpen(true)`. All three proven RED against the pre-fix code.

- `2026-09-13` — 🚨 **A refresh rejoins the lane that is RUNNING, not the lane state names (Bugbot HIGH, follow-up).** Splitting the timeline pointer off the ingest one was only half the fix: the Rulebook page mounts ONE `IngestSourceDialog`, on the surface its current lane picks, so a reload that named no lane mounted on `ingest`, watched the ingest pointer, found nothing, and left a live case distillation invisible with Start armed — the Expert could pay for the same run twice. New `durable-run/liveIngestLane.ts` (`findLiveIngestLane` / `useLiveIngestLane` / `surfaceForIngestLane`) reads BOTH of this Rulebook's pointers through the new `peekDurableRun` in `lib/durable-run/useDurableRun.ts` — the hook's own reader, never a second pointer format — and reports whichever still has a run in flight (most recently started wins; a settled or hour-old pointer is not live). `RulebookDetailPage` resolves the lane as `requestedIngestLane ?? ingestLane ?? liveIngestLane` for the dialog's `initialLane`, its remount `key`, and `workspace_state.timeline_open`, so an explicit deep link or picker choice still outranks the probe. Tests: `durable-run/__tests__/live-ingest-lane.test.tsx` — the probe's seven cases, plus the page's wiring driving the real dialog (a live timeline run mounts the timeline surface and reopens the dialog on it, proven RED against the pre-fix resolution).

- `2026-09-13` — 🚨 **A timeline distillation writes the TIMELINE pointer again (Bugbot HIGH).** When the timeline lane was folded into `IngestSourceDialog` it kept its endpoint and its copy but lost its durable-run SURFACE: every lane launched as `surface: "ingest"`, and the pointer key is `${surface}:${rulebookId}`, so one Rulebook's case distillation and its pasted-chapter distillation shared one browser receipt — a reload could reopen the wrong lane, and a later ingest could rejoin a timeline run and report its answer as its own (it also took the ingest lane's 160s expectation instead of the measured 90s). The dialog now picks `timeline` from the same flag that picks the endpoint; `timeline_open` in `workspace_state` and `browse/approachLane.ts` already keyed off `initialLane === "timeline"` and are unchanged. Tests: `components/detail/__tests__/ingest-source-surface.test.tsx` (each lane's surface + pointer, proven RED against the old line) and the class guard `durable-run/__tests__/surface-census.test.ts` — a surface declared in `MasterworkRunSurface` that no call site launches with means some lane is writing another lane's pointer, which is exactly how this one hid.

- `2026-09-12` — **The surface never hides a live mutation, and a summary never claims a check it did not run (Bugbot, round 7).** `workspace_state` now carries `timeline_open` and `triage_open` beside `ingest_open` and `review_wizard_open`, so an agent reading the Rulebook surface sees a case being distilled by step or drafts being retired and rewritten instead of a quiet page. `parseIngestSummary` keeps `quotesUnverified` as `null` when the lane did not report the word-for-word check (absent is not zero), and `describeIngest` then says nothing about quotes instead of "every quote verified".
- `2026-09-12` — **Improve keeps the judgment (Bugbot on W58, round 5).** The Improve verb sent a decision rule's stored shape to the Mandate but `RuleImproveResult` / `coerceRuleImproveResult` / `applyRuleImprove` accepted prose only, so a rewrite landed a new statement over the OLD precondition / next action / cost / risk and the review diff never showed them — an Expert could approve a decision rule whose judgment no longer matched its text. Now `coerceRuleImproveResult` reads an optional decision shape (`kind: "policy"` or any of the five keys means all five must be present and inside the closed sets, refused by name otherwise); `applyRuleImprove` lands the returned shape, and when the reply carries none it keeps a decision rule's stored judgment exactly (a prose-only rewrite never demotes a decision rule); `applyRuleTidy` polishes precondition and next action but freezes kind, cost and risk like severity and section; the Improve review diff shows "When you know", "Do next" and "Kind of move · cost · risk". The Holder half — the `masterwork.rule_improver` agent's output schema, which today refuses the six keys (`additionalProperties: false`) — is a shared production agent and is listed as a guided step in the trial register (the exact schema and prompt addition are written). Tests: `agent-context/ruleImprove.test.ts` (the decision-shape describe block).
- `2026-09-12` — 🚨 **The rule form has ONE state, and a finished run is handed back ONCE (Bugbot on W58 + W59).** Five defects, two classes. (1) The W58 decision fields were a SECOND set of state beside the prose: missing from the draft snapshot, the draft restore, the open/reset effect and the context menu's hand-written list of replaceable field ids — so Cancel-then-reopen kept a cancelled toggle, a later Save silently converted or stripped a policy rule, and a replacement inside precondition/next action threw. Every field the form owns now rides ONE enumeration in `types.ts` (`RuleFieldValues` / `RULE_FIELD_KEYS` / `ruleFieldValues` / `mergeRuleFieldValues` / `ruleFieldForElementId`), the editor holds ONE values object, and a draft written before a field existed falls back to the saved rule instead of blanking it. The review wizard renders the rule row's `PolicyRuleShape` (extracted to its own file — ONE renderer), so nobody approves a decision rule without seeing its precondition, action, cost and risk. (2) The triage dialog handed its result back from an effect keyed on the callback's identity; the page passes a fresh arrow every render and the refresh re-renders the page, so a successful sort refreshed forever and Close did not stop it. New shared `durable-run/useRunOutcome` fires once per run id with the callback behind a ref, adopted by the triage and both ingest dialogs; triage also resets on close and reopens onto a run rejoined after a refresh, like its siblings. Tests: `__tests__/rule-editor-policy-fields.test.ts`, `__tests__/run-outcome-once.test.tsx`.

- `2026-09-12` — 🚨 **The third door on a pile of drafts: sort them by what the Rulebook is FOR (W59 + W61).** A chunk distiller reads the page in front of it and never the Rulebook's purpose, so an 18,000-word clinical training workbook landed **336** drafts about PPE, hand hygiene, CPR technique and snakebite on a Rulebook whose intake says "given the first facts of an acutely ill person, decide the next question or test", and a back-pain guideline landed **83** about disclaimers and GRADE wording. The Expert's own next move — asking the Scout to "retire, as classes, every draft that is …" — died TWICE at the model's 16,000-token output ceiling with **zero tool calls** (~$0.53 each, nothing saved), because `retire_rule` took one id per call and the agent tried to plan ~250 retirements in prose. The product's only other doors were Approve-all and 336 clicks, and the Expert pressed Approve-all. New `triage/` surface: her two sentences ("Keep rules about…", prefilled from her intake answer; "Set aside rules about…") posted to the new durable lane `POST /masterworks/triage` on its own run surface, streaming per-batch progress so the pile is visibly shrinking. Three verdicts, not two — keep, set aside, and **rewrite** (a rule that is right but written about one case comes back generalised as a NEW draft, its ancestor retired in the same save). "Show me the plan first" is ON by default and writes nothing. The result line never hides the two dishonest cases: drafts the run could not sort, and rules it refused to touch because she had approved them. Server half + the bulk `retire_rules` tool action: `aidream/services/distillation/triage.py` and its FEATURE.md.


- `2026-09-12` — 🚨 **A rule can now BE a decision, and the Expert can edit it as one (W58, part 2).** The `timeline` lane distils judgment under uncertainty, but the only rule shape the UI knew was a static statement — so a policy rule reached the Expert as prose she could not correct field by field, and any manual edit of one silently dropped its shape. `RulebookRule` gains the optional `kind: "policy"` + `precondition` / `next_action` / `action_kind` / `cost` / `risk` (vocabularies exported once as `POLICY_ACTION_KINDS` / `POLICY_LEVELS`; the server refuses anything outside them by name), and they are in `RULE_CONTENT_FIELDS` because changing the next action IS changing the rule. THE ONE rule form (`RuleFields`) gained a "This is a decision rule" switch revealing five plain-English controls ("What do you know at this point?" / "What do you do next?" / what kind of move / cost / risk) and ONE mapping to the stored fields (`policyRulePatch`), consumed by both the editor dialog and the Add-rule window; the Final Checkup omits the block through the existing `omitFields` contract rather than showing controls whose values it would drop. The existing rule row — never a second renderer — shows a policy rule as "When you know … → do …" with move/cost/risk chips and a "Decision rule" badge. `ruleSave.ts` needed no change (it merges through `applyManualRuleEdit`), which the new content-field list is what keeps true.

- `2026-09-12` — 🚨 **A case that unfolds in time is no longer one chunk (W58).** A real clinical case report (three emergency visits, then an admission) pasted into "Add rules from a source" became ONE size-based chunk and came back as 11 static rules all citing `chunk: 1` — the entire skill (what was known at each step, what was still unknown when each choice was made, and what each choice cost and risked) was gone. New lane: the `timeline` Approach, `IngestTimelineDialog` on `?ingest=timeline` and through the Approach picker (`intake_query {"ingest":"timeline"}`), posting `/masterworks/ingest-timeline` on its OWN durable-run surface (`timeline`) so a case never rejoins the single-source dialog. The dialog carries one switch — "Hide the ending while the rules are written", default ON — because a distiller that can see how the case turned out writes hindsight, not judgment; the ending is still saved with the case for the Audition. Server half (segment → chunk BY STEP → distil each step with the future withheld → policy-shaped rules anchored by `source_ref.step`): `aidream/services/distillation/timeline_ingest.py` + its FEATURE.md rule 21.
- `2026-09-12` — **A signed-out Masterwork tab no longer mounts any private reader as `anon`.**
  The Rulebook `[id]` layout protected only one dynamic branch: sibling
  `/masterwork/encore/[id]` was client-only and could mount its direct Supabase readers, including
  an Operator's run history, before authentication. The private-route census also found the same
  structural risk in every future private sibling beside those branches. The shared
  `app/(core)/masterwork/layout.tsx` now keeps only the intentional public `/masterwork` landing
  and the Vision Interview's existing server guest gate outside its boundary; it stops every other
  Masterwork descendant through `getServerAuth` before a child mounts. Guests use
  `currentRequestLoginHref`, so the exact deep path and query survive the sign-in trip. Database
  access stays closed to `anon`; this is a routing repair, not a grant. Guard:
  `app/(core)/masterwork/__tests__/layout.test.tsx` census-tests the static, Rulebook, and Encore
  private routes (including deep query preservation), plus the public and Vision Interview
  exceptions.

- `2026-09-12` — 🚨 **THE EVIDENCE STANDING: the counters stopped asking for 416 decisions.** The body-of-work lane produced 416 per-piece drafts plus 4 synthesized rules on one Rulebook and the KPI strip counted all 420 as "Waiting on you"; the Expert pressed Approve-all. Per-piece rules now carry `standing: "evidence"` from the server and are a review state of their own (`ruleState` → `"evidence"`), excluded from Rules / Approved / Waiting on you, from the review wizard and Approve-all, and from the journey headline — and shown behind the synthesized rule that cites their piece via the new `RuleEvidenceDisclosure`, with a one-click "Make it a rule" per item (`promoteEvidenceRule` raises standing only; saving is still not approving). Guard: `__tests__/evidence-standing.test.ts`, proven failing then passing. Server half + the org knob that promotes a recurring observation: `../../../common-docs/systems/masterwork/distillation-contract.md` § THE EVIDENCE STANDING.

- `2026-09-12` — 🚨 **The Conductor was promised a door that did not exist.** On `/masterwork/[id]/conduct` it reasoned its way to staging a rule through `apply_surface_write` / `rule_draft` and found no handler: the Rulebook surface declares the target, but only `RulebookDetailPage` registered it — every lane route mounted the surface with no write handlers at all. `RulebookLaneRoute` now registers `rule_draft`, validating through the ONE shared validator (`agent-context/ruleDraftInput.ts`, extracted from the detail page so both mounts hold one contract), staging into the SAME `RuleEditorDialog`, and landing the Expert's Save through the SAME canonical CAS upsert (`ruleSave.ts` → `upsertRuleWithRetry`, the Improve verb's existing landing) — saving still is not approving. The lane also publishes the `active_rule_draft` read twin and an honest `editor_open`. The class half lives in aidream: the server now advertises only the write targets the mounted page can actually apply. Guard: `features/masterwork/__tests__/rule-draft-write.test.ts` (agent value → validator → fake Rulebook, including draft-stays-draft and validate-then-apply refusals).

- `2026-09-12` — 🚨 **The guided start no longer loses the Expert's answers on a reload (W43).** On the live build she filled step 1, continued to `?step=2` and reloaded: the URL still said step 2, the page rendered complete, "Best for what you described" showed the DEFAULT set, and Start created a Rulebook with no goal — silently. Two defects, both fixed at the class. **(1) The multi-select answer was dropped in silence.** "Where does the knowledge live today?" is a SET and persists as one joined string (`"In my head | In my AI chats"`); the restorer validated that joined string against single option VALUES, never matched, and fell back to the default. Restore now validates each PART (`restoreNewRulebookDraft`, exported) and reports anything genuinely unrecognized instead of dropping it. **(2) The step was drawn from a draft that had not been read.** The step lives in the URL (synchronous, always there) while the answers live in a cache read back asynchronously — localStorage after hydration, IndexedDB a turn later, the signed-in person's records only on the identity resync ~100ms in. The page now goes through the shared `lib/wizard-draft/` primitive: `useWizardDraft` (status `loading`/`found`/`absent`) + `resolveWizardStep`, so `?step=2` shows "Finding what you told us…" while the read is in flight and `<WizardAnswersLost>` — plain words plus "Start again" — when the draft is genuinely gone. `create()` also refuses an empty goal out loud rather than inserting a goal-less Rulebook. Guard: `intake/__tests__/new-rulebook-survives-reload.test.tsx` (fill step 1 → persist through the real sync policy → fresh store rehydrate → remount at `?step=2`), proven failing then passing.

- `2026-08-25` — Converted Encore to the canonical `EntityListPage` inventory used by Agents, Transcripts, Workflows, and Rulebooks: standard scope tabs, URL-backed search, Filters & Sort, column chooser, table/card/compact views, pagination, and row menus. Its cards and run page keep the compact Masterwork language: no generated-description novels, only authoritative metadata, concise proof, and small Run/Studio actions.
- `2026-08-25` — Made every Rulebook and Masterwork KPI a door to its underlying records. Rules now have compact Approved, Waiting, interviewer, and change-request filters beside search; the Masterworks inventory has the same Built, Current, and Released KPI strip with URL-backed filters, compact metadata, authoritative build-time rule counts, quiet last-updated timestamps, and top-right icon actions.
- `2026-08-25` — The Understudy card now uses the concise title `Understudy` and describes the run as a quick test of the temporary stand-in being built in real time.
- `2026-08-25` — The Understudy now presents its canonical two-field run intake as `Your request` and `Supporting material (optional)`. This is a display-only override: the generated field keys and run payload remain unchanged, and purpose-built Masterworks keep their own intake labels.

- 2026-08-25 — Refined Build with me: the four starter prompts now form a centered, balanced
  group, and the Conductor no longer auto-adopts the mounted Rulebook surface because it already
  receives the complete Rulebook through its required named variable. The composer mirrors that
  real attachment behind its compact right-aligned count without adding a second payload.
- 2026-08-25 — Separated Rulebook rules from built Masterworks on the detail page: each now has
  its own KPIs and actions, while the Masterworks summary stays out of the way for a new Rulebook.
- 2026-08-25 — Standardized Rulebook, Masterworks, Understudy, and Sources card padding, header
  rhythm, footer button height, and single-action alignment; rule groups now use a clear 24/8/4
  spacing hierarchy.
- 2026-08-25 — Reframed Quick build around explicit Masterwork language: a compact approved-rule
  summary, concise review-versus-create choices, an explicit Masterwork name, and no ambiguous
  "it" or recommendation paragraph in the setup.
- 2026-08-25 — Quick build now requires the Masterwork name before asking for its input model:
  existing work routes to the review-and-correct workflow; instructions route to new-work
  generation and require the intended deliverable.

- 2026-09-10 — **THE ARCHIVED-ITEMS LAW landed on Masterworks** (row F10 of
  `../../../common-docs/projects/archived-items-law/STATUS.md`; law at
  `../../../common-docs/policies/archived-items.md`). All three `workflow.definition` Masterwork
  reads were archive-blind — no predicate, no column — so an archived Masterwork rendered as a
  live one everywhere. Now `MASTERWORK_SELECT_COLUMNS` carries `is_archived`, each read takes
  `includeArchived` defaulting to FALSE, and `splitMasterworksByArchive` is the one split every
  surface uses. Four card surfaces gained the shared `ArchivedDisclosure` (from
  `@ai-matrx/design-system` since 2026-09-10; `components/official/ArchivedDisclosure` was
  deleted when the package took it) — the Masterworks lane,
  the Rulebook page's Masterworks section, the browse cards (per Rulebook), and (until it was
  deleted the same day, below) the module home grid —
  closed by default, one click, count honest, revealed rows labelled "Archived". Every count
  (KPI strip, built count, journey facts, browse "N built", the lane's `masterwork_count`) is now
  the LIVE half. `RulebookLaneRoute` takes the read's default so the agent surface scope never
  offers a retired system as runnable. Encore's released shelf, the Hindsight workflow picker and
  the bakeoff picker exclude archived rows under reasoned `archived-items-law-exempt` markers —
  run/enrollment candidates, not browsable lists (the F9 precedent). Guard
  `pnpm check:archived-items-law` now protects `workflow.definition` as a settled class (proven
  RED on the three pre-fix reads); forcing tests in `archivedItemsLaw.test.ts`.

- 2026-09-10 — **A SCREEN NEVER LIES IN THE ALL-ARCHIVED STATE** (row F10's independent live
  review, repaired the same day). Making every count the live half quietly made every CAPTION
  dishonest: with both Hopkins Masterworks archived the Rulebook page printed "No Masterworks
  built yet." and "115 approved rules and no Masterwork yet — the Conductor can build one" one
  line above its own "Archived Masterworks (2)" door, telling the Expert to rebuild work they
  already had. THE RULE, in this feature and everywhere: a "none / never / yet" caption may only
  be said when live + archived is 0; otherwise it says how many are archived.
  `MasterworkKpis` gained `archived`, `computeMasterworkKpis` and `journeyFactsFromRulebook` take
  the archived half, and the sentence itself is the exported, unit-tested
  `masterworkFreshnessLine`. `conductor_ready` keeps its key, rank and precedence (the mirror of
  `journey.py`) and only changes words in a case the server cannot reach — `journey.py` has no
  archive axis, so its `real_masterworks` is already the whole corpus. The browse ROWS view's
  "not built yet" and the browse CARDS view's "Not built into a system yet." took the same fix.
  Ten forcing tests, four of them proven RED against the pre-fix code.

- 2026-09-10 — Source-ingest and body-of-work completion summaries lead with any chunks the
  distiller could not read, including the approximate missing word count and a direct retry
  remedy; successful draft counts never conceal partial source loss.

- 2026-09-10 — **`features/masterwork/home/` deleted** (`MasterworkHomePage`,
  `HowItsImprovingPanel`, the home service). `/masterwork` has redirected signed-in Experts to
  `/masterwork/all` — the canonical entity-list surface — since 2026-08-21, so nothing rendered
  any of it; F10 had given its grid an archive control nobody could reach. A control nobody can
  reach is not a control, and replaced code gets deleted (`no-legacy`). The `/masterwork/admin`
  map, which still described the deleted home as the live authed landing, now describes the
  redirect.
