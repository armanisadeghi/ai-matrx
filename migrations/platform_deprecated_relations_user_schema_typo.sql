-- platform_deprecated_relations_user_schema_typo.sql
--
-- THE RETIREMENT LEDGER NAMES A SCHEMA THAT HAS NEVER EXISTED.
-- Three platform.deprecated_relations rows written on 2026-06-28 point their
-- `new_ref` at `user.<table>`. There is no `user` schema on this database and
-- there never has been -- the schema is `users` (verified: pg_namespace holds
-- `users`, not `user`). All three successors are live tables today:
--     user.invitation_codes     -> users.invitation_codes
--     user.invitation_requests  -> users.invitation_requests
--     user.profiles             -> users.profiles
--
-- WHY THIS MATTERS. db-rules §0.7 / §9 make platform.deprecated_relations THE
-- retirement ledger: "log the change in platform.deprecated_relations". A ledger
-- whose `new_ref` cannot be resolved is not a record of where the data went --
-- it is a dead end. This is a fact repair, toward the contract. No relation, no
-- registry row, no grant, no policy and no permission is touched.
--
-- HOW IT WAS FOUND. Sweeping platform.entity_types for rows whose relation does
-- not resolve surfaced the token `profile` -> `user.profiles`. That token is a
-- SUPERSEDED DUPLICATE, not a retirement: the physical table is alive at
-- users.profiles and is correctly registered under the active token
-- `user_profile` (which carries all 230 history.row_versions rows; `profile`
-- carries zero). The same 2026-06-27 batch typo'd the schema in both the
-- registry row and the ledger. Only the ledger is repaired here -- db-rules §1
-- forbids hand-pointing entity_types.schema_name/table_name, and the disposition
-- of the `profile` registry row is an open doctrine question for the owner.
--
-- NOT IN SCOPE, deliberately. The 14 dangling platform.entity_types rows are
-- LEFT AS THEY ARE. They match, exactly, the terminal state the platform's own
-- drop path writes: platform.flag_entity_types_on_drop() sets
-- `is_active=false, table_ref=NULL` and does not delete the row, and
-- platform._enforce_entity_is_table() calls an unresolvable row "the
-- stale-registry lane, not this guard's job". db-rules §1 agrees:
-- "table_ref IS NULL = the table is gone: the defined needs-reconcile/retire
-- signal, NOT an anomaly". See the change log entry for the full reasoning.

BEGIN;

UPDATE platform.deprecated_relations
   SET new_ref = 'users.' || substring(new_ref from 6)
 WHERE new_ref LIKE 'user.%';

-- ---------------------------------------------------------------------------
-- Verify in-transaction; roll the whole thing back on any deviation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  -- Exactly the three rows, no more.
  SELECT count(*) INTO n FROM platform.deprecated_relations
   WHERE old_ref IN ('public.invitation_codes','public.invitation_requests','public.profiles')
     AND new_ref IN ('users.invitation_codes','users.invitation_requests','users.profiles');
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected 3 repaired rows, found %', n;
  END IF;

  -- No `user.` reference may survive anywhere in the ledger.
  SELECT count(*) INTO n FROM platform.deprecated_relations
   WHERE new_ref LIKE 'user.%' OR old_ref LIKE 'user.%' OR archived_as LIKE 'user.%';
  IF n <> 0 THEN
    RAISE EXCEPTION '% ledger row(s) still name the nonexistent `user` schema', n;
  END IF;

  -- Every repaired successor must be a LIVE BASE TABLE -- the whole point.
  SELECT count(*) INTO n FROM platform.deprecated_relations dr
   JOIN pg_class c ON c.oid = to_regclass(dr.new_ref)
   WHERE dr.old_ref IN ('public.invitation_codes','public.invitation_requests','public.profiles')
     AND c.relkind IN ('r','p');
  IF n <> 3 THEN
    RAISE EXCEPTION 'only % of 3 repaired successors resolve to a live base table', n;
  END IF;

  -- Ledger size unchanged: this repairs rows, it does not add or drop history.
  SELECT count(*) INTO n FROM platform.deprecated_relations;
  IF n <> 373 THEN
    RAISE EXCEPTION 'deprecated_relations row count changed: expected 373, found %', n;
  END IF;

  -- The registry is untouched: the 14 stale rows must still be exactly 14,
  -- and every one of them still inactive.
  SELECT count(*) INTO n FROM platform.entity_types
   WHERE to_regclass(format('%I.%I', schema_name, table_name)) IS NULL;
  IF n <> 14 THEN
    RAISE EXCEPTION 'entity_types stale count changed: expected 14, found %', n;
  END IF;
  SELECT count(*) INTO n FROM platform.entity_types
   WHERE to_regclass(format('%I.%I', schema_name, table_name)) IS NULL AND is_active;
  IF n <> 0 THEN
    RAISE EXCEPTION '% stale registry row(s) are ACTIVE', n;
  END IF;

  RAISE NOTICE 'OK: 3 ledger rows repointed user.* -> users.*; registry untouched';
END $$;

COMMIT;
