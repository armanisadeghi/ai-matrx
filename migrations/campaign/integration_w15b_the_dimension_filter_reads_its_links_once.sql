-- lock: platform
-- lane: INTEGRATION
-- based-on: platform.list_dimension_match(jsonb, text, uuid) 09aeb1728aae173d863d156769e977cb17269984da531386e096f083599c4a33
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 47e4321c5fea7a64c31c1cfc8b67d443d14d94b8488dcafeb820eb937a6b1dfb
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 3e87358e39a787c6038c7246693d1e96ff34bedf548c8ff880acb85fb76536f8
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 9ade5e29ee874ed3cfa67fd9fc19c54d6db565fbb6f0bf58f1b7349dc926246d
--
-- LANE 3 INTEGRATION, W1.5 FOLLOW-UP — THE DIMENSION FILTER READS ITS LINKS ONCE, NOT ONCE PER ROW.
--
-- THE DEFECT (measured on the clone, 2026-10-02, as admin@admin.com, walking W1.5 in the browser):
-- /agents/all narrowed to one Dimension value took 10.2 s inside public.agx_list_scoped against 5.8 s
-- unnarrowed — past the 8 s statement timeout a signed-in caller gets, so the filtered list failed with
-- 57014. platform.list_dimension_match holds a sub-select, and Postgres never inlines a SQL function
-- whose body has one (inline_function refuses sublinks): it ran as its own statement for EVERY
-- candidate row (893 agents for admin), each a row-secured probe of platform.associations.
--
-- THE FIX: the link set is computed ONCE per list call.
--   platform.list_dimension_ids(p_filters, p_entity_type) → uuid[] — the ids of the rows linked to the
--   chosen Value(s); NULL when the bag carries no `__dimension`. 🚨 LANE 9's ONE switch point is now
--   THIS function's FROM/WHERE.
--   Each list RPC's predicate becomes
--     AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, '<token>')), '{}')))
--   — an uncorrelated scalar sub-select, which the planner evaluates once (an InitPlan) and each row
--   is an array probe (the coalesce makes it an array expression; a bare `ANY((SELECT …))` would be
--   read as `ANY (subquery)` and compare uuid to uuid[]). No `__dimension` → the first arm is true and nothing is read.
--   platform.list_dimension_match keeps its contract (one row, true/false) and now asks
--   list_dimension_ids, so there is one source of the link set.
-- Same rows, same row security (SECURITY INVOKER). The three bodies are patched in place from the
-- live definition (based-on hashes re-verified on production first); each must hold the integration_w15
-- line exactly twice or the file raises and nothing changes. No table, policy, trigger or grant changes.

create or replace function platform.list_dimension_ids(
  p_filters jsonb,
  p_entity_type text
) returns uuid[]
language sql
stable
as $fn$
  select case
    when not coalesce(p_filters ? '__dimension', false) then null
    else coalesce((
      select array_agg(distinct a.source_id)
      from platform.associations a
      where a.source_type = p_entity_type
        and a.target_type = 'scope'
        and a.deleted_at is null
        and a.target_id::text in (
          select jsonb_array_elements_text(coalesce(p_filters -> '__dimension' -> 'values', '[]'::jsonb))
        )
    ), '{}'::uuid[])
  end
$fn$;

comment on function platform.list_dimension_ids(jsonb, text) is
  'The list shell''s Dimension filter: ids of p_entity_type rows linked (live association edge, today target_type scope) to the Value(s) in p_filters.__dimension; NULL when there is none. Called once per list call. Lane 9 switches the source here, once.';

grant execute on function platform.list_dimension_ids(jsonb, text) to authenticated, service_role;

create or replace function platform.list_dimension_match(
  p_filters jsonb,
  p_entity_type text,
  p_entity_id uuid
) returns boolean
language sql
stable
as $fn$
  select not coalesce(p_filters ? '__dimension', false)
      or p_entity_id = any(platform.list_dimension_ids(p_filters, p_entity_type))
$fn$;

do $patch$
declare
  r record;
  v_def text;
  v_old text;
  v_hits int;
begin
  for r in
    select * from (values
      ('public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'agent'),
      ('public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'conversation'),
      ('public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'workflow')
    ) v(fn, token)
  loop
    v_def := pg_get_functiondef(r.fn);
    if position(format('ANY(coalesce((SELECT platform.list_dimension_ids(v_f, %L)), ''{}''))', r.token) in v_def) > 0 then
      continue;
    end if;
    -- The integration_w15 line; on the dev clone only, an earlier draft of this file left a
    -- `ANY((SELECT …))` form, which is replaced the same way.
    v_old := format('AND platform.list_dimension_match(v_f, %L, j.id)', r.token);
    if position(v_old in v_def) = 0 then
      v_old := format('AND (NOT v_f ? ''__dimension'' OR j.id = ANY((SELECT platform.list_dimension_ids(v_f, %L))))', r.token);
    end if;
    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_hits <> 2 then
      raise exception '%: expected the Dimension predicate twice, found %; nothing changed', r.fn, v_hits;
    end if;
    execute replace(
      v_def,
      v_old,
      format('AND (NOT v_f ? ''__dimension'' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, %L)), ''{}'')))', r.token)
    );
  end loop;
end
$patch$;
