-- chair-step: lane HR-SCHEMA-OPEN. ALTER ROLE authenticator rewrites pgrst.db_schemas with the single name hr removed and every other schema kept; the performance review pages fall back to "not reachable yet".
do $x$
declare v_cur text; v_new text;
begin
  select substring(c from 'pgrst.db_schemas=(.*)$') into v_cur
    from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is null then raise exception 'no pgrst.db_schemas setting'; end if;
  select string_agg(s, ',' order by o) into v_new
    from unnest(string_to_array(replace(v_cur, ' ', ''), ',')) with ordinality u(s, o) where s <> 'hr';
  if v_new is distinct from replace(v_cur, ' ', '') then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_new);
  end if;
end $x$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
