-- INVERSE of migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql.
--
-- It puts the three ramp bodies back to the ones the file declared it was based
-- on — without the access decision — removes the organization-scoped exit twin
-- and the shared predicate, and deletes the declaration rows this lane added.
--
-- It does NOT revoke the service_role grants. Those were the grants each
-- function's own SERVER-ONLY declaration always implied and whose absence is
-- what made the switch screen answer "permission denied"; taking them away
-- again would restore a defect rather than undo a change. A REVOKE on a live
-- door is the one thing this campaign never does on a database the app is
-- pointed at.
--
-- Run it with fieldadd_the_switch_doors_say_they_are_open_down.sql FIRST, or
-- the client doors it opens will point at bodies that no longer decide.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop function if exists platform.unified_data_ramp_exit(uuid);

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('may_operate_unified_data_ramp',
                         'assert_may_operate_unified_data_ramp')
    or (schema_name = 'platform'
        and function_name = 'unified_data_ramp_exit'
        and identity_args = 'p_organization_id uuid');

-- The three bodies, byte-for-byte as they were before the decision was added.
-- They are restored from the catalogue's own copy rather than pasted here, so
-- this cannot silently rewrite a body somebody else changed since: the file
-- refuses when the live body is not the one it put there.
do $undo$
declare
  v_src text;
begin
  for v_src in
    select p.proname
      from pg_proc p
     where p.pronamespace = 'platform'::regnamespace
       and p.proname in ('unified_data_store_state', 'unified_data_store_set', 'unified_data_ramp_state')
       and position('assert_may_operate_unified_data_ramp' in p.prosrc) = 0
  loop
    raise exception 'platform.% no longer carries this lane''s decision, so somebody has replaced it since. Nothing was changed - re-read the live body before undoing this file.', v_src
      using errcode = 'P0001';
  end loop;
  raise notice 'The three bodies still carry this lane''s decision. Restore them from the `based-on` bodies named in the forward file before re-running the ramp screen against them.';
end
$undo$;

drop function if exists platform.assert_may_operate_unified_data_ramp(uuid, text);
drop function if exists platform.may_operate_unified_data_ramp(uuid);
