# @matrx/agents — portable execution runtime

`@matrx/agents` is the ONE extraction boundary for AI Matrx client-side agent
execution. It is not a second agent system. Matrix, Workflow Studio, Dashboard,
and future clients must converge here so the same server bytes produce the same
events, state transitions, Content IR blocks, and run lifecycle everywhere.

## Current truth

The package has two very different maturity levels:

- `src/stream/ndjson.ts` is a real, framework-independent implementation. It
  owns NDJSON framing, UTF-8 boundary handling, read-ahead, compact event
  expansion, cancellation, and loud malformed/unknown-line hooks. It is twinned
  into `aidream/apps/shared/matrx-agents` and consumed by Workflow Studio.
- `src/presentation/result.ts` is the canonical Creator-facing visibility
  boundary for settled agent results. It removes provider-private reasoning
  blocks and signature material without mutating the execution/checkpoint
  value, and is twinned into AI Dream for Studio result rendering and exports.
- The Redux barrels are still a façade over `matrx-frontend/features/agents`.
  Their `@/` imports make them unusable outside this repository. The adapter
  registry is a target contract, not proof that the live thunks use it.

The façade reducer map does include the current execution-owned companion
slices (working document, inbox, active tools, context state, and observational
memory) so its inventory no longer understates the live runtime. Matrix still
hand-wires those reducers; v3 changes Matrix to consume the package map.

The live execution system currently contains roughly 155 TS/TSX files and
44,000 lines. Most execution files import host aliases, many reach into the
host `RootState`, and `process-stream.ts` also coordinates Content IR,
observability, message persistence, tools, working documents, files, canvas,
directives, and callbacks. Treating this as a mechanical file move is wrong.

## Versioned convergence plan

### v1 — wire parity (implemented)

- Canonical portable NDJSON reader + full/compact envelope normalization.
- Matrix's `lib/api/stream-parser.ts` delegates framing to it.
- Workflow Studio and the administrative Dashboard delegate every NDJSON
  reader to the verbatim twin.
- A manifest + drift check prevents the two copies from silently diverging.

This closes byte-to-event drift. It does not yet make Redux projection or
effects identical.

### v2 — pure event projection

Extract the event-to-request-state rules from `process-stream.ts` into package
owned pure reducers/projectors. Start with request identity/status, answer and
reasoning blocks, phases, completion/error, tool lifecycle, render blocks, and
Content IR metadata. Matrix must consume these projectors before Studio does;
golden fixtures must assert identical state for identical event sequences.

Host effects remain explicit callbacks: transcript persistence, toasts,
working-document writes, canvas/file integration, directives, and client tool
execution. No projector may import a host store or UI module.

### v3 — portable execution store

Package the minimum Redux store for running (not building) agents:

- conversations, messages, active requests, observability;
- variables, context, model overrides, resources, client tools, user input;
- working document, active tools, context state, observational memory, inbox;
- launch/load/resume/cancel/adopt thunks and narrow selectors.

Matrix replaces its hand-wired keys with the package reducer map first. Vite
clients mount this focused Redux store beside their existing Zustand/React
Query state; they do not copy Matrix's entire application store.

### v4 — canonical identity resolution

Move run-time agent definition/version loading, shortcuts, slots, and surface
bindings behind package adapters. Preserve the existing precedence rules:

1. a slot resolves the agent plus `config_overrides` and is mutually exclusive
   with direct agent/shortcut identity;
2. a shortcut remains pinned to its frozen definition/version payload;
3. surface binding layers merge global → visible org → user → shortcut;
4. required/prompted value mappings fail loudly before a run begins.

Agent builder/admin CRUD remains in host applications. Only execution payload
resolution belongs here.

### v5 — capability plugins and full parity

Turn the remaining host-specific branches into optional capabilities: files,
canvas, working-document persistence, surface writeback, delegated/client
tools, directives, sandbox/desktop routing, and UI prompts/overlays. A missing
declared capability must fail loudly; an undeclared capability is simply not
part of that host.

At this point Studio and Dashboard can launch agents directly, render the same
Content IR, resume/cancel runs, and consume shortcuts/slots/bindings without a
parallel parser or lifecycle.

## Non-negotiable boundaries

- The Python server remains the execution authority; this package is the
  canonical client execution engine.
- Content IR remains its own shared kernel. The agent runtime feeds it canonical
  event/request state and never creates a competing renderer.
- Agent-building UI is not part of this package.
- No app imports (`@/`, Next.js, toast/overlay UI, host `RootState`) may enter a
  package-owned implementation module.
- New stream syntax starts in `src/stream/ndjson.ts`, then is synced; never patch
  a consuming app's parser independently.
- Provider reasoning/signature material stays in execution persistence for
  replay, but every Creator-facing result renderer, JSON tab, and export first
  applies `projectAgentResultForDisplay`. Never hand-roll a host-specific
  filter and never feed the projected value back into execution.

## Verification

```bash
pnpm --filter @matrx/agents type-check:stream
pnpm test --runTestsByPath packages/matrx-agents/src/stream/ndjson.test.ts
```

The full package `type-check` remains a deliberate red gate until the Redux
façade stops compiling through the host application graph.
