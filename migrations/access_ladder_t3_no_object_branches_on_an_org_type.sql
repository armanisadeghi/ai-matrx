-- chair-step: five functions lose the deprecated organization flag from their RESULT shape (get_user_organizations, list_user_organizations, iam.personal_data_relations renames its column, mandate._member_list_rows / _member_list_seat) and iam.derive_organization_abbreviation loses its ignored flag parameter — a result or signature change is only possible by DROP + CREATE; the REVOKEs re-establish their original grants exactly; iam.is_personal_dependents() and iam.backfill_org_from_owner(boolean) are DROPPED (their only job was the flag). No additive form exists.
-- based-on: billing.entitlement_consume(text, integer, uuid, uuid) eefd42fe4d19aa6822760b12338924ae4d174a71fa49720283ae03d7ab4fcf7f
-- based-on: communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) b7ed71efecaac680bc81dfe850854d360385bc85b95cb3781d3e4f07be9165bb
-- based-on: crm.ensure_user_party(uuid, text) 21d7be8226411a8bead85d9b1fa2a91ed3d2ae8757338d28d27c3a6b1efc7f33
-- based-on: custom._table_move_plan(uuid, uuid, uuid) e978ac0b4cf472cbd005703bf98044a709ad473f51c55e59cef4729d3c432c0b
-- based-on: custom.portal_admits(uuid, uuid) cd7dec7fc4ece14579b738735be7bddf04cf6a260318b2004e21c30d039dce07
-- based-on: iam._record_access_audit(uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid, timestamp with time zone, boolean, uuid, uuid) 2afdf010f24c1d206d9927e5a41b1858103a2fd0ee9211d2294a16a8d2961592
-- based-on: iam.access_request_recipients(text, uuid) e76529dd29702dbffb1759d729880b91bdfeb22391a09551f5f50391fea6d106
-- based-on: iam.assert_may_transfer(text, uuid, uuid, uuid, text, uuid) 3c04a206239d5179d4c09513c57a5070903df565aceff905a8000cacdca6ebb4
-- based-on: iam.derive_organization_abbreviation(text, boolean) b969cc8f033fb0e6c5507e6759820e470f3e6ef631e5b8c52cbb23b531a97c26
-- based-on: iam.external_principal_card(uuid) 7736c967f54526b91357efb11140860539b74fa94cd242b37e49f1f74c06da4a
-- based-on: iam.is_external_principal(uuid) 32d4f4db191b85af7757109c12df8334bd4deb6b24974e339b65f4cda3a1fedd
-- based-on: iam.organization_archive(uuid, text, text) 8f654a8eb3f77aa90f1752b16ea86454e60ebdd3472d3ef2e5d772c4afabb747
-- based-on: iam.people_lists_a_non_member_can_read() 9481413e72db88995855aed9fac559dc600164ba730203795da652b09e3ea926
-- based-on: iam.personal_data_relations() ec562f60b12f2baaf1e533e1c148c09f37e10b79347984ede5ded0a471bf0ddd
-- based-on: mandate._admin_list_rows(jsonb, text) 04e67e80a632eb7ffb8d02b661bf3e37003db9a1220d6e43a23e2c2b3a2c9230
-- based-on: mandate._admin_owner_label(uuid, boolean) 4f4d3782b24f26673611ed933943b875ece10789c57642c9adeea462137e1d09
-- based-on: mandate._admin_owner_level(uuid, boolean) 9a3be9dec443bff301976b256a46d69e49d8040584f4d49cca8da0a1e3a8015b
-- based-on: mandate._member_list_rows(text, uuid, uuid, text, text[], boolean) 11936a3ddaecf5ceba71cc04558f0b72f6c3d98e576eb449ebaa702e3a273bbd
-- based-on: mandate._member_list_seat(uuid, uuid, text, text[], uuid, uuid, uuid[]) b6ef8b7f693ee94f8a6e1b4f065077016754023f7aeba693e115036d75e797d9
-- based-on: platform.custom_fields_retrofit(text) a25cc094d52d672d7d76f76521321e276828ad8cff5f1ce60b471039762132df
-- based-on: platform.kernel_equivalence_answers() 05fbe5674b37ac1c2a97b7469b4c233155e69611d534efd79241e788e2d2391d
-- based-on: platform.retrofit_entity(text, text, text, text, text, text, text, text, text, text) cf326a2ecac051270b02cd02c6bee96c9e7810c77a69275dcea74c1d75e52f97
-- based-on: public._access_request_file(text, uuid, text, text) 05c85481d9d95017e97e05149b9e9289adff2b4381ac85743a76fd8614b57ea8
-- based-on: public.access_denied_context(text, uuid) acda49c5f0de111ca57ff3252010a167735b3271e94cab597395b0f1c661aa60
-- based-on: public.admin_manage_organization_membership(text, uuid, uuid, text) 834aebd2f74f6e23b160ffcd8b5fe7005d134934b9207deeba4b6bec81a1d863
-- based-on: public.agx_list_non_global_shortcuts_for_admin_m() ff717e9886cecb1cf68a93c953361ee6dc217776baa0667c6e9748b5cdbe0717
-- based-on: public.agx_list_scope_counts(text, boolean, text, jsonb) 5e65f3dcf1d1b650f9df602c25688a3b39d6bc5bfa11afe6cf812e3cb4c3b46d
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 3316a0d1a4c3786c6bc1d84858a30dc2510da2fe5add3ff3220259b73faa27ab
-- based-on: public.creator_claim_handle(text, text, uuid) 9ee8e15ea2ace004f294ccf3e11605bb52c5707c3a477e8b127b6c43bf272040
-- based-on: public.ctx_seed_template(jsonb) 6cc7cd24fa5f4a9187d3e2d9b6f0c239484b96724b26902cd2c2b45280f056bf
-- based-on: public.cvx_list_scope_counts(text, boolean, text, jsonb) 0c601bfdcb71d58e75e8ef812af184216d6196d122dbb239a7c7597c4337f356
-- based-on: public.fork_processed_document(uuid) 0d0cc413dff949a594ca2804d7485b6a7e84bbfcb03ed217ae7c02349d5e87c2
-- based-on: public.get_share_capabilities(text) 5f181668a4c1b5aacd149e83ca271f4300a13fca3945ef17aaf94520960052e4
-- based-on: public.get_ssr_shell_data(uuid) cc6c8a04263f160fa06e91f86c074e1ae355528659c00882c91c4dae50b28f9c
-- based-on: public.get_user_full_context(uuid) bb8343155b4091e55f47454502b07c0191911db6f9561637d47e3e2672ee4d3c
-- based-on: public.get_user_hierarchy() 33768677548195150a6f224afcc14070f39e741b8854ac7a7cccdf917f3a5280
-- based-on: public.get_user_nav_tree(uuid) ee5999e89ba0349c20443da9b5f7ab6efa654b0921f0b4d01f3b1f6e35341540
-- based-on: public.get_user_organizations(uuid) 0286961774f51a7af78ed140afcfee8318727ede29c78833a5448b2153858fc1
-- based-on: public.get_user_scopes(uuid) d2de57c0ed5f04050eae81664ab0eea96cb2f19fedc0ce4bf32eff1297b11d67
-- based-on: public.hr_invite_accept(text) af00b3a8cfd17ec99572b968213e5e85cdbcb92b4cd67d79c433e254caf10eab
-- based-on: public.ivw_list_scope_counts(text, jsonb) 2d0ff58bfa4b743db266e13b9a51861d65f7828f86e4b292da70be71b38cff6b
-- based-on: public.league_set_opt_in(boolean, text, uuid) 66fc8b1fe69384b18b105be21ce1d8a9d5ebf8478ff0960f072319b34bed6a58
-- based-on: public.list_templates(text, boolean) 4f469f2f1e968a63f0273614c003f0898ecc667d976d79c12787f937e3d30c07
-- based-on: public.list_user_organizations(uuid, text) 702e76f51c4734fc0d37df3ecb5ae225105a165c8417ec0271f3819add7f95f2
-- based-on: public.log_client_error(text, text, text, text, text, text, uuid, text, jsonb, jsonb, uuid, text) 430c36499be5924f2b3174c2194e8bfda2e5cb0f3c6b2fe345148192f5b7ff5a
-- based-on: public.mnd_member_list(text, text, text, uuid, uuid, text, jsonb, text, text, integer, integer) bef6db576d1fcd0a9678a0629b683bb601c30d5990ae7b1b2c55537d53ea71c0
-- based-on: public.org_create(text, text, text, text, uuid, text, jsonb, text) fdf73d48073ae1ab3009a959bb0c36ccac4d5e14c78c139ba0aed6e8cdf87d35
-- based-on: public.org_update(uuid, jsonb) f44d9d21dcd329d1eb86e3255d8716b6009776c72922ed8dfc00f95822b95e30
-- based-on: public.seo_rank_target_list_scope_counts(text, jsonb) cb9ffe301abfcf1a4a1e78c05734994217836e7d5b5ca0ce1b1eb57503490a62
-- based-on: public.set_streak_rest_weekdays(smallint[]) dfd031ce811a8333b7ed9876bb123f8e288f63ea2ea4e4dfc4fb494801aa82aa
-- based-on: public.setting_access_request_create(uuid, text, text, text, text, jsonb, text) 9d6deaf25b37728fa86c630c7d024459f219d7834d7a6439a732453c9b2ffabb
-- based-on: public.shx_list_scope_counts(text, boolean, jsonb) b99cc9f92cc773798e07197a66711cbe013229cc121f2bfe2e5ef1bcf3cc5919
-- based-on: public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 244bcc0c002ecf49fe2cb298c54bc4aedbd1eb5048eaf03a1d4e752781d62769
-- based-on: public.transfer_guest_data_to_user(uuid, uuid, text) d511a7fb7d5f35124708f3ad1501e7ff95fa2b09cf6a5c5e8b1d57e7338137c9
-- based-on: public.trx_list_scope_counts(text, boolean, jsonb) 6a962067431e83e4fcd91be49eb2f7c1bc2b012be2473ae672fda9442b3394ba
-- based-on: public.vault_recovery_preview(uuid) f3cf5ec6e6d05ab210276df8b24beeb029182f22a5bc9d9f35aebb3179de1698
-- based-on: public.wfx_list_scope_counts(text, boolean, text, jsonb) a837842f747ca2a4a813c5ab92ce890cf246f0c7213eb12ec6ce56b00dbffed5
-- based-on: seo._archive_tenant(uuid) a944b6bf72db5d9415b08483bb0cff988e4b8574f83a2b05f4a7c940329bd0f8
-- based-on: users.passkey_credential_linkage_guard() 4c3a10d6080694ae95547f43191c04f95fd8881d6b74d13ca4906b3edb53b243
-- based-on: web.conform(text, text, text, text, text, boolean, boolean) f9dda306e5bd330642e1161d4869ec1978a7221214d0a821cc5a42d97e6fc164
-- lane: access-ladder T-3
-- lock: iam, public, mandate, platform, agent, billing, users, communication, crm, custom, seo, education
--
-- NO DATABASE OBJECT BRANCHES ON AN ORGANIZATION TYPE ANY MORE.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and
-- equal; there is no personal/business type and no flag that marks one — Arman, 2026-09-26.)
--
-- Every remaining reader of the deprecated organization flag stops reading it, and every body
-- that narrated a "personal" organization stops naming one:
--   • authority/visibility: access_request_recipients, external_principal_card,
--     is_external_principal, platform.visible_user_identity — every organization's owners/admins
--     and co-members count the same.
--   • refusals removed: organization_archive (any organization may be archived by its owner),
--     admin_manage_organization_membership (uniform membership repair).
--   • shapes: get_ssr_shell_data (no personal_organization_id, no flag), get_user_full_context
--     (no synthetic "Personal" pseudo-organization), get_user_hierarchy / nav_tree / scopes /
--     organizations / list_user_organizations, access_denied_context, list_templates,
--     agent.menu_surface — no flag, sorted by name.
--   • lists: the *_list_scope_counts family counts every organization; agx_list_scoped's
--     platform_users scope is the organization-less rows; shx_list_scoped origin is system|organization;
--     the mandate member/admin lists name every organization by its own name.
--   • choosers: log_client_error (no organization named → system capture lane),
--     set_streak_rest_weekdays (updates the streak row in the organization it already carries),
--     seo._archive_tenant (several organizations → the caller names one),
--     notification_user_channels (this organization's row, else the person's latest row),
--     custom._table_move_plan (by name), org_create (no flag write), ctx_seed_template (audience only).
--   • identity-keyed: users.passkey_credential_linkage_guard and vault_recovery_preview accept a
--     passkey row in an organization the same person belongs to.
--   • transfer_guest_data_to_user: the guest's own organization is the one it created and is the
--     only member of (a membership fact), not a flag.
--   • tooling: retrofit_entity loses the 'personal' org strategy; crm.ensure_user_party checks
--     is_system only; iam.personal_data_relations' verdict column is names_a_person.

set local lock_timeout = '3s';

drop function public.get_user_organizations(uuid);
drop function public.list_user_organizations(uuid,text);
drop function iam.personal_data_relations();
drop function mandate._member_list_seat(uuid,uuid,text,text[],uuid,uuid,uuid[]);
drop function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean);
drop function iam.derive_organization_abbreviation(text,boolean);

