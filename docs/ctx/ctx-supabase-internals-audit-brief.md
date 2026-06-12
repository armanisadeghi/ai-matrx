# Supabase Internals Audit Brief — split across 10 agents

> **Requirement #3: the silent killers.** Triggers, RPCs, views, and policies that quietly reference the things we're changing and break with no error anyone notices. This brief partitions the database so **10 agents each audit ~1/10th** in parallel, then we collate.
>
> Each agent needs **Supabase MCP access to project `txzxabzwovsujtloxrus`** and a copy of `ctx-association-architecture.md` + `ctx-association-removed-fk-ledger.md`.

## What we changed (the search targets)
1. Tables renamed → now compat **views**: `ctx_scope_assignments`, `ctx_task_associations` (originals are `*_deprecated`).
2. New table: `ctx_associations`. New function: `ctx_can_access_target`.
3. Litter columns being retired: `project_id` / `task_id` on the tables in ledger §B/§C.
4. Anything writing to a **view** with no INSTEAD OF coverage, or assuming the old tables were base tables (e.g. referencing them in a FK, trigger constraint, or `INSERT ... RETURNING` patterns that views handle differently).

## Partition (assign one slice per agent, by base-table name, alphabetical)
1: a–b · 2: c (incl. `code_*`, `ctx_*`, `cx_*`) · 3: d–f · 4: g–i · 5: j–m · 6: n–p · 7: q–r · 8: s · 9: t–u · 10: v–z
(If a slice is heavy, split further. `ctx_*` and `cx_*` in slice 2 are the densest — that agent may take the most.)

## Each agent reports, for its slice
For **every** table, view, function, trigger, and policy whose object name falls in the slice:

1. **Function/RPC source scan** — does `pg_get_functiondef` reference any search target (the two old table names, `project_id`, `task_id`, `entity_type`/`entity_id` against those tables, or the deprecated names)? List function name + the referencing line. Classify: reader (safe via view) vs writer (must repoint) vs DDL/maintenance.
2. **Trigger scan** — any trigger on a slice table that writes to / reads from the changed objects? Note timing/event and target.
3. **View scan** — any view that selects from the old tables or the litter columns? (Views silently return stale/empty after column drop.)
4. **Policy scan** — any RLS policy whose `USING`/`WITH CHECK` references the litter columns or old tables.
5. **FK / constraint scan** — any constraint referencing the changed objects.
6. **Generated columns / defaults** — any default or generated expression referencing the targets.

### Useful starting queries (adapt the slice filter)
```sql
-- functions referencing targets
SELECT p.proname, n.nspname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
  AND p.proname ~ '^[a-b]'   -- slice filter
  AND (pg_get_functiondef(p.oid) ILIKE '%ctx_scope_assignments%'
    OR pg_get_functiondef(p.oid) ILIKE '%ctx_task_associations%'
    OR pg_get_functiondef(p.oid) ~* '\m(project_id|task_id)\M');

-- triggers on slice tables
SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema='public' AND event_object_table ~ '^[a-b]';

-- views referencing targets
SELECT table_name, view_definition FROM information_schema.views
WHERE table_schema='public' AND table_name ~ '^[a-b]'
  AND (view_definition ILIKE '%ctx_scope_assignments%' OR view_definition ILIKE '%ctx_task_associations%'
    OR view_definition ~* '\m(project_id|task_id)\M');

-- policies referencing targets
SELECT tablename, policyname, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename ~ '^[a-b]'
  AND (COALESCE(qual,'')||COALESCE(with_check,'')) ~* '(ctx_scope_assignments|ctx_task_associations|\mproject_id\M|\mtask_id\M)';
```

## Collation output (one combined table back to us)
| object | type | slice | references | reader/writer | action needed | ledger row it affects |
Anything that **writes** the old tables or **reads a litter column** is a Phase-2 blocker. Map each finding to the ledger so a column only flips to `verified` when its references are all resolved.

## Known-good baseline (already found centrally — agents should confirm, not re-discover)
Writers: `set_entity_scopes`, `associate_with_task`, `dissociate_from_task`, `create_task_with_association`, `create_tasks_bulk`.
Readers: `get_entity_scopes`, `get_tasks_for_entity`, `get_task_associations`, `list_entities_by_scopes`, `resolve_full_context`, `get_user_full_context`, `list_scopes`, `delete_scope`, `delete_scope_type`.
Value-layer (separate concern): `set_context_value`, `set_scope_context_value`, `ctx_version_context_item_value`, `get_value_history`, `get_scope_context`, `kg_simulated_scope_graph`.
