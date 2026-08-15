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
   - 🚨 **`MarkdownStream content={text}` retains NOTHING.** Only the `requestId=` form routes
     through `StreamAwareChatMarkdown`. A surface that reads the text itself
     (`selectAccumulatedText` / `selectLatestAccumulatedText`) and passes the string in is a
     direct row reader and owns its own retention, however canonical the component looks.
   - **Direct row readers call the hook themselves** — a surface rendering from
     `selectKindEnvelope`, `selectFirstExtractedObject`, `selectAccumulatedText`, or a
     `toolLifecycle`/timeline read is a viewer even though no `MarkdownStream` is involved.
     Viewers keyed by conversation rather than request use the sibling
     `useRetainLatestRequestForViewer(conversationId, label)`, which follows the conversation's
     newest request across re-runs. A long-lived `store.getState()` **poll** on a row is a viewer
     too: retain/release around it with the slice actions (exemplar: the shared `waitForExtraction`
     inside `run-headless-agent-json.ts`, which retains for BOTH `runHeadlessAgentJson` and the
     adopted-run entry `adoptHeadlessAgentJson` — so every headless-JSON consumer, thunk-level or
     hook-level, is covered).
   - The shared headless-JSON seam `useHeadlessAgentJson` additionally retains for every consumer
     that reads its `activeRequestId` (flashcards, quiz generation, `useKindRequest`, content-plan
     setup) beyond the poll's own lifetime, the same way `StreamAwareChatMarkdown` covers every
     `MarkdownStream`.
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

## A DROPPED SOCKET IS NOT A FAILED RUN — reattach, never dead-end

Streams run `detach_on_disconnect=True`: killing the client connection detaches
DELIVERY, never the work. So a broken socket is a display problem with the same
shape as the retention bug above — the answer still exists, we just stopped
receiving it. **Never render a transport drop as a failure the user has to
reload out of.**

The client can tell the two apart structurally: a backend that blows up mid-run
emits a typed `error` EVENT and closes the body cleanly, so **anything thrown
out of the body reader is a transport loss**. `lib/api/stream-parser.ts` types it
as `StreamTransportError` (`code: "stream_transport_lost"`, `resumable`); read it
at any boundary with `isStreamTransportLost()` (it survives `callApi`'s
normalization via `ApiCallError.code`). Resumable means _ask the server_, never
_assume success_ — a run that genuinely died reports `failed` on reattach and the
honest record replaces the optimistic one.

Two reattach paths, both already built — never hand-roll a third:

- **Chat / execution-system runs** → `run-ai-stream.ts` classifies it
  `error_type: "transport_lost"` and dispatches `reconnectServerOperation`,
  exactly as it does for a heartbeat timeout.
- **Durable server-orchestrated runs** (`adoptForeignStream`) → the surface's own
  rejoin by durable run id (`POST /seo/collections/{run_id}/rejoin` and peers),
  driven by the ONE bounded loop
  [`createTransportLossReattacher`](../redux/execution-system/durable-runs/reattach-on-transport-loss.ts):
  pass its `onTransportLost` to `adoptForeignStream`, `cancel()` on unmount and
  on a new logical run. Exemplar: `useKeywordResearch`.

**Banned:** clearing the surface's stored durable run id on a transport loss.
That id is the only handle the reattach loop has; dropping it converts a
recoverable drop into the dead end this section exists to kill (D183).

## Multi-run surfaces — RunSetDisplay is the canonical home

