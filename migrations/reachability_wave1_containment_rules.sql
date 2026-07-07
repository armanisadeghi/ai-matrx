-- Reachability rollout §2.3 + §2.4: canonical war_room<->project direction + Wave 1 containment flips.

-- §2.3: canonical direction is project->war_room (container_side='source'; project contains war room).
-- Rationale: the ONLY live writer (FE setRoomProjectThunk -> assoc_add) writes source=project, target=war_room.
-- The reverse 'about' edges (2 rows, one-off backfill 2026-06-25, no live writer) duplicate existing pairs -> delete.
DELETE FROM platform.associations
 WHERE source_type = 'war_room' AND target_type = 'project' AND label = 'about'
   AND EXISTS (
     SELECT 1 FROM platform.associations b
     WHERE b.source_type = 'project' AND b.target_type = 'war_room'
       AND b.source_id = platform.associations.target_id
       AND b.target_id = platform.associations.source_id);

UPDATE platform.association_types
   SET container_side = 'source', conveys_max = 'editor',
       notes = 'Canonical direction: project contains war room. Live FE writer (setRoomProjectThunk) writes project->war_room. Wave 1 2026-07-06.'
 WHERE source_type = 'project' AND target_type = 'war_room' AND label IS NULL;

UPDATE platform.association_types
   SET is_active = false, container_side = 'none',
       notes = 'RETIRED direction — canonical is project->war_room (container_side=source). Duplicate about-edges deleted 2026-07-06. Enforcement will reject new writes of this shape.'
 WHERE source_type = 'war_room' AND target_type = 'project' AND label IS NULL;

-- §2.4 Wave 1: containment flips (item -> container, so container_side='target')
UPDATE platform.association_types
   SET container_side = 'target',
       notes = 'Wave 1 containment — cascade enabled 2026-07-06'
 WHERE label IS NULL AND (source_type, target_type) IN (
   ('note','thread'), ('file','thread'), ('conversation','thread'),
   ('studio_session','thread'), ('thread','war_room'),
   ('working_document','conversation'),
   ('note','task'), ('artifact','task'), ('conversation','task'),
   ('note','project'), ('research_topic','project'),
   ('fc_card','fc_set')
 );

-- message->task: readable through the task, never editable (decision table row 12)
UPDATE platform.association_types
   SET container_side = 'target', conveys_max = 'viewer',
       notes = 'Wave 1 containment — viewer cap: referenced messages readable via task, not editable. 2026-07-06'
 WHERE label IS NULL AND source_type = 'message' AND target_type = 'task';
