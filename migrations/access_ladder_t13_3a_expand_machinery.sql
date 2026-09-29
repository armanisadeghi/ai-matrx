-- lane: access-ladder T-13 phase 3 (expand) steps 3.1-3.3 machinery
-- chair-step: new server-only machinery only — two ops ledger tables (REVOKE closes brand-new relations to client roles), the transitional list gains the four campaign functions below, and new functions. No table, column, policy or row of any existing table is changed by this file; the per-table expand, backfill and validate run one table per transaction from the driver.
-- based-on: platform._t13_allowlist(text) 5554bee05c2d6f898b1deb0abce353ed8faa06b4a06214318564a113b952a747
--
-- T-13 PHASE 3 — EXPAND (common-docs/projects/access-ladder/t13/PLAN.md §3; law: /policies/access-ladder.md).
--
-- 3.1  platform._t13_transitional_expand(table): on ONE Organization or Public table that carries the
--      retiring row column, adds published_to_web boolean not null default false, published_to_web_at,
--      published_to_web_by, two CHECKs added NOT VALID (search_engine_indexed only when published;
--      shown_to = 'everyone_on_ai_matrx' only when published — each only where that column exists), and
--      the two triggers below. Private, Confidential and child tables are refused here AND by guard 2.5a.
--      published_to_web_by carries no foreign key on purpose: 334 keys onto iam.users would take its lock
--      334 times (the sign-in table; db-work-now "copies never hold the sign-in table").
-- 3.2  platform._t13_transitional_dual_write(): the ONE dual-write trigger. Mapping, and nothing else:
--        * the row column changes      -> published_to_web = (it = 'public'); on 'personal', shown_to =
--                                          'only_me' only where shown_to is null. Counted.
--        * published_to_web changes    -> true: the row column = 'public'; false: 'internal' if it was
--                                          'public', else unchanged. _at / _by stamped (now(), auth.uid()).
--        * shown_to NEVER writes the row column (a list filter never moves a lock).
--        * both change and disagree    -> raises t13_row_column_disagrees.
--        * a write through the row column re-publishing a row that was unpublished THROUGH
--          published_to_web (published_to_web_at set, still false) is the stale full-row write -> raises
--          t13_stale_row_column_write.
--        * neither changes but they disagree (a row not yet backfilled): the derived column is healed from
--          the row column, which is still the source of truth before the switch (phase 4).
--      published_to_web_at / _by = when / who last set the web state THROUGH published_to_web; null means
--      the state was derived from the retiring column (legacy writer or the backfill).
--      Every write arriving through the row column is counted (row trigger -> transaction-local counter ->
--      the statement trigger platform._t13_transitional_flush_writes) into ops.t13_row_column_events
--      (day, table, kind, role, application_name). An INSERT counts when it names 'public', 'personal' or
--      'link' (an 'internal' insert cannot be told from the column default).
-- 3.3  platform._t13_transitional_backfill(table, batch): one batch of <= batch ids. It runs with
--      session_replication_role = replica for its own transaction ONLY — the skip flag: updated_at, the
--      _search_item_sync_* triggers, version capture, the local-mirror delta and realtime-side triggers do
--      not fire (the WAL still carries the change). It announces itself: every batch is a
--      'backfill_batch' row in ops.t13_row_column_events, and every id it changes is recorded in
--      ops.t13_backfill_ledger (the rollback's id list).
-- TRANSITIONAL (PLAN.md §2.5): the functions that name the retiring column enter
-- platform._t13_allowlist('transitional') here; they expire 2026-12-15 and phase 7 removes them.
-- Rollback: migrations/access_ladder_t13_3_rollback.sql (generated drop script, never swept).

select set_config('app.actor_tier', 'code', true);
select set_config('app.actor_system', 'migration:access_ladder_t13_3a_expand_machinery', true);

-- ── ops ledgers ────────────────────────────────────────────────────────────────────────────────
create table ops.t13_row_column_events (
  day              date        not null default current_date,
  table_ref        text        not null,
  kind             text        not null check (kind in ('write_through_row_column', 'backfill_batch')),
  role             text        not null,
  application_name text        not null,
  events           bigint      not null default 0,
  first_at         timestamptz not null default now(),
  last_at          timestamptz not null default now(),
  constraint t13_row_column_events_pkey primary key (day, table_ref, kind, role, application_name)
);
alter table ops.t13_row_column_events enable row level security;
revoke all on ops.t13_row_column_events from public, anon, authenticated;
comment on table ops.t13_row_column_events is
  'T-13 phase 3: every write still arriving through the retiring row column (counted by the dual-write '
  'trigger) and every backfill batch, per day, table, role and application. Phase 7 needs zero writes '
  'through the row column across one full release. Server-only.';

create table ops.t13_backfill_ledger (
  table_ref   text        not null,
  id          uuid        not null,
  column_name text        not null check (column_name in ('published_to_web', 'shown_to')),
  set_at      timestamptz not null default now(),
  constraint t13_backfill_ledger_pkey primary key (table_ref, column_name, id)
);
alter table ops.t13_backfill_ledger enable row level security;
revoke all on ops.t13_backfill_ledger from public, anon, authenticated;
comment on table ops.t13_backfill_ledger is
  'T-13 phase 3.3: the id of every row the backfill changed and which column — the rollback''s id list '
  '(published_to_web back to false; shown_to back to null). Server-only; dropped at phase 7.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values
  ('t13_row_column_events', 'ops', 't13_row_column_events', 'T-13 row column events', 1, false, false, true,
   'T-13 phase 3 counters: writes through the retiring row column, backfill batches.',
   false, false, false, 'system', false, 'machinery',
   'Server-only campaign counter; no client lane. Written only by the T-13 transitional functions.',
   'table', 'organization',
   'System machinery has no client lane; it holds counts, table names and role names, no records.',
   'organization', 'standard', 'system',
   'Access-ladder T-13 phase 3: the dual-write counter the contract gate reads.',
   false, false, 'ops.t13_row_column_events'::regclass),
  ('t13_backfill_ledger', 'ops', 't13_backfill_ledger', 'T-13 backfill ledger', 1, false, false, true,
   'T-13 phase 3.3 rollback id list.',
   false, false, false, 'system', false, 'machinery',
   'Server-only campaign ledger; no client lane. Written only by the T-13 backfill.',
   'table', 'organization',
   'System machinery has no client lane; it holds table names and row ids, no content.',
   'organization', 'standard', 'system',
   'Access-ladder T-13 phase 3.3: the backfill''s rollback id list.',
   false, false, 'ops.t13_backfill_ledger'::regclass)
on conflict (token) do nothing;

-- ── transitional list: the campaign's phase-3 machinery (counted and expiring) ─────────────────
CREATE OR REPLACE FUNCTION platform._t13_allowlist(p_which text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case p_which
    when 'closed_table_columns' then array[
      'browser.authenticator_window.{V}',
      'browser.profile.{V}',
      'browser.profile_checkpoint.{V}',
      'browser.stream_ticket.{V}',
      'chat.agent_memory.{V}',
      'chat.coding_session.{V}',
      'chat.conversation.{V}',
      'chat.user_request.{V}',
      'communication.calendar_event.{V}',
      'communication.dm_conversations.{V}',
      'communication.notification.{V}',
      'communication.sms_conversations.{V}',
      'custom.record_p00.shown_to',
      'custom.record_p00.{V}',
      'custom.record_p01.shown_to',
      'custom.record_p01.{V}',
      'custom.record_p02.shown_to',
      'custom.record_p02.{V}',
      'custom.record_p03.shown_to',
      'custom.record_p03.{V}',
      'custom.record_p04.shown_to',
      'custom.record_p04.{V}',
      'custom.record_p05.shown_to',
      'custom.record_p05.{V}',
      'custom.record_p06.shown_to',
      'custom.record_p06.{V}',
      'custom.record_p07.shown_to',
      'custom.record_p07.{V}',
      'custom.record_p08.shown_to',
      'custom.record_p08.{V}',
      'custom.record_p09.shown_to',
      'custom.record_p09.{V}',
      'custom.record_p10.shown_to',
      'custom.record_p10.{V}',
      'custom.record_p11.shown_to',
      'custom.record_p11.{V}',
      'custom.record_p12.shown_to',
      'custom.record_p12.{V}',
      'custom.record_p13.shown_to',
      'custom.record_p13.{V}',
      'custom.record_p14.shown_to',
      'custom.record_p14.{V}',
      'custom.record_p15.shown_to',
      'custom.record_p15.{V}',
      'education.assessment_result.{V}',
      'education.item_mastery.shown_to',
      'education.item_mastery.{V}',
      'education.study_attempt.shown_to',
      'education.study_attempt.{V}',
      'education.study_plan_block.{V}',
      'education.study_plan_day.{V}',
      'education.study_session.shown_to',
      'education.study_session.{V}',
      'esign.provider.{V}',
      'esign.signing_key.{V}',
      'files.uploads_inflight.{V}',
      'hr.access_audit.{V}',
      'hr.accommodation_request.{V}',
      'hr.ai_evidence.{V}',
      'hr.background_check.{V}',
      'hr.candidate.{V}',
      'hr.compensation.{V}',
      'hr.corrective_action.{V}',
      'hr.eeo_response.{V}',
      'hr.emergency_contact.{V}',
      'hr.employee_private.{V}',
      'hr.employment.{V}',
      'hr.employment_pin.{V}',
      'hr.i9.{V}',
      'hr.incident.{V}',
      'hr.kiosk_session.{V}',
      'hr.leave_case.{V}',
      'hr.legal_hold.{V}',
      'hr.offer.{V}',
      'hr.recalculation_batch.{V}',
      'hr.records_request.{V}',
      'hr.reference_check.{V}',
      'hr.restricted_note.{V}',
      'hr.separation.{V}',
      'hr.tax_withholding.{V}',
      'hr.verification_letter_request.{V}',
      'hr.workflow_instance.{V}',
      'iam.access_audit.shown_to',
      'iam.access_audit.{V}',
      'legal.wc_claim.{V}',
      'platform.actor_session.{V}',
      'platform.actor_token.{V}',
      'seo.gsc_dig_rule.{V}',
      'seo.starter_pack_item.{V}',
      'transcripts.studio_sessions.shown_to',
      'transcripts.studio_sessions.{V}',
      'users.user_memory.{V}'
    ]::text[]
    when 'readers' then array[
      'function agent._enforce_builtin_system_org()',
      'function agent.create_review_thread()',
      'function agent.public_card_rows()',
      'function billing._spend_guardrail_validate()',
      'function billing.plan_status(uuid)',
      'function campaign_watch.share_cutover_plan(integer)',
      'function canvas.record_canvas_view(uuid,uuid,text,text)',
      'function canvas.set_canvas_like(uuid,boolean,uuid)',
      'function canvas.submit_canvas_score(uuid,integer,integer,boolean,uuid,integer,jsonb)',
      'function communication._task_assignment_outbox()',
      'function communication.calendar_event_legacy_collision_guard()',
      'function communication.enqueue_task_sms_reminder_for_user(uuid,uuid,text,text)',
      'function communication.meet_meeting_by_slug(text)',
      'function communication.meet_record_consent(uuid,text,timestamp with time zone)',
      'function communication.notify_from_sql(uuid,text,uuid,text,text,jsonb,text,text,uuid,text)',
      'function content._capture_version()',
      'function content._document_bump_content_version()',
      'function content._document_guard_data_class()',
      'function content._document_version_immutable()',
      'function content.annotation_create(uuid,uuid,text,uuid,text,text,jsonb,text)',
      'function content.document_get(uuid,boolean)',
      'function content.document_origin(uuid)',
      'function content.is_publicly_readable(content.document)',
      'function content.type_settings(text,uuid)',
      'function content_ir.admin_upsert_kind_content_block(uuid,text,text,text,text,text,jsonb)',
      'function content_ir.evaluate_kind_activation(uuid)',
      'function context.named_system_context_items(text[])',
      'function crm.ensure_user_party_in_org(uuid,uuid,text,boolean)',
      'function crm.upsert_party_phone_contact(uuid,uuid,text,text,text,text,uuid,timestamp with time zone,jsonb)',
      'function custom._checklist_run_visible(uuid,uuid,jsonb)',
      'function custom._context_side_effects(jsonb)',
      'function custom._ctx_store_scope(uuid,uuid,uuid,jsonb)',
      'function custom._field_reads_what_it_reads()',
      'function custom._inbox_items(uuid,uuid,boolean)',
      'function custom._portal_config_judge(uuid,uuid[],jsonb,jsonb)',
      'function custom._portal_picture_url(uuid,uuid,boolean)',
      'function custom._read_record_with(uuid,uuid,boolean,jsonb,jsonb)',
      'function custom._record_rule_uses()',
      'function custom._value_envelope()',
      'function custom._where_ids_open_with(uuid[],uuid,jsonb)',
      'function custom._words_for(uuid,uuid,jsonb,text,integer)',
      'function custom.addressed_cap_specific(uuid,text,uuid,uuid,uuid)',
      'function custom.agg_deliver(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
      'function custom.agg_digest_assemble(uuid,uuid,timestamp with time zone,timestamp with time zone)',
      'function custom.agg_view_admits(uuid,uuid,uuid)',
      'function custom.anon_capture(uuid,text,uuid,jsonb,text,timestamp with time zone)',
      'function custom.anon_publish(uuid,uuid,boolean)',
      'function custom.anon_submissions(uuid,uuid,text,integer,integer)',
      'function custom.anon_token_issue(uuid,text,jsonb,uuid,uuid,uuid,timestamp with time zone)',
      'function custom.assert_client_may_change(uuid,uuid,text,public.permission_level,text)',
      'function custom.assert_client_may_open(uuid,uuid,text,public.permission_level,text)',
      'function custom.assert_may_know_table(uuid,uuid,text)',
      'function custom.bump_epoch(text,uuid,uuid)',
      'function custom.cache_lookup(text,uuid,text,uuid)',
      'function custom.capture_open(uuid,uuid)',
      'function custom.capture_sheets(uuid,uuid)',
      'function custom.capture_submit(uuid,uuid,text,jsonb,jsonb,text,timestamp with time zone,jsonb)',
      'function custom.carrying_edges_of(text,uuid)',
      'function custom.checklist_run(uuid,uuid)',
      'function custom.checklist_template_shape(uuid,uuid)',
      'function custom.checklist_templates(uuid,uuid,integer)',
      'function custom.choice_census(uuid,uuid)',
      'function custom.comment_mention_deliver(uuid,uuid,uuid,uuid,uuid,text,text,text)',
      'function custom.conversation_scope(uuid,uuid)',
      'function custom.conversation_scope_bind(uuid,uuid,uuid)',
      'function custom.dashboard_run(uuid,uuid,jsonb,jsonb,text)',
      'function custom.dashboard_stuck(uuid,uuid,text,integer,jsonb,integer,text)',
      'function custom.dashboards(uuid,uuid)',
      'function custom.data_home_items(uuid)',
      'function custom.data_home_tables(uuid)',
      'function custom.doors_not_deciding_the_caller()',
      'function custom.doors_not_deciding_the_record()',
      'function custom.doors_not_on_one_ladder()',
      'function custom.effective_level(uuid,uuid,uuid,text)',
      'function custom.external_tier_contract()',
      'function custom.field_choice_usage(uuid,uuid)',
      'function custom.field_context_policy_floor(uuid,jsonb,uuid)',
      'function custom.has_{V}_at(uuid,text,uuid,public.permission_level,uuid,bigint)',
      'function custom.hub_changed_by(uuid,text,uuid[])',
      'function custom.io_restore(uuid,uuid,integer)',
      'function custom.io_restore(uuid,uuid,integer,jsonb)',
      'function custom.io_revisions(uuid,uuid)',
      'function custom.levels_of(uuid,uuid[])',
      'function custom.list_door_disagreements(text,uuid,integer,boolean)',
      'function custom.list_portals(uuid,text)',
      'function custom.may_invite_outside(uuid,uuid)',
      'function custom.member_personal_tables(uuid,uuid)',
      'function custom.migrate_reparent(uuid,uuid,uuid,text)',
      'function custom.migrations(uuid,uuid,integer)',
      'function custom.my_level(uuid,uuid,text)',
      'function custom.per_value_access_words()',
      'function custom.pipeline_pending(uuid,uuid)',
      'function custom.portal_admits(uuid,uuid)',
      'function custom.portal_card(uuid,uuid)',
      'function custom.portal_tables(uuid)',
      'function custom.portals(uuid)',
      'function custom.promote_table(uuid,uuid)',
      'function custom.query_can_see(uuid,uuid,text)',
      'function custom.query_hot_paths()',
      'function custom.query_record_as_of(uuid,uuid,timestamp with time zone,date,text)',
      'function custom.query_rollup(uuid,uuid[],text,text,integer,text)',
      'function custom.query_{V}_parity(uuid)',
      'function custom.query_visible_ids(uuid,uuid,text)',
      'function custom.reaches_directly(uuid,text,uuid,public.permission_level)',
      'function custom.read_door_carried_ids(uuid,uuid,uuid,public.permission_level)',
      'function custom.read_door_parity(uuid,uuid,uuid,public.permission_level,integer)',
      'function custom.read_record(uuid,uuid,boolean)',
      'function custom.read_records(uuid,uuid,boolean,integer,integer)',
      'function custom.read_records_archived(uuid,uuid,text,boolean,integer,integer)',
      'function custom.read_records_by_ids(uuid,uuid,uuid[],boolean)',
      'function custom.read_records_matching(uuid,uuid,jsonb,boolean,integer,integer)',
      'function custom.record_card(uuid,uuid,uuid)',
      'function custom.record_reparent(uuid,uuid,uuid)',
      'function custom.record_table(uuid,uuid)',
      'function custom.relation_own(uuid,uuid,uuid)',
      'function custom.relation_target_card(uuid,uuid,text)',
      'function custom.required_epoch(text,uuid,text,uuid)',
      'function custom.row_sits_in_a_personal_table(text,uuid,uuid)',
      'function custom.rule_eval(uuid,jsonb,jsonb,jsonb)',
      'function custom.scope_member_reaches(uuid,uuid,public.permission_level)',
      'function custom.share_access(uuid,uuid)',
      'function custom.share_lane_set(uuid,uuid,text,public.permission_level)',
      'function custom.shared_only_disagreements(text)',
      'function custom.subscription_mute(uuid,uuid,boolean)',
      'function custom.subscription_preview(uuid,uuid)',
      'function custom.subscriptions(uuid,uuid)',
      'function custom.table_carries_its_rows(uuid,uuid,public.permission_level)',
      'function custom.table_copy_evaluation_state(uuid)',
      'function custom.table_facts(uuid)',
      'function custom.table_has_a_visible_record(uuid,uuid,uuid)',
      'function custom.table_list_everywhere(uuid)',
      'function custom.table_move(uuid,uuid,integer)',
      'function custom.table_transfer_owner(uuid,uuid,text)',
      'function custom.tables_at_home(uuid,uuid[])',
      'function custom.tables_described_without_asking()',
      'function custom.tables_i_can_open()',
      'function custom.trg_associations_bump_{V}()',
      'function custom.value_envelope_refusal(jsonb)',
      'function custom.view_declare(uuid,uuid,jsonb)',
      'function custom.view_look_set(uuid,uuid,uuid,jsonb)',
      'function custom.view_record_order_set(uuid,uuid,uuid[])',
      'function custom.{V}_as_of(uuid,uuid,timestamp with time zone)',
      'function custom.{V}_cache_rebuild()',
      'function custom.{V}_parity()',
      'function custom.{V}_warm(text,uuid)',
      'function custom.visible_predicate_sql(uuid,uuid,uuid,public.permission_level,text)',
      'function custom.visible_record_ids(uuid,public.permission_level)',
      'function custom.visible_set(uuid,uuid,uuid,public.permission_level)',
      'function custom.where_lists_live(uuid[])',
      'function custom.where_tables_live(uuid[])',
      'function custom.whole_value_complete(uuid,uuid,text,uuid)',
      'function custom.whole_value_park(uuid,uuid,uuid,uuid,platform.{V},jsonb,jsonb)',
      'function custom.whole_values_waiting(uuid,uuid[])',
      'function custom.work_approval_request(uuid,uuid,jsonb,text,uuid,text,uuid)',
      'function custom.work_list(uuid,text,boolean,integer,integer)',
      'function custom.work_templates(uuid,integer)',
      'function docproc.page_extraction_job_{V}_from_source()',
      'function docproc.processed_document_{V}_from_origin()',
      'function education.assessment_list_facets(text,text,uuid,text,jsonb,text)',
      'function education.assessment_list_match(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,text,text,text,text,text,text,uuid,text,jsonb,text,text)',
      'function education.assessment_list_scoped(text,text,uuid,text,jsonb,text,text,boolean,integer,integer)',
      'function education.fc_set_list_facets(text,uuid,text,jsonb,text)',
      'function education.fc_set_list_match(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,text,text,uuid[],text,uuid,text,jsonb,text,text)',
      'function education.fc_set_list_scoped(text,uuid,text,jsonb,text,text,boolean,integer,integer)',
      'function files._adopt_chat_attachment_ids(uuid,uuid[])',
      'function files._adopt_chat_output_ids(uuid,uuid[])',
      'function files.crawl_variant_tagging_drift()',
      'function files.private_children_missing_parent()',
      'function files.reject_web_artifact_file_mutation()',
      'function history.capture_is_open(uuid)',
      'function history.who_could_see(uuid,uuid,timestamp with time zone)',
      'function hr._desired_grants_for_employment(uuid,date)',
      'function hr._desired_grants_for_requisition(uuid,date)',
      'function hr._l1_is_manager_of(uuid,uuid,date)',
      'function hr._l1_notify_consent_requested(uuid)',
      'function hr._punch_notify_edited(uuid,uuid,uuid,uuid,text,uuid,jsonb)',
      'function hr._run_fixture_probe(text,jsonb)',
      'function hr._wf_notify(uuid,uuid,text,text,uuid,uuid,jsonb)',
      'function hr._wf_project_step(uuid)',
      'function hr.access_explain(uuid,text,uuid)',
      'function hr.capability(uuid,text,uuid,date,uuid)',
      'function hr.earning_code_seed_org(uuid)',
      'function hr.org_jurisdiction_rule_save(uuid,jsonb,boolean)',
      'function hr.org_jurisdiction_rule_set_applies(uuid,text,text,boolean,text)',
      'function hr.punch_register(jsonb,jsonb)',
      'function hr.wf_instance(uuid)',
      'function iam._agent_open_to_every_member(uuid,uuid)',
      'function iam._apply_rls_unchecked(text,text,text,text)',
      'function iam._dd171_containment_filter(boolean,text,text)',
      'function iam._discovery_class_selftest_once()',
      'function iam._notify_door(uuid,text,uuid,jsonb,uuid,text,text)',
      'function iam._reach_node_lanes(uuid,uuid[],uuid[],text[],uuid[])',
      'function iam._record_access_audit(uuid,text,text,text,text,text,boolean,uuid[],integer,uuid,text,text,uuid,uuid,timestamp with time zone,boolean,uuid,uuid)',
      'function iam.access_arms_from_sources(uuid,uuid,text,uuid,uuid)',
      'function iam.accessible_entity_ids(text,public.permission_level,integer,boolean)',
      'function iam.admin_policy_findings(regclass)',
      'function iam.apply_config_rls(text,text)',
      'function iam.apply_rls(text,text,text,text)',
      'function iam.apply_table_grants(text,text,text)',
      'function iam.assoc_side_readable(text,uuid)',
      'function iam.children_with_own_read_arms()',
      'function iam.class_allows(text,text,uuid)',
      'function iam.class_lanes(text)',
      'function iam.discoverable_ids(uuid,text,public.permission_level,integer,boolean)',
      'function iam.entity_read_expr(text,text,text,text)',
      'function iam.entity_read_kernel_members_expected()',
      'function iam.entity_read_lane_preflight()',
      'function iam.external_principal_reach(text,uuid)',
      'function iam.generated_policy_names()',
      'function iam.governance_columns(text)',
      'function iam.has_access_for_base(uuid,text,uuid,public.permission_level,boolean,text[])',
      'function iam.is_discoverable_base(uuid,text,uuid,public.permission_level,boolean)',
      'function iam.lane_of(text,uuid)',
      'function iam.legacy_column_worklist()',
      'function iam.may_manage_sharing_as(uuid,text,uuid)',
      'function iam.member_default_level(uuid,uuid)',
      'function iam.member_default_level_as_of(uuid,uuid,timestamp with time zone)',
      'function iam.member_lane_confers(uuid,uuid,text,uuid,uuid,boolean)',
      'function iam.member_lane_open(uuid)',
      'function iam.member_lane_open_as_of(uuid,timestamp with time zone)',
      'function iam.member_level_justified(uuid,uuid,uuid)',
      'function iam.membership_row_visible(uuid)',
      'function iam.org_lane_{V}_sql(text,text)',
      'function iam.realtime_field_exposure()',
      'function iam.record_visible_in_org(uuid,uuid,uuid,platform.{V},uuid,public.permission_level)',
      'function iam.table_has_{V}(text,text)',
      'function iam.verify_canonical(text,text,text,text)',
      'function iam.world_publish_announcement(text,uuid)',
      'function interview._decision_answer_notify()',
      'function legal._bridge_wc_claim_is_public()',
      'function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean)',
      'function mandate._member_list_seat(uuid,uuid,text,text[],uuid,uuid,uuid[])',
      'function mandate._member_scope_ok(text,text,uuid,uuid,uuid,uuid,uuid,boolean,boolean,text)',
      'function mandate.duplicate_mandate(uuid,boolean,uuid)',
      'function mandate.guard_binding_containment()',
      'function mandate.reference_head()',
      'function mandate.vw_shortcut_write()',
      'function mandate.workflow_holder_runnable(text,uuid,uuid,uuid)',
      'function ops.check_items_apply_run(uuid,jsonb,text,text,boolean)',
      'function ops.check_run_record(uuid,jsonb)',
      'function platform._admin_read_follows_rls()',
      'function platform._cutover_copy_resync(uuid,uuid,uuid)',
      'function platform._ddl_guard()',
      'function platform._enforce_category_two_levels()',
      'function platform._entity_types_classify_default()',
      'function platform._provision_shape_guard_impl(jsonb)',
      'function platform._published_to_web_sql(boolean,boolean)',
      'function platform._search_item_put(text,uuid,uuid,uuid,platform.{V},text,text,text[],timestamp with time zone,text,text)',
      'function platform._share_registry_class_interlock()',
      'function platform._store_pick_list_document(uuid,uuid,text)',
      'function platform.action_request_remint(text,text,timestamp with time zone)',
      'function platform.count_items(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone)',
      'function platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[],platform.data_class,platform.list_scope)',
      'function platform.defaults_that_lock_people_out()',
      'function platform.definer_access_decision_regex()',
      'function platform.derive_data_class(text,text)',
      'function platform.detail_parent_access_for(uuid,text,uuid,public.permission_level)',
      'function platform.detail_readable_parents(text)',
      'function platform.edge_structural_metadata_keys()',
      'function platform.enforce_retention_policy_settling()',
      'function platform.entity_default_{V}(text)',
      'function platform.entity_link_shareable(text)',
      'function platform.entity_row_access_attrs(text,text,uuid)',
      'function platform.held_by_its_organization(text,uuid,integer)',
      'function platform.kernel_equivalence_answers()',
      'function platform.materialize_library_rulebook(uuid,uuid,uuid,jsonb)',
      'function platform.memo_reach_tables()',
      'function platform.module_config(uuid,text)',
      'function platform.partitioned_row_attrs(text,text,uuid)',
      'function platform.provision(jsonb,text,uuid,text)',
      'function platform.provision_base_columns()',
      'function platform.provision_options(text,uuid)',
      'function platform.provision_selfcheck(boolean)',
      'function platform.provision_spec_grandfather_seed()',
      'function platform.provision_validate(jsonb,text,uuid)',
      'function platform.relation_label(uuid,text,uuid)',
      'function platform.relations_from(uuid,uuid)',
      'function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text)',
      'function platform.search_engine_indexed(text,text)',
      'function platform.search_engine_indexed_records(text,integer)',
      'function platform.search_item_backfill(text,uuid,integer)',
      'function platform.search_item_sections(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone,integer,jsonb)',
      'function platform.search_items(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone,integer,text)',
      'function platform.set_shown_to(text,uuid,text)',
      'function platform.shown_to_lists(platform.shown_to,platform.{V},uuid,uuid,uuid,jsonb)',
      'function platform.shown_to_state(text,uuid)',
      'function platform.static_row_probe_spec()',
      'function platform.static_row_probe_sql()',
      'function platform.tag_scope_id(uuid,text,uuid)',
      'function private.sweep_marketing_finding_assists()',
      'function public.__scope_access_membrane_conformance()',
      'function public._saved_view_json(platform.saved_view)',
      'function public._trash_kind_rows(uuid,uuid,uuid,text[],integer,integer)',
      'function public._trash_store_children(uuid,uuid,uuid,text,integer)',
      'function public.access_denied_context(text,uuid)',
      'function public.access_request_blind(text,uuid,text,text)',
      'function public.admin_access_planner_snapshot(text)',
      'function public.admin_configure_entity_access(text,text,text,text,text,text,text,text)',
      'function public.admin_door_probe(uuid,integer)',
      'function public.admin_entity_types_list()',
      'function public.admin_exposure_audit_rows(text,text,text,boolean,integer,integer)',
      'function public.admin_exposure_audit_summary()',
      'function public.admin_list_share_policies()',
      'function public.admin_set_containment_edge(text,text,text,boolean,text)',
      'function public.admin_upsert_entity_type(text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,text,boolean,text,boolean,boolean,boolean,text,boolean,text,boolean,text,text,text)',
      'function public.agx_create_agent_from_template(uuid)',
      'function public.agx_duplicate_shortcut(uuid,uuid)',
      'function public.agx_duplicate_shortcut_m(uuid,uuid)',
      'function public.agx_get_access_level(uuid)',
      'function public.agx_get_list_full()',
      'function public.agx_list_facets(text,uuid,text,boolean,text)',
      'function public.agx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function public.can_read_processed_document(uuid,uuid)',
      'function public.can_read_processed_document_any(uuid,uuid)',
      'function public.can_view_chat_conversation(uuid,uuid)',
      'function public.cat_archive(text,uuid)',
      'function public.cat_list(text)',
      'function public.cat_write(text,uuid,uuid,text,text,boolean,uuid,boolean,text,boolean,text,boolean,integer,boolean,text,boolean,jsonb,boolean)',
      'function public.checklist_run_save(uuid,uuid,jsonb,integer,boolean,timestamp with time zone,boolean,timestamp with time zone)',
      'function public.cmt_mention_notify(uuid,uuid[],text)',
      'function public.conversation_shared_room_notice(uuid)',
      'function public.conversations_exist(uuid[])',
      'function public.creator_public_handles()',
      'function public.creator_public_page(text)',
      'function public.creator_resolve_featured_resource(text,uuid)',
      'function public.creator_set_public(boolean)',
      'function public.crm_list_scope_counts(text,text,text)',
      'function public.crm_list_scope_counts(text,text,text,text)',
      'function public.cvx_deep_hits(text)',
      'function public.cvx_list_facets(text,uuid,text,boolean,text)',
      'function public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function public.cx_fork_conversation(uuid,smallint)',
      'function public.edu_learn_doc_delete(uuid)',
      'function public.edu_learn_doc_set_status(uuid,boolean)',
      'function public.edu_library_facets(text,text)',
      'function public.edu_library_list_scoped(text,text,text,text,jsonb,integer,integer)',
      'function public.edu_library_scope_rows(text)',
      'function public.edu_public_decks(text,boolean,integer,text)',
      'function public.entity_access_summary(text,uuid)',
      'function public.flexible_data_archive(uuid,uuid)',
      'function public.flexible_data_write(uuid,jsonb,uuid)',
      'function public.fork_shared_conversation(uuid,uuid,text)',
      'function public.fork_shared_flashcard_set(uuid,uuid,text)',
      'function public.fork_shared_quiz(uuid,uuid,text)',
      'function public.get_aga_public_data(text,uuid)',
      'function public.get_aga_public_execution(uuid)',
      'function public.get_agent_core_batch(uuid[],text[])',
      'function public.get_agent_operational(uuid,text)',
      'function public.get_agent_public(uuid)',
      'function public.get_agents_for_chat(integer,uuid)',
      'function public.get_conversation_for_display(uuid)',
      'function public.get_notes_shared_with_me()',
      'function public.get_prompt_app_execution_payload(uuid)',
      'function public.get_prompt_app_public_data(text,uuid)',
      'function public.get_public_flashcard_set(uuid)',
      'function public.get_published_app_with_prompt(text,uuid)',
      'function public.get_resource_access(text,uuid)',
      'function public.get_share_capabilities(text)',
      'function public.get_structured_list_for_selection(uuid)',
      'function public.get_tools_list(boolean)',
      'function public.get_user_feed(uuid,integer,integer)',
      'function public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
      'function public.get_user_list_with_items(uuid)',
      'function public.get_user_tables()',
      'function public.hr_activate_employer(jsonb)',
      'function public.hr_break_glass(text,uuid,text,text)',
      'function public.hr_employee_profile(uuid,date)',
      'function public.hr_my_context(uuid)',
      'function public.ivw_list_facets(text,uuid,text)',
      'function public.ivw_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)',
      'function public.make_resource_private(text,uuid)',
      'function public.make_resource_public(text,uuid)',
      'function public.mkt_initiative_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.mnd_member_list(text,text,text,uuid,uuid,text,jsonb,text,text,integer,integer)',
      'function public.org_admin_reassign_member_resources(uuid,uuid,uuid,text[])',
      'function public.org_admin_take_over_account(uuid,uuid,text,text,text)',
      'function public.org_admin_take_over_member_records(uuid,uuid,text,text,uuid)',
      'function public.org_null_ratchet_snapshot()',
      'function public.org_trash_restore(uuid,text,uuid)',
      'function public.provision_mcp_server(text,text,text,public.mcp_server_category,public.mcp_transport,public.mcp_auth_strategy,uuid,text,text,text,text,text,text,public.mcp_server_status,boolean,text[])',
      'function public.rag_user_can_see_note(uuid)',
      'function public.reference_search_candidates(text,text,integer,uuid[])',
      'function public.rsx_list_scoped(text,uuid,text,text,text,jsonb,integer,integer,text)',
      'function public.rulebook_archive(uuid)',
      'function public.rulebook_create(uuid,text,text,text,jsonb,jsonb,text,jsonb)',
      'function public.rulebook_meta_set(uuid,text,text,boolean,jsonb,text,text)',
      'function public.rulebook_save(uuid,integer,jsonb,jsonb,jsonb)',
      'function public.rulebook_tension_settle(uuid,integer,text,text,text,jsonb)',
      'function public.saved_view_save(text,uuid,uuid,uuid,text,text,boolean,jsonb,integer,text,boolean,numeric,boolean,integer)',
      'function public.search_files(uuid,text,integer,integer,text)',
      'function public.seo_rank_target_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)',
      'function public.shape_doctor_gather(text)',
      'function public.shx_list_facets(text,uuid,text,boolean)',
      'function public.shx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.store_door_lane(text,uuid)',
      'function public.tool_register_mcp_discovered(uuid,jsonb)',
      'function public.trx_list_facets(text,uuid,text,boolean)',
      'function public.trx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.udt_list_example_tables()',
      'function public.update_all_trending_scores()',
      'function public.update_user_list(uuid,character varying,text,boolean,boolean,boolean,jsonb)',
      'function public.wfx_list_facets(text,uuid,text,boolean,text)',
      'function public.wfx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function rag._recall_predicate_sql(jsonb)',
      'function scraper._scrape_parsed_page_owner_is_the_personal_creator()',
      'function scraper.scrape_parsed_page_{V}_stated()',
      'function seo._ensure_site_dimension(uuid,text,text,text,text)',
      'function seo._ensure_value(uuid,text,text,jsonb)',
      'function seo._tm_is_a_place(uuid,text,text)',
      'function seo.facet_dimension_seed_abstain(uuid,uuid,boolean,uuid)',
      'function seo.facet_dimension_upsert(text,text,text,uuid,text,text)',
      'function seo.facet_value_upsert(text,text,text,text,uuid,integer)',
      'function seo.fn_evaluate_condition_matchers(uuid,uuid[],uuid,date,date)',
      'function seo.fn_evaluate_matchers_internal(uuid,uuid[],text)',
      'function seo.gsc_quick_add_value(uuid,text,uuid,text,text,text)',
      'function seo.gsc_set_keyword_class(uuid,uuid[],text,text,text,uuid,boolean)',
      'function seo.gsc_set_keyword_stamps(uuid,uuid[],uuid,text,boolean)',
      'function seo.gsc_topic_delete(uuid,uuid,uuid)',
      'function seo.keyword_facet_set(uuid[],text,text,text,uuid,smallint,text,boolean)',
      'function seo.stamp_keyword_places(uuid[],text)',
      'function seo.starter_pack_from_proposal(jsonb,uuid,jsonb,uuid[])',
      'function seo.starter_pack_item_save(jsonb)',
      'function seo.starter_pack_new_version(uuid,text)',
      'function seo.starter_pack_save(jsonb)',
      'function web.assert_crawl_artifact_file(uuid,uuid,uuid,uuid,text)',
      'function web.assert_crawl_artifact_file_reused(uuid,uuid,uuid,text)',
      'function web.create_site(uuid,text,text,text,jsonb,jsonb,platform.{V},uuid)',
      'function workbench._bridge_legacy_owner()',
      'function workbench.dataset_readable_by(uuid,uuid)',
      'function workbench.udt_dataset_access(uuid,public.permission_level)',
      'function workflow.public_card_rows()',
      'policy transcripts.studio_cleaned_segments / studio_cleaned_segments_public_read',
      'policy transcripts.studio_concept_items / studio_concept_items_public_read',
      'policy transcripts.studio_module_segments / studio_module_segments_public_read',
      'policy transcripts.studio_raw_segments / studio_raw_segments_public_read',
      'policy transcripts.studio_session_settings / studio_session_settings_public_read',
      'view agent.card',
      'view agent.context_menu_view',
      'view agent.mandate_exemplar',
      'view agent.menu_surface',
      'view campaign_watch.dual_engine_exit',
      'view chat.admin_conversation_summary',
      'view chat.conversation_summary',
      'view custom."table"',
      'view custom.doc_template',
      'view custom.external_record',
      'view custom.field',
      'view custom.merge_field',
      'view custom.rule',
      'view hr.v_access_audit',
      'view hr.v_compensation_current',
      'view iam.definer_class_census',
      'view mandate.context_menu_view',
      'view mandate.reference_latest_deployed',
      'view mandate.vw_shortcut',
      'view platform.v_lifecycle_registry_drift',
      'view workflow.card',
      'view workflow.v_definition_catalog'
    ]::text[]
    -- Counted and expiring: the campaign's phase-3 machinery that must read the column. Added only
    -- by access_ladder_t13_* migrations, named platform._t13_transitional_*; empty after contract.
    when 'transitional' then array[
      'function platform._t13_transitional_dual_write()',
      'function platform._t13_transitional_targets()',
      'function platform._t13_transitional_expand(regclass)',
      'function platform._t13_transitional_backfill(regclass,integer)'
    ]::text[]
    -- The last day a transitional reader is admitted (PLAN.md §2.5). Only ever moves earlier.
    when 'transitional_expires' then array['2026-12-15']::text[]
  end
$function$;


-- ── 3.1 targets and expand ─────────────────────────────────────────────────────────────────────
create or replace function platform._t13_transitional_targets()
returns setof regclass
language sql
stable
set search_path to 'pg_catalog'
as $$
  -- Organization and Public tables (never Private, Confidential or a child) that carry the retiring
  -- row column. Plain tables only: custom.record (partitioned) is the custom data system's (PLAN §2.3).
  select et.table_ref
    from platform.entity_types et
    join pg_class c on c.oid = et.table_ref
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'visibility' and not a.attisdropped
   where et.data_class in ('organization', 'public')
     and not et.is_component
     and c.relkind = 'r'
     and not c.relispartition
   order by pg_total_relation_size(c.oid), et.table_ref::text
$$;
revoke all on function platform._t13_transitional_targets() from public, anon, authenticated;
comment on function platform._t13_transitional_targets() is
  'T-13 phase 3 (TRANSITIONAL, expires 2026-12-15): the Organization and Public tables that carry the retiring row column, smallest first.';

create or replace function platform._t13_transitional_dual_write()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
-- T-13 phase 3.2 (TRANSITIONAL, expires 2026-12-15). TG_ARGV[0] = 'shown_to' when the table carries it.
declare
  v_has_shown   boolean := tg_nargs > 0 and tg_argv[0] = 'shown_to';
  v_vis_changed boolean;
  v_ptw_changed boolean;
  v_counted     boolean := false;
  v_key         text := 't13w.r' || tg_relid::text;
begin
  if tg_op = 'INSERT' then
    if new.published_to_web then
      if new.visibility = 'personal' then
        raise exception 't13_row_column_disagrees: % insert says published to the web and personal at once', tg_table_schema || '.' || tg_table_name
          using errcode = 'check_violation',
                hint = 'Publish to the web with published_to_web alone; "only me" is shown_to (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.visibility := 'public';
      new.published_to_web_at := coalesce(new.published_to_web_at, now());
      new.published_to_web_by := coalesce(new.published_to_web_by, auth.uid());
    elsif new.visibility = 'public' then
      new.published_to_web := true;
      new.published_to_web_at := null;
      new.published_to_web_by := null;
      v_counted := true;
    elsif new.visibility in ('personal', 'link') then
      v_counted := true;
    end if;
    if v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  else
    v_vis_changed := new.visibility is distinct from old.visibility;
    v_ptw_changed := new.published_to_web is distinct from old.published_to_web;
    if v_vis_changed and v_ptw_changed then
      if (new.visibility = 'public') is distinct from new.published_to_web then
        raise exception 't13_row_column_disagrees: % row % changes both web states and they disagree (% / published_to_web %)',
            tg_table_schema || '.' || tg_table_name, new.id, new.visibility, new.published_to_web
          using errcode = 'check_violation',
                hint = 'Write published_to_web alone; the retiring row column is derived from it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := auth.uid();
      v_counted := true;
    elsif v_vis_changed then
      if new.visibility = 'public' and not new.published_to_web and old.published_to_web_at is not null then
        raise exception 't13_stale_row_column_write: % row % was taken off the web through published_to_web; a write through the retiring row column cannot put it back',
            tg_table_schema || '.' || tg_table_name, new.id
          using errcode = 'check_violation',
                hint = 'This is a stale full-row write. Re-read the row and set published_to_web = true to publish it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      if new.published_to_web is distinct from (new.visibility = 'public') then
        new.published_to_web := (new.visibility = 'public');
        new.published_to_web_at := null;
        new.published_to_web_by := null;
      end if;
      v_counted := true;
    elsif v_ptw_changed then
      if new.published_to_web then
        new.visibility := 'public';
      elsif old.visibility = 'public' then
        new.visibility := 'internal';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := auth.uid();
    elsif new.published_to_web is distinct from (new.visibility = 'public') then
      -- Not yet backfilled: heal the derived column from the source of truth (before the switch).
      new.published_to_web := (new.visibility = 'public');
    end if;
    if v_vis_changed and v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  end if;
  if v_counted then
    perform set_config(v_key, (coalesce(nullif(current_setting(v_key, true), ''), '0')::bigint + 1)::text, true);
  end if;
  return new;
end
$$;
revoke all on function platform._t13_transitional_dual_write() from public, anon, authenticated;
comment on function platform._t13_transitional_dual_write() is
  'T-13 phase 3.2 (TRANSITIONAL, expires 2026-12-15): keeps published_to_web in step with the retiring row column; shown_to never writes it; disagreeing and stale writes raise; writes through the row column are counted.';

create or replace function platform._t13_transitional_flush_writes()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
-- T-13 phase 3.2 (TRANSITIONAL): statement trigger; moves this statement's count of writes that arrived
-- through the retiring row column into ops.t13_row_column_events (one upsert per statement, not per row).
declare
  v_key text := 't13w.r' || tg_relid::text;
  v_n   bigint := coalesce(nullif(current_setting(v_key, true), ''), '0')::bigint;
begin
  if v_n > 0 then
    perform set_config(v_key, '0', true);
    insert into ops.t13_row_column_events as e (day, table_ref, kind, role, application_name, events)
    values (current_date, tg_relid::regclass::text, 'write_through_row_column',
            coalesce(nullif(current_setting('role', true), 'none'), session_user::text),
            coalesce(nullif(current_setting('application_name', true), ''), '(none)'), v_n)
    on conflict (day, table_ref, kind, role, application_name)
      do update set events = e.events + excluded.events, last_at = now();
  end if;
  return null;
end
$$;
revoke all on function platform._t13_transitional_flush_writes() from public, anon, authenticated;
comment on function platform._t13_transitional_flush_writes() is
  'T-13 phase 3.2 (TRANSITIONAL, expires 2026-12-15): flushes the per-statement count of writes through the retiring row column to ops.t13_row_column_events.';

create or replace function platform._t13_transitional_expand(p_table regclass)
returns text
language plpgsql
set search_path to 'pg_catalog'
as $$
-- T-13 phase 3.1 (TRANSITIONAL, expires 2026-12-15). ONE table per call; call it in its own transaction.
declare
  v_has_shown   boolean;
  v_has_indexed boolean;
  v_alter       text[] := '{}';
  v_done        text[] := '{}';
begin
  if not exists (select 1 from platform._t13_transitional_targets() t where t = p_table) then
    raise exception 'T-13 expand refuses %: not an Organization or Public table carrying the retiring row column', p_table
      using errcode = 'check_violation',
            hint = 'Private, Confidential and child tables carry no row access column (common-docs/projects/access-ladder/t13/PLAN.md §3.1).';
  end if;
  perform set_config('lock_timeout', '2s', true);
  select exists (select 1 from pg_attribute where attrelid = p_table and attname = 'shown_to' and not attisdropped),
         exists (select 1 from pg_attribute where attrelid = p_table and attname = 'search_engine_indexed' and not attisdropped)
    into v_has_shown, v_has_indexed;

  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'published_to_web' and not attisdropped) then
    v_alter := v_alter || 'add column published_to_web boolean not null default false'::text
                       || 'add column published_to_web_at timestamptz'::text
                       || 'add column published_to_web_by uuid'::text;
    v_done := v_done || 'columns'::text;
  end if;
  if v_has_indexed and not exists (select 1 from pg_constraint where conrelid = p_table and conname = 't13_indexed_only_when_published') then
    v_alter := v_alter || 'add constraint t13_indexed_only_when_published check (search_engine_indexed is not true or published_to_web) not valid'::text;
    v_done := v_done || 'indexed check'::text;
  end if;
  if v_has_shown and not exists (select 1 from pg_constraint where conrelid = p_table and conname = 't13_everyone_on_ai_matrx_only_when_published') then
    v_alter := v_alter || 'add constraint t13_everyone_on_ai_matrx_only_when_published check (shown_to is distinct from ''everyone_on_ai_matrx'' or published_to_web) not valid'::text;
    v_done := v_done || 'shown_to check'::text;
  end if;
  if cardinality(v_alter) > 0 then
    execute format('alter table %s %s', p_table, array_to_string(v_alter, ', '));
  end if;
  if 'columns' = any (v_done) then
    execute format('comment on column %s.published_to_web is %L', p_table,
      'Published to the web: the only anonymous lane (access ladder). Not published = behaves as an Organization record.');
    execute format('comment on column %s.published_to_web_at is %L', p_table,
      'When the web state was last set through published_to_web; null = derived from the retiring row column (T-13).');
    execute format('comment on column %s.published_to_web_by is %L', p_table,
      'Who last set the web state through published_to_web; null = derived from the retiring row column (T-13).');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = p_table and tgname = '_a0_t13_dual_write') then
    execute format('create trigger _a0_t13_dual_write before insert or update on %s for each row execute function platform._t13_transitional_dual_write(%L)',
                   p_table, case when v_has_shown then 'shown_to' else 'none' end);
    v_done := v_done || 'dual-write trigger'::text;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = p_table and tgname = '_t13_count_row_column_writes') then
    execute format('create trigger _t13_count_row_column_writes after insert or update on %s for each statement execute function platform._t13_transitional_flush_writes()', p_table);
    v_done := v_done || 'counter trigger'::text;
  end if;
  return p_table::text || ': ' || coalesce(nullif(array_to_string(v_done, ', '), ''), 'already expanded');
