-- CORRECTION (Arman, 2026-07-06): a war room is MUCH bigger than a project —
-- many threads make a war room; a project is a thing tied to it. Little points
-- to big => canonical edge is project -> war_room (project = source).
-- Conveyance (container_side) is deliberately left at 'none': whether sharing
-- a war room grants access to its project is Arman's call, made in the
-- Relationship Manager UI — NOT by an agent.
--
-- ORDER MATTERS: registry first, then edges — the direction trigger reads the
-- registry, so migrating edges before flipping the rules gets them re-flipped.

-- 1. Registry: project -> war_room is the one canonical shape. Conveys NOTHING
--    until flipped in the UI by Arman.
UPDATE platform.association_types
   SET is_active = true, container_side = 'none', conveys_max = 'editor',
       notes = 'CANONICAL direction: project (source) -> war_room (target) — a war room is bigger than a project (many threads make a war room; a project is tied to it). Conveyance deliberately unset: flip container_side in the Relationship Manager, human decision only. 2026-07-06.'
 WHERE source_type = 'project' AND target_type = 'war_room' AND label IS NULL;

UPDATE platform.association_types
   SET is_active = false, container_side = 'none',
       notes = 'RETIRED direction — canonical is project->war_room. Wrong-way writes are REJECTED by trg_associations_auto_orient. 2026-07-06.'
 WHERE source_type = 'war_room' AND target_type = 'project' AND label IS NULL;

-- 2. Migrate edges back to canonical project -> war_room (preserve everything)
INSERT INTO platform.associations
  (source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by, created_at)
SELECT 'project', a.target_id, 'war_room', a.source_id,
       a.organization_id, a.label, a.metadata - '__auto_oriented', a.created_by, a.created_at
FROM platform.associations a
WHERE a.source_type = 'war_room' AND a.target_type = 'project'
  AND NOT EXISTS (
    SELECT 1 FROM platform.associations b
    WHERE b.source_type = 'project' AND b.source_id = a.target_id
      AND b.target_type = 'war_room' AND b.target_id = a.source_id
      AND b.label IS NOT DISTINCT FROM a.label);

DELETE FROM platform.associations
 WHERE source_type = 'war_room' AND target_type = 'project';

-- 3. Guardrail hardened: wrong-way writes GET STUCK (rejected with the canonical
--    direction in the error), not silently fixed. Changing direction semantics
--    requires the registry/dashboard, on purpose.
CREATE OR REPLACE FUNCTION platform.enforce_association_direction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_written_ok boolean; v_reverse_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = NEW.source_type AND r.target_type = NEW.target_type
      AND (r.label IS NULL OR r.label = NEW.label) AND r.is_active
  ) INTO v_written_ok;
  IF v_written_ok THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM platform.association_types r
    WHERE r.source_type = NEW.target_type AND r.target_type = NEW.source_type
      AND (r.label IS NULL OR r.label = NEW.label) AND r.is_active
  ) INTO v_reverse_ok;
  IF NOT v_reverse_ok THEN RETURN NEW; END IF;  -- unknown pair: enforce_known's territory

  RAISE EXCEPTION 'association direction is wrong: canonical registered direction is % -> % (you wrote % -> %). Direction is set in platform.association_types via /administration/relationships — write the canonical direction or change the registry there.',
    NEW.target_type, NEW.source_type, NEW.source_type, NEW.target_type
    USING ERRCODE = 'check_violation';
END $$;
