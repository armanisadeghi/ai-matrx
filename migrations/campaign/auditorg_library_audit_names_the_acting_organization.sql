-- lane: AUDIT-ORG
-- (no `-- target:` line: the same header the DOORS-ONLY files carry. This replaces function
--  bodies that are live today; it lands no new shared path behind a knob.)
-- additive: yes
-- chair-step: the ONLY non-additive-looking statements in this file are DELETE lines that live
--   INSIDE three function bodies being re-created verbatim -- `library_revoke` and
--   `library_unsubscribe` delete the grant row the caller asked to drop, and
--   `starter_pack_set_status` drops a de-ratified pack's industry/global audiences. They are
--   existing behaviour, unchanged by this file, and the file itself executes no DELETE at all:
--   it creates one function, replaces eleven bodies, and writes two rows in
--   platform.client_callable_door. The judge reads the bytes, cannot tell a function body from
--   a statement, and is right to refuse rather than guess -- so this step is named instead.
-- supersedes: migrations/campaign/doorsonly2_library_audit_names_the_kernel_organization.sql
-- supersedes-function: public._library_audit
--
-- AN AUDIT ROW'S ORGANIZATION IS THE ORGANIZATION THE ACTION WAS PERFORMED IN.
--
-- DOORS-ONLY-2 found the real defect -- `rag.library_audit_log.organization_id` is NOT NULL
-- with no default and no trigger, `public._library_audit` never named it, and so the audit
-- INSERT rolled back its caller's whole transaction and ten live doors were dead. That half
-- stands and is not re-litigated here.
--
-- Its ANSWER to "which organization?" is what this file replaces. It wrote
--   coalesce(iam.default_organization_id(p_actor), p_org)
-- which derives the row's tenant from a PERSON. The default-organization law (Arman,
-- 2026-09-19; `scripts/check-no-default-organization-sql.ts`) says a person has no default
-- organization: it is at most a per-client display preference, and nothing -- no read, no
-- write, no route, no trigger, no billing query, and no audit writer -- may let it decide
-- where work lands. `check:no-default-organization-sql` reported the line by name (rule 6),
-- and CI's ORGANIZATION CONTEXT job has been red on it.
--
-- THE CHAIR'S RULING, BUILT HERE: the organization an audit row belongs to is the
-- organization the door was CALLED WITH -- the acting organization context -- passed
-- explicitly by the caller, never derived from the actor. Where a door has both an acting
-- organization and a target organization (the organization being granted a library, or being
-- assigned an industry), the acting organization goes in `organization_id` -- the column
-- `rag.library_audit_log`'s own `std_select` policy reads, so it decides whose audit trail the
-- row appears in -- and the target goes in `target_organization_id`, which the table already
-- provides.
--
-- NOTHING IS BACKFILLED. The 44 rows written before today stand as history; rewriting them
-- would move somebody's audit trail after the fact, which is the very thing this file is
-- stopping. They are named in the BUILD-LOG instead.
--
-- THE SIGNATURE, AND WHY THE OLD ONE STAYS ALIVE AND LOUD.
-- The working writer is a NEW eight-argument overload that takes `p_acting_org` right beside
-- `p_actor`: an audit writer that cannot be called without being told where the action
-- happened. The seven-argument signature is NOT dropped -- a drop turns every stale caller
-- into `function does not exist`, which says nothing about what to do -- it is replaced by a
-- body that raises and names the replacement. Absent or honest, never dead.
--
-- THE TEN CALLERS, CENSUSED FROM THE LIVE CATALOGUE, and where each one's acting organization
-- comes from (`select ... from pg_proc where prosrc like '%public._library_audit(%'` -- ten,
-- not fourteen: `industry_upsert`, `industry_set_active`, `industry_curator_grant` and
-- `industry_curator_revoke` already write `rag.library_audit_log` directly, inheriting the
-- industry row's own organization, and are untouched here):
--   public.industry_assign_org      p_organization_id  -- the organization whose admin ladder it just checked
--   public.industry_unassign_org    p_organization_id  -- the same
--   public.library_publish          v_lib              -- the Matrx Library org the resource must belong to
--   public.library_revoke           v_lib              -- the same; the grant's org is the target
--   public.library_subscribe        v_org              -- the subscribing org, whose membership it just checked
--   public.library_unsubscribe      p_organization_id  -- the same
--   seo.starter_pack_from_proposal  v_lib              -- the pack is created in the Library org
--   seo.starter_pack_new_version    v_new.organization_id  -- the new pack row's own organization
--   seo.starter_pack_save           v_lib / v_row.organization_id  -- create arm / update arm
--   seo.starter_pack_set_status     v_row.organization_id  -- the pack row's own organization
-- Every one of them is an organization the door already resolved in order to make its OWN
-- access decision. Not one needs a person's preference to answer the question.
--
-- ADDITIVE: one new function overload, ten body replacements, one body replacement that turns
-- a wrong answer into a loud one, and door declarations. Nothing is dropped, renamed or
-- revoked; no client contract changes; no row is rewritten.
--
-- Inverse: migrations/inverse/auditorg_library_audit_names_the_acting_organization.inverse.sql
-- Proof:   scripts/campaign-tests/auditorg_acting_organization_green.sql (green)
--          scripts/campaign-tests/auditorg_acting_organization_red.sql   (red twin)
--
-- based-on: public._library_audit(uuid, text, text, uuid, uuid, uuid, jsonb) 1203eeae3145ef4d4341f5dc0925d1afa0fcadd1fe2b57dd98b7ed7dd08ca693
-- based-on: public.industry_assign_org(uuid, uuid, boolean, uuid) 9cb3002a5ad35c2edc779f1ab7ee330e404e6de0ed2debf3cab191c78d6e658c
-- based-on: public.industry_unassign_org(uuid, uuid, uuid) f0f5608221218b98a8dfe07332bddb23b8f3f29b0a066278b65d19e4da286f73
-- based-on: public.library_publish(text, uuid, text, uuid, uuid, uuid) 900cd50c5a074e1f4d6a0a4264bc3343d4f57d828a93be9cc1f0c3cd6cdde51f
-- based-on: public.library_revoke(uuid, uuid) 2b77d7a770ab64682a79a105d5a23212247939700bc743485dc5d2b78af43af2
-- based-on: public.library_subscribe(text, uuid, uuid, jsonb, uuid) 36f693ebb239bbc1d1cd8748a92dc673ca502833c989b66f93542cdcf231d689
-- based-on: public.library_unsubscribe(text, uuid, uuid, uuid) 8cb9f9b50fe4e4c7ed72fa0d420e13c539cad7ff6ae3c28ae6784032adac8baf
-- based-on: seo.starter_pack_from_proposal(jsonb, uuid, jsonb, uuid[]) 608e29ade9632a3f80d0b4b3f453c3a990c0f5c690d7c0760fbc271a28f806cd
-- based-on: seo.starter_pack_new_version(uuid, text) e473dcba2706bf242ee7035154e6576d3a26fcce585014c18d07e4e0e2a5b1fb
-- based-on: seo.starter_pack_save(jsonb) 75be5370bc4cbd4b7dcc84b21bc4e0e9ca3cf2868134b9c487697af98b792c79
-- based-on: seo.starter_pack_set_status(uuid, text, text) 37b5058028ae948ffc380c0f60bb8e85efce829989d130029532c3d3f18488fd

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 1. THE WRITER, WITH THE ACTING ORGANIZATION AS AN ARGUMENT.
-- ---------------------------------------------------------------------------
create or replace function public._library_audit(
  p_actor uuid, p_acting_org uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_industry_id uuid, p_target_org uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'rag'
as $function$
begin
  -- The acting organization is the organization the action was performed IN. The caller
  -- already resolved it to make its own access decision, so it is never re-derived here and
  -- never guessed: an audit writer that invents a tenant writes a row into somebody's trail
  -- who did nothing.
  if p_acting_org is null then
    raise exception 'library audit: action % was called without the organization it was performed in, so this audit row would land in nobody''s trail. Remedy: pass the organization the calling door already checked its caller against.',
      p_action
      using errcode = '23502';
  end if;

  insert into rag.library_audit_log(
    organization_id, actor_user_id, action, data_store_id,
    entity_type, entity_id, industry_id, target_organization_id, detail)
  values (
    p_acting_org, p_actor, p_action,
    case when p_entity_type = 'data_store' then p_entity_id end,
    p_entity_type, p_entity_id, p_industry_id, p_target_org,
    coalesce(p_detail, '{}'::jsonb));
end;
$function$;

comment on function public._library_audit(uuid, uuid, text, text, uuid, uuid, uuid, jsonb) is
  'AUDIT-ORG 2026-09-22: the shared audit writer behind the library/industry/seo doors. p_acting_org is the organization the action was PERFORMED IN -- the organization the calling door already resolved to make its own access decision -- and it is what rag.library_audit_log.organization_id holds, because that column is what the table''s std_select policy reads and therefore decides whose audit trail the row appears in. p_target_org is the organization acted UPON and goes to target_organization_id. Nothing here is derived from the actor: a person does not carry an organization, a call does.';

-- The seven-argument signature: replaced, not dropped. A dropped function tells a stale caller
-- only that it does not exist.
create or replace function public._library_audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_industry_id uuid, p_org uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'rag'
as $function$
begin
  raise exception 'library audit: this seven-argument writer derived the audit row''s organization from the actor, which is not an organization anybody named. Remedy: call public._library_audit(p_actor, p_acting_org, p_action, p_entity_type, p_entity_id, p_industry_id, p_target_org, p_detail) and pass the organization this door already checked its caller against. (actor %, action %, target %)',
    p_actor, p_action, p_org
    using errcode = '23502';
end;
$function$;

comment on function public._library_audit(uuid, text, text, uuid, uuid, uuid, jsonb) is
  'AUDIT-ORG 2026-09-22: RETIRED AND LOUD. This arity answered "which organization does this audit row belong to?" from the actor rather than from the call. It now raises 23502 naming the eight-argument writer and the argument to pass. It is kept rather than dropped so a stale caller is told what to do instead of being told a function is missing.';

-- ---------------------------------------------------------------------------
-- 2. THE TEN CALLERS. Each passes the organization it had already resolved.
-- ---------------------------------------------------------------------------

create or replace function public.industry_assign_org(p_organization_id uuid, p_industry_id uuid, p_is_primary boolean DEFAULT false, p_actor uuid DEFAULT NULL::uuid)
 returns iam.org_industries
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_actor uuid; v_row iam.org_industries;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not public.is_org_admin(p_organization_id) then
    raise exception 'not authorized: org admin or super admin required';
  end if;
  if p_is_primary then
    update iam.org_industries set is_primary = false
     where organization_id = p_organization_id and is_primary;
  end if;
  insert into iam.org_industries(organization_id, industry_id, is_primary, assigned_by)
  values (p_organization_id, p_industry_id, p_is_primary, v_actor)
  on conflict (organization_id, industry_id) do update set is_primary = excluded.is_primary
  returning * into v_row;
  -- Acting organization: the organization whose admin ladder this door just checked.
  perform public._library_audit(v_actor, p_organization_id, 'industry_assign', null, null,
                                p_industry_id, p_organization_id,
                                jsonb_build_object('is_primary', p_is_primary));
  return v_row;
end; $function$;

create or replace function public.industry_unassign_org(p_organization_id uuid, p_industry_id uuid, p_actor uuid DEFAULT NULL::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not public.is_org_admin(p_organization_id) then
    raise exception 'not authorized: org admin or super admin required';
  end if;
  delete from iam.org_industries
   where organization_id = p_organization_id and industry_id = p_industry_id;
  -- Acting organization: the organization whose admin ladder this door just checked.
  perform public._library_audit(v_actor, p_organization_id, 'industry_unassign', null, null,
                                p_industry_id, p_organization_id, '{}'::jsonb);
end; $function$;

create or replace function public.library_publish(p_entity_type text, p_entity_id uuid, p_audience text, p_industry_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid)
 returns platform.entity_grants
 language plpgsql
 security definer
 set search_path to 'public', 'platform', 'rag', 'iam'
as $function$
declare v_actor uuid; v_lib uuid; v_row platform.entity_grants;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  perform public._library_assert_admin(v_actor);
  v_lib := public.system_org_id('library');
  if v_lib is null then raise exception 'Matrx Library org not configured (system_orgs.key=''library'')'; end if;
  if public._library_entity_owner(p_entity_type, p_entity_id) <> v_lib then
    raise exception '% % is not a Matrx Library resource', p_entity_type, p_entity_id;
  end if;
  perform public._library_publish_gate(p_entity_type, p_entity_id, p_audience);
  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = p_audience
     and industry_id is not distinct from p_industry_id and organization_id is not distinct from p_organization_id
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, industry_id, organization_id, granted_by)
    values (p_entity_type, p_entity_id, p_audience, p_industry_id, p_organization_id, v_actor)
    returning * into v_row;
  end if;
  -- Acting organization: the Matrx Library org, which this door required the resource to
  -- belong to before it would publish it. p_organization_id is the org being granted it.
  perform public._library_audit(v_actor, v_lib, 'grant_publish', p_entity_type, p_entity_id,
                                p_industry_id, p_organization_id,
                                jsonb_build_object('audience', p_audience));
  return v_row;
end $function$;

create or replace function public.library_revoke(p_grant_id uuid, p_actor uuid DEFAULT NULL::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'platform', 'rag'
as $function$
declare v_actor uuid; v_row platform.entity_grants; v_lib uuid;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  perform public._library_assert_admin(v_actor);
  select * into v_row from platform.entity_grants where id = p_grant_id;
  if v_row.id is null then return; end if;
  delete from platform.entity_grants where id = p_grant_id;
  v_lib := public.system_org_id('library');
  -- Acting organization: the Matrx Library org, on whose behalf a library admin revokes.
  -- The grant's own organization is the one acted upon.
  perform public._library_audit(v_actor, v_lib, 'grant_revoke', v_row.entity_type, v_row.entity_id,
                                v_row.industry_id, v_row.organization_id,
                                jsonb_build_object('audience', v_row.audience));
end $function$;

create or replace function public.library_subscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_target jsonb DEFAULT NULL::jsonb, p_actor uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'platform', 'rag', 'iam', 'seo', 'web'
as $function$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
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
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'ratified'), false) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'active'), false) then
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
    -- KI-030: `rule_ids` is gone — a pack's meaning is items now, so `item_ids`
    -- selects every part including the dimension values.
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  -- Acting organization: the subscribing organization, whose membership this door just
  -- checked the caller against. It is also the organization acted upon.
  perform public._library_audit(v_actor, v_org, 'self_subscribe', p_entity_type, p_entity_id,
                                null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $function$;

create or replace function public.library_unsubscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid, p_actor uuid DEFAULT NULL::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'platform', 'rag', 'iam'
as $function$
declare v_actor uuid;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = p_organization_id and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', p_organization_id using errcode = '42501';
  end if;
  delete from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = p_organization_id;
  -- Acting organization: the organization whose membership this door just checked.
  perform public._library_audit(v_actor, p_organization_id, 'self_unsubscribe', p_entity_type,
                                p_entity_id, null, p_organization_id, '{}'::jsonb);
end $function$;

create or replace function seo.starter_pack_from_proposal(p_proposal jsonb, p_industry_id uuid DEFAULT NULL::uuid, p_source_corpus jsonb DEFAULT NULL::jsonb, p_source_site_ids uuid[] DEFAULT NULL::uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'seo', 'platform'
as $function$
declare v_pack seo.starter_pack; v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid(); v_slug text; r jsonb; v_n int := 0;
begin
  perform seo._pack_assert_creator(p_industry_id);
  if p_proposal->>'error' is not null and p_proposal->>'error' <> '' then
    raise exception 'seo_pack_proposal_error: %', p_proposal->>'error';
  end if;
  v_slug := coalesce(nullif(p_proposal->'pack'->>'slug',''), 'pack-' || left(gen_random_uuid()::text, 8));
  while exists (select 1 from seo.starter_pack where slug = v_slug) loop
    v_n := v_n + 1; v_slug := (p_proposal->'pack'->>'slug') || '-' || v_n::text;
  end loop;
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes, source_corpus,
                                proposal, status, organization_id, visibility, created_by, updated_by, metadata)
  values (v_slug, p_proposal->'pack'->>'name', p_proposal->>'industry', p_industry_id, p_proposal->'pack'->>'summary',
          p_proposal->'pack'->>'description', coalesce(nullif(p_proposal->'pack'->>'geo_model',''), 'national'),
          p_proposal->'pack'->>'guidelines', p_proposal->>'demand_reading', p_source_corpus, p_proposal, 'draft', v_lib, 'internal', v_uid, v_uid,
          jsonb_build_object('proposer_version', p_proposal->>'proposer_version', 'confidence', p_proposal->'confidence',
                             'open_questions', coalesce(p_proposal->'open_questions', '[]'::jsonb),
                             'source_site_ids', coalesce(to_jsonb(p_source_site_ids), '[]'::jsonb)))
  returning * into v_pack;
  -- The proposer agent still speaks `rules`. They land as template rows and are
  -- converted to meaning items in the same transaction, so nothing is ever
  -- STORED in the legacy shape.
  --
  -- KI-001: the agent now ALSO declares, per rule, whether the match is an
  -- identity (points) or a relative qualifier (a multiplier). That declaration
  -- rides on the rule's metadata so the converter obeys it instead of guessing
  -- from a word list.
  for r in select * from jsonb_array_elements(coalesce(p_proposal->'rules', '[]'::jsonb)) loop
    insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier,
                                        notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility, created_by, updated_by, metadata)
    values (r->>'name', r->>'description', nullif(r->>'pattern',''), nullif(r->>'match_kind',''), nullif(r->>'match_facet',''),
            nullif(r->>'match_facet_value',''), nullif(r->>'target_class',''), (r->>'value_multiplier')::numeric, r->>'rationale',
            v_pack.id, true, false, null, v_lib, 'internal', v_uid, v_uid,
            case when r->>'worth_effect' in ('add','scale') and (r->>'worth_amount') is not null
                 then jsonb_build_object('worth_effect', r->>'worth_effect',
                                         'worth_amount', (r->>'worth_amount')::numeric)
                 else '{}'::jsonb end);
  end loop;
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'value_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('min_score', (b->>'min_score')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'value_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('multiplier', (b->>'multiplier')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, label, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_area', a->>'label', coalesce(nullif(a->>'area_kind',''), 'city'), coalesce(a->'match_tokens', '[]'::jsonb),
         a->>'geo_band', ord, a->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_areas', '[]'::jsonb)) with ordinality as t(a, ord);
  perform seo._pack_convert_rules_to_meaning(v_pack.id);
  -- Acting organization: the Matrx Library org the pack itself is created in.
  perform public._library_audit(v_uid, v_lib, 'pack_from_proposal', 'seo_starter_pack', v_pack.id,
                                p_industry_id, null,
                                jsonb_build_object('slug', v_slug, 'proposer_version', p_proposal->>'proposer_version'));
  return to_jsonb(v_pack) - 'proposal';
end $function$;

create or replace function seo.starter_pack_new_version(p_pack_id uuid, p_slug text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'seo', 'platform'
as $function$
declare v_src seo.starter_pack; v_new seo.starter_pack; v_uid uuid := auth.uid(); v_slug text;
begin
  perform seo._pack_assert_author(p_pack_id);
  select * into v_src from seo.starter_pack where id = p_pack_id and deleted_at is null;
  v_slug := coalesce(nullif(p_slug,''), v_src.slug || '-v' || (v_src.pack_version + 1)::text);
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes,
                                source_corpus, status, organization_id, visibility, created_by, updated_by, metadata, supersedes_pack_id, pack_version)
  values (v_slug, v_src.name, v_src.industry, v_src.industry_id, v_src.summary, v_src.description, v_src.geo_model, v_src.guidelines,
          v_src.source_notes, v_src.source_corpus, 'draft', v_src.organization_id, 'internal', v_uid, v_uid,
          coalesce(v_src.metadata,'{}'::jsonb) - 'status_history', p_pack_id, 1)
  returning * into v_new;
  insert into seo.starter_pack_item (pack_id, item_kind, topic_id, weight, lead_quality, offering_match, value, label, description,
                                     config, area_kind, match_tokens, geo_band, sort, notes,
                                     dimension_slug, dimension_label, dimension_scope, worth_effect, worth_amount, matchers,
                                     organization_id, visibility, created_by, updated_by, metadata)
  select v_new.id, item_kind, topic_id, weight, lead_quality, offering_match, value, label, description, config, area_kind, match_tokens,
         geo_band, sort, notes, dimension_slug, dimension_label, dimension_scope, worth_effect, worth_amount, matchers,
         organization_id, 'internal', v_uid, v_uid, jsonb_build_object('cloned_from_item', id)
  from seo.starter_pack_item where pack_id = p_pack_id and deleted_at is null;
  -- Acting organization: the new pack row's own organization, inherited from the pack it
  -- versions.
  perform public._library_audit(v_uid, v_new.organization_id, 'pack_new_version', 'seo_starter_pack',
                                v_new.id, v_new.industry_id, null,
                                jsonb_build_object('supersedes', p_pack_id));
  return to_jsonb(v_new) - 'proposal';
end $function$;

create or replace function seo.starter_pack_save(p_pack jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'seo', 'iam', 'platform'
as $function$
declare v_id uuid := nullif(p_pack->>'id', '')::uuid; v_lib uuid := public.system_org_id('library');
        v_row seo.starter_pack; v_uid uuid := auth.uid(); v_industry uuid := nullif(p_pack->>'industry_id', '')::uuid;
begin
  if v_id is null then
    perform seo._pack_assert_creator(v_industry);
    insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines,
                                  source_notes, proposed_industry, status, organization_id, visibility, created_by, updated_by, metadata)
    values (coalesce(nullif(p_pack->>'slug',''), regexp_replace(lower(p_pack->>'name'), '[^a-z0-9]+', '-', 'g')),
            p_pack->>'name', p_pack->>'industry', v_industry, p_pack->>'summary', p_pack->>'description',
            coalesce(nullif(p_pack->>'geo_model',''), 'national'), p_pack->>'guidelines', p_pack->>'source_notes',
            p_pack->>'proposed_industry', 'draft', v_lib, 'internal', v_uid, v_uid,
            coalesce(p_pack->'metadata', '{}'::jsonb))
    returning * into v_row;
    -- Acting organization: the Matrx Library org the pack is created in.
    perform public._library_audit(v_uid, v_lib, 'pack_create', 'seo_starter_pack', v_row.id,
                                  v_industry, null, jsonb_build_object('slug', v_row.slug));
  else
    perform seo._pack_assert_author(v_id);
    update seo.starter_pack set
      name = coalesce(p_pack->>'name', name),
      industry = coalesce(p_pack->>'industry', industry),
      industry_id = case when p_pack ? 'industry_id' then v_industry else industry_id end,
      summary = case when p_pack ? 'summary' then p_pack->>'summary' else summary end,
      description = case when p_pack ? 'description' then p_pack->>'description' else description end,
      geo_model = coalesce(nullif(p_pack->>'geo_model',''), geo_model),
      guidelines = case when p_pack ? 'guidelines' then p_pack->>'guidelines' else guidelines end,
      source_notes = case when p_pack ? 'source_notes' then p_pack->>'source_notes' else source_notes end,
      proposed_industry = case when p_pack ? 'proposed_industry' then p_pack->>'proposed_industry' else proposed_industry end,
      metadata = case when p_pack ? 'metadata' then coalesce(metadata,'{}'::jsonb) || (p_pack->'metadata') else metadata end,
      pack_version = pack_version + 1, updated_at = now(), updated_by = v_uid
    where id = v_id and deleted_at is null
    returning * into v_row;
    -- Acting organization: the pack row's own organization.
    perform public._library_audit(v_uid, v_row.organization_id, 'pack_save', 'seo_starter_pack', v_id,
                                  v_row.industry_id, null,
                                  jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_pack) k)));
  end if;
  return to_jsonb(v_row) - 'proposal';