end
$$;
revoke all on function platform._t13_transitional_expand(regclass) from public, anon, authenticated;
comment on function platform._t13_transitional_expand(regclass) is
  'T-13 phase 3.1 (TRANSITIONAL, expires 2026-12-15): adds published_to_web(_at,_by), the two NOT VALID checks and the dual-write triggers to ONE Organization/Public table. Idempotent.';

-- ── 3.3 backfill (one batch per call) ─────────────────────────────────────────────────────────
create or replace function platform._t13_transitional_backfill(p_table regclass, p_batch integer default 5000)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $$
-- T-13 phase 3.3 (TRANSITIONAL, expires 2026-12-15). ONE batch; call it in its own transaction.
declare
  v_has_shown boolean;
  v_n integer;
begin
  if not exists (select 1 from platform._t13_transitional_targets() t where t = p_table)
     or not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'published_to_web' and not attisdropped) then
    raise exception 'T-13 backfill refuses %: not an expanded Organization or Public table', p_table using errcode = 'check_violation';
  end if;
  v_has_shown := exists (select 1 from pg_attribute where attrelid = p_table and attname = 'shown_to' and not attisdropped);
  -- THE SKIP FLAG: this transaction only. Announced below in ops.t13_row_column_events.
  set local session_replication_role = replica;
  perform set_config('lock_timeout', '2s', true);
  execute format($f$
    with pick as (
      select id, (visibility = 'public' and not published_to_web) as pub
             %2$s
        from %1$s
       where (visibility = 'public' and not published_to_web) %3$s
       limit %4$s
         for update skip locked
    ), upd as (
      update %1$s t
         set published_to_web = t.published_to_web or pick.pub
             %5$s
        from pick
       where t.id = pick.id
      returning t.id, pick.pub, %6$s as shown
    ), led as (
      insert into ops.t13_backfill_ledger (table_ref, id, column_name)
      select %7$L, id, 'published_to_web' from upd where pub
      union all
      select %7$L, id, 'shown_to' from upd where shown
      on conflict do nothing
    )
    select count(*) from upd$f$,
    p_table,
    case when v_has_shown then ', (visibility = ''personal'' and shown_to is null) as shw' else ', false as shw' end,
    case when v_has_shown then 'or (visibility = ''personal'' and shown_to is null)' else '' end,
    greatest(p_batch, 1),
    case when v_has_shown then ', shown_to = case when pick.shw then ''only_me''::platform.shown_to else t.shown_to end' else '' end,
    'pick.shw',
    p_table::text)
  into v_n;
  insert into ops.t13_row_column_events as e (day, table_ref, kind, role, application_name, events)
  values (current_date, p_table::text, 'backfill_batch', session_user::text,
          coalesce(nullif(current_setting('application_name', true), ''), '(none)'), v_n)
  on conflict (day, table_ref, kind, role, application_name)
    do update set events = e.events + excluded.events, last_at = now();
  set local session_replication_role = origin;
  return v_n;
