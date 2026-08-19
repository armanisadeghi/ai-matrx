# Workflow Runtime UI — where workflows RUN, and where their run pages are designed

**status:** open — core product SHIPPED and production-proven; tails + two in-flight chips below
**THE MASTER DOC for this feature.** The server half (`aidream docs/handoffs/workflow-runtime-ui-server.md`)
and the kinds campaigns (`aidream docs/handoffs/workflow-node-kinds-gap.md`,
`podcast-media-shapes.md`) are satellites of this one — grooming any of them updates this list.
**vision (cross-repo, read first):** `common-docs/systems/workflow-runtime-ui/PLAN.md` (R1–R12
settled; §1 requirements, §4.2 scale doctrine, the podcast acceptance bar — never let it rot).
**code contract:** `features/workflow-runtime/FEATURE.md` (parts table, invariants, change log).

One line: a generic, author-designed live run experience — you see what you'll get from second
zero, watch every step work with real signal, and the deliverables land as real components.

## The whole feature, part by part (global map — keep this section true)

| Part | Where | State |
|---|---|---|
| List | `/workflows/all` (canonical entity-list shell; `/workflows` reserved for marketing → redirects) | LIVE |
| Run stage | `/workflows/[id]` — run form → RunHero ("You'll get"), RunJourney (THE PLAN), activity feed, deliverables, failure card | LIVE, prod-proven end-to-end (Study Pack, $0.30/1:58) |
| Run page designer | `/workflows/[id]/design` — build left, real preview right (real run or wound sample run); named widths, no coordinates | LIVE |
| Run history | `/workflows/runs/[runId]` — deep link + list door | LIVE |
| Feature internals | `features/workflow-runtime/` — adapter (replay+SSE+poller), tree slice (keeps node_stream deltas), 12-lane budget, trigger points | LIVE |
| Server events | matrx-graph vocabulary + `workflow_events.py` node emitters; generated TS types (one artifact, both apps) | LIVE (see server handoff for the 2 open items) |
| Kinds/rendering | Every Study Pack kind ACTIVE with a web component (incl. `agent_result`, `ingested_sources`, `study_notes`); media 4 live; `KindInstanceRender variant="bare"` per the wrapper law | LIVE — but see THE UPSTREAM RULING below |
| Demo page | `/demos/workflow-runtime` — a door to the real routes, not a second copy | LIVE |
| Studio (Vite) | edits DEFINITIONS — adjacent app, not this feature; shares the generated event types | n/a |

## 🚨 THE UPSTREAM RULING (Arman, 2026-08-18) — the kinds MODEL is broken

`common-docs/systems/content-ir-system/WORKFLOW_KINDS_AUDIT.md` — auto-minted contract kinds
(986 vs 267 real), workflow payloads carrying no `__kind`, undeclarable scalar kinds, no
`markdown` kind, agent output losing its kind at the boundary. **The runtime UI's rendering
rests on that model.** Nothing here re-executes the old per-node burn-down; when the audit's
decisions land, this feature consumes them. The in-flight universal-renderer chip
(`task_fb0b4ed6`) is the FE half of the same problem.

## In flight (separate sessions — do not duplicate)

- `task_e9503c14` — agent steps stream their TOKENS onto `node_stream` (server; today only
  markers/progress flow mid-step for agent nodes).
- `task_fb0b4ed6` — universal Shape renderer (partial commits landed: `b64407336`,
  `a8fb617bd`).

## Open (this repo, ordered)

1. **Research-lite parity proof** — the last unproven surface complexity class (tabs/pages +
   DB-backed tables; PLAN Phase 6's second half).
2. **`/workflows` marketing page** — route reserved + redirect live; the page itself unbuilt
   (chipped: see Dispatched).
3. **Typed per-verb callApi** — `useWorkflowRunControls` still carries 6 `as never` casts
   (chipped).
4. **Realtime backstop** — consume `hooks/useRunListRealtime.ts` on the first runs-LIST
   surface (verify `workflow.run` is in the `supabase_realtime` publication first).
5. **executeNode per-node `inputs` collection UI** (Phase 4 tail).
6. **Study-pack composite component** — deliverable page composes `flashcard_set` +
   `quiz_set`; a true `study_pack_set` composite remains open.

## Server-owned (see `aidream docs/handoffs/workflow-runtime-ui-server.md`)

Per-invocation stream identity on `node_stream` (fan-out sibling lanes — deliberate lockstep
change) · `result_ref` NodeSpec declaration (AWAITS ARMAN's ruling).

## Decisions Arman owes

① `result_ref` ("big output lives at link_kind/link_id — fetch, don't stream") — recommended
yes, added the way `output_kind` was. ② Lexicon: run-page things are **Readouts** in code; the
UI now speaks plain language — keep the split or reunite. ③ The WORKFLOW_KINDS_AUDIT decisions
(his doc, his call).

## Recently shipped (compressed; details in FEATURE.md change log)

2026-08-16/17: Phases 1–5 (adapter, slice, lanes, surfaces, drag builder, actions/HITL, Study
Pack + Podcast pinned proofs). 2026-08-18/19: run stage rebuilt (promise-first hero, full plan,
real activity feed, deliverables, humane failure card; slice keeps `node_stream` deltas — the
spinner-forever root cause); designer rebuilt (no coordinates, real/sample preview); permanent
routes + canonical list; Study Pack run form (`materials` node) + projection lane onto real
kinds; org fix (body scope accepted + X-Organization-Id header — org-less runs made every
agent step refuse); full kind coverage incl. `agent_result`/`ingested_sources`/`study_notes`;
generated TS event types both apps; autogen→web; server stream fixes (tool lifecycle + human
message on frames, structured warnings, parseable marker summaries, heartbeat no longer erases
the live panel); wrapper-law `variant="bare"`; USER-INPUT LAW fixes in content-ir; COPPA
signup age screen; Study Pack surface fixture re-pinned.
