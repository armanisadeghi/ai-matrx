-- Organization secret vault
--
-- Secret values live only in Supabase Vault.  Application tables hold
-- metadata, access policy, copy lineage, and a value-version counter.  This
-- schema is deliberately not exposed through PostgREST; authenticated clients
-- have no table privileges and the trusted Python service is the only caller
-- of the SECURITY DEFINER command/query functions below.

create schema if not exists private_vault;
revoke all on schema private_vault from public, anon, authenticated;

alter table users.user_secrets
  add column if not exists value_version integer not null default 1;

comment on column users.user_secrets.value_version is
  'Monotonic value-only version used to detect whether an organization copy is out of sync.';

create or replace function private_vault.bump_user_secret_value_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.value_encrypted is distinct from old.value_encrypted then
    new.value_version := old.value_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists user_secrets_value_version on users.user_secrets;
create trigger user_secrets_value_version
before update on users.user_secrets
for each row execute function private_vault.bump_user_secret_value_version();

create table if not exists private_vault.organization_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
  vault_secret_id uuid references vault.secrets(id) on delete restrict,
  value_hint text not null default '',
  description text,
  category text,
  access_mode text not null default 'all_members'
    check (access_mode in ('all_members', 'restricted')),
  inject_into_sandbox boolean not null default true,
  is_active boolean not null default true,
  value_version integer not null default 1 check (value_version > 0),
  source_user_secret_id uuid references users.user_secrets(id) on delete set null,
  source_user_secret_version integer,
  last_used_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organization_secrets_live_value check (
    (deleted_at is null and vault_secret_id is not null)
    or deleted_at is not null
  ),
  constraint organization_secrets_source_version check (
    source_user_secret_id is not null or source_user_secret_version is null
  )
);

create unique index if not exists organization_secrets_unique_active_key
  on private_vault.organization_secrets (organization_id, key)
  where deleted_at is null;
create index if not exists organization_secrets_org_active
  on private_vault.organization_secrets (organization_id, key)
  where deleted_at is null and is_active;
create index if not exists organization_secrets_source
  on private_vault.organization_secrets (source_user_secret_id)
  where deleted_at is null and source_user_secret_id is not null;

create table if not exists private_vault.organization_secret_grants (
  id uuid primary key default gen_random_uuid(),
  organization_secret_id uuid not null
    references private_vault.organization_secrets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_use boolean not null default true,
  can_manage boolean not null default false,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_secret_id, user_id)
);

create index if not exists organization_secret_grants_user
  on private_vault.organization_secret_grants (user_id, organization_secret_id)
  where can_use;

