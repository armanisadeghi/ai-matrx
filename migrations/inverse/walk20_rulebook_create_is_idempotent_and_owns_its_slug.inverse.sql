-- chair-step: walk 20 defect C inverse — puts `public.rulebook_create` back to the body
-- doorsonly5_rulebook_gets_its_doors.sql left (a slug collision escapes as 23505/HTTP 409, no
-- idempotency key, no `created`/`name_already_in_use` in the answer) and removes
-- platform.rulebook.client_token and its unique index. Running this while the shipped
-- `createDraftRulebook` is live puts the walk's defect straight back: the client no longer
-- retries a 409, so a duplicate name would reach the Expert as a refusal she cannot act on.
-- Revert the client in the same breath or do not run this.

drop index if exists platform.rulebook_client_token_unique;

alter table platform.rulebook
  drop column if exists client_token;

create or replace function public.rulebook_create(
  p_organization_id uuid,
  p_name text,
  p_slug text,
  p_description text default '',
  p_source jsonb default '{}'::jsonb,
  p_sections jsonb default '{}'::jsonb,
  p_visibility text default 'internal',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_vis platform.visibility;
  v_bad text;
begin
  if v_actor is null then
    raise exception 'rulebook_create: a Rulebook belongs to the person who started it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'rulebook_create: name the organization this Rulebook belongs to.' using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'rulebook_create: a Rulebook needs a name and a slug.' using errcode = '22004';
  end if;
  begin
    v_vis := coalesce(p_visibility, 'internal')::platform.visibility;
  exception when others then
    raise exception 'rulebook_create: % is not a sharing level. Use personal, internal, link or public.', p_visibility
      using errcode = '22023';
  end;

  if not (iam.has_org_access(p_organization_id)
          or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
              and public.is_super_admin())) then
    raise exception 'rulebook_create: % is not an organization you can start a Rulebook in.', p_organization_id
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'rulebook_create: metadata is an object.' using errcode = '22023';
  end if;
  select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(coalesce(p_metadata, '{}'::jsonb)) k
   where not (k = any (public._rulebook_client_metadata_keys()));
  if v_bad is not null then
    raise exception 'rulebook_create: metadata key(s) % are not written by a client. The client set is %.',
      v_bad, array_to_string(public._rulebook_client_metadata_keys(), ', ')
      using errcode = '42501';
  end if;

  insert into platform.rulebook
    (name, slug, description, source, sections, rules, status, organization_id, visibility,
     metadata, created_by)
  values
    (btrim(p_name), btrim(p_slug), coalesce(p_description, ''),
     coalesce(p_source, '{}'::jsonb), coalesce(p_sections, '{}'::jsonb), '[]'::jsonb,
     'draft', p_organization_id, v_vis, coalesce(p_metadata, '{}'::jsonb), v_actor)
  returning * into v_row;

  return public._rulebook_json(v_row);
end;
$fn$;
