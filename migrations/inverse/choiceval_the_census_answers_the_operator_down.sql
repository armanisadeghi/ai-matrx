-- chair-step: the inverse of migrations/campaign/choiceval_the_census_answers_the_operator.sql.
--   It puts back the census body that counted only what `custom.query_principal()` could see —
--   which answers a confident `cells: 0` to the role that owns `custom.record`, because that role
--   has no session. Running this restores the silent zero, so it exists for the red twin.
--
-- 🚨 ONE OF THE TWO RUNS, AND IF BOTH RUN, THIS ONE FIRST (lane INVERSE-GUARD, 2026-09-21).
-- The census body below calls `custom.choice_key_of` and `custom.choice_field_map`, and the
-- sibling inverse `choiceval_a_choice_is_its_own_word_down.sql` takes both away — because it
-- inverts the whole choice-word lane that created them, while this file inverts only the
-- later census fix that landed on top of it. They invert in the reverse of the order they
-- landed: this file first, the choice-word teardown second, and that teardown takes
-- `custom.choice_census` with it, so after both have run nothing reaches a function that is
-- gone. The other order is the only one that breaks, and an inverse pair is never run in it.
-- ground-standing-ok: b

set lock_timeout = '45s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.choice_census(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
begin
  -- THE DECISION BEFORE THE FIRST READ, so a foreign organization id and an invented one answer
  -- identically and neither is told whether the Table exists.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.choice_census');
  perform custom.assert_store_door(p_organization_id, 'custom.choice_census');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.choice_census');
  end if;

  -- What every choice cell of this organization (or of one Table) is holding right now.
  -- `stored_key` is the contract; `stored_id` and `stored_label` are what a caller wrote before
  -- this lane; `unresolved` is a token that names no choice of that column at all and is the
  -- number a person should care about. The rows are bounded by what this caller may SEE:
  -- custom.query_visible_ids is the read door's own id set, so a census never counts a record
  -- its caller is refused.
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'table_id',        p_table_id,
    'cells',           count(*),
    'stored_key',      count(*) filter (where c.hit is not null and c.raw = c.hit),
    'stored_id',       count(*) filter (where c.hit is not null and c.raw <> c.hit
                                          and c.raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'stored_label',    count(*) filter (where c.hit is not null and c.raw <> c.hit
                                          and c.raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'unresolved',      count(*) filter (where c.hit is null),
    'at',              to_jsonb(now()))
    from (
      select r.id,
             f.key as fkey,
             e.raw,
             custom.choice_key_of(m.map -> f.key, e.raw) as hit
        from custom.record r
        cross join lateral (select custom.choice_field_map(p_organization_id, r.table_id) as map) m
        cross join lateral jsonb_each(m.map) f(key, val)
        cross join lateral (
          select x #>> '{}' as raw
            from jsonb_array_elements(
                   case when jsonb_typeof(r.data -> f.key) = 'array' then r.data -> f.key
                        when r.data -> f.key is null
                          or jsonb_typeof(r.data -> f.key) = 'null' then '[]'::jsonb
                        else jsonb_build_array(r.data -> f.key) end) x
           where jsonb_typeof(x) = 'string') e
       where r.organization_id = p_organization_id
         and (p_table_id is null or r.table_id = p_table_id)
         and r.deleted_at is null
         and r.table_id is not null
         and custom.has_visibility(custom.query_principal(), 'record', r.id,
                                   'viewer'::public.permission_level)) c
    into v_out;
  return v_out;
end;
$function$;
