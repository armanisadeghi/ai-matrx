-- Applied live 2026-08-12 (hardening pass task_b4bd08d8, Arman-ratified in-session).
-- G5 of operations/db-hardening-proposals.md: activating a shareable registration for a
-- table platform.entity_types has never heard of now ERRORs — sharing registration does
-- not make a table exist canonically (the hindsight-tables mistake, 2026-08-11).
-- Extends the existing shareable_registry_token_guard (ONE-TOKEN law) in place.
--
-- Data fix folded in (fix-on-sight, verified live): registry row 'batch_provider_batch'
-- still pointed at public.auto_ingest_batch, which NO LONGER EXISTS (table moved to
-- batch.provider_batch; registry didn't follow). Repointed to the live location — the
-- token already matches the entity registration.
UPDATE platform.shareable_resource_registry
SET schema_name = 'batch', table_name = 'provider_batch'
WHERE resource_type = 'batch_provider_batch'
  AND schema_name = 'public' AND table_name = 'auto_ingest_batch';

CREATE OR REPLACE FUNCTION public.shareable_registry_token_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_token text;
BEGIN
  SELECT e.token INTO v_token
  FROM platform.entity_types e
  WHERE e.schema_name = NEW.schema_name
    AND e.table_name = NEW.table_name;

  IF v_token IS NOT NULL AND v_token <> NEW.resource_type THEN
    RAISE EXCEPTION 'shareable_resource_registry.resource_type (%) must equal entity_types.token (%) for governed table %.%. One token across both registries.',
      NEW.resource_type, v_token, NEW.schema_name, NEW.table_name USING ERRCODE = 'P0001';
  END IF;

  IF NEW.is_active AND v_token IS NULL THEN
    RAISE EXCEPTION 'shareable_resource_registry: %.% has no platform.entity_types registration — sharing registration does not make a table exist canonically. Register the entity first (platform.create_entity_table or admin_upsert_entity_type), then register it as shareable. This registry answers "how do I share type T"; entity_types answers "what is T".',
      NEW.schema_name, NEW.table_name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
