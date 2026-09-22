-- DEFAULT-ORG-3 inverse -- puts the two-argument public.creator_claim_handle back beside the
-- three-argument one.
--
-- 🚨 RUNNING THIS RE-BREAKS THE CREATOR DASHBOARD. Both signatures accept (text, text), so
-- every two-argument call answers 42725 "function creator_claim_handle(unknown, unknown) is
-- not unique". That is exactly the state this file's forward migration repaired. It exists
-- because an inverse must restore what was there, not because there is a reason to run it.

set local lock_timeout = '2s';

create or replace function public.creator_claim_handle(p_handle text, p_display_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'users'
as $function$
begin
  return public.creator_claim_handle(p_handle, p_display_name, null::uuid);
end;
$function$;

insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers)
values (
  'public', 'creator_claim_handle', 'p_handle text, p_display_name text',
  array['text'::regtype, 'text'::regtype]::oid[],
  'Restored by the DEFAULT-ORG-3 inverse. Delegates to the three-argument overload with no acting organization.',
  'migrations/inverse/dorg3_the_creator_handle_has_one_signature.inverse.sql',
  null, true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
