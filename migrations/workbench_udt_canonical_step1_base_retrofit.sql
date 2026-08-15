-- workbench_udt_canonical_step1_base_retrofit.sql
-- ---------------------------------------------------------------------------
-- STEP 1 of 4 — bring the four user-content UDT entities onto the canonical
-- base entity contract (visibility enum + created_by owner).
--
--   workbook         workbench.udt_workbooks         (17 rows)
--   udt_document     workbench.udt_documents         (24 rows)
--   dataset          workbench.udt_datasets         (140 rows)
--   structured_list  workbench.udt_structured_lists  (28 rows)
--
-- These are user-created WORK PRODUCT, not private-personal things. They each
-- already carried organization_id, but with no `visibility` column there was no
-- way to express "share this with my org" — every row was private-or-world.
-- (Arman's ruling 2026-08-15: "Everything in our database should essentially be
-- the same unless it's truly a private personal thing.")
--
-- This step is DDL + backfill only. It deliberately changes NO access: RLS is
-- still the legacy user_id/is_public policy set until step 2.
--
-- BACKFILL DEFAULTS (db-rules.md §6: org work defaults `internal`;
-- `visibility='personal'` means "belongs to an individual person"):
--   is_public = true                      -> 'public'    (9 rows; already world-readable)
--   is_public = false, organization_id set-> 'internal'  (192 rows)
--   is_public = false, no organization_id -> 'personal'  (8 rows)
--
-- Measured before choosing: of the 192 rows going to 'internal', 181 sit in a
-- PERSONAL or single-member organization, where 'internal' reaches exactly one
-- person — the owner — so nothing widens. Only 11 rows live in genuinely
-- multi-member organizations, and those teammates gaining access IS the point
-- of this change, not a side effect of it.
--
-- created_by already existed on all four and was already populated for 206 of
-- 209 rows; the 3 exceptions are NULL, never a DIFFERENT user, so
-- coalesce(created_by, user_id) is lossless and no row changes owner.
-- ---------------------------------------------------------------------------

-- 1. visibility column. Deliberately NULLABLE with NO DEFAULT for the duration
--    of the migration window: NULL is the signal the bridge trigger below uses
--    to tell "a legacy writer said nothing about visibility" (derive it from
--    is_public/organization_id) from "a canonical writer set it explicitly"
--    (honor it, and mirror it back onto is_public). A column default would
--    erase that distinction. Step 4 installs the permanent default.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format(
      'ALTER TABLE workbench.%I ADD COLUMN IF NOT EXISTS visibility platform.visibility', t);
  END LOOP;
END $$;

-- 2. Backfill visibility from the legacy boolean + org presence.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format($f$
      UPDATE workbench.%I SET visibility =
        CASE
          WHEN COALESCE(is_public, false) THEN 'public'::platform.visibility
          WHEN organization_id IS NOT NULL THEN 'internal'::platform.visibility
          ELSE 'personal'::platform.visibility
        END
      WHERE visibility IS NULL
    $f$, t);
  END LOOP;
END $$;

-- 3. Backfill created_by from user_id. Lossless: only fills NULLs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format(
      'UPDATE workbench.%I SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. TRANSITION BRIDGE — keeps the canonical columns (created_by, visibility)
--    and the legacy columns (user_id, is_public) in permanent agreement while
--    consumers are converted, in BOTH directions. There is therefore no
--    half-state: whichever spelling a writer uses, both are correct afterwards,
--    and every reader — converted or not — sees the same truth.
--
--    Roughly 30 SECURITY DEFINER RPCs (create_user_list, get_user_tables,
--    udt_upsert_row, update_user_table_metadata, …) plus aidream's picklists
--    router still write user_id/is_public. Canonical RLS keys on created_by, so
--    without this bridge a row created through any of those paths would land
--    with created_by NULL and be INVISIBLE TO ITS OWN AUTHOR.
--
--    EXIT (step 4): when every consumer listed in
--    docs/handoffs/workbench-udt-canonicalization.md writes visibility/created_by
--    directly, drop this trigger + function and drop the four tables' user_id
--    and is_public columns.
--
--    Trigger NAME matters: BEFORE-row triggers fire in alphabetical order and
--    the canonical governance guard is `_guard_governance`. `_bridge_legacy_owner`
--    sorts first, so the bridge's derived values are what the guard then judges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION workbench._bridge_legacy_owner()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Owner: accept whichever spelling the writer used; fall back to the caller.
    NEW.created_by := COALESCE(NEW.created_by, NEW.user_id, auth.uid());
    NEW.user_id    := COALESCE(NEW.user_id, NEW.created_by);

    IF NEW.visibility IS NULL THEN
      -- Legacy writer: said nothing about visibility. Derive it exactly as the
      -- step-1 backfill did, so a row created today matches a row backfilled.
      NEW.visibility := CASE
        WHEN COALESCE(NEW.is_public, false) THEN 'public'::platform.visibility
        WHEN NEW.organization_id IS NOT NULL THEN 'internal'::platform.visibility
        ELSE 'personal'::platform.visibility
      END;
    ELSE
      -- Canonical writer: visibility is authoritative, mirror it down.
      NEW.is_public := (NEW.visibility = 'public'::platform.visibility);
    END IF;

  ELSE -- UPDATE
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      NEW.user_id := NEW.created_by;              -- canonical writer wins
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      NEW.created_by := NEW.user_id;              -- legacy writer
    END IF;

    IF NEW.visibility IS NULL THEN
      NEW.visibility := OLD.visibility;           -- never let it go back to NULL
    END IF;

    IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      -- Canonical writer set visibility; is_public is derived from it.
      NEW.is_public := (NEW.visibility = 'public'::platform.visibility);
    ELSIF COALESCE(NEW.is_public, false) IS DISTINCT FROM COALESCE(OLD.is_public, false) THEN
      -- Legacy writer toggled is_public. Going public is unambiguous. Coming
      -- OUT of public must not silently demote an org-shared row to personal,
      -- so it lands on the same default the backfill would have chosen.
      NEW.visibility := CASE
        WHEN COALESCE(NEW.is_public, false) THEN 'public'::platform.visibility
        WHEN NEW.organization_id IS NOT NULL THEN 'internal'::platform.visibility
        ELSE 'personal'::platform.visibility
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _bridge_legacy_owner ON workbench.%I', t);
    EXECUTE format(
      'CREATE TRIGGER _bridge_legacy_owner BEFORE INSERT OR UPDATE ON workbench.%I '
      'FOR EACH ROW EXECUTE FUNCTION workbench._bridge_legacy_owner()', t);
  END LOOP;
END $$;

-- 5. Now that the bridge guarantees both columns are always filled, enforce the
--    canonical contract. NOT NULL is checked AFTER the BEFORE-row trigger, so a
--    legacy INSERT that names neither column still satisfies it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format('ALTER TABLE workbench.%I ALTER COLUMN visibility SET NOT NULL', t);
    EXECUTE format('ALTER TABLE workbench.%I ALTER COLUMN created_by SET NOT NULL', t);
  END LOOP;
END $$;

-- 6. The org lane in iam.has_access_for_base filters on (visibility, organization_id);
--    the owner lane on created_by. Index them the way they are read.
CREATE INDEX IF NOT EXISTS udt_workbooks_created_by_idx        ON workbench.udt_workbooks (created_by);
CREATE INDEX IF NOT EXISTS udt_documents_created_by_idx        ON workbench.udt_documents (created_by);
CREATE INDEX IF NOT EXISTS udt_datasets_created_by_idx         ON workbench.udt_datasets (created_by);
CREATE INDEX IF NOT EXISTS udt_structured_lists_created_by_idx ON workbench.udt_structured_lists (created_by);

CREATE INDEX IF NOT EXISTS udt_workbooks_org_visibility_idx        ON workbench.udt_workbooks (organization_id, visibility);
CREATE INDEX IF NOT EXISTS udt_documents_org_visibility_idx        ON workbench.udt_documents (organization_id, visibility);
CREATE INDEX IF NOT EXISTS udt_datasets_org_visibility_idx         ON workbench.udt_datasets (organization_id, visibility);
CREATE INDEX IF NOT EXISTS udt_structured_lists_org_visibility_idx ON workbench.udt_structured_lists (organization_id, visibility);
