-- Register `rulebook` as a Matrx Library entity type.
--
-- SoR: /Users/armanisadeghi/code/common-docs/systems/platform/library/STATE.md
--      § "Registering a third type — the whole recipe" (steps 1–5)
--      /Users/armanisadeghi/code/common-docs/systems/masterwork/RULEBOOK-SHARING.md
--
-- WHY: a Rulebook could only leave its tenant by naming individuals
-- (`iam.permissions` + share links, Part A). This puts it on the ONE spine so a
-- Rulebook can be GIVEN to an industry — or to everyone — the way the CA
-- Workers' Comp guides and the SEO starter packs already are.
--
-- THE SUBSCRIBE LAW for `rulebook` — Arman, 2026-08-23: **COPY.** Subscribing
-- writes the recipient org its OWN editable Rulebook, seeded from the Library's
-- and stamped with provenance, so the recipient can add rules, retire rules and
-- point Masterworks at it without ever writing into the Library's row (which a
-- viewer grant could never allow anyway — `rules` is ONE jsonb behind CAS).
-- Re-subscribing is ADDITIVE and IDEMPOTENT: rules the Library has added since
-- adoption land as new rules; a rule the recipient already has is never touched.
--
-- Idempotent. Applied via Supabase MCP against brsgrqvjdzwihsvnfqkf.

begin;

-- ---------------------------------------------------------------------------
-- Step 1 — the columns a Library Rulebook needs.
-- `rulebook` is already registered in platform.entity_types with the canonical
-- `entity` RLS variant, and public.user_can_read_via_library_grant is generic,
-- so the READ LANE already works. Nothing to move, nothing to re-certify.
-- ---------------------------------------------------------------------------

alter table platform.rulebook
  add column if not exists industry_id uuid references iam.industries(id),
  add column if not exists source_rulebook_id uuid references platform.rulebook(id),
  add column if not exists source_version integer,
  add column if not exists source_synced_at timestamptz;

comment on column platform.rulebook.industry_id is
  'The iam.industries node this Rulebook is authored FOR. Anchors the curator lane (public.is_rulebook_curator) and is the audience an admin publishes to. NULL for a Rulebook that is not industry-specific.';
comment on column platform.rulebook.source_rulebook_id is
  'Provenance of a Library COPY: the Matrx Library Rulebook this one was seeded from by public.library_subscribe. NULL for an original.';
comment on column platform.rulebook.source_version is
  'The source Rulebook''s `version` at the moment this copy was last synced — the left-hand side of the "the Library has updated this since you adopted it" diff (features/masterwork/rulebookDiff.ts).';
comment on column platform.rulebook.source_synced_at is
  'When this copy last took rules from its source.';

create index if not exists rulebook_source_rulebook_id_idx
  on platform.rulebook (source_rulebook_id) where source_rulebook_id is not null;
create index if not exists rulebook_industry_id_idx
  on platform.rulebook (industry_id) where industry_id is not null;

-- ---------------------------------------------------------------------------
-- Step 2a — the publish gate arm.
-- A Rulebook is fit to give an industry when it is ACTIVE (the Rulebook's
-- ratified state) and actually carries enforced rules — a gift of an empty
-- Rulebook is a gift of nothing. An ORGANIZATION audience is the PILOT lane and
-- accepts a draft, exactly as it accepts a `proposed` pack.
-- ---------------------------------------------------------------------------

create or replace function public._library_publish_gate(
  p_entity_type text, p_entity_id uuid, p_audience text)