end $function$;

create or replace function seo.starter_pack_set_status(p_pack_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'seo', 'iam'
as $function$
declare v_row seo.starter_pack; v_uid uuid := auth.uid(); v_from text;
begin
  select status into v_from from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_from is null then raise exception 'seo_pack_not_found: %', p_pack_id using errcode = 'P0002'; end if;
  if p_status not in ('draft','proposed','ratified','retired') then raise exception 'seo_pack_bad_status: %', p_status; end if;
  if p_status in ('ratified', 'retired') or v_from in ('ratified', 'retired') then
    if not public.is_admin() then
      raise exception 'seo_pack_status_denied: only a platform admin ratifies or retires a pack' using errcode = '42501';
    end if;
  else
    perform seo._pack_assert_author(p_pack_id);
  end if;
  update seo.starter_pack set
    status = p_status,
    proposed_by = case when p_status = 'proposed' then v_uid else proposed_by end,
    proposed_at = case when p_status = 'proposed' then now() else proposed_at end,
    ratified_by = case when p_status = 'ratified' then v_uid else ratified_by end,
    ratified_at = case when p_status = 'ratified' then now() else ratified_at end,
    ratification_notes = case when p_status = 'ratified' then p_notes else ratification_notes end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status_history',
      coalesce(metadata->'status_history', '[]'::jsonb) || jsonb_build_object('from', v_from, 'to', p_status, 'at', now(), 'by', v_uid, 'notes', p_notes)),
    updated_at = now(), updated_by = v_uid
  where id = p_pack_id returning * into v_row;
  -- A pack that leaves `ratified` must leave its industry/global audiences too — the grant
  -- was issued on the ratified content. Pilot (organization) grants stay.
  if v_from = 'ratified' and p_status <> 'ratified' then
    delete from platform.entity_grants where entity_type = 'seo_starter_pack' and entity_id = p_pack_id and audience in ('industry', 'global');
  end if;
  -- Acting organization: the pack row's own organization.
  perform public._library_audit(v_uid, v_row.organization_id, 'pack_status', 'seo_starter_pack', p_pack_id,
                                v_row.industry_id, null,
                                jsonb_build_object('from', v_from, 'to', p_status, 'notes', p_notes));
  return to_jsonb(v_row) - 'proposal';
