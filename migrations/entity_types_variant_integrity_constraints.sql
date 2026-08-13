-- Applied live 2026-08-12 via Supabase MCP (hardening pass task_b4bd08d8, Arman-ratified).
-- G3 of operations/db-hardening-proposals.md: registry integrity constraints.
-- Kills the NULL-variant trap and Trap 2 (is_component vs rls_variant divergence) permanently.
-- Pre-verified live: 0 NULLs, 0 mismatches, 0 invalid variants across all 363 rows.
ALTER TABLE platform.entity_types
  ALTER COLUMN rls_variant SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform.entity_types'::regclass
      AND conname = 'entity_types_component_flag_consistent'
  ) THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_component_flag_consistent
      CHECK (is_component = (rls_variant = 'component'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform.entity_types'::regclass
      AND conname = 'entity_types_rls_variant_valid'
  ) THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_rls_variant_valid
      CHECK (rls_variant IN ('entity','component','system','restricted','ledger'));
  END IF;
END $$;