create table if not exists private_vault.organization_secret_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  organization_secret_id uuid,
  actor_id uuid not null references auth.users(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_secret_audit_org_created
  on private_vault.organization_secret_audit (organization_id, created_at desc);
create index if not exists organization_secret_audit_secret_created
  on private_vault.organization_secret_audit (organization_secret_id, created_at desc);

alter table private_vault.organization_secrets enable row level security;
alter table private_vault.organization_secret_grants enable row level security;
alter table private_vault.organization_secret_audit enable row level security;

revoke all on all tables in schema private_vault from public, anon, authenticated;
revoke all on all sequences in schema private_vault from public, anon, authenticated;

comment on schema private_vault is
  'Unexposed organization secret metadata, ACL, audit, and trusted service functions.';
comment on table private_vault.organization_secrets is
  'Organization-scoped secret metadata. Plaintext is stored only in vault.secrets.';
comment on column private_vault.organization_secrets.access_mode is
  'all_members is the rollout-safe default. restricted requires an explicit per-user can_use grant; org admins retain break-glass use/manage access.';
comment on column private_vault.organization_secrets.source_user_secret_id is
  'Optional copy lineage to a user-owned secret. This is not a live binding; source_user_secret_version records the last manual copy/sync.';

create or replace function private_vault.assert_org_member(
  p_actor_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not iam.has_org_access_for(p_actor_id, p_organization_id) then
    raise exception 'organization membership required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private_vault.assert_org_admin(
  p_actor_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not public.is_org_admin_for(p_actor_id, p_organization_id) then
    raise exception 'organization admin required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private_vault.mask_secret(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when length(p_value) = 0 then ''
    when length(p_value) >= 9 then left(p_value, 4) || '…' || right(p_value, 4)
    else left(p_value, greatest(1, least(2, length(p_value) / 2))) || '…' ||
         right(p_value, greatest(1, least(2, length(p_value) / 2)))
  end
$$;

create or replace function private_vault.organization_secret_list(
  p_actor_id uuid,
  p_organization_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  key text,
  value_hint text,
  description text,
  category text,
  access_mode text,
  inject_into_sandbox boolean,
  is_active boolean,
  value_version integer,
  source_user_secret_id uuid,
  source_user_secret_version integer,
  source_current_version integer,
  sync_status text,
  can_manage boolean,
  grant_user_ids uuid[],
  last_used_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private_vault.assert_org_member(p_actor_id, p_organization_id);
  return query
  select
    s.id,
    s.organization_id,
    s.key,
    s.value_hint,
    s.description,
    s.category,
    s.access_mode,
    s.inject_into_sandbox,
    s.is_active,
    s.value_version,
    s.source_user_secret_id,
    s.source_user_secret_version,
    us.value_version as source_current_version,
    case
      when s.source_user_secret_id is null then 'not_linked'
      when us.id is null or us.deleted_at is not null then 'source_deleted'
      when us.value_version = s.source_user_secret_version then 'current'
      else 'out_of_sync'
    end as sync_status,
    public.is_org_admin_for(p_actor_id, p_organization_id) as can_manage,
    coalesce(g.user_ids, '{}'::uuid[]) as grant_user_ids,
    s.last_used_at,
    s.created_by,
    s.updated_by,
    s.created_at,
    s.updated_at
  from private_vault.organization_secrets s
  left join users.user_secrets us on us.id = s.source_user_secret_id
  left join lateral (
    select array_agg(sg.user_id order by sg.user_id) as user_ids
    from private_vault.organization_secret_grants sg
    where sg.organization_secret_id = s.id and sg.can_use
  ) g on true
  where s.organization_id = p_organization_id
    and s.deleted_at is null
  order by s.key;
end;
$$;

create or replace function private_vault.organization_secret_create(
  p_actor_id uuid,
  p_organization_id uuid,
  p_key text,
  p_value text,
  p_description text default null,
  p_category text default null,
  p_inject_into_sandbox boolean default true,
  p_source_user_secret_id uuid default null,
  p_source_user_secret_version integer default null,
  p_allow_member_contribution boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_vault_id uuid;
begin
  if p_allow_member_contribution then
    perform private_vault.assert_org_member(p_actor_id, p_organization_id);
    if p_source_user_secret_id is null or not exists (
      select 1 from users.user_secrets us
      where us.id = p_source_user_secret_id
        and us.user_id = p_actor_id
        and us.deleted_at is null
        and us.is_active
        and us.value_version = p_source_user_secret_version
    ) then
      raise exception 'active source user secret owned by actor is required'
        using errcode = '42501';
    end if;
  else
    perform private_vault.assert_org_admin(p_actor_id, p_organization_id);
  end if;

  if p_key is null or p_key !~ '^[A-Za-z_][A-Za-z0-9_]*$' then
    raise exception 'invalid secret key' using errcode = '22023';
  end if;
  if p_value is null then
    raise exception 'secret value is required' using errcode = '22004';
  end if;

  v_vault_id := vault.create_secret(
    p_value,
    'org:' || p_organization_id::text || ':' || v_id::text,
    coalesce(p_description, p_key)
  );

  begin
    insert into private_vault.organization_secrets (
      id, organization_id, key, vault_secret_id, value_hint, description,
      category, inject_into_sandbox, source_user_secret_id,
      source_user_secret_version, created_by, updated_by
    ) values (
      v_id, p_organization_id, p_key, v_vault_id,
      private_vault.mask_secret(p_value), p_description, p_category,
      p_inject_into_sandbox, p_source_user_secret_id,
      p_source_user_secret_version, p_actor_id, p_actor_id
    );
  exception when others then
    delete from vault.secrets where id = v_vault_id;
    raise;
  end;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    p_organization_id, v_id, p_actor_id,
    case when p_source_user_secret_id is null then 'created' else 'contributed' end,
    jsonb_build_object('key', p_key, 'access_mode', 'all_members')
  );
  return v_id;
end;
$$;

create or replace function private_vault.organization_secret_update(
  p_actor_id uuid,
  p_secret_id uuid,
  p_value text default null,
  p_description text default null,
  p_category text default null,
  p_inject_into_sandbox boolean default null,
  p_is_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret private_vault.organization_secrets%rowtype;
begin
  select * into v_secret
  from private_vault.organization_secrets
  where id = p_secret_id and deleted_at is null
  for update;
  if not found then
    raise exception 'organization secret not found' using errcode = 'P0002';
  end if;
  perform private_vault.assert_org_admin(p_actor_id, v_secret.organization_id);

  if p_value is not null then
    perform vault.update_secret(v_secret.vault_secret_id, p_value);
  end if;

  update private_vault.organization_secrets
  set value_hint = case when p_value is null then value_hint else private_vault.mask_secret(p_value) end,
      description = coalesce(p_description, description),
      category = coalesce(p_category, category),
      inject_into_sandbox = coalesce(p_inject_into_sandbox, inject_into_sandbox),
      is_active = coalesce(p_is_active, is_active),
      value_version = value_version + case when p_value is null then 0 else 1 end,
      source_user_secret_id = case when p_value is null then source_user_secret_id else null end,
      source_user_secret_version = case when p_value is null then source_user_secret_version else null end,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_secret_id;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    v_secret.organization_id, p_secret_id, p_actor_id, 'updated',
    jsonb_build_object('value_rotated', p_value is not null)
  );
end;
$$;

create or replace function private_vault.organization_secret_sync_from_user(
  p_actor_id uuid,
  p_secret_id uuid,
  p_source_user_secret_id uuid,
  p_source_user_secret_version integer,
  p_value text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret private_vault.organization_secrets%rowtype;
begin
  select * into v_secret
  from private_vault.organization_secrets
  where id = p_secret_id and deleted_at is null
  for update;
  if not found then
    raise exception 'organization secret not found' using errcode = 'P0002';
  end if;
  if v_secret.source_user_secret_id is distinct from p_source_user_secret_id then
    raise exception 'source lineage mismatch' using errcode = '22023';
  end if;
  if not public.is_org_admin_for(p_actor_id, v_secret.organization_id)
     and not exists (
       select 1 from users.user_secrets us
       where us.id = p_source_user_secret_id
         and us.user_id = p_actor_id
         and us.deleted_at is null
         and us.is_active
     ) then
    raise exception 'source owner or organization admin required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from users.user_secrets us
    where us.id = p_source_user_secret_id
      and us.deleted_at is null
      and us.is_active
      and us.value_version = p_source_user_secret_version
  ) then
    raise exception 'source secret changed during sync; retry' using errcode = '40001';
  end if;

  perform vault.update_secret(v_secret.vault_secret_id, p_value);
  update private_vault.organization_secrets
  set value_hint = private_vault.mask_secret(p_value),
      source_user_secret_version = p_source_user_secret_version,
      value_version = value_version + 1,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_secret_id;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    v_secret.organization_id, p_secret_id, p_actor_id, 'synced_from_user',
    jsonb_build_object('source_user_secret_id', p_source_user_secret_id,
                       'source_user_secret_version', p_source_user_secret_version)
  );
end;
$$;

create or replace function private_vault.organization_secret_set_grants(
  p_actor_id uuid,
  p_secret_id uuid,
  p_access_mode text,
  p_user_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret private_vault.organization_secrets%rowtype;
begin
  select * into v_secret
  from private_vault.organization_secrets
  where id = p_secret_id and deleted_at is null
  for update;
  if not found then
    raise exception 'organization secret not found' using errcode = 'P0002';
  end if;
  perform private_vault.assert_org_admin(p_actor_id, v_secret.organization_id);
  if p_access_mode not in ('all_members', 'restricted') then
    raise exception 'invalid access mode' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) uid
    where not iam.has_org_access_for(uid, v_secret.organization_id)
  ) then
    raise exception 'every grant recipient must be an active organization member'
      using errcode = '22023';
  end if;

  delete from private_vault.organization_secret_grants
  where organization_secret_id = p_secret_id;
  insert into private_vault.organization_secret_grants (
    organization_secret_id, user_id, granted_by
  )
  select p_secret_id, uid, p_actor_id
  from (select distinct unnest(coalesce(p_user_ids, '{}'::uuid[])) as uid) x;

  update private_vault.organization_secrets
  set access_mode = p_access_mode,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_secret_id;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    v_secret.organization_id, p_secret_id, p_actor_id, 'permissions_changed',
    jsonb_build_object('access_mode', p_access_mode,
                       'grant_count', cardinality(coalesce(p_user_ids, '{}'::uuid[])))
  );
