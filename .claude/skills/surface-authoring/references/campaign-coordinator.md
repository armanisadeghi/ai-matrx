# Surface campaign — coordinator brief

Give this to ONE fresh, top-level session. A child session can hit the platform's session-lineage
depth limit and then cannot dispatch anyone. The coordinator builds nothing itself: it keeps the list
true, assigns batches, and checks results. Worker brief: [campaign-worker.md](./campaign-worker.md).
Open platform gaps: `docs/handoffs/surface-campaign.md`.

## Goal

Every registered surface is agent-readable. While a user is on it, the Surface Context window names
it and shows every piece of data the page loads, proven on the live site with real data. The
campaign ends when the census says so, not when workers say so.

## Coordination contract

- The census identifies implementation leads; it does not certify behavior. A missing static
  emitter match must be checked against the consuming package and a runtime probe.
- Autonomous fleet claims use Work Loop. Only campaign cloud workers without that tool use
  the worker brief's six-hour SQL fallback; never mix claim systems.
- Each assigned worker fixes reviewer findings in the same assignment and returns the
  entrypoint's integration receipt. Independent certification belongs to `surface-check`.
- Local workers prove changed code in the managed localhost preview. Cloud workers without a
  preview can collect deployed evidence and report the named localhost boundary.
- Prefer focused direct transactional sync plus full live check; the worker brief defines the
  conditional SQL fallback and exact receipt when a check cannot run.
- The completeness pass starts from rendered components, not manifest vocabulary.

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
assigned worker, result. Until the handoff "The admin board should compute status" makes `/administration/ui/surfaces` compute this
itself, the census IS the board.

## Waves

**Wave 0 — remove shared blockers before fan-out.** Compute current counts from the census
and focused mirror checks rather than a historical snapshot.
- `pnpm check:surface-drift` must be green on main. If it's red, fix it first: a red gate stops
  every worker.
- Reconcile assigned Work Loop work; clear expired legacy claims only for the fallback campaign.
- Settle every "verified but not emitting" lead (probe each): either the census learns its emitter or
  their readiness drops to `partial`.
- Resolve shared sync credentials or retain a named external boundary with the worker's exact check receipt.

**Each wave:**
1. Pick the next unclaimed surfaces. Order:
   - not emitting, on routes people use;
   - partial, where the note names a missing emitter or values;
   - overlays;
   - the rest.
2. Group them into assignments of 10–15 surfaces **from the same feature area**. They share
   components, so a worker builds context once, and two workers never edit the same files.
3. When delegation is authorized, dispatch one worker per assignment through the environment
   available to this coordinator, with
   `campaign-worker.md` and its assignment block filled in.
   - Start with 4–6 workers at once. Raise the number when merge conflicts and review findings stay
     low.
   - Local workers share the one managed preview; do not launch additional dev servers.
4. Workers report through durable state, not messages:
   - assigned Work Loop state, or explicitly bounded legacy claim state;
   - readiness and note synced to the DB;
   - one review-queue row per assignment (lane tag `surface-emitters`);
   - a `REPORT-<name>.md` returned as their final output.

   Use the environment's compact status/wait tools instead of repeatedly waking idle workers.
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
- Runtime/menu evidence against changed code, with the verification host and commit recorded.
- Reviewer findings fixed, or written up as handoffs.
- Focused DB sync and matching full live check passed; integration receipt complete.
- Readiness honest: `partial` plus the exact remaining gap (usually the outside-helper binding test).
  `verified` only when that is proven too.
