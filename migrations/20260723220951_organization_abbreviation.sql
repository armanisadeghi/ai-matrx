-- Canonical compact identity for organizations.
--
-- Rules:
--   * 2-3 uppercase ASCII letters; intentionally not unique.
--   * every personal organization is ME.
--   * shared/system organizations derive a deterministic initial value from
--     meaningful name words, then owners/admins may customize it.
--   * every insert path is protected by a trigger, including personal-org
--     provisioning and service-role callers.

begin;

alter table iam.organizations
  add column if not exists abbreviation text;

create or replace function iam.derive_organization_abbreviation(
  p_name text,
  p_is_personal boolean default false
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_word text;
  v_words text[] := '{}'::text[];
  v_result text := '';
begin
  if coalesce(p_is_personal, false) then
    return 'ME';
  end if;

  foreach v_word in array pg_catalog.regexp_split_to_array(
    pg_catalog.upper(coalesce(p_name, '')),
    '[^A-Z]+'
  )
  loop
    if v_word = ''
       or v_word = any (array[
         'A', 'AN', 'AND', 'AT', 'BY', 'FOR', 'OF', 'THE',
         'CO', 'COMPANY', 'CORP', 'CORPORATION', 'INC', 'INCORPORATED',
         'LLC', 'LLP', 'LTD', 'LIMITED', 'LP', 'PLC'
       ]::text[]) then
      continue;
    end if;
    v_words := pg_catalog.array_append(v_words, v_word);
  end loop;

  if coalesce(pg_catalog.array_length(v_words, 1), 0) = 0 then
    return 'ORG';
  end if;

  if pg_catalog.array_length(v_words, 1) = 1 then
    v_result := pg_catalog.left(v_words[1], 3);
  else
    for v_word in
      select word
      from pg_catalog.unnest(v_words) as word
    loop
      if pg_catalog.length(v_result) >= 3 then
        exit;
      end if;

      -- Preserve a short leading initialism: AI Matrx -> AIM.
      if v_result = '' and pg_catalog.length(v_word) = 2 then
        v_result := v_result || v_word;
      else
        v_result := v_result || pg_catalog.left(v_word, 1);
      end if;
    end loop;
  end if;

  if pg_catalog.length(v_result) < 2 then
    v_result := pg_catalog.rpad(v_result, 2, 'X');
  end if;

  return pg_catalog.left(v_result, 3);
end;
$function$;

create or replace function iam.normalize_organization_abbreviation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.is_personal, false) then
    new.abbreviation := 'ME';
  elsif new.abbreviation is null or pg_catalog.btrim(new.abbreviation) = '' then
    new.abbreviation := iam.derive_organization_abbreviation(
      new.name,
      new.is_personal
    );
  else
    new.abbreviation := pg_catalog.upper(pg_catalog.btrim(new.abbreviation));
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_organization_abbreviation
  on iam.organizations;

create trigger normalize_organization_abbreviation
before insert or update of abbreviation, is_personal
on iam.organizations
for each row
execute function iam.normalize_organization_abbreviation();

update iam.organizations
set abbreviation = iam.derive_organization_abbreviation(name, is_personal)
where abbreviation is null
   or abbreviation !~ '^[A-Z]{2,3}$'
   or (coalesce(is_personal, false) and abbreviation <> 'ME');

alter table iam.organizations
  alter column abbreviation set not null;

alter table iam.organizations
  drop constraint if exists organizations_abbreviation_format;

alter table iam.organizations
  add constraint organizations_abbreviation_format
  check (abbreviation ~ '^[A-Z]{2,3}$');

alter table iam.organizations
  drop constraint if exists organizations_personal_abbreviation;

alter table iam.organizations
  add constraint organizations_personal_abbreviation
  check (is_personal is not true or abbreviation = 'ME');

comment on column iam.organizations.abbreviation is
  'Compact 2-3 letter uppercase label. Personal organizations are always ME; values are intentionally not unique.';

-- Replace the sole team-organization creation RPC in place. The new trailing
-- argument has a default so already-deployed clients remain compatible.
drop function if exists public.org_create(
  text, text, text, text, uuid, text, jsonb, text
);
drop function if exists public.org_create(
  text, text, text, text, uuid, text, jsonb
);

create function public.org_create(
  p_name text,
  p_slug text,
  p_description text default null,
  p_logo_url text default null,
  p_logo_file_id uuid default null,
  p_website text default null,
  p_settings jsonb default '{}'::jsonb,
  p_abbreviation text default null
)
returns iam.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_name is null or pg_catalog.btrim(p_name) = '' then
    raise exception 'organization name is required' using errcode = '22023';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9\-]+$' then
    raise exception 'invalid organization slug' using errcode = '22023';
  end if;

  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    raise exception 'organization settings must be an object'
      using errcode = '22023';
  end if;

  if p_abbreviation is not null
     and pg_catalog.upper(pg_catalog.btrim(p_abbreviation))
       !~ '^[A-Z]{2,3}$' then
    raise exception 'organization abbreviation must be 2-3 letters'
      using errcode = '22023';
  end if;

  insert into iam.organizations (
    name,
    abbreviation,
    slug,
    description,
    logo_url,
    logo_file_id,
    website,
    created_by,
    is_personal,
    is_system,
    settings
  )
  values (
    pg_catalog.btrim(p_name),
    p_abbreviation,
    p_slug,
    p_description,
    p_logo_url,
    p_logo_file_id,
    p_website,
    v_uid,
    false,
    false,
    p_settings
  )
  returning * into v_org;

  insert into iam.memberships (
    organization_id,
    container_type,
    container_id,
    user_id,
    role,
    status,
    created_by,
    updated_by,
    metadata
  )
  values (
    v_org.id,
    'organization',
    v_org.id,
    v_uid,
    'owner',
    'active',
    v_uid,
    v_uid,
    '{}'::jsonb
  );

  return v_org;
end;
$function$;

revoke all on function public.org_create(
  text, text, text, text, uuid, text, jsonb, text
) from public, anon;
grant execute on function public.org_create(
  text, text, text, text, uuid, text, jsonb, text
) to authenticated;

revoke insert on table iam.organizations from public, anon, authenticated;

do $verification$
begin
  if exists (
    select 1
    from iam.organizations
    where abbreviation !~ '^[A-Z]{2,3}$'
       or (is_personal is true and abbreviation <> 'ME')
  ) then
    raise exception 'organization abbreviation backfill is incomplete';
  end if;

  if iam.derive_organization_abbreviation('All Green Recycling', false) <> 'AGR'
     or iam.derive_organization_abbreviation(
       'Pearlman Brown, and Wax, LLP',
       false
     ) <> 'PBW'
     or iam.derive_organization_abbreviation('Personal', true) <> 'ME' then
    raise exception 'organization abbreviation derivation is incorrect';
  end if;

  if has_table_privilege('authenticated', 'iam.organizations', 'insert')
     or has_table_privilege('anon', 'iam.organizations', 'insert') then
    raise exception 'direct organization insert remains executable';
  end if;

  if has_function_privilege(
       'anon',
       'public.org_create(text,text,text,text,uuid,text,jsonb,text)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.org_create(text,text,text,text,uuid,text,jsonb,text)',
       'execute'
     ) then
    raise exception 'org_create execute ACL is incorrect';
  end if;
end;
$verification$;

commit;
