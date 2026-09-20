-- chair-step: every statement below is one BUILD-BOOK 6b.2's additive allow-list refuses by
-- name in a file that names production - UPDATE, DO, and INSERT into `platform.entity_types`.
-- The refusal was written for a branch-only night; the owner's 2026-09-18 ruling ("there is no
-- production, it's all just dev") makes this the file that actually finishes CUT-14, so it runs
-- as a chair step and a person reads the whole file.
--
-- REC-32 / REC-34 / REC-52 / CUT-14 - THE CLASSIFICATION LANDS ON THE MAIN DATABASE.
--
-- WHY THIS FILE EXISTS BESIDE `w1_reg_the_classification_lands.sql`
-- ------------------------------------------------------------------
-- That file is GENERATED FROM THE REHEARSAL COPY'S OWN ROWS - its registration set is the
-- copy's unregistered set (190 tables, `corpus`, `campaign_watch`, `h2m` and the rest of the
-- copy's private furniture among them) and its per-row types were computed against the copy's
-- registry. Applied here it would register tables this database does not have and miss the ones
-- it does. So the classification is REGENERATED for this database, from the same two sources:
--
--   1. W1-CLASS's artefact `migrations/campaign/W1-CLASS-classification.json`, taken
--      2026-09-17 09:17:42Z against THIS database, read-only - and the fourteen ambiguities
--      resolved by W1-REG, each carrying the answer its own deciding query returned. Those
--      resolutions and every ENFORCEMENT override (a `component` row whose append-only trigger
--      makes it a Ledger, an escrow table whose policy makes it an Entity) are carried across
--      verbatim: they were measured on THIS database in the first place.
--   2. This database's live registry and live base-table universe, read 2026-09-18. Every row
--      the census does not override takes DD-062 1.2's derivation from the enforcement axis
--      THIS database records, not the copy's.
--
-- THE TEN TABLES THAT POSTDATE THE 09:17 CENSUS, CLASSIFIED BY THE SAME RULE
-- --------------------------------------------------------------------------
-- `custom.carrying_rule`, `custom.organization_visibility_version`, `custom.record_alias`,
-- `custom.visibility_cache`, `custom.visibility_epoch` (this campaign's own store furniture),
-- `history.capture_window`, `history.migration_log` (W3-HIST's), `platform.org_context_ledger`,
-- `seo.page_intent_queue` and `seo.page_mapping_queue`. Each was read live for grants, RLS,
-- policy quals, triggers and foreign keys, and each answers System on what is ENFORCED: no
-- grant to anon, authenticated or service_role, so no client role reaches it at all.
-- `platform.org_context_ledger` is the one that shows the rule doing work - the word "ledger"
-- is in its NAME and nothing makes it append-only, so it is not a Ledger.
--
-- WHAT THIS FILE DOES NOT DO
-- --------------------------
-- It writes `type`, `type_reason` and `custom_fields_enabled`, and it registers tables that
-- were registered nowhere. It does not touch `rls_variant`, `audit_class`, `is_active`,
-- `data_class` or any other live column of an existing row; it creates no policy, calls
-- `iam.apply_rls` nowhere, and turns on no `custom/*` switch. Every function that switches on
-- the enforcement axis reads exactly what it read before.
--
-- A newly registered row takes the `rls_variant` its type already implies, exactly as the
-- rehearsed file does: Detail is `component` with `is_component` true (never the literal word
-- `detail`, which `platform._entity_types_classify_default` refuses by name), Reference is
-- `system`, System is `entity` + `audit_class='machinery'` with its reason, Deprecated is
-- `is_active=false`.
--
-- REVERSIBLE: `migrations/inverse/w1_reg_the_classification_lands_on_main_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ------------------------------------------------------------------- 1. the three CHECKs
do $w1reg$
begin
  if not exists (select 1 from pg_constraint where conrelid='platform.entity_types'::regclass
                   and conname='entity_types_type_is_one_of_seven') then
    alter table platform.entity_types
      add constraint entity_types_type_is_one_of_seven
      check (type is null or type = any (array['entity'::text,'detail'::text,'reference'::text,
                                               'ledger'::text,'restricted'::text,'system'::text,
                                               'deprecated'::text])) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='platform.entity_types'::regclass
                   and conname='entity_types_custom_fields_follow_type') then
    alter table platform.entity_types
      add constraint entity_types_custom_fields_follow_type
      check (type is null or custom_fields_enabled = (type = any (array['entity'::text,'detail'::text]))) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='platform.entity_types'::regclass
                   and conname='entity_types_type_is_derived_or_explained') then
    alter table platform.entity_types
      add constraint entity_types_type_is_derived_or_explained
      check (type is null or type_reason is not null or type = case
                when is_active is false                            then 'deprecated'
                when audit_class = 'machinery'                     then 'system'
                when rls_variant in ('component','detail')          then 'detail'
                when rls_variant = 'system'                        then 'reference'
                when rls_variant = 'restricted'                    then 'restricted'
                when rls_variant = 'ledger'                        then 'ledger'
                else 'entity' end) not valid;
  end if;
end
$w1reg$;

-- ---------------------------------- 2. the rows the census answers AGAINST the derivation
-- Only these. A row whose census evidence is DD-062 1.2's own derivation is not carried over
-- from the copy at all - it is re-derived below from THIS database's enforcement axis.
create temporary table w1_reg_class (
  schema_name text not null,
  table_name  text not null,
  type        text not null,
  evidence    text not null,
  primary key (schema_name, table_name)
) on commit drop;

insert into w1_reg_class (schema_name, table_name, type, evidence) values
  ('agent', 'review_queue', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record — the platform''s own review register'),
  ('assignment', 'attempt', 'detail', 'its only FK is to its parent attempt-holder and it carries no organization_id, owner_id or visibility of its own'),
  ('assignment', 'item', 'detail', 'FK to the registered token assignment_session; no own organization_id, owner_id or visibility'),
  ('billing', 'account_addon', 'entity', 'own organization_id stamped by _stamp_org_default; admin-only policy today because the table never passed through the generator'),
  ('billing', 'class_purchase', 'entity', 'own organization_id; admin-only policy today because the table never passed through the generator'),
  ('billing', 'org_plan', 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id'),
  ('browser', 'action_event', 'ledger', 'registry rls_variant=component would derive Detail; ENFORCEMENT overrides it - trigger action_event_append_only fires BEFORE DELETE OR UPDATE and raises 42501 unconditionally for every principal but service_role'),
  ('campaign_watch', 'build_lock', 'system', 'no SELECT/INSERT/UPDATE/DELETE grant to anon, authenticated or service_role — reachable only by the owner and SECURITY DEFINER code'),
  ('campaign_watch', 'cron_pause', 'system', 'branch-only: the campaign''s own machinery - the build lock, the cron-pause record, the go-signal capture, the refresh receipt.'),
  ('campaign_watch', 'go_signal_capture', 'system', 'branch-only: the campaign''s own machinery - the build lock, the cron-pause record, the go-signal capture, the refresh receipt.'),
  ('campaign_watch', 'refresh_run', 'system', 'branch-only: the campaign''s own machinery - the build lock, the cron-pause record, the go-signal capture, the refresh receipt.'),
  ('campaign_watch', 'w0_sync_door_hold', 'system', 'branch-only: the campaign''s own machinery - the build lock, the cron-pause record, the go-signal capture, the refresh receipt.'),
  ('communication', 'emails', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('communication', 'sms_rate_limits', 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record'),
  ('communication', 'sms_webhook_logs', 'detail', 'FK to the registered token sms_message; no own organization_id, owner_id or visibility'),
  ('content_ir', 'admission_config', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('content_ir', 'io_contract', 'entity', 'own organization_id FK to iam.organizations, stamped by _stamp_org_default, versioned by _touch_row'),
  ('context', 'context_item_values', 'detail', 'AMBIGUITY RESOLVED by its deciding query: 0 write-guard triggers on the table today, so REC-55''s guard has NOT landed and the type is Detail. CUT-18 and W7-DEPR-DATA make it Deprecated when that guard lands; this lane does not pre-empt them.'),
  ('context', 'context_value_refs', 'detail', 'FKs to the registered tokens context_item, context_item_value and scope; no own organization_id or visibility (CUT-19''s deprecation source)'),
  ('context', 'scope_door_registry', 'system', 'no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code'),
  ('context', 'template_context_items', 'reference', 'SELECT policy qual is `true` for authenticated with writes admin-only; 846 platform-shipped template rows, no organization_id'),
  ('context', 'template_scope_types', 'reference', 'SELECT policy qual is `true` for authenticated with writes admin-only; 116 platform-shipped template rows, no organization_id'),
  ('context', 'templates', 'reference', 'read arm is is_active = true for every authenticated principal, writes admin-only; platform-shipped, no organization_id'),
  ('corpus', 'corpus_manifest', 'system', 'branch-only: schema corpus is the GATE CORPUS fixture (BUILD-BOOK 1a.3), machinery of the rehearsal itself.'),
  ('corpus', 'corpus_principal', 'system', 'branch-only: schema corpus is the GATE CORPUS fixture (BUILD-BOOK 1a.3), machinery of the rehearsal itself.'),
  ('corpus', 'corpus_result', 'system', 'branch-only: schema corpus is the GATE CORPUS fixture (BUILD-BOOK 1a.3), machinery of the rehearsal itself.'),
  ('corpus', 'corpus_scope', 'system', 'branch-only: schema corpus is the GATE CORPUS fixture (BUILD-BOOK 1a.3), machinery of the rehearsal itself.'),
  ('crm', 'outreach_acceptance', 'entity', 'read arm is is_org_member(organization_id) on its own organization_id'),
  ('crm', 'unsubscribe_token', 'entity', 'read arm is is_org_member(organization_id) on its own organization_id; org-stamped by _inherit_org'),
  ('dictionary', 'dict_provider_publication', 'entity', 'read arm is owner_id = auth.uid() on its own owner column'),
  ('docproc', 'page_extraction_results', 'detail', 'every read arm resolves through the parent job (job_id IN readable_extraction_job_ids()); no own organization_id'),
  ('docproc', 'page_extraction_runs', 'detail', 'read arm is the parent job''s (job_id IN readable_extraction_job_ids()); its organization_id FK is ON DELETE SET NULL NOT VALID and carries no read arm'),
  ('education', 'deck_suggestion', 'entity', 'read arm is suggested_by = auth.uid() OR owner_id = auth.uid() on its own owner columns'),
  ('education', 'math_course_structure', 'reference', 'SELECT policy qual is `true` for authenticated, writes admin-only; platform-shipped course structure with no organization_id or owner_id'),
  ('education', 'study_source_chunk', 'entity', 'read arm is owner_id = auth.uid(); its structured_section FK is ON DELETE SET NULL, so it is not composition'),
  ('education', 'study_structured_section', 'entity', 'read arm is owner_id = auth.uid() OR organization_id IN (SELECT iam.my_orgs()) on its own columns'),
  ('esign', 'consent_disclosure', 'reference', 'AMBIGUITY RESOLVED by its deciding query: 1 row across 1 organization, max 1 row per organization - a single platform-owned set, which is Reference. Re-test named: if rows-per-organization ever exceeds one it is a Detail of the envelope, not a catalog.'),
  ('esign', 'envelope_certificate', 'ledger', 'registry rls_variant=component would derive Detail; ENFORCEMENT overrides it - trigger _zz_guard_certificate_immutable fires BEFORE DELETE OR UPDATE and raises 42501 unconditionally - ''the event ledger is append-only'''),
  ('files', 'analysis_result', 'detail', 'read arm is EXISTS over files.files with cf.created_by = auth.uid() — exactly the parent file''s access'),
  ('files', 'idempotency', 'system', 'AMBIGUITY RESOLVED by its deciding query: zero references to files.idempotency in either repository''s application code - no user surface names a row - so request-dedupe keys are machinery.'),
  ('files', 'rate_limit_buckets', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('files', 'structure', 'detail', 'read arm is iam.has_access(''file'', file_id, ''viewer'') — exactly the parent file''s access'),
  ('files', 'uploads_inflight', 'entity', 'read arm is owner_id = auth.uid() and the table carries its own visibility column'),
  ('files', 'webhook_deliveries', 'detail', 'read arm is EXISTS over files.webhooks with w.owner_id = auth.uid() — exactly the parent webhook''s access'),
  ('files', 'webhook_dispatch_state', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('files', 'webhooks', 'entity', 'read arm is owner_id = auth.uid() on its own owner column, plus its own organization_id'),
  ('h2m', 'access_event', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'access_history', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'assoc', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'assoc_hist', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'assoc_v', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'edge', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'field_def', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'record', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'reldoc', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'results', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'structural_cache', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'table_def', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'und', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('h2m', 'undo_log', 'deprecated', 'branch-only measurement leftover: an h2m.* model-benchmark harness table, written by nothing now.'),
  ('hr', '_recompute_queue', 'system', 'no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code'),
  ('hr', '_write_guard_key', 'system', 'no grant to any API role; RLS on with zero policies — closed to every principal but the owner'),
  ('hr', 'definer_grant_baseline', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('hr', 'function_contract', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('hr', 'leave_ledger', 'ledger', 'registry rls_variant=component would derive Detail; ENFORCEMENT overrides it - trigger _zz_leave_ledger_no_update fires BEFORE UPDATE and raises P0001 unconditionally - ''it is append-only and admits no UPDATE'''),
  ('hr', 'notify_outsider_door_baseline', 'system', 'no grant to any API role; RLS off'),
  ('hr', 'payroll_export_line', 'ledger', 'registry rls_variant=component would derive Detail; ENFORCEMENT overrides it - trigger _zz_payroll_export_line_no_update fires BEFORE UPDATE and raises P0001 unconditionally'),
  ('hr', 'punch', 'ledger', 'AMBIGUITY RESOLVED by its deciding query: hr._punch_immutable() raises on every column change outside the void columns and its own message reads ''correct it with a void plus a new punch'' - a compensating INSERT, which is a Ledger, not an in-place edit.'),
  ('hr', 'schedule_change', 'ledger', 'AMBIGUITY RESOLVED by its deciding query: 0 of the rows have delivered_at or read_at set, so the two receipt columns the immutability trigger permits are never written after insert - the table is append-only in fact.'),
  ('iam', 'access_delta_probe', 'system', 'no grant to any API role — its one service_role policy is unreachable without a table grant'),
  ('iam', 'access_delta_run', 'system', 'no grant to any API role — its one service_role policy is unreachable without a table grant'),
  ('iam', 'dd171_containment_baseline', 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the data-doctrine REGISTER records DD-171 as Met - the audit this baseline backs is CLOSED - and the table carries no grants and no RLS.'),
  ('iam', 'dd175_cast', 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the REGISTER records DD-175 as Met - the audit is CLOSED - and the table carries no grants and no RLS.'),
  ('iam', 'dd175_component_lane_baseline', 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the REGISTER records DD-175 as Met - the audit is CLOSED - and the table carries no grants and no RLS.'),
  ('iam', 'definer_class_exemption', 'system', 'service_role SELECT is the only grant and the table sits in iam, which Doctrine 1.1 names under System'),
  ('iam', 'membership_grant', 'system', 'only policy arm is is_platform_admin(); iam is named under System by Doctrine 1.1'),
  ('iam', 'org_industries', 'detail', 'primary key is (organization_id, industry_id) — a junction row with no identity or visibility of its own'),
  ('iam', 'organization_preferences', 'detail', 'primary key IS organization_id — one row per organization, access exactly the organization''s'),
  ('iam', 'superseded_policy', 'system', 'no grant to any API role; RLS off — a superseded-policy register only the owner and SECURITY DEFINER code reach'),
  ('iam', 'system_orgs', 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; the platform-owned list of system organizations'),
  ('legal', '_stage_dockets_966c18eca7', 'deprecated', 'name matches the _stage_ staging-table rule CUT-14 states verbatim'),
  ('legal', 'citations', 'reference', 'platform-ingested case-law catalog: no organization_id, no owner_id, no parent record, and legal.ingest_runs is its only writer'),
  ('legal', 'courts', 'reference', 'platform-ingested court catalog (3,360 rows): no organization_id, no owner_id, no parent record'),
  ('legal', 'dockets', 'reference', 'platform-ingested docket catalog: no organization_id, no owner_id; its one FK points at another catalog table'),
  ('legal', 'ingest_runs', 'entity', 'own organization_id stamped by stamp_run_org, with emit_run_lifecycle; admin-only policy today because it never passed through the generator'),
  ('legal', 'opinion_clusters', 'reference', 'platform-ingested opinion catalog (7,900 rows): no organization_id, no owner_id, no parent record'),
  ('legal', 'opinions', 'reference', 'platform-ingested opinion catalog: no organization_id, no owner_id, no parent record'),
  ('ops', '_bak_organization_name_dd043', 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('ops', 'ops_issue_class', 'reference', 'SELECT policy qual is `true` for authenticated, writes admin-only; 227 platform-defined issue classes with no organization_id'),
  ('ops', 'path_drift_repair_2026_09', 'deprecated', 'a dated one-off repair artefact (_2026_09), no grants and no RLS — the same class CUT-14''s backup rule names'),
  ('partman', 'part_config', 'system', 'no grant to any API role; pg_partman''s own control table'),
  ('partman', 'part_config_sub', 'system', 'no grant to any API role; pg_partman''s own control table'),
  ('pdf', 'pdf_consolidation_log', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('pdf', 'pdf_redaction_key_escrow', 'entity', 'AMBIGUITY RESOLVED by its deciding query, AGAINST the Doctrine''s word and deliberately: authenticated holds SELECT and pdf_redaction_key_escrow_select returns the row on owner_id = auth.uid(), so it is not service-role-only. The type follows what is ENFORCED; the gap to Doctrine 1.1''s ''escrow is Restricted'' is a POLICY defect (W1-REG, FOUND OUTSIDE BRIEF), not a type.'),
  ('platform', '_bak_assoc_file_processed_document_20260812', 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('platform', '_bak_assoc_type_file_processed_document_20260812', 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('platform', '_oauth_handoff_claim', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', '_policy_overlap_backup', 'deprecated', 'name matches the _backup backup-table rule CUT-14 states verbatim'),
  ('platform', '_policy_overlap_probe', 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the only writer anywhere in either repository is the one-off harness migration policy_overlap_campaign_harness.sql, already applied - nothing writes it now, and its sibling platform._policy_overlap_backup is Deprecated by CUT-14''s own name rule.'),
  ('platform', '_work_claim', 'system', 'platform machinery the 09:17 census predates: production gained platform._work_claim and W1-PROV-CLOSED levelled it onto the branch the same day. It is the provisioner''s own work claim - machinery.'),
  ('platform', 'anon_function_birth_grandfather', 'system', 'no grant to any API role; a platform guard register with its own closure trigger'),
  ('platform', 'assist_producer_policy_history', 'system', 'only arms are is_platform_admin() and is_admin(); a platform policy history, which Doctrine 1.1 names under System'),
  ('platform', 'client_callable_door', 'system', 'no grant to any API role; the door registry the grant event trigger reads — machinery by definition'),
  ('platform', 'client_callable_door_retirement', 'system', 'no grant to any API role; part of the same door registry'),
  ('platform', 'client_excluded_column_unregistered', 'system', 'no grant to any API role'),
  ('platform', 'definer_client_grant_grandfather', 'system', 'no grant to any API role'),
  ('platform', 'feature_knob', 'reference', 'carries a public_read policy with qual `true`; 752 platform-shipped knob definitions, writes admin-only, no organization_id'),
  ('platform', 'knob_override', 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only, so the write door is elsewhere'),
  ('platform', 'knob_rung_lock', 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only'),
  ('platform', 'masterwork_run_kind', 'reference', 'one SELECT policy with qual `true`, authenticated holds SELECT only; 27 platform-defined run kinds'),
  ('platform', 'metadata_reserved_keys', 'system', 'service_role is the only grantee and the table sits in platform — Doctrine 1.1 names the registry and meta plumbing under System'),
  ('platform', 'mtx_media_heal_queue', 'reference', 'enforced as public platform data: a SELECT policy with qual `true` beside an admin-only write arm, no organization_id — FINDING: a repair queue should not be world-readable'),
  ('platform', 'org_change_policy', 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, stamped by _stamp_org_default'),
  ('platform', 'provision_generate_target', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'provision_grant', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'provision_marker', 'system', 'no grant to any API role'),
  ('platform', 'provision_rule_message', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'provision_schema', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'provision_shape_debt', 'system', 'no grant to any API role'),
  ('platform', 'provision_spec', 'system', 'no grant to any API role; its _provision_spec_append_only trigger is noted but no principal can reach the table at all'),
  ('platform', 'provision_spec_grandfather', 'system', 'no grant to any API role'),
  ('platform', 'provision_vocabulary', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'schema_client_exposure', 'system', 'branch-only, and this campaign''s own: the declared schema-exposure table W1-PROV landed, in which `custom` is declared closed. Machinery of the registry itself.'),
  ('platform', 'soft_delete_edge', 'system', 'no grant to any API role; RLS on with zero policies'),
  ('platform', 'stamped_write_table', 'system', 'no grant to any API role'),
  ('public', '_schema_migration_slot_grandfather', 'system', 'service_role is the only grantee and the table is migration plumbing — Doctrine 1.1 names meta plumbing under System'),
  ('public', 'app_config_history', 'system', 'only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System'),
  ('public', 'catalog_entries_history', 'system', 'only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System'),
  ('public', 'h2_reldoc', 'deprecated', 'branch-only measurement leftover beside the h2m.* harness, written by nothing now.'),
  ('public', 'm2_record', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm3_node', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm3_reach', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_outbox', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_r10', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_r20', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_r20_toast', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_r4', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4_r40', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4c_r10', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4c_r20', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4c_r4', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm4c_r40', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm5_cell', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm5_option', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm5_record', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_association_types', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_associations', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_grant', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_lat', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_reachability', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_record', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_results', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('public', 'm_visibility_version', 'deprecated', 'branch-only measurement leftover: a public.m* model-benchmark table from an earlier design exploration, written by nothing now.'),
  ('rag', 'data_store_members', 'detail', 'read arm is EXISTS over rag.data_stores — exactly the parent store''s access'),
  ('rag', 'embedding_cache', 'system', 'no client read arm at all (admin-only), no org-stamping trigger, primary key is a cache_key — writes arrive only through SECURITY DEFINER code'),
  ('rag', 'embeddings_google_gemini_2_1536', 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('rag', 'embeddings_oai_3_small_1536', 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('rag', 'embeddings_voyage_4_large_1024', 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('rag', 'embeddings_voyage_code_3_1024', 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('rag', 'kg_chunk_entities', 'detail', 'a chunk-to-entity link row with no identity or visibility of its own; four FKs and no standalone read arm'),
  ('rag', 'kg_chunks', 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, with its own owner_id and deleted_at'),
  ('rag', 'kg_clusters', 'entity', 'read arm is is_member_of_organization(organization_id) on its own organization_id'),
  ('rag', 'kg_edges', 'detail', 'a graph edge row — a relation between two kg_entities with no identity or visibility of its own'),
  ('rag', 'kg_entities', 'entity', 'read arm is is_member_of_organization(organization_id) on its own organization_id'),
  ('rag', 'kg_entity_aliases', 'detail', 'an alias row hanging off rag.kg_entities with no identity or visibility of its own'),
  ('research', 'research_intent', 'reference', 'RLS is OFF while authenticated holds every privilege, so every principal reads every row — platform-keyed catalog by enforcement; FINDING: RLS disabled on a client-granted table'),
  ('research', 'youtube_quota_day', 'system', 'only arms are is_platform_admin() and is_super_admin(); no organization_id, owner_id or parent record'),
  ('restore_graph', 'run', 'system', 'branch-only: W0-DATA''s restore receipt.'),
  ('runtime', '_org_repair_0253_backup', 'deprecated', 'name matches the _backup backup-table rule CUT-14 states verbatim'),
  ('scheduler', 'agent_schedule', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('scheduler', 'agent_schedule_claim', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('scraper', 'scrape_domain', 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scraper', 'scrape_domain_settings', 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scraper', 'scrape_failure_log', 'reference', 'enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a failure log should not be world-readable'),
  ('scraper', 'scrape_path_override', 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scraper', 'scrape_path_pattern', 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scraper', 'scrape_retry_queue', 'reference', 'enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a retry queue should not be world-readable'),
  ('seo', 'classifier_revision_ledger', 'ledger', 'service_role holds INSERT and SELECT and nothing holds UPDATE or DELETE — append-only enforced by grant rather than by trigger'),
  ('seo', 'engine_owner_task', 'system', 'no grant to any API role; RLS off'),
  ('seo', 'keyword_classification_queue', 'detail', 'FK to the registered token seo_keyword and no organization_id, owner_id or visibility of its own'),
  ('seo', 'location', 'reference', 'SELECT policy qual is `true` for authenticated with admin-only writes; a location catalog with no organization_id or owner_id'),
  ('seo', 'topic_placement_queue', 'detail', 'FKs to the registered tokens seo_keyword and web_site; no organization_id, owner_id or visibility of its own'),
  ('transcripts', 'studio_cleaned_segments', 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('transcripts', 'studio_concept_items', 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('transcripts', 'studio_module_segments', 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('transcripts', 'studio_raw_segments', 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('users', 'feedback_comments', 'detail', 'read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row''s access'),
  ('users', 'feedback_user_messages', 'detail', 'read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row''s access'),
  ('users', 'guest_execution_log', 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record'),
  ('users', 'guest_executions', 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id or owner_id, and its auth user FK is ON DELETE SET NULL'),
  ('users', 'user_follows', 'detail', 'a follower-to-followed link row with no identity or visibility of its own'),
  ('users', 'user_secrets', 'restricted', 'AMBIGUITY RESOLVED by its deciding query: authenticated holds only DELETE on the table - no SELECT, INSERT or UPDATE grant - so no policy arm can return secret material to a signed-in principal and the table is service-role-only in fact. Doctrine 1.1 puts secrets under Restricted.'),
  ('web', 'analysis_result', 'ledger', 'AMBIGUITY RESOLVED by its deciding query: 264 of 227,604 rows carry deleted_at and web.reject_immutable_fact_mutation() permits an UPDATE only when deleted_at is the sole delta - an immutable fact with a tombstone.'),
  ('web', 'endpoint_family_sweep_state', 'detail', 'FK to the registered token web_site and no organization_id, owner_id or visibility of its own'),
  ('web', 'link_edge', 'ledger', 'AMBIGUITY RESOLVED by reading the trigger body: the link_edge arm admits an UPDATE only when every one of its thirteen columns is unchanged - a no-op - so the soft-delete arm above it is the only permitted delta, same as web.analysis_result.'),
  ('web', 'snapshot', 'ledger', 'AMBIGUITY RESOLVED by reading the trigger body: web.reject_immutable_fact_mutation() has no snapshot arm at all, so only the deleted_at arm passes and every other UPDATE raises 55000.'),
  ('workbench', 'schema_templates', 'reference', 'authenticated holds SELECT and nothing else while service_role writes; RLS off, no organization_id — platform-shipped schema templates'),
  ('workbench', 'udt_dataset_row_versions', 'detail', 'a version store whose read arm is EXISTS over workbench.udt_datasets — CUT-14 states version stores are Details of what they version'),
  ('workbench', 'udt_dataset_template_fields', 'detail', 'read arm is EXISTS over workbench.udt_dataset_templates — exactly the parent template''s access'),
  ('workflow', 'plan_event', 'ledger', 'registry rls_variant=component would derive Detail; ENFORCEMENT overrides it - trigger wf_plan_event_append_only fires BEFORE DELETE OR UPDATE and raises 55000 unconditionally'),
  ('workflow', 'trigger_event', 'detail', 'read arm is EXISTS over workflow.trigger with t.created_by = auth.uid() — exactly the parent trigger''s access'),
  ('workflow', 'work_item', 'detail', 'read arm is EXISTS over workflow.run with r.created_by = auth.uid() — exactly the parent run''s access'),
  ('workflow', 'worker_heartbeat', 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record');

-- ------------------------------------------- 3. the registered rows answer a type
update platform.entity_types e
   set type                  = c.type,
       type_reason           = case when c.type = case
             when e.is_active is false                     then 'deprecated'
             when e.audit_class = 'machinery'               then 'system'
             when e.rls_variant in ('component','detail')   then 'detail'
             when e.rls_variant = 'system'                  then 'reference'
             when e.rls_variant = 'restricted'              then 'restricted'
             when e.rls_variant = 'ledger'                  then 'ledger'
             else 'entity'
           end then null else c.evidence end,
       custom_fields_enabled = (c.type in ('entity','detail'))
  from w1_reg_class c
 where e.schema_name = c.schema_name
   and e.table_name  = c.table_name
   and (e.type is distinct from c.type
        or e.custom_fields_enabled is distinct from (c.type in ('entity','detail')));

-- Every other registry row - including the ones backed by nothing and the projections over
-- views - takes DD-062 1.2's derivation from THIS database's enforcement axis and says so by
-- carrying no type_reason at all.
update platform.entity_types e
   set type                  = case
             when e.is_active is false                     then 'deprecated'
             when e.audit_class = 'machinery'               then 'system'
             when e.rls_variant in ('component','detail')   then 'detail'
             when e.rls_variant = 'system'                  then 'reference'
             when e.rls_variant = 'restricted'              then 'restricted'
             when e.rls_variant = 'ledger'                  then 'ledger'
             else 'entity'
           end,
       custom_fields_enabled = (case
             when e.is_active is false                     then 'deprecated'
             when e.audit_class = 'machinery'               then 'system'
             when e.rls_variant in ('component','detail')   then 'detail'
             when e.rls_variant = 'system'                  then 'reference'
             when e.rls_variant = 'restricted'              then 'restricted'
             when e.rls_variant = 'ledger'                  then 'ledger'
             else 'entity'
           end in ('entity','detail')),
       type_reason           = null
 where e.type is null;

-- ------------------------------------------- 4. the unregistered tables are registered
insert into platform.entity_types
  (token, schema_name, table_name, label, rls_variant, audit_class, audit_class_reason,
   is_active, is_component, type, type_reason, custom_fields_enabled, is_listed, notes)
select v.token, v.schema_name, v.table_name, v.label, v.rls_variant, v.audit_class, v.audit_class_reason,
       v.is_active, v.is_component, v.type,
       case when v.type = 'entity' and v.audit_class = 'entity' and v.is_active then null else v.evidence end,
       (v.type in ('entity','detail')), false,
       'W1-REG/LAND: registered by the classification census on the MAIN database (CUT-14 / REC-32). ' || v.evidence
  from (values
  ('review_queue', 'agent', 'review_queue', 'Review Queue', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record — the platform''s own review register', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record — the platform''s own review register'),
  ('attempt', 'assignment', 'attempt', 'Attempt', 'component', 'entity', null, true, true, 'detail', 'its only FK is to its parent attempt-holder and it carries no organization_id, owner_id or visibility of its own'),
  ('item', 'assignment', 'item', 'Item', 'component', 'entity', null, true, true, 'detail', 'FK to the registered token assignment_session; no own organization_id, owner_id or visibility'),
  ('account_addon', 'billing', 'account_addon', 'Account Addon', 'entity', 'entity', null, true, false, 'entity', 'own organization_id stamped by _stamp_org_default; admin-only policy today because the table never passed through the generator'),
  ('class_purchase', 'billing', 'class_purchase', 'Class Purchase', 'entity', 'entity', null, true, false, 'entity', 'own organization_id; admin-only policy today because the table never passed through the generator'),
  ('org_plan', 'billing', 'org_plan', 'Org Plan', 'entity', 'entity', null, true, false, 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id'),
  ('build_lock', 'campaign_watch', 'build_lock', 'Build Lock', 'entity', 'machinery', 'machinery: no SELECT/INSERT/UPDATE/DELETE grant to anon, authenticated or service_role — reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no SELECT/INSERT/UPDATE/DELETE grant to anon, authenticated or service_role — reachable only by the owner and SECURITY DEFINER code'),
  ('emails', 'communication', 'emails', 'Emails', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('sms_rate_limits', 'communication', 'sms_rate_limits', 'Sms Rate Limits', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record', true, false, 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record'),
  ('sms_webhook_logs', 'communication', 'sms_webhook_logs', 'Sms Webhook Logs', 'component', 'entity', null, true, true, 'detail', 'FK to the registered token sms_message; no own organization_id, owner_id or visibility'),
  ('admission_config', 'content_ir', 'admission_config', 'Admission Config', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('io_contract', 'content_ir', 'io_contract', 'Io Contract', 'entity', 'entity', null, true, false, 'entity', 'own organization_id FK to iam.organizations, stamped by _stamp_org_default, versioned by _touch_row'),
  ('context_value_refs', 'context', 'context_value_refs', 'Context Value Refs', 'component', 'entity', null, true, true, 'detail', 'FKs to the registered tokens context_item, context_item_value and scope; no own organization_id or visibility (CUT-19''s deprecation source)'),
  ('scope_door_registry', 'context', 'scope_door_registry', 'Scope Door Registry', 'entity', 'machinery', 'machinery: no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code'),
  ('template_context_items', 'context', 'template_context_items', 'Template Context Items', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with writes admin-only; 846 platform-shipped template rows, no organization_id'),
  ('template_scope_types', 'context', 'template_scope_types', 'Template Scope Types', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with writes admin-only; 116 platform-shipped template rows, no organization_id'),
  ('templates', 'context', 'templates', 'Templates', 'system', 'entity', null, true, false, 'reference', 'read arm is is_active = true for every authenticated principal, writes admin-only; platform-shipped, no organization_id'),
  ('outreach_acceptance', 'crm', 'outreach_acceptance', 'Outreach Acceptance', 'entity', 'entity', null, true, false, 'entity', 'read arm is is_org_member(organization_id) on its own organization_id'),
  ('unsubscribe_token', 'crm', 'unsubscribe_token', 'Unsubscribe Token', 'entity', 'entity', null, true, false, 'entity', 'read arm is is_org_member(organization_id) on its own organization_id; org-stamped by _inherit_org'),
  ('carrying_rule', 'custom', 'carrying_rule', 'Carrying Rule', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code'),
  ('organization_visibility_version', 'custom', 'organization_visibility_version', 'Organization Visibility Version', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code'),
  ('record_alias', 'custom', 'record_alias', 'Record Alias', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role; RLS on with one is_platform_admin()/org-member arm no client role can reach, schema custom being declared CLOSED', true, false, 'system', 'no grant to anon, authenticated or service_role; RLS on with one is_platform_admin()/org-member arm no client role can reach, schema custom being declared CLOSED'),
  ('visibility_cache', 'custom', 'visibility_cache', 'Visibility Cache', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code'),
  ('visibility_epoch', 'custom', 'visibility_epoch', 'Visibility Epoch', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to anon, authenticated or service_role and RLS off; schema custom is declared CLOSED, so the table is reachable only by the owner and SECURITY DEFINER code'),
  ('dict_provider_publication', 'dictionary', 'dict_provider_publication', 'Dict Provider Publication', 'entity', 'entity', null, true, false, 'entity', 'read arm is owner_id = auth.uid() on its own owner column'),
  ('page_extraction_results', 'docproc', 'page_extraction_results', 'Page Extraction Results', 'component', 'entity', null, true, true, 'detail', 'every read arm resolves through the parent job (job_id IN readable_extraction_job_ids()); no own organization_id'),
  ('page_extraction_runs', 'docproc', 'page_extraction_runs', 'Page Extraction Runs', 'component', 'entity', null, true, true, 'detail', 'read arm is the parent job''s (job_id IN readable_extraction_job_ids()); its organization_id FK is ON DELETE SET NULL NOT VALID and carries no read arm'),
  ('deck_suggestion', 'education', 'deck_suggestion', 'Deck Suggestion', 'entity', 'entity', null, true, false, 'entity', 'read arm is suggested_by = auth.uid() OR owner_id = auth.uid() on its own owner columns'),
  ('math_course_structure', 'education', 'math_course_structure', 'Math Course Structure', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated, writes admin-only; platform-shipped course structure with no organization_id or owner_id'),
  ('study_source_chunk', 'education', 'study_source_chunk', 'Study Source Chunk', 'entity', 'entity', null, true, false, 'entity', 'read arm is owner_id = auth.uid(); its structured_section FK is ON DELETE SET NULL, so it is not composition'),
  ('study_structured_section', 'education', 'study_structured_section', 'Study Structured Section', 'entity', 'entity', null, true, false, 'entity', 'read arm is owner_id = auth.uid() OR organization_id IN (SELECT iam.my_orgs()) on its own columns'),
  ('analysis_result', 'files', 'analysis_result', 'Analysis Result', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over files.files with cf.created_by = auth.uid() — exactly the parent file''s access'),
  ('idempotency', 'files', 'idempotency', 'Idempotency', 'entity', 'machinery', 'machinery: AMBIGUITY RESOLVED by its deciding query: zero references to files.idempotency in either repository''s application code - no user surface names a row - so request-dedupe keys are machinery.', true, false, 'system', 'AMBIGUITY RESOLVED by its deciding query: zero references to files.idempotency in either repository''s application code - no user surface names a row - so request-dedupe keys are machinery.'),
  ('rate_limit_buckets', 'files', 'rate_limit_buckets', 'Rate Limit Buckets', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('structure', 'files', 'structure', 'Structure', 'component', 'entity', null, true, true, 'detail', 'read arm is iam.has_access(''file'', file_id, ''viewer'') — exactly the parent file''s access'),
  ('uploads_inflight', 'files', 'uploads_inflight', 'Uploads Inflight', 'entity', 'entity', null, true, false, 'entity', 'read arm is owner_id = auth.uid() and the table carries its own visibility column'),
  ('webhook_deliveries', 'files', 'webhook_deliveries', 'Webhook Deliveries', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over files.webhooks with w.owner_id = auth.uid() — exactly the parent webhook''s access'),
  ('webhook_dispatch_state', 'files', 'webhook_dispatch_state', 'Webhook Dispatch State', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('webhooks', 'files', 'webhooks', 'Webhooks', 'entity', 'entity', null, true, false, 'entity', 'read arm is owner_id = auth.uid() on its own owner column, plus its own organization_id'),
  ('capture_window', 'history', 'capture_window', 'Capture Window', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role; its only policy arm is the table owner or is_platform_admin() - history is named under System by Doctrine 1.1', true, false, 'system', 'no grant to anon, authenticated or service_role; its only policy arm is the table owner or is_platform_admin() - history is named under System by Doctrine 1.1'),
  ('migration_log', 'history', 'migration_log', 'Migration Log', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role, so its org-member policy arm is unreachable by any client role; history is named under System by Doctrine 1.1', true, false, 'system', 'no grant to anon, authenticated or service_role, so its org-member policy arm is unreachable by any client role; history is named under System by Doctrine 1.1'),
  ('recompute_queue', 'hr', '_recompute_queue', 'Recompute Queue', 'entity', 'machinery', 'machinery: no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code', true, false, 'system', 'no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code'),
  ('write_guard_key', 'hr', '_write_guard_key', 'Write Guard Key', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies — closed to every principal but the owner', true, false, 'system', 'no grant to any API role; RLS on with zero policies — closed to every principal but the owner'),
  ('definer_grant_baseline', 'hr', 'definer_grant_baseline', 'Definer Grant Baseline', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('function_contract', 'hr', 'function_contract', 'Function Contract', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('notify_outsider_door_baseline', 'hr', 'notify_outsider_door_baseline', 'Notify Outsider Door Baseline', 'entity', 'machinery', 'machinery: no grant to any API role; RLS off', true, false, 'system', 'no grant to any API role; RLS off'),
  ('access_delta_probe', 'iam', 'access_delta_probe', 'Access Delta Probe', 'entity', 'machinery', 'machinery: no grant to any API role — its one service_role policy is unreachable without a table grant', true, false, 'system', 'no grant to any API role — its one service_role policy is unreachable without a table grant'),
  ('access_delta_run', 'iam', 'access_delta_run', 'Access Delta Run', 'entity', 'machinery', 'machinery: no grant to any API role — its one service_role policy is unreachable without a table grant', true, false, 'system', 'no grant to any API role — its one service_role policy is unreachable without a table grant'),
  ('dd171_containment_baseline', 'iam', 'dd171_containment_baseline', 'Dd171 Containment Baseline', 'entity', 'entity', null, false, false, 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the data-doctrine REGISTER records DD-171 as Met - the audit this baseline backs is CLOSED - and the table carries no grants and no RLS.'),
  ('dd175_cast', 'iam', 'dd175_cast', 'Dd175 Cast', 'entity', 'entity', null, false, false, 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the REGISTER records DD-175 as Met - the audit is CLOSED - and the table carries no grants and no RLS.'),
  ('dd175_component_lane_baseline', 'iam', 'dd175_component_lane_baseline', 'Dd175 Component Lane Baseline', 'entity', 'entity', null, false, false, 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the REGISTER records DD-175 as Met - the audit is CLOSED - and the table carries no grants and no RLS.'),
  ('definer_class_exemption', 'iam', 'definer_class_exemption', 'Definer Class Exemption', 'entity', 'machinery', 'machinery: service_role SELECT is the only grant and the table sits in iam, which Doctrine 1.1 names under System', true, false, 'system', 'service_role SELECT is the only grant and the table sits in iam, which Doctrine 1.1 names under System'),
  ('membership_grant', 'iam', 'membership_grant', 'Membership Grant', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); iam is named under System by Doctrine 1.1', true, false, 'system', 'only policy arm is is_platform_admin(); iam is named under System by Doctrine 1.1'),
  ('org_industries', 'iam', 'org_industries', 'Org Industries', 'component', 'entity', null, true, true, 'detail', 'primary key is (organization_id, industry_id) — a junction row with no identity or visibility of its own'),
  ('organization_preferences', 'iam', 'organization_preferences', 'Organization Preferences', 'component', 'entity', null, true, true, 'detail', 'primary key IS organization_id — one row per organization, access exactly the organization''s'),
  ('superseded_policy', 'iam', 'superseded_policy', 'Superseded Policy', 'entity', 'machinery', 'machinery: no grant to any API role; RLS off — a superseded-policy register only the owner and SECURITY DEFINER code reach', true, false, 'system', 'no grant to any API role; RLS off — a superseded-policy register only the owner and SECURITY DEFINER code reach'),
  ('system_orgs', 'iam', 'system_orgs', 'System Orgs', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; the platform-owned list of system organizations'),
  ('stage_dockets_966c18eca7', 'legal', '_stage_dockets_966c18eca7', 'Stage Dockets 966c18eca7', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _stage_ staging-table rule CUT-14 states verbatim'),
  ('citations', 'legal', 'citations', 'Citations', 'system', 'entity', null, true, false, 'reference', 'platform-ingested case-law catalog: no organization_id, no owner_id, no parent record, and legal.ingest_runs is its only writer'),
  ('courts', 'legal', 'courts', 'Courts', 'system', 'entity', null, true, false, 'reference', 'platform-ingested court catalog (3,360 rows): no organization_id, no owner_id, no parent record'),
  ('dockets', 'legal', 'dockets', 'Dockets', 'system', 'entity', null, true, false, 'reference', 'platform-ingested docket catalog: no organization_id, no owner_id; its one FK points at another catalog table'),
  ('ingest_runs', 'legal', 'ingest_runs', 'Ingest Runs', 'entity', 'entity', null, true, false, 'entity', 'own organization_id stamped by stamp_run_org, with emit_run_lifecycle; admin-only policy today because it never passed through the generator'),
  ('opinion_clusters', 'legal', 'opinion_clusters', 'Opinion Clusters', 'system', 'entity', null, true, false, 'reference', 'platform-ingested opinion catalog (7,900 rows): no organization_id, no owner_id, no parent record'),
  ('opinions', 'legal', 'opinions', 'Opinions', 'system', 'entity', null, true, false, 'reference', 'platform-ingested opinion catalog: no organization_id, no owner_id, no parent record'),
  ('bak_organization_name_dd043', 'ops', '_bak_organization_name_dd043', 'Bak Organization Name Dd043', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('ops_issue_class', 'ops', 'ops_issue_class', 'Ops Issue Class', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated, writes admin-only; 227 platform-defined issue classes with no organization_id'),
  ('path_drift_repair_2026_09', 'ops', 'path_drift_repair_2026_09', 'Path Drift Repair 2026 09', 'entity', 'entity', null, false, false, 'deprecated', 'a dated one-off repair artefact (_2026_09), no grants and no RLS — the same class CUT-14''s backup rule names'),
  ('part_config', 'partman', 'part_config', 'Part Config', 'entity', 'machinery', 'machinery: no grant to any API role; pg_partman''s own control table', true, false, 'system', 'no grant to any API role; pg_partman''s own control table'),
  ('part_config_sub', 'partman', 'part_config_sub', 'Part Config Sub', 'entity', 'machinery', 'machinery: no grant to any API role; pg_partman''s own control table', true, false, 'system', 'no grant to any API role; pg_partman''s own control table'),
  ('pdf_consolidation_log', 'pdf', 'pdf_consolidation_log', 'Pdf Consolidation Log', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('pdf_redaction_key_escrow', 'pdf', 'pdf_redaction_key_escrow', 'Pdf Redaction Key Escrow', 'entity', 'entity', null, true, false, 'entity', 'AMBIGUITY RESOLVED by its deciding query, AGAINST the Doctrine''s word and deliberately: authenticated holds SELECT and pdf_redaction_key_escrow_select returns the row on owner_id = auth.uid(), so it is not service-role-only. The type follows what is ENFORCED; the gap to Doctrine 1.1''s ''escrow is Restricted'' is a POLICY defect (W1-REG, FOUND OUTSIDE BRIEF), not a type.'),
  ('bak_assoc_file_processed_document_20260812', 'platform', '_bak_assoc_file_processed_document_20260812', 'Bak Assoc File Processed Document 20260812', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('bak_assoc_type_file_processed_document_20260812', 'platform', '_bak_assoc_type_file_processed_document_20260812', 'Bak Assoc Type File Processed Document 20260812', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _bak_ backup-table rule CUT-14 states verbatim'),
  ('oauth_handoff_claim', 'platform', '_oauth_handoff_claim', 'Oauth Handoff Claim', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('policy_overlap_backup', 'platform', '_policy_overlap_backup', 'Policy Overlap Backup', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _backup backup-table rule CUT-14 states verbatim'),
  ('policy_overlap_probe', 'platform', '_policy_overlap_probe', 'Policy Overlap Probe', 'entity', 'entity', null, false, false, 'deprecated', 'AMBIGUITY RESOLVED by its deciding query: the only writer anywhere in either repository is the one-off harness migration policy_overlap_campaign_harness.sql, already applied - nothing writes it now, and its sibling platform._policy_overlap_backup is Deprecated by CUT-14''s own name rule.'),
  ('work_claim', 'platform', '_work_claim', 'Work Claim', 'entity', 'machinery', 'machinery: platform machinery the 09:17 census predates: production gained platform._work_claim and W1-PROV-CLOSED levelled it onto the branch the same day. It is the provisioner''s own work claim - machinery.', true, false, 'system', 'platform machinery the 09:17 census predates: production gained platform._work_claim and W1-PROV-CLOSED levelled it onto the branch the same day. It is the provisioner''s own work claim - machinery.'),
  ('anon_function_birth_grandfather', 'platform', 'anon_function_birth_grandfather', 'Anon Function Birth Grandfather', 'entity', 'machinery', 'machinery: no grant to any API role; a platform guard register with its own closure trigger', true, false, 'system', 'no grant to any API role; a platform guard register with its own closure trigger'),
  ('assist_producer_policy_history', 'platform', 'assist_producer_policy_history', 'Assist Producer Policy History', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and is_admin(); a platform policy history, which Doctrine 1.1 names under System', true, false, 'system', 'only arms are is_platform_admin() and is_admin(); a platform policy history, which Doctrine 1.1 names under System'),
  ('client_callable_door', 'platform', 'client_callable_door', 'Client Callable Door', 'entity', 'machinery', 'machinery: no grant to any API role; the door registry the grant event trigger reads — machinery by definition', true, false, 'system', 'no grant to any API role; the door registry the grant event trigger reads — machinery by definition'),
  ('client_callable_door_retirement', 'platform', 'client_callable_door_retirement', 'Client Callable Door Retirement', 'entity', 'machinery', 'machinery: no grant to any API role; part of the same door registry', true, false, 'system', 'no grant to any API role; part of the same door registry'),
  ('client_excluded_column_unregistered', 'platform', 'client_excluded_column_unregistered', 'Client Excluded Column Unregistered', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('definer_client_grant_grandfather', 'platform', 'definer_client_grant_grandfather', 'Definer Client Grant Grandfather', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('feature_knob', 'platform', 'feature_knob', 'Feature Knob', 'system', 'entity', null, true, false, 'reference', 'carries a public_read policy with qual `true`; 752 platform-shipped knob definitions, writes admin-only, no organization_id'),
  ('knob_override', 'platform', 'knob_override', 'Knob Override', 'entity', 'entity', null, true, false, 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only, so the write door is elsewhere'),
  ('knob_rung_lock', 'platform', 'knob_rung_lock', 'Knob Rung Lock', 'entity', 'entity', null, true, false, 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only'),
  ('masterwork_run_kind', 'platform', 'masterwork_run_kind', 'Masterwork Run Kind', 'system', 'entity', null, true, false, 'reference', 'one SELECT policy with qual `true`, authenticated holds SELECT only; 27 platform-defined run kinds'),
  ('metadata_reserved_keys', 'platform', 'metadata_reserved_keys', 'Metadata Reserved Keys', 'entity', 'machinery', 'machinery: service_role is the only grantee and the table sits in platform — Doctrine 1.1 names the registry and meta plumbing under System', true, false, 'system', 'service_role is the only grantee and the table sits in platform — Doctrine 1.1 names the registry and meta plumbing under System'),
  ('mtx_media_heal_queue', 'platform', 'mtx_media_heal_queue', 'Mtx Media Heal Queue', 'system', 'entity', null, true, false, 'reference', 'enforced as public platform data: a SELECT policy with qual `true` beside an admin-only write arm, no organization_id — FINDING: a repair queue should not be world-readable'),
  ('org_change_policy', 'platform', 'org_change_policy', 'Org Change Policy', 'entity', 'entity', null, true, false, 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, stamped by _stamp_org_default'),
  ('org_context_ledger', 'platform', 'org_context_ledger', 'Org Context Ledger', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); platform registry and meta plumbing, which Doctrine 1.1 names under System. The type follows what is ENFORCED, never the word ledger in the name - no trigger and no grant pattern makes it append-only', true, false, 'system', 'only policy arm is is_platform_admin(); platform registry and meta plumbing, which Doctrine 1.1 names under System. The type follows what is ENFORCED, never the word ledger in the name - no trigger and no grant pattern makes it append-only'),
  ('provision_generate_target', 'platform', 'provision_generate_target', 'Provision Generate Target', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('provision_grant', 'platform', 'provision_grant', 'Provision Grant', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('provision_marker', 'platform', 'provision_marker', 'Provision Marker', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('provision_rule_message', 'platform', 'provision_rule_message', 'Provision Rule Message', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('provision_schema', 'platform', 'provision_schema', 'Provision Schema', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('provision_shape_debt', 'platform', 'provision_shape_debt', 'Provision Shape Debt', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('provision_spec', 'platform', 'provision_spec', 'Provision Spec', 'entity', 'machinery', 'machinery: no grant to any API role; its _provision_spec_append_only trigger is noted but no principal can reach the table at all', true, false, 'system', 'no grant to any API role; its _provision_spec_append_only trigger is noted but no principal can reach the table at all'),
  ('provision_spec_grandfather', 'platform', 'provision_spec_grandfather', 'Provision Spec Grandfather', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('provision_vocabulary', 'platform', 'provision_vocabulary', 'Provision Vocabulary', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('schema_client_exposure', 'platform', 'schema_client_exposure', 'Schema Client Exposure', 'entity', 'machinery', 'machinery: branch-only, and this campaign''s own: the declared schema-exposure table W1-PROV landed, in which `custom` is declared closed. Machinery of the registry itself.', true, false, 'system', 'branch-only, and this campaign''s own: the declared schema-exposure table W1-PROV landed, in which `custom` is declared closed. Machinery of the registry itself.'),
  ('soft_delete_edge', 'platform', 'soft_delete_edge', 'Soft Delete Edge', 'entity', 'machinery', 'machinery: no grant to any API role; RLS on with zero policies', true, false, 'system', 'no grant to any API role; RLS on with zero policies'),
  ('stamped_write_table', 'platform', 'stamped_write_table', 'Stamped Write Table', 'entity', 'machinery', 'machinery: no grant to any API role', true, false, 'system', 'no grant to any API role'),
  ('schema_migration_slot_grandfather', 'public', '_schema_migration_slot_grandfather', 'Schema Migration Slot Grandfather', 'entity', 'machinery', 'machinery: service_role is the only grantee and the table is migration plumbing — Doctrine 1.1 names meta plumbing under System', true, false, 'system', 'service_role is the only grantee and the table is migration plumbing — Doctrine 1.1 names meta plumbing under System'),
  ('app_config_history', 'public', 'app_config_history', 'App Config History', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System', true, false, 'system', 'only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System'),
  ('catalog_entries_history', 'public', 'catalog_entries_history', 'Catalog Entries History', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System', true, false, 'system', 'only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System'),
  ('data_store_members', 'rag', 'data_store_members', 'Data Store Members', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over rag.data_stores — exactly the parent store''s access'),
  ('embedding_cache', 'rag', 'embedding_cache', 'Embedding Cache', 'entity', 'machinery', 'machinery: no client read arm at all (admin-only), no org-stamping trigger, primary key is a cache_key — writes arrive only through SECURITY DEFINER code', true, false, 'system', 'no client read arm at all (admin-only), no org-stamping trigger, primary key is a cache_key — writes arrive only through SECURITY DEFINER code'),
  ('embeddings_google_gemini_2_1536', 'rag', 'embeddings_google_gemini_2_1536', 'Embeddings Google Gemini 2 1536', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('embeddings_oai_3_small_1536', 'rag', 'embeddings_oai_3_small_1536', 'Embeddings Oai 3 Small 1536', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('embeddings_voyage_4_large_1024', 'rag', 'embeddings_voyage_4_large_1024', 'Embeddings Voyage 4 Large 1024', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('embeddings_voyage_code_3_1024', 'rag', 'embeddings_voyage_code_3_1024', 'Embeddings Voyage Code 3 1024', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk''s access'),
  ('kg_chunk_entities', 'rag', 'kg_chunk_entities', 'Kg Chunk Entities', 'component', 'entity', null, true, true, 'detail', 'a chunk-to-entity link row with no identity or visibility of its own; four FKs and no standalone read arm'),
  ('kg_chunks', 'rag', 'kg_chunks', 'Kg Chunks', 'entity', 'entity', null, true, false, 'entity', 'read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, with its own owner_id and deleted_at'),
  ('kg_clusters', 'rag', 'kg_clusters', 'Kg Clusters', 'entity', 'entity', null, true, false, 'entity', 'read arm is is_member_of_organization(organization_id) on its own organization_id'),
  ('kg_edges', 'rag', 'kg_edges', 'Kg Edges', 'component', 'entity', null, true, true, 'detail', 'a graph edge row — a relation between two kg_entities with no identity or visibility of its own'),
  ('kg_entities', 'rag', 'kg_entities', 'Kg Entities', 'entity', 'entity', null, true, false, 'entity', 'read arm is is_member_of_organization(organization_id) on its own organization_id'),
  ('kg_entity_aliases', 'rag', 'kg_entity_aliases', 'Kg Entity Aliases', 'component', 'entity', null, true, true, 'detail', 'an alias row hanging off rag.kg_entities with no identity or visibility of its own'),
  ('research_intent', 'research', 'research_intent', 'Research Intent', 'system', 'entity', null, true, false, 'reference', 'RLS is OFF while authenticated holds every privilege, so every principal reads every row — platform-keyed catalog by enforcement; FINDING: RLS disabled on a client-granted table'),
  ('youtube_quota_day', 'research', 'youtube_quota_day', 'Youtube Quota Day', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and is_super_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only arms are is_platform_admin() and is_super_admin(); no organization_id, owner_id or parent record'),
  ('org_repair_0253_backup', 'runtime', '_org_repair_0253_backup', 'Org Repair 0253 Backup', 'entity', 'entity', null, false, false, 'deprecated', 'name matches the _backup backup-table rule CUT-14 states verbatim'),
  ('agent_schedule', 'scheduler', 'agent_schedule', 'Agent Schedule', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('agent_schedule_claim', 'scheduler', 'agent_schedule_claim', 'Agent Schedule Claim', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record'),
  ('scrape_domain', 'scraper', 'scrape_domain', 'Scrape Domain', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scrape_domain_settings', 'scraper', 'scrape_domain_settings', 'Scrape Domain Settings', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scrape_failure_log', 'scraper', 'scrape_failure_log', 'Scrape Failure Log', 'system', 'entity', null, true, false, 'reference', 'enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a failure log should not be world-readable'),
  ('scrape_path_override', 'scraper', 'scrape_path_override', 'Scrape Path Override', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scrape_path_pattern', 'scraper', 'scrape_path_pattern', 'Scrape Path Pattern', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id'),
  ('scrape_retry_queue', 'scraper', 'scrape_retry_queue', 'Scrape Retry Queue', 'system', 'entity', null, true, false, 'reference', 'enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a retry queue should not be world-readable'),
  ('classifier_revision_ledger', 'seo', 'classifier_revision_ledger', 'Classifier Revision Ledger', 'ledger', 'entity', null, true, false, 'ledger', 'service_role holds INSERT and SELECT and nothing holds UPDATE or DELETE — append-only enforced by grant rather than by trigger'),
  ('engine_owner_task', 'seo', 'engine_owner_task', 'Engine Owner Task', 'entity', 'machinery', 'machinery: no grant to any API role; RLS off', true, false, 'system', 'no grant to any API role; RLS off'),
  ('keyword_classification_queue', 'seo', 'keyword_classification_queue', 'Keyword Classification Queue', 'component', 'entity', null, true, true, 'detail', 'FK to the registered token seo_keyword and no organization_id, owner_id or visibility of its own'),
  ('location', 'seo', 'location', 'Location', 'system', 'entity', null, true, false, 'reference', 'SELECT policy qual is `true` for authenticated with admin-only writes; a location catalog with no organization_id or owner_id'),
  ('page_intent_queue', 'seo', 'page_intent_queue', 'Page Intent Queue', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role; RLS on with zero policies - closed to every principal but the owner. Its siblings seo.keyword_classification_queue and seo.topic_placement_queue, which authenticated can read and write through their parent, are Details; these two are not', true, false, 'system', 'no grant to anon, authenticated or service_role; RLS on with zero policies - closed to every principal but the owner. Its siblings seo.keyword_classification_queue and seo.topic_placement_queue, which authenticated can read and write through their parent, are Details; these two are not'),
  ('page_mapping_queue', 'seo', 'page_mapping_queue', 'Page Mapping Queue', 'entity', 'machinery', 'machinery: no grant to anon, authenticated or service_role; RLS on with zero policies - closed to every principal but the owner. Its siblings seo.keyword_classification_queue and seo.topic_placement_queue, which authenticated can read and write through their parent, are Details; these two are not', true, false, 'system', 'no grant to anon, authenticated or service_role; RLS on with zero policies - closed to every principal but the owner. Its siblings seo.keyword_classification_queue and seo.topic_placement_queue, which authenticated can read and write through their parent, are Details; these two are not'),
  ('topic_placement_queue', 'seo', 'topic_placement_queue', 'Topic Placement Queue', 'component', 'entity', null, true, true, 'detail', 'FKs to the registered tokens seo_keyword and web_site; no organization_id, owner_id or visibility of its own'),
  ('studio_cleaned_segments', 'transcripts', 'studio_cleaned_segments', 'Studio Cleaned Segments', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('studio_concept_items', 'transcripts', 'studio_concept_items', 'Studio Concept Items', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('studio_module_segments', 'transcripts', 'studio_module_segments', 'Studio Module Segments', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('studio_raw_segments', 'transcripts', 'studio_raw_segments', 'Studio Raw Segments', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over transcripts.studio_sessions — exactly the parent session''s access and visibility'),
  ('feedback_comments', 'users', 'feedback_comments', 'Feedback Comments', 'component', 'entity', null, true, true, 'detail', 'read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row''s access'),
  ('feedback_user_messages', 'users', 'feedback_user_messages', 'Feedback User Messages', 'component', 'entity', null, true, true, 'detail', 'read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row''s access'),
  ('guest_execution_log', 'users', 'guest_execution_log', 'Guest Execution Log', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record', true, false, 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id, owner_id or parent record'),
  ('guest_executions', 'users', 'guest_executions', 'Guest Executions', 'entity', 'machinery', 'machinery: only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id or owner_id, and its auth user FK is ON DELETE SET NULL', true, false, 'system', 'only arms are is_platform_admin() and auth.role()=''service_role''; no organization_id or owner_id, and its auth user FK is ON DELETE SET NULL'),
  ('user_follows', 'users', 'user_follows', 'User Follows', 'component', 'entity', null, true, true, 'detail', 'a follower-to-followed link row with no identity or visibility of its own'),
  ('endpoint_family_sweep_state', 'web', 'endpoint_family_sweep_state', 'Endpoint Family Sweep State', 'component', 'entity', null, true, true, 'detail', 'FK to the registered token web_site and no organization_id, owner_id or visibility of its own'),
  ('schema_templates', 'workbench', 'schema_templates', 'Schema Templates', 'system', 'entity', null, true, false, 'reference', 'authenticated holds SELECT and nothing else while service_role writes; RLS off, no organization_id — platform-shipped schema templates'),
  ('udt_dataset_row_versions', 'workbench', 'udt_dataset_row_versions', 'Udt Dataset Row Versions', 'component', 'entity', null, true, true, 'detail', 'a version store whose read arm is EXISTS over workbench.udt_datasets — CUT-14 states version stores are Details of what they version'),
  ('udt_dataset_template_fields', 'workbench', 'udt_dataset_template_fields', 'Udt Dataset Template Fields', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over workbench.udt_dataset_templates — exactly the parent template''s access'),
  ('trigger_event', 'workflow', 'trigger_event', 'Trigger Event', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over workflow.trigger with t.created_by = auth.uid() — exactly the parent trigger''s access'),
  ('workflow_work_item', 'workflow', 'work_item', 'Work Item', 'component', 'entity', null, true, true, 'detail', 'read arm is EXISTS over workflow.run with r.created_by = auth.uid() — exactly the parent run''s access'),
  ('worker_heartbeat', 'workflow', 'worker_heartbeat', 'Worker Heartbeat', 'entity', 'machinery', 'machinery: only policy arm is is_platform_admin(); no organization_id, owner_id or parent record', true, false, 'system', 'only policy arm is is_platform_admin(); no organization_id, owner_id or parent record')
  ) as v(token, schema_name, table_name, label, rls_variant, audit_class, audit_class_reason,
         is_active, is_component, type, evidence)
 where to_regclass(quote_ident(v.schema_name)||'.'||quote_ident(v.table_name)) is not null
   and not exists (select 1 from platform.entity_types e
                    where e.schema_name = v.schema_name and e.table_name = v.table_name)
   and not exists (select 1 from platform.entity_types e where e.token = v.token);

-- ------------------------------------------- 5. the exit, as an assertion
do $w1regexit$
declare
  v_universe int; v_unclassified int; v_registered int; v_backed int; v_untyped int; v_orphans text;
begin
  create temporary table w1_reg_universe on commit drop as
  select t.table_schema as s, t.table_name as n
    from information_schema.tables t
   where t.table_type = 'BASE TABLE'
     and t.table_schema not in ('auth','storage','realtime','vault','extensions','cron','net',
           'pgsodium','graphql','graphql_public','_analytics','supabase_functions',
           'supabase_migrations','pgbouncer','deprecated','graveyard','pg_catalog','information_schema')
     and t.table_schema not like 'zz\_%'
     and not exists (select 1 from pg_inherits i
                      where i.inhrelid = format('%I.%I', t.table_schema, t.table_name)::regclass);

  select count(*) into v_universe from w1_reg_universe;
  select count(*) into v_unclassified from w1_reg_universe u
   where not exists (select 1 from platform.entity_types e
                      where e.schema_name = u.s and e.table_name = u.n and e.type is not null);
  select count(*) into v_registered from platform.entity_types;
  select count(*) into v_untyped from platform.entity_types where type is null;
  select count(*) into v_backed from platform.entity_types e
   where exists (select 1 from w1_reg_universe u where u.s = e.schema_name and u.n = e.table_name);
  select coalesce(string_agg(e.token, ', ' order by e.token), '(none)') into v_orphans
    from platform.entity_types e
   where not exists (select 1 from w1_reg_universe u where u.s = e.schema_name and u.n = e.table_name);

  raise notice 'W1-REG/LAND four numbers: universe=% unclassified=% registered=% backed=% backed-by-nothing=%',
    v_universe, v_unclassified, v_registered, v_backed, v_registered - v_backed;
  raise notice 'W1-REG/LAND registry rows backed by nothing, by token: %', v_orphans;

  if v_unclassified <> 0 then
    raise exception 'CUT-14 not met: % base tables in the universe still answer no type', v_unclassified;
  end if;
  if v_untyped <> 0 then
    raise exception 'REC-32 not met: % registry rows still carry type is null', v_untyped;
  end if;
end
$w1regexit$;
