# Workflow Emit — rendering what a workflow puts on the screen mid-run

**Status:** WIRED (2026-08-19). Built ~2026-08-08 with zero importers; the run
surface now consumes it. See "The gap that existed" below before changing
anything here.

**Cross-repo system-of-record:** the event contract is aidream's
`packages/matrx-graph/matrx_graph/types/events.py` (`NodeEmittedEvent`) and the
producer is the `output.to_frontend` node ("Show on Screen"). Node-authoring
rules live in aidream's `.claude/skills/workflow-module/SKILL.md`; the canvas
half lives in `apps/workflow-studio`. **This repo owns the rendering**, and it
is the only repo that does — workflow-studio's own docs point here.

## What this feature is

A workflow step can push content to the screen *while the run keeps going*,
without ending the run and without being a deliverable. The engine fires a
`node_emitted` event carrying:

| Field | Meaning |
|---|---|
| `mode` | `confirmation` / `summary` / `full` / `restructured` |
| `payload` | the already-transformed content (a non-dict is wrapped as `{ value }`) |
| `component_ref` | a `tool_ui.tool_name` to render with — or null for the generic viewer |
| `surface` | always `matrx-user/workflow` (`surface.ts`) |
| `title` | the author's human label |

**Emit is NEVER load-bearing.** The producer swallows its own failures, and so
does this side: a missing row, a compile failure, or a component that throws
all degrade to `GenericEmitRenderer`. Nothing here can take a run surface down.

## Parts

| Part | File | Contract |
|---|---|---|
| Public entry | `DbEmitRenderer.tsx` | THE only thing a consumer outside this feature may render. `next/dynamic({ssr:false})` around the impl, so `@babel/standalone` stays out of the host bundle. |
| The three branches | `DbEmitRendererImpl.tsx` | `component_ref` null → generic. Ref resolves → compiled component inside the error boundary. Ref fails → generic. Resolution is keyed `(componentRef, version)`; the generic body paints immediately and the custom component upgrades it in place, so there is never a blank flash. |
| Generic body | `GenericEmitRenderer.tsx` | Any payload shape via `ResultValue density="full"` (HIDE NOTHING) + `MarkdownStream` for the title. Carries the ephemeral **"Build a beautiful UI for this output"** Assist — the intended path by which a `component_ref` ever comes to exist. |
| Compiler | `compileEmitRenderer.ts` | The agent-apps `compileSlotComponent` sandbox, reused VERBATIM. Never a second compile path. |
| Row fetch | `fetchEmitRendererRow.ts` | One active `tool.ui` row by `tool_name`, pinned to `WORKFLOW_EMIT_SURFACE`. DIRECT to Supabase (the client never asks the Python server for a row). |
| Cache + invalidation | `emitRendererCache.ts` | Positive / negative / in-flight, session-scoped. Registers on `INVALIDATION_KEYS.dbToolRenderers` and bumps a monotonic per-ref version. |
| Repaint hook | `useEmitRendererVersion.ts` | `useSyncExternalStore` over that version — a mounted emission re-resolves when an agent edits the row. |
| Surface constant | `surface.ts` | `matrx-user/workflow`. |
| Types | `types.ts` | `NodeEmittedEvent` (FROZEN — mirrors the backend) + `EmitRendererProps` (payload-shaped, deliberately NOT `ToolRendererProps`). |
| **The consumer** | `../workflow-runtime/components/run/RunEmissions.tsx` | Renders `run.emissions` in arrival order through `DbEmitRenderer`. Mounted in `RunStage` (above the deliverables) and in `WorkflowRunBoard` (Tier 0). |

## Invariants (violating any of these is a defect)

