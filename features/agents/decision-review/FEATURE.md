# FEATURE — Decision review (client)

Review queue and calibration view for decision agents. Server half, the store and the capture:
aidream `aidream/services/decision_review/FEATURE.md` (one `platform.judge_verdict` row per
answered question, `subject_kind = 'decision_answer'`, inserted by one DB writer from chat, workflow
Decide steps (with `workflow_run_id` / `workflow_node_id` in metadata) and `/ai/decisions`).

| Route | Component |
|---|---|
| `/agents/<id>/answers` | `components/ReviewQueue.tsx` — lowest confidence first; filters status/question/method/model/version; `j`/`k` move, `s` skip, `1–9` pick an option, `y`/`n` on yes-or-no |
| `/decisions/review` | the same `ReviewQueue` with no agent — every decision item in the person's organizations (declared scope: their memberships, never RLS alone), a Source filter (Agent / Workflow / API model, `?source=` preselects), a source tag on each row; workflow items link to their run, agent items to that agent's queue, "Agent calibration" opens the selected agent's calibration |
| `/agents/<id>/answers/calibration` | `components/CalibrationView.tsx` — table per version × question (right, stated, Brier, calibration error, kappa or "N of <knob> labels", threshold for the target precision), then the selected row's `ReliabilityCurve` + bins |

- Reads: straight from `platform.judge_verdict` (RLS) and the judged user turn from `chat.message`
  (`service.ts`). The verbalized route's translator block is left out of the state.
- Writes: straight to the database as the person — `platform.label_decision_item(item, answer)` and,
  from the battle verdict column, `platform.label_decision_conversations(ids, question, answer)`
  (`service.ts`). Gated to members of the item's organization; the one vocabulary is
  `platform.normalize_decision_label`. The battle keeps its set-level `decision_verdicts` too.
- Server: only `GET /decision-review/agents/{id}/calibration` (real computation).
- Source of an item (`queue.ts` `decisionSource`): a `workflow_run_id` in the metadata or a
  `workflow_node:` key → workflow; a `model:` key (`/ai/decisions`) → API model; else agent.
- Entry points to `/decisions/review`: "All answers" on every agent queue, "Review answers" on the
  Decision playground (`?source=model`), and Workflow Studio's decision block (`?source=workflow`).
- The answers reader is `@ai-matrx/agents/presentation/decision-answers` (one reader for this app
  and Workflow Studio).
- Entry points: `ReviewAnswersLink` in `AgentHeader` / `AgentRunHeader` (only when the agent's
  messages carry a `decision_questions` part) and on the battle Decisions panel.
- The answer card is the shared `features/agents/decision-answers/DecisionAnswers` primitive.
- Tests: `__tests__/queue.test.ts` (row reading, queue order, keyboard map).

## Change Log
- 2026-09-26 — built (Claude Opus 5.5, standard lane).
- 2026-09-26 — labels moved off the Python server onto the gated RPCs (aidream migration 1195).
- 2026-09-26 — combined review queue `/decisions/review` (Claude Opus 5.5, standard lane).