end
$$;
revoke all on function platform._t13_transitional_backfill(regclass, integer) from public, anon, authenticated;
comment on function platform._t13_transitional_backfill(regclass, integer) is
  'T-13 phase 3.3 (TRANSITIONAL, expires 2026-12-15): one backfill batch on one expanded table, row triggers skipped for that transaction only (announced in ops.t13_row_column_events, ids in ops.t13_backfill_ledger). Returns rows changed.';

-- ── 3.4 validate ──────────────────────────────────────────────────────────────────────────────
create or replace function platform._t13_transitional_validate(p_table regclass)
returns text
language plpgsql
set search_path to 'pg_catalog'
as $$
-- T-13 phase 3.4 (TRANSITIONAL). VALIDATE takes SHARE UPDATE EXCLUSIVE, never ACCESS EXCLUSIVE.
declare
  r record;
  v_done text[] := '{}';
begin
  perform set_config('lock_timeout', '2s', true);
  for r in select conname from pg_constraint
            where conrelid = p_table and not convalidated
              and conname in ('t13_indexed_only_when_published', 't13_everyone_on_ai_matrx_only_when_published') loop
    execute format('alter table %s validate constraint %I', p_table, r.conname);
    v_done := v_done || r.conname::text;
  end loop;
  return p_table::text || ': ' || coalesce(nullif(array_to_string(v_done, ', '), ''), 'nothing to validate');
end
$$;
revoke all on function platform._t13_transitional_validate(regclass) from public, anon, authenticated;
comment on function platform._t13_transitional_validate(regclass) is
  'T-13 phase 3.4 (TRANSITIONAL, expires 2026-12-15): validates the two T-13 checks on one table.';
