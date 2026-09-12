-- version_restore_honest_refusals.sql   (DD / B-18, Q85)
--
-- THE DEFECT: `public.version_restore(token, id, version)` had exactly one
-- refusal for three different situations, and it told the truth in none of them.
--
--   1. A TOKEN WHOSE RELATION DOES NOT EXIST. The function reads schema_name /
--      table_name off `platform.entity_types` and then asks
--      information_schema.columns for that relation's columns. If the relation
--      is gone (renamed into `graveyard`, never built, or -- the case that
--      matters next -- a per-table token for a custom entity that deliberately
--      names no relation), the column list comes back empty and the user is told
--      "nothing to restore (no content columns)", which is false: the columns
--      are not missing, the TABLE is.
--      REPRODUCED LIVE 2026-09-11 in a rolled-back transaction: a registered,
--      ACTIVE token naming `custom.b18_no_such_table` returns `P0001 access
--      denied` -- worse than confusing, it is a statement about permissions for
--      something that is not a permissions problem. (`iam.has_access` ran first
--      and `platform.entity_row_access_attrs` reports "row not found" for a
--      missing relation.) 16 registered tokens name a relation that does not
--      exist today; all 16 are is_active=false, which is the only reason the
--      class is not currently reachable through this door.
--   2. A TABLE WITH ONLY BASE COLUMNS. REPRODUCED LIVE the same way: an active
--      token on a real table holding only id/organization_id/created_by/
--      created_at/updated_at/updated_by/version/deleted_at returns `P0001
--      nothing to restore (no content columns)`. That sentence is TRUE here and
--      is kept -- in a form a person can act on.
--   3. A SNAPSHOT THAT PREDATES THE TABLE'S COLUMNS. This was silent, and it is
--      the worst of the three. The UPDATE set EVERY content column from
--      `jsonb_populate_record(NULL::tbl, snapshot)`, and jsonb_populate_record
--      yields NULL for any key the snapshot does not carry. So restoring a
--      version taken before a column existed did not "restore" it -- it WIPED it
--      to NULL, or failed on a NOT NULL column. Restore is documented as
--      non-destructive (db-rules §7).
--
-- THE FIX
--   * Resolve the registry row and its relation FIRST, with `to_regclass`, and
--     refuse a missing relation in its own sentence naming the token and the
--     relation the registry claims. Deliberately BEFORE the access check: with a
--     missing relation the access walk cannot answer, and answering "access
--     denied" is a lie. What this exposes is the registry's own
--     schema/table mapping, which `platform.entity_types` already publishes.
--   * Restore only the content columns the SNAPSHOT ACTUALLY CARRIES
--     (`snapshot ? column_name`). Columns added after the snapshot keep their
--     current values instead of being nulled. jsonb content columns
--     (`data`, `custom_fields`, `metadata`, ...) were already ordinary content
--     columns and stay so -- verified on platform.custom_record, whose `data`
--     jsonb is restored like any other column.
--   * Refuse only when the SNAPSHOT holds none of them, with a sentence that
--     says which of the two situations it is: the table has no content columns
--     at all, or this particular saved version holds none of them.
--   * Order both `string_agg`s by `ordinal_position`. Unordered string_agg has
--     no defined order, and the column list and the SELECT list were built by
--     two separate aggregates that had to agree -- they were only ever agreeing
--     by luck.
--
-- UNCHANGED, deliberately: the excluded set (id, organization_id, created_by,
-- created_at, updated_at, updated_by, version, deleted_at), the editor-level
-- access requirement, the "live row not found" refusal, and the return value.
-- `deleted_at` stays excluded, so restoring a version of a REMOVED row puts its
-- content back and leaves it removed -- that is db-rules §7's contract
-- ("Restore never touches ... deleted_at"), and undelete is a separate door
-- (`public.entity_undelete`).
--
-- Idempotent. Safe to re-run. Reversible: restore the prior body to undo.

-- `pnpm db:apply` sends this whole file in ONE transactional call, so the file
-- carries no BEGIN/COMMIT of its own (EXECUTE of transaction commands is not
-- implemented on that transport).

CREATE OR REPLACE FUNCTION public.version_restore(p_token text, p_id uuid, p_version integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_s text; v_t text; v_rel regclass; v_snap jsonb;
  v_cols text; v_sel text; v_new int; v_n int; v_content int;
BEGIN
  SELECT schema_name, table_name INTO v_s, v_t FROM platform.entity_types WHERE token = p_token;
  IF v_s IS NULL THEN RAISE EXCEPTION 'unknown token %', p_token; END IF;

  v_rel := to_regclass(quote_ident(v_s) || '.' || quote_ident(v_t));
  IF v_rel IS NULL THEN
    RAISE EXCEPTION 'cannot restore %: the registry says this type lives in %.%, and no such table exists, so there is nothing to restore into. Point the registry row at a real table, or restore this type through its own door.',
      p_token, v_s, v_t;
  END IF;

  IF NOT iam.has_access(p_token, p_id, 'editor') THEN RAISE EXCEPTION 'access denied'; END IF;

  SELECT row_data INTO v_snap FROM history.row_versions
   WHERE entity_type=p_token AND row_id=p_id AND version=p_version ORDER BY id DESC LIMIT 1;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'version % not found for % %', p_version, p_token, p_id; END IF;

  -- content columns only: never touch identity/ownership/lineage/managed cols,
  -- and never a column this snapshot does not carry (that would null it out).
  SELECT count(*) INTO v_content
  FROM information_schema.columns
  WHERE table_schema=v_s AND table_name=v_t AND is_generated='NEVER'
    AND column_name NOT IN ('id','organization_id','created_by','created_at','updated_at','updated_by','version','deleted_at');
  IF v_content = 0 THEN
    RAISE EXCEPTION 'cannot restore %: every column of %.% is identity, ownership or lifecycle bookkeeping, so a saved version of it holds no content to put back.',
      p_token, v_s, v_t;
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg('r.'||quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols, v_sel
  FROM information_schema.columns c
  WHERE table_schema=v_s AND table_name=v_t AND is_generated='NEVER'
    AND column_name NOT IN ('id','organization_id','created_by','created_at','updated_at','updated_by','version','deleted_at')
    AND v_snap ? c.column_name::text;
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'cannot restore % version %: that saved version holds none of the % content column(s) of %.%, so there is nothing in it to put back.',
      p_token, p_version, v_content, v_s, v_t;
  END IF;

  EXECUTE format('UPDATE %I.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I.%I, $1) r) WHERE t.id=$2',
                 v_s, v_t, v_cols, v_sel, v_s, v_t) USING v_snap, p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'live row % not found (restore of hard-deleted rows unsupported)', p_id; END IF;

  EXECUTE format('SELECT version FROM %I.%I WHERE id=$1', v_s, v_t) INTO v_new USING p_id;
  RETURN v_new;
END; $function$;

