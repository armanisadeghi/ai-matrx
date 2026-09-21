-- chair-step: `platform` and `iam` are REVOKE-protected schemas (scripts/lib/migration-target.ts
-- REVOKE_PROTECTED_SCHEMAS), so a withdrawal of a client write privilege in either of them is
-- never an ordinary migration. This file is the chair's, and it is HEADER-LESS on purpose.
--
-- lane: DOORS-ONLY-5
--
-- 🚨 READ THIS FIRST: THIS FILE IS CURRENTLY A NO-OP, AND THAT IS THE FINDING.
--
-- This lane closed `platform.saved_view` and expected to hand its dead write GRANT up here, the
-- way DOORS-ONLY-3 handed up thirty-three tables in
-- migrations/campaign/chairstep_doorsonly3_revoke_client_writes.sql. It did not need to.
--
-- WHY, measured rather than assumed. DOORS-ONLY-4 taught `iam.apply_table_grants` that a schema
-- DECLARED doors-only in `platform.schema_client_exposure` takes the READ-ONLY client grant and
-- has its COLUMN-LEVEL write grants withdrawn BY NAME, and asserts the privilege is gone before
-- it returns. So the last step of `saved_view`'s cutover --
-- doorsonly5_saved_view_leaves_the_pending_register.sql, which deletes the table's
-- `platform.doors_only_pending_cutover` row and re-runs the canonical route -- withdrew the
-- write grants itself, through the generator, inside the campaign runner. The guard confirms
-- it: `saved_view`'s three triples did not move from OPEN to RESIDUAL, they LEFT THE CENSUS
-- ENTIRELY (138 -> 135), which is the only shape that means "grant revoked AND no permissive
-- write policy names the role".
--
-- THE RULE THAT FALLS OUT OF IT, and it is worth more than this file:
--
--   In a DECLARED doors-only schema, the canonical route is the revoke. A chair step is needed
--   only for a table the generator cannot reach -- one the canonical route refuses by name
--   (a missing base column, an undeclared column-exclusion design, a class/grant contradiction),
--   or one whose `audit_class` is `machinery`, which `iam.apply_rls` refuses outright.
--
-- `platform.rulebook` and `platform.categories` are the two tables still holding a
-- pending-cutover row. When `rulebook` finishes its cutover it will take the same route as
-- `saved_view` and need nothing here. `platform.categories` WILL need a chair step, because the
-- canonical route refuses it by name (DD-249 / R12: 355 rows marked `visibility = 'public'` with
-- an `anon` SELECT grant, on a class that emits no anonymous lane), so its grants cannot be
-- withdrawn by the generator and will have to be withdrawn here instead. That file is written
-- by whichever lane closes `categories`, with its census, and not speculatively now.
--
-- So: nothing to run. Deliberately left in place rather than deleted, because the NEXT lane's
-- first instinct will be to write one of these, and the reason it usually does not need to is
-- the thing worth finding here.

do $$
begin
  raise notice 'chairstep_doorsonly5: nothing to revoke. platform.saved_view''s client write grants were withdrawn by the canonical route (iam.apply_table_grants) when its doors_only_pending_cutover row was deleted, which is what a DECLARED doors-only schema now does by itself. See the header for when a chair step IS still needed.';
end $$;
