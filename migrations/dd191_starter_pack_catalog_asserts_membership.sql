-- dd191_starter_pack_catalog_asserts_membership — AN ORGANIZATION ID IS NOT A KEY
-- (DD-191 part 3. SECURITY P0. One function.)
--
-- ═══ THE DEFECT, MEASURED LIVE 2026-09-13 ══════════════════════════════════════════════════════
-- `seo.starter_pack_catalog(p_status, p_organization_id)` took the caller's word for
-- p_organization_id and handed it straight to `public.library_entitlement(...)` and to the
-- `subscribed` / `org_match` / `subscriber_count` expressions. Nothing asked whether the caller
-- belongs to that organization. Over HTTPS as `test@test.com`
-- (4060701e-706a-4c76-b3ca-0bbc69fa5a14), a member of two organizations and of NEITHER Titanium
-- nor AI Matrx:
--
--   p_organization_id = null                                  → []
--   p_organization_id = 'f9cb3e35-2a65-4f2a-8525-088d6551071c' (Titanium) → THREE packs, two of
--     them Titanium's own PROPOSED packs granted only to Titanium —
--     `consulting-marketing-services` and `medical-practice`, `entitled_via:"organization"`,
--     `subscribed:true` — carrying 2684 and 2912 characters of `guidelines` plus `description`,
--     `source_notes`, `source_corpus` and `ratification_notes`.
--
-- Under RLS that identity can SELECT exactly ONE `seo.starter_pack` row and sees ZERO
-- `platform.entity_grants` rows for `seo_starter_pack`. The org id was the whole key.
--
-- ═══ THE FIX ═══════════════════════════════════════════════════════════════════════════════════
-- The organization argument is now a CLAIM that is checked, through THE ONE membership helper
-- `iam.has_org_access_for(user, org)` — the same helper `public.is_org_member` and
-- `iam.is_org_member` already delegate to. A platform admin (who may curate any org's packs) and
-- the service role keep their reach. A stranger gets 42501 with a sentence; passing no
-- organization at all still works and answers from the caller's own memberships, so the honest
-- "only public packs" path is untouched.
--
-- ═══ THE CENSUS BEHIND THIS ONE FIX ════════════════════════════════════════════════════════════
-- 137 declared client doors take an organization id argument. 45 already consult a membership or
-- container helper in their own body. Of the other 92, the 43 callable with the organization
-- argument alone were probed as test@test.com against two organizations they do not belong to
-- (Castellano & Reyes 7cd12da2-…, Titanium f9cb3e35-…), each in a rolled-back transaction, and the
-- answers compared byte-for-byte against the same call with the caller's OWN organization:
--   • the `*_list_facets` family (agx, cvx, crm_inbox, ivw, mkt_initiative, shx, trx, wfx) and
--     `crm_chasebox_counts`, `get_org_file_list`, `hr_my_context` answer IDENTICALLY whichever
--     organization id is passed — they bound to the caller and ignore the argument. Not leaks.
--   • the HR family refuses in its own words: "no standing in this employer" (hr_org_chart,
--     hr_directory_list, hr_structure_list), `{"granted": false, "reason": "not_reachable"}`
--     (hr_org_summary, hr_relations_list), `not_an_hr_admin`, `no_capability`,
--     `hr_no_kiosk_admin_authority`. Not leaks.
--   • `hr_knob_index` differs across organizations only in the organization id it echoes back —
--     215 knob definitions, ZERO overridden on either side. Not a leak.
--   • `seo.starter_pack_catalog` is THE ONE that returned another organization's private rows.
-- The 49 unprobed doors need arguments beyond the organization id (a pay period, a payload, a
-- site, a template); they are named in this lane's report for a dedicated pass.

create or replace function seo.starter_pack_catalog(
  p_status text default null,
  p_organization_id uuid default null
)
returns table(
  id uuid, slug text, name text, industry text, summary text, description text, status text,
  geo_model text, guidelines text, source_notes text, source_corpus jsonb,
  ratified_at timestamptz, ratification_notes text, topic_count integer, meaning_count integer,
  value_band_count integer, geo_band_count integer, geo_area_count integer, industry_id uuid,
  industry_name text, org_match boolean, industry_slug text, pack_version integer,
  entitled_via text, subscribed boolean, subscriber_count integer, supersedes_pack_id uuid,
  proposed_at timestamptz, updated_at timestamptz, can_author boolean
)
language plpgsql
stable
security definer
set search_path to 'seo', 'platform', 'iam', 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  -- DD-191: the organization argument is a claim, and a claim is checked. THE ONE helper.
  if p_organization_id is not null and not v_admin and not v_service
     and not iam.has_org_access_for(v_uid, p_organization_id) then
    raise exception
      'You are not a member of that organization, so you can''t see its starter packs. Switch to one of your own organizations.'
      using errcode = '42501';
  end if;

  return query
  with ent as (
    select p.id as pid,
      case
        when v_admin then 'admin'
        when v_uid is not null and public.is_pack_curator(v_uid, p.id) then 'curator'
        when p_organization_id is not null then public.library_entitlement('seo_starter_pack', p.id, p_organization_id)
        when v_uid is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
               and g.audience='organization' and g.organization_id in (select om.organization_id from iam.organization_member om where om.user_id=v_uid)) then 'organization'
        when v_uid is not null and exists (select 1 from platform.entity_grants g join iam.org_industries oi on oi.industry_id=g.industry_id
               join iam.organization_member om on om.organization_id=oi.organization_id
               where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='industry' and om.user_id=v_uid) then 'industry'
        when exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='global') then 'global'
      end as via
    from seo.starter_pack p where p.deleted_at is null)
  select p.id, p.slug, p.name, p.industry, p.summary, p.description, p.status, p.geo_model, p.guidelines, p.source_notes,
         p.source_corpus, p.ratified_at, p.ratification_notes,
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'meaning' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null),
         p.industry_id, ind.name,
         (p_organization_id is not null and p.industry_id is not null and exists (
            select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)),
         ind.slug, p.pack_version, e.via,
         (p_organization_id is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
             and g.audience='organization' and g.organization_id=p_organization_id)),
         (select count(*)::int from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
         p.supersedes_pack_id, p.proposed_at, p.updated_at,
         (v_admin or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed')))
  from seo.starter_pack p
  join ent e on e.pid = p.id
  left join iam.industries ind on ind.id = p.industry_id
  where p.deleted_at is null
    and (p_status is null or p.status = p_status)
    and e.via is not null
    and (e.via in ('admin','curator','organization') or p.status = 'ratified')
  order by
    (p_organization_id is not null and p.industry_id is not null and exists (
       select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)) desc,
    case p.status when 'ratified' then 0 when 'proposed' then 1 when 'draft' then 2 else 3 end,
    p.name;
end
$function$;
