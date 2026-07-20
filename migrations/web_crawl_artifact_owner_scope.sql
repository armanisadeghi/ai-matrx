-- `created_by` remains the truthful initiating actor, but system artifacts do
-- not gain unconditional owner read access. Their access follows the directly
-- referencing site, so removing an editor from a site also revokes artifact
-- reads without rewriting file ownership or copying grants.

alter policy std_select on files.files
using (
  (
    created_by = (select auth.uid())
    and coalesce(metadata ->> 'system_artifact', 'false') <> 'true'
  )
  or iam.has_access('file', id, 'viewer')
  or files.can_read_web_artifact(id)
);
