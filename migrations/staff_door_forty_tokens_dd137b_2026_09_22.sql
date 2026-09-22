-- staff_door_forty_tokens_dd137b_2026_09_22
-- chair-step: closes the platform-admin read lane on forty tokens whose staff lane is an OR arm inside a bespoke policy or a standalone platform_admin_all; every real arm re-created verbatim, same command, same roles, same with-check
--
--
-- THE FINDING. Fourth and largest file of the DD-137b staff-door sweep (GATES-3, 2026-09-22).
-- `pnpm check:staff-door --strict` opened the lane at 99 tokens / 50 components; the three earlier
-- files closed the 26 purely-generated confidential tokens, the six knowledge-graph tokens and the
-- four embedding tables. This file closes FORTY more, in one mechanism.
--
-- HOW THE 63 THAT REMAINED WERE SPLIT — by SHAPE, measured from pg_policy, not by feature:
--
--   A · 40 tokens (this file). Every permissive read policy carrying a staff predicate is either
--       `platform_admin_all`, whose whole qual is `(select is_platform_admin())`, or has the exact
--       shape `((select is_platform_admin()) OR <the real arm>)`. After the staff arm is removed
--       AT LEAST ONE real read lane survives, so nobody who could read loses their read.
--   B · 16 tokens where removing the staff lane would leave NO permissive read policy at all: the
--       staff lane IS the table's only client read (billing.account_addon, the four legal corpora,
--       assignment.attempt/item, seo.keyword_classification_queue, …). Closing those means giving
--       their admin screen a real door first — an admin client read, exactly as
--       features/admin/shared-knowledge/server.ts already does and says in its own header. Named in
--       the GATES-3 report; excused nowhere; the guard keeps reporting them.
--   C ·  7 tokens on a different shape (`platform_admin_all_select`, `platform_admin_select` — the
--       doors-only FOR SELECT twin). Also reported, also not excused.
--
-- THE MECHANISM, per token in group A. `suppress_platform_admin_lane = true` so no future
-- `iam.apply_rls` can re-emit the lane; every staff-armed bespoke policy superseded through
-- `iam.supersede_bespoke_policies` — the generator's own door for a hand-written policy — and
-- re-created with `<the real arm>` VERBATIM, byte for byte as `pg_get_expr` returned it, with the
-- SAME command, the SAME roles and the SAME `WITH CHECK` (four of them are FOR ALL policies whose
-- with-check carried the staff arm too: data_store_members_parent_all,
-- page_extraction_results_owner_write, page_extraction_runs_owner_write, cld_webhooks_owner_all —
-- the arm is stripped there as well, or the write lane would stay open); then
-- `drop policy platform_admin_all`, a permissive FOR ALL policy that grants the lane on its own
-- whatever the read arms say. Nothing is narrowed, nothing is invented, no arm is rewritten.
--
-- 🚨 THE FIVE NAMED-RESIDUE TOKENS ARE DELIBERATELY NOT HERE. user_analysis_preference,
-- user_form_profile, user_preference, wbx_guidance and admin_markdown_sample are RESIDUE_TOKENS in
-- scripts/check-staff-door.ts, open for a reason the registry stores. That list fails in BOTH
-- directions, so closing one of them here would RED the guard. They close in the commit that
-- removes them from the list, not in a sweep.
--
-- WHO LOSES WHAT. A platform admin browsing with their own session loses a standing read of these
-- tables. Owners, organization members, grantees, share holders and public readers keep every arm
-- they had. Restrictive `platform_admin_*_only` write policies are untouched. Service-role paths
-- are unaffected by construction — RLS does not apply to that role — which is the door every admin
-- console in this repo already uses.


set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in (
         'data_rights_event', 'data_store_members', 'deck_suggestion', 'dict_provider_publication',
         'feedback_comments', 'feedback_user_messages', 'integration_connection',
         'integration_connection_resource', 'knob_override', 'knob_rung_lock',
         'math_course_structure', 'ops_issue_class', 'org_plan', 'outreach_acceptance',
         'page_extraction_results', 'page_extraction_runs', 'pdf_redaction_key_escrow',
         'scrape_domain', 'scrape_domain_settings', 'scrape_failure_log', 'scrape_path_override',
         'scrape_path_pattern', 'scrape_retry_queue', 'sms_webhook_logs', 'structure',
         'studio_cleaned_segments', 'studio_concept_items', 'studio_module_segments',
         'studio_raw_segments', 'study_source_chunk', 'study_structured_section', 'templates',
         'udt_dataset_row_versions', 'udt_dataset_template_fields', 'unsubscribe_token',
         'uploads_inflight', 'user_follows', 'user_secret_audit', 'webhook_deliveries', 'webhooks')
   and not suppress_platform_admin_lane;