end;
$$;

create or replace function private_vault.organization_secret_delete(
  p_actor_id uuid,
  p_secret_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret private_vault.organization_secrets%rowtype;
begin
  select * into v_secret
  from private_vault.organization_secrets
  where id = p_secret_id and deleted_at is null
  for update;
  if not found then
    raise exception 'organization secret not found' using errcode = 'P0002';
  end if;
  perform private_vault.assert_org_admin(p_actor_id, v_secret.organization_id);

  update private_vault.organization_secrets
  set deleted_at = now(), is_active = false, vault_secret_id = null,
      updated_by = p_actor_id, updated_at = now()
  where id = p_secret_id;
  delete from vault.secrets where id = v_secret.vault_secret_id;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    v_secret.organization_id, p_secret_id, p_actor_id, 'deleted',
    jsonb_build_object('key', v_secret.key)
  );
end;
$$;

create or replace function private_vault.resolve_organization_secrets(
  p_actor_id uuid,
  p_organization_id uuid,
  p_keys text[] default null,
  p_for_sandbox boolean default false
)
returns table (secret_id uuid, key text, value text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private_vault.assert_org_member(p_actor_id, p_organization_id);

  return query
  with allowed as (
    select s.id, s.key, ds.decrypted_secret
    from private_vault.organization_secrets s
    join vault.decrypted_secrets ds on ds.id = s.vault_secret_id
    where s.organization_id = p_organization_id
      and s.deleted_at is null
      and s.is_active
      and (not p_for_sandbox or s.inject_into_sandbox)
      and (p_keys is null or s.key = any(p_keys))
      and (
        s.access_mode = 'all_members'
        or public.is_org_admin_for(p_actor_id, p_organization_id)
        or exists (
          select 1 from private_vault.organization_secret_grants g
          where g.organization_secret_id = s.id
            and g.user_id = p_actor_id
            and g.can_use
        )
      )
  ), touched as (
    update private_vault.organization_secrets s
    set last_used_at = now()
    where s.id in (select a.id from allowed a)
    returning s.id
  )
  select a.id, a.key, a.decrypted_secret
  from allowed a;
end;
$$;

revoke all on all functions in schema private_vault from public, anon, authenticated;
grant usage on schema private_vault to service_role;
grant execute on function private_vault.organization_secret_list(uuid, uuid) to service_role;
grant execute on function private_vault.organization_secret_create(uuid, uuid, text, text, text, text, boolean, uuid, integer, boolean) to service_role;
grant execute on function private_vault.organization_secret_update(uuid, uuid, text, text, text, boolean, boolean) to service_role;
grant execute on function private_vault.organization_secret_sync_from_user(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function private_vault.organization_secret_set_grants(uuid, uuid, text, uuid[]) to service_role;
grant execute on function private_vault.organization_secret_delete(uuid, uuid) to service_role;
grant execute on function private_vault.resolve_organization_secrets(uuid, uuid, text[], boolean) to service_role;
