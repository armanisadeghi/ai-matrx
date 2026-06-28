-- Migration: reg_tables_rls_and_registry
-- Update entity_types to reg schema, register kg_sweep_state, apply canonical RLS, record moves

-- Update existing entity_type registrations from public → reg
UPDATE platform.entity_types SET schema_name = 'reg' WHERE table_name IN (
  'kg_alerts','kg_suggestion_ack','kg_value_matches','ner_canonicalizer_shadow',
  'kg_sweep_queue','kg_sweep_run',
  'scope_suggestions','scope_association_suggestions','scope_item_value_suggestions','context_item_suggestions'
) AND schema_name = 'public';

-- Register kg_sweep_state (was missing from entity_types)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, has_soft_delete, is_active, default_visibility)
SELECT 'kg_sweep_state', 'reg', 'kg_sweep_state', 'KG Sweep State', false, false, false, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'kg_sweep_state');

-- Apply canonical RLS — entity variant for tables with created_by + organization_id + id
SELECT iam.apply_rls('reg','kg_alerts','kg_alert','entity');
SELECT iam.apply_rls('reg','kg_suggestion_ack','kg_suggestion_ack','entity');
SELECT iam.apply_rls('reg','kg_value_matches','kg_value_match','entity');
SELECT iam.apply_rls('reg','ner_canonicalizer_shadow','ner_shadow','entity');
SELECT iam.apply_rls('reg','kg_sweep_queue','kg_sweep_queue','entity');
SELECT iam.apply_rls('reg','kg_sweep_run','kg_sweep_run','entity');
SELECT iam.apply_rls('reg','scope_suggestions','scope_suggestion','entity');
SELECT iam.apply_rls('reg','scope_association_suggestions','scope_association_suggestion','entity');
SELECT iam.apply_rls('reg','scope_item_value_suggestions','scope_item_value_suggestion','entity');
SELECT iam.apply_rls('reg','context_item_suggestions','context_item_suggestion','entity');
-- ledger variant for kg_sweep_state (org-level state, no created_by, service-role only writes)
SELECT iam.apply_rls('reg','kg_sweep_state','kg_sweep_state','ledger');

-- Record moves in deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
  ('public.kg_alerts',                    'reg.kg_alerts',                    'moved to reg schema', now()),
  ('public.kg_suggestion_ack',            'reg.kg_suggestion_ack',            'moved to reg schema', now()),
  ('public.kg_value_matches',             'reg.kg_value_matches',             'moved to reg schema', now()),
  ('public.ner_canonicalizer_shadow',     'reg.ner_canonicalizer_shadow',     'moved to reg schema', now()),
  ('public.kg_sweep_queue',               'reg.kg_sweep_queue',               'moved to reg schema', now()),
  ('public.kg_sweep_run',                 'reg.kg_sweep_run',                 'moved to reg schema', now()),
  ('public.kg_sweep_state',               'reg.kg_sweep_state',               'moved to reg schema', now()),
  ('public.scope_suggestions',            'reg.scope_suggestions',            'moved to reg schema', now()),
  ('public.scope_association_suggestions','reg.scope_association_suggestions', 'moved to reg schema', now()),
  ('public.scope_item_value_suggestions', 'reg.scope_item_value_suggestions',  'moved to reg schema', now()),
  ('public.context_item_suggestions',     'reg.context_item_suggestions',     'moved to reg schema', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, reason = EXCLUDED.reason, deprecated_at = EXCLUDED.deprecated_at;