A surface that fires MORE THAN ONE agent call (a pipeline per phase, a batch per node, a run
beside API results) must NOT hold its run identity in component state — that state dies on any
remount and the surface "forgets" runs that are still streaming (the "system gets confused when
the first call finishes" class). The canonical primitive:

- **Slice** `runSets` (`features/agents/redux/execution-system/run-sets/run-sets.slice.ts`):
  ordered entries per caller-chosen stable `setKey`; entries are runs (`requestId` + label) or
  non-stream data payloads (canonical block shape).
- **Thunks** (`run-sets.thunks.ts`) are the ONLY write path — `addRunToSet` also places a
  set-scoped retention hold so owner reaps defer while the set exists; `clearRunSet` /
  `removeRunSetEntry` release. Guard test: `run-sets/__tests__/run-sets.test.ts`.
- **Component** `RunSetDisplay` + `useRunSet`
  (`features/agents/components/live-run/RunSetDisplay.tsx`): maps entries to `LiveRunDisplay`
  per run and `MarkdownStream serverProcessedBlocks` per data payload. Renders null when empty;
  mount at the BOTTOM of a surface (FLOATING LAW: zero page shift).
- **Floating component** `RunSetWindowController` binds that same stable `setKey` into
  `LiveRunWindow`. It opens from set membership as well as local launch state, so a remounted
  host whose hook has reset to idle still re-shows every retained lane.
- Launcher hooks register runs from `adoptForeignStream`'s `onAdopted` and clear ONLY on a new
  logical session — never on unmount (surviving unmount is the point). Exemplar:
  `useKeywordResearch` (`runSetKey` option) + `KeywordResearchTab`.
- An adopted client reader with no durable server rejoin path stays alive across launcher
  unmount and keeps feeding the set-held Redux row. Cleanup may request owner removal (the
  set hold defers it) and must invalidate the local run epoch; explicit dismiss/reset or a new
  logical session aborts and clears. A server-owned run with a durable identifier should use
  scoped rejoin instead of relying on the detached reader.
- **Late-settling streams must not stomp state**: a hook that reuses one state object across
  sequential calls guards every write with a run EPOCH (see `useKeywordResearch`'s
  `runEpochRef`) so an older call resolving late no-ops instead of flipping the current run to
  done/error.

## When output is present in Redux but still not rendered

That is the OTHER family — kind-routing, not retention: the row holds blocks but the `__kind`
route/projection drops them. Start at [`features/content-ir/FEATURE.md`](../../content-ir/FEATURE.md)
and `features/content-ir/redux/progress-data-block.ts`; reproduce with the row inspected via
Redux devtools before touching retention seams.

## Change Log

- 2026-08-15 — Content-plan's generate, deepen/bulk-deepen, three Setup passes, and per-node
  brief writers moved onto stable lane-scoped run sets. `RunSetWindowController` makes the
  floating window reopen from retained set state after a host remount; detached adopted readers
  keep streaming into held rows, and epoch guards cover every late local-state/ref completion.
- 2026-08-14 — Retention moved INTO the canonical headless-JSON primitive: the shared
  `waitForExtraction` in `run-headless-agent-json.ts` now retains/releases around its poll, and
  the new `adoptHeadlessAgentJson` entry (already-executed runs, e.g. shortcut-trigger +
  attached-resources launches) inherits it. `useImageStudio`'s hand-retained local poll (the
  former exemplar) was deleted in the same change — it now adopts the primitive.
- 2026-08-14 — Swept every surface that renders a live run WITHOUT the canonical viewers and
  gave each one retention: the shared `useHeadlessAgentJson` seam (covers flashcards create,
  quiz generation, `useKindRequest`, content-plan setup AI), `AgentGenerator`, both agent-app
  renderers (`useAgentApp`, `AgentAppPublicRendererImpl`, `AutoCreateAgentAppForm`), the AI code
  editors (`useSmartCodeEditor`, `useAICodeEditor`, both `ContextAwareCodeEditor*`,
  `useApplyAIPatchesToActiveTab`), both `useAiPostProcess` copies, `useMermaidAgentEdit`,
  `useToolComponentAgent`, `AgentToastOverlay`, `SystemPromptOptimizer`,
  `AgentExecutionTestModal`, and `useImageStudio`'s extraction poll. Added the conversation-keyed
  sibling `useRetainLatestRequestForViewer`. The `adoptForeignStream` marketing family was
  audited and is already covered by `LiveRunDisplay` / `RunSetDisplay` / `MarkdownStream
requestId=`.
- 2026-08-15 — A dropped socket now reattaches instead of dead-ending (D183 defect 2):
  `StreamTransportError` / `isStreamTransportLost` classify it, `run-ai-stream`
  reconnects on it like a heartbeat loss, and `createTransportLossReattacher`
  is the shared bounded rejoin loop for `adoptForeignStream` surfaces.
- 2026-08-13 — Multi-run surfaces get their canonical home: `runSets` slice + `RunSetDisplay`
  (+ set-scoped retention holds, run-epoch guard doctrine). First consumer: keyword research
  (`useKeywordResearch` `runSetKey`/`rejoinPhrase` options; phrase-scoped auto-rejoin).
- 2026-08-12 — Seam #3 swept across every `adoptForeignStream` consumer: reputation
  analysis, competitor autopsy, AI visibility (hook + public tool), setup passes,
  authority router, and both YouTube-analysis callers now store the stream's
  controller in a ref, abort on unmount and before every pre-run reap, and settle
  silently when the abort is their own.
- 2026-08-12 — Doc created. Retention moved to the `StreamAwareChatMarkdown` seam (covers every
  `MarkdownStream` viewer, not just `LiveRunDisplay`); `createRequest` made non-destructive;
  `useKeywordResearch` aborts before reaping. Tests: `request-viewer-retention.test.ts`.