returns void
language plpgsql
security definer
set search_path to 'public', 'seo', 'platform'
as $$
declare v_status text; v_enforced integer;
begin
  if p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'library: pack % not found', p_entity_id; end if;
    if p_audience in ('industry', 'global') and v_status <> 'ratified' then
      raise exception 'library: a pack must be ratified before it is published to an industry or everyone (status is %)', v_status
        using errcode = 'P0001';
    end if;
    if p_audience = 'organization' and v_status not in ('proposed', 'ratified') then
      raise exception 'library: only a proposed or ratified pack can be piloted with an organization (status is %)', v_status
        using errcode = 'P0001';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'library: rulebook % not found', p_entity_id; end if;
    if p_audience in ('industry', 'global') then
      if v_status <> 'active' then
        raise exception 'library: a Rulebook must be active before it is published to an industry or everyone (status is %)', v_status
          using errcode = 'P0001';
      end if;
      select count(*) into v_enforced
        from platform.rulebook rb, jsonb_array_elements(rb.rules) r
       where rb.id = p_entity_id
         and coalesce((r->>'draft')::boolean, false) is false
         and coalesce((r->>'retired')::boolean, false) is false;
      if coalesce(v_enforced, 0) = 0 then
        raise exception 'library: this Rulebook has no approved rules yet — there is nothing to give'
          using errcode = 'P0001';
      end if;
    elsif p_audience = 'organization' and v_status = 'archived' then
      raise exception 'library: an archived Rulebook cannot be piloted with an organization'
        using errcode = 'P0001';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Step 2b — the materializer (THE SUBSCRIBE LAW = COPY).
-- Additive and idempotent, and it never overwrites a rule the recipient already
-- has. Rules are matched on their citable `id`, which every consumer (audit
-- verdicts, rulebookDiff) already treats as the stable handle.
-- ---------------------------------------------------------------------------

