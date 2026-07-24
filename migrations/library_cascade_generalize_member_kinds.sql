-- library_cascade_generalize_member_kinds.sql  (P4 / D-A)
--
-- The library cascade worked for exactly ONE member shape: source_kind='cld_file'
-- was hard-coded in rag.sync_data_store_member_association (4 places), so a
-- library of notes / transcripts / code files conveyed NOTHING.
--
-- This migration makes the member -> edge sync registry-driven:
--   * rag.member_source_entity_token(kind) maps a data_store_members.source_kind
--     to its canonical platform.entity_types token (cld_file -> file; everything
--     else is already the token name).
--   * The trigger writes a 'library_member' edge for ANY member kind whose
--     token has an ACTIVE platform.association_types rule <token> -> data_store.
--     Registering a new rule is the whole act of making a new kind cascade.
--   * A live member whose kind has NO registered rule is a LOUD skip
--     (RAISE WARNING), never a silent one.
--
-- Rules registered here (little -> big, container = data_store, conveys viewer):
--   note       -> data_store   (workbench.notes std_select honors iam.has_access)
--   transcript -> data_store   (transcripts.transcripts std_select honors iam.has_access)
--   code_file  -> data_store   (code.code_files std_select honors iam.has_access)
--
-- Kinds deliberately NOT registered this wave (documented in
-- features/rag/FEATURE.md, never silently skipped — the trigger WARNs on them):
--   project, task  — containers/work items with their own access cascades;
--                    conveying viewer on a whole project/task through a store
--                    grant is a conveyance decision reserved for Arman.
--   research, scraped — no platform.entity_types token exists; registering the
--                    token + conveyance is the same reserved decision.
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Register the association_types rules BEFORE any edge is written
--    (trg_associations_auto_orient rejects wrong-way writes of registered pairs)
-- ---------------------------------------------------------------------------
INSERT INTO platform.association_types (
  source_type, target_type, label, container_side, conveys_max, is_active, notes
)
VALUES
  ('note', 'data_store', NULL, 'target', 'viewer', true,
   'Shared Knowledge: a data store can contain notes as members. Store grants convey viewer on member notes via reachability. P4 D-A 2026-07-23'),
  ('transcript', 'data_store', NULL, 'target', 'viewer', true,
   'Shared Knowledge: a data store can contain transcripts as members. Store grants convey viewer on member transcripts via reachability. P4 D-A 2026-07-23'),
  ('code_file', 'data_store', NULL, 'target', 'viewer', true,
   'Shared Knowledge: a data store can contain code files as members. Store grants convey viewer on member code files via reachability. P4 D-A 2026-07-23')
ON CONFLICT (source_type, target_type) DO UPDATE
SET container_side = EXCLUDED.container_side,
    conveys_max    = EXCLUDED.conveys_max,
    is_active      = EXCLUDED.is_active,
    notes          = EXCLUDED.notes,
    updated_at     = now();

