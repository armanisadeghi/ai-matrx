-- lane: access-ladder T-35j — real-dollar prices and serving infrastructure are read only in the admin apps.
--
-- Owner ruling (via the access-ladder coordinator, 2026-09-28; Arman 2026-09-27: "users see credits only;
-- system admins toggle to $"): ai.offering.pricing (real dollars) and ai.endpoint.base_url (our serving
-- infrastructure) join ai.endpoint's credential pointers as client-excluded columns (declared in the
-- registry and regenerated table by table, outside this file). The admin screens read and write every
-- excluded column through four admin-lane doors, which replace T-35c's two endpoint doors. The model
-- picker keeps showing prices in credits: ai.model_public now runs with its owner's rights, like its
-- sibling ai.model_offering already does, so it can turn the excluded dollar column into points without
-- handing the column to the reader.
set local lock_timeout = '2s';

create or replace function ai.endpoint_admin_columns()
returns table (id uuid, byok_secret_key text, auth_ref jsonb, base_url text)
language plpgsql stable security definer
set search_path to 'pg_catalog'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only the admin apps can read an endpoint''s address and credential pointers. Open it from the AI models admin screen.'
      using errcode = '42501';
  end if;
  return query select e.id, e.byok_secret_key, e.auth_ref, e.base_url from ai.endpoint e;
end $$;

create or replace function ai.set_endpoint_admin_columns(p_id uuid, p_values jsonb)
returns void
language plpgsql volatile security definer
set search_path to 'pg_catalog'
as $$
declare v_bad text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the admin apps can change an endpoint''s address or credential pointers. Open it from the AI models admin screen.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Name the endpoint you are changing.' using errcode = '22004';
  end if;
  select string_agg(k, ', ') into v_bad from jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) k
   where k not in ('byok_secret_key', 'auth_ref', 'base_url');
  if v_bad is not null then
    raise exception 'This door sets only byok_secret_key, auth_ref and base_url; it was also given %.', v_bad using errcode = '22023';
  end if;
  update ai.endpoint e
     set byok_secret_key = case when p_values ? 'byok_secret_key' then nullif(p_values->>'byok_secret_key', '') else e.byok_secret_key end,
         auth_ref        = case when p_values ? 'auth_ref' then coalesce(p_values->'auth_ref', '{}'::jsonb) else e.auth_ref end,
         base_url        = case when p_values ? 'base_url' then nullif(p_values->>'base_url', '') else e.base_url end,
         updated_by      = auth.uid()
   where e.id = p_id;
  if not found then
    raise exception 'That endpoint does not exist.' using errcode = 'P0002';
  end if;
end $$;

create or replace function ai.offering_admin_columns()
returns table (id uuid, pricing jsonb)
language plpgsql stable security definer
set search_path to 'pg_catalog'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Real-dollar prices are shown only in the admin apps; everyone else sees credits. Open the model from the AI models admin screen.'
      using errcode = '42501';
  end if;
  return query select o.id, o.pricing from ai.offering o;
end $$;

create or replace function ai.set_offering_admin_columns(p_id uuid, p_values jsonb)
returns void
language plpgsql volatile security definer
set search_path to 'pg_catalog'
as $$
declare v_bad text;
begin
  if not public.is_platform_admin() then
    raise exception 'Real-dollar prices are changed only in the admin apps. Open the model from the AI models admin screen.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Name the offering you are changing.' using errcode = '22004';
  end if;
  select string_agg(k, ', ') into v_bad from jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) k
   where k not in ('pricing');
  if v_bad is not null then
    raise exception 'This door sets only pricing; it was also given %.', v_bad using errcode = '22023';
  end if;
  update ai.offering o
     set pricing = case when p_values ? 'pricing' then coalesce(p_values->'pricing', '[]'::jsonb) else o.pricing end,
         updated_by = auth.uid()
   where o.id = p_id;
  if not found then
    raise exception 'That offering does not exist.' using errcode = 'P0002';
  end if;
end $$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, gate_predicate, signed_in_callers)
values
  ('ai', 'endpoint_admin_columns', '', '{}'::oid[], 'access-ladder T-35j',
   'Admin-app read of ai.endpoint''s client-excluded columns (base_url, byok_secret_key, auth_ref). Refuses unless public.is_platform_admin() (the admin lane).',
   'public.is_platform_admin()', true),
  ('ai', 'set_endpoint_admin_columns', 'p_id uuid, p_values jsonb', '{2950,3802}'::oid[], 'access-ladder T-35j',
   'Admin-app write of ai.endpoint''s client-excluded columns; p_values may name only base_url, byok_secret_key, auth_ref. Refuses unless public.is_platform_admin().',
   'public.is_platform_admin()', true),
  ('ai', 'offering_admin_columns', '', '{}'::oid[], 'access-ladder T-35j',
   'Admin-app read of ai.offering.pricing (real dollars; users see credits). Refuses unless public.is_platform_admin().',
   'public.is_platform_admin()', true),
  ('ai', 'set_offering_admin_columns', 'p_id uuid, p_values jsonb', '{2950,3802}'::oid[], 'access-ladder T-35j',
   'Admin-app write of ai.offering.pricing; p_values may name only pricing. Refuses unless public.is_platform_admin().',
   'public.is_platform_admin()', true);

grant execute on function ai.endpoint_admin_columns() to authenticated;
grant execute on function ai.set_endpoint_admin_columns(uuid, jsonb) to authenticated;
grant execute on function ai.offering_admin_columns() to authenticated;
grant execute on function ai.set_offering_admin_columns(uuid, jsonb) to authenticated;

alter view ai.model_public set (security_invoker = false);
