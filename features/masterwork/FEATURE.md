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
17. **`TryMasterworkBox` consumes the execution system's canonical `TERMINAL_RUN_EVENTS`** — never
    maintain a narrower local list (that is how a run that errored left it "Working…" forever).

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
- `durable-run/useMasterworkRun.ts` — the ONE way a dialog here runs something long. A face over
  `lib/durable-run/useDurableRun.ts` (shared with SEO): remembers the run id, rejoins on load,
  settles from server truth, keeps a finished answer across a refresh. Both ingest lanes share one
  run (one dialog, one answer, one pointer). Never fork it — add a `DurableRunWire` instead.
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
- `components/detail/ScoutInterviewPanel.tsx` — the Scout interview Approach (side sheet).
- `components/masterworks/MasterworksPage.tsx` — Masterworks list, run links into
  workflows.aimatrx.com, recent-run history, and the owner-only Audition + feedback doors.
- `components/masterworks/TryMasterworkBox.tsx` — "Try your Masterwork" in place: starts the run
  (adoptForeignStream + followWorkflowRunStream), narrates real node stages, renders the verdict
  through RichDocument. **A refresh rejoins the run** — the run id is kept per Masterwork in
  sessionStorage (`matrx.masterwork.run.<masterworkId>`), and on mount the run row decides:
  still going → `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed
  replays the node lifecycle so the stage list rebuilds), finished → the verdict shows directly.
  Its live-event choreography consumes the execution system's canonical `TERMINAL_RUN_EVENTS`
  set; it must never maintain a narrower local list that misses `run_errored` and waits for the
  row-poll recovery backstop.
- `components/masterworks/AuditionDialog.tsx` — "Compare to the original" (the Audition). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.
  Streams `POST /masterworks/audition`; verdict event `masterwork_audition_verdict`.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.

## Change Log

- 2026-08-25 — Separated Rulebook rules from built Masterworks on the detail page: each now has
  its own KPIs and actions, while the Masterworks summary stays out of the way for a new Rulebook.
- 2026-08-25 — Standardized Rulebook, Masterworks, Understudy, and Sources card padding, header
  rhythm, footer button height, and single-action alignment; rule groups now use a clear 24/8/4
  spacing hierarchy.
- 2026-08-25 — Reframed Quick build around explicit Masterwork language: a compact approved-rule
  summary, concise review-versus-create choices, an explicit Masterwork name, and no ambiguous
  "it" or recommendation paragraph in the setup.
