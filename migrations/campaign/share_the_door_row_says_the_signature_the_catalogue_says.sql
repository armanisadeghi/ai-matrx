-- chair-step: two UPDATEs on platform.client_callable_door, which the additive allow-list refuses by name (it admits an INSERT into a registry table, not an UPDATE — and correctly, because an UPDATE can silently retarget a declared door). These two rewrite nothing but the RENDERING of a signature: they replace `public.permission_level` with `permission_level` in the identity_args of two rows this same lane wrote an hour earlier, so the string matches what pg_get_function_identity_arguments prints. No door moves, no grant changes, no function is touched.
--
-- SHARE — A DOOR ROW SAYS THE SIGNATURE THE CATALOGUE SAYS.
--
-- `pnpm check:store-doors-decide` reported:
--
--   [FAIL] declared doors whose grant or signature does not match the live catalog - 2:
--     custom.share_grant(… p_level public.permission_level) - declared, but no function in
--       schema custom has that exact signature
--     custom.share_lane_set(… p_level public.permission_level) - same
--
-- Both functions exist and both are granted. What does not match is the STRING. The door rows
-- were written by `iam.door_identity_args(oid)`, which is `pg_get_function_identity_arguments`
-- rendered at `search_path = pg_catalog` — where `permission_level` is not in scope and
-- Postgres therefore prints it schema-qualified as `public.permission_level`. The census
-- renders the same catalogue with `public` on the path and gets the bare `permission_level`.
-- Two renderings of one signature, and the two strings never match.
--
-- This is the SAME defect W2-ACCESS found and worked around on 2026-09-18 ("the shape guard's
-- `definer_no_door` arm compares the identity string it renders at `search_path = pg_catalog`")
-- — `iam.door_identity_args` is the workaround it built, and this is the case the workaround
-- gets WRONG: it is right for the shape guard, which also renders at pg_catalog, and wrong for
-- the census, which does not. Only a door whose arguments include a type outside pg_catalog is
-- affected, which is why the other five doors this lane wrote are green.
--
-- The rendering is taken from the catalogue in THIS session, whose search_path carries public,
-- so the stored string is the one the census will read back. Nothing is hard-coded.

update platform.client_callable_door d
   set identity_args = p.args
  from (select pr.proname, pg_get_function_identity_arguments(pr.oid) as args
          from pg_proc pr
         where pr.pronamespace = 'custom'::regnamespace
           and pr.proname in ('share_grant', 'share_lane_set')) p
 where d.schema_name = 'custom'
   and d.function_name = p.proname
   and d.identity_args <> p.args;