drop policy platform_admin_all on education.data_rights_event;

select iam.supersede_bespoke_policies('rag', 'data_store_members', array['data_store_members_grant_reader_select', 'data_store_members_parent_all'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy data_store_members_grant_reader_select on rag.data_store_members
  for select to authenticated
  using (iam.has_access('data_store'::text, data_store_id, 'viewer'::permission_level));
create policy data_store_members_parent_all on rag.data_store_members
  for all to authenticated
  using (iam.has_access('data_store'::text, data_store_id, 'editor'::permission_level) OR (EXISTS ( SELECT 1
   FROM rag.data_stores s
  WHERE ((s.id = data_store_members.data_store_id) AND (s.organization_id IS NOT NULL) AND is_member_of_organization(s.organization_id)))))
  with check (iam.has_access('data_store'::text, data_store_id, 'editor'::permission_level) OR (EXISTS ( SELECT 1
   FROM rag.data_stores s
  WHERE ((s.id = data_store_members.data_store_id) AND (s.organization_id IS NOT NULL) AND is_member_of_organization(s.organization_id)))));
drop policy platform_admin_all on rag.data_store_members;

select iam.supersede_bespoke_policies('education', 'deck_suggestion', array['ds_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy ds_read on education.deck_suggestion
  for select to authenticated
  using (((suggested_by = ( SELECT auth.uid() AS uid)) OR (owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
drop policy platform_admin_all on education.deck_suggestion;

select iam.supersede_bespoke_policies('dictionary', 'dict_provider_publication', array['read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy read on dictionary.dict_provider_publication
  for select to authenticated
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on dictionary.dict_provider_publication;

select iam.supersede_bespoke_policies('users', 'feedback_comments', array['Users can view comments on own feedback'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy "Users can view comments on own feedback" on users.feedback_comments
  for select
  using ((feedback_id IN ( SELECT user_feedback.id
   FROM users.user_feedback
  WHERE (user_feedback.user_id = ( SELECT auth.uid() AS uid)))));
drop policy platform_admin_all on users.feedback_comments;

select iam.supersede_bespoke_policies('users', 'feedback_user_messages', array['Users read own feedback messages'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy "Users read own feedback messages" on users.feedback_user_messages
  for select to authenticated
  using ((feedback_id IN ( SELECT user_feedback.id
   FROM users.user_feedback
  WHERE (user_feedback.user_id = ( SELECT auth.uid() AS uid)))));
drop policy platform_admin_all on users.feedback_user_messages;

drop policy platform_admin_all on users.integration_connections;

drop policy platform_admin_all on users.integration_connection_resources;



drop policy platform_admin_all on education.math_course_structure;

drop policy platform_admin_all on ops.ops_issue_class;

drop policy platform_admin_all on billing.org_plan;

select iam.supersede_bespoke_policies('crm', 'outreach_acceptance', array['outreach_acceptance_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy outreach_acceptance_select on crm.outreach_acceptance
  for select to authenticated
  using (is_org_member(organization_id));
drop policy platform_admin_all on crm.outreach_acceptance;

select iam.supersede_bespoke_policies('docproc', 'page_extraction_results', array['page_extraction_results_grant_read', 'page_extraction_results_owner_write', 'page_extraction_results_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy page_extraction_results_grant_read on docproc.page_extraction_results
  for select to authenticated
  using (((job_id IS NOT NULL) AND (job_id IN ( SELECT readable_extraction_job_ids() AS readable_extraction_job_ids))));
create policy page_extraction_results_owner_write on docproc.page_extraction_results
  for all
  using ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_results.job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_results.job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));
create policy page_extraction_results_read on docproc.page_extraction_results
  for select
  using ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_results.job_id) AND ((j.owner_id = ( SELECT auth.uid() AS uid)) OR (j.organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))))));
drop policy platform_admin_all on docproc.page_extraction_results;

select iam.supersede_bespoke_policies('docproc', 'page_extraction_runs', array['page_extraction_runs_grant_read', 'page_extraction_runs_owner_write', 'page_extraction_runs_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy page_extraction_runs_grant_read on docproc.page_extraction_runs
  for select to authenticated
  using (((job_id IS NOT NULL) AND (job_id IN ( SELECT readable_extraction_job_ids() AS readable_extraction_job_ids))));
create policy page_extraction_runs_owner_write on docproc.page_extraction_runs
  for all
  using ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_runs.job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_runs.job_id) AND (j.owner_id = ( SELECT auth.uid() AS uid))))));
create policy page_extraction_runs_read on docproc.page_extraction_runs
  for select
  using ((EXISTS ( SELECT 1
   FROM docproc.page_extraction_jobs j
  WHERE ((j.id = page_extraction_runs.job_id) AND ((j.owner_id = ( SELECT auth.uid() AS uid)) OR (j.organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))))));
drop policy platform_admin_all on docproc.page_extraction_runs;

select iam.supersede_bespoke_policies('pdf', 'pdf_redaction_key_escrow', array['pdf_redaction_key_escrow_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy pdf_redaction_key_escrow_select on pdf.pdf_redaction_key_escrow
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on pdf.pdf_redaction_key_escrow;

drop policy platform_admin_all on scraper.scrape_domain;

drop policy platform_admin_all on scraper.scrape_domain_settings;

drop policy platform_admin_all on scraper.scrape_failure_log;

drop policy platform_admin_all on scraper.scrape_path_override;

drop policy platform_admin_all on scraper.scrape_path_pattern;

drop policy platform_admin_all on scraper.scrape_retry_queue;

select iam.supersede_bespoke_policies('communication', 'sms_webhook_logs', array['Service role only for webhook logs'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy "Service role only for webhook logs" on communication.sms_webhook_logs
  for all
  using ((( SELECT auth.role() AS role) = 'service_role'::text));
drop policy platform_admin_all on communication.sms_webhook_logs;

select iam.supersede_bespoke_policies('files', 'structure', array['file_structure_grant_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy file_structure_grant_read on files.structure
  for select to authenticated
  using (iam.has_access('file'::text, file_id, 'viewer'::permission_level));
drop policy platform_admin_all on files.structure;

select iam.supersede_bespoke_policies('transcripts', 'studio_cleaned_segments', array['studio_cleaned_segments_public_read', 'studio_cleaned_segments_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy studio_cleaned_segments_public_read on transcripts.studio_cleaned_segments
  for select to authenticated, anon
  using ((EXISTS ( SELECT 1
   FROM transcripts.studio_sessions s
  WHERE ((s.id = studio_cleaned_segments.session_id) AND (s.visibility = 'public'::platform.visibility) AND (s.deleted_at IS NULL)))));
create policy studio_cleaned_segments_select on transcripts.studio_cleaned_segments
  for select to authenticated
  using (iam.has_access('studio_session'::text, session_id, 'viewer'::permission_level));
drop policy platform_admin_all on transcripts.studio_cleaned_segments;

select iam.supersede_bespoke_policies('transcripts', 'studio_concept_items', array['studio_concept_items_public_read', 'studio_concept_items_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy studio_concept_items_public_read on transcripts.studio_concept_items
  for select to authenticated, anon
  using ((EXISTS ( SELECT 1
   FROM transcripts.studio_sessions s
  WHERE ((s.id = studio_concept_items.session_id) AND (s.visibility = 'public'::platform.visibility) AND (s.deleted_at IS NULL)))));
create policy studio_concept_items_select on transcripts.studio_concept_items
  for select to authenticated
  using (iam.has_access('studio_session'::text, session_id, 'viewer'::permission_level));
drop policy platform_admin_all on transcripts.studio_concept_items;

select iam.supersede_bespoke_policies('transcripts', 'studio_module_segments', array['studio_module_segments_public_read', 'studio_module_segments_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy studio_module_segments_public_read on transcripts.studio_module_segments
  for select to authenticated, anon
  using ((EXISTS ( SELECT 1
   FROM transcripts.studio_sessions s
  WHERE ((s.id = studio_module_segments.session_id) AND (s.visibility = 'public'::platform.visibility) AND (s.deleted_at IS NULL)))));
create policy studio_module_segments_select on transcripts.studio_module_segments
  for select to authenticated
  using (iam.has_access('studio_session'::text, session_id, 'viewer'::permission_level));
drop policy platform_admin_all on transcripts.studio_module_segments;

select iam.supersede_bespoke_policies('transcripts', 'studio_raw_segments', array['studio_raw_segments_public_read', 'studio_raw_segments_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy studio_raw_segments_public_read on transcripts.studio_raw_segments
  for select to authenticated, anon
  using ((EXISTS ( SELECT 1
   FROM transcripts.studio_sessions s
  WHERE ((s.id = studio_raw_segments.session_id) AND (s.visibility = 'public'::platform.visibility) AND (s.deleted_at IS NULL)))));
create policy studio_raw_segments_select on transcripts.studio_raw_segments
  for select to authenticated
  using (iam.has_access('studio_session'::text, session_id, 'viewer'::permission_level));
drop policy platform_admin_all on transcripts.studio_raw_segments;

select iam.supersede_bespoke_policies('education', 'study_source_chunk', array['read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy read on education.study_source_chunk
  for select to authenticated
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on education.study_source_chunk;

select iam.supersede_bespoke_policies('education', 'study_structured_section', array['read'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy read on education.study_structured_section
  for select to authenticated
  using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))));
drop policy platform_admin_all on education.study_structured_section;

select iam.supersede_bespoke_policies('context', 'templates', array['templates_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private system; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy templates_select on context.templates
  for select to authenticated
  using ((is_active = true));
drop policy platform_admin_all on context.templates;

select iam.supersede_bespoke_policies('workbench', 'udt_dataset_row_versions', array['udt_row_versions_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy udt_row_versions_select on workbench.udt_dataset_row_versions
  for select
  using ((EXISTS ( SELECT 1
   FROM workbench.udt_datasets d
  WHERE ((d.id = udt_dataset_row_versions.table_id) AND ((d.user_id = ( SELECT auth.uid() AS uid)) OR (d.is_public = true) OR has_permission('dataset'::text, d.id, 'viewer'::permission_level))))));
drop policy platform_admin_all on workbench.udt_dataset_row_versions;

select iam.supersede_bespoke_policies('workbench', 'udt_dataset_template_fields', array['udt_dataset_template_fields_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy udt_dataset_template_fields_select on workbench.udt_dataset_template_fields
  for select to authenticated
  using (((COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false) IS FALSE) AND (EXISTS ( SELECT 1
   FROM workbench.udt_dataset_templates t
  WHERE ((t.id = udt_dataset_template_fields.template_id) AND (t.organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))))));
drop policy platform_admin_all on workbench.udt_dataset_template_fields;

select iam.supersede_bespoke_policies('crm', 'unsubscribe_token', array['unsubscribe_token_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy unsubscribe_token_select on crm.unsubscribe_token
  for select to authenticated
  using (is_org_member(organization_id));
drop policy platform_admin_all on crm.unsubscribe_token;

select iam.supersede_bespoke_policies('files', 'uploads_inflight', array['cld_uploads_inflight_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy cld_uploads_inflight_owner_select on files.uploads_inflight
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on files.uploads_inflight;

drop policy platform_admin_all on users.user_follows;

drop policy platform_admin_all on users.user_secret_audit;

select iam.supersede_bespoke_policies('files', 'webhook_deliveries', array['cld_webhook_deliveries_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy cld_webhook_deliveries_owner_select on files.webhook_deliveries
  for select
  using ((EXISTS ( SELECT 1
   FROM files.webhooks w
  WHERE ((w.id = webhook_deliveries.webhook_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
drop policy platform_admin_all on files.webhook_deliveries;

select iam.supersede_bespoke_policies('files', 'webhooks', array['cld_webhooks_owner_all'],
  'DD-137b staff door (2026-09-22, GATES-3): the bespoke lane opened with an is_platform_admin() OR arm on a private entity; re-created with the real arm verbatim -- same command, same roles, same WITH CHECK -- and no staff arm.');
create policy cld_webhooks_owner_all on files.webhooks
  for all
  using ((owner_id = ( SELECT auth.uid() AS uid)))
  with check ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on files.webhooks;
