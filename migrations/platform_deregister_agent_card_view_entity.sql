-- platform_deregister_agent_card_view_entity.sql
--
-- A VIEW IS NOT AN ENTITY. Removes `agent_card` from platform.entity_types.
--
-- This is a contract RESTORATION, not an exception: db-rules §1 registers
-- TABLES as entities, and platform._enforce_entity_is_table already says so out
-- loud ("only base/partitioned tables may be registered as active entities.
-- Views have no rows to own and no RLS"). The guard was right. The registry row
-- was wrong. The earlier proposal to relax the guard for a "view-backed
-- permission surface" is rejected by the owner and is NOT implemented here.
--
-- WHAT WAS ACTUALLY SCREAMING -- and it was not the conformance system.
--   audit.canonical_findings has ZERO rows for agent_card. iam.verify_canonical
--   only scans relkind='r', so the gate never flagged it: the gate already
--   knows a view is not an entity. The only thing that "found" it was the
--   hand-written registry-join query used to COUNT the versioned-without-capture
--   backlog, which joined platform.entity_types without filtering relkind. The
--   counting method manufactured the finding.
--
-- HOW WRONG THE ROW WAS. It was registered as is_component=true,
-- rls_variant='component', with a platform.entity_relationships edge
--   child_type='agent_card', parent_type='agent', fk_column='id', kind='composition'
-- i.e. the view was declared a COMPONENT OF THE VERY TABLE IT IS A VIEW OF,
-- joined on id -- the same rows, twice, in a parent/child relationship. It also
-- carried is_versioned=true/version_store='history' while `agent` is already
-- versioned by the certified custom store agent.definition_version.
-- platform.lifecycle_entity_plan had already given up on it: feature_key
-- resolved to '(unregistered)'.
--
-- NOTHING BREAKS, because agent_card's real home is a DIFFERENT registry.
-- Verified live before writing this:
--   - platform.shareable_resource_registry has its own agent_card row
--     (schema agent, table card, rls_uses_has_permission=true,
--     is_link_shareable=true, explicit public_columns) and has NO foreign key
--     to platform.entity_types.
--   - has_permission(text,uuid,permission_level) and
--     iam.has_access(text,uuid,permission_level) do NOT read entity_types.
--   - iam.permissions rows key on resource_type text; no FK to entity_types.
--   - Every runtime consumer uses agent_card only as a SHARING resource type:
--     aidream services/agent_service/card_visibility.py (has_permission),
--     matrx-frontend utils/permissions/registry.ts, features/sharing/
--     resourceIcons.ts, features/surfaces/services/bind-agent-to-surface.service.ts.
--   - No DB function references agent_card and entity_types together.
-- So the sharing surface keeps working untouched. This migration removes a false
-- claim from the entity registry and changes no grant, policy, or permission.
--
-- IF a first-class "entity view" concept is ever wanted, it gets designed,
-- documented and built as a concept -- it is not smuggled in by weakening a
-- guard. Not needed here: shareable_resource_registry already is that concept
-- for this case.

BEGIN;

-- 1. The false composition edge (a view is not a component of its own base table).
DELETE FROM platform.entity_relationships
 WHERE child_type = 'agent_card' AND parent_type = 'agent';

-- 2. The derived lifecycle row (rebuilt by platform.build_lifecycle_reference_map();
--    it will simply not be rebuilt once the entity row is gone).
DELETE FROM platform.lifecycle_entity_plan
 WHERE entity_token = 'agent_card';

-- 3. The registry row itself.
DELETE FROM platform.entity_types
 WHERE token = 'agent_card';

-- ---------------------------------------------------------------------------
-- Verify in-transaction; roll back the whole thing on any deviation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM platform.entity_types WHERE token='agent_card') THEN
    RAISE EXCEPTION 'agent_card still registered as an entity';
  END IF;

  -- The sharing surface MUST survive intact -- this is the whole safety claim.
  SELECT count(*) INTO n FROM platform.shareable_resource_registry
   WHERE resource_type='agent_card' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_card lost its shareable_resource_registry row (%)', n;
  END IF;

  SELECT count(*) INTO n FROM iam.permissions WHERE resource_type='agent_card';
  IF n <> 2 THEN
    RAISE EXCEPTION 'agent_card permissions changed: expected 2, found %', n;
  END IF;

  -- The view itself must still exist and still be permission-gated.
  IF to_regclass('agent.card') IS NULL THEN
    RAISE EXCEPTION 'agent.card view disappeared';
  END IF;
  IF pg_get_viewdef('agent.card'::regclass) NOT ILIKE '%has_permission%' THEN
    RAISE EXCEPTION 'agent.card lost its has_permission gate';
  END IF;

  -- No entity may now point at a non-table relation.
  SELECT count(*) INTO n
  FROM platform.entity_types et
  JOIN pg_class c ON c.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
  WHERE coalesce(et.is_active, true) AND c.relkind NOT IN ('r','p');
  IF n <> 0 THEN
    RAISE EXCEPTION '% active entity row(s) still point at a non-table relation', n;
  END IF;

  RAISE NOTICE 'OK: agent_card deregistered as an entity; sharing surface intact';
END $$;

COMMIT;
