-- staff_door_generated_confidential_family_dd137b_2026_09_22
--
-- THE FINDING. `pnpm check:staff-door --strict` (lane GATES-3, 2026-09-22) names 99 active
-- tokens that resolve `private` or `confidential` and still let our own staff read with no door,
-- 50 of them COMPONENT or LEDGER tokens under a private or confidential parent. DD-137b's promise
-- — "private means no standing read for anyone, our own staff included" — is broken on all of them.
--
-- THE CLASS, AND WHY THIS FILE CLOSES ONLY PART OF IT. The 99 split by MECHANISM, not by feature:
--
--   (a) 26 tokens whose ENTIRE live policy set is generated — exactly a subset of
--       `iam.generated_policy_names()`: svc_all, std_select, std_insert, std_update, std_delete,
--       platform_admin_all. For these the lane is closed BY THE GENERATOR'S OWN DOOR and by
--       nothing else: `suppress_platform_admin_lane = true` makes `iam.platform_admin_read_prefix`
--       stop emitting the `(select is_platform_admin()) OR` arm, and `iam.apply_rls` then drops and
--       re-emits every generated policy without it — including `platform_admin_all` itself, which
--       is in the generated catalogue and is emitted "unless the token suppresses the lane". No
--       hand-written DROP, no bespoke policy touched, no arm invented. THAT IS THIS FILE.
--
--   (b) 73 tokens carrying at least one BESPOKE policy beside the generated set. Running
--       `iam.apply_rls` on those would ADD generated policies a table never had, which WIDENS
--       access — the opposite of the law. Each needs its own `iam.supersede_bespoke_policies`
--       re-creation, and ~15 of them are the only read lane an admin SCREEN has, so closing them
--       means giving that screen a real door first. Those are named, one by one with their live
--       policy set and their remedy, in the GATES-3 report. They are NOT in this file and they are
--       NOT excused anywhere: `check:staff-door` keeps reporting every one of them by name.
--
-- WHY THIS FAMILY FIRST. All 26 resolve `confidential` and all 26 are customer CRM, e-signature
-- and print-order data — party, contact_medium, interaction, deal, envelope, signer. This is the
-- exact shape of the defect that created the guard (chat.message: 131,763 of 131,763 rows readable
-- by a platform admin). Their org, permission, membership and reachability arms are untouched, so
-- every customer reads exactly what they read before; `svc_all` is untouched, so every server-side
-- service-role path (lib/sms/receive.ts, the aidream workers) is unaffected by construction — RLS
-- does not apply to that role. What changes is that a platform admin browsing with their own
-- session no longer has a standing read of every organization's customer records. Census 2026-09-22:
-- no admin surface in matrx-frontend reads crm.*, esign.* or commerce.print_order through a
-- signed-in admin session; the only non-customer readers are service-role paths.
--
-- `iam.apply_rls` takes a short ACCESS EXCLUSIVE lock per policy change. crm.party and
-- crm.interaction are hot, so the wait is bounded at 30s instead of the 2s default — a bound on
-- WAITING, never on holding.

-- chair-step: closes the platform-admin read lane on 26 confidential CRM/esign/commerce tokens through iam.apply_rls; DD-137b staff door, no bespoke policy touched and no arm added

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in (
         'commerce_print_order',
         'contact_medium',
         'crm_address', 'crm_affiliation', 'crm_blocklist_entry', 'crm_contact_candidate',
         'crm_deal', 'crm_deal_stage_event', 'crm_enrichment_call', 'crm_interaction',
         'crm_merge_candidate', 'crm_outreach_list', 'crm_outreach_list_member',
         'crm_party_merge', 'crm_sending_event', 'crm_sending_identity',
         'crm_sending_identity_check',
         'esign_campaign', 'esign_campaign_member', 'esign_envelope',
         'esign_envelope_certificate', 'esign_envelope_document',
         'esign_envelope_external_ref', 'esign_envelope_signer',
         'party', 'party_contact_point')
   and not suppress_platform_admin_lane;

select iam.apply_rls('commerce', 'print_order', 'commerce_print_order', 'entity');
select iam.apply_rls('crm', 'contact_medium', 'contact_medium', 'entity');
select iam.apply_rls('crm', 'address', 'crm_address', 'component');
select iam.apply_rls('crm', 'affiliation', 'crm_affiliation', 'component');
select iam.apply_rls('crm', 'blocklist_entry', 'crm_blocklist_entry', 'entity');
select iam.apply_rls('crm', 'contact_candidate', 'crm_contact_candidate', 'component');
select iam.apply_rls('crm', 'deal', 'crm_deal', 'entity');
select iam.apply_rls('crm', 'deal_stage_event', 'crm_deal_stage_event', 'component');
select iam.apply_rls('crm', 'enrichment_call', 'crm_enrichment_call', 'entity');
select iam.apply_rls('crm', 'interaction', 'crm_interaction', 'component');
select iam.apply_rls('crm', 'merge_candidate', 'crm_merge_candidate', 'component');
select iam.apply_rls('crm', 'outreach_list', 'crm_outreach_list', 'entity');
select iam.apply_rls('crm', 'outreach_list_member', 'crm_outreach_list_member', 'component');
select iam.apply_rls('crm', 'party_merge', 'crm_party_merge', 'component');
select iam.apply_rls('crm', 'sending_event', 'crm_sending_event', 'component');
select iam.apply_rls('crm', 'sending_identity', 'crm_sending_identity', 'entity');
select iam.apply_rls('crm', 'sending_identity_check', 'crm_sending_identity_check', 'component');
select iam.apply_rls('esign', 'campaign', 'esign_campaign', 'entity');
select iam.apply_rls('esign', 'campaign_member', 'esign_campaign_member', 'component');
select iam.apply_rls('esign', 'envelope', 'esign_envelope', 'entity');
select iam.apply_rls('esign', 'envelope_certificate', 'esign_envelope_certificate', 'component');
select iam.apply_rls('esign', 'envelope_document', 'esign_envelope_document', 'component');
select iam.apply_rls('esign', 'envelope_external_ref', 'esign_envelope_external_ref', 'component');
select iam.apply_rls('esign', 'envelope_signer', 'esign_envelope_signer', 'component');
select iam.apply_rls('crm', 'party', 'party', 'entity');
select iam.apply_rls('crm', 'party_contact_point', 'party_contact_point', 'component');
