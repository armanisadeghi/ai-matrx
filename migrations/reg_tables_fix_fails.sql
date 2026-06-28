-- Migration: reg_tables_fix_fails
-- Fix verify_canonical FAILs found post-move

-- kg_sweep_queue uses enqueued_at instead of created_at; add created_at for timestamps check
ALTER TABLE reg.kg_sweep_queue ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
UPDATE reg.kg_sweep_queue SET created_at = enqueued_at WHERE created_at = updated_at OR created_at > enqueued_at;

-- Fix shareable_resource_registry token mismatches (plural vs singular token)
UPDATE public.shareable_resource_registry
  SET resource_type = 'scope_association_suggestion'
WHERE resource_type = 'scope_association_suggestions';

UPDATE public.shareable_resource_registry
  SET resource_type = 'scope_item_value_suggestion'
WHERE resource_type = 'scope_item_value_suggestions';

-- Update schema_name in registry for moved tables
UPDATE public.shareable_resource_registry
  SET schema_name = 'reg'
WHERE table_name IN (
  'kg_alerts','kg_suggestion_ack','kg_value_matches','ner_canonicalizer_shadow',
  'kg_sweep_queue','kg_sweep_run','kg_sweep_state',
  'scope_suggestions','scope_association_suggestions','scope_item_value_suggestions','context_item_suggestions'
) AND schema_name = 'public';
