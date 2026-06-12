# CTX Association Overhaul — Document Set (start here)

The one-line idea: **every cross-cutting relationship moves into one unified association layer; hard FKs are reserved for ownership and containment only.** Scattered `project_id`/`task_id` columns across ~50 tables and the duplicate `ctx_scope_assignments`/`ctx_task_associations` tables collapse into one `ctx_associations` graph, while typed, named, enforceable relationships (incl. file/agent/scope-as-value) live in `ctx_context_item_values`.

## Read in this order
1. **`ctx-association-architecture.md`** — the bible. All decisions, the model (§0), open questions (§7), the industry-module principle (§8a). Everyone reads this first.
2. **`ctx-association-migration-phase1.sql`** — the actual additive, non-destructive, one-transaction migration (unified table + access helper + RLS + backfill + compat views/triggers). Safe to run in the outage window.
3. **`ctx-association-post-migration-plan.md`** — runbook: pre-flight, verify, audit, app cutover, soak, then drops. Includes the one-shot guidance.
4. **`ctx-association-removed-fk-ledger.md`** — what's frozen / kept / judgment / to-drop. A column flips to `dropped` only after it's `verified`.
5. **`ctx-supabase-internals-audit-brief.md`** — hand to 10 sub-agents (alphabetical slices) to hunt the silent killers (triggers/RPCs/views/policies).
6. **`ctx-association-migration-phase2-drops.sql`** — DESTRUCTIVE, gated. Do **not** run until the ledger says verified.
7. **`ctx-association-migration-analysis-brief.md`** — for the IDE agent: codebase inventory (Redux/ORM/types/RPCs) to size the cutover.

## Audience map (same source of truth, different entry points)
- **DB / migration runner** → #2, #3, #4, #6.
- **IDE / app agent** → #1, then #7, then the cutover in #3 Step 4.
- **Audit sub-agents** → #5 (+ #1, #4 for context).
- **You and Claude** → #1 is the running record; update it as decisions land.

## Two things to keep straight forever (the recurring failure mode)
- **Association** (durable: "belongs to / filed under") vs **Active Context** (runtime: "what I'm focused on now"). Different storage, different UI, never merged. See architecture §6.
- **Store explicit, derive the rest.** Never materialize ancestor links. See §4.

## State right now
Phase 1 SQL is written and safe to run. Phase 2 is written but gated. Open decisions still needed from you: reference cardinality (§7.2), required-slot enforcement style (§7.3), and the judgment-case tables (§7.4 / ledger §E).
