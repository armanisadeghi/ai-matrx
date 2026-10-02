-- chair-step: puts back the integration_w15 per-row Dimension predicate in the three list RPC bodies (agx, cvx, wfx _list_scoped), restores platform.list_dimension_match's own EXISTS body and drops platform.list_dimension_ids. Only the Dimension line changes in each body; no data is touched.
-- lane: INTEGRATION
--
-- Inverse of migrations/campaign/integration_w15b_the_dimension_filter_reads_its_links_once.sql.

do $unpatch$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'agent'),
      ('public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'conversation'),
      ('public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'workflow')
    ) v(fn, token)
  loop
    execute replace(
      pg_get_functiondef(r.fn),
      format('AND (NOT v_f ? ''__dimension'' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, %L)), ''{}'')))', r.token),
      format('AND platform.list_dimension_match(v_f, %L, j.id)', r.token)
    );
  end loop;
end
$unpatch$;

create or replace function platform.list_dimension_match(p_filters jsonb, p_entity_type text, p_entity_id uuid)
returns boolean language sql stable as $fn$
  select not coalesce(p_filters ? '__dimension', false)
      or exists (
        select 1 from platform.associations a
        where a.source_type = p_entity_type and a.source_id = p_entity_id
          and a.target_type = 'scope' and a.deleted_at is null
          and a.target_id::text in (
            select jsonb_array_elements_text(coalesce(p_filters -> '__dimension' -> 'values', '[]'::jsonb))
          )
      )
$fn$;

drop function if exists platform.list_dimension_ids(jsonb, text);
