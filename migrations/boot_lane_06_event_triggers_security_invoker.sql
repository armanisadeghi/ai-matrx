-- Boot release repair, part 6 of 6.
--
-- These three event-trigger functions were SECURITY DEFINER, so on a restricted
-- role stack the trigger is skipped and the guard never runs. They must execute
-- as the caller. The proof refuses the file unless every component policy from
-- parts 2–5 has dropped created_by and none of these functions is still definer.

alter function platform._door_follows_its_function() security invoker;
alter function platform._reopen_declared_doors_after_revoke() security invoker;
alter function platform._provision_shape_guard() security invoker;

do $proof$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s:%s', schemaname, tablename, policyname), ', ')
    into v_bad
    from pg_policies
   where (schemaname, tablename) in (
     ('files', 'analysis_result'),
     ('rag', 'data_store_members'),
     ('workflow', 'trigger_event'),
     ('workflow', 'work_item')
   )
     and (coalesce(qual, '') ilike '%created_by%' or coalesce(with_check, '') ilike '%created_by%');
  if v_bad is not null then
    raise exception 'component policies still reference created_by: %', v_bad;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.proname in (
       '_door_follows_its_function',
       '_reopen_declared_doors_after_revoke',
       '_provision_shape_guard'
     )
     and p.prosecdef;
  if v_bad is not null then
    raise exception 'event-trigger functions remain SECURITY DEFINER: %', v_bad;
  end if;
end
$proof$;
