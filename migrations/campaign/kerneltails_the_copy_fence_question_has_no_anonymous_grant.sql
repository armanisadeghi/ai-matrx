-- chair-step: lane KERNEL-TAILS (tail 4). Closing a class means removing the door: the anonymous EXECUTE grant on custom._older_table_copy_refusal(uuid) is removed, and its door row stops declaring a signed-out caller. The grant did nothing: role anon holds no USAGE on schema custom (it cannot name any function in it), and custom._context_copy_fence() — the only caller, a SECURITY INVOKER trigger — runs as whoever writes custom.record, which for a visitor's public form is the SECURITY DEFINER door's owner, never anon (SUITE-HEALTH-3 finding; measured on production: has_schema_privilege('anon','custom','USAGE') = false). It was the ONLY anon-executable non-trigger function in custom and the only anonymous_callers row for custom; both counts are now 0. The visitor path is unchanged: the fence still refuses the write and still says "this table" to anyone assert_client_may_open does not admit. Order matters: the door row is re-declared BEFORE the revoke, because platform_reopen_declared_doors re-grants a revoked declared door. No data write. Guards moved with it: aidream apps/shared/records real-doors.test.ts (no anon grant in custom at all, declared or not) and scripts/campaign-tests/wherelives_green.sql 0f (anon does NOT execute the fence question).
-- lane: KERNEL-TAILS
-- INVERSE: migrations/inverse/kerneltails_the_copy_fence_question_has_no_anonymous_grant_down.sql
set local lock_timeout = '30s';

update platform.client_callable_door
   set anonymous_callers = false,
       anonymous_purpose = null
 where schema_name = 'custom' and function_name = '_older_table_copy_refusal'
   and identity_argtypes = array['uuid'::regtype]::oid[];

revoke execute on function custom._older_table_copy_refusal(uuid) from anon;

do $g$
begin
  if has_function_privilege('anon', 'custom._older_table_copy_refusal(uuid)', 'execute') then
    raise exception 'kerneltails: anon still executes custom._older_table_copy_refusal(uuid) (a PUBLIC grant or a re-grant) — the door is not removed.';
  end if;
  if not has_function_privilege('authenticated', 'custom._older_table_copy_refusal(uuid)', 'execute')
     or not has_function_privilege('service_role', 'custom._older_table_copy_refusal(uuid)', 'execute') then
    raise exception 'kerneltails: a writer role lost the fence question — only anon was meant to.';
  end if;
  if exists (select 1 from platform.client_callable_door where schema_name = 'custom' and anonymous_callers) then
    raise exception 'kerneltails: schema custom still declares an anonymous door.';
  end if;
end $g$;
