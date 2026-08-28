-- hr_l3_109 — make the DB-wide definer grant guard's grandfather identities deterministic.
--
-- hr_l3_108 snapshotted pg_get_function_identity_arguments() under the migration session's
-- search_path, but its event trigger compares under `platform, pg_catalog`. User-defined argument
-- types therefore rendered differently (`permission_level` vs `public.permission_level`), so an
-- unrelated GRANT sweep could classify an existing policy helper as new and revoke client EXECUTE.
-- context.scopes then failed with 42501 because its RLS path could not execute iam.has_access.

set local search_path = platform, pg_catalog;

-- Record the canonical identity rendering used by platform.enforce_definer_client_grants().
-- ON CONFLICT preserves the original snapshot while adding only the alternate stable spelling.
insert into platform.definer_client_grant_grandfather
  (schema_name, function_name, identity_args)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where p.prosecdef
on conflict do nothing;

-- RLS policies execute this helper as the signed-in caller. This is not a PostgREST RPC door;
-- authenticated EXECUTE is the minimum privilege required for policy evaluation.
grant execute on function iam.has_access(text, uuid, public.permission_level) to authenticated;

do $verify$
begin
  if not has_function_privilege(
    'authenticated',
    'iam.has_access(text,uuid,public.permission_level)',
    'EXECUTE'
  ) then
    raise exception 'hr_l3_109: authenticated cannot execute iam.has_access after guard sweep';
  end if;

  if not exists (
    select 1
      from platform.definer_client_grant_grandfather g
     where g.schema_name = 'iam'
       and g.function_name = 'has_access'
       and g.identity_args = 'p_type text, p_id uuid, p_required public.permission_level'
  ) then
    raise exception 'hr_l3_109: canonical iam.has_access grandfather identity is missing';
  end if;
end
$verify$;
