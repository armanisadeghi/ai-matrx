-- Reachability rollout §2.1: register container types as shareable resources
-- so iam.permissions rows can be written for them (permissions_validate_resource_type gate).

-- Normalize studio_sessions ownership first (canonical owner col = created_by)
UPDATE transcripts.studio_sessions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, notes)
VALUES
  ('thread', 'workspace', 'threads', 'id', 'created_by', 'visibility',
   'Thread', '/war-room/all', true,
   'Container for the sharing cascade. No standalone route: threads open as /war-room/{room_id}?thread={id}.'),
  ('war_room', 'workspace', 'war_rooms', 'id', 'created_by', 'visibility',
   'War Room', '/war-room/{id}', true,
   'Container for the sharing cascade.'),
  ('project', 'workspace', 'projects', 'id', 'created_by', 'visibility',
   'Project', '/projects/{id}', true,
   'Container for the sharing cascade.'),
  ('studio_session', 'transcripts', 'studio_sessions', 'id', 'created_by', 'is_public',
   'Audio Session', '/transcripts/studio?session={id}', true,
   'Container for the sharing cascade. Legacy is_public column (no visibility yet).')
ON CONFLICT (resource_type) DO NOTHING;
