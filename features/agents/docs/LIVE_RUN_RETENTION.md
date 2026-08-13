# 🚨 LIVE RUN RETENTION — why streamed output must NEVER disappear, and the seams that guarantee it

**The bug this kills:** an agent run streams into a surface (chat, floating run window, keyword
Research tab, Deepen, crawler, podcast…), the user watches data arrive, and then it **vanishes
mid-run** — blank surface, no error. Switching away and back sometimes brings it back (rejoin /
saved artifact). This class has been fixed and re-broken repeatedly (2026-07-28 "results never
vanish", 2026-08-12 viewer retention). **If you change any file this doc names, re-run
`features/agents/redux/execution-system/active-requests/__tests__/request-viewer-retention.test.ts`
and re-read this doc.**

## The one mental model

Every canonical viewer renders from ONE place: `state.activeRequests.byRequestId[requestId]`.

- **Events on a missing row are silently dropped** (`appendChunk` etc. begin with
  `if (!request) return`). Kill the row mid-stream and the surface is blank **permanently** —
  nothing recovers it until a full remount + rejoin.
- **The server's rejoin replays stage events but NEVER AI chunks.** Once live content is lost
  client-side, the only recovery is the durable saved artifact.

So the entire defense is: **the row must outlive every mounted viewer.**

## The three seams (all live, all guarded)

1. **Viewer retention** — every viewer of a `requestId` retains the row for its mount lifetime.
   - Hook: [`useRetainRequestForViewer`](../redux/execution-system/active-requests/useRetainRequestForViewer.ts).
   - Consumed by [`StreamAwareChatMarkdown`](../../../components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx)
     — the ONE component every `MarkdownStream` renders through — and by
     [`LiveRunDisplay`](../components/live-run/LiveRunDisplay.tsx). Ordinary surfaces get
     retention **for free** by rendering canonically.
   - Owner cleanup (`removeRequest`, conversation cleanup) **defers** while viewers exist
     (`pendingRemovalByRequestId`); the last release completes the delete.
2. **Non-destructive `createRequest`** — creating a request under an **existing** id keeps the
   row (and cancels any deferred removal); it never resets streamed state. A rejoin or a second
   surface adopting the same server-side pipeline run (same `X-Request-ID`) continues into the
   row. Fresh logical runs always mint fresh client ids.
3. **Owner hooks abort before they reap** — a launcher hook (`useKeywordResearch` is the
   exemplar) aborts its in-flight fetch on unmount/new-run **before** dispatching
   `removeRequest`, so an orphaned stream never drains into a dead row.

## Banned moves — each one re-creates the bug

- **Dispatching `removeRequest` / conversation cleanup from render-adjacent code** (an effect
  that runs on query/prop churn). Reaps belong ONLY in unmount cleanup and pre-next-run.
- **Resetting or re-creating a request row that exists.** `createRequest` guards this; do not
  "fix" the guard away, and do not add a parallel `resetRequest` for a live run.
- **Rendering a live run from component-local buffers** instead of the row (the July-2026
  regression vector). Local state dies on any remount; the row + retention does not.
- **Removing a `useRetainRequestForViewer` call because "nothing seems to break".** The
  breakage is a mid-run blank on whichever surface reaps last — you will not see it in a quick
  check.
- **Relying on rejoin to restore live output.** It cannot (no chunk replay). Surfaces MUST keep
  the saved-artifact fallback for the post-remount case (`useSavedKeywordResearch` pattern).

## When output is present in Redux but still not rendered

That is the OTHER family — kind-routing, not retention: the row holds blocks but the `__kind`
route/projection drops them. Start at [`features/content-ir/FEATURE.md`](../../content-ir/FEATURE.md)
and `features/content-ir/redux/progress-data-block.ts`; reproduce with the row inspected via
Redux devtools before touching retention seams.

## Change Log

- 2026-08-12 — Doc created. Retention moved to the `StreamAwareChatMarkdown` seam (covers every
  `MarkdownStream` viewer, not just `LiveRunDisplay`); `createRequest` made non-destructive;
  `useKeywordResearch` aborts before reaping. Tests: `request-viewer-retention.test.ts`.
