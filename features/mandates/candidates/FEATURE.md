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
`../common-docs/systems/intelligence/mandates/projects/mandate-candidates/REGISTER.md` §2.6 (+ A2, A3).

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
- `useTranscriptUnit({ requestId, conversationId })` (`transcripts.ts`) — the walkable unit for one side's run: the newest `chat.request` of the pair's own `chat.user_request` id; only when that id names no request (older pairs), the conversation's newest, with `runsInChat` set when the chat holds more than one run.

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
- **The heartbeat (`live.ts`, V1 D3).** Realtime drops rows while the socket says connected, so
  every screen showing a collecting candidate re-reads on knob `mandates.candidate_poll_seconds`
  (seeded 10 s by `migrations/mnd_candidate_live_reads_2026_09_30.sql`) and stops when nothing
  collects: the tab badge (`record-next/useCandidateCount`), the Candidates tab, an open pair or
  summary window (`CandidateRecordBody`), and every list cell (`components/CandidateListCell`,
  one batched `public.mnd_candidate_cells` read for all cells on screen). Paused while the page is
  hidden, and reads at once when the page is seen again (V2 N1); a beat never stacks on a read in
  flight. The knob is read only when something collects. **Stop signal = the candidate is
  terminal-for-now** (ready / promoted / discarded / cancelled — `candidateStillMoving`), never
  "all pairs in": the judge verdict and the server's status/recommendation land after the last
  pair, so a pair window keeps reading while its candidate still collects (V2 N1).
- **Every decision asks first (V2 N3).** Promote, Put back and Discard confirm on the Candidates
  tab and the summary record in ONE set of words (`words.promoteConfirmation` /
  `putBackConfirmation` / `discardConfirmation`): what goes live in place of what; a Reject or
  Hold recommendation is said plainly ("The review said reject.") with "Promote anyway".
- **"What the … saw" is never dead (V2 N4).** A click before the transcript lookup answers
  resolves THIS pair's conversation on the spot (`transcripts.findTranscriptUnit`) and opens or
  focuses its walk; the button carries `data-conversation-id` and `data-request-id`.
- **"What the … saw" opens THIS pair's run, not the chat's newest.** Two runs can share a chat; the
  lookup keys on the pair's request id. The conversation fallback says "Newest of N runs in this
  chat" rather than silently picking one (`__tests__/saw-opens-this-pairs-own-request.test.tsx`,
  `__tests__/saw-says-when-the-chat-holds-several-runs.test.tsx`).
- **The set dialog's "Applies to" (V2 D18, FX-D1)** shows no rung (and Start waits) until the live
  holder's rung is read, and lists each rung once (`rungChoicesOf`). When the read cannot answer
  (no organization selected, read failed, a verdict naming no rung) it stays EMPTY and Start is
  unavailable until the person picks a level — never the seat's rung as a guess
  (`appliesToDefault`; guard `__tests__/fx-d1-applies-to-never-guesses-the-level.test.tsx`).
- **Walk windows from a pair are titled `<role> · Pair N · HH:MM · <agent>`** (FX-D2, `words.pairWalkLabel`) so two Live walks
  from different pairs differ; the labels ride the `?panels=` token so a reload keeps them
  (`features/review-walk/FEATURE.md` § Address).
- **The list cell compares the list's answer by VALUE** — hosts hand a fresh row object every
  render, and an identity check reset the cell to the stale list answer (seen on the clone).
- **One cell, every list (V1 D4):** admin list, org/person member list and `/mandates` browse all
  render `CandidateListCell`; the member and browse services add `candidate` from
  `mnd_candidate_cells` (the admin list's own helper `mandate._admin_list_candidate`).
- **Pair reading order (A4 P10):** the input section LEADS with one line — "Shared inputs
  identical" or "Shared inputs differed: …" (`words.sharedInputsLine`); the candidate's own parts
  and its tool offer (`input_differences.tools.added/removed`, FX-S) follow as chips. Live call
  arguments recorded as canonical JSON text render as the structure (`structuredArgs`, D15). A
  retried pair says "Attempt n" (D19). Holders name their pinned version "· vN"
  (`CandidateHolderName`, D17).
- Guards: `__tests__/the-candidate-screens-say-what-they-mean.test.tsx` (D3 badge, D15, D16, D18,
  D19 — 6/6 red against the pre-fix files) and `__tests__/list-cell-heartbeat.test.tsx` (red on
  the identity compare, green on the value compare); FX2-F: `__tests__/fx2-n1-…`, `fx2-n3-d18-…`,
  `fx2-n4-…` (7/8 red against the pre-fix files; the 8th is the pure words case).

---

## Related features

- Depends on: `lib/detail` (`@ai-matrx/detail`), `features/item-presentation`, `features/review-walk`
  (F2), `features/overlays/openers/diffViewerWindow`, `features/notifications` (F1).
- Depended on by: F4 (mandate list column, record tab, impact rows).

---

## Change log

- `2026-09-30` — Created (Mandate Candidates F3): pair + summary Detail records, openers, guard.
- `2026-09-30` — FX-F: heartbeat, one list cell on every list, shared-inputs lead line, structured
  live args, attempt marker, version names, dialog follows the live rung.
- `2026-10-01` — FX2-F (V2 N1, N3, N4, D18): refresh until terminal-for-now + catch-up on
  visible, confirm every decision with shared words, never-dead transcript buttons, dialog rung
  right from the first frame.
- `2026-10-07` — FX-D1/D2: Applies-to never guesses a level; pair walk titles name the pair and
  survive a reload.
