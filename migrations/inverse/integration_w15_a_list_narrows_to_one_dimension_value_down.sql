-- chair-step: removes the Dimension predicate line from the three list RPC bodies (agx, cvx, wfx _list_scoped) and drops platform.list_dimension_match. Each body loses exactly the one line integration_w15 added; nothing else changes; no data is touched.
-- lane: INTEGRATION
--
-- Inverse of migrations/campaign/integration_w15_a_list_narrows_to_one_dimension_value.sql.

do $unpatch$
declare
  r record;
  v_def text;
begin
  for r in
    select * from (values
      ('public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'agent'),
      ('public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'conversation'),
      ('public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer)'::regprocedure, 'workflow')
    ) v(fn, token)
  loop
    v_def := pg_get_functiondef(r.fn);
    execute replace(v_def, format(E'      AND platform.list_dimension_match(v_f, %L, j.id)\n', r.token), '');
  end loop;
end
$unpatch$;

drop function if exists platform.list_dimension_match(jsonb, text, uuid);
