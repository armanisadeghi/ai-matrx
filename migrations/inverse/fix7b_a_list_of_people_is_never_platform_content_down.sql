-- INVERSE of migrations/campaign/fix7b_a_list_of_people_is_never_platform_content.sql
--
-- Puts the eleven tokens back on class `organization` with the reason they carried before
-- (the mechanical back-fill sentence written by platform.derive_data_class), and regenerates
-- the same twenty-two relations, so every policy returns to the exact text it had.
--
-- WHAT IT DOES NOT RESTORE, and why that is right: the three census functions stay. They assert
-- nothing by themselves — they only COUNT — and a census that disappears with the fix is how a
-- class reopens without anybody noticing. Running this file makes
-- `iam.people_lists_a_non_member_can_read()` non-empty again, which is the honest report that the
-- leak is back.

update platform.entity_types
   set data_class = 'organization',
       data_class_reason = 'Derived from what the registry already holds (rls_variant=entity, '
                           || 'default_visibility=internal) by platform.derive_data_class — the '
                           || 'inverse of §3.1''s birth table. §3.9 step 2: fill the registry from '
                           || 'reality, not the other way round.'
 where is_active
   and token in ('party','contact_medium','crm_blocklist_entry','crm_deal','crm_enrichment_call',
                 'commerce_print_order','platform_outcome_event','crm_outreach_list',
                 'crm_sending_identity','esign_campaign','esign_envelope');

do $$
declare r record;
begin
  for r in
    select et.schema_name as s, et.table_name as t, et.token as k, et.rls_variant as v
      from platform.entity_types et
     where et.is_active
       and et.token in ('party','contact_medium','crm_blocklist_entry','crm_deal',
                        'crm_enrichment_call','commerce_print_order','platform_outcome_event',
                        'crm_outreach_list','crm_sending_identity','esign_campaign','esign_envelope',
                        'crm_address','crm_affiliation','crm_contact_candidate','crm_interaction',
                        'crm_merge_candidate','crm_party_merge','party_contact_point',
                        'crm_outreach_list_member','crm_sending_event','esign_campaign_member',
                        'esign_envelope_signer')
     order by et.schema_name, et.table_name
  loop
    perform iam.apply_rls(r.s, r.t, r.k, r.v);
  end loop;
end $$;
