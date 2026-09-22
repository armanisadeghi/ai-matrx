-- SIGNUP-DOOR — THE RED TWIN. It asserts the DEFECT positively: the dormant second signup door
-- is open. It PASSES on a database where the inverse has run (the door is back) and FAILS on a
-- database where migrations/campaign/signupdoor_the_dormant_second_signup_door_is_closed_loudly.sql
-- has landed.
--
-- Same use case as the green twin: Brightwater Dental Partners' office manager signs up, and a
-- second, dormant provisioning path sits one CREATE TRIGGER away from giving her a second
-- personal organization her first one knows nothing about.
--
-- A red twin that merely fails to find the fix proves nothing. This one names the defect: the
-- body still calls ensure_personal_organization and still writes users.profiles, while NOTHING
-- runs it — attached to nothing, so no test, no screen and no monitor can see it.

\set suite 'signupdoor_red.sql'
\set requires 'function:public.handle_new_dm_user'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  v_def text;
  v_attached boolean;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_dm_user';
  if v_def is null then
    raise exception 'RED TWIN CANNOT RUN: public.handle_new_dm_user does not exist at all.';
  end if;

  select exists (
    select 1 from pg_trigger t
     where not t.tgisinternal
       and t.tgfoid = (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'handle_new_dm_user')
  ) into v_attached;

  if v_def ~* 'ensure_personal_organization'
     and v_def ~* 'insert\s+into\s+users\.profiles'
     and not v_attached
  then
    raise notice 'RED TWIN PASSED — the defect is present: public.handle_new_dm_user still creates a personal organization and writes users.profiles, and NO trigger runs it. One CREATE TRIGGER away from a second signup provisioning path.';
    return;
  end if;

  raise exception 'RED TWIN FAILED — the defect is NOT present. creates-org=%, writes-profiles=%, attached=%. The second signup door has been closed (this is what the green twin asserts).',
    v_def ~* 'ensure_personal_organization', v_def ~* 'insert\s+into\s+users\.profiles', v_attached;
end $$;

rollback;