-- Born in schema iam under a transient name and moved: public's default privileges hand
-- `authenticated` EXECUTE at CREATE, which §6d-4 refuses on this server-only door (its
-- platform.client_callable_door row says no client calls it). Moving it never grants anything.
CREATE OR REPLACE FUNCTION iam.t3_get_user_organizations(user_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, role org_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
-- Unchanged shape, unchanged callers. It now hides archived organizations, because THE
-- ARCHIVED-ITEMS LAW's default is to hide; a caller that wants them asks
-- public.list_user_organizations(user, 'all' | 'archived').
begin
  return query
  select o.id, o.name, o.slug, m.role
    from iam.organizations o
    join iam.organization_member m on o.id = m.organization_id
   where m.user_id = $1
     and o.archived_at is null
   order by o.name asc;
end
$function$;

alter function iam.t3_get_user_organizations(uuid) rename to get_user_organizations;
alter function iam.get_user_organizations(uuid) set schema public;
revoke all on function public.get_user_organizations(uuid) from public, anon, authenticated;
grant execute on function public.get_user_organizations(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.list_user_organizations(p_user_id uuid, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, name text, slug text, role org_role, archived_at timestamp with time zone, archive_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
-- THE ARCHIVED-ITEMS LAW's three values, and no fourth: 'active' (the default — hides archived),
-- 'archived', 'all'. One door so no picker has to invent its own predicate.
begin
  -- THE ACCESS DECISION, before any read and before existence: you may list YOUR OWN
  -- memberships, and a platform admin may list anyone's. A foreign id and an invented one are
  -- refused identically, so this answers nothing about who exists.
  if not (p_user_id = (select auth.uid()) or (select public.is_platform_admin())) then
    raise exception 'You can only list your own organizations.' using errcode = '42501';
  end if;

  if p_archived not in ('active', 'archived', 'all') then
    raise exception 'The archive filter is one of active, archived or all — not %.', p_archived
      using errcode = '22023';
  end if;

  return query
  select o.id, o.name, o.slug, m.role, o.archived_at, o.archive_reason
    from iam.organizations o
    join iam.organization_member m on o.id = m.organization_id
   where m.user_id = p_user_id
     and case p_archived
           when 'active'   then o.archived_at is null
           when 'archived' then o.archived_at is not null
           else true
         end
   order by (o.archived_at is not null), o.name asc;
end
$function$;

grant execute on function public.list_user_organizations(uuid,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION iam.personal_data_relations()
 RETURNS TABLE(relation text, names_a_person boolean, why text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select * from (values
    ('crm.party',                  true,  'real named people: display_name, first_name, last_name'),
    ('crm.contact_medium',         true,  'the email addresses and phone numbers themselves, in value_raw'),
    ('crm.party_contact_point',    true,  'joins a person to their email address or phone number'),
    ('crm.address',                true,  'where a person lives or works'),
    ('crm.affiliation',            true,  'who a person works for'),
    ('crm.contact_candidate',      true,  'a person we think we have found, by name'),
    ('crm.merge_candidate',        true,  'two people we think are one person'),
    ('crm.party_merge',            true,  'the record that two people were made one'),
    ('crm.interaction',            true,  'what was said to a named person and when'),
    ('crm.deal',                   true,  'a deal, by the people and company it names'),
    ('crm.enrichment_call',        true,  'what a provider was asked about a named person'),
    ('crm.blocklist_entry',        true,  'a person who asked never to be contacted again'),
    ('crm.outreach_list_member',   true,  'which named people are on a sending list'),
    ('crm.sending_event',          true,  'what was sent to a named person, and whether they opened it'),
    ('esign.envelope_signer',      true,  'a signer''s own email, full name and phone'),
    ('esign.campaign_member',      true,  'a campaign member''s own email and full name'),
    ('commerce.print_order',       true,  'the contact email an order is delivered against'),
    ('platform.outcome_event',     true,  'an outcome recorded against a named person'),
    -- Ruled NOT personal, each with the reason, because a census with no verdict rots into a
    -- list of names nobody re-reads.
    ('crm.registry_source',        false, 'contact_email is a public registry''s own published address, not a person''s'),
    ('web.business_location',      false, 'a business''s published address, phone and email, drawn on public marketing pages'),
    ('seo.coverage_mention',       false, 'a mention of a BRAND in coverage; it names no person')
  ) as t(relation, names_a_person, why);
$function$;

revoke all on function iam.personal_data_relations() from public, anon, authenticated;
grant execute on function iam.personal_data_relations() to dashboard_user, authenticated, service_role, svc_seo;


CREATE OR REPLACE FUNCTION mandate._member_list_rows(p_q text, p_res_user uuid, p_res_org uuid, p_level text, p_keys text[], p_light boolean)
 RETURNS TABLE(id uuid, mandate_key text, created_by uuid, organization_id uuid, is_system boolean, home_label text, name text, feature_label text, goal text, holder_type text, holder_id uuid, holder_name text, decided_by text, decided_rung text, pin_text text, customized_by text[], health text, origin text, visibility text, is_enabled boolean, updated_at timestamp with time zone, created_at timestamp with time zone, vals jsonb, sortv jsonb, score integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_sys uuid;
  v_res_org_name text;
BEGIN
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';
  SELECT o.name INTO v_res_org_name FROM iam.organizations o WHERE o.id = p_res_org;
  RETURN QUERY
  WITH buckets AS (
    SELECT b.b, public.agx_since_bucket(b.b) AS since, b.o
    FROM unnest(ARRAY['1h','24h','7d','30d','90d','1y']) WITH ORDINALITY AS b(b, o)
  ),
  corpus AS (
    SELECT m.*
    FROM mandate.definition m
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status', '') <> 'placeholder'
      -- KEYS PUSHED DOWN (2026-09-25): a caller that already knows the exact keys it wants
      -- (the feature Intelligence page) narrows the corpus here, so the ladder, holder and
      -- health work runs over those rows only — never the whole corpus filtered afterwards.
      AND (p_keys IS NULL OR m.mandate_key = ANY (p_keys))
      -- SHARE ≠ MOVE (2026-09-25): a mandate stays homed where its creator made it; sharing
      -- adds a grant (iam.permissions, what ShareModal writes) or publishes it. So the corpus
      -- is every home this seat belongs to PLUS every mandate granted to it PLUS every
      -- published one. RLS on mandate.definition is still the ceiling (this function is
      -- SECURITY INVOKER); this only decides what the list LOOKS at.
      AND (CASE WHEN p_level = 'organization'
                THEN m.organization_id = v_sys OR m.organization_id = p_res_org
                  OR m.visibility = 'public'
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND p.granted_to_organization_id = p_res_org
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                  -- ADOPTED (2026-09-26): the organization set it as its default.
                  OR m.id IN (SELECT b.mandate_id FROM mandate.binding b
                               WHERE b.principal_type = 'org' AND b.organization_id = p_res_org
                                 AND b.deleted_at IS NULL AND b.is_enabled)
                  -- SHARED WITH ME (2026-09-26): given to the person in this seat, so an
                  -- owner or admin can adopt it for the organization from here.
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND p.granted_to_user_id = v_uid
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                ELSE m.organization_id = v_sys
                  OR m.organization_id IN (SELECT iam.my_orgs())
                  OR m.created_by = v_uid
                  OR m.visibility = 'public'
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND (p.granted_to_user_id = v_uid
                                      OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                  -- ADOPTED (2026-09-26): one of my organizations set it as its default.
                  OR m.id IN (SELECT b.mandate_id FROM mandate.binding b
                               WHERE b.principal_type = 'org'
                                 AND b.organization_id IN (SELECT iam.my_orgs())
                                 AND b.deleted_at IS NULL AND b.is_enabled) END)
  ),
  rungs AS (
    -- LIGHT (2026-09-26): the ladder is the only expensive part of a row (~2 ms each:
    -- per-row access, per-holder reachability for every home-org member, the output
    -- contract). A caller that reads only the definition's own columns (scope, name,
    -- feature, dates, origin, visibility) asks for NO ladder; the ladder columns of a
    -- light row say "None"/"Nobody" and must not be read.
    SELECT r.* FROM mandate._rungs(CASE WHEN p_light THEN ARRAY[]::uuid[]
                                        ELSE ARRAY(SELECT c.id FROM corpus c) END,
                                   p_res_user, p_res_org) r
  ),
  -- The rung that decides: the highest enabled rung that chose a holder and
  -- was not set aside (the system floor is only skipped when it fails the
  -- output contract — mnd_list_scoped's rule, FIX-R1c / FIX-R7).
  winner AS (
    SELECT DISTINCT ON (r.mandate_id)
           r.mandate_id AS w_id, r.rung AS w_rung, r.rung_order AS w_order,
           coalesce(r.holder_type, 'agent') AS w_type, r.holder_id AS w_holder_id,
           r.holder_version_id AS w_version_id, r.holder_live AS w_holder_live,
           r.version_live AS w_version_live
    FROM rungs r
    WHERE r.chose_holder AND r.is_enabled
      AND (r.dropped_reason IS NULL
           OR (r.binding_id IS NULL AND r.dropped_code IS DISTINCT FROM 'output_contract_unmet'))
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  sys_unmet AS (
    SELECT DISTINCT r.mandate_id AS u_id FROM rungs r
    WHERE r.binding_id IS NULL AND r.dropped_code = 'output_contract_unmet'
  ),
  dropped AS (
    SELECT DISTINCT ON (r.mandate_id) r.mandate_id AS d_id, r.rung_order AS d_order
    FROM rungs r
    WHERE r.binding_id IS NOT NULL AND r.chose_holder AND r.dropped_reason IS NOT NULL
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  -- Who customized it, from the viewer's seat (see header).
  mine_bound AS (
    SELECT b.mandate_id AS k_id,
      bool_or(p_level = 'person' AND b.principal_type = 'user' AND b.subject_user_id = v_uid) AS k_personal,
      array_agg(DISTINCT coalesce(o.name, 'Organization') ORDER BY coalesce(o.name, 'Organization'))
        FILTER (WHERE b.principal_type = 'org'
                  AND b.organization_id IS DISTINCT FROM v_sys
                  AND (CASE WHEN p_level = 'organization'
                            THEN b.organization_id = p_res_org
                            ELSE b.organization_id IN (SELECT iam.my_orgs()) END)) AS k_orgs
    FROM mandate.binding b
    JOIN corpus c ON c.id = b.mandate_id
    LEFT JOIN iam.organizations o ON o.id = b.organization_id
    WHERE b.deleted_at IS NULL
    GROUP BY b.mandate_id
  ),
  shaped AS MATERIALIZED (
    SELECT
      c.id AS s_id, c.mandate_key AS s_key, c.created_by AS s_created_by,
      c.organization_id AS s_org, (c.organization_id = v_sys) AS s_is_system,
      CASE WHEN c.organization_id = v_sys THEN 'System'
           ELSE coalesce(ho.name, 'An organization you are not in') END AS s_home,
      coalesce(NULLIF(btrim(c.label), ''),
        NULLIF(btrim(array_to_string(ARRAY(
          SELECT CASE WHEN w = '' THEN '' ELSE upper(left(w, 1)) || substr(w, 2) END
          FROM unnest(string_to_array(
                 coalesce((SELECT s FROM unnest(string_to_array(c.mandate_key, '.')) WITH ORDINALITY u(s, o)
                            WHERE s <> '' ORDER BY o DESC LIMIT 1), c.mandate_key), '_'))
                 WITH ORDINALITY z(w, o) ORDER BY o), ' ')), ''),
        c.mandate_key) AS s_name,
      CASE WHEN position('.' in c.mandate_key) <= 1 OR right(c.mandate_key, 1) = '.' THEN '(unscoped)'
           WHEN split_part(c.mandate_key, '.', 1) = 'shortcut' THEN 'Shortcuts'
           WHEN split_part(c.mandate_key, '.', 1) = 'app' THEN 'Agent apps'
           ELSE mandate._admin_list_pretty(split_part(c.mandate_key, '.', 1)) END AS s_feature,
      NULLIF(btrim(coalesce(c.goal, '')), '') AS s_goal,
      c.description AS s_description,
      CASE WHEN c.origin = 'code' THEN 'code' ELSE 'soft' END AS s_origin,
      c.visibility::text AS s_visibility,
      c.is_enabled AS s_enabled, c.updated_at AS s_updated, c.created_at AS s_created,
      c.required_output_keys AS s_required,
      w.w_id IS NOT NULL AS s_has_winner, w.w_rung, w.w_type,
      w.w_holder_live, w.w_version_live,
      (su.u_id IS NOT NULL) AS s_sys_unmet,
      (dr.d_id IS NOT NULL AND (w.w_id IS NULL OR dr.d_order > w.w_order)) AS s_set_aside,
      CASE WHEN w.w_type = 'agent' THEN coalesce(dv.agent_id, w.w_holder_id) ELSE w.w_holder_id END AS s_holder_id,
      w.w_version_id AS s_version_id,
      dv.version_number AS s_pinned_version,
      ad.name AS s_agent_name, ad.version AS s_latest_version,
      coalesce(ad.is_archived, false) AS s_agent_archived,
      (w.w_type = 'agent' AND ad.id IS NULL) AS s_agent_missing,
      ad.output_schema AS s_output_schema,
      wd.name AS s_workflow_name,
      coalesce(k.k_personal, false) AS s_personal_bound,
      coalesce(k.k_orgs, ARRAY[]::text[]) AS s_org_bound
    FROM corpus c
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
    LEFT JOIN winner w ON w.w_id = c.id
    LEFT JOIN sys_unmet su ON su.u_id = c.id
    LEFT JOIN dropped dr ON dr.d_id = c.id
    LEFT JOIN mine_bound k ON k.k_id = c.id
    LEFT JOIN agent.definition_version dv
           ON NOT p_light AND w.w_type = 'agent' AND dv.id = w.w_version_id
    LEFT JOIN agent.definition ad
           ON NOT p_light AND w.w_type = 'agent' AND ad.id = coalesce(dv.agent_id, w.w_holder_id) AND ad.deleted_at IS NULL
    LEFT JOIN workflow.definition wd
           ON NOT p_light AND w.w_type = 'workflow' AND wd.id = w.w_holder_id
  ),
  finished AS MATERIALIZED (
    SELECT s.*,
      CASE WHEN NOT s.s_has_winner THEN 'None'
           WHEN s.w_type = 'workflow' THEN coalesce(s.s_workflow_name, 'A workflow you cannot open')
           ELSE coalesce(s.s_agent_name, 'An agent you cannot open') END AS f_holder,
      CASE s.w_rung
        WHEN 'user'   THEN 'You'
        WHEN 'org'    THEN coalesce(v_res_org_name, 'Your organization')
        WHEN 'system' THEN 'Default'
        ELSE 'Nobody' END AS f_decided,
      CASE WHEN NOT s.s_has_winner THEN 'None'
           WHEN s.s_version_id IS NOT NULL THEN coalesce('v' || s.s_pinned_version, 'Pinned')
           ELSE 'Latest' END AS f_pin,
      CASE WHEN NOT s.s_personal_bound AND cardinality(s.s_org_bound) = 0 THEN ARRAY['Default']
           ELSE s.s_org_bound || CASE WHEN s.s_personal_bound THEN ARRAY['Personal'] ELSE ARRAY[]::text[] END
      END AS f_customized,
      CASE
        WHEN NOT s.s_enabled THEN 'Turned off'
        WHEN NOT s.s_has_winner AND s.s_sys_unmet THEN 'Output does not match'
        WHEN NOT s.s_has_winner THEN 'Nothing bound'
        WHEN s.s_set_aside THEN 'Override set aside'
        WHEN s.s_agent_missing THEN 'Agent unavailable'
        WHEN s.s_agent_archived THEN 'Agent archived'
        WHEN s.w_holder_live IS FALSE OR s.w_version_live IS FALSE THEN 'Agent unavailable'
        WHEN s.w_type = 'agent'
             AND coalesce(cardinality(mandate.missing_output_keys(s.s_required, s.s_output_schema::jsonb)), 0) > 0
          THEN 'Output does not match'
        WHEN s.s_pinned_version IS NOT NULL AND s.s_latest_version IS NOT NULL
             AND s.s_latest_version > s.s_pinned_version THEN 'Newer version available'
        ELSE 'OK' END AS f_health
    FROM shaped s
  )
  SELECT
    f.s_id, f.s_key, f.s_created_by, f.s_org, f.s_is_system, f.s_home,
    f.s_name, f.s_feature, f.s_goal,
    f.w_type, f.s_holder_id, f.f_holder, f.f_decided, f.w_rung, f.f_pin,
    f.f_customized, f.f_health, f.s_origin, f.s_visibility,
    f.s_enabled, f.s_updated, f.s_created,
    jsonb_build_object(
      'name',         to_jsonb(ARRAY[f.s_name]),
      'featureLabel', to_jsonb(ARRAY[f.s_feature]),
      'mandateKey',   to_jsonb(ARRAY[f.s_key]),
      'holderName',   to_jsonb(ARRAY[f.f_holder]),
      'holderType',   to_jsonb(ARRAY[coalesce(f.w_type, 'none')]),
      'decidedBy',    to_jsonb(ARRAY[f.f_decided]),
      'pinText',      to_jsonb(ARRAY[f.f_pin]),
      'customizedBy', to_jsonb(f.f_customized),
      'health',       to_jsonb(ARRAY[f.f_health]),
      'origin',       to_jsonb(ARRAY[f.s_origin]),
      'visibility',   to_jsonb(ARRAY[f.s_visibility]),
      'homeLabel',    to_jsonb(ARRAY[f.s_home]),
      'isEnabled',    to_jsonb(ARRAY[CASE WHEN f.s_enabled THEN 'true' ELSE 'false' END]),
      -- THE STATUS from this seat (features/mandates/status/mandate-status.ts).
      'status',       to_jsonb(ARRAY[CASE WHEN NOT f.s_enabled THEN 'disabled' WHEN NOT f.s_has_winner THEN 'draft' ELSE 'active' END]),
      'goal',         CASE WHEN f.s_goal IS NULL THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.s_goal]) END,
      'updatedAt',    to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                     WHERE f.s_updated IS NOT NULL AND f.s_updated >= bk.since ORDER BY bk.o)),
      'createdAt',    to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                     WHERE f.s_created IS NOT NULL AND f.s_created >= bk.since ORDER BY bk.o))
    ),
    jsonb_build_object(
      'name',         lower(f.s_name),
      'featureLabel', lower(f.s_feature),
      'mandateKey',   lower(f.s_key),
      'holderName',   lower(f.f_holder),
      'holderType',   coalesce(f.w_type, 'none'),
      'decidedBy',    lower(f.f_decided),
      'pinText',      lower(f.f_pin),
      'customizedBy', lower(array_to_string(f.f_customized, ', ')),
      'health',       lower(f.f_health),
      'origin',       f.s_origin,
      'visibility',   f.s_visibility,
      'homeLabel',    lower(f.s_home),
      'isEnabled',    CASE WHEN f.s_enabled THEN 1 ELSE 0 END,
      'status',       CASE WHEN NOT f.s_enabled THEN 1 WHEN NOT f.s_has_winner THEN 0 ELSE 2 END,
      'goal',         lower(coalesce(f.s_goal, '')),
      'updatedAt',    coalesce(to_char(f.s_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      'createdAt',    coalesce(to_char(f.s_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    ),
    CASE WHEN p_q IS NULL THEN 0 ELSE public.mtx_search_score(
      p_q, f.s_id, f.s_name, coalesce(f.s_goal, ''), ARRAY[]::text[], NULL,
      ARRAY[f.s_key, f.s_feature, f.f_holder],
      f.f_customized || ARRAY[coalesce(f.s_description, '')],
      false) END
  FROM finished f;
END;
$function$;

revoke all on function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean) from public, anon, authenticated;
grant execute on function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean) to dashboard_user, authenticated, service_role, svc_seo;

CREATE OR REPLACE FUNCTION mandate._member_list_seat(p_res_user uuid, p_res_org uuid, p_level text, p_keys text[], p_org_id uuid, p_uid uuid, p_my_orgs uuid[])
 RETURNS TABLE(id uuid, mandate_key text, name text, created_by uuid, organization_id uuid, is_system boolean, visibility text, vals jsonb, sortv jsonb, shared_org_ids uuid[], in_mine boolean, in_shared boolean, in_orgs boolean, in_public boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH light AS (
    SELECT l.* FROM mandate._member_list_rows(NULL, p_res_user, p_res_org, p_level, p_keys, true) l
  ),
  -- An organization this row reaches the seat through without living there: a grant to
  -- it, or its adoption (a live org binding) — mandate._member_shared_org_ids's rule.
  shared AS (
    SELECT x.mandate_id, array_agg(DISTINCT x.org_id) AS org_ids
    FROM (
      SELECT p.resource_id AS mandate_id, p.granted_to_organization_id AS org_id
        FROM iam.permissions p
       WHERE p.resource_type = 'mandate'
         AND p.granted_to_organization_id IS NOT NULL
         AND p.status <> 'rejected'
         AND (p.expires_at IS NULL OR p.expires_at > now())
      UNION ALL
      SELECT b.mandate_id, b.organization_id
        FROM mandate.binding b
       WHERE b.principal_type = 'org'
         AND b.deleted_at IS NULL
         AND b.is_enabled
    ) x
    WHERE (CASE WHEN p_level = 'organization' THEN x.org_id = p_org_id
                ELSE x.org_id = ANY (p_my_orgs) END)
    GROUP BY x.mandate_id
  ),
  -- Granted to this person personally.
  granted AS (
    SELECT DISTINCT p.resource_id AS mandate_id
      FROM iam.permissions p
     WHERE p.resource_type = 'mandate'
       AND p.granted_to_user_id = p_uid
       AND p.status <> 'rejected'
       AND (p.expires_at IS NULL OR p.expires_at > now())
  )
  SELECT l.id, l.mandate_key, l.name, l.created_by, l.organization_id, l.is_system,
         l.visibility, l.vals, l.sortv,
         coalesce(sh.org_ids, '{}'::uuid[]),
         -- mine
         l.created_by = p_uid,
         -- shared (with me personally); in an organization seat, only while the
         -- organization has not homed or adopted it (then it is in the orgs lane)
         l.created_by IS DISTINCT FROM p_uid AND g.mandate_id IS NOT NULL
           AND NOT (p_level = 'organization'
                    AND (l.organization_id = p_org_id
                         OR p_org_id = ANY (coalesce(sh.org_ids, '{}'::uuid[])))),
         -- orgs
         NOT l.is_system AND (
           (CASE WHEN p_level = 'organization' THEN l.organization_id = p_org_id
                 ELSE l.organization_id = ANY (p_my_orgs)
                      AND (p_org_id IS NULL OR l.organization_id = p_org_id) END)
           OR (CASE WHEN p_org_id IS NULL THEN cardinality(coalesce(sh.org_ids, '{}'::uuid[])) > 0
                    ELSE p_org_id = ANY (coalesce(sh.org_ids, '{}'::uuid[])) END)),
         -- public (the community lane)
         NOT l.is_system AND l.visibility = 'public'
           AND l.created_by IS DISTINCT FROM p_uid
           AND (CASE WHEN p_level = 'organization' THEN l.organization_id IS DISTINCT FROM p_org_id
                     ELSE l.organization_id <> ALL (p_my_orgs) END)
  FROM light l
  LEFT JOIN shared sh ON sh.mandate_id = l.id
  LEFT JOIN granted g ON g.mandate_id = l.id;
$function$;

revoke all on function mandate._member_list_seat(uuid,uuid,text,text[],uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function mandate._member_list_seat(uuid,uuid,text,text[],uuid,uuid,uuid[]) to dashboard_user, authenticated, service_role, svc_seo;

CREATE OR REPLACE FUNCTION iam.derive_organization_abbreviation(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_word text;
  v_words text[] := '{}'::text[];
  v_result text := '';
begin
  -- Every organization abbreviates from its own name; there is no override.
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

revoke all on function iam.derive_organization_abbreviation(text) from public, anon, authenticated;
grant execute on function iam.derive_organization_abbreviation(text) to authenticated, authenticator, cli_login_postgres, dashboard_user, matrx_provisioner, service_role, svc_seo;

CREATE OR REPLACE FUNCTION public._access_request_file(p_resource_type text, p_resource_id uuid, p_level text DEFAULT 'viewer'::text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_command text := coalesce(nullif(p_level, ''), 'viewer');
  v_level text;
  v_kind text := 'resource_access';
  v_request_key text := '';
  v_meta record;
  v_attrs record;
  v_existing record;
  v_org uuid;
  v_id uuid;
  v_recent int;
  v_recipients jsonb;
  v_recipient_ids jsonb;
  v_payload jsonb := '{}'::jsonb;
  v_upgraded boolean := false;
  v_parent_type text; v_parent_id uuid;  -- RC-A2h (N3)
begin
  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;

  -- 🚨 RC-A2h (N3): A REQUEST FOR A COMMENT IS A REQUEST FOR ITS RECORD. A detail's access only
  -- ever comes from the record it is on (platform.detail_parent_columns); a grant on the comment
  -- itself admits nobody, so filing against it would be a dead end. The request goes to the
  -- record, marked `via` the detail token.
  if platform.token_is_detail(p_resource_type) then
    select et.schema_name, et.table_name into v_meta
      from platform.entity_types et
     where et.token = p_resource_type and coalesce(et.is_active, true);
    if v_meta.schema_name is not null and platform.detail_parent_columns(p_resource_type) is not null then
      execute format('select coalesce(to_jsonb(t) ->> $2, $3), (to_jsonb(t) ->> $4)::uuid from %I.%I t where t.id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id
        using p_resource_id, (platform.detail_parent_columns(p_resource_type))[1],
              (platform.detail_parent_columns(p_resource_type))[3],
              (platform.detail_parent_columns(p_resource_type))[2];
    end if;
    if v_parent_type is null or v_parent_id is null then
      raise exception 'That % no longer exists.', lower(p_resource_type) using errcode = '02000';
    end if;
    return public._access_request_file(v_parent_type, v_parent_id, p_level, p_message)
           || jsonb_build_object('via', jsonb_build_object('token', p_resource_type));
  end if;

  if v_command = 'delete' then
    v_kind := 'resource_action';
    v_request_key := 'delete';
    v_level := 'admin';
  elsif v_command in ('viewer', 'commenter', 'editor', 'admin') then
    v_level := v_command;
  else
    v_level := 'viewer';
  end if;

  select et.schema_name, et.table_name, et.label into v_meta
  from platform.entity_types et
  where et.token = p_resource_type and coalesce(et.is_active, true);

  if v_meta.schema_name is null then
    raise exception 'We could not identify what you are asking for.'
      using errcode = '22023';
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_resource_id);

  if not coalesce(v_attrs.o_found, false) then
    raise exception 'That % no longer exists.', lower(coalesce(v_meta.label, 'item'))
      using errcode = '02000';
  end if;

  if v_kind = 'resource_action' then
    if not platform.detail_parent_access(p_resource_type, p_resource_id, 'editor'::public.permission_level) then
      raise exception 'You need edit access before asking the owner to delete this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
    end if;
    if platform.detail_parent_access(p_resource_type, p_resource_id, 'admin'::public.permission_level) then
      raise exception 'You already have full access to this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
    end if;
  elsif platform.detail_parent_access(p_resource_type, p_resource_id, v_level::public.permission_level) then
    raise exception 'You already have the access you requested for this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'reason', r.reason,
           'display_name', nullif(pr.display_name, '')
         )), '[]'::jsonb),
         coalesce(jsonb_agg(to_jsonb(r.user_id::text)), '[]'::jsonb)
    into v_recipients, v_recipient_ids
  from iam.access_request_recipients(p_resource_type, p_resource_id) r
  left join users.profiles pr on pr.id = r.user_id;

  if v_recipients = '[]'::jsonb then
    raise exception 'There is nobody who can grant access to this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  if v_kind = 'resource_action' then
    v_payload := jsonb_build_object(
      'action_key', 'delete',
      'action_label', 'Delete ' || coalesce(v_meta.label, 'item'),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipient_ids', v_recipient_ids
    );
  end if;

  select ar.id, ar.status, ar.request_kind, ar.requested_level, ar.request_key
    into v_existing
  from iam.access_requests ar
  where ar.resource_type = p_resource_type
    and ar.resource_id = p_resource_id
    and ar.created_by = v_uid
    and ar.deleted_at is null
  order by ar.created_at desc
  limit 1;

  if v_existing.status = 'pending' then
    v_upgraded := v_existing.request_kind is distinct from v_kind
      or v_existing.requested_level is distinct from v_level
      or coalesce(v_existing.request_key, '') is distinct from v_request_key;
    if v_upgraded then
      update iam.access_requests
         set request_kind = v_kind,
             request_key = v_request_key,
             request_payload = v_payload,
             requested_level = v_level,
             message = nullif(btrim(p_message), ''),
             updated_at = now(),
             updated_by = v_uid
       where id = v_existing.id;
    end if;
    return jsonb_build_object(
      'request_id', v_existing.id,
      'status', 'pending',
      'already', not v_upgraded,
      'level', v_level,
      'request_kind', v_kind,
      'action_key', nullif(v_request_key, ''),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipients', case when v_upgraded then v_recipients else '[]'::jsonb end
    );
  end if;
  if v_existing.status = 'reported' then
    raise exception 'You can no longer make requests about this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  select count(*) into v_recent
  from iam.access_requests ar
  where ar.created_by = v_uid
    and ar.created_at > now() - interval '1 day'
    and ar.deleted_at is null;
  if v_recent >= 25 then
    raise exception 'You have sent a lot of access requests today. Try again tomorrow.'
      using errcode = '54000';
  end if;

  -- THE RECORD ANSWERS. A request to be let into something is recorded where that
  -- something lives, so the people who can grant it can see it. It used to be recorded
  -- in an organization chosen for the REQUESTER.
  if platform.entity_is_org_scoped(p_resource_type) then
    v_org := platform.entity_organization_id(p_resource_type, p_resource_id);
  end if;
  if v_org is null then
    raise exception
      'We could not tell which organization this % belongs to, so your request was not filed.',
      lower(coalesce(v_meta.label, 'item'))
      using errcode = '23502',
            hint = 'This kind of record does not carry an organization, so there is nowhere to file a request about it. Ask the owner directly.';
  end if;

  begin
    insert into iam.access_requests
      (organization_id, created_by, resource_type, resource_id, requested_level,
       message, request_kind, request_key, request_payload)
    values
      (v_org, v_uid, p_resource_type, p_resource_id, v_level,
       nullif(btrim(p_message), ''), v_kind, v_request_key, v_payload)
    returning id into v_id;
  exception when unique_violation then
    select ar.id into v_id
    from iam.access_requests ar
    where ar.resource_type = p_resource_type
      and ar.resource_id = p_resource_id
      and ar.created_by = v_uid
      and ar.status = 'pending'
      and ar.deleted_at is null
    limit 1;
    return jsonb_build_object('request_id', v_id, 'status', 'pending',
                              'already', true, 'level', v_level,
                              'request_kind', v_kind, 'recipients', '[]'::jsonb);
  end;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'already', false,
    'level', v_level,
    'request_kind', v_kind,
    'action_key', nullif(v_request_key, ''),
    'entity_label', v_meta.label,
    'entity_title', platform.entity_title(p_resource_type, p_resource_id),
    'recipients', v_recipients
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.access_denied_context(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'pg_temp'
AS $function$
declare
  v_uid            uuid := (select auth.uid());
  v_meta           record;
  v_attrs          record;
  v_deleted        boolean := false;
  v_level          text := 'none';
  v_is_owner       boolean := false;
  v_disclosure     text;
  v_owner_json     jsonb := null;
  v_org_json       jsonb := null;
  v_entity_json    jsonb;
  v_ancestor_json  jsonb := null;
  v_request_json   jsonb := null;
  v_can_request    boolean := false;
  v_parent_type    text;
  v_parent_id      uuid;
  v_fk             text;
  v_hops           int := 0;
  v_cur_type       text;
  v_cur_id         uuid;
  v_cur_schema     text;
  v_cur_table      text;
  v_permissive     text;
  v_restrictive    text;
  v_rls_readable   boolean := false;
  v_read_role      text;
  v_row_security   boolean := false;
  v_door_level     boolean := false;  -- RC-A8 L2: the level came from the one rule
begin
  if p_type is null or p_id is null then
    return jsonb_build_object('exists', false, 'deleted', false,
                              'level', 'none', 'disclosure', 'none',
                              'unresolvable', true);
  end if;

  select et.token, et.label, et.schema_name, et.table_name,
         coalesce(et.allow_preview, true)    as allow_preview,
         coalesce(et.has_soft_delete, false) as has_soft_delete
    into v_meta
  from platform.entity_types et
  where et.token = p_type
    and coalesce(et.is_active, true)
  limit 1;

  if v_meta.token is null then
    return jsonb_build_object('exists', false, 'deleted', false,
                              'level', 'none', 'disclosure', 'none',
                              'unresolvable', true);
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);

  if v_uid is null and coalesce(v_attrs.o_vis, 'personal'::platform.visibility)
       <> 'public'::platform.visibility then
    return jsonb_build_object(
      'exists', null, 'deleted', null, 'level', 'none',
      'is_owner', false, 'disclosure', 'anonymous', 'can_request', false,
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  if not coalesce(v_attrs.o_found, false) then
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  -- 🚨 RC-A2d (R2): A DETAIL IS ANSWERED AS ITS RECORD. A comment's access only ever comes from
  -- the record it is on, so its author, its organization and a "Request access" on the comment
  -- itself would each be a false or leaking answer. The caller gets exactly the answer the record
  -- gets under the platform's no-enumeration rule, marked `via` the detail token.
  if platform.token_is_detail(v_meta.token) then
    -- RC-A2e: the parent is read through the declaration (an undeclared detail answers "missing").
    v_parent_type := null; v_parent_id := null;
    if platform.detail_parent_columns(v_meta.token) is not null then
      execute format('select coalesce(to_jsonb(t) ->> $2, $3), (to_jsonb(t) ->> $4)::uuid from %I.%I t where t.id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id
        using p_id, (platform.detail_parent_columns(v_meta.token))[1],
              (platform.detail_parent_columns(v_meta.token))[3],
              (platform.detail_parent_columns(v_meta.token))[2];
    end if;
    if v_parent_type is null or v_parent_id is null then
      return jsonb_build_object(
        'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
        'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label));
    end if;
    v_entity_json := public.access_denied_context(v_parent_type, v_parent_id);
    -- RC-A2j: a detail on a record the caller may not know of is a random id — its own token, no
    -- `via` (which would say "a comment with this id exists on something").
    if v_entity_json ->> 'exists' = 'false' then
      return jsonb_build_object(
        'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
        'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label));
    end if;
    return v_entity_json || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
  end if;

  if v_meta.has_soft_delete then
    begin
      execute format('select (deleted_at is not null) from %I.%I where id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_deleted using p_id;
    exception when others then
      v_deleted := false;
    end;
  end if;

  if v_uid is not null then
    -- RC-A8 L2: the ONE RULE the doors use (platform.detail_parent_access: custom.reaches_directly
    -- for a Data Tables record — the Table shared with you opens its rows — iam.has_access otherwise).
    if platform.detail_parent_access(v_meta.token, p_id, 'admin'::public.permission_level) then
      v_level := 'admin';
    elsif platform.detail_parent_access(v_meta.token, p_id, 'editor'::public.permission_level) then
      v_level := 'edit';
    elsif platform.detail_parent_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
      v_level := 'view';
    end if;
    v_door_level := v_level <> 'none';

    -- `iam.has_access` has no platform-staff lane; that lane lives only in RLS
    -- and is NOT uniform (private tokens carry none; many `platform_admin_all`
    -- policies admit only `visibility >= 'internal'`). So a platform admin with
    -- no grant is only a CANDIDATE for `admin` — the real-read check below
    -- settles it, exactly as it settles every other level.
    if v_level = 'none' and public.is_platform_admin_for(v_uid) then
      v_level := 'admin';
    end if;

    v_is_owner := (v_attrs.o_owner is not null and v_attrs.o_owner = v_uid);
  else
    v_level := 'view';
  end if;

  -- EVERY LEVEL IS A REAL READ — THE ONE CHECK, FOR EVERY PATH ABOVE.
  -- A level survives only when the caller's role could actually read THIS row:
  -- the role holds SELECT on the `id` column, and the row passes the table's live
  -- SELECT policies for that role — evaluated here with the caller's own JWT
  -- claims, the same way `public.std_select_count_as` evaluates a policy. A
  -- table without row security needs only the privilege. Only the SENTENCE
  -- changes: nothing here grants anything. A policy that cannot be evaluated
  -- raises; the client then renders an honest resolver error, never a guess.
  -- RC-A8 L2: a table no client role may SELECT at all (the Data Tables store, read only through
  -- its doors) has no policy to evaluate — the one rule that granted the level IS its real read.
  if v_level <> 'none'
     and not (v_door_level
              and not has_column_privilege(case when v_uid is null then 'anon' else 'authenticated' end,
                                           format('%I.%I', v_meta.schema_name, v_meta.table_name), 'id', 'select')) then
    v_read_role := case when v_uid is null then 'anon' else 'authenticated' end;
    v_rls_readable := false;

    select c.relrowsecurity
      into v_row_security
    from pg_class c
    where c.oid = format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass;

    -- The privilege the real read needs: SELECT on `id`. Governed tables grant
    -- column by column, so a TABLE-level check would refuse rows the caller
    -- really reads (files.files, docproc.processed_documents, 2026-09-15).
    if has_column_privilege(v_read_role,
                            format('%I.%I', v_meta.schema_name, v_meta.table_name),
                            'id', 'select') then
      if not v_row_security then
        v_rls_readable := true;
      else
        select string_agg('(' || pg_get_expr(po.polqual, po.polrelid) || ')', ' or ')
                 filter (where po.polpermissive),
               string_agg('(' || pg_get_expr(po.polqual, po.polrelid) || ')', ' and ')
                 filter (where not po.polpermissive)
          into v_permissive, v_restrictive
        from pg_policy po
        where po.polrelid = format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass
          and po.polcmd in ('r', '*')
          and po.polqual is not null
          and (0::oid = any (po.polroles)
               or v_read_role::regrole::oid = any (po.polroles));

        if v_permissive is not null then
          execute format(
            'select exists (select 1 from %I.%I where id = $1 and (%s) and (%s))',
            v_meta.schema_name, v_meta.table_name,
            v_permissive, coalesce(v_restrictive, 'true'))
            into v_rls_readable using p_id;
        end if;
      end if;
    end if;

    if not v_rls_readable then
      v_level := 'none';
    end if;
  end if;

  if v_uid is null then
    v_disclosure := 'anonymous';
  elsif not v_meta.allow_preview then
    v_disclosure := 'kind_only';
  else
    v_disclosure := 'full';
  end if;

  -- 🚨 RC-A2d (R2): a row that points at a record (platform.reference_gate_columns — a War Room
  -- thread or room, which copies the project's name as its title) is answered at kind_only when
  -- the caller cannot open that record: no title, no owner, no organization.
  if v_disclosure = 'full' and v_uid is not null then
    select g[1], g[2] into v_cur_type, v_fk
      from (select platform.reference_gate_columns(v_meta.token) as g) x;
    if v_fk is not null then
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_cur_type, v_fk, v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id using p_id;
      if v_parent_type is not null and v_parent_id is not null
         and not iam.has_access(v_parent_type, v_parent_id, 'viewer'::public.permission_level) then
        v_disclosure := 'kind_only';
      end if;
    end if;
    v_cur_type := null; v_fk := null; v_parent_type := null; v_parent_id := null;
  end if;

  v_entity_json := jsonb_build_object('token', v_meta.token, 'label', v_meta.label);

  if v_disclosure = 'full' then
    v_entity_json := v_entity_json
      || jsonb_build_object('title', platform.entity_title(v_meta.token, p_id));

    if v_attrs.o_owner is not null then
      select jsonb_build_object(
               'user_id', pr.id,
               'display_name', nullif(pr.display_name, ''),
               'avatar_url', nullif(pr.avatar_url, ''),
               'creator_handle', case when coalesce(pr.creator_public, false)
                                      then nullif(pr.creator_handle, '') end
             )
        into v_owner_json
      from users.profiles pr
      where pr.id = v_attrs.o_owner;

      v_owner_json := coalesce(
        v_owner_json,
        jsonb_build_object('user_id', v_attrs.o_owner, 'display_name', null,
                           'avatar_url', null, 'creator_handle', null)
      );
    end if;

    if v_attrs.o_org is not null then
      select jsonb_build_object(
               'id', o.id, 'name', o.name,
               'viewer_is_member', v_uid is not null
                                   and iam.has_org_access_for(v_uid, o.id)
             )
        into v_org_json
      from iam.organizations o
      where o.id = v_attrs.o_org;
    end if;

    if v_uid is not null then
      v_cur_type   := v_meta.token;
      v_cur_id     := p_id;
      v_cur_schema := v_meta.schema_name;
      v_cur_table  := v_meta.table_name;

      while v_hops < 6 and v_ancestor_json is null loop
        v_hops := v_hops + 1;

        select er.parent_type, er.fk_column
          into v_parent_type, v_fk
        from platform.entity_relationships er
        where er.child_type = v_cur_type
          and er.kind in ('composition', 'containment')
        order by (er.kind = 'composition') desc
        limit 1;

        exit when v_parent_type is null or v_fk is null;

        begin
          execute format('select %I from %I.%I where id = $1',
                         v_fk, v_cur_schema, v_cur_table)
            into v_parent_id using v_cur_id;
        exception when others then
          v_parent_id := null;
        end;

        exit when v_parent_id is null;

        if iam.has_access(v_parent_type, v_parent_id,
                          'viewer'::public.permission_level) then
          v_ancestor_json := jsonb_build_object(
            'token', v_parent_type,
            'id',    v_parent_id,
            'label', (select label from platform.entity_types
                       where token = v_parent_type),
            'title', platform.entity_title(v_parent_type, v_parent_id)
          );
          exit;
        end if;

        select et.schema_name, et.table_name
          into v_cur_schema, v_cur_table
        from platform.entity_types et
        where et.token = v_parent_type;

        exit when v_cur_schema is null;

        v_cur_type := v_parent_type;
        v_cur_id   := v_parent_id;
      end loop;
    end if;
  end if;

  if v_uid is not null then
    select jsonb_build_object(
             'id', ar.id, 'status', ar.status,
             'level', ar.requested_level, 'created_at', ar.created_at,
             'decision_note', ar.decision_note
           )
      into v_request_json
    from iam.access_requests ar
    where ar.resource_type = v_meta.token
      and ar.resource_id = p_id
      and ar.created_by = v_uid
      and ar.deleted_at is null
    order by ar.created_at desc
    limit 1;
  end if;

  v_can_request :=
        v_uid is not null
    and v_level = 'none'
    and not v_deleted
    and exists (select 1 from iam.access_request_recipients(v_meta.token, p_id))
    and coalesce(v_request_json ->> 'status', '') not in ('pending', 'reported');

  -- THE STRANGER'S ANSWER IS THE MISSING ANSWER (lane V24-TAILS, chair ruling 2026-09-25,
  -- VERIFIER-24 item 10). A signed-in person with no level on this row, who does not own it, is
  -- not in the organization that holds it and reads no ancestor of it, is told exactly what a
  -- random id tells her: no existence, no owner, no organization, no deletion, no prior request.
  -- She may still ask (`public.access_request_blind`), which reaches the owner without naming them.
  -- A member of the object's organization keeps the full answer (the org admin's transfer offer,
  -- the roster's "no access" cells).
  -- RC-A2k (chair ruling 2026-09-26): A PLAIN MEMBER OF THE RECORD'S ORGANIZATION WHO CANNOT OPEN
  -- IT GETS THE STRANGER'S ANSWER. The full answer stays for the owner, anyone holding a level,
  -- anyone reading an ancestor, and the owners/admins of the organization that holds it.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     -- RC-A2m (chair refinement): the organization's owners/admins keep the full answer only for
     -- records the ORGANIZATION holds — never a member's PERSONAL record (access is personal).
     and not (v_attrs.o_org is not null
              -- RC-A8 L1: the container's visibility wins (a row of a personal Table is personal)
              and platform.held_by_its_organization(v_meta.token, p_id)
              and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'deleted', v_deleted,
    'level', v_level,
    'is_owner', v_is_owner,
    'disclosure', v_disclosure,
    'entity', v_entity_json,
    'owner', v_owner_json,
    'organization', v_org_json,
    'ancestor', v_ancestor_json,
    'request', v_request_json,
    'can_request', v_can_request
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_manage_organization_membership(p_action text, p_org_id uuid, p_user_id uuid, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_membership iam.memberships%rowtype;
  v_org iam.organizations%rowtype;
  v_previous_role text;
  v_owner_count integer;
  v_other_owner_count integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_action not in ('add', 'set_role', 'remove') then
    raise exception 'Unsupported organization membership action: %', p_action
      using errcode = '22023';
  end if;

  select * into v_org
  from iam.organizations
  where id = p_org_id;

  if not found then
    perform platform.refuse_not_found('Organization not found');
  end if;

  -- DD-162: THE ONE DOOR. A super admin passes it through the administrator arm, and the census can
  -- now tell this function from one that asks nobody — which is the whole point, because the line
  -- above can be deleted by a future edit and this one cannot be deleted quietly.
  perform iam.assert_may_transfer('membership', v_org.created_by, p_user_id, p_org_id,
                                  'organization', p_org_id);


  if p_action in ('add', 'set_role') and p_role not in ('owner', 'admin', 'member') then
    raise exception 'Role must be owner, admin, or member' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    perform platform.refuse_not_found('User not found');
  end if;

  -- Serialize owner-count checks with other organization membership changes.
  perform 1
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and deleted_at is null
  for update;

  -- R21, one owner: even a super admin may not mint a second one. The route is
  -- transfer_organization_ownership, which demotes the outgoing owner.
  if p_action in ('add', 'set_role') and p_role = 'owner' then
    select count(*)::integer
    into v_other_owner_count
    from iam.memberships
    where container_type = 'organization'
      and container_id = p_org_id
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
      and user_id is distinct from p_user_id;

    if v_other_owner_count > 0 then
      raise exception
        'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
        using errcode = '23514';
    end if;
  end if;

  select * into v_membership
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and user_id = p_user_id
    and deleted_at is null;

  v_previous_role := v_membership.role;

  if p_action = 'add' then
    insert into iam.memberships (
      container_type, container_id, organization_id, user_id, role, status, metadata,
      created_by, updated_by
    )
    values (
      'organization', p_org_id, p_org_id, p_user_id, p_role, 'active', '{}'::jsonb, v_actor, v_actor
    )
    on conflict (container_type, container_id, user_id)
    do update set
      organization_id = excluded.organization_id,
      role = excluded.role,
      status = 'active',
      deleted_at = null,
      updated_by = v_actor,
      updated_at = now()
    returning * into v_membership;

  elsif p_action = 'set_role' then
    if v_membership.id is null then
      perform platform.refuse_not_found('Organization membership not found');
    end if;

    if v_membership.role = 'owner' and p_role <> 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot demote the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    update iam.memberships
    set role = p_role,
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;

  else
    if v_membership.id is null then
      perform platform.refuse_not_found('Organization membership not found');
    end if;

    if v_membership.role = 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot remove the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    -- DD-044: a super admin removing the last membership would leave the person
    -- with no organization at all.
    if iam.is_last_organization(p_user_id, p_org_id) then
      raise exception
        'This person can''t be removed from their only organization. They need to join or create another one first.'
        using errcode = '23514';
    end if;

    update iam.memberships
    set deleted_at = now(),
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  insert into iam.org_admin_audit (organization_id, actor_user_id, target_user_id, action, detail)
  values (
    p_org_id, v_actor, p_user_id, 'super_admin_membership_' || p_action,
    jsonb_build_object('previous_role', v_previous_role, 'role', v_membership.role,
                       'membership_id', v_membership.id)
  );

  return jsonb_build_object(
    'action', p_action, 'membership_id', v_membership.id, 'organization_id', p_org_id,
    'user_id', p_user_id, 'role', v_membership.role);
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_non_global_shortcuts_for_admin_m()
 RETURNS TABLE(id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, agent_id uuid, agent_version_id uuid, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, is_active boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, display_mode text, show_variable_panel boolean, variables_panel_style text, auto_run boolean, allow_chat boolean, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, owner_email text, owner_display text, scope_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.agent_id, s.agent_version_id, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.is_active, s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.display_mode, s.show_variable_panel, s.variables_panel_style,
    s.auto_run, s.allow_chat,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_at, s.updated_at,
    u.email::text AS owner_email,
    COALESCE(u.email::text, o.name, sp.target_id::text, st.target_id::text) AS owner_display,
    CASE
      WHEN sp.target_id IS NOT NULL THEN 'project'
      WHEN st.target_id IS NOT NULL THEN 'task'
      WHEN s.organization_id IS NOT NULL AND NOT COALESCE(o.is_system, false) THEN 'organization'
      WHEN s.created_by IS NOT NULL AND s.organization_id IS NULL THEN 'user'
      ELSE 'global'
    END AS scope_type
  FROM mandate.vw_shortcut s
  LEFT JOIN auth.users u ON u.id = s.created_by
  LEFT JOIN iam.organizations o ON o.id = s.organization_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE NOT COALESCE(o.is_system, false)
  ORDER BY s.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public','system'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per organization the caller belongs to, WITH its name.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.agx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;

  -- ADMIN PLATFORM SCOPES (2026-09-26): totals plus one narrow row per owning
  -- organization / person, each counted from ONE scoped read (honest under
  -- search and filters, never a lateral call per owner).
  IF public.is_platform_admin() THEN
    FOREACH v_scope IN ARRAY ARRAY['platform_orgs','platform_users','platform_all'] LOOP
      RETURN QUERY
      SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
      FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
        true, p_archived, p_filters, 1, 0) r;
    END LOOP;
    RETURN QUERY
    SELECT 'platform_orgs'::text, r.organization_id, max(r.organization_name), count(*)::bigint
    FROM public.agx_list_scoped('platform_orgs', NULL, p_search, p_deep, 'updated', 'desc',
      false, p_archived, p_filters, 1000000, 0) r
    WHERE r.organization_id IS NOT NULL
    GROUP BY r.organization_id;
    RETURN QUERY
    SELECT 'platform_users'::text, r.organization_id,
           coalesce(max(NULLIF(btrim(pp.display_name), '')), max(r.owner_email), max(r.organization_name)),
           count(*)::bigint
    FROM public.agx_list_scoped('platform_users', NULL, p_search, p_deep, 'updated', 'desc',
      false, p_archived, p_filters, 1000000, 0) r
    LEFT JOIN iam.organizations po ON po.id = r.organization_id
    LEFT JOIN users.profiles pp ON pp.id = po.created_by
    WHERE r.organization_id IS NOT NULL
    GROUP BY r.organization_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('agent')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The system scope is the only one that reads the builtin corpus, and only
  -- a platform admin may. Resolved once so the scan is not per-row.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public','system','platform_orgs','platform_users','platform_all') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, (a.created_by = v_uid), CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM agent.definition a
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
          AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
      ORDER BY a.id, perm.permission_level::text
    ) org_shared
    UNION ALL
    -- PUBLIC = what a tenant PUBLISHED: the agent's CARD is public (card_visibility, the one
    -- column the publish path writes; the body can never be public — CHECK). The card rows come
    -- through agent.public_card_rows(), a definer that projects card fields only, because RLS
    -- hides a stranger's agent body from this invoker function (2026-09-26).
    SELECT a.*, false, 'public'::text FROM agent.public_card_rows() a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- SYSTEM: the platform's own builtin corpus. Admin-only, and owned by the
    -- admin viewing it — the row-level affordances (rename, favorite, delete)
    -- are exactly what this scope exists to give them.
    SELECT a.*, true, 'system'::text FROM agent.definition a
    WHERE v_scope='system' AND v_is_admin
    UNION ALL
    -- ADMIN PLATFORM SCOPES (Arman, 2026-09-26: "No one acts as themselves in
    -- admin"). The whole platform, never the viewer: every organization's
    -- agents, every person's own agents, or everything. Admin-only.
    SELECT a.*, (a.agent_type = 'builtin'), 'platform'::text FROM agent.definition a
    LEFT JOIN iam.organizations po ON po.id = a.organization_id
    WHERE v_is_admin AND (
         (v_scope='platform_orgs' AND a.organization_id IS NOT NULL
            AND a.organization_id IS DISTINCT FROM (SELECT so.organization_id FROM iam.system_orgs so WHERE so.key = 'system')
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_users' AND a.organization_id IS NULL
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR v_scope='platform_all')
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    -- The corpus a scope reads. Every user-facing scope reads user agents;
    -- `system` reads the builtin corpus and NOTHING else, so a builtin can
    -- never leak into Mine/Orgs/Shared/Public and a user agent can never
    -- masquerade as a platform agent.
    WHERE (v_scope = 'platform_all' OR j.agent_type = (CASE WHEN v_scope='system' THEN 'builtin' ELSE 'user' END))
      AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION billing.entitlement_consume(p_capability text, p_quantity integer DEFAULT 1, p_check_id uuid DEFAULT NULL::uuid, p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_cap  billing.capability%rowtype;
  v_res  jsonb;
  v_dup  boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'consumed', false, 'duplicate', false,
      'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'free',
      'reason', 'not_authenticated', 'period', null, 'windows', '[]'::jsonb,
      'enforced', false);
  end if;

  -- 🚨 DD-208: `p_org` is a CLAIM, checked BEFORE the write. Without this, any
  -- signed-in caller charged any organization's meter and read back its plan.
  if p_org is not null and not iam.has_org_access_for(v_user, p_org) then
    raise exception 'You have no standing in that organization, so you cannot consume its entitlement.'
      using errcode = '42501';
  end if;

  -- 🚨 NOTHING IS SUBSTITUTED HERE ANY MORE (2026-09-19 ruling, F2).
  --
  -- This used to be:
  --
  --   v_ledger_org := coalesce(p_org, <an organization the database chose for v_user>);
  --
  -- justified by db-rules §2 "NO NULL ORG" -- the ledger column is NOT NULL, so
  -- something had to fill it. But "something had to fill it" is an argument for
  -- making the CALLER fill it, never for the database choosing a tenant on the
  -- person's behalf. The old line billed a person's metered work to an
  -- organization they had not selected and could not see, every time a caller
  -- omitted the organization -- which the dropped three-argument overload did
  -- unconditionally, for every metered action taken in the browser.
  --
  -- The refusal announces itself with the remedy, and it is raised BEFORE any
  -- row is written, so a refusal can never follow a partial write.
  if p_org is null then
    raise exception 'A metered action must name the organization whose meter it charges; this call named none.'
      using errcode = '23502',
            hint = 'Pass p_org. Nothing is substituted: filling organization_id with an organization the database chose bills a tenant nobody chose (2026-09-19 ruling). If no organization is selected, hold the action and let the person choose one, then call again.';
  end if;

  select * into v_cap from billing.capability where capability = p_capability;

  -- Idempotency: a check + its consume are ONE accounted unit.
  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    -- Serialize this (org, capability) so two concurrent spends cannot both
    -- read "one left" and both write.
    perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_capability));
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, p_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$function$;

CREATE OR REPLACE FUNCTION communication.notification_user_channels(p_user uuid, p_event_key text, p_organization_id uuid, p_base jsonb, p_mandatory boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb := coalesce(p_base, '{}'::jsonb);
  v_user jsonb := '{}'::jsonb;
  v_out  jsonb;
begin
  -- A non-user recipient has NO user rung at all — we do not run accounts for candidates, and
  -- consent (not a preference row) is their unsubscribe. Same rule as the spine's `is_user` check.
  if p_user is null then
    return v_base;
  end if;

  -- ── BOTH USER RUNGS, NEAREST FIRST.
  --   `pr.organization_id = p_organization_id` → this organization's row, the NEAREST rung.
  --   any other row of the same person        → the person's own latest statement, in whichever
  --                                              of their organizations they made it.
  -- `distinct on (pr.channel)` keeps the first row per channel in the ORDER BY's order, so the
  -- organization's row wins whenever one exists and the person's latest row is what a channel
  -- falls back to. Every organization is equal (access ladder, 2026-09-26): no organization type
  -- decides which row is the person's "own".
  select coalesce(jsonb_object_agg(w.channel, to_jsonb(w.enabled)), '{}'::jsonb)
    into v_user
    from (
      select distinct on (pr.channel) pr.channel, pr.enabled
        from communication.notification_preference pr
       where pr.user_id = p_user
         and pr.event_key = p_event_key
         and pr.deleted_at is null
       order by pr.channel,
                (pr.organization_id is not distinct from p_organization_id) desc,  -- this org first
                pr.updated_at desc                              -- deterministic, never arbitrary
    ) w;

  -- `||` is the ladder: a user key overwrites its channel, and a user key the rung above never
  -- mentioned is ADDED — which is how a person turns a channel ON.
  v_out := v_base || v_user;

  -- ── THE ⚖ FLOOR (SPEC-NOTIFICATIONS §7.1). The user tier "may not silence a ⚖ event entirely".
  -- Checked ONCE, after both rungs, and that is deliberate: the floor is a property of the TIER,
  -- not of a rung, so it holds whether the silence came from the employer row, the global row, or
  -- the two of them together. Moving a ⚖ event between channels is untouched.
  if p_mandatory and not exists (select 1 from jsonb_each(v_out) where value = 'true'::jsonb) then
    return v_base;
  end if;

  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.creator_claim_handle(p_handle text, p_display_name text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_taken uuid;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_taken
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null and p.id <> v_uid
  limit 1;
  if v_taken is not null then
    raise exception 'That handle is already taken' using errcode = '23505';
  end if;

  -- CARRYING, NOT CHOOSING. The profile row already has an organization (the column is NOT
  -- NULL), stamped at signup by public._provision_new_user_profile. Reading it is carrying
  -- an organization somebody already set.
  select organization_id into v_org from users.profiles where id = v_uid;

  if v_org is null then
    -- No profile row: signup provisioning failed for this user (see
    -- the signup provisioning warning). The old body invented one here. The call names it
    -- instead -- the organization the creator is acting in, which the client already has.
    v_org := p_organization_id;
    if v_org is null then
      raise exception 'creator_claim_handle: you have no profile row yet, so nothing carries the organization this creator profile belongs to. Remedy: call public.creator_claim_handle(p_handle, p_display_name, p_organization_id) and pass the organization you are acting in.'
        using errcode = '23502';
    end if;
    if not iam.has_org_access(v_org) then
      raise exception 'creator_claim_handle: no org access (org=%)', v_org using errcode = '42501';
    end if;
  end if;

  insert into users.profiles (id, organization_id, display_name, creator_handle)
  values (v_uid, v_org, coalesce(nullif(btrim(p_display_name), ''), 'Creator'), v_handle)
  on conflict (id) do update set
    creator_handle = v_handle,
    display_name = coalesce(nullif(btrim(p_display_name), ''), users.profiles.display_name),
    updated_at = now();

  return public.creator_get_mine();
end;
$function$;

CREATE OR REPLACE FUNCTION crm.ensure_user_party(p_user_id uuid, p_source text DEFAULT 'signup'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
begin
  if not exists (
    select 1
    from iam.organizations o
    where o.id = v_ai_matrx_org
      and o.slug = 'ai-matrx'
      and o.is_system is false
  ) then
    raise exception 'ensure_user_party: AI Matrx normal CRM tenant binding is unavailable';
  end if;
  return crm.ensure_user_party_in_org(p_user_id, v_ai_matrx_org, p_source, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ctx_seed_template(p_template jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_template_id uuid;
  v_type_record jsonb;
  v_type_id uuid;
  v_field jsonb;
  v_field_sort int;
  v_type_id_map jsonb := '{}'::jsonb;
BEGIN
  INSERT INTO context.templates (key, name, description, category, icon, sort_order, audience)
  VALUES (
    p_template->>'key',
    p_template->>'name',
    COALESCE(p_template->>'description', ''),
    p_template->>'category',
    COALESCE(p_template->>'icon', 'folder'),
    COALESCE((p_template->>'sort_order')::int, 0),
    COALESCE(p_template->>'audience', 'organization')
  )
  RETURNING id INTO v_template_id;
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    INSERT INTO context.template_scope_types (
      template_id, key, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity
    ) VALUES (
      v_template_id,
      v_type_record->>'key',
      v_type_record->>'singular',
      v_type_record->>'plural',
      COALESCE(v_type_record->>'icon', 'folder'),
      COALESCE(v_type_record->>'description', ''),
      COALESCE((v_type_record->>'sort_order')::int, 0),
      NULLIF((v_type_record->>'max_assignments_per_entity'), '')::smallint
    )
    RETURNING id INTO v_type_id;
    v_type_id_map := v_type_id_map || jsonb_build_object(v_type_record->>'key', v_type_id::text);
    v_field_sort := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_type_record->'fields', '[]'::jsonb))
    LOOP
      INSERT INTO context.template_context_items (
        template_scope_type_id, key, display_name, description, value_type, sort_order
      ) VALUES (
        v_type_id,
        v_field->>'key',
        v_field->>'display_name',
        COALESCE(v_field->>'description', ''),
        COALESCE(NULLIF((v_field->>'value_type'), '')::context_value_type, 'string'::context_value_type),
        v_field_sort
      );
      v_field_sort := v_field_sort + 1;
    END LOOP;
  END LOOP;
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_template->'scope_types')
  LOOP
    IF v_type_record->>'parent_key' IS NOT NULL THEN
      UPDATE context.template_scope_types
      SET parent_template_type_id = (v_type_id_map->>(v_type_record->>'parent_key'))::uuid
      WHERE id = (v_type_id_map->>(v_type_record->>'key'))::uuid;
    END IF;
  END LOOP;
  RETURN v_template_id;
END;
$function$;

CREATE OR REPLACE FUNCTION custom._table_move_plan(p_table_id uuid, p_to uuid, p_me uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tables   uuid := custom.table_kernel_id();
  v_fieldk   uuid := custom.field_kernel_id();
  v_ceiling  constant integer := 16;   -- REC-N-4, the containment ceiling
  v_t        record;
  v_org      uuid;
  v_org_name text;
  v_name     text;
  v_may      boolean := false;
  v_why_not  text;
  v_general  text[] := array[]::text[];
  v_carry_t  uuid[];            -- tables that move: the table, what is inside it, their own choice lists
  v_add      uuid[];
  v_inside   integer := 0;      -- tables that ride along because they live inside what moves
  v_round    integer := 0;
  v_fields   uuid[];
  v_recs     uuid[];
  v_others   uuid[];            -- rules, dashboards, templates, relations that move
  v_all      uuid[];
  v_idre     text;
  r          record;
  v_dest     jsonb := '[]'::jsonb;
  v_to_why   text;
  v_counts   jsonb;
  v_shared   text;
  v_home_like boolean;
  v_cross_n  integer := 0;      -- relation values that will cross the wall
  v_cross_shut text;            -- a source table that does not allow links to other organizations
  v_cols_n   integer := 0;      -- columns that will point across the wall (SC-1-TAILS)
begin
  select t.* into v_t
    from custom.record t
   where t.id = p_table_id and t.table_id = v_tables
   limit 1;
  if not found then
    return null;
  end if;
  v_org  := v_t.organization_id;
  v_name := coalesce(nullif(btrim(v_t.data ->> 'name'), ''), 'This table');
  select o.name into v_org_name from iam.organizations o where o.id = v_org;
  v_org_name := coalesce(v_org_name, 'its organization');

  -- WHO MAY MOVE IT: the person who made it, or an owner or admin of its organization.
  v_may := p_me is not null
           and (v_t.created_by = p_me or iam.is_org_manager(v_org, p_me));
  if not v_may then
    v_why_not := format('Only the person who made %s or an owner or admin of %s can move it.',
                        v_name, v_org_name);
  end if;

  -- ── what the store or the app keeps never moves by itself ──
  if v_t.data_class = 'kernel' then
    v_general := v_general || format('%s is one of the record store''s own tables, so it stays where it is.', v_name);
  elsif coalesce((v_t.data ->> 'kept_by_the_app')::boolean, false) or v_t.data ? 'scope_binding' then
    v_general := v_general || format(
      'The app keeps %s for %s, so it moves with what uses it, not by itself.',
      v_name,
      coalesce(case v_t.data ->> 'kept_for'
                 when 'context' then 'the context system'
                 when 'choices' then 'a column''s choices'
                 else nullif(v_t.data ->> 'kept_for', '') end,
               'one of its features'));
  end if;
  if v_t.deleted_at is not null then
    v_general := v_general || format('%s is in the trash. Restore it first, then move it.', v_name);
  end if;

  -- ── where it sits: a HOME (its organization's record, a person's space, a "Home" folder, a
  -- kernel row) moves with nothing and is re-pointed; a row of another Table or a Table is a
  -- container, and a Table inside a container moves with it, not by itself ──
  if custom.containment_parent(v_t.data) is not null then
    select coalesce(nullif(btrim(p.data ->> 'name'), ''), nullif(btrim(p.data ->> 'title'), ''), 'another record'),
           (p.table_id is null or p.data_class = 'kernel'
            or exists (select 1 from custom.record k where k.id = p.table_id and k.data_class = 'kernel'))
           and p.table_id is distinct from v_tables
      into v_shared, v_home_like
      from custom.record p
     where p.organization_id = v_org and p.id = custom.containment_parent(v_t.data);
    if not coalesce(v_home_like, true) then
      v_general := v_general || format('%s lives inside %s, so it moves with that, not by itself.',
                                       v_name, coalesce(v_shared, 'another record'));
    end if;
  end if;

  -- ── the carry set: a CLOSURE (SC-1-TAILS). What is inside what moves, moves with it. ──
  -- Each round adds (a) the choice lists only the carried tables' columns use, and (b) every
  -- Table — live or in the trash — whose home is a carried Table or a row of one. It stops when
  -- a round adds nothing, or at the containment ceiling, which is then said.
  v_carry_t := array[p_table_id];
  loop
    v_round := v_round + 1;
    select coalesce(array_agg(distinct o.id), array[]::uuid[]) into v_add
      from custom.record f
      join custom.record o
        on o.organization_id = v_org
       and o.id = nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid
       and o.table_id = v_tables
     where f.organization_id = v_org and f.table_id = v_fieldk
       and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t)
       and not (o.id = any (v_carry_t))
       and coalesce((o.data ->> 'kept_by_the_app')::boolean, false)
       and not exists (select 1 from custom.record g
                        where g.organization_id = v_org and g.table_id = v_fieldk
                          and g.deleted_at is null
                          and g.data -> 'config' ->> 'options_table_id' = o.id::text
                          and not (coalesce(nullif(g.data ->> 'entity_definition_id', '')::uuid,
                                            '00000000-0000-0000-0000-000000000000'::uuid) = any (v_carry_t)));
    v_carry_t := v_carry_t || v_add;

    select coalesce(array_agg(t2.id), array[]::uuid[]) into v_add
      from custom.record t2
     where t2.organization_id = v_org and t2.table_id = v_tables and t2.data_class = 'table'
       and not (t2.id = any (v_carry_t))
       and custom.containment_parent(t2.data) is not null
       and (custom.containment_parent(t2.data) = any (v_carry_t)
            or exists (select 1 from custom.record x
                        where x.organization_id = v_org
                          and x.id = custom.containment_parent(t2.data)
                          and x.table_id = any (v_carry_t)));
    v_inside := v_inside + coalesce(array_length(v_add, 1), 0);
    v_carry_t := v_carry_t || v_add;

    exit when coalesce(array_length(v_add, 1), 0) = 0;
    if v_round >= v_ceiling then
      v_general := v_general || format(
        'Tables are nested more than %s deep inside %s, which is deeper than the store keeps things inside things. Take the innermost ones out first.',
        v_ceiling, v_name);
      exit;
    end if;
  end loop;

  -- Choice lists it shares with a Table that stays: named, refused.
  for r in
    select distinct coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      join custom.record g
        on g.organization_id = v_org and g.table_id = v_fieldk and g.deleted_at is null
       and g.data -> 'config' ->> 'options_table_id' = f.data -> 'config' ->> 'options_table_id'
       and not (coalesce(nullif(g.data ->> 'entity_definition_id', '')::uuid,
                         '00000000-0000-0000-0000-000000000000'::uuid) = any (v_carry_t))
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(g.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t)
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
     limit 3
  loop
    v_general := v_general || format(
      'Its %s column shares its choices with %s, which stays in %s. Give one of them its own choices first.',
      r.col, r.other, v_org_name);
  end loop;

  select coalesce(array_agg(f.id), array[]::uuid[]) into v_fields
    from custom.record f
   where f.organization_id = v_org and f.table_id = v_fieldk
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_recs
    from custom.record x
   where x.organization_id = v_org and x.table_id = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_others
    from custom.record x
   where x.organization_id = v_org
     and not (x.id = any (v_carry_t))
     and (   (x.data_class = 'rule'               and nullif(x.data ->> 'scope_table_id', '')::uuid   = any (v_carry_t))
          or (x.data_class = custom.dashboard_class() and nullif(x.data ->> 'subject_table_id', '')::uuid = any (v_carry_t))
          or (x.data_class = 'doc_template'       and nullif(x.data ->> 'renders_table_id', '')::uuid = any (v_carry_t))
          or (x.data_class = 'checklist_template' and nullif(x.data ->> 'about_table_id', '')::uuid   = any (v_carry_t))
          -- a relation record is filed with the row it starts at (REL-12): it moves with its
          -- `from`; one whose `to` stays is judged below.
          or (x.data_class = 'relation'
              and nullif(x.data ->> 'from', '')::uuid = any (v_recs)));

  v_all := v_carry_t || v_fields || v_recs || v_others;

  -- ── a COLUMN whose target stays, or a column that stays pointing in (SC-1-TAILS, chair ruling
  -- 2026-09-24): the same wall as a row link — it holds across organizations when the Table it
  -- STARTS at allows links to other organizations and both organizations have turned links on
  -- (asked per destination below); the store's own kernel Tables are shared and never cross ──
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table,
           coalesce(nullif(btrim(mt.data ->> 'name'), ''), 'a table') as of_name,
           coalesce((mt.data ->> 'cross_organization_relations')::boolean, false) as allowed
      from custom.record f
      join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'relation_target', '')::uuid
       and ot.data_class <> 'kernel'
      left join custom.record mt
        on mt.organization_id = v_org and mt.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.id = any (v_fields) and f.deleted_at is null
       and not (nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t))
  loop
    v_cols_n := v_cols_n + 1;
    if not r.allowed then
      v_general := v_general || format(
        '%s column links to %s, which stays in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove that column first.',
        case when r.of_table = p_table_id then 'Its ' || r.col else r.of_name || '''s ' || r.col end,
        r.other, v_org_name, r.of_name, r.of_name);
    end if;
  end loop;
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other,
           coalesce((ot.data ->> 'cross_organization_relations')::boolean, false) as allowed
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and not (f.id = any (v_fields))
       and nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t)
  loop
    v_cols_n := v_cols_n + 1;
    if not r.allowed then
      v_general := v_general || format(
        '%s links to this table through its %s column and stays in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove that column first.',
        r.other, r.col, v_org_name, r.other, r.other);
    end if;
  end loop;

  -- ── a relation VALUE between a moving row and a row that stays (REC-29 / VIS-34) ──
  -- It holds across the wall where the wall is open: the Table it STARTS at allows links to other
  -- organizations, and both organizations have turned links on (asked per destination below).
  -- An OWNED relation record is containment, and containment never crosses.
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.data_class = 'relation' and x.deleted_at is null
                and coalesce(x.data ->> 'kind', '') = 'owned'
                and ((nullif(x.data ->> 'from', '')::uuid = any (v_recs))
                     <> (nullif(x.data ->> 'to', '')::uuid = any (v_recs)))) then
    v_general := v_general || format(
      'Some of its rows own, or are owned by, rows that stay in %s. What is inside something moves with it, so take them apart first.',
      v_org_name);
  end if;
  with crossing as (
    -- the edges of relation columns (platform.associations, one fact with the value)
    select a.source_id as src, a.target_id as tgt
      from platform.associations a
     where a.deleted_at is null and a.relation_field_id is not null
       and a.source_type = 'record' and a.target_type = 'record'
       and ((a.source_id = any (v_recs)) <> (a.target_id = any (v_recs)))
       and exists (select 1 from custom.record o where o.organization_id = v_org
                    and o.id = case when a.source_id = any (v_recs) then a.target_id else a.source_id end)
    union all
    -- referenced relation records
    select nullif(x.data ->> 'from', '')::uuid, nullif(x.data ->> 'to', '')::uuid
      from custom.record x
     where x.organization_id = v_org and x.data_class = 'relation' and x.deleted_at is null
       and coalesce(x.data ->> 'kind', '') <> 'owned'
       and ((nullif(x.data ->> 'from', '')::uuid = any (v_recs))
            <> (nullif(x.data ->> 'to', '')::uuid = any (v_recs)))
  )
  select count(*)::integer,
         (select coalesce(nullif(btrim(st.data ->> 'name'), ''), 'a table')
            from crossing c2
            join custom.record s  on s.organization_id = v_org and s.id = c2.src
            join custom.record st on st.organization_id = v_org and st.id = s.table_id
           where not coalesce((st.data ->> 'cross_organization_relations')::boolean, false)
           limit 1)
    into v_cross_n, v_cross_shut
    from crossing;
  if v_cross_shut is not null then
    v_general := v_general || format(
      'Some of its rows are linked to rows that stay in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove those links first.',
      v_org_name, v_cross_shut, v_cross_shut);
  end if;

  -- ── containment across the edge of what moves ──
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.id = any (v_recs)
                and custom.containment_parent(x.data) is not null
                and not (custom.containment_parent(x.data) = any (v_all))) then
    v_general := v_general || 'Some of its rows live inside records of another table. Take them out first.'::text;
  end if;
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.table_id <> v_tables and x.deleted_at is null
                and not (x.id = any (v_all))
                and custom.containment_parent(x.data) = any (v_recs)) then
    v_general := v_general || 'Records of other tables live inside its rows. Take them out first.'::text;
  end if;

  -- ── what else in the organization still uses it ──
  for r in
    select p.title from custom.portal p
     where p.organization_id = v_org and p.archived_at is null
       and (p.client_table_id = any (v_carry_t)
            or exists (select 1 from custom.portal_table pt
                        where pt.portal_id = p.id and pt.table_id = any (v_carry_t)))
     limit 3
  loop
    v_general := v_general || format(
      'The client portal "%s" shows it. Take it out of that portal first.', r.title);
  end loop;
  if exists (select 1 from iam.permissions g
              where g.resource_type = 'record' and g.resource_id = any (v_carry_t)
                and g.granted_to_organization_id = v_org
                and g.status <> 'rejected'
                and (g.expires_at is null or g.expires_at > now())) then
    v_general := v_general || format(
      'It is shared with everyone in %s. Stop sharing it with the whole organization first, so nobody keeps access by accident.',
      v_org_name);
  end if;
  v_idre := array_to_string(array(select x::text from unnest(v_carry_t || v_fields) x), '|');
  for r in
    select x.data_class as cls,
           coalesce(nullif(btrim(x.data ->> 'name'), ''), nullif(btrim(x.data ->> 'label'), ''), 'something') as nm,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), null) as of_table
      from custom.record x
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = x.table_id and ot.table_id = v_tables
     where x.organization_id = v_org and x.deleted_at is null
       and x.table_id is distinct from v_fieldk            -- a column of another table is named above
       and not (x.id = any (v_all))
       -- A row of a table THE APP keeps (its own bookkeeping — the older saved-views copy, a
       -- choice list) follows the table by id and holds nothing in place.
       and not (ot.id is not null
                and coalesce((custom.table_placement(ot.organization_id, ot.id, ot.data, false) ->> 'kept_by_the_app')::boolean, false))
       -- A relation record whose `to` is a moving row is judged above, as a link.
       and x.data_class is distinct from 'relation'
       and x.data::text ~ v_idre
     limit 3
  loop
    v_general := v_general || format(
      '%s "%s"%s still uses it and stays in %s. Change it first.',
      initcap(replace(case r.cls when 'record' then 'row' else r.cls end, '_', ' ')),
      r.nm,
      case when r.of_table is not null and r.cls = 'record' then format(' of %s', r.of_table) else '' end,
      v_org_name);
  end loop;

  -- ── where it may go: every organization this person belongs to, but this one ──
  for r in
    -- UI-FIX-19: the web address rides along, so a screen can tell two same-named organizations apart.
    select o.id, o.name::text as name, o.slug::text as slug, m.role::text as role
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = p_me and o.id <> v_org
     order by o.name
  loop
    v_to_why := null;
    if not custom.store_is_open(r.id) then
      v_to_why := format('%s does not keep its data in the record store yet.', r.name);
    elsif exists (select 1 from custom.record d
                   where d.organization_id = r.id and d.table_id = v_tables and d.deleted_at is null
                     and lower(coalesce(d.data ->> 'slug', d.data ->> 'name'))
                       = lower(coalesce(v_t.data ->> 'slug', v_t.data ->> 'name'))) then
      v_to_why := format('%s already has a table called %s. Rename one of them first.', r.name, v_name);
    elsif v_cross_n + v_cols_n > 0 and not custom.cross_organization_links_open(v_org, r.id) then
      -- THE WALL IS ASKED OF BOTH ORGANIZATIONS, and the sentence says which is shut.
      v_to_why := format(
        '%s, and links between organizations need both to allow them: %s. Turn on "Links to other organizations" there, or remove those links first.',
        case when v_cross_n > 0 then format('Some of its rows are linked to rows that stay in %s', v_org_name)
             else format('Some of its columns link to tables that stay in %s', v_org_name) end,
        case when not custom.cross_organization_links_open(v_org, v_org) and not custom.cross_organization_links_open(r.id, r.id)
               then format('neither %s nor %s does', v_org_name, r.name)
             when not custom.cross_organization_links_open(v_org, v_org)
               then format('%s does not', v_org_name)
             else format('%s does not', r.name) end);
    end if;
    v_dest := v_dest || jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'role', r.role,
                                           'ok', v_to_why is null, 'why', v_to_why);
  end loop;

  v_counts := jsonb_build_object(
    'fields',  (select count(*) from custom.record f where f.organization_id = v_org and f.id = any (v_fields)
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id and f.deleted_at is null),
    'records', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is null),
    'in_trash', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is not null),
    'choice_lists', greatest(coalesce(array_length(v_carry_t, 1), 1) - 1 - v_inside, 0),
    'with_it', coalesce(array_length(v_others, 1), 0),
    -- SC-1-TAILS: what rides along because it lives inside, and the links that will reach back.
    'tables_inside', v_inside,
    'links_across', v_cross_n,
    'columns_across', v_cols_n);

  return jsonb_build_object(
    'table',        jsonb_build_object('id', p_table_id, 'name', v_name, 'version', v_t.version),
    'organization', jsonb_build_object('id', v_org, 'name', v_org_name),
    'may_move',     v_may,
    'why_not',      v_why_not,
    'held_by',      to_jsonb(v_general),
    'destinations', v_dest,
    'carries',      v_counts,
    -- internal: the ids that move. The doors strip this before a client reads the answer.
    '_carry',       jsonb_build_object('tables', to_jsonb(v_carry_t), 'fields', to_jsonb(v_fields),
                                       'records', to_jsonb(v_recs), 'others', to_jsonb(v_others)));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.portal_admits(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  return (
  -- ONE SENTENCE, ONE PLACE. VIS-31 says an external principal is a signed-in person with
  -- no membership of an organization and that Visibility alone decides what
  -- they see. This asks the narrower question the doors need: is this person an outsider
  -- THIS organization has deliberately let in, right now.
  --
  -- The knob is read here and not at each call site, so no surface can invent a second
  -- answer. While `custom/external_principal_enabled` resolves false for an organization
  -- this returns false for everybody in it and every door refuses by name, which is
  -- exactly the answer the platform gave before this file.
  select (coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and (
       -- ARM 1 — A PORTAL PRINCIPAL. The organization named this person, through a live
       -- portal, as somebody whose own records live here (PORTAL, 2026-09-20).
       exists (
         select 1
           from custom.portal_principal pp
           join custom.portal p on p.id = pp.portal_id and p.is_active
          where pp.organization_id = p_organization_id
            and pp.user_id = coalesce(p_user_id, (select auth.uid()))
            and pp.user_id is not null
            and pp.is_active)

       -- ARM 2 — A TABLE OF THIS ORGANIZATION IS SHARED WITH THIS PERSON (SHARE-OUT,
       -- 2026-09-21). The everyday case: a plumber gives one customer read-only access to
       -- the Jobs table; a lab shares one experiments table with a collaborator at another
       -- university. A grant addressed to this person, on a row that IS a Table of this
       -- organization, is that organization saying — explicitly, on the record — that this
       -- outsider may reach its doors.
       --
       -- 🚨 THE GRANT IS THE ADMISSION, AND THAT IS THE WHOLE POINT. There is no second
       -- row: revoking the grant revokes the admission in the same statement, so a revoke
       -- can never leave somebody standing in the doorway. It is deliberately NOT a new
       -- guest table — schema `custom` already has one guest system and a second would be
       -- two answers to one question.
       --
       -- IT ADMITS AND NOTHING MORE. The next line of every door is the ladder, and the
       -- ladder reads this person's grants: this arm cannot show them a single row the
       -- grant does not already carry. In particular it confers no membership, so
       -- `iam.people_lists_a_non_member_can_read` is untouched and the organization's
       -- member list stays shut to them.
       or exists (
         select 1
           from iam.permissions g
           join custom.record t
             on t.id = g.resource_id
            and t.organization_id = p_organization_id
            and t.table_id = custom.table_kernel_id()
            and t.deleted_at is null
          where g.resource_type = 'record'
            and g.granted_to_user_id = coalesce(p_user_id, (select auth.uid()))
            and g.granted_to_user_id is not null
            and g.status = 'active'
            and (g.expires_at is null or g.expires_at > now()))
     ))
    -- ARM 3 — A SCOPE MEMBERSHIP ON ONE OF THIS ORGANIZATION'S RECORDS (lane SC-3', P7's read
    -- arm, 2026-09-24). A student the tutoring company admitted to one class. Outside the
    -- external-principal gate on purpose: that knob is the organization's answer about sharing
    -- with strangers, and this person was named on the record by the organization itself.
    -- `custom/scope_members_admitted` is where an organization says no. Like arm 2 it ADMITS
    -- AND NOTHING MORE: the ladder's arm 4 decides which records, and only at viewer.
    or (coalesce((platform.knob_resolve('custom', 'scope_members_admitted', p_organization_id) #>> '{}')::boolean, true)
        and exists (
          select 1
            from iam.memberships m
            join custom.record r
              on r.id = m.container_id
             and r.organization_id = p_organization_id
             and r.deleted_at is null
           where m.container_type = 'scope'
             and m.user_id = coalesce(p_user_id, (select auth.uid()))
             and m.user_id is not null
             and m.status = 'active'
             and m.deleted_at is null))
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.cvx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- THE PROBE RUNS ONCE. This function calls cvx_list_scoped once per scope
  -- and once per organization (fifteen times for a twelve-org account), and
  -- each call used to re-run the ~1.7 s message-body probe: 11.2 s measured,
  -- a statement timeout from the page. The hit set is computed here, once,
  -- and handed to every call as p_filters->'__deep_hits'.
  IF v_search IS NOT NULL
     AND public.cvx_search_is_deep(v_search, p_deep)
     AND NOT (v_filters ? '__deep_hits') THEN
    v_filters := v_filters || jsonb_build_object(
      '__deep_hits',
      coalesce((SELECT jsonb_agg(h) FROM public.cvx_deep_hits(v_search) AS h), '[]'::jsonb));
  END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.cvx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, v_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown. Labels come from THIS query,
  -- never a Redux slice — a tab bar must be self-sufficient.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.cvx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, v_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fork_processed_document(p_source_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Name the organization your copy belongs to.'
    USING ERRCODE = '23502',
          HINT = 'Call fork_processed_document(p_source_id, p_organization_id). This one-argument door used to file the copy in an organization the database chose for the caller, which is a choice nobody made.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_share_capabilities(p_resource_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record;
  v_visibility_column text;
  v_boolean_column text;
  v_org_column text;
  v_oid oid;
  v_body_not_public boolean := false;
begin
  select *
  into v_r
  from platform.shareable_resource_registry
  where resource_type = p_resource_type
    and is_active;

  if not found then
    raise exception 'Unknown shareable resource token: %. Pass platform.entity_types.token; bare table names are not accepted.', p_resource_type
      using errcode = 'P0001';
  end if;

  v_oid := to_regclass(format('%I.%I', v_r.schema_name, v_r.table_name));
  if v_oid is not null then
    select exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
      where c.conrelid = v_oid
        and c.contype = 'c'
        and a.attname = 'visibility'
        and pg_get_constraintdef(c.oid) ilike '%public%'
    ) into v_body_not_public;
  end if;

  select c.column_name
  into v_visibility_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name in ('visibility', 'card_visibility')
    and not (v_body_not_public and c.column_name = 'visibility')
  order by case c.column_name
    when 'visibility' then 0
    when 'card_visibility' then 1
    else 2
  end
  limit 1;

  select c.column_name
  into v_boolean_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name = v_r.is_public_column
    and c.data_type = 'boolean'
  limit 1;

  -- THE THING'S OWN HOME (2026-09-26): the Share dialog compares it with the viewer's personal
  -- workspace, so "My organization" / "Add everyone in …" are never offered for a thing whose
  -- only organization is its owner's own — for every kind, not only mandates.
  select c.column_name
  into v_org_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name = 'organization_id'
  limit 1;

  return jsonb_build_object(
    'organization_column', v_org_column,
    'supports_public',
      v_visibility_column is not null or v_boolean_column is not null,
    'is_link_shareable', coalesce(v_r.is_link_shareable, false),
    'public_state_column', coalesce(v_visibility_column, v_boolean_column),
    'public_state_kind', case
      when v_visibility_column is not null then 'enum'
      when v_boolean_column is not null then 'boolean'
      else null
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_ssr_shell_data(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (auth.role() = 'service_role' or p_user_id = ( SELECT auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  return (
    with member_orgs as (
      select o.id, o.name, o.slug, m.role, o.created_at
      from iam.memberships m
      join iam.organizations o on o.id = m.container_id
      where m.user_id = p_user_id
        and m.container_type = 'organization'
        and m.status = 'active'
        and m.deleted_at is null
    ),
    default_pref as (
      select nullif(
        preferences #>> '{organization,defaultOrganizationId}',
        ''
      )::uuid as default_org_id
      from users.user_preferences
      where user_id = p_user_id
      limit 1
    )
    select json_build_object(
      'is_admin', (
        select exists(
          select 1 from admin.admins where user_id = p_user_id
        )
      ),
      'preferences_exists', (
        select exists(
          select 1
          from users.user_preferences
          where user_id = p_user_id
        )
      ),
      'preferences', (
        select preferences
        from users.user_preferences
        where user_id = p_user_id
        limit 1
      ),
      'ai_models', (
        select coalesce(json_agg(row_to_json(model_row)), '[]'::json)
        from (
          select md.*, p.name as maker
          from ai.model_definition md
          left join ai.provider p on p.id = md.provider_id
          where md.is_deprecated = false
          order by md.common_name asc
        ) model_row
      ),
      -- Legacy prompt-system context menu retired 2026-08-20 (graveyard drop sweep).
      -- Live menu: agent.context_menu_view via /api/agent-context-menu. No client reads this key.
      'context_menu', '[]'::json,
      'sms_unread_total', (
        select coalesce(sum(unread_count), 0)::int
        from communication.sms_conversations
        where user_id = p_user_id and status = 'active'
      ),
      'organizations', (
        select coalesce(
          json_agg(
            json_build_object(
              'id', member_orgs.id,
              'name', member_orgs.name,
              'slug', member_orgs.slug,
              'role', member_orgs.role
            )
            order by member_orgs.name asc
          ),
          '[]'::json
        )
        from member_orgs
      ),
      'active_organization_id', coalesce(
        (
          select member_orgs.id
          from member_orgs
          where member_orgs.id = (select default_org_id from default_pref)
          limit 1
        ),
        (
          select member_orgs.id
          from member_orgs
          where (select count(*) from member_orgs) = 1
          limit 1
        )
      )
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project/scope of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[]; v_scope_ids uuid[];
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
      v_scope_ids   := iam.accessible_entity_ids('scope', 'viewer'::public.permission_level);
    end if;
    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    org_scope_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object('id',st.id,'label_singular',st.label_singular,'label_plural',st.label_plural,'icon',st.icon,'color',st.color,'sort_order',st.sort_order,'parent_type_id',st.parent_type_id,'max_assignments_per_entity',st.max_assignments_per_entity) order by st.sort_order) as types
        from context.scope_types st where st.organization_id in (select id from user_orgs) and st.deleted_at is null group by st.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.scope_type_id,'parent_scope_id',s.parent_scope_id,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order, s.name) as scopes
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null
          and (case when v_self then s.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', s.id, 'viewer'::public.permission_level) end) group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations_live sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null
                  and (case when v_self then sc.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', sc.id, 'viewer'::public.permission_level) end)), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_hierarchy()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'role', om.role::text,
        'project_count', (select count(*) from workspace.projects p where p.organization_id = o.id
          and exists (select 1 from iam.memberships pm where pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null))
      ) order by o.name asc) from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = uid
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'organization_id', p.organization_id,
        'role', pm.role::text,
        'topic_count', (select count(*) from platform.associations_live a
           join research.rs_topic rt on rt.id = a.source_id and rt.deleted_at is null
           where a.source_type='research_topic' and a.target_type='project' and a.target_id = p.id))
      order by p.name asc) from workspace.projects p join iam.memberships pm on pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null
        left join iam.organizations po on po.id = p.organization_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_nav_tree(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_result jsonb; v_self boolean; v_project_ids uuid[];
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- 🚨 DD-192: p_user_id NAMES A PERSON, AND UNTIL 2026-09-13 NOBODY CHECKED IT WAS
  -- THE CALLER. `coalesce(p_user_id, auth.uid())` reads as a convenience default;
  -- in a SECURITY DEFINER function granted to `authenticated` it is an argument
  -- that REPLACES the caller. Any signed-in user passed a stranger's id and got
  -- that stranger's whole navigation tree back: every organization they belong
  -- to, their role in each, and every project inside. Proven live against
  -- admin@admin.com's organizations as test@test.com and as a user who is a
  -- member of nothing. The guard is the one the rest of the p_user_id family
  -- already uses, word for word.
  if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  -- rca5d_e: the kernel's set form, once, when the caller answers for herself (see get_user_full_context).
  v_self := v_uid IS NOT DISTINCT FROM (SELECT auth.uid());
  IF v_self THEN
    v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
  END IF;
  WITH user_orgs AS (
    SELECT o.id, o.name, o.slug, om.role::text AS role
    FROM iam.organizations o JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = v_uid
  ), org_projects AS (
    SELECT p.id, p.name, p.slug, p.organization_id
    FROM workspace.projects p
    WHERE p.organization_id IN (SELECT id FROM user_orgs)
      -- RC-A5d (rca5d_c): an organization's projects are listed only when the person may open them
      -- (a member read the names of projects they could not open here).
      AND (CASE WHEN v_self THEN p.id = ANY(v_project_ids) ELSE iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) END)
  )
  SELECT jsonb_build_object('organizations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', uo.id, 'name', uo.name, 'slug', uo.slug, 'role', uo.role,
      'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'slug', op.slug) ORDER BY op.name) FROM org_projects op WHERE op.organization_id = uo.id), '[]'::jsonb))
    ORDER BY uo.name ASC) FROM user_orgs uo), '[]'::jsonb))
  INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_scopes(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_result jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    with user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o
        join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    type_scopes as (
        select s.scope_type_id,
            jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'parent_scope_id', s.parent_scope_id)
                order by s.sort_order, s.name) as scopes
        from context.scopes s
        where s.organization_id in (select id from user_orgs) and s.deleted_at is null
        group by s.scope_type_id
    ),
    org_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object(
                'id', st.id, 'label_singular', st.label_singular, 'label_plural', st.label_plural,
                'icon', st.icon, 'color', st.color, 'sort_order', st.sort_order, 'parent_type_id', st.parent_type_id,
                'max_assignments_per_entity', st.max_assignments_per_entity,
                'scopes', coalesce(ts.scopes, '[]'::jsonb)
            ) order by st.sort_order, st.label_plural) as scope_types
        from context.scope_types st
        left join type_scopes ts on ts.scope_type_id = st.id
        where st.organization_id in (select id from user_orgs) and st.deleted_at is null
        group by st.organization_id
    )
    select jsonb_build_object('organizations',
        coalesce(jsonb_agg(jsonb_build_object(
            'id', uo.id, 'name', uo.name, 'slug', uo.slug, 'role', uo.role,
            'scope_types', coalesce(ot.scope_types, '[]'::jsonb)
        ) order by uo.name asc), '[]'::jsonb)
    ) into v_result
    from user_orgs uo left join org_types ot on ot.organization_id = uo.id;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.hr_invite_accept(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_inv iam.invitations; v_employee uuid; v_org uuid;
  v_existing uuid; v_accept record;
begin
  if v_uid is null then
    raise exception 'hr_invite_accept: no authenticated caller' using errcode = '42501';
  end if;

  -- accept through the canonical primitive: it validates the token, the expiry, the email match,
  -- and writes the membership. Everything below is only the HR half.
  begin
    select * into v_accept from public.inv_accept(p_token, p_hr_half_handled => true);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'invitation_not_usable',
      'detail', 'That invitation is not valid for this account. It may have expired, been used '
             || 'already, or been issued to a different email address.');
  end;

  select * into v_inv from iam.invitations i where i.token = p_token;
  v_employee := nullif(v_inv.metadata ->> 'hr_employee_id','')::uuid;
  v_org := coalesce(nullif(v_inv.metadata ->> 'hr_organization_id','')::uuid, v_inv.organization_id);

  -- a plain org invitation accepted through this door is not an error; it simply has no HR half.
  if v_employee is null then
    return jsonb_build_object('ok', true, 'hr_linked', false,
      'organization_id', v_inv.organization_id,
      'detail', 'You have joined the organization. This invitation was not tied to an employee record.');
  end if;

  select e.login_user_id into v_existing from hr.employee e where e.id = v_employee;

  -- somebody else already claimed this record: never silently repoint a person's login.
  if v_existing is not null and v_existing is distinct from v_uid then
    return jsonb_build_object('ok', false, 'reason', 'employee_already_linked',
      'organization_id', v_org,
      'detail', 'That employee record is already linked to a different account. An HR '
             || 'administrator needs to sort this out before it can be linked to yours.');
  end if;

  if v_existing is null then
    perform hr.arm_write();
    -- 🚨 THIS UPDATE IS THE POINT. `_zzz_derive_grants` fires `AFTER UPDATE OF login_user_id` and
    -- re-derives every grant for this person's spells — the half of §4.1 node L2 that already
    -- existed and had never once run, because every other writer sets the column at INSERT.
    update hr.employee set login_user_id = v_uid where id = v_employee;
  end if;

  perform hr._l1_write_audit(v_org, 'hr_employee', 'invite_accepted', ARRAY[v_employee],
                             (hr.employment_as_of(v_employee, current_date)).id, 'login');

  return jsonb_build_object(
    'ok', true, 'hr_linked', true,
    'employee_id', v_employee,
    'organization_id', v_org,
    'login_user_id', v_uid,
    'grants_rederived', true,
    -- 🚨 THE DOOR CARRIES THE EMPLOYER. Accepting creates a second employer for anybody who
    -- signed up with their own organization, and `hr_my_context` rightly refuses to guess
    -- between two. Without the organization on the door, a brand-new employee lands on a
    -- prompt to switch HR on at a company that is not their employer.
    'door', '/hr/me?org=' || v_org::text);
end
$function$;

CREATE OR REPLACE FUNCTION iam._record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_data_class text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_user_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_permission_id uuid DEFAULT NULL::uuid, p_grant_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_emergency_door boolean DEFAULT true, p_actor_user_id uuid DEFAULT NULL::uuid, p_granted_to_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid()); v_org uuid := p_organization_id;
begin
  -- 🚨 NO-BACKSTOP (AD229, 2026-09-15). iam.access_audit no longer carries
  -- `_stamp_org_default`, so THIS writer supplies the organization. Every caller today passes
  -- a non-null one (iam.emergency_door_open / _approve / _deny and public.hr_break_glass all
  -- refuse before they get here when the target row has no organization), which is why the
  -- trigger has never actually fired on this path. A future caller that forgets does NOT get a
  -- silent 23502 that loses an audit row, and does NOT get an organization stamped on a
  -- platform record: the row goes to the platform tenant and the omission SCREAMS by name.
  if v_org is null then
    select so.organization_id into v_org from iam.system_orgs so where so.key = 'system';
    if v_org is null then
      raise exception 'iam._record_access_audit: no organization was supplied and iam.system_orgs has no row keyed ''system'', so this audit row has no tenant to belong to'
        using errcode = '22023';
    end if;
    raise warning 'iam._record_access_audit: a caller recorded a % row about % with NO organization_id. Attributed to the platform tenant. FIX THE CALLER: the writer supplies the organization (NO-BACKSTOP law).',
      p_action, p_target_token;
  end if;
  -- 🚨 THE TWO-PERSON ACTION MUST SAY WHO THE KEY IS FOR. `approved` is the only action whose
  -- actor and grantee are different people by construction, so the convenience default is a
  -- LIE there and is refused rather than silently taken.
  if p_action = 'approved' and p_granted_to_user_id is null then
    raise exception 'iam._record_access_audit: an `approved` row must name the person the key was minted FOR — the approver is not the reader'
      using errcode = '22023',
            hint = 'Pass p_granted_to_user_id (the requester). Defaulting it to the actor is what told a subject the wrong name on her own access page (V-38, 2026-09-12).';
  end if;

  -- 🚨 DD-213c: THIS ORGANIZATION'S LOG RECORDS ITS OWN PEOPLE. Until 2026-09-14 a
  -- signed-in stranger who named any organization's row got a refusal from the
  -- emergency door AND a row in that organization's access log — repeatably, from
  -- any free account, with ids that are not secrets. The test is DD-213b's one
  -- rule: standing in the employer, or a pending invitation it issued. A granted
  -- row is never suppressed, and the anonymous lane is untouched.
  if coalesce(p_granted, false) = false
     and v_actor is not null
     and p_organization_id is not null
     and not hr._has_audit_standing(v_actor, p_organization_id) then
    return null;
  end if;

  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, granted_to_user_id, created_by, visibility)
  values
    (v_org, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     coalesce(p_granted_to_user_id, v_actor),
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION iam.access_request_recipients(p_type text, p_id uuid)
 RETURNS TABLE(user_id uuid, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_cur_type    text := p_type;
  v_cur_id      uuid := p_id;
  v_meta        record;
  v_relid       oid;
  v_owner_col   text;
  v_org_col     text;
  v_owner       uuid;
  v_org         uuid;
  v_exists      boolean;
  v_is_container     boolean;
  v_is_pure_container boolean;
  v_hops        int  := 0;
  v_via         text := '';
  v_ids         uuid[] := '{}';
  v_reasons     text[] := '{}';
  v_lane_ids    uuid[];
  v_parent_type text;
  v_fk          text;
  v_parent_id   uuid;
begin
  if p_type is null or p_id is null then
    return;
  end if;

  <<walk>>
  while v_hops <= 6 loop
    select et.schema_name, et.table_name into v_meta
    from platform.entity_types et
    where et.token = v_cur_type and coalesce(et.is_active, true)
    limit 1;
    exit walk when v_meta.schema_name is null;

    begin
      v_relid := format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass;
    exception when others then
      exit walk;
    end;

    begin
      execute format('select true from %I.%I where id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_exists using v_cur_id;
    exception when others then
      v_exists := null;
    end;
    exit walk when not coalesce(v_exists, false);

    -- Resolve the shape from the catalog rather than guessing a fixed tuple.
    select case when bool_or(a.attname = 'created_by') then 'created_by'
                when bool_or(a.attname = 'owner_id')   then 'owner_id' end,
           case when bool_or(a.attname = 'organization_id') then 'organization_id' end
      into v_owner_col, v_org_col
    from pg_attribute a
    where a.attrelid = v_relid and a.attnum > 0 and not a.attisdropped;

    v_owner := null;
    v_org   := null;
    if v_owner_col is not null or v_org_col is not null then
      begin
        execute format('select %s, %s from %I.%I where id = $1',
                       coalesce(v_owner_col, 'null::uuid'),
                       coalesce(v_org_col,   'null::uuid'),
                       v_meta.schema_name, v_meta.table_name)
          into v_owner, v_org using v_cur_id;
      exception when others then
        v_owner := null; v_org := null;
      end;
    end if;

    -- A membership container: the same question iam.has_access_for_base's
    -- membership lane asks, so the ask lands on the people access already admits.
    v_is_container := exists (
      select 1 from iam.memberships m
      where m.container_type = v_cur_type and m.deleted_at is null
    );

    -- A PURE container is one whose access model is membership INSTEAD of
    -- ownership -- a container that is not a shareable resource. Live: only
    -- `organization`. Its created_by is not authority (transfer_organization_
    -- ownership moves the membership and never touches that column), so the owner
    -- lane is suppressed for it and ONLY for it.
    v_is_pure_container := v_is_container and not exists (
      select 1 from platform.shareable_resource_registry sr
      where sr.resource_type = v_cur_type
    );

    -- Lane A -- container admins.
    if v_is_container then
      select array_agg(distinct m.user_id) into v_lane_ids
      from iam.memberships m
      join iam.membership_grant g
        on g.member_role = m.role and g.container_type in (v_cur_type, '*')
      where m.container_type = v_cur_type
        and m.container_id   = v_cur_id
        and m.deleted_at is null
        and coalesce(m.status, 'active') = 'active'
        and g.confers >= 'admin'::public.permission_level;
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'container_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    end if;

    -- Lane B -- the row's own owner (every token except a pure container).
    if not v_is_pure_container and v_owner is not null then
      v_ids     := v_ids     || array[v_owner];
      v_reasons := v_reasons || array[v_via || 'owner'];
    end if;

    -- Lane C -- the owning organization's admins.
    if v_org is not null then
      select array_agg(distinct om.user_id) into v_lane_ids
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id
      where om.organization_id = v_org
        and om.role in ('owner', 'admin');
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'org_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    end if;

    -- Lane D -- explicit admin-level grantees (they can already decide).
    select array_agg(distinct u) into v_lane_ids
    from (
      select p.granted_to_user_id as u
      from iam.permissions p
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_user_id is not null
      union
      select om.user_id
      from iam.permissions p
      join iam.organization_member om on om.organization_id = p.granted_to_organization_id
      join iam.organizations o on o.id = om.organization_id
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_organization_id is not null
        and om.role in ('owner', 'admin')
    ) s;
    if v_lane_ids is not null then
      v_ids     := v_ids     || v_lane_ids;
      v_reasons := v_reasons || array_fill(v_via || 'admin_grant',
                                           array[cardinality(v_lane_ids)]);
    end if;

    exit walk when cardinality(v_ids) > 0;

    -- Lane E -- nobody on this row. Delegate to the composition parent.
    select er.parent_type, er.fk_column into v_parent_type, v_fk
    from platform.entity_relationships er
    where er.child_type = v_cur_type
      and er.kind in ('composition', 'containment')
    order by (er.kind = 'composition') desc, er.parent_type
    limit 1;
    exit walk when v_parent_type is null or v_fk is null;

    begin
      execute format('select %I from %I.%I where id = $1',
                     v_fk, v_meta.schema_name, v_meta.table_name)
        into v_parent_id using v_cur_id;
    exception when others then
      v_parent_id := null;
    end;
    exit walk when v_parent_id is null;
    exit walk when (v_parent_type, v_parent_id) is not distinct from (v_cur_type, v_cur_id);

    v_via      := 'via_' || v_parent_type || ':';
    v_cur_type := v_parent_type;
    v_cur_id   := v_parent_id;
    v_hops     := v_hops + 1;
  end loop;

  return query
  select t.uid, min(t.rsn)
  from unnest(v_ids, v_reasons) as t(uid, rsn)
  where t.uid is not null
  group by t.uid;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.assert_may_transfer(p_token text, p_row_owner uuid, p_target_owner uuid, p_row_org uuid DEFAULT NULL::uuid, p_container_type text DEFAULT NULL::text, p_container_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid    := auth.uid();
  v_class  text;
  v_why    text;
  -- 🚨 DECLARED HERE, NOT INSIDE THE IF. The first version declared it in a nested block and read it
  -- after that block's `end` — where it is out of scope. It compiled, and it failed at RUN time with
  -- `column "v_kernel" does not exist`, on the ONE arm the migration's own proof never exercised:
  -- the bootstrap path, where a person claims their first membership in an organization they just
  -- created. A live rehearsal of organization creation found it; the proof had not.
  v_kernel boolean;
  -- 🚨 NO-BACKSTOP (AD229, 2026-09-15). This function's own audit row is the ONLY writer
  -- into iam.access_audit that could reach the table with organization_id NULL: p_row_org
  -- defaults to NULL, the column is NOT NULL, and the `_stamp_org_default` BEFORE-INSERT
  -- trigger was filling it from the REFUSED CALLER'S own organization -- so a refusal
  -- about someone else's row landed in the refused person's own workspace. Same answer as
  -- 0752 and as iam.class_allows two functions over: a door's own refusal record belongs to
  -- the platform tenant, READ from iam.system_orgs, never guessed and never trigger-assigned.
  v_org uuid;
  -- 🚨 AND THE RECORD IS NOT WRITTEN HERE (0765). This function ends by RAISING, so an insert
  -- it performs is rolled back with the caller: iam.access_audit held 0 rows with
  -- purpose='transfer_door' for the whole life of the door, and always would have. There is
  -- no autonomous transaction on this instance (0765 header: no dblink credential, no
  -- pg_background, and cron/net/GUC are all transactional). So the door hands the complete
  -- refusal out instead of swallowing it: a `raise warning` that survives the rollback in the
  -- server log, and this JSON in the exception's DETAIL, which the boundary that catches the
  -- 42501 passes to iam.record_transfer_refusal() in a transaction that commits.
  v_refusal jsonb;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_may_transfer: no token. A door asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- ARM 1 — the server itself. A service-role caller is not a browser and is not subject to a
  -- browser's class gate; it is subject to the code that holds the key.
  if coalesce(auth.role() = 'service_role', false) then return; end if;

  -- ARM 2 — a platform administrator, through the admin door that already audits itself (DD-136).
  if public.is_super_admin() then return; end if;

  -- ARM 3 — an owner or admin OF THE ROW'S OWN ORGANIZATION. This is the answer the three bespoke
  -- checks were each spelling differently; it is resolved here from the kernel's own predicate.
  if p_row_org is not null and v_uid is not null and iam.is_org_manager(p_row_org, v_uid) then
    return;
  end if;

  -- ARM 3b — an admin of the CONTAINER the row hangs off, asked of the kernel (iam.has_access), not
  -- accepted from the caller. A project admin who is not an organization manager lands here.
  if p_container_type is not null and p_container_id is not null and v_uid is not null then
    begin
      v_kernel := iam.has_access(p_container_type, p_container_id, 'admin'::public.permission_level);
    exception when others then
      -- The kernel could not answer. That is NOT a pass and NOT a silent skip: the arm is closed and
      -- the reason travels with the refusal below.
      v_kernel := false;
      perform set_config('iam.transfer_door_kernel_error', sqlerrm, true);
    end;
    if v_kernel then return; end if;
  end if;

  -- ARM 4 — NOTHING ACTUALLY MOVED. A "transfer" whose two ends are the same person is a claim, not
  -- a transfer: creating your own first membership in the organization you just created lands here,
  -- and refusing it would mean nobody could ever own anything.
  if v_uid is not null and p_row_owner is not distinct from v_uid
                       and p_target_owner is not distinct from v_uid then
    return;
  end if;

  -- ARM 5 — the owner handing their OWN row to somebody else, which only the data class may allow.
  if v_uid is not null and p_row_owner is not distinct from v_uid then
    if iam.class_allows(p_token, 'rewrite_owner', p_row_org) then return; end if;
    -- `iam.class_allows` already wrote the audit row and the reason; re-raise it verbatim so the
    -- person reads the class's own sentence and not a second, vaguer one.
    raise exception 'Refused: %',
      coalesce(nullif(current_setting('iam.class_gate_last_reason', true), ''),
               format('the data class of %L does not allow this row to be handed to someone else',
                      p_token))
      using errcode = '42501',
            detail  = format('token=%s action=rewrite_owner row_owner=%s target=%s',
                             p_token, p_row_owner, p_target_owner),
            hint    = 'This is the data class of the table, not a permission you can be granted.';
  end if;

  -- Nothing allowed it. Say which question failed, not "denied".
  select et.data_class::text into v_class
    from platform.entity_types et where et.token = p_token and et.is_active;
  v_class := coalesce(v_class, 'private');
  v_why := format('you are not the owner of this %s row, not an owner or admin of the organization '
                  'it belongs to, and not a platform administrator, so you cannot change who owns it',
                  p_token);
  if nullif(current_setting('iam.transfer_door_kernel_error', true), '') is not null then
    v_why := v_why || format(' [the access kernel could not be asked about %s %s: %s]',
                             p_container_type, p_container_id,
                             current_setting('iam.transfer_door_kernel_error', true));
  end if;

  v_org := coalesce(p_row_org,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));
  v_refusal := jsonb_build_object(
    'door', 'iam.assert_may_transfer',
    'token', p_token,
    'data_class', v_class,
    'denial_reason', v_why,
    'actor', v_uid,
    'row_owner', p_row_owner,
    'target_owner', p_target_owner,
    'row_organization', v_org,
    'container_type', p_container_type,
    'container_id', p_container_id,
    'refused_at', now());

  -- The rollback-proof half: this line reaches the server log even though the transaction that
  -- read it is about to be thrown away.
  raise warning 'iam.assert_may_transfer REFUSED a % transfer (owner % -> %) for actor %. This refusal is NOT audited unless the caller records it: catch the 42501 and pass the DETAIL JSON to iam.record_transfer_refusal() in a NEW transaction.',
    p_token, p_row_owner, p_target_owner, coalesce(v_uid::text, '(anonymous)');

  raise exception 'Refused: %', v_why
    using errcode = '42501',
          detail  = v_refusal::text,
          hint    = 'Ask an owner or admin of the organization that holds this row to move it. '
                 || 'To make this refusal durable, catch this error and call '
                 || 'iam.record_transfer_refusal(<this DETAIL, as jsonb>) in a new transaction.';
end
$function$;

CREATE OR REPLACE FUNCTION iam.external_principal_card(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := auth.uid(); v_who uuid := coalesce(p_user_id, auth.uid()); v_n integer;
begin
  if v_me is null then
    return jsonb_build_object('signed_in', false, 'external', false,
      'explanation', 'Nobody is signed in, so there is no principal to describe.');
  end if;
  if v_who is distinct from v_me and not public.is_platform_admin_for(v_me) then
    raise exception 'You can ask this about yourself, and a platform admin can ask it about anybody. Nobody else.'
      using errcode = '42501';
  end if;

  select count(*) into v_n
    from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id
   where m.user_id = v_who;

  return jsonb_build_object(
    'signed_in', true,
    'user_id', v_who,
    'external', v_n = 0,
    'organization_memberships', v_n,
    'explanation', case when v_n = 0
      then 'This person belongs to no organization here. Everything they can see, they can see '
           'because somebody shared it with them — nothing reaches them by being inside an '
           'organization they are in.'
      else format('This person belongs to %s organization(s), so organization membership is one '
                  'of the ways things reach them.', v_n) end);
end $function$;

CREATE OR REPLACE FUNCTION iam.is_external_principal(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := auth.uid(); v_who uuid := coalesce(p_user_id, auth.uid());
begin
  if v_me is null then
    return false;                      -- nobody is signed in: not a principal at all
  end if;
  if v_who is distinct from v_me and not public.is_platform_admin_for(v_me) then
    raise exception 'You can ask this about yourself, and a platform admin can ask it about anybody. Nobody else.'
      using errcode = '42501';
  end if;
  return not exists (
    select 1
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id
     where m.user_id = v_who);
end $function$;

CREATE OR REPLACE FUNCTION iam.organization_archive(p_org uuid, p_confirm_name text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_org  iam.organizations%rowtype;
  v_took jsonb;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    perform platform.refuse_not_found('That organization no longer exists.');
  end if;

  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception 'Only an owner of % can archive it.', v_org.name using errcode = '42501';
  end if;


  if v_org.is_system then
    raise exception
      '% is a system organization and cannot be archived.', v_org.name using errcode = '23514';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to archive it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is not null then
    return jsonb_build_object(
      'archived', true,
      'changed', false,
      'archived_at', v_org.archived_at,
      'sentence', format('%s was already archived on %s.',
                         v_org.name, to_char(v_org.archived_at, 'DD Month YYYY')));
  end if;

  update iam.organizations
     set archived_at    = now(),
         archived_by    = v_uid,
         archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  -- LANE ARCHIVED-ORG-WORK: THE WORK WAITING IN IT GOES WITH IT. Every pending approval is
  -- withdrawn, every open assignment unassigned and every unanswered signature request stopped,
  -- with the reason and whoever archived it; one history.migration_log event lists what it took,
  -- and organization_restore gives back each one whose subject is still live.
  v_took := custom._organization_work_withdraw(p_org, v_uid);

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.archived',
          jsonb_build_object('reason', v_org.archive_reason, 'name', v_org.name,
                             'withdrew', v_took));

  return jsonb_build_object(
    'archived', true,
    'changed', true,
    'archived_at', v_org.archived_at,
    'withdrew', v_took,
    'sentence', format(
      '%s is archived. Its members cannot open it and nothing inside it runs, but nothing was '
      'deleted — an owner can restore it at any time.', v_org.name)
      || case when coalesce((v_took ->> 'approvals')::integer, 0) + coalesce((v_took ->> 'assignments')::integer, 0)
                   + coalesce((v_took ->> 'sign_requests')::integer, 0) > 0
              then format(' %s waiting approval(s), %s open assignment(s) and %s signature request(s) in it were withdrawn; restoring it brings back each one that is still live.',
                          coalesce((v_took ->> 'approvals')::integer, 0), coalesce((v_took ->> 'assignments')::integer, 0),
                          coalesce((v_took ->> 'sign_requests')::integer, 0))
              else '' end);
end
$function$;

CREATE OR REPLACE FUNCTION iam.people_lists_a_non_member_can_read()
 RETURNS TABLE(relation text, policy_name text, why text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- 1. the policy TEXT a real HTTP read runs against
  select r.relation,
         p.polname::text,
         r.why
    from iam.personal_data_relations() r
    join pg_catalog.pg_class c on c.oid = to_regclass(r.relation)
    join pg_catalog.pg_policy p on p.polrelid = c.oid
   where r.names_a_person
     and p.polcmd in ('r', '*')
     and iam.policy_carries_a_plain_system_org_arm(
           pg_catalog.pg_get_expr(p.polqual, p.polrelid))
  union
  -- 2. and the REGISTRY, which decides what the next regeneration will emit
  select r.relation,
         'data_class ' || coalesce((iam.class_lanes(et.token)).resolved_class::text, 'unset'),
         r.why
    from iam.personal_data_relations() r
    join platform.entity_types et
      on et.is_active
     and et.schema_name || '.' || et.table_name = r.relation
   where r.names_a_person
     and (iam.class_lanes(et.token)).resolved_class in ('organization', 'public')
   order by 1, 2;
$function$;

CREATE OR REPLACE FUNCTION public.ivw_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.ivw_list_scoped(v_scope, NULL, p_search, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.ivw_list_scoped('orgs', o.id, p_search, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.league_set_opt_in(p_opted_in boolean, p_display_name text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS education.league_membership
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() AT TIME ZONE 'utc')::date;
  v_activity integer;
  v_band text;
  v_cohort text;
  v_row education.league_membership;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'league_set_opt_in requires authentication' USING ERRCODE = '42501';
  END IF;

  -- 🚨 THE CALLER NAMES THE ORGANIZATION (aidream 0929, 2026-09-19: the database never
  -- chooses a tenant). This used to be an organization lookup keyed on the
  -- caller, which was a silent guess.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Choose which organization your league membership belongs to (p_organization_id is required).'
      USING ERRCODE = '22023';
  END IF;
  IF NOT iam.has_org_access_for(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of the organization you asked to join the league in.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('education-league-' || v_week::text, 0));

  SELECT count(*)::integer
    INTO v_activity
    FROM education.study_attempt a
   WHERE a.created_by = v_user
     AND a.deleted_at IS NULL
     AND a.is_manually_edited = false
     AND a.result IN ('incorrect', 'partial', 'correct')
     AND coalesce(a.reviewed_at, a.created_at) >= now() - interval '28 days';

  v_band := CASE
    WHEN v_activity < 20 THEN 'starter'
    WHEN v_activity < 100 THEN 'steady'
    ELSE 'active'
  END;

  IF p_opted_in THEN
    SELECT lm.cohort_key
      INTO v_cohort
      FROM education.league_membership lm
     WHERE lm.week_start = v_week
       AND lm.opted_in = true
       AND lm.deleted_at IS NULL
       AND lm.cohort_key LIKE v_band || '-%'
     GROUP BY lm.cohort_key
    HAVING count(*) < 30
     ORDER BY count(*) DESC, lm.cohort_key
     LIMIT 1;

    v_cohort := coalesce(
      v_cohort,
      v_band || '-' || substr(md5(v_user::text || clock_timestamp()::text), 1, 8)
    );
  END IF;

  SELECT *
    INTO v_row
    FROM education.league_membership lm
   WHERE lm.created_by = v_user
     AND lm.week_start = v_week
     AND lm.deleted_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    UPDATE education.league_membership
       SET opted_in = p_opted_in,
           display_name = left(nullif(btrim(p_display_name), ''), 80),
           cohort_key = CASE WHEN p_opted_in THEN coalesce(v_row.cohort_key, v_cohort) ELSE v_row.cohort_key END,
           updated_at = now()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO education.league_membership (
      organization_id, created_by, week_start, display_name, opted_in, cohort_key
    ) VALUES (
      p_organization_id, v_user, v_week,
      left(nullif(btrim(p_display_name), ''), 80), p_opted_in,
      CASE WHEN p_opted_in THEN v_cohort ELSE NULL END
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_templates(p_category text DEFAULT NULL::text, p_personal_only boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'key', t.key, 'name', t.name, 'description', t.description,
        'category', t.category, 'icon', t.icon,
        'audience', t.audience,
        'scope_types', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'label_singular', tst.label_singular,
              'label_plural', tst.label_plural,
              'icon', tst.icon,
              'field_count', (SELECT count(*) FROM context.template_context_items WHERE template_scope_type_id = tst.id),
              'fields', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('key', tci.key, 'display_name', tci.display_name) ORDER BY tci.sort_order)
                FROM context.template_context_items tci
                WHERE tci.template_scope_type_id = tst.id
              ), '[]'::jsonb)
            ) ORDER BY tst.sort_order
          )
          FROM context.template_scope_types tst
          WHERE tst.template_id = t.id
        ), '[]'::jsonb)
      ) ORDER BY t.sort_order, t.name
    )
    FROM context.templates t
    WHERE t.is_active = true
      AND (p_category IS NULL OR t.category = p_category)
      AND (p_personal_only IS NULL
           OR t.audience = CASE WHEN p_personal_only THEN 'individual' ELSE 'organization' END)
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_client_error(p_source_app text, p_source text, p_message text, p_code text DEFAULT NULL::text, p_route text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_conversation_id uuid DEFAULT NULL::uuid, p_stack text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb, p_context jsonb DEFAULT NULL::jsonb, p_organization_id uuid DEFAULT NULL::uuid, p_source_feature text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_source_apps constant text[] := array[
    'matrx-frontend',
    'matrx-extend',
    'matrx-local',
    'matrx-mobile'
  ];
  -- The client analogue of the server's 'server-door': registered, filterable,
  -- and never silent. It is stamped when a caller names no feature at all.
  c_unmapped_feature constant text := 'client-unmapped';
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_feature text := lower(btrim(coalesce(p_source_feature, '')));
  v_id      uuid;
begin
  if p_source_app is null or not (p_source_app = any (c_source_apps)) then
    raise exception
      'log_client_error was called with source app %, which is not one of the client apps this platform knows about (%). The error was NOT recorded. Pass the name of the app that produced the error, exactly as written in that list; if this really is a new client app, add it to the closed list in a migration first.',
      coalesce(quote_literal(p_source_app), 'nothing at all'),
      array_to_string(c_source_apps, ', ')
      using errcode = '22023';
  end if;

  if v_feature = '' then
    v_feature := c_unmapped_feature;
    v_context := v_context || jsonb_build_object(
      'source_feature_note',
      'This client named its app but no feature, so the row carries the '
      || 'client-unmapped sentinel. Either the calling build predates '
      || 'p_source_feature, or that client could not map the failing surface to '
      || 'a registered feature. Add the surface to that client''s map.'
    );
  elsif v_feature !~ '^[a-z0-9][a-z0-9_:./-]{0,190}$' then
    raise exception
      'log_client_error was called with source feature %, which is not the shape of a feature slug (lowercase letters, digits, and _ : . / - , starting with a letter or digit, at most 191 characters). The error was NOT recorded. Pass a feature registered in source_attribution.SOURCE_FEATURES, or pass nothing and the row will be marked %.',
      quote_literal(p_source_feature), quote_literal(c_unmapped_feature)
      using errcode = '22023';
  end if;

  if p_organization_id is not null then
    if auth.role() = 'service_role' then
      v_org := p_organization_id;
    elsif v_user is null
       or not coalesce(iam.has_org_access(p_organization_id), false) then
      raise exception
        'log_client_error refused the explicit organization. The current identity is not admitted to that organization, so the error was NOT recorded. Refresh organization context and retry with an organization the current identity may access.'
        using errcode = '42501';
    else
      v_org := p_organization_id;
    end if;
  else
    -- A caller that names no organization is recorded in the system capture lane; no
    -- organization of the person's is chosen for them.
    if v_org is null then
      select s.organization_id into v_org
      from iam.system_orgs s
      join iam.organizations o on o.id = s.organization_id
      where o.slug = 'matrx-system'
      limit 1;
    end if;
  end if;

  if v_org is null then
    v_context := v_context || jsonb_build_object(
      'organization_note',
      'No organization was supplied for this client error and the matrx-system organization did not resolve. The error was recorded anyway rather than discarded; whatever organization this row carries was attributed by the database capture stamp (ops._stamp_capture_org), not by the client.'
    );
  end if;

  insert into ops.system_error (
    id, kind, source_app, source_feature, error_type, error_text, route, request_id,
    conversation_id, traceback, payload, context,
    user_id, created_by, organization_id, occurred_at, created_at
  ) values (
    gen_random_uuid(),
    coalesce(nullif(p_source, ''), 'client-error'),
    p_source_app,
    v_feature,
    p_code,
    coalesce(nullif(p_message, ''), '(no message)'),
    p_route,
    p_request_id,
    p_conversation_id,
    p_stack,
    p_payload,
    v_context,
    v_user,
    v_user,
    v_org,
    now(),
    now()
  ) returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION mandate._admin_list_rows(p_facts jsonb, p_q text)
 RETURNS TABLE(id uuid, mandate_key text, created_by uuid, organization_id uuid, is_system boolean, name text, feature_label text, goal text, description text, h_agent_name text, customized_by text[], serves text[], serves_detail text[], backs_count bigint, home_label text, h_agent_id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, vals jsonb, sortv jsonb, score integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
-- THE ROW BUILDER of public.mnd_admin_list: one row per mandate in the corpus
-- with every column's facet values (`vals`) and sort key (`sortv`). Mirrors
-- features/mandates/admin-list/rows.ts + fields.ts and mandate-health.ts
-- `buildRow`. SECURITY INVOKER: RLS is the ceiling.
DECLARE
  v_sys uuid;
  v_src boolean;
BEGIN
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';
  p_facts := coalesce(p_facts, '{}'::jsonb);
  -- The source columns cost a whole-corpus scan read; only when asked.
  v_src := coalesce(p_facts->>'sources', '') = 'all';
  RETURN QUERY
  WITH buckets AS (
    SELECT b.b, public.agx_since_bucket(b.b) AS since, b.o
    FROM unnest(ARRAY['1h','24h','7d','30d','90d','1y']) WITH ORDINALITY AS b(b, o)
  ),
  corpus AS (
    SELECT m.*
    FROM mandate.definition m
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status', '') <> 'placeholder'
      -- THE WHOLE PLATFORM (Arman, 2026-09-26): the admin seat never narrows to the viewer's own orgs.
  ),
  backs AS (
    SELECT c.fallback_mandate_key AS b_key, count(*) AS b_n
    FROM corpus c WHERE c.fallback_mandate_key IS NOT NULL GROUP BY 1
  ),
  holder AS (
    -- mandate-health.ts `buildRow`: a pinned version resolves through its
    -- version row; otherwise the holder id IS the agent id.
    SELECT
      c.id AS h_id,
      coalesce(c.default_holder_type, 'agent') AS h_type,
      (c.default_holder_id IS NOT NULL OR c.default_holder_version_id IS NOT NULL) AS h_has_pin,
      c.default_holder_version_id AS h_vid,
      v.version_number AS h_vnum,
      CASE WHEN c.default_holder_version_id IS NOT NULL
           THEN coalesce(a.id, v.agent_id)
           ELSE coalesce(a.id, c.default_holder_id) END AS h_agent_id,
      CASE WHEN c.default_holder_version_id IS NOT NULL
           THEN coalesce(coalesce(a.name, a.id::text), v.name, '(unknown agent)')
           ELSE coalesce(coalesce(a.name, a.id::text), '(unknown agent)') END AS h_agent_name,
      a.agent_type::text AS h_agent_type,
      coalesce(a.is_archived, false) AS h_archived,
      (a.id IS NOT NULL) AS h_agent_read,
      -- A PINNED version answers with ITS OWN declarations (2026-09-25):
      -- reading the live agent here made the list/peek show inputs and an
      -- output shape the job does not run with.
      CASE WHEN v.id IS NOT NULL THEN v.output_schema ELSE a.output_schema END AS h_output_schema,
      ARRAY(SELECT e->>'name' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(coalesce(v.variable_definitions, a.variable_definitions)::jsonb) = 'array'
                   THEN coalesce(v.variable_definitions, a.variable_definitions)::jsonb ELSE '[]'::jsonb END) e
            WHERE jsonb_typeof(e) = 'object' AND coalesce(e->>'name', '') <> '')
      || ARRAY(SELECT e->>'key' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(coalesce(v.context_policies, a.context_policies)::jsonb) = 'array'
                   THEN coalesce(v.context_policies, a.context_policies)::jsonb ELSE '[]'::jsonb END) e
            WHERE jsonb_typeof(e) = 'object' AND coalesce(e->>'key', '') <> '') AS h_declared
    FROM corpus c
    LEFT JOIN agent.definition_version v ON v.id = c.default_holder_version_id
    LEFT JOIN agent.definition a
           ON a.id = CASE WHEN c.default_holder_version_id IS NOT NULL
                          THEN v.agent_id ELSE c.default_holder_id END
  ),
  binds AS (
    SELECT
      b.mandate_id AS k_id,
      count(*) AS k_n,
      array_agg(DISTINCT coalesce(o.name, 'Organization') ORDER BY coalesce(o.name, 'Organization'))
        FILTER (WHERE b.principal_type = 'org' AND b.organization_id IS DISTINCT FROM v_sys) AS k_orgs,
      bool_or(b.principal_type = 'user') AS k_personal,
      -- The system organization's own binding: a real override only when it
      -- changes what a member gets (see the header).
      bool_or(b.principal_type = 'org' AND b.organization_id = v_sys AND (
                b.holder_id IS DISTINCT FROM c.default_holder_id
             OR b.holder_version_id IS DISTINCT FROM c.default_holder_version_id
             OR coalesce(b.holder_type, 'agent') IS DISTINCT FROM coalesce(c.default_holder_type, 'agent')
             OR b.config_overrides IS NOT NULL
             OR b.consumption_map IS NOT NULL)) AS k_platform,
      -- The persisted contract verdict on each live binding (contract-check.ts).
      coalesce(bool_or(b.metadata->'contract_check'->>'state' = 'unmet'), false) AS k_unmet,
      coalesce(bool_or(b.metadata->'contract_check'->>'state' = 'met'), false) AS k_met
    FROM mandate.binding b
    JOIN corpus c ON c.id = b.mandate_id
    LEFT JOIN iam.organizations o ON o.id = b.organization_id
    WHERE b.deleted_at IS NULL
    GROUP BY b.mandate_id
  ),
  links AS (
    SELECT l.key AS l_key, l.kind AS l_kind, l.ord AS l_ord, l.detail AS l_detail
    FROM (
      SELECT s.mandate_key AS key, 'Shortcut'::text AS kind, 1 AS ord,
             CASE WHEN s.surface_name IS NOT NULL
                  THEN coalesce(s.label, 'Shortcut') || ' (' || s.surface_name || ')'
                  ELSE coalesce(s.label, 'Shortcut') END AS detail
      FROM mandate.vw_shortcut s
      WHERE s.deleted_at IS NULL AND s.mandate_key IS NOT NULL
      UNION ALL
      SELECT r.mandate_key, 'Surface', 2, r.surface_name
      FROM ui.ui_surface_agent_role r WHERE r.mandate_key IS NOT NULL
      UNION ALL
      SELECT c.mandate_key, 'Agent app', 3, d.name
      FROM app.definition d JOIN corpus c ON c.id = d.mandate_id
      WHERE d.deleted_at IS NULL
    ) l
  ),
  served AS (
    SELECT l_key AS s_key,
           ARRAY(SELECT DISTINCT x.l_kind FROM links x WHERE x.l_key = l.l_key) AS s_kinds_raw,
           array_agg(DISTINCT l_detail) FILTER (WHERE l_detail IS NOT NULL) AS s_detail
    FROM links l GROUP BY l_key
  ),
  -- ── Source facts (code-references/data.ts `fetchMandateSourceFacts`) ─────
  ref_types AS (
    SELECT cat.id AS t_id, cat.slug AS t_slug
    FROM platform.categories cat
    WHERE cat.dimension = 'mandate_reference_type' AND cat.deleted_at IS NULL
  ),
  refs AS (
    SELECT btrim(l.mandate_key) AS r_key,
           nullif(l.repo_slug, '') AS r_repo,
           coalesce(t.t_slug, '') IN ('declaration', 'family_declaration') AS r_decl,
           CASE lower(coalesce(l.language, ''))
             WHEN '' THEN NULL
             WHEN 'typescript' THEN 'TypeScript'
             WHEN 'javascript' THEN 'JavaScript'
             WHEN 'python' THEN 'Python'
             WHEN 'config' THEN 'Config'
             ELSE upper(left(l.language, 1)) || substr(l.language, 2) END AS r_lang
    FROM mandate.v_reference_latest l
    LEFT JOIN ref_types t ON t.t_id = l.reference_type_id
    WHERE v_src
      AND l.reference_type_id IS NOT NULL
      AND coalesce(t.t_slug, '') NOT IN ('bypass', 'unclassified')
      AND coalesce(btrim(l.mandate_key), '') <> ''
  ),
  src AS (
    SELECT r.r_key,
           coalesce(array_agg(DISTINCT r.r_repo ORDER BY r.r_repo)
                      FILTER (WHERE r.r_decl AND r.r_repo IS NOT NULL), ARRAY[]::text[]) AS r_declared,
           coalesce(array_agg(DISTINCT r.r_repo ORDER BY r.r_repo)
                      FILTER (WHERE NOT r.r_decl AND r.r_repo IS NOT NULL), ARRAY[]::text[]) AS r_called,
           coalesce(array_agg(DISTINCT r.r_lang ORDER BY r.r_lang)
                      FILTER (WHERE r.r_lang IS NOT NULL), ARRAY[]::text[]) AS r_langs,
           count(*) FILTER (WHERE NOT r.r_decl) AS r_sites
    FROM refs r
    GROUP BY r.r_key
  ),
  shaped AS MATERIALIZED (
    SELECT
      c.id, c.mandate_key, c.created_by, c.organization_id,
      (c.organization_id = v_sys) AS is_system,
      c.created_at, c.updated_at, c.is_enabled,
      coalesce(NULLIF(btrim(c.label), ''),
        NULLIF(btrim(array_to_string(ARRAY(
          SELECT CASE WHEN w = '' THEN '' ELSE upper(left(w, 1)) || substr(w, 2) END
          FROM unnest(string_to_array(
                 coalesce((SELECT s FROM unnest(string_to_array(c.mandate_key, '.')) WITH ORDINALITY u(s, o)
                            WHERE s <> '' ORDER BY o DESC LIMIT 1), c.mandate_key), '_'))
                 WITH ORDINALITY z(w, o) ORDER BY o), ' ')), ''),
        c.mandate_key) AS name,
      CASE WHEN position('.' in c.mandate_key) <= 1 OR right(c.mandate_key, 1) = '.'
           THEN '(unscoped)' ELSE split_part(c.mandate_key, '.', 1) END AS feature,
      NULLIF(btrim(coalesce(c.goal, '')), '') AS goal,
      c.description,
      c.origin, c.fallback_mandate_key, c.provision_key, c.output_kind,
      coalesce(c.required_output_keys, ARRAY[]::text[]) AS required_output_keys,
      c.draft_inputs,
      c.metadata->'default_holder_contract_check'->>'state' AS own_check,
      h.*,
      coalesce(k.k_n, 0) AS overrides_count,
      k.k_orgs, coalesce(k.k_personal, false) AS k_personal,
      coalesce(k.k_platform, false) AS k_platform,
      coalesce(k.k_unmet, false) AS k_unmet,
      coalesce(k.k_met, false) AS k_met,
      coalesce(bk.b_n, 0) AS backs_count,
      sv.s_kinds_raw, coalesce(sv.s_detail, ARRAY[]::text[]) AS serves_detail,
      -- THE OWNER: System, or the organization that homes it, by its own name.
      mandate._admin_owner_label(c.organization_id, c.organization_id = v_sys) AS home_label,
      coalesce(sr.r_declared, ARRAY[]::text[]) AS src_declared,
      coalesce(sr.r_called, ARRAY[]::text[]) AS src_called,
      coalesce(sr.r_langs, ARRAY[]::text[]) AS src_langs,
      coalesce(sr.r_sites, 0) AS src_sites
    FROM corpus c
    JOIN holder h ON h.h_id = c.id
    LEFT JOIN binds k ON k.k_id = c.id
    LEFT JOIN backs bk ON bk.b_key = c.mandate_key
    LEFT JOIN served sv ON sv.s_key = c.mandate_key
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
    LEFT JOIN src sr ON sr.r_key = c.mandate_key
  ),
  judged AS MATERIALIZED (
    SELECT s.*,
      -- ── server-classified facts (see header) ──────────────────────────────
      CASE WHEN coalesce((p_facts->'coverage'->>'known')::boolean, false) THEN
             CASE WHEN coalesce(p_facts->'coverage'->'red', '[]'::jsonb) ? s.mandate_key THEN 'red'
                  WHEN coalesce(p_facts->'coverage'->'orange', '[]'::jsonb) ? s.mandate_key THEN 'orange'
                  ELSE 'green' END
           ELSE 'unknown' END AS coverage,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'grade', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'ungraded') AS impact_grade,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'blocker', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'ungraded') AS impact_blocker,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'codeState', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'not_in_code') AS code_state,
      (SELECT g.key FROM jsonb_each(coalesce(p_facts->'declaredIn', '{}'::jsonb)) g
        WHERE g.value ? s.mandate_key LIMIT 1) AS declared_in,
      coalesce(p_facts->'featureLabel'->>s.mandate_key,
        CASE s.feature WHEN 'shortcut' THEN 'Shortcuts' WHEN 'app' THEN 'Agent apps'
             ELSE mandate._admin_list_pretty(s.feature) END) AS feature_label,
      -- ── holder verdicts (buildRow) ────────────────────────────────────────
      (s.h_has_pin AND (s.h_agent_id IS NULL OR s.h_agent_type IS NULL)) AS v_unresolved,
      -- WHO-MAY-FILL (owner ruling 2026-09-25): only the SYSTEM answer must be a
      -- system Holder. An org-homed job's default is its own organization's
      -- choice, so it is never 'not a system agent'.
      (s.is_system AND s.h_agent_read AND s.h_agent_type IS DISTINCT FROM 'builtin') AS v_nonsystem,
      -- CASE, not AND: the contract judge is the costly call, and only a
      -- pinned, readable holder of a job that requires output keys needs it.
      CASE WHEN s.h_has_pin AND s.h_agent_id IS NOT NULL AND s.h_agent_read
                AND cardinality(s.required_output_keys) > 0
           -- Same verdict as mandate.missing_output_keys (some required key
           -- the schema does not declare), with the schema read ONCE per row
           -- instead of once per required key.
           THEN NOT (s.required_output_keys <@ mandate.output_schema_keys(s.h_output_schema::jsonb))
           ELSE false END
        AS v_output_unmet,
      CASE WHEN s.own_check = 'unmet' OR s.k_unmet THEN 'Mismatch'
           WHEN s.own_check = 'met' OR s.k_met THEN 'Matches'
           ELSE 'Not checked' END AS contract_check
    FROM shaped s
  ),
  finished AS MATERIALIZED (
    SELECT j.*,
      CASE
        WHEN j.h_has_pin AND coalesce(p_facts->'health'->'agentDrift', '[]'::jsonb) ? j.mandate_key
          THEN 'code ↔ agent drift'
        WHEN coalesce(p_facts->'health'->'importFailed', '[]'::jsonb) ? j.mandate_key
          THEN 'code truth import failed'
        WHEN j.v_unresolved THEN 'unresolved pin'
        WHEN j.v_nonsystem THEN 'not a system agent'
        WHEN j.h_archived THEN 'agent archived'
        WHEN coalesce(p_facts->'health'->'contractDrift', '[]'::jsonb) ? j.mandate_key
          THEN 'code ↔ contract drift'
        WHEN j.v_output_unmet THEN 'output contract unmet'
        WHEN j.h_has_pin THEN 'ok'
        ELSE 'no holder yet' END AS health,
      CASE WHEN NOT j.h_has_pin THEN 'None'
           WHEN j.h_vid IS NOT NULL THEN coalesce('v' || j.h_vnum, 'unknown version')
           ELSE 'Latest' END AS pin_text,
      -- admin-list/rows.ts `customizedByOf`, plus the system-organization rule.
      CASE WHEN coalesce(cardinality(j.k_orgs), 0) = 0 AND NOT j.k_personal
                AND NOT j.k_platform
           THEN ARRAY['Default']
           ELSE coalesce(j.k_orgs, ARRAY[]::text[])
                || CASE WHEN j.k_platform THEN ARRAY['Platform override'] ELSE ARRAY[]::text[] END
                || CASE WHEN j.k_personal THEN ARRAY['Personal'] ELSE ARRAY[]::text[] END
      END AS customized_by,
      CASE WHEN coalesce(cardinality(j.s_kinds_raw), 0) > 0 THEN
             ARRAY(SELECT k FROM unnest(ARRAY['Shortcut', 'Surface', 'Agent app']) WITH ORDINALITY u(k, o)
                   WHERE k = ANY (j.s_kinds_raw) ORDER BY o)
           WHEN j.origin = 'code' THEN ARRAY['Feature code']
           ELSE ARRAY['Nothing found'] END AS serves,
      CASE WHEN j.h_has_pin THEN 'Own default'
           WHEN j.fallback_mandate_key IS NOT NULL
             OR coalesce(p_facts->'coverage'->'orange', '[]'::jsonb) ? j.mandate_key THEN 'Fallback'
           ELSE 'No default' END AS default_state,
      -- mandate-health.ts `inputSummaryOf`: the four input declarations.
      coalesce(
        NULLIF(j.provision_key, ''),
        NULLIF(array_to_string(ARRAY(
          SELECT coalesce(NULLIF(btrim(e->>'description'), ''), btrim(e->>'name'))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.draft_inputs) = 'array'
                                         THEN j.draft_inputs ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
          WHERE jsonb_typeof(e) = 'object'
            AND (coalesce(btrim(e->>'description'), '') <> '' OR coalesce(btrim(e->>'name'), '') <> '')
          ORDER BY o), ', '), ''),
        NULLIF(array_to_string(CASE WHEN j.h_agent_read THEN j.h_declared ELSE ARRAY[]::text[] END, ', '), ''),
        'user text only') AS input_summary,
      coalesce(j.output_kind, NULLIF(array_to_string(j.required_output_keys, ', '), ''), 'unspecified')
        AS output_summary
    FROM judged j
  )
  SELECT
    f.id, f.mandate_key, f.created_by, f.organization_id, f.is_system,
    f.name, f.feature_label, f.goal, f.description, f.h_agent_name,
    f.customized_by, f.serves, f.serves_detail, f.backs_count, f.home_label,
    f.h_agent_id, f.updated_at, f.created_at,
    -- Per-column FACET values — admin-list/fields.ts `values`.
    jsonb_build_object(
      'name',          to_jsonb(ARRAY[f.name]),
      'featureLabel',  to_jsonb(ARRAY[f.feature_label]),
      'mandateKey',    to_jsonb(ARRAY[f.mandate_key]),
      'agentName',     to_jsonb(ARRAY[CASE WHEN f.h_type = 'agent' THEN f.h_agent_name ELSE 'Workflow' END]),
      'pinText',       to_jsonb(ARRAY[f.pin_text]),
      'coverage',      to_jsonb(ARRAY[f.coverage]),
      'impactGrade',   to_jsonb(ARRAY[f.impact_grade]),
      'impactBlocker', to_jsonb(ARRAY[f.impact_blocker]),
      'health',        to_jsonb(ARRAY[f.health]),
      'inputSummary',  to_jsonb(ARRAY[f.input_summary]),
      'outputSummary', CASE WHEN f.output_summary = '' THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.output_summary]) END,
      'overridesCount', to_jsonb(ARRAY[f.overrides_count::text]),
      'customizedBy',  to_jsonb(f.customized_by),
      'isEnabled',     to_jsonb(ARRAY[CASE WHEN f.is_enabled THEN 'true' ELSE 'false' END]),
      -- THE STATUS (features/mandates/status/mandate-status.ts mandateStatusOf).
      'status',        to_jsonb(ARRAY[CASE WHEN NOT f.is_enabled THEN 'disabled'
                                     WHEN NOT f.h_has_pin AND f.fallback_mandate_key IS NULL AND f.overrides_count = 0 THEN 'draft'
                                     ELSE 'active' END]),
      'updatedAt',     to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                       WHERE f.updated_at IS NOT NULL AND f.updated_at >= bk.since
                                       ORDER BY bk.o)),
      'id',            to_jsonb(ARRAY[f.id::text]),
      'origin',        to_jsonb(ARRAY[CASE WHEN f.origin = 'code' THEN 'code' ELSE 'soft' END]),
      'codeState',     to_jsonb(ARRAY[f.code_state]),
      'declaredIn',    to_jsonb(ARRAY[coalesce(f.declared_in, 'None')]),
      'serves',        to_jsonb(f.serves),
      'defaultState',  to_jsonb(ARRAY[f.default_state]),
      'backsCount',    to_jsonb(ARRAY[f.backs_count::text]),
      'fallbackKey',   to_jsonb(ARRAY[coalesce(f.fallback_mandate_key, 'None')]),
      'homeLabel',     to_jsonb(ARRAY[f.home_label]),
      'goal',          CASE WHEN f.goal IS NULL THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.goal]) END,
      'createdAt',     to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                       WHERE f.created_at IS NOT NULL AND f.created_at >= bk.since
                                       ORDER BY bk.o)),
      'contractCheck', to_jsonb(ARRAY[f.contract_check])
    ) || CASE WHEN v_src THEN jsonb_build_object(
      'declaredRepos', to_jsonb(CASE WHEN cardinality(f.src_declared) = 0 THEN ARRAY['None found'] ELSE f.src_declared END),
      'calledFrom',    to_jsonb(CASE WHEN cardinality(f.src_called) = 0 THEN ARRAY['None found'] ELSE f.src_called END),
      'callSites',     to_jsonb(ARRAY[f.src_sites::text]),
      'languages',     to_jsonb(CASE WHEN cardinality(f.src_langs) = 0 THEN ARRAY['None found'] ELSE f.src_langs END)
    ) ELSE '{}'::jsonb END AS vals,
    -- Per-column SORT keys — admin-list/fields.ts `sort`.
    jsonb_build_object(
      'name',          lower(f.name),
      'featureLabel',  lower(f.feature_label),
      'mandateKey',    lower(f.mandate_key),
      'agentName',     lower(f.h_agent_name),
      'pinText',       lower(f.pin_text),
      'coverage',      CASE f.coverage WHEN 'red' THEN 0 WHEN 'orange' THEN 1 ELSE 2 END,
      'impactGrade',   CASE WHEN f.impact_grade = 'ungraded' THEN -1
                            ELSE coalesce((SELECT o - 1 FROM jsonb_array_elements_text(
                                   coalesce(p_facts->'gradeOrder', '["identical","green","orange","red"]'::jsonb))
                                   WITH ORDINALITY g(v, o) WHERE g.v = f.impact_grade), -1) END,
      'impactBlocker', f.impact_blocker,
      'health',        lower(f.health),
      'inputSummary',  lower(f.input_summary),
      'outputSummary', lower(f.output_summary),
      'overridesCount', f.overrides_count,
      'customizedBy',  lower(array_to_string(f.customized_by, ', ')),
      'isEnabled',     CASE WHEN f.is_enabled THEN 1 ELSE 0 END,
      -- Worst first when ascending: draft, disabled, active.
      'status',        CASE WHEN NOT f.is_enabled THEN 1
                            WHEN NOT f.h_has_pin AND f.fallback_mandate_key IS NULL AND f.overrides_count = 0 THEN 0
                            ELSE 2 END,
      'updatedAt',     coalesce(to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      'id',            f.id::text,
      'origin',        CASE WHEN f.origin = 'code' THEN 'code' ELSE 'soft' END,
      'codeState',     f.code_state,
      'declaredIn',    coalesce(f.declared_in, ''),
      'serves',        array_to_string(f.serves, ', '),
      'defaultState',  lower(f.default_state),
      'backsCount',    f.backs_count,
      'fallbackKey',   lower(coalesce(f.fallback_mandate_key, 'None')),
      'homeLabel',     lower(f.home_label),
      'goal',          lower(coalesce(f.goal, '')),
      'createdAt',     coalesce(to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      -- Worst first when ascending: Mismatch, then Not checked, then Matches.
      'contractCheck', CASE f.contract_check WHEN 'Mismatch' THEN 0 WHEN 'Not checked' THEN 1 ELSE 2 END
    ) || CASE WHEN v_src THEN jsonb_build_object(
      'declaredRepos', lower(array_to_string(f.src_declared, ', ')),
      'calledFrom',    lower(array_to_string(f.src_called, ', ')),
      'callSites',     f.src_sites,
      'languages',     lower(array_to_string(f.src_langs, ', '))
    ) ELSE '{}'::jsonb END AS sortv,
    -- Relevance, ported from the one scorer (public.mtx_search_score) — never
    -- an unranked ILIKE (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN p_q IS NULL THEN 0 ELSE public.mtx_search_score(
      p_q, f.id, f.name, coalesce(f.goal, ''), ARRAY[]::text[], NULL,
      ARRAY[f.mandate_key, f.feature_label, f.h_agent_name],
      f.customized_by || f.serves_detail || ARRAY[coalesce(f.description, '')],
      false) END AS score
  FROM finished f;
END;
$function$;

CREATE OR REPLACE FUNCTION mandate._admin_owner_label(p_org uuid, p_is_system boolean)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Every organization is equal (access ladder, 2026-09-26): the owner of a mandate homed in an
  -- organization is that organization, by its own name.
  SELECT CASE WHEN p_is_system THEN 'System'
              ELSE coalesce((SELECT o.name FROM iam.organizations o WHERE o.id = p_org),
                            'Unknown owner') END
$function$;

CREATE OR REPLACE FUNCTION mandate._admin_owner_level(p_org uuid, p_is_system boolean)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_is_system THEN 'system'
              ELSE 'org' END
$function$;

CREATE OR REPLACE FUNCTION public.mnd_member_list(p_mode text DEFAULT 'page'::text, p_level text DEFAULT 'person'::text, p_scope text DEFAULT 'system'::text, p_org_id uuid DEFAULT NULL::uuid, p_resolve_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'name'::text, p_dir text DEFAULT 'asc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_mode  text := lower(coalesce(p_mode, 'page'));
  v_level text := lower(coalesce(p_level, 'person'));
  v_scope text := lower(coalesce(p_scope, 'system'));
  v_q     text := NULLIF(lower(btrim(coalesce(p_search, ''))), '');
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_dir   text := CASE WHEN lower(coalesce(p_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort  text := coalesce(NULLIF(p_sort, ''), 'name');
  v_res_user uuid;
  v_res_org  uuid;
  v_out   jsonb;
  -- An exact-key select filter is pushed into the row builder (page and counts only: facets
  -- skip a column's own filter, so they still need every key).
  v_keys  text[] := CASE WHEN v_f->'mandateKey'->>'kind' = 'select'
                              AND jsonb_typeof(v_f->'mandateKey'->'values') = 'array'
                              AND jsonb_array_length(v_f->'mandateKey'->'values') > 0
                         THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'mandateKey'->'values'))
                         END;
  -- ONE LADDER PER ROW SHOWN, NOT PER ROW OWNED (2026-09-26, 57014 on /mandates/list-preview).
  -- Every call used to run the full ladder (`mandate._rungs`: per-row access, per-holder
  -- reachability for every member of the home organization, the output contract — ~2 ms a
  -- row) over the WHOLE corpus (~720 rows for a normal member), three times per page load,
  -- to paint 50 rows and five numbers: 2–3 s a call alone, 8 s+ (the statement timeout)
  -- when the three ran together. These are the only columns that need the ladder; a
  -- question that reads none of them (no search, no filter or sort on them) is answered
  -- from the definition rows alone, and the ladder runs only for the rows it returns.
  v_ladder_cols constant text[] := ARRAY['holderName', 'holderType', 'decidedBy', 'pinText',
                                         'customizedBy', 'health', 'status'];
  v_light_filter boolean;
  v_my_orgs uuid[];
  v_total bigint;
  v_page_keys text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to list mandates.';
  END IF;
  IF v_mode NOT IN ('page', 'counts', 'facets') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_mode %L is not a mode of the mandate list.', p_mode),
      hint    = 'Use page, counts or facets.';
  END IF;
  IF v_level NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_level %L is not a level of the mandate list.', p_level),
      hint    = 'Use person or organization.';
  END IF;

  IF v_level = 'organization' THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = 'The organization mandate list needs to know which organization.',
        hint    = 'Pass p_org_id.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = p_org_id) THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'You are not a member of that organization, so its mandates are not yours to list.';
    END IF;
    IF v_scope NOT IN ('orgs', 'shared', 'public', 'system') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a scope of the organization mandate list.', p_scope),
        hint    = 'Use orgs, shared, public or system.';
    END IF;
    v_res_user := NULL;          -- a member's own overrides are each member's own
    v_res_org  := p_org_id;
  ELSE
    IF v_scope NOT IN ('mine', 'shared', 'orgs', 'public', 'system') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a scope of the mandate list.', p_scope),
        hint    = 'Use mine, shared, orgs, public or system.';
    END IF;
    IF p_resolve_org_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM iam.organization_member om
          WHERE om.user_id = v_uid AND om.organization_id = p_resolve_org_id) THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'You are not a member of that organization, so what it runs is not yours to see.',
        hint    = 'Switch to an organization you belong to.';
    END IF;
    v_res_user := v_uid;
    v_res_org  := p_resolve_org_id;
  END IF;

  -- Asked ONCE (it was asked per row, per scope, through mandate._member_scope_ok and
  -- mandate._member_shared_org_ids — ~2,000 function calls, each re-running the RLS of
  -- iam.permissions and mandate.binding).
  v_my_orgs := ARRAY(SELECT iam.my_orgs());
  v_light_filter := v_q IS NULL
    AND jsonb_typeof(v_f) = 'object'
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(v_f) k WHERE k = ANY (v_ladder_cols));

  -- ── counts ──────────────────────────────────────────────────────────────
  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT s.* FROM mandate._member_list_seat(v_res_user, v_res_org, v_level, v_keys,
                                                p_org_id, v_uid, v_my_orgs) s
      WHERE CASE WHEN v_light_filter THEN mandate._admin_list_match(s.vals, v_f)
                 -- Search, or a filter on a ladder column: the ladder decides which rows count.
                 ELSE s.id IN (SELECT r.id FROM mandate._member_list_rows(v_q, v_res_user, v_res_org,
                                                                         v_level, v_keys, false) r
                                WHERE (v_q IS NULL OR r.score > 0)
                                  AND mandate._admin_list_match(r.vals, v_f)) END
    )
    SELECT jsonb_build_object(
      'mine',   CASE WHEN v_level = 'person' THEN (SELECT count(*) FROM narrowed n WHERE n.in_mine) ELSE 0 END,
      'shared', (SELECT count(*) FROM narrowed n WHERE n.in_shared),
      'orgs',   (SELECT count(*) FROM narrowed n WHERE n.in_orgs),
      'public', (SELECT count(*) FROM narrowed n WHERE n.in_public),
      'system', (SELECT count(*) FROM narrowed n WHERE n.is_system),
      -- One narrowing option per organization a row reaches this person through: its home
      -- (when that is one of their organizations) and every organization it was shared with.
      'orgs_narrow', CASE WHEN v_level = 'organization' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.org_id, 'label', o.label, 'count', o.n)
                         ORDER BY o.label)
        -- Every organization this seat is a member of is named by its own name.
        FROM (SELECT x.org_id,
                     coalesce(org.name, 'Organization') AS label,
                     count(DISTINCT x.row_id) AS n
              FROM (SELECT n.id AS row_id, n.organization_id AS org_id
                      FROM narrowed n
                     WHERE NOT n.is_system
                       AND n.organization_id = ANY (v_my_orgs)
                    UNION ALL
                    SELECT n.id, g.org_id
                      FROM narrowed n
                      CROSS JOIN LATERAL unnest(n.shared_org_ids) AS g(org_id)
                     WHERE NOT n.is_system) x
              LEFT JOIN iam.organizations org ON org.id = x.org_id
              GROUP BY 1, 2) o), '[]'::jsonb) END)
    INTO v_out;
    RETURN v_out;
  END IF;

  -- The scope is decided without the ladder, so the ladder only ever runs for rows in it.
  v_page_keys := ARRAY(
    SELECT s.mandate_key
      FROM mandate._member_list_seat(v_res_user, v_res_org, v_level,
                                     CASE WHEN v_mode = 'facets' THEN NULL ELSE v_keys END,
                                     p_org_id, v_uid, v_my_orgs) s
     WHERE CASE v_scope WHEN 'mine'   THEN s.in_mine
                        WHEN 'shared' THEN s.in_shared
                        WHEN 'orgs'   THEN s.in_orgs
                        WHEN 'public' THEN s.in_public
                        ELSE s.is_system END
       -- A page that neither searches nor filters or sorts on a ladder column is chosen
       -- from these rows alone (below); the rest need the ladder for the whole scope.
       AND (v_mode = 'facets' OR NOT v_light_filter OR v_sort = ANY (v_ladder_cols)
            OR mandate._admin_list_match(s.vals, v_f))
     ORDER BY
       CASE WHEN v_dir = 'asc'  AND jsonb_typeof(s.sortv->v_sort) = 'number'
            THEN (s.sortv->>v_sort)::numeric END ASC,
       CASE WHEN v_dir = 'desc' AND jsonb_typeof(s.sortv->v_sort) = 'number'
            THEN (s.sortv->>v_sort)::numeric END DESC,
       CASE WHEN v_dir = 'asc'  AND jsonb_typeof(s.sortv->v_sort) = 'string'
            THEN s.sortv->>v_sort END ASC,
       CASE WHEN v_dir = 'desc' AND jsonb_typeof(s.sortv->v_sort) = 'string'
            THEN s.sortv->>v_sort END DESC,
       CASE WHEN NOT (s.sortv ? v_sort) THEN lower(s.name) END ASC,
       s.mandate_key ASC);

  -- ── facets ──────────────────────────────────────────────────────────────
  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level,
                                                v_page_keys, false) r
      WHERE (v_q IS NULL OR r.score > 0)
    )
    SELECT coalesce(jsonb_object_agg(c.col, c.opts), '{}'::jsonb) INTO v_out
    FROM (
      SELECT t.col, jsonb_agg(jsonb_build_object('value', t.val, 'count', t.n)
                              ORDER BY t.n DESC, t.val) AS opts
      FROM (
        -- One pass: each row's own keys, the match only when a filter is set
        -- (mnd_admin_list_facets_one_pass_2026_09_26 — the same fix, the same answer).
        SELECT e.key AS col, v.val, count(*) AS n
        FROM scoped r
        CROSS JOIN LATERAL jsonb_each(r.vals) e
        CROSS JOIN LATERAL (SELECT DISTINCT x AS val
                            FROM jsonb_array_elements_text(e.value) x) v
        WHERE e.key NOT IN ('goal', 'updatedAt', 'createdAt')
          AND (v_f = '{}'::jsonb OR mandate._admin_list_match(r.vals, v_f, e.key))
        GROUP BY e.key, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- ── page ────────────────────────────────────────────────────────────────
  IF v_light_filter AND NOT (v_sort = ANY (v_ladder_cols)) THEN
    -- v_page_keys is already this scope's matched rows in page order: slice it.
    v_total := coalesce(cardinality(v_page_keys), 0);
    v_page_keys := v_page_keys[greatest(coalesce(p_offset, 0), 0) + 1 :
                               greatest(coalesce(p_offset, 0), 0) + greatest(coalesce(p_limit, 50), 1)];
  ELSE
    WITH matched AS (
      SELECT r.mandate_key, r.name, r.sortv, r.score, count(*) OVER () AS total
      FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level, v_page_keys, false) r
      WHERE (v_q IS NULL OR r.score > 0)
        AND mandate._admin_list_match(r.vals, v_f)
    ),
    ordered AS (
      SELECT m.mandate_key, m.total FROM matched m
      ORDER BY
        CASE WHEN v_q IS NOT NULL THEN m.score END DESC,
        CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'number'
             THEN (m.sortv->>v_sort)::numeric END ASC,
        CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'number'
             THEN (m.sortv->>v_sort)::numeric END DESC,
        CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'string'
             THEN m.sortv->>v_sort END ASC,
        CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'string'
             THEN m.sortv->>v_sort END DESC,
        CASE WHEN v_q IS NULL AND NOT (m.sortv ? v_sort) THEN lower(m.name) END ASC,
        m.mandate_key ASC
      LIMIT greatest(coalesce(p_limit, 50), 1)
      OFFSET greatest(coalesce(p_offset, 0), 0)
    )
    SELECT coalesce((SELECT max(m.total) FROM matched m), 0),
           ARRAY(SELECT o.mandate_key FROM ordered o)
      INTO v_total, v_page_keys;
  END IF;

  -- The page's rows, ladder and all — for the page's keys only, in the page's order.
  SELECT jsonb_build_object(
    'total', v_total,
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'mandate_key', o.mandate_key, 'name', o.name,
        'feature_label', o.feature_label, 'goal', o.goal,
        'created_by_me', o.created_by = v_uid,
        'organization_id', o.organization_id, 'is_system', o.is_system,
        'home_label', o.home_label,
        'holder_type', o.holder_type, 'holder_id', o.holder_id, 'holder_name', o.holder_name,
        'decided_by', o.decided_by, 'decided_rung', o.decided_rung, 'pin_text', o.pin_text,
        'customized_by', to_jsonb(o.customized_by), 'health', o.health,
        'origin', o.origin, 'visibility', o.visibility, 'is_enabled', o.is_enabled,
        'updated_at', o.updated_at, 'created_at', o.created_at)
        ORDER BY array_position(v_page_keys, o.mandate_key))
      FROM mandate._member_list_rows(NULL, v_res_user, v_res_org, v_level, v_page_keys, false) o),
      '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.org_create(p_name text, p_slug text, p_description text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_logo_file_id uuid DEFAULT NULL::uuid, p_website text DEFAULT NULL::text, p_settings jsonb DEFAULT '{}'::jsonb, p_abbreviation text DEFAULT NULL::text)
 RETURNS iam.organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.org_update(p_org_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row iam.organizations;
begin
  if v_actor is null then
    raise exception 'org_update: nobody is signed in.' using errcode = '42501';
  end if;
  if p_org_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'org_update: name the organization and pass an object of changes.'
      using errcode = '22004';
  end if;

  -- THE LADDER. The predicate `org_update_policy` carried.
  if not (public.is_platform_admin() or iam.is_org_manager(p_org_id, v_actor)) then
    raise exception 'org_update: you are not a manager of this organization.'
      using errcode = '42501';
  end if;

  -- SEVEN KEYS, READ OUT OF THE PATCH. Everything else a caller puts in the object is
  -- ignored: `created_by`, `slug` and the rest are not reachable from a
  -- browser at all. Two of the three callers passed their patch through UNFILTERED.
  update iam.organizations o
     set name          = coalesce(nullif(btrim(coalesce(p_patch ->> 'name', '')), ''), o.name),
         abbreviation  = case when p_patch ? 'abbreviation' then nullif(btrim(coalesce(p_patch ->> 'abbreviation', '')), '') else o.abbreviation end,
         description   = case when p_patch ? 'description'  then p_patch ->> 'description'  else o.description end,
         logo_url      = case when p_patch ? 'logo_url'     then p_patch ->> 'logo_url'     else o.logo_url end,
         logo_file_id  = case when p_patch ? 'logo_file_id' then nullif(p_patch ->> 'logo_file_id', '')::uuid else o.logo_file_id end,
         website       = case when p_patch ? 'website'      then p_patch ->> 'website'      else o.website end,
         settings      = case when jsonb_typeof(p_patch -> 'settings') = 'object' then p_patch -> 'settings' else o.settings end
   where o.id = p_org_id
  returning * into v_row;

  if not found then
    raise exception 'org_update: there is no such organization here.' using errcode = '23503';
  end if;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'slug', v_row.slug);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.custom_fields_retrofit(p_token text DEFAULT NULL::text)
 RETURNS TABLE(token text, relation text, action text, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r          record;
  v_oid      oid;
  v_kind     "char";
  v_ispart   boolean;
  v_has_col  boolean;
  v_has_trg  boolean;
  v_did_col  boolean;
  v_did_trg  boolean;
begin
  if pg_catalog.current_setting('custom.retrofit_running', true) = 'on' then
    return;                       -- re-entered from the DDL sync; the outer call is doing it
  end if;
  perform pg_catalog.set_config('custom.retrofit_running', 'on', true);

  for r in
    select e.token       as tok,
           e.type        as typ,
           e.schema_name as nsp,
           e.table_name  as rel
      from platform.entity_types e
     where e.custom_fields_enabled
       and e.is_active
       and (p_token is null or e.token = p_token)
     order by e.schema_name, e.table_name
  loop
    token := r.tok;
    relation := r.nsp || '.' || r.rel;
    note := null;
    v_did_col := false;
    v_did_trg := false;

    select c.oid, c.relkind, c.relispartition
      into v_oid, v_kind, v_ispart
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = r.nsp and c.relname = r.rel;

    if v_oid is null then
      action := 'no relation';
      note := 'the registry names a table that is not in this database';
      return next; continue;
    end if;
    if v_kind not in ('r', 'p') then
      action := 'not a table';
      note := format('relkind %s - custom fields live in a column of the table itself', v_kind);
      return next; continue;
    end if;
    if v_ispart then
      action := 'partition child';
      note := 'the parent carries the column and this child inherits it';
      return next; continue;
    end if;

    v_has_col := exists (select 1 from pg_attribute a
                          where a.attrelid = v_oid and a.attname = 'custom_fields'
                            and a.attnum > 0 and not a.attisdropped);
    v_has_trg := exists (select 1 from pg_trigger t
                          where t.tgrelid = v_oid and not t.tgisinternal
                            and t.tgfoid = 'custom._entity_custom_fields_guard'::regproc);

    -- ONE TABLE'S FAILURE IS ONE TABLE'S FAILURE. The nested block is a subtransaction, so a
    -- table that is busy right now (55P03 from the lock timeout above) is reported by name
    -- and the other 642 still get served. It is reported, never swallowed: the caller sees
    -- the code and the message, and the next pass picks it up.
    begin
      -- THE SEARCH_PATH WINDOW (ENTITY-TAIL 1). `platform._ddl_guard` freezes the nine
      -- historical organization_id defaults by the md5 of `pg_get_expr(...)`, and pg_get_expr
      -- DEPARSES against search_path: under this function's narrow 'pg_catalog' the very same
      -- default renders a schema-qualified function call instead of
      -- the unqualified one, misses every frozen hash, and the guard refuses an
      -- ADD COLUMN that never touched organization_id. The window is exactly as wide as the
      -- statements below, which name nothing by search_path: every identifier is a literal
      -- from the registry, quoted by format(%I), and every function is schema-qualified.
      perform pg_catalog.set_config('search_path', 'pg_catalog, public', true);

      if not v_has_col then
        execute format('alter table %I.%I add column custom_fields jsonb not null default %L::jsonb',
                       r.nsp, r.rel, '{}');
        execute format($c$comment on column %I.%I.custom_fields is %L$c$, r.nsp, r.rel,
                       'REC-40 / REC-53: this organization''s own fields on this standard '
                       || r.typ || '. One jsonb per row, validated against the Field records '
                       || 'carrying this table''s registry token. Never system data - that is metadata (REC-59).');
        v_did_col := true;
      end if;

      if not v_has_trg then
        -- The token is the trigger's ONE argument, so the guard never has to work out which
        -- table it is on (REC-51).
        execute format(
          'create trigger custom_fields_validation before insert or update of custom_fields '
          || 'on %I.%I for each row execute function custom._entity_custom_fields_guard(%L)',
          r.nsp, r.rel, r.tok);
        v_did_trg := true;
      end if;

      perform pg_catalog.set_config('search_path', 'pg_catalog', true);
    exception when others then
      perform pg_catalog.set_config('search_path', 'pg_catalog', true);
      action := 'refused';
      note := sqlstate || ' ' || sqlerrm;
      return next; continue;
    end;

    action := case
                when v_did_col and v_did_trg then 'column + trigger'
                when v_did_col then 'column'
                when v_did_trg then 'trigger'
                else 'already'
              end;
    return next;
  end loop;

  perform pg_catalog.set_config('custom.retrofit_running', 'off', true);
  return;
end
$function$;

CREATE OR REPLACE FUNCTION platform.kernel_equivalence_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_version constant text := 'v1';
  c_org     constant uuid := 'f1ce0000-0000-4000-8000-0000000000d1';
  c_home    constant uuid := 'f1ce0000-0000-4000-8000-0000000000f0';
  c_people  constant text[] := array['author', 'org_owner', 'member', 'grantee', 'stranger'];
  c_names   constant text[] := array['Marisol Vega', 'Owen Pruitt', 'Keiko Tran', 'Rafael Duarte', 'Lena Holt'];
  c_ids     constant uuid[] := array['f1ce0000-0000-4000-8000-0000000000a1', 'f1ce0000-0000-4000-8000-0000000000a2',
                                     'f1ce0000-0000-4000-8000-0000000000a3', 'f1ce0000-0000-4000-8000-0000000000a4',
                                     'f1ce0000-0000-4000-8000-0000000000a5']::uuid[];
  c_levels  constant public.permission_level[] := array['viewer', 'commenter', 'editor', 'admin']::public.permission_level[];
  v_t0      timestamptz := clock_timestamp();
  v_ans     jsonb := '{}'::jsonb;
  v_things  jsonb := '[]'::jsonb;
  v_err     text;
  v_qual    text;
  v_b       boolean;
  v_set     uuid[];
  v_tbl     uuid;
  v_fields  jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
  i         integer;
  t         jsonb;
  lvl       public.permission_level;
begin
  -- Two callers never build the world at once (fixed ids); held to the caller's commit.
  perform pg_advisory_xact_lock(hashtext('platform.kernel_equivalence_fixture'));
  begin
    perform set_config('app.actor_system', 'kernel_equivalence_fixture', true);
    -- THE WORLD IS BUILT BY NOBODY (lane PROVISION-BATCH-FIX, 2026-09-26). The fixture used to
    -- inherit the CALLER's signed-in identity, so a provision run by a person (request.jwt.claims
    -- sub set, e.g. admin@admin.com) could never heal: inserting the fixture's people fired the
    -- signup-organization guard (42501)
    -- and the heal refused an equivalent kernel. Cleared here, inside the subtransaction, so the
    -- rollback below gives the caller its identity back untouched.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1 .. 5 loop
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (c_ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              lower(replace(c_names[i], ' ', '.')) || '.kernel-fixture@aimatrx.com',
              jsonb_build_object('display_name', c_names[i]), now(), now());
    end loop;
    insert into iam.organizations (id, name, slug, abbreviation, created_by)
    values (c_org, 'Harbor Point Dental Studio', 'harbor-point-dental-kernel-fixture', 'HPD', c_ids[2]);
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
      (c_org, 'organization', c_org, c_ids[2], 'owner',  'active'),
      (c_org, 'organization', c_org, c_ids[1], 'member', 'active'),
      (c_org, 'organization', c_org, c_ids[3], 'member', 'active');

    insert into code.code_repositories (id, organization_id, name, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000b1', c_org, 'patient-reminder-scripts', c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000b2', c_org, 'marisol-scratch-notes',    c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b3', c_org, 'public-booking-widget',    c_ids[1], 'public'),
      ('f1ce0000-0000-4000-8000-0000000000b4', c_org, 'insurance-claim-exports',  c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b5', c_org, 'front-desk-templates',     c_ids[1], 'internal');
    insert into interview.session (id, organization_id, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000c1', c_org, c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000c2', c_org, c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000c3', c_org, c_ids[1], 'personal');
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by) values
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b4', c_ids[4], 'viewer',    c_ids[1]),
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b5', c_ids[4], 'editor',    c_ids[1]),
      ('interview_session', 'f1ce0000-0000-4000-8000-0000000000c3', c_ids[3], 'commenter', c_ids[1]);
    insert into platform.comments (id, organization_id, entity_type, entity_id, body, created_by) values
      ('f1ce0000-0000-4000-8000-0000000000e1', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b1',
       'Can we move the reminder send to 9am?', c_ids[3]),
      ('f1ce0000-0000-4000-8000-0000000000e2', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b4',
       'Claim export for Q3 looks right.', c_ids[4]);

    -- The record store: a home, an open Table and a "mine" Table (its record personal, its rows
    -- internal — the shape SHARE-LANE-2 walled the organization roles out of).
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values (c_home, c_org, '11111111-0000-4000-8000-000000000004', 'record', '{"name": "Front desk"}', c_ids[2]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'Patient recall list', 'slug', 'kf_recall', 'label_singular', 'Patient', 'label_plural', 'Patients',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1] where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f1', c_org, v_tbl, 'record',
            '{"title": "Recall: Jonah Ellis, 6-month cleaning"}', c_ids[1]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'My chairside notes', 'slug', 'kf_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1], visibility = 'personal' where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f2', c_org, v_tbl, 'record',
            '{"title": "Crown prep went long, book 90 min next time"}', c_ids[1]);

    v_things := '[
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal","id":"f1ce0000-0000-4000-8000-0000000000b1","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal","id":"f1ce0000-0000-4000-8000-0000000000b2","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_public","id":"f1ce0000-0000-4000-8000-0000000000b3","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal_shared_viewer","id":"f1ce0000-0000-4000-8000-0000000000b4","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal_shared_editor","id":"f1ce0000-0000-4000-8000-0000000000b5","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_internal","id":"f1ce0000-0000-4000-8000-0000000000c1","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal","id":"f1ce0000-0000-4000-8000-0000000000c2","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal_shared_commenter","id":"f1ce0000-0000-4000-8000-0000000000c3","sets":true},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_internal_repo","id":"f1ce0000-0000-4000-8000-0000000000e1","sets":false},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_shared_personal_repo","id":"f1ce0000-0000-4000-8000-0000000000e2","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_an_open_table","id":"f1ce0000-0000-4000-8000-0000000000f1","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_a_mine_table","id":"f1ce0000-0000-4000-8000-0000000000f2","sets":false}
    ]'::jsonb;

    for t in select x from jsonb_array_elements(v_things) x loop
      select p.qual into v_qual from pg_policies p
       where p.schemaname = t->>'schema' and p.tablename = t->>'table' and p.policyname = 'std_select';
      for i in 1 .. 5 loop
        perform set_config('request.jwt.claims',
          json_build_object('sub', c_ids[i], 'role', 'authenticated')::text, true);
        foreach lvl in array c_levels loop
          v_ans := v_ans || jsonb_build_object(
            format('k:%s:%s:%s:%s', t->>'token', t->>'thing', c_people[i], lvl),
            iam.has_access_for(c_ids[i], t->>'token', (t->>'id')::uuid, lvl));
        end loop;
        if v_qual is null then
          v_b := null;
        else
          execute format('select exists (select 1 from %I.%I where id = $1 and (%s))', t->>'schema', t->>'table', v_qual)
            into v_b using (t->>'id')::uuid;
        end if;
        v_ans := v_ans || jsonb_build_object(format('p:%s:%s:%s', t->>'token', t->>'thing', c_people[i]), v_b);
        if (t->>'sets')::boolean then
          v_set := iam.accessible_entity_ids(t->>'token', 'viewer'::public.permission_level, 0, true);
          v_ans := v_ans || jsonb_build_object(format('s:%s:%s:%s', t->>'token', t->>'thing', c_people[i]),
                                               (t->>'id')::uuid = any (coalesce(v_set, '{}'::uuid[])));
        end if;
      end loop;
    end loop;

    -- Everything above is undone here, every time: the world never outlives the question.
    raise exception using errcode = 'KF000', message = 'kernel equivalence fixture rolled back';
  exception
    when sqlstate 'KF000' then null;
    when others then
      v_err := sqlstate || ': ' || sqlerrm;
  end;
  return jsonb_build_object('version', c_version, 'answers', v_ans, 'error', v_err,
                            'ms', round((extract(epoch from clock_timestamp() - v_t0) * 1000)::numeric, 1));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.retrofit_entity(p_schema text, p_table text, p_token text, p_org_strategy text, p_org_expr text DEFAULT NULL::text, p_owner_col text DEFAULT NULL::text, p_parent_ref text DEFAULT NULL::text, p_parent_fk text DEFAULT NULL::text, p_visibility_expr text DEFAULT NULL::text, p_legacy_trigger text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tbl        regclass;
  v_variant    text;
  v_versioned  boolean;
  v_softdel    boolean;
  v_listed     boolean;
  v_shareable  boolean;
  v_actor_req  boolean;
  v_mut_req    boolean;
  v_vis_req    boolean;
  v_parent_sch text; v_parent_tbl text; v_parent_org text;
  v_cbt        text;
  v_null_org   bigint;
  v_null_vis   bigint;
  v_did        text[] := '{}';
  v_sysorg     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  function_has boolean;
  v_trig text;
begin
  -- ── the table, the token, and the registry must agree before a single column moves ──────────
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  if v_tbl is null then
    raise exception 'retrofit_entity: %.% does not exist', p_schema, p_table;
  end if;
  select et.rls_variant, coalesce(et.is_versioned,false), coalesce(et.has_soft_delete,false),
         coalesce(et.is_listed,false)
    into v_variant, v_versioned, v_softdel, v_listed
    from platform.entity_types et
   where et.token = p_token and et.is_active
     and et.schema_name = p_schema and et.table_name = p_table;
  if v_variant is null then
    raise exception
      'retrofit_entity: token % is not an active registered entity at %.%. The base contract is decided by the registry''s rls_variant, so a table that is not registered there cannot be retrofitted — register it first (platform.entity_types) with its data_class and variant.',
      p_token, p_schema, p_table;
  end if;
  if v_variant not in ('entity','system','restricted','personal','component','ledger','reference') then
    raise exception 'retrofit_entity: token % has rls_variant %, which §6d-3 does not define', p_token, v_variant;
  end if;
  if p_org_strategy is null or p_org_strategy not in ('system','parent','expr','keep') then
    raise exception
      'retrofit_entity(%): org strategy % is not one of system | parent | expr | keep. NO NULL ORG (db-rules §2): the organization a row belongs to is stated by the operation, never inferred by the database, so this function has no default strategy.',
      p_token, coalesce(p_org_strategy,'<null>');
  end if;

  v_shareable := exists (select 1 from platform.shareable_resource_registry
                          where resource_type = p_token and is_active);
  v_actor_req := v_variant in ('entity','system','restricted');
  v_mut_req   := v_variant in ('entity','system','restricted','personal') or v_versioned;
  v_vis_req   := v_variant = 'system' or (v_variant = 'entity' and (v_listed or v_shareable));

  -- ── §6d-3 refusals: never a column the variant forbids ──────────────────────────────────────
  if p_visibility_expr is not null and v_variant in ('component','ledger','reference') then
    raise exception
      'retrofit_entity(%): a % may not be given a visibility column — its generated RLS lane never reads one, so the column would be a second, competing access authority (§6d-1/§6d-2, and iam.verify_canonical WARNs it as a stray). Remove the visibility argument.',
      p_token, v_variant;
  end if;
  if v_vis_req and p_visibility_expr is null
     and not exists (select 1 from information_schema.columns
                      where table_schema=p_schema and table_name=p_table and column_name='visibility'
                        and udt_schema='platform' and udt_name='visibility') then
    raise exception
      'retrofit_entity(%): the % variant requires a visibility column and nobody said what these rows'' visibility is. iam.apply_rls refuses the table without it, and this function will not pick a value: "public" would publish every row to anonymous readers and "personal" would hide them from everyone. Pass p_visibility_expr — a literal such as ''public'', or SQL over alias t such as (case when t.active then ''public'' else ''internal'' end).',
      p_token, v_variant;
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname = 'org_id' and not a.attisdropped) then
    raise exception
      'retrofit_entity(%): %.% carries the legacy column org_id. organization_id is the canonical name (db-rules §2 kill list) and two org columns on one table is an access ambiguity, not a retrofit. Rename or drop org_id in its own migration first.',
      p_token, p_schema, p_table;
  end if;
  select data_type into v_cbt from information_schema.columns
   where table_schema = p_schema and table_name = p_table and column_name = 'created_by';
  if v_cbt is not null and v_cbt <> 'uuid' then
    raise exception
      'retrofit_entity(%): created_by is % (not uuid) on %.%. created_by is the entity''s access key and must FK auth.users; rename the domain column (e.g. to created_by_kind) in its own migration first.',
      p_token, v_cbt, p_schema, p_table;
  end if;

  -- ── THE CANONICAL TRIGGERS COME OFF BEFORE ANY BACKFILL AND GO BACK ON AT THE END ──────────
  -- Two reasons, and the second is a silent data loss this retrofit walked into head-first.
  --  1. A backfill is not a user revision. Leaving `_touch_row` attached bumps `version` and
  --     restamps `updated_at` on every row this function touches, which is a lie about the row.
  --  2. 🚨 `platform._touch_row()` rebuilds NEW with `jsonb_populate_record(NEW, ...)`. Once the
  --     trigger has fired in a transaction its cached row-type for NEW is THE SHAPE THE TABLE HAD
  --     THEN, so an UPDATE writing a column ADDED LATER IN THE SAME TRANSACTION is rebuilt without
  --     it and the new value is silently dropped to NULL. Measured live: the batch-1 retrofit of
  --     crm.jurisdiction_policy backfilled organization_id (firing the trigger), then added
  --     `visibility` and backfilled it — and all 35 rows came out NULL, with no error anywhere.
  --     Only this function's own "every row's visibility is stated or the table is not
  --     retrofitted" assertion caught it. Detaching the trigger first takes this function out of
  --     that class entirely: every backfill it does runs with no trigger attached at all.
  --  3. 🚨 AND IT IS DONE BY DISABLING, NOT BY NAME. The first version of this dropped
  --     `_touch_row` and `_stamp_actor` BY NAME. `platform.change_type_default` carries the very
  --     same function under the name `_touch`, so the drop missed it, the trigger fired on the
  --     backfills, and the `metadata` column added earlier in the transaction came back NULL — this
  --     time loudly, as a NOT NULL violation, because `metadata` is NOT NULL. A name is not an
  --     identity: `alter table ... disable trigger user` covers every trigger whatever it is
  --     called, and the canonical pair is then dropped BY FUNCTION (pg_proc.proname) so a
  --     non-canonically-named duplicate cannot survive beside the one this function re-creates.
  execute format('alter table %s disable trigger user', v_tbl::text);
  for v_trig in select tg.tgname from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
                 where tg.tgrelid = v_tbl and not tg.tgisinternal
                   and pr.proname in ('_touch_row','_stamp_actor')
  loop
    execute format('drop trigger if exists %I on %s', v_trig, v_tbl::text);
    v_did := array_append(v_did, format('dropped %s (a canonical trigger under a non-canonical name)', v_trig));
  end loop;

  -- ── id ───────────────────────────────────────────────────────────────────────────────────────
  -- A ledger row has a POSITION, not a shareable identity, so an integer sequence is canonical
  -- there (iam.verify_canonical, the history.row_versions shape) and is left alone.
  if not exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname = 'id' and not a.attisdropped) then
    if v_variant = 'ledger' then
      execute format('alter table %s add column id uuid not null default gen_random_uuid()', v_tbl::text);
      v_did := array_append(v_did, 'id(uuid, ledger had none)');
    else
      execute format('alter table %s add column id uuid not null default gen_random_uuid()', v_tbl::text);
      execute format('create unique index if not exists %I on %s (id)',
                     left(format('%s_%s_id_key', p_schema, p_table), 63), v_tbl::text);
      v_did := array_append(v_did, 'id(uuid + unique; the natural key stays the PK)');
    end if;
  else
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='id'
                      and (data_type='uuid' or (v_variant='ledger' and data_type in ('bigint','integer','smallint')))) then
      raise exception
        'retrofit_entity(%): %.% has an id column that is neither uuid nor (for a ledger) an integer sequence. The canonical identity cannot be changed underneath live rows by a retrofit — decide it in its own migration.',
        p_token, p_schema, p_table;
    end if;
  end if;

  -- ── organization_id: add, backfill by the NAMED strategy, NOT NULL, FK ──────────────────────
  if not exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname='organization_id' and not a.attisdropped) then
    execute format('alter table %s add column organization_id uuid', v_tbl::text);
    v_did := array_append(v_did, 'organization_id');
  end if;

  if p_org_strategy = 'system' then
    execute format('update %s t set organization_id = %L::uuid where t.organization_id is null', v_tbl::text, v_sysorg);
  elsif p_org_strategy = 'parent' then
    if p_parent_ref is null or p_parent_fk is null then
      raise exception 'retrofit_entity(%): the parent strategy needs p_parent_ref (schema.table) and p_parent_fk', p_token;
    end if;
    v_parent_sch := split_part(p_parent_ref, '.', 1);
    v_parent_tbl := split_part(p_parent_ref, '.', 2);
    if to_regclass(format('%I.%I', v_parent_sch, v_parent_tbl)) is null then
      raise exception 'retrofit_entity(%): parent % does not exist', p_token, p_parent_ref;
    end if;
    select column_name into v_parent_org from information_schema.columns
     where table_schema=v_parent_sch and table_name=v_parent_tbl and column_name='organization_id';
    if v_parent_org is null then
      raise exception 'retrofit_entity(%): parent % has no organization_id to inherit — retrofit the parent first', p_token, p_parent_ref;
    end if;
    execute format(
      $q$update %s t set organization_id = p.organization_id
           from %I.%I p where p.id = t.%I and t.organization_id is null$q$,
      v_tbl::text, v_parent_sch, v_parent_tbl, p_parent_fk);
  elsif p_org_strategy = 'expr' then
    if p_org_expr is null then
      raise exception 'retrofit_entity(%): the expr strategy needs p_org_expr', p_token;
    end if;
    execute format('update %s t set organization_id = (%s) where t.organization_id is null', v_tbl::text, p_org_expr);
  end if;

  execute format('select count(*) from %s where organization_id is null', v_tbl::text) into v_null_org;
  if v_null_org > 0 then
    raise exception
      'retrofit_entity(%): % row(s) of %.% would be left with no organization by strategy %. NO NULL ORG (owner ruling 2026-08-21): NULL is not a scope, not "global", not "system" and not "unknown yet". Name the organization those rows belong to — a different strategy, or an expr — rather than letting the column stay nullable.',
      p_token, v_null_org, p_schema, p_table, p_org_strategy;
  end if;
  execute format('alter table %s alter column organization_id set not null', v_tbl::text);
  if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                  where c.conrelid=v_tbl and c.contype='f' and a.attname='organization_id'
                    and c.confrelid='iam.organizations'::regclass) then
    execute format('alter table %s add constraint %I foreign key (organization_id) references iam.organizations(id)',
                   v_tbl::text, left(format('%s_%s_organization_id_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'organization_id FK -> iam.organizations');
  end if;

  -- ── created_at (a ledger may name it occurred_at) ────────────────────────────────────────────
  if not exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and is_nullable='NO'
                    and (column_name='created_at' or (v_variant='ledger' and column_name='occurred_at'))) then
    if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_at' and not a.attisdropped) then
      execute format('update %s set created_at = now() where created_at is null', v_tbl::text);
      execute format('alter table %s alter column created_at set default now(), alter column created_at set not null', v_tbl::text);
      v_did := array_append(v_did, 'created_at NOT NULL');
    else
      execute format('alter table %s add column created_at timestamptz not null default now()', v_tbl::text);
      v_did := array_append(v_did, 'created_at');
    end if;
  end if;

  -- ── metadata: universal, every variant ───────────────────────────────────────────────────────
  if not exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='metadata'
                    and data_type='jsonb' and is_nullable='NO') then
    if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='metadata' and not a.attisdropped) then
      execute format('update %s set metadata = ''{}''::jsonb where metadata is null', v_tbl::text);
      execute format('alter table %s alter column metadata set default ''{}''::jsonb, alter column metadata set not null', v_tbl::text);
      v_did := array_append(v_did, 'metadata NOT NULL');
    else
      execute format('alter table %s add column metadata jsonb not null default ''{}''::jsonb', v_tbl::text);
      v_did := array_append(v_did, 'metadata');
    end if;
  end if;

  -- ── the ACTOR PAIR — entity family only (§6d-1, §6d-3) ──────────────────────────────────────
  if v_actor_req then
    if not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_by' and not a.attisdropped) then
      execute format('alter table %s add column created_by uuid', v_tbl::text);
      if p_owner_col is not null and exists (select 1 from information_schema.columns
            where table_schema=p_schema and table_name=p_table and column_name=p_owner_col and data_type='uuid') then
        execute format('update %s t set created_by = t.%I where t.created_by is null', v_tbl::text, p_owner_col);
        v_did := array_append(v_did, format('created_by (backfilled from %s)', p_owner_col));
      else
        v_did := array_append(v_did, 'created_by');
      end if;
    end if;
    if not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_by' and not a.attisdropped) then
      execute format('alter table %s add column updated_by uuid', v_tbl::text);
      v_did := array_append(v_did, 'updated_by');
    end if;
  end if;
  -- the FKs are checked wherever the columns EXIST — §6d-3: "if the column exists anyway it must
  -- still FK auth.users, and the gate keeps checking that".
  if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_by' and not a.attisdropped)
     and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='created_by' and c.confrelid='auth.users'::regclass) then
    execute format('update %s t set created_by = null where t.created_by is not null and not exists (select 1 from auth.users u where u.id = t.created_by)', v_tbl::text);
    execute format('alter table %s add constraint %I foreign key (created_by) references auth.users(id)',
                   v_tbl::text, left(format('%s_%s_created_by_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'created_by FK -> auth.users');
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_by' and not a.attisdropped)
     and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='updated_by' and c.confrelid='auth.users'::regclass) then
    execute format('update %s t set updated_by = null where t.updated_by is not null and not exists (select 1 from auth.users u where u.id = t.updated_by)', v_tbl::text);
    execute format('alter table %s add constraint %I foreign key (updated_by) references auth.users(id)',
                   v_tbl::text, left(format('%s_%s_updated_by_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'updated_by FK -> auth.users');
  end if;

  -- ── the MUTATION TRIO — where the row is user-revised, or the registry declares it versioned ─
  if v_mut_req then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='updated_at' and is_nullable='NO') then
      if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_at' and not a.attisdropped) then
        execute format('update %s set updated_at = coalesce(updated_at, now()) where updated_at is null', v_tbl::text);
        execute format('alter table %s alter column updated_at set default now(), alter column updated_at set not null', v_tbl::text);
        v_did := array_append(v_did, 'updated_at NOT NULL');
      else
        execute format('alter table %s add column updated_at timestamptz not null default now()', v_tbl::text);
        v_did := array_append(v_did, 'updated_at');
      end if;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='version'
                      and data_type='integer' and is_nullable='NO') then
      execute format('alter table %s add column if not exists version integer', v_tbl::text);
      execute format('update %s set version = coalesce(version, 1) where version is null', v_tbl::text);
      execute format('alter table %s alter column version set default 1, alter column version set not null', v_tbl::text);
      v_did := array_append(v_did, 'version');
    end if;
  end if;

  -- ── soft delete, when the registry declares it ───────────────────────────────────────────────
  if v_softdel and not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='deleted_at' and not a.attisdropped) then
    execute format('alter table %s add column deleted_at timestamptz', v_tbl::text);
    v_did := array_append(v_did, 'deleted_at');
  end if;

  -- ── visibility — REQUIRED by iam.apply_rls for the system variant; never on component/ledger ─
  if v_vis_req then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='visibility'
                      and udt_schema='platform' and udt_name='visibility') then
      if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='visibility' and not a.attisdropped) then
        raise exception
          'retrofit_entity(%): %.% already has a visibility column that is not platform.visibility (the free-text kill, db-rules §2). Converting a live access driver in place is not a retrofit — do it in its own migration with its own proof.',
          p_token, p_schema, p_table;
      end if;
      execute format('alter table %s add column visibility platform.visibility', v_tbl::text);
      execute format('update %s t set visibility = (%s)::platform.visibility where t.visibility is null', v_tbl::text, p_visibility_expr);
      execute format('select count(*) from %s where visibility is null', v_tbl::text) into v_null_vis;
      if v_null_vis > 0 then
        raise exception 'retrofit_entity(%): the visibility expression left % row(s) NULL. Every row''s visibility is stated or the table is not retrofitted.', p_token, v_null_vis;
      end if;
      execute format('alter table %s alter column visibility set not null', v_tbl::text);
      v_did := array_append(v_did, format('visibility (%s)', p_visibility_expr));
    end if;
  end if;

  -- ── the canonical triggers, attached only where they have something to do ────────────────────
  if p_legacy_trigger is not null then
    execute format('drop trigger if exists %I on %s', p_legacy_trigger, v_tbl::text);
    v_did := array_append(v_did, format('dropped legacy trigger %s', p_legacy_trigger));
  end if;
  if v_actor_req then
    execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_tbl::text);
    v_did := array_append(v_did, '_stamp_actor');
  end if;
  select (exists (select 1 from information_schema.columns
                   where table_schema=p_schema and table_name=p_table and is_nullable='NO'
                     and column_name in ('updated_at','version')))
    into function_has;
  if function_has then
    execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_tbl::text);
    v_did := array_append(v_did, '_touch_row');
  end if;

  execute format('alter table %s enable trigger user', v_tbl::text);

  return format('retrofit_entity(%s.%s / token %s / variant %s) OK — org strategy %s, null_org 0. Changed: %s',
                p_schema, p_table, p_token, v_variant, p_org_strategy,
                case when cardinality(v_did)=0 then 'nothing (already canonical)' else array_to_string(v_did, ', ') end);
end
$function$;

CREATE OR REPLACE FUNCTION seo._archive_tenant(p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'seo_archive_unauthenticated: sign in to change your keyword library'
      using errcode = '42501';
  end if;
  if p_organization_id is not null then
    if not iam.has_org_access(p_organization_id) then
      raise exception 'seo_archive_org_denied: no access to that organization'
        using errcode = '42501';
    end if;
    return p_organization_id;
  end if;
  -- One organization is the normal case and there is nothing to choose; with several, the
  -- caller names one (every organization is equal — none is chosen for the person).
  select count(*), (array_agg(om.organization_id))[1] into v_n, v_org
    from iam.organization_member om
   where om.user_id = v_uid
     and om.organization_id not in (select s.organization_id from iam.system_orgs s);
  if v_n = 1 then
    return v_org;
  end if;
  raise exception 'seo_archive_no_library: this account belongs to % organizations; name the one to archive into.', coalesce(v_n, 0)
    using errcode = '42501';
end;
$function$;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.seo_rank_target_list_scoped(
      v_scope, NULL, p_search, 'created_at', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;

  RETURN QUERY
  SELECT
    'orgs'::text,
    o.id,
    o.name,
    coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.seo_rank_target_list_scoped(
    'orgs', o.id, p_search, 'created_at', 'desc', p_filters, 1, 0
  ) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_streak_rest_weekdays(p_weekdays smallint[])
 RETURNS education.study_streak
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_row education.study_streak%rowtype;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_weekdays,'{}')) d WHERE d < 0 OR d > 6) THEN
    RAISE EXCEPTION 'weekdays must be 0..6';
  END IF;
  -- The streak row already carries the organization it was started in; nothing is chosen here.
  UPDATE education.study_streak SET rest_weekdays = coalesce(p_weekdays,'{}'), updated_at = now()
   WHERE user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your study streak has not started yet, so there are no rest days to set. Study once, then choose your rest days.'
      USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_row FROM education.study_streak WHERE user_id = v_user;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.setting_access_request_create(p_org_id uuid, p_setting_key text, p_setting_label text, p_setting_href text, p_action_key text, p_action_payload jsonb DEFAULT '{}'::jsonb, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_existing uuid;
  v_recipients jsonb;
  v_request_key text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode='42501';
  end if;
  if p_org_id is null then
    raise exception 'Name the organization whose setting you are asking about.'
      using errcode='23502', hint='Pass p_org_id.';
  end if;
  if not exists (
    select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=v_uid
  ) then
    raise exception 'You are not a member of this organization.' using errcode='42501';
  end if;
  if exists (
    select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=v_uid and role in ('owner','admin')
  ) then
    raise exception 'You can change this setting yourself.' using errcode='23505';
  end if;
  if nullif(btrim(p_setting_key),'') is null
     or nullif(btrim(p_setting_label),'') is null
     or nullif(btrim(p_action_key),'') is null then
    raise exception 'The setting request is incomplete.' using errcode='22023';
  end if;
  if length(btrim(p_setting_key)) > 200
     or length(btrim(p_setting_label)) > 160
     or length(btrim(p_action_key)) > 160 then
    raise exception 'The setting request is too long.' using errcode='22023';
  end if;
  if p_setting_href is null
     or length(p_setting_href) > 1000
     or p_setting_href !~ '^/organizations/[^/]+/settings' then
    raise exception 'The setting link is not valid.' using errcode='22023';
  end if;
  if pg_column_size(coalesce(p_action_payload,'{}'::jsonb)) > 8192 then
    raise exception 'The setting request is too large.' using errcode='22023';
  end if;

  v_request_key := btrim(p_setting_key) || ':' ||
    md5(coalesce(p_action_payload,'{}'::jsonb)::text);

  select ar.id into v_existing
  from iam.access_requests ar
  where ar.request_kind='setting'
    and ar.resource_type='organization'
    and ar.resource_id=p_org_id
    and ar.created_by=v_uid
    and ar.request_key=v_request_key
    and ar.status='pending'
    and ar.deleted_at is null
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'request_id',v_existing,
      'status','pending',
      'already',true,
      'recipients','[]'::jsonb
    );
  end if;

  -- The request is ABOUT p_org_id and is addressed to p_org_id's owners, so it is
  -- recorded in p_org_id. It used to be recorded in an organization chosen for the caller.
  insert into iam.access_requests(
    organization_id,created_by,resource_type,resource_id,requested_level,message,
    request_kind,request_key,request_payload
  )
  values(
    p_org_id,v_uid,'organization',p_org_id,'viewer',nullif(btrim(p_message),''),
    'setting',v_request_key,jsonb_build_object(
      'setting_label',btrim(p_setting_label),
      'href',p_setting_href,
      'action_key',btrim(p_action_key),
      'action_payload',coalesce(p_action_payload,'{}'::jsonb)
    )
  )
  returning id into v_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id',m.user_id,
        'display_name',nullif(pr.display_name,''),
        'role',m.role
      )
      order by case m.role when 'owner' then 0 else 1 end,pr.display_name
    ),
    '[]'::jsonb
  )
  into v_recipients
  from iam.organization_member m
  left join users.profiles pr on pr.id=m.user_id
  where m.organization_id=p_org_id
    and m.role in ('owner','admin')
    and m.user_id<>v_uid;

  return jsonb_build_object(
    'request_id',v_id,
    'status','pending',
    'already',false,
    'recipients',v_recipients,
    'setting_label',btrim(p_setting_label)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.shx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(result.total_count), 0)
    FROM public.shx_list_scoped(
      v_scope, NULL, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
    ) result;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, organization.id, organization.name, coalesce(max(result.total_count), 0)
  FROM iam.organizations organization
  JOIN iam.organization_member membership
    ON membership.organization_id = organization.id
   AND membership.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL public.shx_list_scoped(
    'orgs', organization.id, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
  ) result ON true
  GROUP BY organization.id, organization.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, label text, family text, authoring_owner text, is_active boolean, has_component boolean, visibility text, origin text, organization_id uuid, organization_name text, created_by uuid, owner_email text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('content_ir_kind')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'shx_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'shx_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'label', 'kind', 'family', 'authoring_owner', 'status', 'component',
    'visibility', 'origin', 'organization_name', 'owner_email',
    'access_level', 'version', 'created', 'updated'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT kd.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'mine' AND kd.created_by = v_uid

    UNION ALL

    SELECT kd.*, (kd.created_by = v_uid), CASE WHEN kd.created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'orgs'
      AND (p_org_id IS NULL OR kd.organization_id = p_org_id) AND kd.organization_id IN (SELECT iam.my_orgs())

    UNION ALL

    SELECT kd.*, false, permission.permission_level::text
    FROM content_ir.kind_definition kd
    JOIN iam.permissions permission
      ON permission.resource_type = 'content_ir_kind'
     AND permission.resource_id = kd.id
     AND permission.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND kd.created_by IS DISTINCT FROM v_uid

    UNION ALL

    SELECT org_shared.*
    FROM (
      SELECT DISTINCT ON (kd.id)
        kd.*, false AS s_is_owner, permission.permission_level::text AS s_access
      FROM content_ir.kind_definition kd
      JOIN iam.permissions permission
        ON permission.resource_type = 'content_ir_kind'
       AND permission.resource_id = kd.id
       AND permission.granted_to_organization_id IN (
         SELECT om.organization_id
         FROM iam.organization_member om
         WHERE om.user_id = v_uid
       )
      WHERE v_scope = 'shared'
        AND kd.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (
          SELECT 1
          FROM iam.permissions direct_permission
          WHERE direct_permission.resource_type = 'content_ir_kind'
            AND direct_permission.resource_id = kd.id
            AND direct_permission.granted_to_user_id = v_uid
        )
      ORDER BY kd.id, permission.permission_level::text
    ) org_shared

    UNION ALL

    SELECT kd.*, false, 'public'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'public'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.visibility = 'public'
  ),
  enriched AS (
    SELECT
      scoped.*,
      organization.name AS s_org_name,
      owner_user.email::text AS s_owner_email,
      EXISTS (
        SELECT 1
        FROM content_ir.kind_component component
        WHERE component.kind_definition_id = scoped.id
          AND component.is_active
          AND component.deleted_at IS NULL
          AND component.role = 'output'
          AND component.component_key <> 'generic_structured'
      ) AS s_has_component,
      CASE
        WHEN scoped.organization_id = v_system_org THEN 'system'
        ELSE 'organization'
      END AS s_origin,
      CASE
        WHEN jsonb_typeof(scoped.metadata -> 'family') = 'string'
          THEN scoped.metadata ->> 'family'
        ELSE NULL
      END AS s_family
    FROM scoped
    LEFT JOIN iam.organizations organization ON organization.id = scoped.organization_id
    LEFT JOIN platform.visible_user_identity owner_user ON owner_user.id = scoped.created_by
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE enriched.deleted_at IS NULL
      AND enriched.is_contract_artifact IS NOT TRUE
      AND (
        v_search IS NULL
        OR enriched.label ILIKE '%' || v_search || '%'
        OR enriched.kind ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_family, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_org_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_owner_email, '') ILIKE '%' || v_search || '%'
      )
      AND (NOT v_filters ? 'label' OR enriched.label ILIKE '%' || (v_filters -> 'label' ->> 'value') || '%')
      AND (NOT v_filters ? 'kind' OR enriched.kind ILIKE '%' || (v_filters -> 'kind' ->> 'value') || '%')
      AND (NOT v_filters ? 'organization_name' OR coalesce(enriched.s_org_name, '') ILIKE '%' || (v_filters -> 'organization_name' ->> 'value') || '%')
      AND (NOT v_filters ? 'owner_email' OR coalesce(enriched.s_owner_email, '') ILIKE '%' || (v_filters -> 'owner_email' ->> 'value') || '%')
      AND (NOT v_filters ? 'family' OR coalesce(enriched.s_family, '__none__') IN (SELECT jsonb_array_elements_text(v_filters -> 'family' -> 'values')))
      AND (NOT v_filters ? 'authoring_owner' OR enriched.authoring_owner IN (SELECT jsonb_array_elements_text(v_filters -> 'authoring_owner' -> 'values')))
      AND (NOT v_filters ? 'status' OR (CASE WHEN enriched.is_active THEN 'active' ELSE 'inactive' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'status' -> 'values')))
      AND (NOT v_filters ? 'component' OR (CASE WHEN enriched.s_has_component THEN 'custom' ELSE 'generic' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'component' -> 'values')))
      AND (NOT v_filters ? 'visibility' OR enriched.visibility::text IN (SELECT jsonb_array_elements_text(v_filters -> 'visibility' -> 'values')))
      AND (NOT v_filters ? 'origin' OR enriched.s_origin IN (SELECT jsonb_array_elements_text(v_filters -> 'origin' -> 'values')))
      AND (NOT v_filters ? 'access_level' OR enriched.s_access IN (SELECT jsonb_array_elements_text(v_filters -> 'access_level' -> 'values')))
      AND (NOT v_filters ? 'version' OR enriched.version::text IN (SELECT jsonb_array_elements_text(v_filters -> 'version' -> 'values')))
      AND (NOT v_filters ? 'created' OR enriched.created_at >= public.shx_since_bucket(v_filters -> 'created' -> 'values' ->> 0))
      AND (NOT v_filters ? 'updated' OR enriched.updated_at >= public.shx_since_bucket(v_filters -> 'updated' -> 'values' ->> 0))
  ),
  scored AS (
    SELECT filtered.*, public.shx_search_score(
      v_search,
      filtered.label,
      filtered.kind,
      filtered.s_family,
      filtered.s_owner_email,
      filtered.s_org_name
    ) AS s_score
    FROM filtered
  ),
  counted AS (
    SELECT scored.*, count(*) OVER () AS s_total
    FROM scored
  )
  SELECT
    counted.id,
    counted.kind,
    counted.label,
    counted.s_family,
    counted.authoring_owner,
    counted.is_active,
    counted.s_has_component,
    counted.visibility::text,
    counted.s_origin,
    counted.organization_id,
    counted.s_org_name,
    counted.created_by,
    counted.s_owner_email,
    counted.version,
    counted.created_at,
    counted.updated_at,
    counted.s_is_owner,
    counted.s_access,
    counted.s_total
  FROM counted
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN counted.s_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'label' AND v_dir = 'asc' THEN lower(counted.label) END ASC,
    CASE WHEN v_sort = 'label' AND v_dir = 'desc' THEN lower(counted.label) END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN lower(counted.kind) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN lower(counted.kind) END DESC,
    CASE WHEN v_sort = 'family' AND v_dir = 'asc' THEN lower(coalesce(counted.s_family, '')) END ASC,
    CASE WHEN v_sort = 'family' AND v_dir = 'desc' THEN lower(coalesce(counted.s_family, '')) END DESC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'asc' THEN counted.authoring_owner END ASC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'desc' THEN counted.authoring_owner END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN counted.is_active END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN counted.is_active END DESC,
    CASE WHEN v_sort = 'component' AND v_dir = 'asc' THEN counted.s_has_component END ASC,
    CASE WHEN v_sort = 'component' AND v_dir = 'desc' THEN counted.s_has_component END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN counted.visibility::text END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN counted.visibility::text END DESC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'asc' THEN counted.s_origin END ASC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'desc' THEN counted.s_origin END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(counted.s_org_name, '')) END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(counted.s_org_name, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(counted.s_owner_email, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(counted.s_owner_email, '')) END DESC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'asc' THEN counted.s_access END ASC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'desc' THEN counted.s_access END DESC,
    CASE WHEN v_sort = 'version' AND v_dir = 'asc' THEN counted.version END ASC,
    CASE WHEN v_sort = 'version' AND v_dir = 'desc' THEN counted.version END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN counted.created_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN counted.created_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN counted.updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN counted.updated_at END DESC,
    counted.id
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_guest_data_to_user(p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
  v_target_org uuid;
  v_source_org record;
  v_col record;
  v_count bigint;
  v_total bigint := 0;
  v_transferred jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_key text;
  v_guest_row_id uuid;
begin
  if p_anon_user_id is null or p_new_user_id is null then
    return jsonb_build_object('status', 'error', 'message', 'both user ids are required');
  end if;
  if p_anon_user_id = p_new_user_id then
    return jsonb_build_object('status', 'noop', 'message', 'source and target are the same user');
  end if;

  select is_anonymous into v_anon_is_anonymous from auth.users where id = p_anon_user_id;
  if v_anon_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'anon user not found');
  end if;
  if v_anon_is_anonymous is not true then
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;
  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  select id into v_guest_row_id from users.guest_executions
  where auth_user_id = p_anon_user_id for update;

  -- THE CONVERTED ACCOUNT'S OWN PROFILE ROW ANSWERS. Rows in the guest's own organization
  -- (one the guest created and is the ONLY member of — a fact about membership, not an
  -- organization type) move to the organization the permanent account already carries; that
  -- guest organization and its membership stay with the guest. Every other organization the
  -- guest created, and every other membership, passes to the converted account. It used to
  -- RESOLVE-OR-CREATE an organization for the target here, which meant a conversion could
  -- invent one for an account whose provisioning had failed and move real rows into it.
  select organization_id into v_target_org
  from users.profiles where id = p_new_user_id;
  if v_target_org is null then
    return jsonb_build_object('status', 'error', 'message',
      'the target account has no profile row, so there is no organization to move the guest rows into');
  end if;
  for v_source_org in
    select o.id from iam.organizations o
    where o.created_by = p_anon_user_id
      and not exists (select 1 from iam.memberships m
                       where m.container_type = 'organization' and m.container_id = o.id
                         and m.user_id <> p_anon_user_id and m.deleted_at is null)
    order by o.created_at
  loop
    for v_col in
      select n.nspname as sch, cl.relname as tbl, a.attname as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
      where con.contype = 'f'
        and refn.nspname = 'iam' and ref.relname = 'organizations'
        and not (n.nspname = 'iam' and cl.relname = 'memberships')
        and n.nspname not in (
          'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
          'pgsodium', 'supabase_functions'
        )
      order by n.nspname, cl.relname, a.attname
    loop
      v_key := format('guest_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      begin
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using v_target_org, v_source_org.id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
      end;
    end loop;

    begin
      update platform.associations set source_id = v_target_org
      where source_type = 'organization' and source_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.source_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
      update platform.associations set target_id = v_target_org
      where target_type = 'organization' and target_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.target_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(
        'guest_org.platform.associations', sqlerrm
      );
    end;
  end loop;

  -- Transfer every ordinary auth-user FK, but never the guest's own organization's
  -- ownership or its owner membership.
  for v_col in
    select n.nspname as sch, cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and refn.nspname = 'auth' and ref.relname = 'users'
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
        'pgsodium', 'supabase_functions'
      )
      and not (n.nspname = 'public' and cl.relname = 'users.guest_executions')
      and not (n.nspname = 'public' and cl.relname = 'users.guest_conversion_audit')
      and not (n.nspname = 'users' and cl.relname = 'profiles' and a.attname = 'id')
      and not (n.nspname = 'iam' and cl.relname = 'organizations' and a.attname = 'created_by')
      and not (n.nspname = 'iam' and cl.relname = 'memberships' and a.attname = 'user_id')
    order by n.nspname, cl.relname, a.attname
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    begin
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        v_col.sch, v_col.tbl, v_col.col, v_col.col
      ) using p_new_user_id, p_anon_user_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Every other organization the guest created, and every other membership, belongs to the
  -- converted account.
  update iam.organizations o set created_by = p_new_user_id
  where o.created_by = p_anon_user_id
    and exists (select 1 from iam.memberships m
                 where m.container_type = 'organization' and m.container_id = o.id
                   and m.user_id <> p_anon_user_id and m.deleted_at is null);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.organizations.created_by.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  update iam.memberships as membership set user_id = p_new_user_id
  where membership.user_id = p_anon_user_id
    and not exists (
      select 1 from iam.organizations as organization
      where organization.id = membership.organization_id
        and organization.created_by = p_anon_user_id
        and not exists (select 1 from iam.memberships other
                         where other.container_type = 'organization'
                           and other.container_id = organization.id
                           and other.user_id <> p_anon_user_id and other.deleted_at is null)
    );
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.memberships.user_id.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  if v_guest_row_id is not null then
    update users.guest_executions
    set converted_to_user_id = p_new_user_id, converted_at = now(), auth_user_id = null
    where id = v_guest_row_id;
  end if;
  insert into users.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.trx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.trx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.trx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

CREATE OR REPLACE FUNCTION users.passkey_credential_linkage_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'users', 'iam'
AS $function$
DECLARE
  v_passkey_id uuid;
  v_bad boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_passkey_id := OLD.id;
  ELSE
    v_passkey_id := NEW.id;
  END IF;

  -- At deferred execution OLD still identifies the removed component even
  -- though querying the metadata table no longer can. Only aggregate purge
  -- may remove it; neither a live nor a tombstoned private source may remain.
  IF TG_TABLE_NAME = 'passkey_credentials' AND TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM users.credential_items WHERE id = OLD.credential_item_id)
       OR EXISTS (SELECT 1 FROM users.user_secrets WHERE id = OLD.source_field_id) THEN
      RAISE EXCEPTION 'passkey metadata purge requires parent and source purge'
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  -- Symmetric invariant: a protected source inserted without metadata must
  -- not commit, even if no child trigger was ever queued for that source.
  IF TG_TABLE_NAME = 'user_secrets' AND EXISTS (
    SELECT 1 FROM users.user_secrets s
     WHERE s.id = v_passkey_id AND s.execution_purpose = 'passkey_private'
       AND NOT EXISTS (SELECT 1 FROM users.passkey_credentials p WHERE p.source_field_id = s.id)
  ) THEN
    RAISE EXCEPTION 'protected passkey source requires metadata'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'credential_items' THEN
    SELECT EXISTS(
      SELECT 1 FROM users.passkey_credentials p WHERE p.credential_item_id = v_passkey_id
    ) INTO v_bad;
    IF NOT v_bad THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'user_secrets' THEN
    SELECT EXISTS(
      SELECT 1 FROM users.passkey_credentials p WHERE p.source_field_id = v_passkey_id
    ) INTO v_bad;
    IF NOT v_bad THEN RETURN NULL; END IF;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM users.passkey_credentials p
      JOIN users.credential_items i ON i.id = p.credential_item_id
      JOIN users.user_secrets s ON s.id = p.source_field_id
     WHERE (
          (TG_TABLE_NAME = 'passkey_credentials' AND p.id = v_passkey_id)
          OR (TG_TABLE_NAME = 'credential_items' AND p.credential_item_id = v_passkey_id)
          OR (TG_TABLE_NAME = 'user_secrets' AND p.source_field_id = v_passkey_id)
        )
        AND (
          s.credential_item_id = i.id
          AND s.execution_purpose = 'passkey_private'
          AND s.field_key = 'passkey_private'
          AND s.handling = 'sealed'
          AND s.editable = false
          AND s.inject_into_sandbox = false
          AND s.key IS NULL
          AND s.value_hint IS NULL
          AND p.deleted_at IS NOT DISTINCT FROM i.deleted_at
          AND p.deleted_at IS NOT DISTINCT FROM s.deleted_at
          AND ((p.deleted_at IS NULL AND p.lifecycle = 'saved_waiting_for_site')
               OR (p.deleted_at IS NOT NULL AND p.lifecycle = 'retired'))
          AND (
            (i.organization_id IS NOT NULL
             AND s.organization_id = i.organization_id
             AND i.organization_id = p.organization_id
             AND i.user_id IS NULL AND s.user_id IS NULL)
            OR
            (i.organization_id IS NULL AND s.organization_id IS NULL
             AND i.user_id IS NOT NULL AND s.user_id = i.user_id
             AND EXISTS (
               -- the passkey row lives in an organization this same person belongs to
               SELECT 1
                 FROM iam.memberships om
                WHERE om.container_type = 'organization'
                  AND om.container_id = p.organization_id
                  AND om.user_id = i.user_id
             )
             AND (
               -- Equal component tombstones above make this historical-owner
               -- arm available only after the complete aggregate was deleted.
               p.deleted_at IS NOT NULL
               OR EXISTS (
                 SELECT 1
                   FROM iam.memberships m
                  WHERE m.organization_id = p.organization_id
                    AND m.container_type = 'organization'
                    AND m.container_id = p.organization_id
                    AND m.user_id = i.user_id
                    AND m.role = 'owner'
                    AND m.status = 'active'
                    AND m.deleted_at IS NULL
               )
             ))
          )
        ) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'passkey credential linkage, selected scope, or lifecycle is invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.vault_recovery_preview(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'users', 'iam', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_item users.credential_items%rowtype; v_recovery jsonb;
  v_fields integer; v_attachments integer; v_native integer := 0; v_supported boolean := false;
  v_reason text; v_v1 boolean := false; v_v2 boolean := false; v_timestamp timestamptz;
  v_gate jsonb; v_gate_ok boolean := false; v_census jsonb; v_canonical text; v_digest text;
  v_source_id uuid; v_passkey_id uuid; v_missing boolean := false; v_conflict boolean := false;
  v_has_linked_component boolean := false;
  v_entry jsonb; v_seen text[]; v_parts text[];
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'vault recovery preview requires a signed-in user' USING ERRCODE='28000'; END IF;
  SELECT i.* INTO v_item FROM users.credential_items i WHERE i.id=p_id AND i.deleted_at IS NOT NULL
    AND (i.user_id=v_uid OR (i.organization_id IS NOT NULL AND i.organization_id IN (SELECT iam.my_orgs()) AND public.is_org_admin_for(v_uid,i.organization_id)));
  IF NOT FOUND THEN perform platform.refuse_not_found('credential item not found (p_id)'); END IF;

  v_recovery := v_item.lifecycle->'vault_recovery';
  -- Shape gates run before set-returning functions or casts. JSON null and
  -- absent keys fail closed, rather than SQL NULL making a predicate disappear.
  <<manifest_shape>>
  BEGIN
    IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
    IF NOT (v_recovery ?& ARRAY['schema_version','deletion_id','deleted_at','prior_status','fields','attachments','state'])
       OR jsonb_typeof(v_recovery->'schema_version') IS DISTINCT FROM 'number'
       OR (v_recovery->>'schema_version') NOT IN ('1','2')
       OR v_recovery->>'state' IS DISTINCT FROM 'deleted'
       OR jsonb_typeof(v_recovery->'prior_status') IS DISTINCT FROM 'string'
       OR (v_recovery->>'prior_status') NOT IN ('active','disabled','expired','pending_verification')
       OR jsonb_typeof(v_recovery->'fields') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_recovery->'attachments') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_recovery->'deletion_id') IS DISTINCT FROM 'string'
       OR coalesce(v_recovery->>'deletion_id','') !~* v_uuid_pattern
       OR jsonb_typeof(v_recovery->'deleted_at') IS DISTINCT FROM 'string'
    THEN EXIT manifest_shape; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_recovery) k
              WHERE k NOT IN ('schema_version','deletion_id','deleted_at','prior_status','fields','attachments','state','native_passkeys'))
    THEN EXIT manifest_shape; END IF;
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_recovery->'fields') LOOP
      IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
      IF NOT (v_entry ?& ARRAY['id','was_active'])
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','was_active'))
         OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
         OR coalesce(v_entry->>'id','') !~* v_uuid_pattern
         OR jsonb_typeof(v_entry->'was_active') IS DISTINCT FROM 'boolean'
      THEN EXIT manifest_shape; END IF;
    END LOOP;
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_recovery->'attachments') LOOP
      IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
      IF NOT (v_entry ? 'id')
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k <> 'id')
         OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
         OR coalesce(v_entry->>'id','') !~* v_uuid_pattern
      THEN EXIT manifest_shape; END IF;
    END LOOP;
    IF coalesce(v_recovery->>'deleted_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    THEN EXIT manifest_shape; END IF;
    BEGIN
      v_timestamp := (v_recovery->>'deleted_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN EXIT manifest_shape;
    END;
    IF NOT isfinite(v_timestamp) THEN EXIT manifest_shape; END IF;
    IF v_recovery->>'schema_version'='1' THEN
      v_v1 := NOT (v_recovery ? 'native_passkeys');
      EXIT manifest_shape;
    END IF;
    -- Version two has a closed, unique canonical-ID manifest; v1 stays unchanged.
    IF jsonb_typeof(v_recovery->'native_passkeys') IS DISTINCT FROM 'array'
    THEN EXIT manifest_shape; END IF;
    IF jsonb_array_length(v_recovery->'native_passkeys') <> 1
       OR v_recovery->>'deletion_id' !~ v_uuid_pattern
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE e->>'id' !~ v_uuid_pattern)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e WHERE e->>'id' !~ v_uuid_pattern)
       OR (SELECT count(*) <> count(DISTINCT e->>'id') FROM jsonb_array_elements(v_recovery->'fields') e)
       OR (SELECT count(*) <> count(DISTINCT e->>'id') FROM jsonb_array_elements(v_recovery->'attachments') e)
    THEN EXIT manifest_shape; END IF;
    v_entry := v_recovery->'native_passkeys'->0;
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
    IF NOT (v_entry ?& ARRAY['id','source_field_id'])
       OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','source_field_id'))
       OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'source_field_id') IS DISTINCT FROM 'string'
       OR coalesce(v_entry->>'id','') !~ v_uuid_pattern
       OR coalesce(v_entry->>'source_field_id','') !~ v_uuid_pattern
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE e->>'id'=v_entry->>'source_field_id')
    THEN EXIT manifest_shape; END IF;
    v_passkey_id := (v_entry->>'id')::uuid;
    v_source_id := (v_entry->>'source_field_id')::uuid;
    v_v2 := true;
  END manifest_shape;

  IF NOT v_v1 AND NOT v_v2 THEN
    v_reason := CASE WHEN v_recovery IS NULL THEN 'recovery_tracking_unavailable'
                     WHEN v_recovery ? 'native_passkeys' OR v_recovery->>'schema_version'='2' THEN 'native_manifest_invalid'
                     ELSE 'recovery_manifest_unsupported' END;
  ELSIF v_v2 THEN
    -- Match the Python activation validator, including exact JSON scalar types.
    SELECT value INTO v_gate FROM platform.feature_knob
     WHERE feature='vault.native' AND key='passkey_storage_activation'
       AND value_type='json' AND overridable_by='{}'::text[];
    <<activation_shape>>
    BEGIN
      IF jsonb_typeof(v_gate) IS DISTINCT FROM 'object' THEN EXIT activation_shape; END IF;
      IF NOT (v_gate ?& ARRAY['version','enabled','protocol_version','revision','reader_census','evidence_sha256'])
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_gate) k WHERE k NOT IN ('version','enabled','protocol_version','revision','reader_census','evidence_sha256'))
         OR jsonb_typeof(v_gate->'version') IS DISTINCT FROM 'number'
         OR v_gate->>'version' IS DISTINCT FROM '1'
         OR jsonb_typeof(v_gate->'protocol_version') IS DISTINCT FROM 'number'
         OR v_gate->>'protocol_version' IS DISTINCT FROM '1'
         OR v_gate->'enabled' IS DISTINCT FROM 'true'::jsonb
         OR jsonb_typeof(v_gate->'revision') IS DISTINCT FROM 'number'
         OR coalesce(v_gate->>'revision','') !~ '^[1-9][0-9]*$'
         OR jsonb_typeof(v_gate->'reader_census') IS DISTINCT FROM 'array'
         OR jsonb_typeof(v_gate->'evidence_sha256') IS DISTINCT FROM 'string'
         OR coalesce(v_gate->>'evidence_sha256','') !~ '^[0-9a-f]{64}$'
      THEN EXIT activation_shape; END IF;
      IF jsonb_array_length(v_gate->'reader_census') <> 8 THEN EXIT activation_shape; END IF;
      v_seen := ARRAY[]::text[];
      FOR v_entry IN SELECT value FROM jsonb_array_elements(v_gate->'reader_census') LOOP
        IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT activation_shape; END IF;
        IF NOT (v_entry ?& ARRAY['consumer','build','orm_version','refusal_verified'])
           OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('consumer','build','orm_version','refusal_verified'))
           OR jsonb_typeof(v_entry->'consumer') IS DISTINCT FROM 'string'
           OR v_entry->>'consumer' NOT IN ('aidream-api','workflow-worker','livekit-worker','browser-worker','sandbox-runtime','desktop-sidecar','standalone-scraper','standalone-seo')
           OR v_entry->>'consumer' = ANY(v_seen)
           OR jsonb_typeof(v_entry->'build') IS DISTINCT FROM 'string'
           OR coalesce(v_entry->>'build','') !~ '^[0-9a-f]{40}$'
           OR jsonb_typeof(v_entry->'orm_version') IS DISTINCT FROM 'string'
           OR coalesce(v_entry->>'orm_version','') !~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
           OR v_entry->'refusal_verified' IS DISTINCT FROM 'true'::jsonb
        THEN EXIT activation_shape; END IF;
        v_parts := string_to_array(v_entry->>'orm_version','.');
        -- Length then lexical comparison supports arbitrarily large semver integers.
        IF NOT (length(v_parts[1])>1 OR v_parts[1]>'3'
            OR (v_parts[1]='3' AND (length(v_parts[2])>1 OR v_parts[2]>'1'
            OR (v_parts[2]='1' AND (length(v_parts[3])>3
            OR (length(v_parts[3])=3 AND v_parts[3]>='144'))))))
        THEN EXIT activation_shape; END IF;
        v_seen := array_append(v_seen,v_entry->>'consumer');
      END LOOP;
      -- All interpolated strings have closed ASCII alphabets above. This is the
      -- exact sorted compact JSON hashed by validate_activation_record.
      SELECT '[' || string_agg(format('{"build":"%s","consumer":"%s","orm_version":"%s","refusal_verified":true}',e->>'build',e->>'consumer',e->>'orm_version'),',' ORDER BY e->>'consumer') || ']'
        INTO v_canonical FROM jsonb_array_elements(v_gate->'reader_census') e;
      v_digest := encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex');
      v_gate_ok := v_digest = v_gate->>'evidence_sha256';
    END activation_shape;
    IF NOT v_gate_ok THEN v_reason:='native_recovery_unavailable';
    ELSE
      SELECT (e->>'id')::uuid,(e->>'source_field_id')::uuid INTO v_passkey_id,v_source_id FROM jsonb_array_elements(v_recovery->'native_passkeys') e;
      v_missing := NOT EXISTS(SELECT 1 FROM users.passkey_credentials p WHERE p.id=v_passkey_id) OR NOT EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.id=v_source_id)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE NOT EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.id=(e->>'id')::uuid))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e WHERE NOT EXISTS(SELECT 1 FROM users.credential_attachments a WHERE a.id=(e->>'id')::uuid));
      IF v_missing THEN v_reason:='native_components_missing';
      ELSE
        v_conflict := v_item.definition_key IS DISTINCT FROM 'native_passkey' OR v_item.deleted_at IS DISTINCT FROM v_timestamp
          OR EXISTS(SELECT 1 FROM users.passkey_credentials p WHERE p.credential_item_id=p_id AND p.id!=v_passkey_id)
          OR EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.credential_item_id=p_id AND (s.deleted_at IS NULL OR s.deleted_at=v_timestamp OR s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private') AND s.id NOT IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_recovery->'fields') e))
          OR EXISTS(SELECT 1 FROM users.credential_attachments a WHERE a.credential_item_id=p_id AND (a.deleted_at IS NULL OR a.deleted_at=v_timestamp) AND a.id NOT IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_recovery->'attachments') e))
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e
              JOIN users.user_secrets s ON s.id=(e->>'id')::uuid
             WHERE s.credential_item_id IS DISTINCT FROM p_id
                OR s.user_id IS DISTINCT FROM v_item.user_id
                OR s.organization_id IS DISTINCT FROM v_item.organization_id
                OR s.deleted_at IS DISTINCT FROM v_timestamp OR s.is_active IS DISTINCT FROM false
                OR (s.id <> v_source_id AND (s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private')))
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e
              JOIN users.credential_attachments a ON a.id=(e->>'id')::uuid
             WHERE a.credential_item_id IS DISTINCT FROM p_id OR a.deleted_at IS DISTINCT FROM v_timestamp)
          OR NOT EXISTS(SELECT 1 FROM users.passkey_credentials p JOIN users.user_secrets s ON s.id=p.source_field_id WHERE p.id=v_passkey_id AND p.credential_item_id=p_id AND p.source_field_id=v_source_id AND s.credential_item_id=p_id AND s.execution_purpose='passkey_private' AND s.field_key='passkey_private' AND s.handling='sealed' AND s.editable=false AND s.inject_into_sandbox=false AND s.key IS NULL AND s.value_hint IS NULL AND s.is_active=false AND p.lifecycle='retired' AND p.deleted_at IS NOT DISTINCT FROM v_timestamp AND s.deleted_at IS NOT DISTINCT FROM v_timestamp AND ((v_item.organization_id IS NOT NULL AND v_item.user_id IS NULL AND s.organization_id=v_item.organization_id AND s.user_id IS NULL AND p.organization_id=v_item.organization_id) OR (v_item.organization_id IS NULL AND v_item.user_id IS NOT NULL AND s.organization_id IS NULL AND s.user_id=v_item.user_id AND EXISTS(SELECT 1 FROM iam.memberships om WHERE om.container_type='organization' AND om.container_id=p.organization_id AND om.user_id=v_item.user_id))));
        IF v_conflict THEN v_reason:='native_components_conflict'; ELSE v_supported:=true; v_fields:=jsonb_array_length(v_recovery->'fields'); v_attachments:=jsonb_array_length(v_recovery->'attachments'); v_native:=1; END IF;
      END IF;
    END IF;
  ELSIF EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.credential_item_id=p_id AND (s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private')) THEN v_reason:='protected_component_requires_native_recovery';
  ELSE
    IF to_regclass('provider.account') IS NOT NULL THEN EXECUTE 'select exists(select 1 from provider.account where deleted_at is null and primary_credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('provider.account_credential') IS NOT NULL THEN EXECUTE 'select exists(select 1 from provider.account_credential where deleted_at is null and credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('users.integration_connections') IS NOT NULL THEN EXECUTE 'select exists(select 1 from users.integration_connections where deleted_at is null and credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('tool.mcp_user_conn') IS NOT NULL THEN EXECUTE 'select exists(select 1 from tool.mcp_user_conn where credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF v_has_linked_component THEN v_reason:='linked_component_requires_native_recovery'; ELSE v_supported:=true; v_fields:=jsonb_array_length(v_recovery->'fields'); v_attachments:=jsonb_array_length(v_recovery->'attachments'); END IF;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('deletion_id',CASE WHEN v_v1 OR v_v2 THEN v_recovery->>'deletion_id' END,'fields_count',v_fields,'attachments_count',v_attachments,'native_passkeys_count',v_native,'prior_was_disabled',CASE WHEN v_v1 OR v_v2 THEN v_recovery->>'prior_status'='disabled' END,'supported',v_supported,'reason',v_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION web.conform(p_table text, p_token text, p_label text, p_variant text DEFAULT 'component'::text, p_parent_fk text DEFAULT 'site_id'::text, p_versioned boolean DEFAULT false, p_soft_del boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_tbl text := format('web.%I', p_table);
BEGIN
    -- 🚨 NO-BACKSTOP. This function used to open by attaching
    -- `public._stamp_org_default` to every table it conformed, which made it a live source
    -- of the exact class `scripts/validate_org_backstop_coverage.py --strict` forbids: a
    -- trigger that ASSIGNS `organization_id` from whoever happened to insert the row. The
    -- writer names the organization. `organization_id` is NOT NULL on every `web.*` table,
    -- so an omission raises 23502 and names the table instead of filing the row in a
    -- stranger's organization. A conform-time trigger may VALIDATE; it may not assign,
    -- and the not-null constraint already validates harder than a trigger could.
    EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON %s
        FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', v_tbl);
    EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON %s
        FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', v_tbl);
    IF p_versioned THEN
        EXECUTE format('CREATE TRIGGER _version_capture AFTER INSERT OR UPDATE OR DELETE ON %s
            FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)', v_tbl, p_token);
    END IF;

    INSERT INTO platform.entity_types
        (token, schema_name, table_name, label, is_component,
         is_versioned, has_soft_delete, default_scopeable, rls_variant, is_active)
    VALUES
        (p_token, 'web', p_table, p_label, (p_variant = 'component'),
         p_versioned, p_soft_del, true, p_variant, true);

    IF p_variant = 'component' THEN
        INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
        VALUES (p_token, 'web_site', p_parent_fk, 'composition', 'access derives from site');
    END IF;

    PERFORM iam.apply_rls('web', p_table, p_token, p_variant);
    IF p_variant <> 'component' THEN
        PERFORM platform.sync_association_gc_triggers(p_token);
    END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.wfx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.wfx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per organization the caller belongs to, WITH its name.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.wfx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

create or replace view platform.visible_user_identity as
 SELECT u.id,
    (u.email)::text AS email
   FROM auth.users u
  WHERE u.id = auth.uid()
     OR public.is_platform_admin()
     OR u.id IN (SELECT them.user_id
                   FROM iam.organization_member me
                   JOIN iam.organization_member them ON them.organization_id = me.organization_id
                  WHERE me.user_id = auth.uid());

create or replace view agent.menu_surface as
 SELECT a.id,
    a.source_id AS agent_id,
    us.name AS surface_name,
    (NULLIF((a.metadata ->> 'user_id'::text), ''::text))::uuid AS user_id,
    a.organization_id,
    (NULLIF((a.metadata ->> 'project_id'::text), ''::text))::uuid AS project_id,
    (NULLIF((a.metadata ->> 'task_id'::text), ''::text))::uuid AS task_id,
    COALESCE((a.payload -> 'value_mappings'::text), (a.metadata -> 'value_mappings'::text), '{}'::jsonb) AS value_mappings,
    COALESCE(((a.metadata ->> 'version'::text))::integer, 1) AS version,
    COALESCE(((a.metadata ->> 'visibility'::text))::platform.visibility, 'internal'::platform.visibility) AS visibility,
    a.created_at,
    a.created_at AS updated_at,
    a.created_by,
    a.created_by AS updated_by,
    c.name AS agent_name,
    c.description AS agent_description,
    c.agent_type,
    c.category AS agent_category,
    c.tags AS agent_tags,
    c.variable_definitions AS agent_variable_definitions,
    c.output_schema AS agent_output_schema,
    c.is_active AS agent_is_active,
    c.card_visibility AS agent_card_visibility,
    to_jsonb(c.*) AS agent,
        CASE
            WHEN (o.id IS NOT NULL) THEN jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description, 'logo_url', o.logo_url, 'is_system', o.is_system)
            ELSE NULL::jsonb
        END AS organizations,
    a.role,
    COALESCE((a.payload -> 'write_policies'::text), '{}'::jsonb) AS write_policies,
    COALESCE(((a.payload ->> 'auto_run'::text))::boolean, false) AS auto_run
   FROM (((platform.associations a
     JOIN agent.card c ON ((c.id = a.source_id)))
     LEFT JOIN iam.organizations o ON ((o.id = a.organization_id)))
     JOIN ui.ui_surface us ON ((us.id = a.target_id)))
  WHERE ((a.source_type = 'agent'::text) AND (a.target_type = 'surface'::text) AND ((a.payload_kind IS NULL) OR (a.payload_kind = 'surface_binding'::text)) AND (((a.role = 'binding:global'::text) AND ((a.metadata ->> 'tier'::text) = 'global'::text) AND (NULLIF((a.metadata ->> 'user_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'project_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'task_id'::text), ''::text) IS NULL)) OR ((a.role = ('binding:u:'::text || (( SELECT auth.uid() AS uid))::text)) AND ((a.metadata ->> 'tier'::text) = 'user'::text) AND (a.role = ('binding:u:'::text || NULLIF((a.metadata ->> 'user_id'::text), ''::text))) AND (NULLIF((a.metadata ->> 'project_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'task_id'::text), ''::text) IS NULL)) OR ((a.role = ('binding:o:'::text || (a.organization_id)::text)) AND ((a.metadata ->> 'tier'::text) = 'org'::text) AND (NULLIF((a.metadata ->> 'user_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'project_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'task_id'::text), ''::text) IS NULL) AND iam.has_org_access(a.organization_id)) OR ((a.role = ('binding:p:'::text || NULLIF((a.metadata ->> 'project_id'::text), ''::text))) AND ((a.metadata ->> 'tier'::text) = 'project'::text) AND (NULLIF((a.metadata ->> 'user_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'task_id'::text), ''::text) IS NULL) AND iam.has_org_access(a.organization_id)) OR ((a.role = ('binding:t:'::text || NULLIF((a.metadata ->> 'task_id'::text), ''::text))) AND ((a.metadata ->> 'tier'::text) = 'task'::text) AND (NULLIF((a.metadata ->> 'user_id'::text), ''::text) IS NULL) AND (NULLIF((a.metadata ->> 'project_id'::text), ''::text) IS NULL) AND iam.has_org_access(a.organization_id))));

drop function iam.is_personal_dependents();
drop function iam.backfill_org_from_owner(boolean);

-- Access decisions declared for the SECURITY DEFINER bodies this file replaced that had none (provision_shape_guard). None is a client door; grants are unchanged.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'access_request_recipients', 'p_type text, p_id uuid', array['text'::regtype, 'uuid'::regtype]::oid[],
  'Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). p_type/p_id name the resource an access request is about; the body reads its organization and that organizations owners/admins. NULL ids resolve to no recipients.',
  'migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)',
  'server_only: called only from inside the access-request filing and deciding RPCs, which authenticate the caller first; only postgres and service_role hold EXECUTE.', false, false)
on conflict do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('public', 'get_user_scopes', 'p_user_id uuid', array['uuid'::regtype]::oid[],
  'Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). p_user_id is the person whose organizations and scope types are listed; compared to iam.organization_member.user_id. NULL lists nothing.',
  'migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)',
  'server_only: only postgres and service_role hold EXECUTE; the server builds a persons scope tree with it for that persons own request.', false, false)
on conflict do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', '_record_access_audit', 'p_organization_id uuid, p_action text, p_target_token text, p_data_class text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[], p_row_count integer, p_subject_user_id uuid, p_justification text, p_denial_reason text, p_request_id uuid, p_permission_id uuid, p_grant_expires_at timestamp with time zone, p_is_emergency_door boolean, p_actor_user_id uuid, p_granted_to_user_id uuid', array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'boolean'::regtype, 'uuid[]'::regtype, 'integer'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'timestamp with time zone'::regtype, 'boolean'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
  'Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). Writes one audit row describing a decision another function already made; every id is recorded as given, none is used to grant anything.',
  'migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)',
  'server_only: owner-only (postgres); invoked from inside the access-deciding definers that already decided, never by a client or the server directly.', false, false)
on conflict do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('communication', 'notification_user_channels', 'p_user uuid, p_event_key text, p_organization_id uuid, p_base jsonb, p_mandatory boolean', array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'boolean'::regtype]::oid[],
  'Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). p_user is compared to notification_preference.user_id and p_organization_id to its organization_id; it returns only that persons own channel choices. NULL p_user returns the base unchanged.',
  'migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)',
  'server_only: only postgres and service_role hold EXECUTE; the notification spine calls it server-side while fanning an event out to its recipients.', false, false)
on conflict do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'assert_may_transfer', 'p_token text, p_row_owner uuid, p_target_owner uuid, p_row_org uuid, p_container_type text, p_container_id uuid', array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
  'Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). A refusal-only check: each id is compared against memberships/ownership of the named row and container, and the function raises or returns nothing.',
  'migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)',
  'server_only: owner-only (postgres); invoked from inside the transfer and move triggers/definers, never by a client or the server directly.', false, false)
on conflict do nothing;
