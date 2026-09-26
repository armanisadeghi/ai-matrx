-- lane: access-ladder T-8
-- Access ladder T-8d (2026-09-26): children inherit their parent (common-docs/policies/access-ladder.md).
--
-- 1. legal.wc_report and legal.wc_injury are children of legal.wc_claim, which T-8b made
--    Confidential with Arman's approval (the medical-record case). A child's lanes are its
--    parent's, so the platform-staff lane closes on them as it did on the claim (DD-137b10), and
--    their generated policies are regenerated from the parent (they still carried the old wide
--    platform-admin door: component_not_wider_than_parent / class_lanes_match_policy FAILed).
--
-- 2. T-10 held back these composition edges because their parent was still Private or
--    Confidential; T-8c moved each parent to Organization, so they are registered now. The FK
--    makes each parent unambiguous; the children's live policies already defer to it.
--    Still held (parent stays Private until it is base-retrofitted with created_by):
--    rag.kg_entity_aliases (rag.kg_entities), files.webhook_deliveries (files.webhooks).
--    Also held: the four rag.embeddings_* tables. Their live policies do NOT defer to
--    rag.kg_chunks (bespoke org/owner/library read doors), and iam.apply_rls cannot regenerate
--    them as components (no id column), so registering the edge would only turn
--    component_not_wider_than_parent red. They need a component retrofit first.
--
-- 3. Tables the review said are children become components of their FK parent:
--    education.study_plan_block / study_plan_day -> education.study_plan,
--    seo.gsc_dig_rule -> web.site and seo.starter_pack_item -> seo.starter_pack (both edges
--    already registered), workflow.run_log -> workflow.run, esign.envelope_event -> esign.envelope.
--    Each carries no level of its own afterwards (data_class, default_visibility and the list scope
--    cleared) and its policies are regenerated as a component.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- 1 ─────────────────────────────────────────────────────────────────────────────────────────────
update platform.entity_types set suppress_platform_admin_lane = true where token in ('wc_report','wc_injury');
select iam.apply_rls('legal', 'wc_report', 'wc_report', 'component');
select iam.apply_rls('legal', 'wc_injury', 'wc_injury', 'component');

-- 2 ─────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
select v.child, v.parent, v.fk, 'composition',
       'Access ladder T-8 (2026-09-26): parent moved to Organization, so the child''s inheritance is registered; its live policies already defer to this parent.'
  from (values
    ('item',                           'assignment_session', 'session_id'),
    ('attempt',                        'item',               'item_id'),
    ('feedback_comments',              'user_feedback',      'feedback_id'),
    ('feedback_user_messages',         'user_feedback',      'feedback_id')
  ) as v(child, parent, fk)
 where not exists (select 1 from platform.entity_relationships r
                    where r.child_type = v.child and r.parent_type = v.parent and r.kind = 'composition');

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
select v.child, v.parent, v.fk, 'composition',
       'Access ladder T-8 (2026-09-26): a child of this record per the independent table review; it carries no level of its own.'
  from (values
    ('study_plan_block',     'study_plan',     'plan_id'),
    ('study_plan_day',       'study_plan',     'plan_id'),
    ('workflow_run_log',     'workflow_run',   'run_id'),
    ('esign_envelope_event', 'esign_envelope', 'envelope_id')
  ) as v(child, parent, fk)
 where not exists (select 1 from platform.entity_relationships r
                    where r.child_type = v.child and r.parent_type = v.parent and r.kind = 'composition');

update platform.entity_types
   set type_reason = 'Access ladder T-8 (2026-09-26): became a component (child of its parent); registry type kept so the custom-fields design is unchanged.'
 where token in ('study_plan_block','study_plan_day','seo_gsc_dig_rule','seo_starter_pack_item','workflow_run_log','esign_envelope_event')
   and type is not null and type <> 'detail' and type_reason is null
   and custom_fields_enabled is distinct from true;

update platform.entity_types
   set type = case when type = 'entity' and type_reason is null then 'detail' else type end,
       rls_variant = 'component', is_component = true,
       data_class = null, default_visibility = null, default_list_scope = null,
       data_class_reason = 'Access ladder T-8 (2026-09-26): a child; its access is its parent''s (common-docs/policies/access-ladder.md, "Children inherit their parent").'
 where token in ('study_plan_block','study_plan_day','seo_gsc_dig_rule','seo_starter_pack_item','workflow_run_log','esign_envelope_event');

select iam.apply_rls('education', 'study_plan_day', 'study_plan_day', 'component');
select iam.apply_rls('education', 'study_plan_block', 'study_plan_block', 'component');
select iam.apply_rls('seo', 'gsc_dig_rule', 'seo_gsc_dig_rule', 'component');
select iam.apply_rls('seo', 'starter_pack_item', 'seo_starter_pack_item', 'component');
select iam.apply_rls('workflow', 'run_log', 'workflow_run_log', 'component');
select iam.apply_rls('esign', 'envelope_event', 'esign_envelope_event', 'component');