1. 🚨 **A consumer outside this feature imports ONLY `DbEmitRenderer`,
   `surface`, or `types`.** `emitRendererCache` → `compileEmitRenderer` → the
   agent-apps compiler → a STATIC `@babel/standalone`. The `next/dynamic`
   boundary in `DbEmitRenderer.tsx` is the only thing keeping Babel out of the
   run-surface bundle, and any other import walks straight around it. That is
   the **D115 shape** — the import edge that cost +14 GB peak build RSS and
   OOM-killed 12 straight Vercel builds. Guarded, red-on-violation, by
   `__tests__/emit-bundle-boundary.test.ts`.
   **This is why the run surface does NOT prefetch renderers from the
   definition.** A `collectEmitComponentRefs` + `prefetchEmitRenderer` warm-up
   was written and then deleted for exactly this reason: it bought one beat of
   latency that the generic-body-then-upgrade path already hides, and paid for
   it with the worst build regression this repo has had. Do not re-add it from
   outside this feature.
2. **One renderer, no fork.** Every emission goes through `DbEmitRenderer`. No
   consumer inspects a payload shape or draws its own viewer.
3. **The durable `seq` is the identity.** The emissions ring is capped
   (`EMISSIONS_MAX = 100`) and drops from the HEAD, so an array index is not a
   stable key. The slice records `seq` (and `persisted`, true when the emission
   was folded from durable replay rather than arriving live) for exactly this.
4. **Emit degrades, never fails.** Every failure path lands on
   `GenericEmitRenderer`.
5. **No second surface.** A renderer row is resolved against
   `matrx-user/workflow` and nothing else.

## The gap that existed (why this doc exists)

This feature shipped complete — impl, cache, compiler, error boundary, tests —
and **was never imported by anything** for the rest of its life. Meanwhile the
producer ran in production: at the time of wiring, **90 `node_emitted` events
across 85 runs**, the most recent that same day, every one of them content a
workflow deliberately pushed to a screen that had no place to put it. The
`workflowRuns` slice folded them into `run.emissions` all along, the activity
feed logged a "delivered" line for each, and the payload itself went nowhere.

Recorded as an unfinished-work alarm in
`common-docs/projects/workflows/STATE.md` and
`common-docs/projects/universal-live-result-surfaces/AUDIT.md`, and as a known
gap in aidream's archived workflow handoff. All three predicted the vision
correctly; none of them was wrong about a single detail.

## Verified in the browser against real runs (2026-08-19)

Three real completed runs, replayed from the durable log on the run permalink
(`/workflows/runs/<runId>`), all three emit modes, zero console errors:

| Run | Mode | What rendered |
|---|---|---|
| `e0c68ed1` Study Pack v1 | `full` | "SHOWN ALONG THE WAY" → step **"Show the study pack"** → title "Study pack" → the real quiz payload as a sortable 8-row MCQ table via `ResultValue`, plus the **"Build a beautiful UI for this output"** Assist chip. |
| `ac9bfb0e` / `7f9ecd33` Sort a message by urgency | `confirmation` | Step **"Needs attention now"** → one green-checked line, "Urgent — this one needs attention today." No Assist chip (correct for confirmation). |
| `6f7185e4` | `summary` | Title "Run summary" → `Text: "A Fine Finish"` + the Assist chip. |

**One real defect found and fixed by that pass.** The confirmation branch printed
its own sentence twice — once as the line, once again as a "Message" field —
because `hasExtra` compared the unwrapped payload object against the extracted
string and was always true for a bare `{"message": ...}`. `residualPayload` now
consumes `message` when the LINE came from it and renders only a genuine
remainder; a title still outranks `message` and leaves it visible. Guarded by
`__tests__/emitRenderer.test.tsx`.

## Verification state (2026-08-19)

- **The generic branch is the whole of live traffic.** Of those 90 emissions,
  `component_ref` is non-null on **zero**, and `tool.ui` holds **zero** rows on
  `matrx-user/workflow` (19 on `matrx-default/default`, 11 on
  `chrome-extension/pilot`). Nobody has authored a workflow emit renderer yet,
  which is exactly what you would expect of a surface that could not render one.
- **The resolution query is sound, not merely empty.** The same query shape
  returns real rows on the other two surfaces; the workflow surface is empty
  because it is unauthored, not because the fetch is broken.
- **The first `component_ref` is meant to be born from the UI**, via the
  "Build a beautiful UI for this output" Assist on a generically-rendered
  emission (`features/assists/FEATURE.md`). No row was hand-seeded here — that
  chip is the intended author, and hand-seeding one would have pre-empted the
  path this feature exists to prove.
