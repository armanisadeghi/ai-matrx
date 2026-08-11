---
status: active
updated: 2026-08-11
repos: [matrx-frontend, aidream]
---

# Live stream everywhere — no spinner while AI works, EVER

## Vision — Arman's words (2026-08-10)

> "Everything the client/server do is streaming… users will not use something
> that doesn't give them instant results in the UI… we have so many of these
> agent slots that are agents used within our system that they don't stream —
> and they should stream, they should parse the stream in real time, and it
> should display in real time… It could be into a popover, or whatever field
> it's gonna go in. But it cannot just be a spinning icon. You cannot have a
> spinning icon while AI works in the background, ever. All across the entire
> code base."

Standing sibling rule (2026-08-08, content-plan-ai-steps.md item 4): "Focus on
giving the user live real time updates on what's going on."

## The gap, precisely (full analysis 2026-08-10)

The server already streams everything: normal agent endpoints emit live token
chunks + a terminal `STRUCTURED_OUTPUT` event; nothing suppresses chunks for a
client-launched run. The gap is 100% client consumption posture:

- `useRunAgent` / `useSlotRunner` produce **no requestId at all** — they drain
  the stream into a local string and resolve at the end. Canonical live
  rendering is structurally impossible from them. They are for genuinely
  headless text-in/text-out only; a UI-visible run must not use them.
- `runHeadlessAgentJson` / `useHeadlessAgentJson` (~30 call sites) supported
  live rendering (`displayMode:"direct"` + `keepInstance` + `activeRequestId`)
  but defaulted to background, so nearly every consumer shipped a spinner.
- No generic container bound a bare requestId — every existing shell
  (`AgentInlineOverlay` etc.) binds a conversationId and drags in the whole
  chat UI, so call sites had nothing cheap to mount.

## The primitives (built 2026-08-10 — USE THESE, never re-derive)

- **`useLiveAgentRun`** (`features/agents/hooks/useLiveAgentRun.ts`) — the
  two-line migration from an await-only `useHeadlessAgentJson` site: same
  `run({...})` contract, forces the live posture, owns instance cleanup
  (re-run / dismiss / unmount). Exposes `conversationId` + `activeRequestId`.
- **`<LiveRunDisplay />`**
  (`features/agents/components/live-run/LiveRunDisplay.tsx`) — the ONE generic
  "watch this run live" container. Binds `conversationId` (client-launched) or
  a bare `requestId` (adopted pipeline streams). Status line from canonical
  phase selectors + `MarkdownStream` body (markdown AND `__kind` JSON route
  correctly). Renders nothing when idle — safe to mount unconditionally.
- Server-orchestrated pipeline endpoints → `adoptForeignStream` into
  `activeRequests`, then `<LiveRunDisplay requestId>` (exemplars: content-plan
  `useContentPlanAi.ts`, seo `useKeywordResearch.ts`).
- Structured-result live UX beyond raw stream → `selectKindEnvelope`
  progressive-kind pattern (`KindRequestDialog`, `CreateFromTopic`).
- Server side: `create_streaming_response(initial_message=…)` now actually
  emits it (info event, code `initial_message`); services add
  `send_phase` + `InfoPayload` milestones (see content_plan `_progress`).

## The migration recipe (per call site, ~15 minutes)

1. `useHeadlessAgentJson` → `useLiveAgentRun` (drop any manual
   `displayMode`/`keepInstance`; the hook owns them + cleanup).
2. Mount `<LiveRunDisplay conversationId={conversationId} label="…"
   pending={isRunning} onDismiss={dismiss} />` where the spinner sat — inline,
   popover, or panel.
3. Thunk-style sites (`runHeadlessAgentJson` direct): pass
   `displayMode:"direct"`, `keepInstance:true`, surface
   `onConversationCreated` to the owning component, and own cleanup — or lift
   the call into a component and use the hook.
4. `useRunAgent` sites that are user-visible: migrate to `useLiveAgentRun`
   (slot sites keep `slotKey`); leave `useRunAgent` only for invisible plumbing.
5. `callApi({stream:true})` pipeline sites: adopt via `adoptForeignStream`
   (ONE AbortController shared with the fetch; `removeRequest` the previous
   adopted row before a new run).

## Done (2026-08-10 session)

- Primitives above; jest-free, `pnpm type-check` green.
- Content-plan flagship surfaces wired: Draft brief (NodePanel), all 7 setup
  agents (SetupView strip + EntityManager), Deepen + bulk deepen + Generate
  (adopted streams, live display in NodePanel / PlanGenerateBar).
- Quiz generation regression fixed (`AssessmentCreate` now renders the stream
  it was already paying for) + the instance leak in `useGenerateQuiz`.
- aidream: dead `initial_message` param now emits; content-plan generate /
  deepen emit real phase+info milestones (commit `126a150`).

## Remaining work

**The offender worklist lives in
[`live-run-streaming-sweep.md`](./live-run-streaming-sweep.md)** — a verified,
ranked inventory (file + line + route + class A–E + fix + effort, 2026-08-11
sweep against THE FLOATING LAW). Take work from there; this doc stays the
vision + primitives + recipe.

One item that sweep does not own, because it is server-side:

- **Server JSON-only slot paths** (aidream) — slot test bench endpoints return
  one blob after N paid runs; cms-fill is poll-based. Candidates for
  streaming/progress upgrades.

## Traps

- Never feed `useRunAgent.onChunk` raw text into your own renderer — banned
  (`matrx/no-bespoke-stream-renderer`). Raw chunks include `<thinking>`.
- `direct`-mode launches resolve their promise only AFTER the stream —
  subscribe via `onConversationCreated`, never the awaited result.
- Adopted rows have no owning instance: `removeRequest` the previous one per
  run or they accumulate for the tab's life.
- Terminal `setRun({status:"done"})`-style writes must preserve `requestId`
  or the display dies at the exact moment the content completes.
