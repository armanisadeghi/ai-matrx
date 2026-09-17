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
2. **`saveRules` is the ONE write path**, and it is a CAS on `version` that ALWAYS carries the
   base it edited from (`base: Rulebook` — the row the surface read). Never write
   `platform.rulebook.rules` beside it; never build a second improve/apply funnel.
   🚨 **`version` moves on EVERY update of this row, not only on rules.** The line that used to
   stand here — "metadata-only writes must never bump it" — is not what the database does and
   never was: `platform._touch_row` bumps `version` on every UPDATE of any column,
   unconditionally (verified against the live function, 2026-09-15). So `metadata.coherence`,
   written back by the server's Coherence Partner that OUR OWN save woke, silently ages out the
   version the page is holding. That is a phantom conflict, not a conflict, and `saveRules`
   classifies it with `rulebookRebase.ts` — which is why the base is mandatory. Read that file
   before touching this path (wall W12).
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
   hand-roll any of the four, and never swallow a denial in a `.catch`. It also mounts its
   instance **keyed by the rulebook id** (as `RulebookDetailPage` does): a different Rulebook is
   a different page, so no lane may carry state derived from the previous record. Never add a
   per-lane id reset instead.
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
17. 🚨 **THE STAND-IN NEVER LIES ABOUT WHAT IT KNOWS.** `pokeUnderstudy` rebuilds the Understudy
    after every rules write, fire-and-forget — so its failure has to be visible somewhere a
    person looks. It records every outcome in the staleness ledger in `understudy/refresh.ts`
    (`subscribeToUnderstudyRefresh` / `getUnderstudyRefreshState`, fed by
    `refreshUnderstudyTracked`), and `UnderstudyCard` subscribes: a failed rebuild, or a row
    whose baked `rulebook_version` is behind the Rulebook's, raises a named warning saying which
    version the stand-in is performing from versus where the Rulebook now is, plus "Bring it up
    to date". The card also shows that version, the baked approved/in-review counts and the
    rebuild time UNCONDITIONALLY, because the ledger is per-tab and a reload would otherwise
    erase the only evidence. Never go back to a `console.error` alone: on 2026-09-12 every
    refresh returned HTTP 500 for two hours (the server write named no actor system), an Expert
    reviewed 94 rules, and she then tested a stand-in built from zero of them under a page
    reading "88 approved". The Masterwork read projects the two stamps
    (`understudy_refreshed_at`, `understudy_rules`) through the ONE `parseMasterworkRow`.
    **And it never lies in the other direction either.** The card reads its whole account of the
    stand-in through `readUnderstudyStandIn(refreshState, row, rulebookVersion)` in
    `understudy/refresh.ts`, which believes whichever of the two accounts is NEWER — the workflow
    row the page loaded, or the payload the last successful rebuild returned (`rulebook_version`,
    `approved_rules`, `unconfirmed_rules`). A rebuild that lands therefore takes the amber banner
    down by itself, with no host reload; a banner still amber after a rebuild that worked is the
    same defect as a silent failure. And because the review wizard saves once per rule, several
    pokes for one Rulebook are in flight at once as a matter of course — so every ledger write
    carries a GENERATION TOKEN and only the newest attempt may write: an older poke settling late
    never buries a newer outcome in either direction. Guard:
    `__tests__/understudy-refresh.test.ts`, proven failing then passing on all four cases.
18. **`TryMasterworkBox` asks `runIsOver` (`features/workflow-runtime/types.ts`), never a narrower
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
19. **Every Rulebook door adopts the Rulebook's own organization** — `RulebookLaneRoute` and
    `RulebookDetailPage` both call `useAdoptRecordOrganization`
    (`features/organizations/useAdoptRecordOrganization.ts`) and hold their body until it answers.
    The row carries `organization_id`, so a reload must never leave the Expert's every action
    dying on "Select an organization before sending this request." (wall W3, 2026-09-10). Nothing
    is guessed: an unreadable organization row means "not your workspace" and the page falls back
    to the old fail-closed behaviour, and the adoption ANNOUNCES itself with a toast naming the
    workspace. Guarded by `components/__tests__/RulebookLaneRoute.organization.test.tsx`.

20. 🚨 **A PER-PIECE RULE IS EVIDENCE, NOT A QUESTION — `standing: "evidence"`.** On 2026-09-12
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

- `capture-plan/` — **THE CAPTURE PLAN** (`capture_plan`, `?plan=1`, page
  `/masterwork/[id]/plan`). A PROGRAM over the other Approaches: the Expert says what they want
  covered and how much time they can give, and the planner picks the next method from the LIVE
  lanes, sizes each session, measures what it produced and re-plans. Cross-repo SoR:
  `../../../common-docs/systems/masterwork/distillation-contract.md` § THE CAPTURE PLAN.
  🚨 **No capture surface of its own** — `SessionHost.tsx` mounts the lane's OWN dialog in place
  or navigates to its OWN page, so there is never a second version of a lane to keep in step.
  🚨 **Yield is the DIFF of the Rulebook's rule ids across a session**, so no lane knows it is
  inside a plan and a lane shipped tomorrow is measured identically. `planner.ts` is pure
  arithmetic (no agent, no network) and carries the four guards — a method that is not live is
  never scheduled, an empty session lowers its weight and two in a row drop it, the plan ends
  itself on its stop rule, and a plan with no allowed method refuses BY NAME. `methods.ts` gives
  every Approach in the catalog a posture (plannable with a session length and an ask, or excluded
  with a reason a person reads); `__tests__/registry-posture.test.ts` reads the LIVE registry and
  fails on a row nobody has decided about — three lanes went live during the build. The plan,
  its sessions and the per-method yield ledger live on `rulebook.metadata.capture_plan`, written
  by the same CAS-without-bumping-`version` the Prediction Ledger uses, RAW FACTS ONLY (how many
  rules the Expert kept is derived on read). Knobs: feature `masterwork.capture_plan`, twelve of
  them, no code fallback. Server half (the ONE thing the browser cannot do — telling someone it is
  time): `aidream/aidream/services/capture_plan/`, which creates no schedule because
  `notify(deliver_at=…)` parks the notice for the approved dispatcher.
- `prediction/` — **THE PREDICTION LEDGER** Approach (`prediction_ledger`, `?predictions=1`).
  The Expert calls live cases in her own work before the answer is known — the call, how sure she
  is, ONE line of why, and a due date — and enters the outcome when it lands.
  `scoring.ts` is the pure arithmetic and is the TWIN of
  `aidream/aidream/services/distillation/prediction_ledger.py`: change one, change the other in the
  same session, or the screen and the distiller score the same call differently. The ledger lives
  on `platform.rulebook.metadata.prediction_ledger` and stores RAW FACTS ONLY — `correct`, the
  Brier score and every calibration bucket are derived on read, so the data can never disagree with
  itself. `service.ts` writes it with a compare-and-swap on `version` that deliberately does NOT
  bump it (a call on an open case is not a change to the rules). `PredictionLedgerDialog.tsx` is
  the one door — "Call it" and "What happened" side by side, voice on both free-text fields under
  knob `masterwork_prediction_ledger.voice_default_on` — and "Turn the answered ones into rules"
  posts to `POST /masterworks/ingest-predictions`, whose "not enough outcomes yet" refusal is shown
  verbatim rather than as a generic failure. `CalibrationReadout.tsx` draws predicted-vs-realized
  through `components/ui/chart.tsx` and, with ZERO resolved entries, draws no chart at all: it says
  how many calls are waiting and when the first is due, because an empty plot reads as "you are
  calibrated at nothing" and a Brier score of 0 reads as perfect. Knobs (feature
  `masterwork_prediction_ledger`, seeded by the server half): `reminder_cadence_hours` — also the
  width of "coming up" on the open list, `min_resolved_to_distill` (5), `voice_default_on` (true);
  a missing knob row is announced in place with its remedy, never swallowed. Guards:
  `prediction/__tests__/scoring.test.ts` (the `>=` boundary at 0.5, the Brier table, the deciles),
  `prediction/__tests__/zeroResolved.test.tsx` (the honest empty state), and the new second half of
  `browse/__tests__/approachLaneCoverage.test.ts` — every `ApproachLane` variant has a `case` in
  `RulebookDetailPage`'s `launchApproach`, which is the half of the `timeline` dead end that
  resolving a lane never covered.
- `sourceSections.ts` — WHAT EACH PART OF A SOURCE PRODUCED, read off the live rules
  (`source_ref.section_index` / `section_label` / `section_words`, stamped by aidream's
  `services/distillation/source_structure.py`). Mirrors the server's source identities
  (`urlSourceKey` / `entitySourceKey`) and its thin verdict — a part far below the SOURCE'S OWN
  median, never below a number somebody picked. `RulebookSourcesPanel` renders the rows and the
  per-part "Read again", which posts `only_section` + `redistill: "replace"` to the dump lane so
  only that part's drafts are replaced. Guard: `__tests__/source-section-yields.test.ts`.
- `review/vocabulary.ts` — THE EXPERT'S OWN WORDS for the review: "Mine / Mine but wrong / Not
  mine" beside the neutral "Approve / Request changes / Reject". Wording ONLY — every verb, every
  handler and every status it writes is unchanged, which is leg 1 of
  `review/__tests__/ownership-review.test.tsx`. Knob `masterwork.review.vocabulary`
  (`auto` | `standard` | `ownership`, default `auto`, org+user rungs, read through
  `knob_resolve`): `auto` gives the ownership words to a Rulebook whose expertise comes from a
  PERSON (their own intake answer about where the knowledge lives, else whether any rule came
  from an interview, a recording, a chat import or an Oracle tap) and the neutral words to one
  distilled from somebody else's book — because "is this rule yours?" is a question a reader
  cannot answer.
- `review/agenda.ts` + `review/NextSessionAgenda.tsx` — THE NEXT SESSION'S AGENDA (doctrine
  CORE.md §5): every rule marked not-mine or mine-but-wrong, with the Expert's own words, not-mine
  first. A reading of state that already exists, never a second store — the SAME two conditions
  feed `agent-context/rulebookDocument.ts` (the bound document the interviewer gets before its
  first turn) and aidream's `rulebook action=read` → `open_feedback`. Panel knob
  `masterwork.review.agenda_panel` (boolean, default on) hides the panel only; the interviewer
  keeps receiving the agenda, because that is a provision and not a panel.
