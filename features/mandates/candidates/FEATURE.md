# FEATURE.md — `mandates/candidates` (Mandate Candidates: the pair and summary records)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-30`

---

## Purpose

A mandate's candidate runs beside the live holder on the next N real runs; this module is where a
person reads the results: ONE pair (live vs candidate on one real run) and the candidate's N-pair
summary with Promote / Put back / Discard. Both are Detail records, so a notification opens them as
a window in place, a docked panel, or a page in a new tab. Plan and frozen contract:
`../common-docs/projects/mandate-candidates/PLAN.md` §2.6 (+ A2, A3).

---

## Entry points

**Routes** (the Detail primitive's page route — no route of its own)
- `/detail/mandate_candidate_run/<run_id>` — one pair.
- `/detail/mandate_candidate/<candidate_id>` — the summary.
- Window token: `?panels=detail:mandate_candidate_run.<id>:as-window` /
  `?panels=detail:mandate_candidate.<id>:as-window` — exactly what the notification events
  `mandates.candidate_run_judged` / `mandates.candidate_ready` link to.

**Hooks** (`openers.ts` — F4 and every other surface imports exactly these)
- `useOpenCandidateRun(runId?)` → `(id?, seed?) => void` — opens a pair through `useOpenDetail`
  (window by default; the person's presentation setting decides). `seed.siblings` = the ordered
  run ids of the list it was opened from, so `[` / `]` step through the runs.
- `useOpenCandidateSummary(candidateId?)` → `(id?, seed?) => void` — opens the summary.
- `useTranscriptUnit(conversationId)` (`transcripts.ts`) — the walkable unit for one side's chat.

**Services** — `api.ts`: the aidream live-candidate doors through the contract-bound typed client
(`GET /mandate-candidate-runs/{id}`, `GET /mandate-candidates/{id}`, `POST …/agreement`,
`…/promote`, `…/put-back`, `…/discard`). Types are the generated `LiveCandidate*` schemas.

**Registration** — `itemTypes.ts` → `features/item-presentation/registry.tsx` (THE one type map)
via `refineDetail` (`detail.tsx`). Bodies: `components/CandidateRunBody.tsx`,
`components/CandidateSummaryBody.tsx`, behind ONE lazy edge `components/CandidateRecordBody.tsx`.

---

## Data model

- Rows come from the aidream doors, never from `mandate.candidate*` directly: the payload half
  (`mandate.candidate_run_payload`, A2) is read by the server under the viewer's identity; a viewer
  who can see the mandate but not the live conversation gets `payload: null` and the body shows the
  facts plus "The details belong to a conversation you can't open."
- Detail row shapes: `CandidateRunRow {run, candidate}` and `CandidateSummaryRow {candidate, runs}`.
- Chat doors read `chat.request` (newest) then `chat.message` (newest assistant) by conversation id
  under the viewer's RLS; the version line reads `agent|workflow.definition_version.version_number`.

---

## Key flows

1. Notice click → F1's in-place hydrator → `detail` hydrator → `openDetailSingleton` → the
   registration's `load` (pair door, then its candidate) → title + three facts + the body section.
2. Pair body order: review (verdict / "Stopped at step k: tool" / failure) + reasoning + Agree /
   Disagree (only when `can_decide`, P19) → input line (identical / differing parts, P10) → both
   answers side by side (JSON shown as data) with cost · duration · tokens and the resolved version
   (P13) → tool calls with disposition, the stopped call's arguments beside the live call → the two
   "What … saw" buttons open review-walk windows (P15).
3. Summary: recommendation + reason, runs in / wanted, runs list (row → pair window), skips by
   reason (P17), Promote (confirm; `needs_version` → pick the version, P13) / Discard / Put back
   (only while `put_back_until` is in the future), each only when `can_decide`.

---

## Invariants & gotchas

- **Request ids on a pair are not `chat.request` ids** (verified on the clone 2026-09-30) — the
  walk unit is found from the conversation, never from `live_request_id`.
- **A JSON answer renders as data (`JsonBlock`), not through the markdown pipeline**: an
  unregistered `__kind` became a warning card squeezed into the half-width column and hid the answer.
- `entityToken: null`, `associationTokens: null`, `history: false` — these are not association
  targets and a queue row's version history is not something a person reads.
- "Save input as test case" (P18) is NOT here: no aidream door saves an exemplar from a pair, and the
  only client path (`createMandateExemplar`) is admin-route-only and stamps the system organization.
- Guard: `__tests__/a-candidate-notice-opens-a-real-record.test.tsx` (registration seen red with the
  two registry rows removed: 3 failed → restored 8/8).

---

## Related features

- Depends on: `lib/detail` (`@ai-matrx/detail`), `features/item-presentation`, `features/review-walk`
  (F2), `features/overlays/openers/diffViewerWindow`, `features/notifications` (F1).
- Depended on by: F4 (mandate list column, record tab, impact rows).

---

## Change log

- `2026-09-30` — Created (Mandate Candidates F3): pair + summary Detail records, openers, guard.
