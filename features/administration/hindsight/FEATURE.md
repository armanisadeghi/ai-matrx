# FEATURE: Hindsight — continuous review + Replay (admin)

**Status:** Active · **Route:** `/administration/agents/hindsight` (Agents →
Health & Drift) · **Entry point:**
[`components/HindsightPage.tsx`](./components/HindsightPage.tsx)

Hindsight is how the platform reads its own history and improves itself. Enroll
an **agent, workflow, tool, or environment**; every N real runs a reviewer agent
reads the ACTUAL transcripts — never metrics alone — and proposes fixes across
four levers (instructions · resources · tool/interface · architecture). Replay
re-runs a real historical request under a candidate change and a judge reports
better / same / worse / regressed.

**This is the ONE home for that UI.** It was ported here from the aidream
dashboard on 2026-08-11 and that page + route + sidebar entry were deleted in the
same change. Hindsight watches every client (sandbox, matrx-local, the Chrome
extension) and its Layer 2 is a user-facing product feature, so it belongs in the
platform admin, not in a backend-repo dashboard. Do not re-create a second copy.

## Map

| Piece | Where |
|---|---|
| Page | `components/HindsightPage.tsx` — list + platform spend + detail pane |
| Detail | `components/EnrollmentDetailPanel.tsx` — subject, spend, cadence, findings, reviews |
| Enroll | `components/EnrollDialog.tsx` — all four kinds, real pickers |
| Finding | `components/FindingCard.tsx` — levers, confidence, replay verdicts, Apply / Reject / **Guide** |
| Discuss | `components/DiscussPanel.tsx` — the reviewer's thread + the reply box |
| Review | `components/ReviewRow.tsx` → `components/ReplaysTable.tsx` |
| Doors | `subject-doors.ts` |
| Types | `types.ts` — DERIVED from the OpenAPI contract |
| Client | `api.ts` — `lib/api/typed-client.ts` over aidream `/hindsight/*` |

Backend contract + earned traps: `aidream/aidream/services/hindsight/FEATURE.md`.
Wire shapes: `aidream/aidream/api/schemas/hindsight.py`. Work order:
`aidream/docs/handoffs/hindsight.md`.

## Doctrine

- **Types are derived, never hand-mirrored.** Every shape in `types.ts` aliases
  `components["schemas"][…]`. The aidream router used to return bare `dict`s;
  they were given real response models so this link exists. If a handler ever
  reverts to an untyped dict, the contract degrades to `unknown` and this file
  is where the damage lands — fix the backend, don't hand-write the type here.
- **Reuse, not re-implementation.** Data reads go DIRECT to Supabase
  (`@/utils/supabase/client`) for the agent / workflow / tool-name pickers;
  compute goes to aidream through the typed client. No bespoke `fetch`.
- **No dead ends.** Every record this surface names opens: the subject
  (agent → `/administration/agents/system-agents/agents/{id}`, tool →
  `/administration/agents/mcp-tools/{id}` resolved from the stored NAME,
  workflow → the workflow studio), every real run a review read, the reviewer's
  own transcript, and both conversations behind a replay. Reviewer evidence
  cites raw conversation UUIDs — those are linkified (`splitEvidenceIds`).
  `environment` subjects are deliberately doorless: an environment is a
  conversation SELECTOR, not a row, so its selector renders as chips and its
  transcripts are reached through the reviewed-runs list.

## Guide — the third path, and why it exists

Apply / Reject is not enough. Arman's case: the reviewer caught small problems on
the AI Model Config Sync agent and **missed the biggest point** — that we need
scrapable model-list URLs per provider, verified with our scraper, built into the
system prompt — and there was no way to tell it so.

`DiscussPanel` is that path. It renders the reviewer's own conversation and lets
the human reply with guidance; the reviewer answers and usually proposes NEW
findings. Two rules the UI must keep:

- **A reply CREATES findings, it does not edit the one in front of you.** Never
  frame it as editing. On resolve, refetch the whole enrollment — proven live:
  one reply took a review from 2 findings to 6 and deprioritized the original.
- **It takes about a minute** and `status: "failed"` is a normal outcome to
  render, not an exception. The typed message stays in the box on failure — a
  carefully written paragraph must never be lost to a transient error.

`available: false` from `/thread` is also normal (reviews from before threaded
reviews persisted only a cost spine); render the backend's `reason` sentence and
disable Send, never an empty void.

Message bodies render through the canonical markdown pipeline (`MarkdownStream`
in persisted mode — no `requestId`, not a stream). Never hand-render one.

**Known rough edge:** `discuss` returns the reviewer's STRUCTURED output in
`reply`, so it is usually a raw JSON object rather than prose. The findings are
the human-facing result, so the panel headlines those and collapses a
JSON-shaped reply behind a toggle. The clean fix is backend-side: return the
reviewer's sentence separately from its structured payload.

## The three things that are easy to get wrong

1. **Cost vocabulary is load-bearing — never blur it.**
   *Replay cost* is money Hindsight SPENT. *Original cost* is what the historical
   run cost: a BASELINE being beaten, not a charge, and never counted as spend.
   **A replay whose `status !== "completed"` must never render a dollar
   comparison** — it shows "did not run", "nothing spent — it never reached the
   model", and the reason. Rendering `$0.000` there reads as *free* instead of
   *never happened*, which is the exact confusion this port had to fix.
   Guarded by `replayRan` / `replaySpend` / `replayBaseline` in `types.ts`.

2. **"Review now" runs the whole reviewer inline — minutes, not seconds.**
   The POST blocks. A bare spinner reads as hung, so `ReviewProgress` shows
   elapsed time, how many transcripts are being read, and that leaving the page
   does not stop the run (the server finishes it either way).

3. **The enroll dialog must survive a stray click.** Radix dismisses on any
   pointer-down it judges "outside" — including the overlay strip when a tall
   form overflows a short viewport, and scrollbar drags. `onPointerDownOutside` /
   `onInteractOutside` are prevented, the body scrolls internally, and the
   actions stay pinned. It also **resets on every open**: the dialog is never
   unmounted, so without that reset the next open still holds the last subject
   with Enroll already enabled — one click from enrolling the wrong thing twice.

## Assist deep links

Hindsight assists point here, and the page honours them:
`?enrollment=<id>&finding=<id>` selects that enrollment;
`?enroll_tool=<name>` opens the enroll dialog pre-set to that tool. Written by
`aidream/services/hindsight/review.py` and `detector.py` — change both sides
together.

## Verified (2026-08-11, real clicks, real data)

All four kinds enrolled through this dialog against production; Apply took the
AI Model Config Sync agent to **v20**; Reject recorded a decision; a review run
from this page read 3 real Chrome-extension transcripts, cost $0.146, and
produced 2 findings; replay table renders the did-not-run case correctly; dark
mode checked. Guide proven end-to-end on the Chrome-extension environment
review: real guidance ("you missed that browser-tool failures are
indistinguishable") returned 4 new findings for $0.085 in ~2 minutes, the
findings list refreshed itself, and the original finding was deprioritized to
40% confidence.
