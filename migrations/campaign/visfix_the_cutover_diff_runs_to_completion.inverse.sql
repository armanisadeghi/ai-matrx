-- chair-step: the inverse of visfix_the_cutover_diff_runs_to_completion.sql. It puts both bodies
--   back exactly as they were on the main database before that file ran — the per-container
--   CROSS JOIN LATERAL and the per-container warm loop — and with them T1's 30 s cancellation.
--   A CREATE OR REPLACE of a live body needs its `-- based-on:` line, which is what the two below
--   are; nothing else here is dropped, revoked or deleted.
-- based-on: custom.visibility_parity() 641cdaceabafd912b7795dfe7c594cde19bd48a3d58bba97b2bb1d13ca7b2996
-- based-on: custom.visibility_cache_rebuild() c4eff89b9c5faa3ad7a3422efb68cc95734f503eb3cf89bd28022d1c52523c36
--
-- VIS-FIX — THE INVERSE of `visfix_the_cutover_diff_runs_to_completion.sql`.

CREATE OR REPLACE FUNCTION custom.visibility_parity()
 RETURNS TABLE(side text, container_type text, container_id uuid, item_type text, item_id uuid, stored_level permission_level, derived_level permission_level, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with containers as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), derived as (
    select c.ct as container_type, c.ci as container_id, d.item_type, d.item_id, d.depth, d.max_level
    from containers c
    cross join lateral custom.derive_visibility(c.ct, c.ci) d
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null
  union all
  select 'level_differs', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, d.max_level, 'same pair, different level'
  from platform.reachability r
  join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.max_level is distinct from r.max_level
  union all
  select 'derived_only', d.container_type, d.container_id, d.item_type, d.item_id,
         null::public.permission_level, d.max_level,
         case when d.depth > 8 then 'beyond_stored_ceiling'
              else 'derived row the stored closure does not hold' end
  from derived d
  left join platform.reachability r
    on  r.container_type = d.container_type and r.container_id = d.container_id
    and r.item_type = d.item_type and r.item_id = d.item_id
  where r.item_id is null;
$function$
;

CREATE OR REPLACE FUNCTION custom.visibility_cache_rebuild()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec record;
  v_n integer := 0;
begin
  -- VIS-7: the stored form is droppable. Everything below is rebuilt from the associations alone.
  truncate custom.visibility_cache;
  for rec in
    select distinct e.container_type as ct, e.container_id as ci from custom.carrying_edges e
  loop
    v_n := v_n + custom.visibility_warm(rec.ct, rec.ci);
  end loop;
  return v_n;
end;
$function$
;