-- ---------------------------------------------------------------------------
-- 2. source_kind -> entity token map (single authority, used by trigger+backfill)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.member_source_entity_token(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind WHEN 'cld_file' THEN 'file' ELSE p_kind END;
$$;

COMMENT ON FUNCTION rag.member_source_entity_token(text) IS
  'Maps rag.data_store_members.source_kind to its canonical platform.entity_types token. cld_file is the one legacy alias; every other kind must already BE a token name.';

-- ---------------------------------------------------------------------------
-- 3. Generalized member -> edge sync trigger (replaces the cld_file-only body)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.sync_data_store_member_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, rag, iam
AS $$
DECLARE
  v_org uuid;
  v_src uuid;
  v_store uuid;
  v_old_src uuid;
  v_token text;
  v_old_token text;
  v_rule_ok boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_token := rag.member_source_entity_token(OLD.source_kind);
    BEGIN
      v_old_src := OLD.source_id::uuid;
      DELETE FROM platform.associations a
      WHERE a.source_type = v_old_token
        AND a.source_id = v_old_src
        AND a.target_type = 'data_store'
        AND a.target_id = OLD.data_store_id
        AND a.role IS NOT DISTINCT FROM 'library_member';
    EXCEPTION WHEN others THEN
      RAISE WARNING '[rag.sync_data_store_member_association] DELETE skip non-uuid source_id=%', OLD.source_id;
    END;
    RETURN OLD;
  END IF;

  -- UPDATE: always drop the OLD edge first (prevents privilege retention when
  -- source_kind / source_id / data_store_id change)
  IF TG_OP = 'UPDATE' THEN
    v_old_token := rag.member_source_entity_token(OLD.source_kind);
    BEGIN
      v_old_src := OLD.source_id::uuid;
      DELETE FROM platform.associations a
      WHERE a.source_type = v_old_token
        AND a.source_id = v_old_src
        AND a.target_type = 'data_store'
        AND a.target_id = OLD.data_store_id
        AND a.role IS NOT DISTINCT FROM 'library_member';
    EXCEPTION WHEN others THEN
      RAISE WARNING '[rag.sync_data_store_member_association] UPDATE old-edge cleanup failed for source_id=% (%: %)', OLD.source_id, SQLSTATE, SQLERRM;
    END;
  END IF;

  v_store := NEW.data_store_id;
  v_token := rag.member_source_entity_token(NEW.source_kind);

  -- Soft-deleted member -> remove edge, done.
  IF NEW.deleted_at IS NOT NULL THEN
    BEGIN
      v_src := NEW.source_id::uuid;
      DELETE FROM platform.associations a
      WHERE a.source_type = v_token
        AND a.source_id = v_src
        AND a.target_type = 'data_store'
        AND a.target_id = v_store
        AND a.role IS NOT DISTINCT FROM 'library_member';
    EXCEPTION WHEN others THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- Registry-driven: only kinds with an ACTIVE <token> -> data_store rule
  -- get an edge. Anything else is a LOUD skip — the member row exists but
  -- conveys nothing until a human registers the rule.
  SELECT EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = v_token
      AND r.target_type = 'data_store'
      AND r.is_active
  ) INTO v_rule_ok;

  IF NOT v_rule_ok THEN
    RAISE WARNING '[rag.sync_data_store_member_association] source_kind=% (token=%) has NO active association_types rule -> data_store: member % of store % conveys NOTHING. Register the rule (P4 D-A) or document the kind as not library-shareable.',
      NEW.source_kind, v_token, NEW.source_id, v_store;
    RETURN NEW;
  END IF;

  BEGIN
    v_src := NEW.source_id::uuid;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[rag.sync_data_store_member_association] non-uuid source_id=% on store=%', NEW.source_id, v_store;
    RETURN NEW;
  END;

  -- Edge org stamp (unchanged from the applied cascade migration). NOTE:
  -- access conveyance never reads this column — grants key on data_store_id
  -- and reachability; the library-org fallback is bookkeeping for ownerless
  -- system stores, not an access grant.
  SELECT COALESCE(ds.organization_id, (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1))
    INTO v_org
  FROM rag.data_stores ds
  WHERE ds.id = v_store;

  INSERT INTO platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata
  )
  VALUES (
    v_token, v_src, 'data_store', v_store,
    v_org, 'library_member',
    jsonb_build_object(
      'legacy_table', 'rag.data_store_members',
      'source_kind', NEW.source_kind
    )
  )
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_data_store_members_assoc ON rag.data_store_members;
CREATE TRIGGER trg_data_store_members_assoc
  AFTER INSERT OR UPDATE OF deleted_at, source_kind, source_id, data_store_id
  OR DELETE ON rag.data_store_members
  FOR EACH ROW EXECUTE FUNCTION rag.sync_data_store_member_association();

-- ---------------------------------------------------------------------------
-- 4. Backfill: every live member of every kind with a registered rule
-- ---------------------------------------------------------------------------
INSERT INTO platform.associations (
  source_type, source_id, target_type, target_id,
  organization_id, role, metadata
)
SELECT
  rag.member_source_entity_token(dm.source_kind),
  dm.source_id::uuid,
  'data_store',
  dm.data_store_id,
  COALESCE(ds.organization_id, (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)),
  'library_member',
  jsonb_build_object('legacy_table', 'rag.data_store_members', 'source_kind', dm.source_kind)
FROM rag.data_store_members dm
JOIN rag.data_stores ds ON ds.id = dm.data_store_id
WHERE dm.deleted_at IS NULL
  AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = rag.member_source_entity_token(dm.source_kind)
      AND r.target_type = 'data_store'
      AND r.is_active
  )
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Rebuild reachability closure
-- ---------------------------------------------------------------------------
SELECT platform.rebuild_reachability();
