-- chair-step: lane HR-SCHEMA-OPEN. ALTER ROLE authenticator rewrites the whole pgrst.db_schemas string; in effect it appends ONE schema name (hr) to the exposed list and removes none, exactly as esign_parity_05 did for esign and 0871 for media. No table, policy, grant or function changes; access stays decided by each relation's RLS (all certified) and by grants. anon gains no USAGE on hr.
-- lane: HR-SCHEMA-OPEN
--
-- hr_open_02 — THE hr SCHEMA IS REACHABLE BY A CLIENT (Wave X, PUBLIC-PLACEMENT.md §2.1, step 3).
--
-- The standard performance review system calls supabase.schema('hr').rpc('hr_review_*' / 'hr_goal_*')
-- and every page answered PGRST106 ("Performance reviews are not reachable yet").
--
-- Gate, measured 2026-10-10 before this file:
--   * every hr table granted to `authenticated` has RLS on and passes iam.verify_canonical
--     (hr.employee / hr.candidate after hr_open_01); every hr view is security_invoker;
--   * hr._recompute_queue and hr.notify_outsider_door_baseline hold no anon/authenticated grant
--     (doors-only; every reader/writer is a postgres-owned SECURITY DEFINER function);
--   * anon has no USAGE on hr and gets none here.
--
-- WHERE THE SETTING LIVES. The effective list is the in-database authenticator rolconfig; the
-- management API's /postgrest db_schema value is overridden by it (that value already named hr and
-- the schema was still refused). So the change is made where it takes effect, the precedent way.
-- Inverse: migrations/inverse/hr_open_02_the_hr_schema_is_reachable_by_a_client_down.sql

do $x$
declare v_cur text;
begin
  select substring(c from 'pgrst.db_schemas=(.*)$') into v_cur
    from pg_roles r, unnest(r.rolconfig) c where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%';
  if v_cur is null then
    raise exception 'hr_open_02: authenticator carries no pgrst.db_schemas setting; refusing to write a fresh list';
  end if;
  if not (string_to_array(replace(v_cur, ' ', ''), ',') @> array['hr']) then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_cur || ',hr');
  end if;
end $x$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
