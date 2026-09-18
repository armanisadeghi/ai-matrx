-- dd230_a_column_another_tables_rls_reads_is_part_of_the_bound
-- (DD-230. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- 🚨 THE RULE THIS FILE ADDS TO DD-222's "THE BOUND IS WHAT THE SURFACE RENDERS".
--
-- A generated `pub_read` policy on a CHILD table gates the child through its parent:
--
--   content_ir.kind_component.pub_read
--     USING (deleted_at IS NULL AND kind_definition_id IN (
--              SELECT p.id FROM content_ir.kind_definition p
--               WHERE p.deleted_at IS NULL AND p.visibility = 'public'))
--
-- A policy's references to its OWN table's columns are evaluated by the system and need no
-- column privilege — which is why `billing.product`, `tool.surface_defaults` and
-- `ui.ui_surface_agent_role` all keep serving with `visibility` revoked. But a SUBQUERY
-- against ANOTHER relation runs with the CALLER's privileges. So `anon` must hold SELECT on
-- `content_ir.kind_definition`'s `id`, `deleted_at` and `visibility` or every read of
-- `kind_component`, `kind_edge`, `kind_example` and `kind_surface` fails 42501 — naming the
-- PARENT table in the error, which is what makes this one hard to read.
--
-- Measured: `dd230_content_ir_...sql` bounded `kind_definition` to the ten columns its readers
-- name, and `visibility` is not one of them — no surface renders it. Immediately afterwards all
-- four child relations answered
--   401 42501 "permission denied for table kind_definition"
-- to an anonymous HTTPS read of their own declared columns, while `kind_definition` itself still
-- answered 200. This file restores that one column and records why it can never be dropped again.
--
-- THE GENERAL RULE, for every future bound: **the bound of a signed-out surface is the columns
-- that surface renders, PLUS the columns that any RLS policy reachable by that reader evaluates
-- through a subquery on another relation.** The second half is not a rendered column and never
-- appears in a network capture; it is a column the DATABASE needs to answer the row gate at all.
-- `scripts/check-anon-column-surface.ts` enforces it (the fifth arm: RLS-PREDICATE REACH).

do $$
declare
  v_missing text;
begin
  grant select (visibility) on content_ir.kind_definition to anon;

  -- The three columns the four child policies' subquery reads. All three must be readable or the
  -- children are dead, and a future narrowing must fail here rather than in production.
  select string_agg(k, ', ')
    into v_missing
    from unnest(array['id', 'deleted_at', 'visibility']) as k
   where not exists (
     select 1 from pg_attribute a
      where a.attrelid = 'content_ir.kind_definition'::regclass
        and a.attnum > 0 and not a.attisdropped
        and a.attname = k
        and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'));

  if v_missing is not null then
    raise exception 'dd230: content_ir.kind_definition still withholds (%) from anon. The pub_read '
                    'policies of kind_component, kind_edge, kind_example and kind_surface read those '
                    'columns through a subquery on this table, so every anonymous read of all four '
                    'fails 42501 without them.', v_missing;
  end if;

  raise notice 'dd230: content_ir.kind_definition keeps id, deleted_at, visibility for anon — the '
               'columns four child pub_read policies evaluate through it.';
end $$;
