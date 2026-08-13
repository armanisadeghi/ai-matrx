-- Keep the canonical sharing registry aligned with education.quiz_sessions.
-- The table's legacy user_id column was dropped during the 2026-08-12
-- canonical changeover; created_by is now its sole owner column.

update platform.shareable_resource_registry
set owner_column = 'created_by'
where resource_type = 'quiz_session'
  and schema_name = 'education'
  and table_name = 'quiz_sessions'
  and owner_column is distinct from 'created_by';