end $function$;

-- ---------------------------------------------------------------------------
-- 3. THE ACCESS DECISION, IN DATA. `provision_shape_guard` refuses a SECURITY DEFINER
--    function that reaches COMMIT without a door row, and it is right to: this writer runs as
--    `postgres` with BYPASSRLS. NO CLIENT MAY EVER CALL IT -- a direct caller could forge an
--    audit row naming any actor, any industry and, now, any acting organization.
-- ---------------------------------------------------------------------------
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers)
values (
  'public', '_library_audit',
  'p_actor uuid, p_acting_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_industry_id uuid, p_target_org uuid, p_detail jsonb',
  array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
  'Internal audit writer, never reached from a client. p_actor is the caller the DOOR already resolved from auth.uid(). p_acting_org is the organization the action was PERFORMED IN -- the organization the calling door already checked that caller against -- and it is the kernel organization_id. p_target_org is the organization acted UPON and is written to target_organization_id; NULL means the action named no other organization. p_industry_id and p_entity_id are recorded, not authorised here: each calling door checks them against its own ladder before it calls this. No argument is trusted as an access decision, because no access decision is made here.',
  'migrations/campaign/auditorg_library_audit_names_the_acting_organization.sql',
  'server_only: called only from inside the ten SECURITY DEFINER doors that write the library/industry/seo audit trail (public.industry_assign_org, industry_unassign_org, library_publish, library_revoke, library_subscribe, library_unsubscribe, and seo.starter_pack_from_proposal, starter_pack_new_version, starter_pack_save, starter_pack_set_status), each of which has already made its own ladder decision and already knows the organization it made that decision in. No client ever calls it: a direct caller could forge an audit row naming any actor, any industry and any organization.',
  false, false)
on conflict (schema_name, function_name, identity_argtypes) do update set
  identity_args = excluded.identity_args,
  reason = excluded.reason,
  declared_by = excluded.declared_by,
  non_client_lane = excluded.non_client_lane,
  signed_in_callers = false,
  anonymous_callers = false;

update platform.client_callable_door
   set reason = 'RETIRED ARITY, kept loud rather than dropped. It raises 23502 naming the eight-argument writer. Still server_only, and still never client-callable.',
       declared_by = 'migrations/campaign/auditorg_library_audit_names_the_acting_organization.sql',
       signed_in_callers = false,
       anonymous_callers = false
 where schema_name = 'public' and function_name = '_library_audit'
   and identity_argtypes = array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[];
