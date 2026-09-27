-- LANE HANDOVER — AN OLDER LIST'S UPDATE NEVER TRIPS THE FINAL SWITCH'S GUARD.
--
-- THE REAL USE CASE: the owner of an organization still on the old system renames and then deletes
-- one of her picklists. From her seat (admin@admin.com, role authenticated), in a rolled-back
-- transaction:
--   A. renaming an older list she owns lands;
--   B. archiving it (deleted_at) lands.
-- (The guard's own refusal — restoring a no-owner list while the final switch is on — is
-- finalswitch_green.sql's; this file changes only who may reach the question.)
-- RUN IT: psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/handover_an_older_list_update_never_trips_the_final_switch_guard.sql
-- ITS RED: on the body before the campaign file, A fails 42501 (permission denied for function
-- _final_switch_is_on).

\set ON_ERROR_STOP on
\timing off
\set suite 'handover_an_older_list_update_never_trips_the_final_switch_guard.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
create temp table _one on commit drop as
  select l.id, l.user_id from workbench.udt_structured_lists l
    join auth.users u on u.id = l.user_id and u.email = 'admin@admin.com'
   where l.deleted_at is null order by l.created_at limit 1;
grant select on _one to authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_id uuid := (select id from _one);
begin
  if v_id is null then raise exception 'no live older list of admin@admin.com to rename'; end if;
  update workbench.udt_structured_lists set description = coalesce(description, '') || ' ' where id = v_id;
  raise notice 'A passed: an older list was renamed from the person''s seat';
  update workbench.udt_structured_lists set deleted_at = now() where id = v_id;
  raise notice 'B passed: an older list was archived from the person''s seat';
end $$;
rollback;
\echo 'GREEN'
