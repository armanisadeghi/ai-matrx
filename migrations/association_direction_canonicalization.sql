-- ============================================================
-- Direction doctrine: little points to big — content/child = SOURCE, container = TARGET.
-- container_side='target' is the norm; 'source' is a deliberate documented exception.
-- 1) war_room<->project flipped to canonical war_room->project (doctrine overrides
--    the previous writer-matching choice; FE writer is being fixed in the same pass).
-- 2) BEFORE INSERT auto-orient trigger on platform.associations: a write whose
--    (source,target) pair is unregistered-or-inactive while the REVERSE pair is
--    registered+active gets flipped to canonical, loudly (WARNING + metadata marker).
--    Catches every writer: assoc_* RPCs, aidream service-role, future code.
-- ============================================================

-- 1a. Registry: canonical direction
UPDATE platform.association_types
   SET container_side = 'target', conveys_max = 'editor', is_active = true,
       notes = 'CANONICAL: war room (content) -> project (container). Direction doctrine: little points to big. 2026-07-06.'
 WHERE source_type = 'war_room' AND target_type = 'project' AND label IS NULL;

UPDATE platform.association_types
   SET is_active = false, container_side = 'none', conveys_max = 'editor',
       notes = 'RETIRED direction — canonical is war_room->project (little points to big). Auto-orient trigger flips any write of this shape. 2026-07-06.'
 WHERE source_type = 'project' AND target_type = 'war_room' AND label IS NULL;

-- 1b. Migrate existing project->war_room edges to canonical direction (preserve everything)
INSERT INTO platform.associations
  (source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by, created_at)
SELECT 'war_room', a.target_id, 'project', a.source_id,
       a.organization_id, a.label, a.metadata, a.created_by, a.created_at
FROM platform.associations a
WHERE a.source_type = 'project' AND a.target_type = 'war_room'
  AND NOT EXISTS (
    SELECT 1 FROM platform.associations b
    WHERE b.source_type = 'war_room' AND b.source_id = a.target_id
      AND b.target_type = 'project' AND b.target_id = a.source_id
      AND b.label IS NOT DISTINCT FROM a.label);

DELETE FROM platform.associations
 WHERE source_type = 'project' AND target_type = 'war_room';

-- 2. Auto-orient trigger (the class-killer for wrong-way writes)
CREATE OR REPLACE FUNCTION platform.enforce_association_direction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tmp_type text; v_tmp_id uuid;
  v_written_ok boolean; v_reverse_ok boolean;
BEGIN
  -- Is the written shape registered + active (label-specific rule beats generic)?
  SELECT EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = NEW.source_type AND r.target_type = NEW.target_type
      AND (r.label IS NULL OR r.label = NEW.label) AND r.is_active
  ) INTO v_written_ok;
  IF v_written_ok THEN RETURN NEW; END IF;

  -- Is the REVERSE shape the registered one?
  SELECT EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = NEW.target_type AND r.target_type = NEW.source_type
      AND (r.label IS NULL OR r.label = NEW.label) AND r.is_active
  ) INTO v_reverse_ok;
  IF NOT v_reverse_ok THEN RETURN NEW; END IF;  -- unknown pair: not ours to decide (enforce_known handles it)

  -- Flip to canonical, loudly.
  v_tmp_type := NEW.source_type; v_tmp_id := NEW.source_id;
  NEW.source_type := NEW.target_type; NEW.source_id := NEW.target_id;
  NEW.target_type := v_tmp_type;     NEW.target_id := v_tmp_id;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('__auto_oriented', true);
  RAISE WARNING 'association auto-oriented to canonical direction: % -> % (writer sent the reverse — fix the caller)',
    NEW.source_type, NEW.target_type;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_associations_auto_orient ON platform.associations;
CREATE TRIGGER trg_associations_auto_orient
  BEFORE INSERT ON platform.associations
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_association_direction();

-- 3. Rules RPC gains reverse_edge_count (wrong-way edges per rule) for the UI.
-- NOTE: superseded by relationship_rules_reverse_count_refinement.sql (self-pair
-- and retired-direction false positives) — that file holds the canonical body.
