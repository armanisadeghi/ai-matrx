-- chair-step: restore the Notes folder organization key after a live 23505 proved the org-blind (created_by, name) index returned. A person must be able to own "Draft" in each organization; this removes only the retired key and rebuilds the required organization key as partial for soft deletes. No rows change.

-- The initial cutover was applied through the MCP and its pending chair-step file
-- deleted. System errors d74dd7fe-329e-4a8e-8bcf-302506539f30,
-- d1778d31-9fd9-4d13-b1f2-0fc50aee8a75, and
-- a42c0726-2696-4ade-8a0a-2c67fb9ec04f prove that the retired key is live
-- again. This named, non-swept repair is deliberately idempotent: the required
-- final schema is the same whether a prior cutover completed or was reverted.
--
-- `workbench.note_folder_get_or_create` is the sole browser writer. Its partial
-- organization-qualified arbiter permits one name per actor per organization;
-- the legacy key prevents that and causes the named 23505 refusal. The partial
-- predicate is also necessary because deleted folders must release their names.

SET LOCAL lock_timeout = '2s';

DROP INDEX IF EXISTS workbench.note_folders_created_by_name_unique;
DROP INDEX IF EXISTS workbench.note_folders_organization_created_by_name_unique;
CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique
  ON workbench.note_folders (organization_id, created_by, name)
  WHERE deleted_at IS NULL;

DO $proof$
DECLARE
  v_predicate text;
BEGIN
  IF to_regprocedure('workbench.note_folder_get_or_create(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'notes folder cutover: workbench.note_folder_get_or_create is absent';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'workbench'
       AND c.relname = 'note_folders_created_by_name_unique'
       AND i.indrelid = 'workbench.note_folders'::regclass
  ) THEN
    RAISE EXCEPTION 'notes folder cutover: the org-blind name key is still present';
  END IF;

  SELECT pg_get_expr(i.indpred, i.indrelid)
    INTO v_predicate
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'workbench'
     AND c.relname = 'note_folders_organization_created_by_name_unique'
     AND i.indrelid = 'workbench.note_folders'::regclass
     AND i.indisunique
     AND i.indisvalid
     AND i.indisready;

  IF coalesce(v_predicate, '') NOT ILIKE '%deleted_at is null%' THEN
    RAISE EXCEPTION 'notes folder cutover: organization key is absent or not partial on deleted_at (predicate: %)', v_predicate;
  END IF;
END
$proof$;
