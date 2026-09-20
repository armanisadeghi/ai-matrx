-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.choice_census(uuid, uuid) 9dd904ebf4b896ddfa5971e0aeb934d119ca5b41561f2e9f84c38c251d5f1c51
--
-- CHOICE-VALUE (3b of 4) - THE CENSUS ANSWERS THE OPERATOR TOO, AND SAYS SO.
--
-- MEASURED IMMEDIATELY AFTER FILE 3 LANDED, 2026-09-20 07:01Z: `custom.choice_census` returned
-- `cells: 0` for five organizations that between them hold eleven choice cells. The per-row
-- visibility filter it carries is RIGHT for a person - a census must never count a record its
-- caller is refused - but `custom.query_principal()` is null when the caller is the role that
-- owns `custom.record` (a migration, the conversion verb's own before-and-after, an operator at
-- a terminal), so every row failed the test and the answer was a confident zero.
--
-- A COUNT THAT READS ZERO BECAUSE THE CALLER HAS NO SESSION IS A LIE, not a safe default, and it
-- is the exact class this campaign calls "nothing fails silently". `custom.query_is_store_owner`
-- is the store's own name for that caller and is already how `custom.work_approval_request`
-- decides the same question. The person's arm is untouched: a signed-in caller still counts only
-- what `custom.has_visibility` says they may see.
--
-- THE INVERSE: migrations/inverse/choiceval_the_census_answers_the_operator_down.sql.

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
         and (custom.query_is_store_owner()
              or custom.has_visibility(custom.query_principal(), 'record', r.id,
                                       'viewer'::public.permission_level))) c
    into v_out;
  return v_out;
end;
$function$;