- `review/signature.ts` + `review/ExpertSignOff.tsx` — THE EXPERT'S SIGNATURE ON A RESULT, the
  single most important signal we have (Arman, 2026-09-15). One tap on a finished Masterwork run
  writes `verdict = positive` into `platform.output_feedback` through the existing
  `upsert_output_feedback` RPC, stamped `surface_name = masterwork.expert_signature` — **no new
  table, no new verdict word, no migration**, so the hindsight/replay loop reads a signed output
  as a positive example with no wiring. A thumbs-down writes `negative`, captures the Expert's
  own version as `corrected_content` on the same row, and hands it to the existing Oracle-tap
  dialog as a rule candidate. The Conductor's answers are COUNTED, not re-instrumented: they are
  ordinary chat messages whose column already carries the platform thumbs, so a second control
  beside them would be the duplicate-affordance defect. The Rulebook page shows
  "N outputs signed by the expert" beside the quick-check line.
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
  THIRD door on a pile of drafts, beside Review (one at a time) and the explicit-selection
  bulk approve below the rules ("Approve all" was deleted 2026-09-12 — it flipped every draft
  with no selection, no count and no record).
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
- `components/detail/RedPenDialog.tsx` — THE RED-PEN LANE (`red_pen`, live
  2026-09-15). Somebody else's work goes in (paste, or a plain-text/Markdown
  upload read in the browser — a PDF or a recording is the file card's job and
  the door says so); the Expert highlights a passage and says what is wrong and
  what they would do instead, TYPED OR SPOKEN through `ProTextarea`'s microphone
  (the platform's one dictation primitive). Each correction is span + words +
  moment, and all three land on every rule's `source_ref.span`. Posts to
  `/masterworks/ingest-markup`; own run surface `red_pen` and own pointer — a
  review is not a source ingest. The work piece is kept as a source the same way
  every paste lane keeps one (`record/pastedSource.ts`, approach `red_pen`), so
  the note the rules cite is listed in Resources. Two KNOB MIRRORS at the top of
  the file (`min_corrections_before_distilling` 3, `markup_voice_default_on`
  true); the server is the authority on the minimum and refuses a short run by
  name before spending. Guard: the card-is-a-real-door case in
  `browse/__tests__/approachLaneCoverage.test.ts`.
- `components/detail/IngestSourceDialog.tsx` — "From a source" (paste →
  `POST /masterworks/ingest`; upload → `POST /masterworks/ingest-file`).
- `components/detail/IngestTimelineDialog.tsx` — "From a case that unfolded", the TIMELINE
  Approach (`?intake=timeline` → `POST /masterworks/ingest-timeline`; surface `timeline` on the
  ONE durable run). Unfolds a pasted narrative into a `serial_observation_timeline` and either
  distils it (role `teaching`) or SEALS it (role `heldout`). `buildTimelineRequest` is the one
  place the wire body is built — the dialog and its guard both go through it.
- `components/detail/HeldOutCasesSection.tsx` — the sealed cases on the Sources view
  (`masterwork_corpus_item` rows, `kind = "timeline"`, `metadata.role = "heldout"`), read with
  `readAllRows`. Label · date · licence and NOTHING else: the query selects no narrative, no
  step and no resolution, so there is nothing in the component's props to leak. THE DOOR LAW's
  one deliberate exception here — a door onto a sealed case is a door onto the answer.
- `components/detail/RuleMove.tsx` — the ONE renderer of a rule’s `move` half (`move.when` /
  `move.next` — "When: …" / "Next: …" with the known/unknown chips and the 1–5 cost/risk
  numbers), used by the rule card and the review wizard. Rendered directly UNDER
  `RuleDecision`, never instead of it and never instead of `statement`.
- `sourceTypes.ts` — 🚨 THE ONE LIST. Every Masterwork upload picker takes its
  `accept` from `MASTERWORK_UPLOAD_ACCEPT` and nowhere else, and that string is
  the server's own readable-type list (`aidream/aidream/services/distillation/
  source_types.py`), diffed by a guard in aidream that fails on any drift. Born
  2026-09-12: the picker advertised `.txt,.md,.rtf,.epub,.doc` and the server
  read none of them, so a person's own 599-byte `.txt` was invited by the file
  dialog and refused by the backend. Never hand-type an accept string here.
- `probe/` — **THE BAD EXAMPLE PROBE** (`bad_example_probe`), boundary hunting on its own page
  `/masterwork/[id]/probe`. The system writes a version of the Expert's own work that looks right
  and is not; they say what is wrong with it; their answer becomes draft rules AND steers the next
  variant. `service.ts` holds the wire shape, the ONE request builder, the terminal parser and the
  sentences; `BadExampleProbe.tsx` is the screen, on `RulebookLaneRoute`, with `ProTextarea` for
  the catch. Server half: `aidream/services/distillation/probe.py`.
  🚨 **THE SESSION LIVES ON THE CLIENT.** One HTTP call per round, carrying the rounds so far,
  because the screen is the only thing that knows what the Expert has actually seen — which is what
  makes a probe resumable through the ordinary durable-run pointer rather than a bespoke session
  row nothing else in Masterwork has.
  🚨 **THE CASE BRIEF RIDES ON THE RUN'S RECEIPT** (`launch(..., { memo: { case_brief } })` →
  `run.memo`). The rounds are restored by the pointer and the brief is mount-local state, so
  without the memo a restored round is a round about nothing: never rebuild the request from
  `caseBrief` alone, and never lock the case box while the brief is missing.
  🚨 **`probe_label` IS NEVER RENDERED.** The generator names the boundary it probed so the next
  round cannot re-probe covered ground; it rides the wire as session state and is not a caption. A
  probe whose answer is on the screen is not a probe. The example is labelled as OURS above the
  work itself, and "Round 3 of 5" is the server's own `round_index`/`round_count` — the cap is the
  org knob (`masterwork.bad_example_probe.rounds`) and the screen has no opinion about it.
  🚨 **The funnel's deep link is a lane of its own.** `launchApproach` only runs when the Expert
  picks an Approach ON the Rulebook page; a Rulebook the guided start created arrives at
  `?probe=1` with nobody having picked anything, so `RulebookDetailPage` carries a `probeDeepLink`
  effect that routes to the page. Without it the card was a real door all the way through and the
  Expert still landed on a bare Rulebook — the `timeline` census-row-3 defect, one step further in
  (found by driving the funnel end to end, 2026-09-15).
- `teach-back/` — **THE TEACH-BACK** (`teach_back`), the system explains and the Expert corrects, on
  its own page `/masterwork/[id]/teach-back`. We read everything the Rulebook holds and say their
  method back to them in about a minute of plain spoken words — a bright new hire at the end of
  their first week, confident and therefore correctable — and they interrupt: "no, not like that",
  "you missed the part where…", "that's right but only when…". Each interruption becomes draft
  rules whose `detection` names what the explanation actually got wrong (the Feynman move) AND
  steers the next explanation. `service.ts` holds the wire shape, the ONE request builder, the
  terminal parser and the sentences; `TeachBack.tsx` is the screen, on `RulebookLaneRoute`. Server
  half: `aidream/services/distillation/teach_back.py`.
  🚨 **THE SESSION LIVES ON THE CLIENT**, as on the probe and for the same reason — and here the
  screen is also the only thing that knows what was said OUT LOUD.
  🚨 **WHOSE JUDGMENT IS ON SCREEN IS SAID IN WORDS, EVERY ROUND.** This is the one lane that needs
  no material: with an empty Rulebook the explanation is what a competent generalist would do, and
  the banner says so ("You haven't given us anything yet… not you"). `basis` is decided on the
  server from the digest, never from the model's claim, and `describeBasis` refuses to pick the
  flattering half when it is unreadable. Presenting a generalist's guess as "what we learned from
  you" would be the platform lying about the one thing it sells (CORE.md §2).
  🚨 **IT IS SPOKEN THROUGH THE ONE `speak()` ENTRY POINT** (`useSpeech`), with `primeAudioOutput()`
  inside the click that STARTS a round — WebKit plays silence for audio begun outside a gesture,
  and every phone browser is WebKit. The text is always on screen too, so the voice is a speed-up
  and never the only channel, and the play control is absent or honest, never dead.
  🚨 **"Yes, that's it" IS A SIGNATURE, NOT A STOP BUTTON** (CORE.md §7's release gate). It writes
  the verdict through the EXISTING expert-signature path — `saveOutputFeedback` →
  `platform.upsert_output_feedback`, `surface_name = masterwork.expert_signature`, subject the
  durable `platform.masterwork_run` of the round being signed (`MASTERWORK_DISTILLATION_RUN_SUBJECT_TYPE`,
  NOT the `workflow_run` token a built desk's output uses) — and only then closes the session,
  carrying the same run id so the server stamps `signed_teach_back` on the rules that explanation
  cited. **If the verdict write fails the session does not finish** and the screen says so; a
  "signed" over a failed write is the lie this lane's whole value depends on not telling. Guard:
  `teach-back/__tests__/teach-back-signs-and-tells-the-truth.test.tsx`.
  The funnel's `?teachBack=1` deep link has its own effect in `RulebookDetailPage`, for the reason
  the probe's does.
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
- `components/masterworks/AuditionDialog.tsx` also hosts the second exam as a tab:
  `components/masterworks/UnfoldingAuditionPanel.tsx` — "A case it has never seen". Up to two
  Masterworks of this Rulebook sit sealed cases under the case oracle (`mode: "unfolding"` on the
  same audition endpoint; terminal event `masterwork_audition_unfolding_verdict`, own durable-run
  surface `audition_unfolding` so a tab never rejoins the other tab's run), and the per-case table
  shows each arm's diagnosis / dangerous branch / steps / cost / risk beside the headline.
  Parsing + the past-score read: `audition/unfoldingRuns.ts`.
- `triad/` — THE TRIAD GAME's client half (`triad_game`, its own route
  `/masterwork/[id]/triad` on `RulebookLaneRoute`, rule 7). We deal three real options from the
  Expert's own craft; she taps one and says why in a line — out loud is fine — and that line is
  the rule candidate while the three items are the evidence. `service.ts` holds the two calls
  (`POST /masterworks/triads` deals and writes NOTHING; `POST /masterworks/ingest-triad` distils
  ONE answered card, submitted the moment she swipes, so rules appear while she is still playing);
  neither is a durable run and the file says why. `types.ts::parseDeck` is the ONE narrowing, and
  it DROPS a card that is not exactly three known items rather than drawing a two-item "triad".
  `TriadGamePage.tsx` is phone-first (dvh, `pb-safe`, sticky footer, 44pt targets, `text-base`,
  one scroll area); the horizontal swipe means SKIP and only skip, because choosing between three
  stacked options by swipe would be guessing which one the thumb meant. Every answered card
  carries its OWN save status, and every prompt played goes back with the next deal so the game
  never asks the same thing twice in one sitting. 🚨 Its `?triad=1` deep link is handled in
  `RulebookDetailPage` by FORWARDING to the route — a query param this page swallowed silently is
  how the live `timeline` card used to land Experts on a bare Rulebook (census row 3).
  Guard: `triad/__tests__/triad-door.test.ts`.
- `unfolding/` — the sealed-case lane's client half (contract:
  `../../../common-docs/systems/masterwork/unfolding-case-contract.md` §3/§5).
  `sealedCases.ts` detects the `masterwork.case.disclose` node in a definition (reading BOTH
  `type` and `data.spec_type`), resolves the Rulebook from `metadata.built_from_rulebook`, and
  lists the held-out timeline corpus rows through `readAllRows` selecting **label + source_meta
  only** — THE WITHHOLDING LAW means the sealed timeline never enters the browser.
  `SealedCasePicker.tsx` is the picker + its honest empty/error states; `caseDisclosures.ts` is
  the pure reader that finds the oracle's `case_disclosure` values in a run (emissions AND stored
  outputs) and hands the surface the latest cumulative ledger.
- The two unfolding kinds live in the kind registry, not here:
  `features/content-ir/kinds/masterwork-unfolding.ts` (`case_disclosure`, `unfolding_ruling`) with
  ONE component each under `components/mardown-display/blocks/masterwork-unfolding/`. Every
  surface that shows a ledger or a ruling renders through them.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.
- `encore/RunTheBench.tsx` — **the Trial Bench's door in the product**, beside the quick check on
  the Encore run page. The form the server sent (`form` on `GET /masterworks/{rulebook_id}/bench`)
  drives it: task brief, optional case input, the expert's real answer, the budget multiple with
  the server's own sentence for where that number came from (plus `corpus_note` always, and a
  source count only when `corpus_sources` is not null), and a read-only line naming the judge
  model, the frontier and cheap arms and the Masterwork arm C will run. Streams
  `POST /masterworks/{rulebook_id}/bench/runs` on its own durable-run surface `bench`
  (terminal event `masterwork_bench_verdict`). `encore/benchFacts.ts` builds the panel/cost/void
  sentence used BOTH here and by `AuditionProof`'s banked-record line, so one fact is never said
  two ways.

## Change Log

- 2026-09-17 (the registry learns about doors) — **A LANE REGISTRY CANNOT SEE A
  DOOR OUT OF ITSELF.** Cold walk 8 typed several paragraphs of real expert
  material into the Rulebook's "New document" resource and found a blank page
  after a reload; the document row it created has ZERO rows in
  `udt_document_snapshots`, so not one save was ever attempted. The lane
  registry (`sitting/lanePersistence.ts`) could never have caught it — that
  door leaves masterwork entirely for the platform document editor at
  `/documents/<id>`. So there is now a second registry keyed by FILE rather
  than by lane: `sitting/textEntrySurfaces.ts`, whose guard
  (`sitting/__tests__/every-text-entry-surface-keeps-its-work.test.ts`) walks
  `features/masterwork/**` itself and fails on any `.tsx` that renders a text
  field and has no answer — including a `door` answer, which must name the
  module it opens and is checked against THAT module's source. The census it
  forced found four more surfaces an Expert pastes real work into that kept
  nothing at all: the Audition dialog, Compare Two, Run the Bench (three long
  fields retyped immediately before a run that spends real money across six
  arms) and the Build window. The document editor itself
  (`features/data-tables/components/DocumentEditor.tsx`) now flushes its 2.5s
  autosave debounce on `pagehide`/`visibilitychange` and on unmount, warns
  before an unload that would outrun the flush, and — where it used to return
  silently twice when the Univer facade was gone, swallowing every save while
  the page still said "Editing" and took keystrokes — says so out loud with the
  only remedy that saves the words.

- 2026-09-17 (doors to Libraries) — **A WHOLE YOUTUBE CHANNEL IS NOW REACHABLE
  FROM MASTERWORK.** The Media Source Catalog (`/libraries`) catalogues a whole
  channel/playlist into a Library of Sources, and Masterwork had no door to it:
  the Sources panel offered one link at a time, and step 2 of `/masterwork/new`
  offered only registry Approaches. Two doors added, both plain navigation, no
  new capture flow: `components/detail/RulebookSourcesPanel.tsx` gains a third
  sibling in the capture toolbar's `extraActions` — "Bring a whole channel"
  (`Library` icon), linking to `/libraries?from=rulebook&rulebook_id=<id>`,
  deliberately WITHOUT `aria-expanded`/`aria-pressed` since nothing opens below
  the row; and `intake/NewRulebookFlow.tsx` step 2 gains a dashed panel beside
  the Approach cards ("Already have a YouTube channel in mind?") linking to
  `/libraries?from=rulebook` — no id, because nothing is created until Start,
  and the wizard draft restores the typed answers on return. It is NOT an
  Approach card: the cards stay the registry's rows. The receiving end
  (`features/source-library/components/LibrariesFrontDoor.tsx`) reads
  `?from=rulebook` and says in one sentence that the channel is catalogued
  first and its videos can then be sent to the Rulebook, with a "Back to the
  Rulebook" door when a valid id came along.

- 2026-09-17 (phone width, the class) — **EVERY MASTERWORK SURFACE AND LANE
  CARRIES THE 44px TOUCH FLOOR.** Measured at 390×844 as `admin@admin.com`:
  `/masterwork/<rulebook>` rendered 84 controls, 59 of them under the floor, and
  only seven of those were design-system `Button`s (already lifted in
  `@ai-matrx/design-system` 0.21.0). The rest were raw `<button>`/`<a>`
  inheriting no primitive at all. The fix is the platform's ONE coarse-pointer
  hit-area utility, `.matrx-touch-targets`, declared once at the route root
  (`app/(core)/masterwork/layout.tsx`, `display: contents` so the `(core)`
  scroll chain is untouched) and once on each of the 24 lane `DialogContent`s,
  which portal out of that subtree. The ten rule checkboxes — which the floor
  deliberately refuses to GROW, since a 44px tick box is an empty square —
  got the new `.matrx-tap-area` ring on their labels instead: 16px tick,
  44×44 finger, proven live by hit-testing 18px off-centre in all four
  directions. After: 2 controls under the floor on that page, both
  `Button asChild` links waiting only on the 0.21.0 publish. At 1440 with a
  fine pointer nothing in this tree changed — neither rule's media query
  matches. Guard: `__tests__/every-lane-carries-the-touch-floor.test.ts`
  (2 of 3 RED before).

- 2026-09-17 (sixth cold walk, the class) — **IN-PROGRESS WORK SURVIVES A
  RELOAD IN EVERY CAPTURE LANE, AND THE REGISTRY NOW FORCES THE QUESTION.**
  Walk 4 found the Triad erasing an answered round; walk 5 found it on the
  Sorting Table; walk 6 found it on the Red-Pen lane and the Daily Drip. Each
  was fixed where it was found, so the census walk 6 triggered asked every lane
  the same question by driving it — type a real sentence, reload — and the
  answer was the same everywhere: Red-Pen, the Prediction Ledger, all five
  ingest lanes, "Everything you've published", the chat import, the Meeting
  Scavenger, the unfolding case, Shadow-the-inbox and the Capture Plan's setup
  form ALL swallowed the sentence and said nothing.
  Two root causes, both closed as classes.
  *Nothing kept the lane's working state.* The round-shaped `createSittingStore`
  existed but had no shape a dialog could adopt, and `lib/drafts/useTextDraft`
  covers ONE field with a 40-character floor — so a source's title and every
  saved correction were never kept at all.
  [`sitting/useDialogSitting.ts`](./sitting/useDialogSitting.ts) +
  [`sitting/SittingResumed.tsx`](./sitting/SittingResumed.tsx) are that shape:
  one call keeps the whole lane, puts it back, and SAYS SO with a "Start again"
  beside it. Every lane above is on it.
  *Seventeen deep links held a `useRef(false)` latch,* and `/masterwork/[id]` is
  ONE component instance across client-side navigation — so a second visit to
  `?drip=1` or `?red_pen=1` opened nothing and said nothing (walk 6 finding 5).
  [`lib/deep-link/useDeepLinkArrival.ts`](../../lib/deep-link/useDeepLinkArrival.ts)
  treats a deep link as an arrival that re-arms when the URL stops asking.
  🚨 **A NEW LANE MUST ANSWER "what happens when she reloads?"**
  [`sitting/lanePersistence.ts`](./sitting/lanePersistence.ts) holds the answer
  per lane, and
  [`sitting/__tests__/every-lane-keeps-its-work.test.ts`](./sitting/__tests__/every-lane-keeps-its-work.test.ts)
  reads the live `platform.approach` registry, fails on any promised lane with
  no answer, and reads each declared module from disk so a declaration cannot be
  a sticker over a lane that keeps nothing. Both guards proven failing-then-
  passing. NOT closed, and recorded in `FOUND_DEFECTS.md` with its reason: a
  typed-but-unsent message in the interview and Conductor rooms, which lives in
  the shared chat composer and is a platform-wide gap, not a Masterwork one.

- 2026-09-17 (sixth cold walk, findings 3 / 6 / 7) — **A RESTORE THAT
  CONTRADICTED ITSELF, TWO MOTIONLESS WAITS, AND A LANE WITH NO SECOND GO.**
  *The probe's restore:* `restoring` on the shared durable-run handle was
  cleared in the rejoin request's `.finally`, which is not the moment the mount
  can describe what it holds — a rejoin routed to any worker but the executing
  one answers at once with the durable ROW (`processing`) and hands the screen
  nothing, and a rejoin that does not land answers even faster. Either way the
  Bad Example Probe went back to offering "Write the first one" over a live,
  paid round. Measured on a brand-new Rulebook (2026-09-17): 87 seconds of a
  start button over round 2 being written, with the receipt itself deleted, so
  no later reload could find the run again. Fixed in the PRIMITIVE
  (`lib/durable-run/useDurableRun.ts`): `restoring` now ends only on a terminal
  status, a fresh launch, or a pointer that turned out to be nothing; and an
  unreachable rejoin for an unfinished run keeps its receipt and enters the
  honest reconnect loop instead of resetting the surface. The probe's rounds
  already answered now ride on the run's own receipt (`memo.prior_rounds`), so
  the restored screen shows round 1's example and the Expert's own words rather
  than a blank page. Guards: three new cases in
  `__tests__/a-restoring-probe-never-offers-to-start.test.tsx`, red against the
  pre-fix hook. *The motionless waits:* "Writing round N…" and "Writing your
  cards…" were the same pixels at second 1 and second 61 (measured: 61 and 18
  unbroken identical seconds). Both lanes now render `<WorkingNotice>`
  (`lib/progress/`), which keeps the server's own sentence and adds a clock
  that moves every second plus what this kind of work usually takes — never a
  fabricated percentage. Guard:
  `lib/progress/__tests__/a-waiting-screen-is-never-motionless.test.tsx`.
  *The dead end:* Shadow-the-inbox's result screen offered only ways out, on a
  lane whose own doors expect many threads over time. `DurableRunAgain` is the
  shared affordance and every repeatable source lane now carries it. Guard:
  `__tests__/a-finished-lane-offers-another-go.test.tsx`.
- 2026-09-17 (sixth cold walk) — **TWO SCREENS THAT PUT SOMETHING BACK WITHOUT
  SAYING SO.** *The guided start's tripled goal:* an Expert typed her goal on
  `/masterwork/new`, went to look at the catalog and came back; the textarea
  already held the old sentence with nothing on screen admitting it, so she
  read it as the blank page, clicked where her eye landed and typed her
  sentence into the middle of the old one — `platform.rulebook.description`
  and `metadata.intake.goal` got `prefix + whole sentence + suffix`, 286
  characters from a 143-character sentence, and the Capture Plan faithfully
  displayed the mess. Fixed in the PRIMITIVE: `useWizardDraft` now applies a
  restored draft through `applyOnce`, which cannot run without raising
  `didRestore`, and `<WizardDraftRestored>` says it in plain words with a
  "Start fresh" that empties the form. Adopted by every consumer — the guided
  start, the rule editor and the Research init wizard. (A successful Start was
  checked live too: `clearDraft()` durably reaches storage even when the
  navigation follows immediately, so a started Rulebook never resurrects its
  draft.) *The teach-back's "You corrected 0 rounds":* the session's rounds
  lived only in mount-time React state, so a rejoin rebuilt it from the durable
  run's LAST round and the request went out with no correction in it at all —
  the server counts the corrections in the request, so it counted zero, and the
  explainer had lost her corrections with them. The whole session is persisted
  through the same wizard-draft primitive now, and the sign-off counts the
  rounds it actually holds; when this device does not hold the whole session it
  says so instead of printing a number. Guards, both proven failing then
  passing: `lib/wizard-draft/__tests__/restored-draft-is-announced.test.tsx`
  (plus a census so the next wizard cannot repeat it) and
  `teach-back/__tests__/teach-back-remembers-the-corrections.test.tsx`.

- 2026-09-17 (later) — **FOUR SCREENS THAT CONTRADICTED THEMSELVES** (fifth cold
  walk, findings 3, 4, 6 and 6b), each fixed at the layer that owns the class.
  *The probe's two states at once:* a reload mid-round painted the SETUP screen
  ("Write the first one", "Up to 5 rounds…") over a live "Writing round 2…" row
  for ~9s, because `started` is answered by restored CONTENT while `running` is
  true from the first paint. The missing third answer — "there is a run here and
  this mount cannot describe it yet" — is now `restoring` on the shared
  `useDurableRun` handle, so every durable surface has it; the probe and the
  Teach-Back (the same shape, one grep away) both use it. Verified live on a
  brand-new Rulebook: the reload now shows only "Reading what you said about
  round 1 and turning it into rules…" with its Stop. Guard:
  `__tests__/a-restoring-probe-never-offers-to-start.test.tsx`.
  *The paste box's untrue instruction:* see the aidream half — the placeholder
  now teaches the shape the parser can honour, and
  `__tests__/the-paste-box-teaches-a-shape-that-parses.test.ts` keeps the copy
  from drifting back.
  *"0 Built" about a Masterwork it just watched being built:* the Build's
  terminal event fires before the `workflow.definition` row is readable;
  `listMasterworksAfterBuild` waits for the id the Build announced and SAYS so
  when it never appears. Guard:
  `__tests__/a-built-masterwork-is-counted-not-guessed.test.ts`.
  *A chip that filled a box you then could not send from:* a native button takes
  the caret, so Enter went to the chip. `ComposerChip` (in `features/agents`)
  refuses the focus and puts it back; verified live — chip click leaves the
  caret in the composer and Enter sends. Guard:
  `features/agents/__tests__/a-chip-that-fills-the-box-leaves-you-able-to-send.test.tsx`.
  *And a scope badge reading `0` over a populated list:* `EntityScopeTabs` could
  not tell "not counted yet" from "counted, and zero" — an unmeasured count now
  renders nothing at all. Guard:
  `lib/entity-list/__tests__/a-scope-badge-never-says-zero-before-it-counted.test.tsx`.

- 2026-09-17 — **THE SORTING TABLE NEVER ERASES A SITTING EITHER, AND THE
  MECHANISM IS NOW SHARED** (fifth cold walk, finding 2). A day after the Triad
  game's sitting was made durable, the fifth cold walk found the identical
  defect on the Sorting Table — the Triad game's own named sibling. Reproduced
  live on 2026-09-17 against `origin/main`, on a brand-new Rulebook: twenty real
  e-waste cases dealt into three named piles, five sorted on the keyboard
  (1/2/1/3/2) to "Case 6 of 20", reload → back to "Sort the pile, then we'll
  find the line" with the pile picker and "Start sorting", zero trace of the
  five placements, no resume banner of any kind. The root cause was not the
  Sorting Table: it was that the Triad fix had been written BY HAND inside
  `TriadGamePage`, so there was no primitive for the sibling lane to inherit —
  the instance was fixed and the class was left open. The sitting mechanism now
  lives once, in [`sitting/sitting.ts`](./sitting/sitting.ts) (`createSittingStore`,
  `describeResumedSitting`, `settleInFlightSaves`, `countInFlight`); the Triad
  game was moved onto it with its sentence unchanged, and the Sorting Table now
  restores the phase, the piles she named, the dealt cases, every placement, the
  boundary questions and each answer's own status, and says so in one sentence.
  An answer mid-save when the tab went away is reported as landed-with-nothing-
  countable plus the true remedy, never as saved-with-a-count and never as lost.
  Verified live on brand-new Rulebook `0d0befe0`: the same sequence now returns
  to "You were on case 6 of 20, after sorting 5. Picked up where you left off."
  over case 6 of the same pile. Guard:
  `__tests__/a-sorted-case-survives-a-reload.test.tsx`, proven RED against the
  pre-fix component (second mount rendered the setup screen) and green after.

- 2026-09-16 (later) — **THE TRIAD GAME NEVER ERASES A SITTING, AND THE PROBE'S
  COUNTER NEVER GOES BACKWARDS** (fourth cold walk, findings 2 and 3).
  *Triad:* the whole sitting — deck, index, answered cards, what each answer
  returned — lived in React state and nowhere else. Reproduced live: two cards
  answered, "Save and next" succeeded both times, a reload landed back on "Deal
  me in" with no card state and no banner; the rules DID land about a minute
  later (the server detaches on disconnect), so the only conclusion the screen
  supported was "nothing saved" and the natural next move was to replay the same
  cards. The sitting is now written to this browser as it is played and picked
  up on the next load, saying so — including that an answer still in flight when
  you left carried on without you. The server half gives each answer a durable
  run row before the paid call (aidream `/masterworks/ingest-triad` and
  `/masterworks/ingest-sort`, the only two rule-writing lanes that had none),
  which is also what restores the source claim that refuses a double submit.
  Verified live on brand-new Rulebook `5d8f9b4f`: reload → "Card 3 of 10" with
  the resume sentence, 2 `triad` runs `completed`, 2 triad-sourced rules, both
  carrying a `run_id`. Guard:
  `__tests__/an-answered-triad-card-survives-a-reload.test.tsx`.
  *Probe:* rule 3 ("never invent the count") came back one press later.
  `run.launch` wipes `run.result` synchronously before the network call, so from
  the press of Send until the next result lands the counter fell back to
  `rounds.length` — 1 on any restored mount. Reproduced live: a probe restored
  at "Round 2 of 5" read "Round 1 of 5" over round 2's own memo the instant Send
  was pressed. `serverRound` remembers the last index the server reported, so
  the number can only move forward. Verified live on brand-new Rulebook
  `c60885c6`: same sequence, the label stays "Round 2 of 5". Guard: the new case
  in `__tests__/a-restored-probe-round-can-still-be-sent.test.tsx`.

- `2026-09-17` — 🚨 **The probe stopped inventing the round number.** Found on the live
  surface while verifying the restore fix below: the counter read `rounds.length`, which is
  the number of rounds THIS MOUNT has seen, so a person who came back to round 3 of their
  probe was told "Round 1 of 5" over round 3's own example — exactly what
  `BadExampleProbe`'s own rule 3 forbids ("Never invent the count. 'Round 3 of 5' comes from
  the server's own `round_index` / `round_count`"). The server sends `round_index` on every
  round and it survives the durable restore, so that is now the only number on screen, with
  the length as the fallback before any result has landed. Guard: a third case in
  `__tests__/a-restored-probe-round-can-still-be-sent.test.tsx`, red the moment the counter
  goes back to the length. **Left behind, NOT fixed:** a restore brings back only the LAST
  round, so "Earlier in this probe" is empty after a reload even when several rounds were
  answered — the durable pointer carries one result, not the session. Nothing is lost (every
  answered round's rules are on the Rulebook) and nothing on screen lies about it now, but
  the history the person had is not restored with the round.

- `2026-09-16` — 🚨 **A restored probe round had the answer and not the question, and both its
  buttons died in silence** (jobs-bar cold walk 3, finding #1, live-confirmed by a first-time
  Expert). `rounds` come back from the durable-run pointer; `caseBrief` is mount-local
  `useState("")` and did not. So after a refresh — or a navigation away and back, or a later
  session — the example, "Round 1 of 5" and the answer box were all on screen while the case box
  was empty AND disabled under "Locked for this probe", and `send()`'s opening
  `if (caseBriefProblem) return;` swallowed every press of "Send this and show me the next one"
  and "I'd never see that — stop here": no request, no error, no spinner, and the critique the
  Expert had just typed was gone. Three halves, root first. (1) THE PLATFORM PRIMITIVE: a durable
  run now carries a `memo` — the few input strings the NEXT request needs and the answer cannot
  rebuild — passed as `launch(body, target, { memo })`, written onto the run's own receipt beside
  `scopeOverrides`, and handed back as `run.memo` on a rejoin or a settled restore
  (`lib/durable-run/useDurableRun.ts`). It restores from what the run ALREADY stores; no second
  store, and no server change (the probe response does not echo `case_brief`, and aidream was out
  of scope for this fix). The probe launches with `{ case_brief }` and reads it back. (2) NOTHING
  FAILS SILENTLY: the guard no longer returns void — a press that cannot proceed says why and what
  to do, in the same place `run.error` renders, and the case box is locked only while we still
  HOLD a case, so a restore that genuinely lost it can take it again instead of locking the Expert
  out of their own session. (3) The heading fallback `A ${caseBrief || "work"} that looks right`
  rendered "A work that looks right" — a sentence built from empty state — and now names the
  example honestly when the brief is missing. Guard:
  `__tests__/a-restored-probe-round-can-still-be-sent.test.tsx` drives the REAL screen over the
  REAL durable-run hook, launching and settling a round in one mount and rejoining it in a second
  off the pointer the first one really wrote (only the transport is faked). Three cases, two
  expected values: the restored round SENDS with that exact brief and critique (and the stop
  button too), and a receipt with no memo sends NOTHING and says so on screen. All proven RED on
  the pre-fix code and against three separate mutations (memo dropped from the receipt, restore
  removed, guard back to a bare `return`). Census of the sibling lanes (every early-return click
  handler under `features/masterwork/`, 24 handlers): no other offender — each one's condition is
  either checked verbatim in its button's `reason`/`disabled` or structurally impossible while
  that button renders. Left behind, deliberately: the Teach-Back's `topic` is also mount-local and
  is not yet carried in a memo — nothing there goes inert (it gates no control and the server
  picks its own subject when it is empty), so a restored teach-back sends an empty topic rather
  than the Expert's.

- `2026-09-16` — 🚨 **A Rulebook page carried the PREVIOUS Rulebook's words** (jobs-bar cold
  walk 2, finding #1's closing lead). Both rulebook-scoped page scaffolds are one element
  position, so a Rulebook→Rulebook navigation changed a prop and React kept the mounted
  instance: `CapturePlanPage` seeds its goal from `rulebook.description` in a `useState`
  initialiser, so Rulebook B's plan form opened holding Rulebook A's sentence — which from the
  Expert's seat is indistinguishable from the cross-record WRITE the walk thought it saw (that
  write was clean). `RulebookLaneRoute` also kept the previous Rulebook in state while the next
  loaded, so the old row really did render under the new URL. Fixed at the class, one line each
  and no lane edits: `RulebookLaneRoute` (all 14 lanes) and `RulebookDetailPage` now mount their
  instance keyed by the rulebook id — a different Rulebook is a different page, so every derived
  `useState`, open dialog, staged draft and in-flight load starts fresh. Guard:
  `__tests__/a-rulebook-page-never-carries-the-previous-rulebooks-words.test.tsx` — the real lane
  → real page → real read, two Rulebooks in ONE mounted app; 3 cases, proven RED with the key
  removed (B's form showed A's sentence, verbatim as photographed) and green restored. The
  wire is shared with the sibling write guard at `__tests__/rulebookWire.tsx`.

- `2026-09-16` — **"Your recent runs" on the Encore run page tells one run from another
  (jobs-bar-2026-09-16, item 18).** It listed eight runs of the same Masterwork as eight
  identical lines — "Finished · 1d ago", eight times — because Encore had its OWN recent-runs
  reader (five columns, no preview, no cost) and its OWN row, while the Masterworks lane over
  the same table already showed the first line of what each run handed over. One question, two
  implementations. `listRecentRunsForMasterworks` is now the only reader (it takes
  `perMasterwork` and `onlyCreatedBy`; the scope WORD is still declared at the call site), and
  `EncoreRun` is `MasterworkRun`. `MasterworkRunRow` is now the only row — it grew a `trailing`
  slot for Encore's "That's mine" sign-off, it stacks below `sm` so that ~230px control can
  never squeeze the run's line to one character per row again, its open-door arrow is visible on
  touch, and the Operator status words ("Finished", "Didn't finish") moved into it from Encore's
  copy so both doors stop printing `errored` and `abandoned` at people. Guard:
  `encore/__tests__/encore-history-says-what-each-run-said.test.tsx`, over the same verbatim
  `workflow.node_events` fixtures the lane's own guard uses.

- `2026-09-16` — **The Jobs bar, lanes A: the five capture lanes walked as a first-timer, at
  desktop and phone width.** Twenty-two findings, fixed at the place each one belongs. The Capture
  Plan opens with the Expert's own description in the goal box instead of an empty field behind a
  placeholder about somebody else's job; its three settings pickers finally have labels a screen
  reader can hear and triggers that wrap instead of cutting a sentence mid-word; its two number
  fields dropped `FancyInput`'s always-on "Copy to clipboard" button, which copied "30" and sat in
  the tab order between every field; and its schedule prints each session's own one-line ask —
  already authored in `methods.ts` and never shown — in place of the same "you have not tried this
  one yet" sentence repeated on all thirty-two rows. The Teach-Back stops promising it reads out
  loud before the button exists, states its locked topic as a sentence instead of leaving a
  white textarea nobody can type in, drops the decorative microphone glyph that was not a control,
  and says why "Send this and try again" is grey. The Sorting Table wraps its pile-count control
  (at 390px the "4" was off the right edge of a screen that does not scroll sideways), puts the
  case on a card, makes its progress bar a real `progressbar`, takes `1`–`4`/`S`/`U` from the
  keyboard, and stops printing the word "pasted" under every pasted case. The Daily Drip's
  never-started state is a card like its three siblings with the terms stated before the opt-in
  rather than after it, the lane is titled for what it is rather than for a question three of its
  four states do not have, the scoreboard no longer prints "Nothing has been asked yet" above the
  heading that invites you to start, and the hour list no longer skips 1pm and 3pm. The interview
  start screen pins its Start button instead of burying it under nine probe cards, says how long a
  session runs and that stopping is safe, and stops jolting card titles sideways on select; the
  interview session itself no longer opens on the generic agent hero ("Ready to run — fill in any
  variables below", on a screen with no variables for the Expert) — and the override only lands
  because it waits for the instance row, since the three `instanceUIState` display setters discard
  a write aimed at a conversation whose row has not been created yet (`FOUND_DEFECTS.md` D326,
  which also disables the Conductor lane's identical fix). Evidence, before and after:
  `common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/lanes-a/`.

- `2026-09-15` — **THE PREDICTION LEDGER — calling it before you know.** A new Approach and a new
  door (`features/masterwork/prediction/`): the Expert records predictions on real open cases in
  her own work with a confidence, a one-line why and a due date, by voice or typing, and enters
  the outcome when it arrives. The whys behind well-called predictions become rule candidates; the
  whys behind the misses are boundary findings. The ledger is raw facts on
  `metadata.prediction_ledger` with every score derived on read; the on-page readout plots what she
  said against what happened, and renders an honest waiting state instead of a chart until at
  least one outcome exists. `resolveApproachLane` grew `{kind:"prediction"}` from
  `intake_query.predictions === "1"` — deliberately NOT an ingest-dialog lane, because every ingest
  lane reads expertise out of something that already exists while this one CREATES the record over
  weeks in two sittings. The registry row was flipped live by the server half the same day.
- `2026-09-15` — **"YES, THAT'S MINE" — the ownership review, the agenda it produces, and the
  signature on a result.** Three things, one derivation each, no parallel system. (1) The rule
  review speaks the Expert's words under knob `masterwork.review.vocabulary`; mine→approved,
  not-mine→rejected (reason "Not mine." when they say nothing more), mine-but-wrong→change
  requested, and the statuses are byte-identical to the neutral wording. "Not mine" is a complete
  answer with no sentence — one tap. (2) Every rule in those last two states is listed on the page
  as **Next session starts here** (knob `masterwork.review.agenda_panel`), and the SAME list is
  named THE NEXT SESSION'S AGENDA in the bound Rulebook document and in the server's
  `open_feedback`, so Expert and interviewer read one agenda. (3) Every rule row now carries its
  provenance MOMENT in the row itself, through the same `formatTimeAnchor` the expanded row uses —
  an Expert asked "is this yours?" could previously not see where it came from without opening it.
  (4) A finished Masterwork run carries the thumbs: "Yes, that's mine" signs it, "Not right" opens
  the correction flow whose result becomes a rule candidate. Signing lives on the Try box the
  moment a run ends AND on every finished run in "Your recent runs", because the Try box forgets a
  finished run on purpose and the signature must outlive a page reload.
  Guards: `review/__tests__/ownership-review.test.tsx` (the wording maps to the same handlers; the
  agenda is exactly the two states; a thumbs-up reaches `upsert_output_feedback` and never a
  table) — all three proven failing on a planted break.
  **Also fixed here, at the class:** every Supabase call in this feature rethrew the raw PostgREST
  error object, which is not an Error and stringifies to "[object Object]" — the sentence a user
  actually saw when Approve failed. All of them now throw `operationFailed(action, cause)`;
  `__tests__/errors-are-sentences.test.ts` proves a refused read comes out as a sentence with the
  raw response preserved as `cause`, and censuses the feature for the old shape.

- `2026-09-15` — **THE BENCH HAS A DOOR (`encore/RunTheBench.tsx`).** The proof existed and could
  only be started from a command line, so the product could report a trial and never run one. The
  door sits beside the quick check on the Encore run page and is governed by the server's answer,
  not by the client's guess: `can_run_here` true (and a `form` actually present) renders a "Run the
  Bench" button; false renders the server's own REASON sentence and **no control at all** — never a
  greyed button, never one that does nothing. Starting is a destructive/expensive click: the
  consequence (real paid calls across all six arms plus the judges and the blind panel) is named
  above the button AND in the canonical `confirm()` before anything fires. Live, each
  `masterwork_bench_arm` lands as its own row — the arm letter, what it is in plain words, its
  model, cost and seconds, or "did not run" with the server's error — over the server's
  `masterwork_bench_progress` stage line, with the running total visible. 🚨 **A BENCH RUN IS NOT
  ALWAYS DURABLE:** `bench_trial` is still outside the `platform.masterwork_run.operation`
  vocabulary, so when `form.durable` is false there is no run row, no `masterwork_run` receipt and
  therefore nothing to rejoin — `useDurableRun` degrades cleanly (stages and the terminal event
  still work, only the pointer is absent) and `form.durable_note` is rendered BEFORE the start
  control, because a person is owed that before they spend. On the verdict the server's own
  `headline` is rendered, never re-written; a **void** trial says it proves nothing and renders NO
  win, and a **not scored** trial says the panel was not calibrated and that this is neither a pass
  nor a fail. Then the panel re-reads `GET .../bench` so the banked record replaces the live one.
  🚨 **THE CORPUS COUNT IS NOT TAKEN ON THE READ** (aidream 864b37a49): assembling a Rulebook's
  pre-engagement corpus scrapes pages and reads documents, so counting it every time the Encore run
  page loads would make LOOKING at a Masterwork cost money. `form.corpus_sources` is therefore
  `number | null` and comes back null from `GET .../bench`, with `corpus_note` carrying the rule
  instead; the real count arrives in the `masterwork_bench_progress` stage line at stage `corpus`
  once a trial starts. The form renders the note always and a count only when one exists — a null
  printed as "0 sources" is a fabricated fact.
  Guard: `encore/__tests__/RunTheBench.honest-states.test.tsx` — six legs (cannot-run reason
  verbatim with zero controls · the not-rejoinable sentence positioned above the start control ·
  an uncounted corpus never printed as zero · per-arm cost and seconds · void renders no win ·
  not-scored never reads as a fail), each proven
  red against a mutated component and green against the real one.

- `2026-09-15` — 🚨 **A TWO-ARM COMPARISON IS NEVER THE PROOF.** `encore/AuditionProof.tsx` rendered
  "Expert match {N}/100", called itself THE PROOF in its own header and described the vanilla arm as
  "the head-to-head against a plain AI"; the Encore run page and the browse list carried the same
  words. Under the doctrine (`common-docs/systems/masterwork/doctrine/CORE.md` §6, and §9's standing
  verdict of 2026-09-14 that the shipped Audition's score is *not* proof and is replaced by the
  bench) proof is a logged five-arm Bench run — A0/A1/A2/B/C/GT, a blind panel the expert's own
  withheld work must win, dollars and seconds per arm, and a claim naming the arm and the budget.
  Now: the score reads **"Quick check: N/100 against the expert's published work"** everywhere
  (panel, card, browse column header), and beside it the component renders the Bench answer — the
  record's own headline with the arm, the budget multiple, the blind-panel result, our arm's cost
  and seconds and the report path when one exists, or a plain **"No bench proof yet"** with what a
  proof is and where the Bench runs when none does. A viewer who cannot read the Rulebook is told
  "can't tell from here" rather than a false no. NO DEAD CONTROL: the Bench has no screen yet, so
  the panel says it runs from the command line instead of showing a button that would do nothing.
  Server half: `GET /masterworks/{rulebook_id}/bench` (aidream
  `services/masterworks/bench_proof.py`, reading the bench row when the operation vocabulary admits
  one and the Bench's own file index until then), and every Audition sentence now ends "Not a proof;
  run the Bench." Guards: `encore/AuditionProof.test.tsx` (five legs, proven red against the pre-fix
  component) and aidream's `masterworks/tests/test_audition_claims_honest.py`.

- `2026-09-14` — **The `rule_draft` write target has a REGISTERED value contract.** `masterwork_rule_draft`
  (`content_ir.kind_definition` `fc6eba46-709b-4cfd-bde2-a264420f18a8`, active) is registered from the
  ONE shared validator `agent-context/ruleDraftInput.ts` — same single required field (`mode`), same
  optional fields, same `RULE_ACTION_KINDS` / `RULE_POLICY_LEVELS` enums — and the manifest target now
  names it (`valueKind`). Nothing about what the page accepts changed; what changed is that the contract
  is now PUBLISHED (the `apply_surface_write` spec prints `[kind=masterwork_rule_draft {…}]`) and
  ENFORCED at the seam before the Expert is asked to approve, instead of living only in the handler's
  throw. Two consequences to know: an agent's value must now carry `__kind: "masterwork_rule_draft"`
  (the schema requires the marker, as `media_chapters` does — the target description says so), and the
  description's `actionKind` list was wrong, naming six of the nine legal values; it now names all nine.
  `rule_id`-must-exist and `section`-must-be-a-code stay with the validator: they are facts about the
  OPEN Rulebook, not about the shape. Schema source: `features/content-ir/kinds/masterwork-rule-draft.ts`.
  This closes the last residue of wall W49; its handoff is deleted and its census now lives in
  `features/agents/FEATURE.md` § Invariants & gotchas.

- `2026-09-13` — **The frontend half of the convergence landed: BOTH decision halves render, from
  ONE form.** Merging `main` (trial 8) into this branch, the ruling already applied on the server
  was applied here: the FLAT policy shape keeps the contested key names (`kind`, `precondition`,
  `next_action`, `action_kind`, `cost`, `risk` — prose strings and level enums on the rule, 592
  live rows carrying `precondition` as a string), so `RuleFieldValues` (in `types.ts`, re-exported
  from `RuleFields`), `policyRulePatch`, `improveFieldsFrom`, `RULE_POLICY_LEVELS` and the
  "This is a decision rule" toggle survive unchanged; the STRUCTURED half keeps its own
  uncontested `move` group (`RuleMoveFieldValues`, `ruleMoveFieldsFromRule`, `ruleMoveFromFields`).
  `RuleFields` renders both blocks and is still THE ONE form: the flat decision block reads
  `values` / `onChange`, and the move block reads the new OPTIONAL `move` / `onMoveChange` props —
  a host with nowhere to put that half (the Final Checkup's SUGGESTION) passes neither and the
  block is not rendered, which is why the checkup now omits `["quote", "isPolicy", "policy"]`.
  `RuleEditorDialog` holds ONE `values` object (W58) beside the `policy` move state, `wasOpen`
  starts false so a mount that starts open still restores the persisted draft, and its save spreads
  `policyRulePatch(values)` (which clears the flat fields when the toggle is off) and then
  `ruleMoveFromFields(policy, initial?.move)` (which carries every `move` field the form does not
  own). The two lane-completion primitives both survived the merge — `useRunOutcome` (used by
  triage, and the only one with a `when` filter) and `useRunResultOnce` (used by all four ingest
  dialogs) — and `IngestSourceDialog` calls `useRunResultOnce` once, not both. **Unfinished:** two
  hooks for one law is a duplicate nobody has collapsed yet, and `AddRulePanel` shows only the flat
  half because it holds no `move` state.

- `2026-09-13` — **Two trials built the rule's decision shape on the same two field names; the
  592 live rows decided which one keeps them.** Trial 8 shipped a FLAT policy shape to `main`
  (`kind` / `precondition` / `next_action` / `action_kind` / `cost` / `risk`, all strings,
  rendered by `RuleDecision`) while trial 7 was building a STRUCTURED one on `precondition` and
  `next_action` as objects. A census of `platform.rulebook` found **592 rules across 3 Rulebooks
  carrying `precondition` as a JSON STRING and zero carrying it as an object**, so the branch as
  written would have made every one of those rules read wrong through the typed reader. Reality
  arbitrates fact against fact: the flat shape keeps the key names.
  - Trial 7's structured halves moved into **`rule.move`**, its own uncontested group:
    `RulePrecondition{summary, known, unknown}` folded into **`RuleMoveWhen`** at `move.when`
    (it also carries `counterparty_state`, so one shape is a strict superset of both, nothing
    lost), and `RuleNextAction` became **`RuleMoveNext`** at `move.next`. Mirrors
    `aidream/services/distillation/distill.py` exactly.
  - **One renderer per concept.** `RulePolicy.tsx` became
    [`components/detail/RuleMove.tsx`](./components/detail/RuleMove.tsx) and reads `rule.move`;
    `RuleDecision` (the incumbent) still owns the flat strings. They render as ONE block, decision
    first and the move under it — two depths of one judgment, never two components competing for
    the same fields. `RuleDecision` was not touched.
  - `RULE_ACTION_KINDS` was declared TWICE in `types.ts` (six values for the flat half, nine for
    the structured one); it is now declared once with the nine, which are a strict superset, and
    the `distill.py` parity guard in `__tests__/policy-rule-surface.test.tsx` still holds.
  - The form values renamed with their target (`RuleMoveFieldValues`, `ruleMoveFromFields`, …)
    and now emit `{ move }`. `agent-context/rulebookDocument.ts` prints the flat decision lines
    first and the move detail (including `move.ask`, verbatim) under them.
  - `IngestTimelineDialog` now posts to `/masterworks/ingest-unfolding`: trial 8's timeline lane
    is merged and keeps `/masterworks/ingest-timeline` and the `timeline` lane of
    `IngestSourceDialog`, and this dialog is the only door that can SEAL a held-out exam case.
    It reaches the registry through a real `{kind: "unfolding"}` lane in
    `browse/approachLane.ts` rather than a hand-written query branch. **Unfinished:** two ingest
    doors for one `timeline` Approach is a duplicate nobody has collapsed yet, and the generated
    `api-types.ts` still lacks the new path until `pnpm sync-types` runs on a machine with
    database access.

- `2026-09-13` — **"Rebuilt <time>" dated the surviving build by the wrong clock (Bugbot, PR #222,
  low severity, real).** The staleness ledger keeps two different moments and they were conflated:
  `at` is when the last ATTEMPT finished — cleared when a new poke starts, rewritten when one
  FAILS — while `result` deliberately survives a later failure, because the stand-in really is
  still performing from the build that landed. `readUnderstudyStandIn` dated `result` by `at`, so
  after a failed follow-up the card kept the right version and counts and stamped them with the
  failure's clock, and during a pending poke it fell back to the workflow row's older timestamp.
  The state now carries `resultAt` beside `result` (set on success, preserved through pending and
  through failure) and `rebuiltAt` reads that. Guard
  `features/masterwork/__tests__/understudy-refresh.test.ts` — two cases, both proven RED against
  the old expression with `Date.now` driven by hand, because a real clock can hand two settles the
  same millisecond and let the defect pass by luck.

- `2026-09-12` — **Six review findings on the unfolding-case lane (Bugbot, PR #222), each fixed
  at its class with a guard proven failing-then-passing.** **(1) A held-out timeline could show
  the answer.** `parseTimelineSummary` kept the server's timeline byte for byte and handed it to
  `KindInstanceRender`; the kind bridge withholds `resolution` only on `sealed: true`, so a
  held-out payload carrying the outcome drew "how it turned out" under copy promising nobody
  ever sees it. The ONE parser now seals and strips a held-out case on the way in
  (`__tests__/timeline-intake.test.ts`). **(2) A finished ingest reloaded the Rulebook forever.**
  All four ingest dialogs fired `onIngested` from an effect keyed on the callback, and every host
  passes a new inline arrow every render — so the reload the callback started re-rendered the
  dialog, which reloaded again. ONE primitive now owns it: `durable-run/useRunResultOnce.ts`
  fires once per (run, result) pair, adopted by the timeline, source, chat-import and
  body-of-work dialogs. **(3) A rejoined unfolding audition read as a failure.**
  `parseUnfoldingVerdict` required the live event's `type`, but the durable row stores the table
  without it, so every snapshot-settled run was refused as "an incomplete result"; the untyped
  stored table is now accepted when it carries the case table plus a headline field, and a
  payload carrying a DIFFERENT type is still refused. **(4) The policy fields vanished on
  restore.** `precondition` / `next_action` were persisted nowhere, so a reload or a tidy restore
  brought back the prose and reset "When:" / "Next:" from the live rule; the wizard draft now
  carries them beside `fields` (`readPolicyFields`, validated — an unreadable half is absent, never
  half-applied). **(5) A reused run box kept the previous Masterwork's sealed case.** `caseItemId`
  is reset when the Masterwork or the disclose node changes, and the start guard asks the new
  `chosenSealedCaseIsCurrent` — an id must be ON the list this desk is offering. **(6) The live
  ledger could go backwards.** `readCaseDisclosures` concatenates emissions then stored outputs,
  so a fresh emission for turn 5 followed by a stored output for turn 2 made the box draw the
  older ledger; `latestCaseDisclosure` now ranks by the ledger's own monotonic `steps`.


- `2026-09-12` — **The unfolding-case lane's frontend half (contract §1, §2, §5).** Three
  additions, all additive; nothing any other lane does changes. **(1) Policy rule fields.**
  `precondition` (summary + known/unknown) and `next_action` (kind, target, buys, cost, risk,
  urgency) are two OPTIONAL fields on `RulebookRule`, rendered by ONE component
  (`components/detail/RuleMove.tsx`) on the rule card and in the review wizard, carried to
  every Rulebook-reading agent by `agent-context/rulebookDocument.ts`, and typed into the ONE
  shared rule form (`RuleFields`; the Final Checkup passes `omitFields={["quote","policy"]}` —
  a checkup suggestion has nowhere to put them, so rendering the inputs there would discard
  what was typed). `statement` stays the whole rule in prose — THE ANTI-MISLEADING LAW; a
  half-filled next action emits nothing rather than "Next: —". Guard:
  `__tests__/policy-rule-fields.test.tsx`. **(2) The timeline intake.** `?intake=timeline` opens
  `IngestTimelineDialog`; the run rides the ONE durable-run wire under its own surface
  (`timeline`) and pointer, so a timeline never rejoins the single-source ingest dialog. On
  completion the unfolded case renders through its kind component and the Expert is handed the
  drafts (teaching) or the sealed list (held-out). Guard: `__tests__/timeline-intake.test.ts`
  (the wire body, the refusals and their remedies, and the held-out summary that never mentions
  an outcome). **(3) Sealed cases** on the Sources view, label/date/licence only. The
  `serial_observation_timeline` kind itself lives in `features/content-ir/kinds/` with ONE
  component (`components/mardown-display/blocks/masterwork-timeline/`); its registry rows ride
  `migrations/content_ir_serial_observation_timeline_kind.sql` and until that is applied the
  kind renders the generic viewer, which is correct, not broken. Cross-repo SoR:
  `../../../common-docs/systems/masterwork/unfolding-case-contract.md`.

- `2026-09-12` — **The unfolding case reached the UI (trial 7, lane WS-D2).** A Masterwork whose
  workflow carries a `masterwork.case.disclose` node is a DESK: `TryMasterworkBox` now offers that
  Rulebook's sealed (held-out) cases — label and published date only, never the timeline or the
  resolution — sends the chosen one as the `case_item_id` run input stamped `human`, and draws the
  oracle's cumulative ledger live through the new `case_disclosure` kind component (the Expert's
  own answers still arrive through the ONE existing interrupt path; no spinner-only state). The
  desk's terminal `unfolding_ruling` has its own component. The Audition gained the "A case it has
  never seen" tab: desks × sealed cases × an optional vanilla arm told everything at once, scored
  into a per-case table plus a desk-vs-plain-model headline (which since 2026-09-15 states that a
  two- or three-arm comparison is a quick check, never proof — see the entry at the top of this
  list). Guards: `TryMasterworkBox.test.tsx`
  (the picker appears with the node and never without it; the W15 and W33 tests stay green).

- `2026-09-13` — 🚨 **A triage session belongs to ONE Rulebook (Bugbot MEDIUM).** `RulebookDetailPage` is a single component instance reused as the route param changes — which is exactly why the ingest session drops on an id change — but the sort door kept a bare `useState(false)`, and `TriageDraftsDialog` kept `keep` / `set aside` / the preview switch in its own state at a stable position in the tree. So opening "Sort the drafts" on one Rulebook and moving to another left the dialog on screen holding the purpose she had typed for the Rulebook she left, and starting it there would have sorted THESE drafts against THAT purpose. Two halves. (1) The open flag now lives in `triage/triageSession.ts` (`useTriageDialogSession`), the same shape as `useIngestDialogSession`: stored WITH the id it was opened for and dropped during render the instant they differ — not merely filtered, or coming back would match again and reopen an empty dialog by itself. (2) The dialog is mounted `key={rulebook.id}`. A remount rather than an in-dialog reset, because the form fields are not the only state that carries: `useTriageRun` → `useDurableRun` reads its pointer ONCE per mount (`rejoinedRef`) and never re-reads it when the key changes, so without the remount a sort running on the Rulebook she left kept showing on the one she arrived at while that Rulebook's own run stayed invisible. The pointer key itself was already correct (`triage:<rulebookId>`). Tests in `triage/__tests__/triage-session-per-rulebook.test.tsx`: a purpose typed on Rulebook A is gone (replaced by B's own intake goal) when the sort is reopened on B, the dialog does not reopen itself on returning to A, a live sort shows only on the Rulebook it runs for, plus source-level guards that the page holds no bare boolean and does key the dialog. All five proven RED against the pre-fix shape.

- `2026-09-13` — **Every rejoin latch clears when its run settles (Bugbot MEDIUM, fixed as a class).** Four dialogs reopen themselves onto a run still in flight on the durable spine — `triage/TriageDraftsDialog.tsx`, `components/detail/IngestSourceDialog.tsx`, `BodyOfWorkDialog.tsx` and `ChatImportDialog.tsx` — and all four held the same `reopenedRef`, set on the first auto-open and never cleared. So each rejoined exactly ONCE in the life of the page: a later live run (started in another tab, or on a fresh pointer after `reset` cleared the last one) stayed hidden with the Start button armed, and the Expert could pay for the same work twice — 336 drafts sorted, or a source distilled, a second time. In all four the latch is now per RUN rather than per mount: it is cleared the moment `run.running` goes false, so the next live run reopens in its turn, while the `open` guard still keeps the run already on screen from asking again. One parametrized test drives all four REAL dialogs through their own prop contracts over running → settled and closed → a second running run, and expects two `onOpenChange(true)` calls, plus a guard that a still-running run never asks twice: `__tests__/rejoin-latch-per-run.test.tsx`. Each of the four proven RED against its own pre-fix component (received `[true]`, expected `[true, true]`).

- `2026-09-13` — 🚨 **"Probed" and "opened" are both keyed to the Rulebook they were computed for (Bugbot HIGH).** The page calls the live-run probe as `rulebook?.id ?? null`, so its first effect ran against NO id — and a flag that only said "I have read storage" reported ready before the real Rulebook had ever been looked up. One render later the dialog mounted on the ingest surface anyway, watching (and able to rejoin) the wrong pointer: exactly the first-paint defect `probed` was added to prevent. The probe now stores the id it read WITH the answer and derives `probed = probedFor === rulebookId && rulebookId !== null`, so a null id is never probed and a change of id un-probes; the same rule applies to the latched session, which is stored as `{ rulebookId, lane }` and is ignored — dialog closed, `timeline_open` false — the moment the page is showing a different Rulebook. Tests in `durable-run/__tests__/live-ingest-lane.test.tsx`: mounting with a null id then handing over the real one stays un-ready and never mounts the dialog on `ingest` before landing on the live `timeline`; and switching from a Rulebook with a live ingest run to one with a live case re-probes and carries neither the lane nor the session across. Each half proven RED on its own.

- `2026-09-13` — 🚨 **Opening the ingest dialog resolves the lane from the LIVE pointers, at that instant (Bugbot HIGH).** The session latch was right; how it chose its lane was not. `setOpen(true)` stamped `lane ?? DEFAULT_INGEST_LANE` from the render closure, which fails three ways: on the first paint no effect has run, so the probe's `null` means "not asked yet" and was read as "nothing is running" — the dialog mounted on the ingest surface, rejoined whatever was on that pointer and latched `source` while a case was the live run; a case launched in another tab between two probe beats was invisible to that closure; and a plain `setOpen(true)` arriving after an explicit `openOn(lane)` restamped its own answer over the lane the person asked for. Now the open path is a functional update — an existing session is never overwritten, and otherwise `findLiveIngestLane` reads storage right then — and `useLiveIngestLane` reports `probed` so the page does not MOUNT the dialog until the probe has answered once (a mount watches the pointer its lane picks, so one tick early watches the wrong one). Five tests in `durable-run/__tests__/live-ingest-lane.test.tsx`: a live case is never mounted against the ingest surface at all, the newer of two in-flight runs wins, a `?ingest=timeline` deep link in the same tick as a rejoin survives, a pointer written since the last render is still found, and an explicitly opened lane is never restamped. Each half proven RED on its own against the previous resolver.

- `2026-09-13` — 🚨 **A dialog SESSION owns its lane from open to close (Bugbot, three findings, one class).** The ingest dialog mounts on ONE durable-run surface chosen by its lane, so the lane is the identity of what is on screen — and it was re-derived every render from three sources at once (explicit request, `?ingest=` param, the five-second live-run probe). Three defects, all the same shape. (1) HIGH — after a refresh rejoined a case distillation nothing named a lane, so the remount `key` tracked the probe; a beat after the run settled the probe dropped `timeline` and the still-open dialog remounted onto an empty source form, wiping the finished summary its owner was reading. (2) A requested lane was never cleared, so one click on "From a source" outranked the probe for the rest of the session and a case started in another tab was never rejoined. (3) `timeline_open` in the agent surface scope read the probe but left it out of the `useCallback` deps, so agents could be told the wrong thing. Now `useIngestDialogSession` (in `durable-run/liveIngestLane.ts`) resolves the lane ONCE at open time and latches it: `session` null means closed, the `key`, `initialLane`, `open` and `timelineOpen` all read the one latched value, closing clears it, and the probe feeds only the next open (while closed, so a run started before a refresh is still picked back up). `RulebookDetailPage` drops its `ingestOpen` boolean and its `requestedIngestLane` twin entirely. Tests in `durable-run/__tests__/live-ingest-lane.test.tsx`: a rejoined timeline dialog stays mounted with its summary after the pointer settles; closing clears the latch so "From a source" opens ingest and a later live case in another tab is rejoined; `timeline_open` follows the latch, not the probe; plus a source-level guard that there is no second source of truth for the lane. The two behavioural ones proven RED against the pre-latch shape.

- `2026-09-13` — **An ingest-dialog session dies with its Rulebook, it does not merely hide (Bugbot, round 11).** `useIngestDialogSession` filtered the latched session by Rulebook id but never cleared it, so leaving an open dialog for another Rulebook and coming back matched the id again and remounted a fresh empty dialog on its own. The session is now dropped during render the instant the id no longer matches. Test: `durable-run/__tests__/live-ingest-lane.test.tsx` "does not reopen a dialog left open on a Rulebook the person came back to", proven RED against the pre-fix hook.
- `2026-09-13` — 🚨 **ONE decision-rule renderer, ONE decision vocabulary (merge reconciliation).** Two implementations of "render a decision rule" were built in parallel on 2026-09-12 and met in the merge of `main` into this branch: `PolicyRuleShape` with `POLICY_ACTION_KINDS` / `POLICY_LEVELS`, and `RuleDecision` / `RuleDecisionBadge` with `RULE_ACTION_KINDS` / `RULE_POLICY_LEVELS` / `ruleActionKind` / `rulePolicyLevel`. Kept: `RuleDecision` + `RuleDecisionBadge` and the `RULE_*` vocabulary, because those names were already wired across the rule row, the review wizard and the agents' Rulebook document, and their vocabularies are parsed out of the server's own `distill.py` by `__tests__/policy-rule-surface.test.tsx`. DELETED: `components/detail/PolicyRuleShape.tsx`, `POLICY_ACTION_KINDS`, `POLICY_LEVELS`, `PolicyActionKind`, `PolicyLevel` — every consumer (`RuleFields`, `ImproveRuleDialog`, `agent-context/ruleImprove.ts`, `agent-context/ruleDraftInput.ts`) now reads the one vocabulary, and the picker's plain-English help lives beside its labels as `RULE_ACTION_KIND_HINTS` (same keys, never a second list of moves). KEPT from this branch: the ONE rule-form field set (`RuleFieldValues` / `RULE_FIELD_KEYS` / `RULE_FIELD_ELEMENT_IDS` / `ruleFieldValues` / `mergeRuleFieldValues` / `ruleFieldForElementId`), now typed on `RuleActionKind` / `RulePolicyLevel`, plus the triage door, the live-lane probe and `useRunOutcome`. The evidence standing (`isEvidenceRule` / `promoteEvidenceRule` / `standing: "evidence"`) stays DELETED — `main` removed it deliberately ("frequency is not existence") and guards it in `__tests__/bulk-approve-cannot-lie.test.tsx`, which is also why "Approve all" did not come back beside "Sort the drafts".

- `2026-09-13` — 🚨 **The live-lane probe is a LIVE fact, and every explicit door names its lane (Bugbot, second follow-up).** `useLiveIngestLane` read the pointers once at mount, so a lane that was in flight then stayed selected for the life of the page: after a refresh that rejoined a case distillation, "From a source" and the assist `open: "ingest"` chip opened the TIMELINE dialog long after that run had settled, and could launch the wrong pipeline. Two halves. (1) The probe re-reads on a five-second beat while the tab is visible, and on `storage` / `focus` (another tab's launch or finish), so its answer clears within a beat of `useDurableRun` marking the pointer settled. (2) `RulebookDetailPage` routes every explicit door — the "From a source" menu item, the assist chip, the Approach picker — through one `openIngestLane(lane)` that sets `requestedIngestLane`, which outranks the probe; the probe now only ever answers "nobody asked, and something is still running". `DEFAULT_INGEST_LANE` is the named lane those doors open. Tests in `durable-run/__tests__/live-ingest-lane.test.tsx`: the probe drops its answer on a frozen clock once the run settles; "From a source" opens ingest with a live and with a stale timeline pointer; and a source-level guard fails on any door that opens the dialog with a bare `setIngestOpen(true)`. All three proven RED against the pre-fix code.

- `2026-09-13` — 🚨 **A refresh rejoins the lane that is RUNNING, not the lane state names (Bugbot HIGH, follow-up).** Splitting the timeline pointer off the ingest one was only half the fix: the Rulebook page mounts ONE `IngestSourceDialog`, on the surface its current lane picks, so a reload that named no lane mounted on `ingest`, watched the ingest pointer, found nothing, and left a live case distillation invisible with Start armed — the Expert could pay for the same run twice. New `durable-run/liveIngestLane.ts` (`findLiveIngestLane` / `useLiveIngestLane` / `surfaceForIngestLane`) reads BOTH of this Rulebook's pointers through the new `peekDurableRun` in `lib/durable-run/useDurableRun.ts` — the hook's own reader, never a second pointer format — and reports whichever still has a run in flight (most recently started wins; a settled or hour-old pointer is not live). `RulebookDetailPage` resolves the lane as `requestedIngestLane ?? ingestLane ?? liveIngestLane` for the dialog's `initialLane`, its remount `key`, and `workspace_state.timeline_open`, so an explicit deep link or picker choice still outranks the probe. Tests: `durable-run/__tests__/live-ingest-lane.test.tsx` — the probe's seven cases, plus the page's wiring driving the real dialog (a live timeline run mounts the timeline surface and reopens the dialog on it, proven RED against the pre-fix resolution).

- `2026-09-13` — 🚨 **A timeline distillation writes the TIMELINE pointer again (Bugbot HIGH).** When the timeline lane was folded into `IngestSourceDialog` it kept its endpoint and its copy but lost its durable-run SURFACE: every lane launched as `surface: "ingest"`, and the pointer key is `${surface}:${rulebookId}`, so one Rulebook's case distillation and its pasted-chapter distillation shared one browser receipt — a reload could reopen the wrong lane, and a later ingest could rejoin a timeline run and report its answer as its own (it also took the ingest lane's 160s expectation instead of the measured 90s). The dialog now picks `timeline` from the same flag that picks the endpoint; `timeline_open` in `workspace_state` and `browse/approachLane.ts` already keyed off `initialLane === "timeline"` and are unchanged. Tests: `components/detail/__tests__/ingest-source-surface.test.tsx` (each lane's surface + pointer, proven RED against the old line) and the class guard `durable-run/__tests__/surface-census.test.ts` — a surface declared in `MasterworkRunSurface` that no call site launches with means some lane is writing another lane's pointer, which is exactly how this one hid.

- `2026-09-12` — **The surface never hides a live mutation, and a summary never claims a check it did not run (Bugbot, round 7).** `workspace_state` now carries `timeline_open` and `triage_open` beside `ingest_open` and `review_wizard_open`, so an agent reading the Rulebook surface sees a case being distilled by step or drafts being retired and rewritten instead of a quiet page. `parseIngestSummary` keeps `quotesUnverified` as `null` when the lane did not report the word-for-word check (absent is not zero), and `describeIngest` then says nothing about quotes instead of "every quote verified".
- `2026-09-12` — **Improve keeps the judgment (Bugbot on W58, round 5).** The Improve verb sent a decision rule's stored shape to the Mandate but `RuleImproveResult` / `coerceRuleImproveResult` / `applyRuleImprove` accepted prose only, so a rewrite landed a new statement over the OLD precondition / next action / cost / risk and the review diff never showed them — an Expert could approve a decision rule whose judgment no longer matched its text. Now `coerceRuleImproveResult` reads an optional decision shape (`kind: "policy"` or any of the five keys means all five must be present and inside the closed sets, refused by name otherwise); `applyRuleImprove` lands the returned shape, and when the reply carries none it keeps a decision rule's stored judgment exactly (a prose-only rewrite never demotes a decision rule); `applyRuleTidy` polishes precondition and next action but freezes kind, cost and risk like severity and section; the Improve review diff shows "When you know", "Do next" and "Kind of move · cost · risk". The Holder half — the `masterwork.rule_improver` agent's output schema, which today refuses the six keys (`additionalProperties: false`) — is a shared production agent and is listed as a guided step in the trial register (the exact schema and prompt addition are written). Tests: `agent-context/ruleImprove.test.ts` (the decision-shape describe block).
- `2026-09-12` — 🚨 **The rule form has ONE state, and a finished run is handed back ONCE (Bugbot on W58 + W59).** Five defects, two classes. (1) The W58 decision fields were a SECOND set of state beside the prose: missing from the draft snapshot, the draft restore, the open/reset effect and the context menu's hand-written list of replaceable field ids — so Cancel-then-reopen kept a cancelled toggle, a later Save silently converted or stripped a policy rule, and a replacement inside precondition/next action threw. Every field the form owns now rides ONE enumeration in `types.ts` (`RuleFieldValues` / `RULE_FIELD_KEYS` / `ruleFieldValues` / `mergeRuleFieldValues` / `ruleFieldForElementId`), the editor holds ONE values object, and a draft written before a field existed falls back to the saved rule instead of blanking it. The review wizard renders the rule row's `PolicyRuleShape` (extracted to its own file — ONE renderer), so nobody approves a decision rule without seeing its precondition, action, cost and risk. (2) The triage dialog handed its result back from an effect keyed on the callback's identity; the page passes a fresh arrow every render and the refresh re-renders the page, so a successful sort refreshed forever and Close did not stop it. New shared `durable-run/useRunOutcome` fires once per run id with the callback behind a ref, adopted by the triage and both ingest dialogs; triage also resets on close and reopens onto a run rejoined after a refresh, like its siblings. Tests: `__tests__/rule-editor-policy-fields.test.ts`, `__tests__/run-outcome-once.test.tsx`.

- `2026-09-12` — 🚨 **The third door on a pile of drafts: sort them by what the Rulebook is FOR (W59 + W61).** A chunk distiller reads the page in front of it and never the Rulebook's purpose, so an 18,000-word clinical training workbook landed **336** drafts about PPE, hand hygiene, CPR technique and snakebite on a Rulebook whose intake says "given the first facts of an acutely ill person, decide the next question or test", and a back-pain guideline landed **83** about disclaimers and GRADE wording. The Expert's own next move — asking the Scout to "retire, as classes, every draft that is …" — died TWICE at the model's 16,000-token output ceiling with **zero tool calls** (~$0.53 each, nothing saved), because `retire_rule` took one id per call and the agent tried to plan ~250 retirements in prose. The product's only other doors were Approve-all and 336 clicks, and the Expert pressed Approve-all. New `triage/` surface: her two sentences ("Keep rules about…", prefilled from her intake answer; "Set aside rules about…") posted to the new durable lane `POST /masterworks/triage` on its own run surface, streaming per-batch progress so the pile is visibly shrinking. Three verdicts, not two — keep, set aside, and **rewrite** (a rule that is right but written about one case comes back generalised as a NEW draft, its ancestor retired in the same save). "Show me the plan first" is ON by default and writes nothing. The result line never hides the two dishonest cases: drafts the run could not sort, and rules it refused to touch because she had approved them. Server half + the bulk `retire_rules` tool action: `aidream/services/distillation/triage.py` and its FEATURE.md.


- `2026-09-12` — 🚨 **A rule can now BE a decision, and the Expert can edit it as one (W58, part 2).** The `timeline` lane distils judgment under uncertainty, but the only rule shape the UI knew was a static statement — so a policy rule reached the Expert as prose she could not correct field by field, and any manual edit of one silently dropped its shape. `RulebookRule` gains the optional `kind: "policy"` + `precondition` / `next_action` / `action_kind` / `cost` / `risk` (vocabularies exported once as `POLICY_ACTION_KINDS` / `POLICY_LEVELS`; the server refuses anything outside them by name), and they are in `RULE_CONTENT_FIELDS` because changing the next action IS changing the rule. THE ONE rule form (`RuleFields`) gained a "This is a decision rule" switch revealing five plain-English controls ("What do you know at this point?" / "What do you do next?" / what kind of move / cost / risk) and ONE mapping to the stored fields (`policyRulePatch`), consumed by both the editor dialog and the Add-rule window; the Final Checkup omits the block through the existing `omitFields` contract rather than showing controls whose values it would drop. The existing rule row — never a second renderer — shows a policy rule as "When you know … → do …" with move/cost/risk chips and a "Decision rule" badge. `ruleSave.ts` needed no change (it merges through `applyManualRuleEdit`), which the new content-field list is what keeps true.

- `2026-09-12` — 🚨 **A case that unfolds in time is no longer one chunk (W58).** A real clinical case report (three emergency visits, then an admission) pasted into "Add rules from a source" became ONE size-based chunk and came back as 11 static rules all citing `chunk: 1` — the entire skill (what was known at each step, what was still unknown when each choice was made, and what each choice cost and risked) was gone. New lane: the `timeline` Approach, `IngestTimelineDialog` on `?ingest=timeline` and through the Approach picker (`intake_query {"ingest":"timeline"}`), posting `/masterworks/ingest-timeline` on its OWN durable-run surface (`timeline`) so a case never rejoins the single-source dialog. The dialog carries one switch — "Hide the ending while the rules are written", default ON — because a distiller that can see how the case turned out writes hindsight, not judgment; the ending is still saved with the case for the Audition. Server half (segment → chunk BY STEP → distil each step with the future withheld → policy-shaped rules anchored by `source_ref.step`): `aidream/services/distillation/timeline_ingest.py` + its FEATURE.md rule 21.
- `2026-09-12` — **A thin chapter of a source is visible, and repairable, on the Sources panel.**
  A 31,311-word book read into a Rulebook as six equal chunks gave 116 rules — flat, whatever the
  chunk held — and its most prescriptive chapter contributed 3; pasted alone that chapter gave 89.
  aidream now chunks a source by its own chapters and stamps every rule with the part it came
  from, so the panel shows one row per part (words, rules, a "thin" mark) under each source, read
  from the live rules rather than from the run that happened to be watched. "Read again" on a thin
  part re-distils THAT part at half the width and replaces only its own unapproved drafts —
  an expensive click, so it names what it spends and what it replaces first. New:
  `sourceSections.ts`, `SectionYields` in `components/detail/RulebookSourcesPanel.tsx`, the section
  fields on `RuleSourceRef`. Guard: `__tests__/source-section-yields.test.ts`.
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

- `2026-09-15` — 🚨 **The Reject dialog refused the Expert's reason, and nobody else had touched the Rulebook.** Trial `teach-recent-interview`, first scored run: reviewing 34 drafts, she could reject some rules and not others — six refused 6–8 times each with "This Rulebook changed while you were editing (someone else saved a newer version)". The other writer was us. Every rules save fires `pokeUnderstudy`, whose server hook (`rulebook_writes._poke_understudy` → `_poke_coherence`) wakes the Coherence Partner; its batch scan writes `metadata.coherence` back onto the SAME `platform.rulebook` row up to a minute later, and `platform._touch_row` bumps `version` on that write like it does on every UPDATE. The version her own save had just returned was therefore stale by the time she finished reading the next rule and typing a reason — so whether the next decision landed was pure timing, which is exactly the some-yes-some-no signature. Evidence: `metadata.coherence.last_scan.at = 2026-09-15T12:50:02Z`, `lane: batch`, `rules_read: 57`, landing mid-review. `saveRules` now takes `base: Rulebook` (the row the edit was made against) and hands `guardedUpdate` the platform's own `rebase.isPhantom` — if `rules` as the server holds them still equal that base, the write is retried once against the live version instead of refused. A real edit to the rules, and a whole-`metadata` write (the Final Checkup) when metadata moved, are still refused exactly as before, so a rebase can never overwrite someone's work. Every review surface inherits it through the one funnel: Reject, Request changes, Improve, Edit, Approve, Approve-all, the review wizard, the Final Checkup apply/undo, the Oracle tap, the Add-rule window. The dialog also stopped relabelling itself "Request changes" on its way out after a successful Reject. Guard: `__tests__/reject-survives-the-coherence-bump.test.ts` (3 cases, proven failing then passing). Verified live on the preview as the Expert, before/after: `../../../common-docs/projects/teach-recent-interview/fix-evidence/w12-before-reject-2.png` vs `w12-after-reject-2.png`.

- `2026-09-13` — 🚨 **The stand-in's banner stopped lying after a rebuild that worked, and overlapping rebuilds stopped clobbering each other.** Two defects in the staleness ledger shipped the day before: a successful `pokeUnderstudy` never reloaded the workflow row, so `behind` kept comparing the CACHED `rulebook_version` with the bumped Rulebook version and the amber "this stand-in is behind your rules" banner stayed up after a rebuild that actually landed (only the manual retry cleared it, because that path calls `onCreated`); and the ledger wrote pending/success/failure with no generation token, so two in-flight pokes — the normal case, the review wizard saves once per rule — could settle out of order and let an older failure bury a newer success, or an older success hide a newer failure. Now `readUnderstudyStandIn` derives the version, counts and rebuild time from whichever account is newer (the row, or the last successful refresh payload — which already returns `rulebook_version`, `approved_rules` and `unconfirmed_rules`, so no round trip is needed), and every ledger write is gated on a per-Rulebook generation token. Guard: `__tests__/understudy-refresh.test.ts` (4 cases, proven failing then passing). Found by Cursor Bugbot on PR #222.

- `2026-09-12` — 🚨 **The Understudy could not be rebuilt, and the UI said nothing** (trial 12). Every `POST /masterworks/understudy/refresh` returned HTTP 500: the server's write to `workflow.definition` declared actor tier `code` and named no actor system, which Postgres refuses. So an existing Understudy never rebuilt and a brand-new Rulebook got none at all — "the system that runs from minute one" ran for nobody — while `pokeUnderstudy` caught the 500 into a `console.error`. The server half is fixed in aidream (`masterworks/understudy.py`, `build.py` now declare `masterwork_understudy` / `masterwork_build`). Here: the refresh outcome is recorded in a subscribable staleness ledger, `UnderstudyCard` shows a plain-English warning naming the version the stand-in performs from versus the Rulebook's current version plus a "Bring it up to date" retry, and the card now always shows that version, the baked approved/in-review counts and the last rebuild time (`understudy_refreshed_at` / `understudy_rules`, projected through `parseMasterworkRow`).

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

- 2026-09-17 — Cold walk 7's fix round, four Masterwork halves, each closed at the layer that
  owns it. **The Approach card**: `inert` meant "cannot be the lane Start begins with" and was
  read as "has nowhere to go", so the Vision Interview and the Oracle tap — built lanes whose
  door is their own `launch_href` page — rendered as `aria-disabled` divs among twenty-one
  clickable cards, with the only live target a small inline link. Inert + a door of its own is
  now a whole-card `<Link>`. **The reopen latch**: every durable-run dialog asks
  `run.surfacing`, never `run.running` — the dismissal lives on the run's RECEIPT
  (`DurableRunHandle.dismiss`), not in a per-mount ref, so a completed sitting no longer reopens
  itself over later, unrelated visits; `shouldReopenForRun` is retired and
  `TriageDraftsDialog`'s dead `if (run.running) return;` close went with it. **The Build**:
  `getBuildInFlight` reads `platform.masterwork_run` so a live build is visible on mount in any
  browser, with no receipt — "0 Built" over a running build is not a count — and a run whose
  heartbeat has gone quiet is reported as stalled, never as progress. **Red-Pen**: a selection
  boundary is MEASURED with a Range and the selection is clamped to the work, because a
  triple-click ends outside it; it used to record a correction against the wrong passage, or
  drop the gesture in silence.
