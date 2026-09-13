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

- `sourceSections.ts` — WHAT EACH PART OF A SOURCE PRODUCED, read off the live rules
  (`source_ref.section_index` / `section_label` / `section_words`, stamped by aidream's
  `services/distillation/source_structure.py`). Mirrors the server's source identities
  (`urlSourceKey` / `entitySourceKey`) and its thin verdict — a part far below the SOURCE'S OWN
  median, never below a number somebody picked. `RulebookSourcesPanel` renders the rows and the
  per-part "Read again", which posts `only_section` + `redistill: "replace"` to the dump lane so
  only that part's drafts are replaced. Guard: `__tests__/source-section-yields.test.ts`.
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

## Change Log

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
  into a per-case table plus the desk-beats-vanilla headline. Guards: `TryMasterworkBox.test.tsx`
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
