-- target: branch,production
-- additive: yes
--   It REPLACES one function of schema `custom`, `read_records_matching`, with its existing
--   signature, security and search_path, keeping every existing line, and ADDS one internal
--   IMMUTABLE helper, `custom.unresolved_sources_of(jsonb, text[], boolean, jsonb)`. No table,
--   column, trigger, policy or grant is touched; no row is written. A record with no gone
--   relation reads exactly as before.
-- guard: custom/system_enabled
-- lane: GRID-TAILS
-- lock: custom
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 5fab07143d4daf1e276485852c06e48242a3af53f85358fc8230b2f793048a93
--
-- ORDER: after S2-PRIME's filtergroups_a_views_nested_question_is_one_where_clause.sql (the
-- based-on line names the body that file leaves, so this is refused by name on a database it has
-- not reached). Inverse: migrations/inverse/gridtails_a_relation_to_a_gone_record_says_so_on_the_grid_down.sql.
--
-- THE USE CASE. Rincon Plumbing's service call WO-4474 pointed at a customer record that was gone
-- before the move; the mover kept the id it held at `_sources.<ptr>.unresolved.customer`
-- (9f2c7a10…) and left the cell empty, because the store refuses a relation to nothing. The grid
-- read the row through this door and drew "—", which says "nobody filled this in" — false.
-- records-ui already says "The record this pointed at no longer exists" when the document carries
-- that block (`unresolvedFor`, values.tsx); this door stripped it (`has_sources = f`, measured on
-- the clone as admin@admin.com, lane DEFAULT-GRID-PARITY). Now the document carries ONLY the
-- unresolved half of each provenance entry — never the store, row id or kind — and only for
-- columns this reader may see (a hidden column's gone id is not a thing the reader may learn).
-- Airtable shows a deleted linked record as a struck-out chip, never a blank; so does this.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function custom.unresolved_sources_of(
  p_sources jsonb, p_visible text[], p_by_id boolean default false, p_key_ids jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- { <ptr>: { unresolved: { <key>: <id> } } } over the visible keys only, or null when none.
  select nullif(coalesce(jsonb_object_agg(x.ptr, jsonb_build_object('unresolved', x.gone)), '{}'::jsonb), '{}'::jsonb)
    from (
      select s.key as ptr,
             jsonb_object_agg(case when p_by_id then coalesce(p_key_ids ->> u.key, u.key) else u.key end,
                              u.value) as gone
        from jsonb_each(case when jsonb_typeof(p_sources) = 'object' then p_sources else '{}'::jsonb end) s
        cross join lateral jsonb_each(
          case when jsonb_typeof(s.value -> 'unresolved') = 'object' then s.value -> 'unresolved'
               else '{}'::jsonb end) u
       where u.key = any (coalesce(p_visible, '{}'::text[]))
       group by s.key
    ) x;
$fn$;

comment on function custom.unresolved_sources_of(jsonb, text[], boolean, jsonb) is
  'GRID-TAILS: the unresolved half of a record''s provenance (a relation whose target was gone when it moved), over the columns a reader may see, for the read doors. Internal.';

CREATE OR REPLACE FUNCTION custom.read_records_matching(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_limit    integer;
  v_sql      text;
  v_gone     jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, FIRST, AND IN THIS DOOR'S OWN BODY. `custom.record_aggregate` —
  -- the door that COUNTS the number this one opens — asks exactly this on its first line, and
  -- its twin asking less would mean a number and its rows were judged by two different sets of
  -- questions. It also answers the store's own switch: a caller reaching a closed store is
  -- refused before a Table id is even looked at.
  --
  -- 🚨 AND IT IS WHAT MAKES THE ROW DECISION READABLE FROM THIS BODY (check:store-doors-decide,
  -- 2026-09-22). This door decides every row through `custom.visible_predicate_sql`, which asks
  -- `custom.visible_set` — the one ladder — and writes its four arms into this door's own WHERE.
  -- That is a real decision, but it happens through a helper and inside a generated statement,
  -- so a census reading this body found no ladder call in it and said so. A door whose access
  -- decision cannot be READ off it is one refactor away from a door that does not make one.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_matching');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_matching');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_matching', p_limit, 200);

  -- STEP 2, once per request: which fields this caller may see, at which level. The level
  -- used for the field question is the caller's level on the TABLE, so a page of a hundred
  -- records asks the field question once, not a hundred times.
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility, and the caller's question, in the SAME where clause.
  -- `custom.visible_predicate_sql` asks `custom.visible_set` once and writes out the same
  -- four arms `custom.read_records` branches on, as a predicate the planner can drive an
  -- index with. `custom.record_filter_sql` writes the caller's question the one way this
  -- database writes it. Neither the caller's keys nor the caller's values ever become SQL:
  -- a key is refused by shape (custom.agg_assert_key), a value is a quoted literal, and a
  -- moment in a window is cast to timestamptz in this transaction before the statement is
  -- built.
  v_sql := format($q$
    select r.id, custom.record_values_of(r) as doc, r.data -> '_sources' as src
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     order by r.created_at desc, r.id
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    --
    -- S2-PRIME FILTER-GROUPS: the question comes in either shape. A flat map is normalised as
    -- before; a Rule expression ({op, args}, ALL / ANY / NOT to any depth) is compiled by the
    -- same one fragment the aggregate and the board write, over this reader's visible columns.
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(p_filter) then p_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, p_table_id), p_filter) end),
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    -- GRID-TAILS: a relation to a record that no longer exists says so. `record_values_of`
    -- strips `_sources` (provenance is not a value), and with it went the one fact the grid
    -- needs: WHICH cell moved empty because what it pointed at was gone. Only that fact comes
    -- back, only for columns this reader may see, keyed the way the document is keyed.
    v_gone := custom.unresolved_sources_of(v_rec.src, v_visible, p_by_id, v_key_ids);
    if v_gone is not null then
      document := document || jsonb_build_object('_sources', v_gone);
    end if;
    level := v_level;
    return next;
  end loop;
end;
$function$;
