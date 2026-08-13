-- Applied live 2026-08-12 (hardening pass task_b4bd08d8, Arman-ratified in-session).
-- G4 of operations/db-hardening-proposals.md: close the ONE-TOKEN hole in
-- permissions_validate_resource_type. The old body accepted
-- `r.table_name = NEW.resource_type` — a grant keyed on a TABLE NAME would be accepted
-- and then silently ignored by iam.has_access forever (db-rules §6c: registry table_name
-- is routing only, NEVER the grant token). Now token-only, loud instructive error.
-- Pre-apply writer sweep (2026-08-12): 0 stored rows relied on the hole; all six DB
-- writer functions pass tokens (share_resource_with_user/org insert the registry's
-- resolved token; dm_participant_sync_grant='dm_conversation' and
-- workspace._sync_task_assignee_grant='task' both pass the token arm); FE writes go
-- through the share RPCs; aidream only reads iam.permissions.
CREATE OR REPLACE FUNCTION public.permissions_validate_resource_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.shareable_resource_registry r
    WHERE r.is_active AND r.resource_type = NEW.resource_type
  ) THEN
    RAISE EXCEPTION 'permissions.resource_type=% is not a registered sharing TOKEN. Pass the entity token (platform.entity_types.token = shareable_resource_registry.resource_type) — a table name here would be stored and then silently ignored by iam.has_access, which is the bug this guard kills. See db-rules §6c.',
      NEW.resource_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
