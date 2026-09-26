# Surface campaign — coordinator brief

Give this to ONE fresh, top-level session. A child session can hit the platform's session-lineage
depth limit and then cannot dispatch anyone. The coordinator builds nothing itself: it keeps the list
true, assigns batches, and checks results. Worker brief: [campaign-worker.md](./campaign-worker.md).
Open platform gaps: `docs/handoffs/surface-campaign.md`.

## Goal

Every registered surface is agent-readable. While a user is on it, the Surface Context window names
it and shows every piece of data the page loads, proven on the live site with real data. The
campaign ends when the census says so, not when workers say so.

## Why the last run stalled, and the rule that answers each cause

| What happened (measured 2026-09-25) | Rule now |
|---|---|
| Two scoreboards disagreed: manifests self-declared "verified" while only 16 surfaces had ever been independently checked. Nobody could say what was done. | ONE list, computed from facts by `pnpm surface:census`, never from a worker's word. |
| Claims from agents that died held surfaces "in progress" forever. | A claim expires after 6 hours (the worker brief's claim query enforces it). |
| Certification found problems, and nobody was routed to fix them. | Whoever builds a surface fixes what its reviewer finds, in the same assignment. |
| Cloud workers could not finish the required steps: the full type check needs ~13 GB of a 15 GB container; the dev server was killed when both ran; DB sync needs credentials cloud sessions lack. | Workers never run a dev server or the full type check. They verify on production with `pnpm surface:probe` (~40 s per surface). Sync goes through the SQL emitter until handoff item 3 lands. |
| About 1,500 lines of required reading for a ~200-line change. | Workers get one self-contained brief; skills are reference only. |
| Stub vocabularies were written without an audit, and half their descriptions were wrong. | The completeness pass is always done from the components. |

## The list

`pnpm surface:census` (5 seconds, no network) prints, per surface:
- declared readiness;
- host (route or overlay);
- value count;
- whether anything EMITS it: the manifest module's `create…Scope` has a call site outside the
  manifest.

It also flags "declared verified but nothing emits it". Treat a "not emitting" as a lead: a few
surfaces emit through a shared builder the census does not map yet. Confirm those with a probe, and
teach the census when it's wrong.

`pnpm surface:census --sql` prints a read-only query. Run it through the Supabase MCP (`project_id`
`brsgrqvjdzwihsvnfqkf`); it lists every surface whose DB mirror disagrees with code, plus DB rows
with no manifest.

Run both at the start of every wave, and publish the wave table in your report: surface, facts,
assigned worker, result. Until handoff item 5 makes `/administration/ui/surfaces` compute this
itself, the census IS the board.

## Waves

**Wave 0 — remove what would hit every worker, before any fan-out.** Snapshot on 2026-09-26: 214
surfaces, 193 emitting, 21 not emitting; 4 declared verified with no emitter found; DB readiness
agrees everywhere; 31 DB rows with no manifest here (several belong to other clients); 2 value-count
drifts.
- `pnpm check:surface-drift` must be green on main. If it's red, fix it first: a red gate stops
  every worker.
- Clear stale claims older than 6 hours.
- Settle the 4 "verified but not emitting" (probe each): either the census learns their emitter or
  their readiness drops to `partial`.
- Dispatch handoff item 3 (cloud sync) if nobody owns it: it saves every worker the SQL paste.

**Each wave:**
1. Pick the next unclaimed surfaces. Order:
   - not emitting, on routes people use;
   - partial, where the note names a missing emitter or values;
   - overlays;
   - the rest.
2. Group them into assignments of 10–15 surfaces **from the same feature area**. They share
   components, so a worker builds context once, and two workers never edit the same files.
3. Dispatch one worker per assignment, each as its OWN cloud session (`create_session`), with
   `campaign-worker.md` and its assignment block filled in.
   - Lane: standard (Opus).
   - Start with 4–6 workers at once. Raise the number when merge conflicts and review findings stay
     low.
   - Workers never run a dev server, so memory no longer limits parallelism; git contention and your
     own checking time do.
4. Workers report through durable state, not messages:
   - claims set and released on `ui.ui_surface`;
   - readiness and note synced to the DB;
   - one review-queue row per assignment (lane tag `surface-emitters`);
   - a `REPORT-<name>.md` returned as their final output.

   Check sessions with `get_session`. Never message a worker for status (a message is a full paid
   wake).
5. When an assignment finishes:
   - rerun the census;
   - probe two of its surfaces yourself with `pnpm surface:probe`, choosing different routes and
     states than the worker reported;
   - collect every handoff prompt workers wrote into `docs/handoffs/surface-campaign.md` (Future
     section, one item each).
6. Report each wave to Arman in plain English:
   - what is now agent-readable;
   - what is left;
   - what is blocked, and on what.

   No file paths or code names.

## What "done" means for one surface

- Emitting on every route, with no undeclared keys.
- Completeness pass done from the components.
- Probe evidence on the deployed site.
- Reviewer findings fixed, or written up as handoffs.
- DB mirror in sync.
- Readiness honest: `partial` plus the exact remaining gap (usually the outside-helper binding test).
  `verified` only when that is proven too.
