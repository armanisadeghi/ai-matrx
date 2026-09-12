# DD-137b13 access-delta source-record repair

`iam_component_regeneration_dd137b13_gate.sql` and its ledger-pin companion were included in
`a590bc2596` and are already recorded as applied in `public._schema_migrations`. They are
historical execution evidence, not editable source. Editing their bytes would create migration-ledger
drift and would not revise what ran.

The gate's unpinnable-baseline branch was not a valid access-delta proof. It checked only whether a
private/confidential table retained the `platform_admin_all` policy name, then deleted all of that
token's BEFORE/AFTER probes. That can miss widening through another permissive policy, a grant, or
a changed policy expression; it also removes organization/public controls before their later `SAME`
assertion.

The corrected SQL shape is kept as a non-runnable source record in
[`dd137b13_access_delta_gate_source_repair.sql`](./dd137b13_access_delta_gate_source_repair.sql).
It refuses when a BEFORE probe is unpinnable, retains every `(token, principal)` probe, and delegates
the complete pair to `iam.access_delta_assert_no_widening`.

For any future access-changing regeneration, first ensure the harness pins every table at one instant
using `created_at` or, for append-only ledgers, `occurred_at`; then capture a new BEFORE snapshot,
perform the authorized regeneration, and run the full delta gate. The current post-change state
cannot establish a historical no-widening claim for a baseline that was never pinned. The existing
staff-door guard remains valuable end-state evidence, but it is not a substitute for the per-principal
access delta.

This repair changes no live policy and must not be applied through Supabase MCP or an ad-hoc query.
If a future live correction is authorized, put it in a new migration and use `pnpm db:apply` so the
executed bytes and migration ledger are recorded together.