create or replace function platform.materialize_library_rulebook(
  p_rulebook_id uuid, p_organization_id uuid, p_actor uuid, p_target jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'iam'
as $$
declare
  v_src   platform.rulebook;
  v_copy  platform.rulebook;
  v_slug  text;
  v_added jsonb;
  v_n_added integer := 0;
  v_attempt integer := 0;
begin
  select * into v_src from platform.rulebook where id = p_rulebook_id and deleted_at is null;
  if v_src.id is null then
    raise exception 'library: rulebook % not found', p_rulebook_id using errcode = 'P0001';
  end if;

  select * into v_copy
    from platform.rulebook
   where source_rulebook_id = p_rulebook_id
     and organization_id = p_organization_id
     and deleted_at is null
   order by created_at
   limit 1;

  if v_copy.id is null then
    -- `slug` is globally UNIQUE and a trashed row still holds its slug, so the
    -- copy claims a suffixed slug rather than colliding forever.
    v_slug := v_src.slug;
    while exists (select 1 from platform.rulebook where slug = v_slug) loop
      v_attempt := v_attempt + 1;
      if v_attempt > 20 then
        raise exception 'library: could not find a free slug for a copy of %', v_src.slug;
      end if;
      v_slug := left(v_src.slug, 200) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    end loop;

    insert into platform.rulebook(
      name, slug, description, source, sections, rules, version, status,
      organization_id, visibility, created_by, updated_by, metadata,
      industry_id, source_rulebook_id, source_version, source_synced_at)
    values (
      v_src.name, v_slug, v_src.description, v_src.source, v_src.sections, v_src.rules,
      1, case when v_src.status = 'archived' then 'draft' else v_src.status end,
      p_organization_id, 'internal'::platform.visibility, p_actor, p_actor,
      coalesce(v_src.metadata, '{}'::jsonb) || jsonb_build_object('adopted_from_library', true),
      v_src.industry_id, v_src.id, v_src.version, now())
    returning * into v_copy;

    return jsonb_build_object(
      'rulebook_id', v_copy.id, 'slug', v_copy.slug, 'created', true,
      'rules_added', jsonb_array_length(v_copy.rules), 'source_version', v_src.version);
  end if;

  -- Already adopted: take only the rules this copy does not have. Never modify,
  -- never remove — once adopted they are the recipient's own rulings.
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_added
    from jsonb_array_elements(v_src.rules) r
   where r->>'id' is not null
     and not exists (
       select 1 from jsonb_array_elements(v_copy.rules) c where c->>'id' = r->>'id');

  v_n_added := jsonb_array_length(v_added);

  update platform.rulebook
     set rules = case when v_n_added > 0 then rules || v_added else rules end,
         version = case when v_n_added > 0 then version + 1 else version end,
         updated_by = p_actor,
         source_version = v_src.version,
         source_synced_at = now()
   where id = v_copy.id
  returning * into v_copy;

  return jsonb_build_object(
    'rulebook_id', v_copy.id, 'slug', v_copy.slug, 'created', false,
    'rules_added', v_n_added, 'source_version', v_src.version);
end $$;

comment on function platform.materialize_library_rulebook(uuid, uuid, uuid, jsonb) is
  'THE SUBSCRIBE LAW for `rulebook` = COPY. Called only by public.library_subscribe. Additive + idempotent: first call writes the recipient org its own Rulebook seeded from the Library''s; later calls take only rules the copy does not already have, and never touch one it does.';

-- ---------------------------------------------------------------------------
-- Step 2c — the subscribe arm. Rewritten whole (the existing data_store and
-- seo_starter_pack behaviour is preserved verbatim).
-- ---------------------------------------------------------------------------

create or replace function public.library_subscribe(
  p_entity_type text, p_entity_id uuid, p_organization_id uuid default null,
  p_target jsonb default null, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'rag', 'iam', 'seo', 'web'
as $$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  -- A pack target names a site; the org is the site's (callers need not resolve it twice).
  if v_org is null and p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    select s.organization_id into v_org from web.site s where s.id = (p_target->>'site_id')::uuid and s.deleted_at is null;
  end if;
  if v_org is null then raise exception 'library: organization required' using errcode = '22023'; end if;
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = v_org and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', v_org using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;

  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, v_org);
    if not (public.is_admin()
            or v_via = 'organization'                                   -- pilot or prior subscription
            or (v_via in ('industry', 'global') and v_status = 'ratified')) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not (public.is_admin()
            or v_via = 'organization'                                   -- pilot or prior subscription
            or (v_via in ('industry', 'global') and v_status = 'active')) then
      raise exception 'library: organization % is not entitled to Rulebook % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = v_org
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', v_org, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      case when p_target ? 'rule_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'rule_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  perform public._library_audit(v_actor, 'self_subscribe', p_entity_type, p_entity_id, null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $$;

-- ---------------------------------------------------------------------------
-- Step 3 — the purge trigger. The referential integrity a generic `entity_id`
-- cannot carry.
-- ---------------------------------------------------------------------------

create or replace function platform.entity_grants_purge_rulebook()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from platform.entity_grants where entity_type = 'rulebook' and entity_id = old.id;
  return old;
end $$;

drop trigger if exists entity_grants_purge_rulebook on platform.rulebook;
create trigger entity_grants_purge_rulebook
  after delete on platform.rulebook
  for each row execute function platform.entity_grants_purge_rulebook();

-- ---------------------------------------------------------------------------
-- Step 4 — the curator lane. No new role: a normal account plus
-- iam.industry_curators, exactly as public.is_pack_curator does it. A curator
-- AUTHORS while the Library Rulebook is a draft; once it is active they read it
-- like anyone the grant reaches. Curators never publish (library_publish is
-- admin-only) and never create industries.
-- ---------------------------------------------------------------------------

create or replace function public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'platform', 'iam'
as $$
  select exists (
    select 1 from platform.rulebook rb
    join iam.industry_curators ic on ic.industry_id = rb.industry_id and ic.deleted_at is null
    where rb.id = p_rulebook_id and rb.deleted_at is null and ic.user_id = p_user);
$$;

comment on function public.is_rulebook_curator(uuid, uuid) is
  'Is this user a curator of the industry this Rulebook is authored for? The whole outside-expert role — see systems/platform/library/STATE.md step 4.';

grant execute on function public.is_rulebook_curator(uuid, uuid) to authenticated, anon, service_role;

commit;
