# FEATURE — Decision review (client)

Review queue and calibration view for decision agents. Server half, the store and the capture:
aidream `aidream/services/decision_review/FEATURE.md` (one `platform.judge_verdict` row per
answered question, `subject_kind = 'decision_answer'`, captured by a chat.message trigger).

| Route | Component |
|---|---|
| `/agents/<id>/answers` | `components/ReviewQueue.tsx` — lowest confidence first; filters status/question/method/model/version; `j`/`k` move, `s` skip, `1–9` pick an option, `y`/`n` on yes-or-no |
| `/agents/<id>/answers/calibration` | `components/CalibrationView.tsx` — table per version × question (right, stated, Brier, calibration error, kappa or "N of <knob> labels", threshold for the target precision), then the selected row's `ReliabilityCurve` + bins |

- Reads: straight from `platform.judge_verdict` (RLS) and the judged user turn from `chat.message`
  (`service.ts`). The verbalized route's translator block is left out of the state.
- Writes: `POST /decision-review/items/{id}/label` (scoped to the item's own organization) and, from
  the battle verdict column, `POST /decision-review/conversations/label`. Both land through the Judge
  ledger's one agreement writer; the battle keeps its set-level `decision_verdicts` too.
- Entry points: `ReviewAnswersLink` in `AgentHeader` / `AgentRunHeader` (only when the agent's
  messages carry a `decision_questions` part) and on the battle Decisions panel.
- The answer card is the shared `features/agents/decision-answers/DecisionAnswers` primitive.
- Tests: `__tests__/queue.test.ts` (row reading, queue order, keyboard map).

## Change Log
- 2026-09-26 — built (Claude Opus 5.5, standard lane).
