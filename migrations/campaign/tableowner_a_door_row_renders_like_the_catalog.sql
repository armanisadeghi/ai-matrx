-- chair-step: one CREATE OR REPLACE of a live function body and one UPDATE on platform.client_callable_door. The additive allow-list refuses both by name, and correctly so. What changes in the function is its SET search_path — the body is the same single call it always was — and the UPDATE rewrites nothing but the RENDERING of a signature already in the row: it replaces `public.permission_level` with `permission_level` on the three rows whose stored text disagrees with the catalog, matched by identity_argtypes, which is the search-path-free key. No door moves, no grant changes, no function gains or loses a caller.
-- based-on: iam.door_identity_args(oid) 552a5c562793d7ba1003a207b0e3f634612f09004cfdc022a3c09d7b9467f995
--
-- TABLE-OWNER — A DOOR ROW RENDERS THE WAY THE CATALOG RENDERS.
--
-- `iam.door_identity_args(oid)` is the helper every lane uses to write
-- `platform.client_callable_door.identity_args`. It runs `SET search_path TO 'pg_catalog'`,
-- and `pg_get_function_identity_arguments` schema-qualifies any type that is not visible on
-- the path. So a door whose signature names a type outside `pg_catalog` — every enum on this
-- platform, `public.permission_level` above all — is written as
--
--     p_required public.permission_level
--
-- while every reader of that column renders the same catalog from an ordinary session, whose
-- search_path carries `public`, and reads
--
--     p_required permission_level
--
-- Two renderings of one signature, and the two strings never match. `pnpm check:store-doors-decide`
-- joins on that text, so a door with an enum argument is reported as "declared, but no function
-- in schema custom has that exact signature" while both the door and the function are perfectly
-- fine. The SHARE lane hit it on 2026-09-19 and repaired its own two rows by hand
-- (share_the_door_row_says_the_signature_the_catalogue_says.sql); W2-PRED and W1-ORG hit the
-- same rendering inside `platform._provision_shape_settled` and repaired both of its arms by
-- comparing `identity_argtypes` instead. Nobody fixed the helper, so the next lane declaring a
-- door with an enum argument writes the wrong text again.
--
-- THE CENSUS, on the main database, immediately before this file (every door row in every
-- schema whose stored `identity_args` is not what the catalog renders for the very same
-- function, matched by `identity_argtypes`):
--
--     iam.may_touch_field        … p_level_on_record public.permission_level, p_action text
--     iam.visible_field_ids      … p_level_on_record public.permission_level, p_action text
--     public.has_permission_for  … p_required_permission public.permission_level
--
--     3 rows.
--
-- THE FIX is the helper's own search_path: `public` and `extensions`, which is what an ordinary
-- session carries, so the string it writes is the string every reader will render back.
-- `pg_catalog` is searched first regardless and needs no mention. Then one sweep over the class
-- — every stale row, not the two somebody noticed — taken from the catalog in this transaction
-- so nothing is hard-coded, and a new census (census 9 in `check:store-doors-decide`) that
-- keeps it closed.

create or replace function iam.door_identity_args(p_oid oid)
returns text
language sql
stable
set search_path to 'public', 'extensions'
as $fn$ select pg_catalog.pg_get_function_identity_arguments(p_oid); $fn$;

comment on function iam.door_identity_args(oid) is
  'The one rendering of a door signature. Runs on the search_path an ordinary session carries, '
  'so a type outside pg_catalog (every enum) is written the way every reader renders it back. '
  'TABLE-OWNER 2026-09-19: it used to run at pg_catalog only and wrote public.permission_level '
  'where the door census reads permission_level, and the two strings never matched.';

update platform.client_callable_door d
   set identity_args = iam.door_identity_args(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = d.schema_name
   and p.proname = d.function_name
   and d.identity_argtypes is not null
   and platform.door_argtypes(p.proargtypes) = d.identity_argtypes
   and d.identity_args is distinct from iam.door_identity_args(p.oid);
