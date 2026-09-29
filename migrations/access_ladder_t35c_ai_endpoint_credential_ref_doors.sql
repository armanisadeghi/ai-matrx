-- lane: access-ladder T-35c — ai.endpoint's credential pointers leave the client table read.
--
-- ai.endpoint moved to the normal Organization shape (every member opens it), and its two credential
-- pointers — byok_secret_key (an environment-variable NAME, CHECK-enforced, never a key) and auth_ref
-- ({"env": NAME}) — are declared client-excluded, so no signed-in read of the table returns them.
-- The admin endpoints screen still shows and edits them: these two doors answer only inside the
-- admin apps (public.is_platform_admin() is the admin lane) and refuse everyone else in words.
set local lock_timeout = '2s';

create or replace function ai.endpoint_credential_refs()
returns table (id uuid, byok_secret_key text, auth_ref jsonb)
language plpgsql stable security definer
set search_path to 'pg_catalog'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the admin apps can read an endpoint''s credential pointers. Open the endpoint from the AI models admin screen.'
      using errcode = '42501';
  end if;
  return query select e.id, e.byok_secret_key, e.auth_ref from ai.endpoint e;
end $$;

create or replace function ai.set_endpoint_credential_refs(p_id uuid, p_byok_secret_key text, p_auth_ref jsonb)
returns void
language plpgsql volatile security definer
set search_path to 'pg_catalog'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the admin apps can change an endpoint''s credential pointers. Open the endpoint from the AI models admin screen.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Name the endpoint whose credential pointers you are setting.' using errcode = '22004';
  end if;
  update ai.endpoint e
     set byok_secret_key = nullif(p_byok_secret_key, ''),
         auth_ref = coalesce(p_auth_ref, '{}'::jsonb),
         updated_by = auth.uid()
   where e.id = p_id;
  if not found then
    raise exception 'That endpoint does not exist.' using errcode = 'P0002';
  end if;
end $$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, gate_predicate, signed_in_callers)
values
  ('ai', 'endpoint_credential_refs', '', '{}', 'access-ladder T-35c',
   'Admin-app read of ai.endpoint''s two client-excluded credential pointers (environment-variable names, never keys). Refuses unless public.is_platform_admin() (the admin lane).',
   'public.is_platform_admin()', true),
  ('ai', 'set_endpoint_credential_refs', 'p_id uuid, p_byok_secret_key text, p_auth_ref jsonb',
   '{2950,25,3802}'::oid[], 'access-ladder T-35c',
   'Admin-app write of ai.endpoint''s two client-excluded credential pointers. Refuses unless public.is_platform_admin(); byok_secret_key stays under the table''s env-name CHECK.',
   'public.is_platform_admin()', true);

grant execute on function ai.endpoint_credential_refs() to authenticated;
grant execute on function ai.set_endpoint_credential_refs(uuid, text, jsonb) to authenticated;
