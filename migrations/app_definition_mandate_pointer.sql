-- Phase 6.9 — apps point at mandates. APPLIED LIVE via Supabase MCP; this file
-- is the record, not the mechanism (matrx-frontend/CLAUDE.md § Migrations).
--
-- THE ASSOCIATIONS-LAW JUSTIFICATION (one line, per the register):
--   an app's JOB pointer is a 1:1 hot-path property of the app — read on every
--   single run, exactly like mandate.definition's own default_holder_id — so it
--   is a COLUMN, not a platform.associations row. Composition-adjacent? NO: it
--   references mandate.definition across schemas, which is precisely the 1:1
--   property case the law carves out for a column.
--
-- Additive and NULLABLE: `agent_id` stays NOT NULL and stays the serving source
-- until APP_MANDATE_CUTOVER flips (features/agent-apps/lib/appHolder.ts).
-- Backfill + parity: aidream/scripts/migrate_apps_to_mandates.py.

ALTER TABLE app.definition
  ADD COLUMN IF NOT EXISTS mandate_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app.definition'::regclass
      AND conname = 'definition_mandate_id_fkey'
  ) THEN
    ALTER TABLE app.definition
      ADD CONSTRAINT definition_mandate_id_fkey
      FOREIGN KEY (mandate_id) REFERENCES mandate.definition(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS definition_mandate_id_idx
  ON app.definition (mandate_id)
  WHERE mandate_id IS NOT NULL;

COMMENT ON COLUMN app.definition.mandate_id IS
  'The JOB this app fronts (mandate.definition). Nullable while the parallel '
  'build ships dark; with APP_MANDATE_CUTOVER ON the app resolves its Holder '
  'through this mandate instead of the pinned agent_id, so a rebind moves the '
  'app''s runs with no deploy. Phase 6.9, DESIGN-unification 5.2.';
