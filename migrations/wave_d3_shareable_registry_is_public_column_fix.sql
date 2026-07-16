-- Wave D3 — shareable_resource_registry row fixes + token-identity verification
--
-- (b) data_store and scope carry is_public_column='visibility'. 'visibility' is the
--     canonical platform visibility ENUM, not a boolean is_public column — a non-null
--     is_public_column wrongly routes the FE through the legacy make_resource_public
--     RPC (which writes a boolean). Visibility-enum tables must have is_public_column
--     NULL (null => canonical visibility enum path). Mirrored in the TS registry
--     (utils/permissions/registry.ts) in the same change.
--
-- (a) Verification: after Waves D1+D2, every ACTIVE shareable_resource_registry row
--     must have a matching ACTIVE platform.entity_types token. Reported as WARNINGs
--     (not an exception) so a row owned by another workstream cannot brick this
--     migration — but every warning is a real invariant breach to chase.

BEGIN;

UPDATE platform.shareable_resource_registry
SET is_public_column = NULL
WHERE resource_type IN ('data_store', 'scope')
  AND is_public_column = 'visibility';

-- Self-verify (b)
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(resource_type, ', ') INTO v_bad
  FROM platform.shareable_resource_registry
  WHERE resource_type IN ('data_store', 'scope')
    AND is_public_column IS NOT NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'wave_d3: is_public_column still set for: %', v_bad;
  END IF;
END $$;

-- Verify (a): active registry rows without a matching active entity_types token.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(srr.resource_type, ', ') INTO v_missing
  FROM platform.shareable_resource_registry srr
  WHERE srr.is_active
    AND NOT EXISTS (
      SELECT 1 FROM platform.entity_types et
      WHERE et.token = srr.resource_type AND et.is_active
    );
  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'wave_d3: ACTIVE registry rows still missing an entity_types token: %', v_missing;
  ELSE
    RAISE NOTICE 'wave_d3: token identity invariant holds — every active registry row has an active entity_types token';
  END IF;
END $$;

COMMIT;
