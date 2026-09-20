-- chair-step: re-seeding users.user_preferences.default_organization_id at signup is the abort step for the 2026-09-19 ruling, not a pending half of the campaign; it re-opens the default-organization substitution class and runs only during an incident, named, with the chair awake
-- w1_org_signup_stops_writing_a_default_organization.inverse.sql
--
-- Restores the signup seeding of users.user_preferences.default_organization_id.
--
-- ⚠️ THIS REINSTATES A SUBSTITUTION THE 2026-09-19 RULING FORBIDS. It exists
-- because every non-additive step in this campaign carries its inverse, not
-- because running it is ever the right answer. Running it makes every new
-- account carry a platform-chosen "default organization" again, which is the
-- seed the readers grow back from.
--
-- It restores the body exactly as
-- `migrations/campaign/w1_org_one_organization_at_signup_and_never_the_last.sql`
-- left it, so the function returns to applied history rather than to some third
-- shape.

begin;

create or replace function iam.provision_signup_organization(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_email     text;
  v_meta      jsonb;
  v_org_id    uuid;
  v_org_name  text;
  v_base_slug text;
  v_slug      text;
  v_attempt   int := 0;
  v_hex       text;
  v_has_personal boolean;
begin
  if p_user_id is null then
    raise exception 'provision_signup_organization: p_user_id cannot be NULL';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'provision_signup_organization: user % does not exist', p_user_id;
  end if;

  select m.organization_id into v_org_id
    from iam.memberships m
   where m.user_id = p_user_id
     and m.container_type = 'organization'
     and m.status = 'active'
     and m.deleted_at is null
   order by m.created_at, m.organization_id
   limit 1;

  if v_org_id is null then
    select u.email, u.raw_user_meta_data into v_email, v_meta
      from auth.users u where u.id = p_user_id;
    v_hex := substring(replace(p_user_id::text, '-', ''), 1, 8);

    v_org_name := iam.auto_organization_name(v_meta, v_email);
    if v_org_name is null then
      v_org_name := 'Organization ' || v_hex;
      raise warning 'organization naming: user % has no name metadata and no email; named %. Ask the person to rename it in Settings > Organizations.',
        p_user_id, v_org_name;
    end if;

    v_base_slug := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
    if v_base_slug is null or length(v_base_slug) < 3 then
      v_base_slug := 'user-' || v_hex;
    end if;
    v_base_slug := trim(both '-' from
                     regexp_replace(
                       regexp_replace(lower(v_base_slug), '[^a-z0-9]', '-', 'g'),
                       '-+', '-', 'g'));
    if v_base_slug is null or v_base_slug = '' then
      v_base_slug := 'user-' || v_hex;
    end if;

    select exists (select 1 from pg_attribute a
                    where a.attrelid = 'iam.organizations'::regclass
                      and a.attname = 'is_personal' and not a.attisdropped)
      into v_has_personal;

    loop
      v_attempt := v_attempt + 1;
      if    v_attempt = 1   then v_slug := v_base_slug;
      elsif v_attempt <= 10 then v_slug := v_base_slug || '-' || v_attempt::text;
      else                       v_slug := v_base_slug || '-' || replace(p_user_id::text, '-', '');
      end if;
      begin
        if v_has_personal then
          raise notice 'organization provisioning: writing the retired iam.organizations.is_personal flag for user % because the column is still present. Remedy: REC-61 drops it (an attended step); these same bytes stop writing it the moment it is gone.',
            p_user_id;
          execute 'insert into iam.organizations (name, slug, created_by, is_personal) values ($1,$2,$3,true) returning id'
            into v_org_id using v_org_name, v_slug, p_user_id;
        else
          insert into iam.organizations (name, slug, created_by)
          values (v_org_name, v_slug, p_user_id)
          returning id into v_org_id;
        end if;
        exit;
      exception when unique_violation then
        select m.organization_id into v_org_id
          from iam.memberships m
         where m.user_id = p_user_id and m.container_type = 'organization'
           and m.status = 'active' and m.deleted_at is null
         order by m.created_at, m.organization_id limit 1;
        if v_org_id is not null then exit; end if;
        if v_attempt > 11 then raise; end if;
      end;
    end loop;
  end if;

  insert into iam.memberships
    (organization_id, container_type, container_id, user_id, role, status)
  values
    (v_org_id, 'organization', v_org_id, p_user_id, 'owner', 'active')
  on conflict (container_type, container_id, user_id) do nothing;

  -- REC-44 / Doctrine §5.2 item 3: "set at signup to the auto-created organization".
  insert into users.user_preferences (user_id, preferences, default_organization_id)
  values (p_user_id, '{}'::jsonb, v_org_id)
  on conflict (user_id) do update
    set default_organization_id = coalesce(users.user_preferences.default_organization_id,
                                           excluded.default_organization_id);

  return v_org_id;
end;
$fn$;

comment on function iam.provision_signup_organization(uuid) is
  'REC-42/43/44/45, Doctrine R10/R11/R12: the ONE organization every person gets at signup. Named by iam.auto_organization_name (R12''s fallback order, reused not re-implemented), owned by them, and written into their users.user_preferences.default_organization_id. Idempotent: a second call returns the organization they already have. Reads iam.memberships, never iam.organizations.is_personal — organizations are all equal (REC-42).';

commit;
