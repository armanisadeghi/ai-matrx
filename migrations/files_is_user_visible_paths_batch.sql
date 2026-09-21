-- A SET-BASED FORM OF THE ONE VISIBILITY PREDICATE (folder-sync D16, L5-4).
--
-- `files.is_user_visible_path(text)` is THE predicate the sync feed and the
-- browser tree share. Its parity guard — matrx-frontend's
-- `features/files/utils/user-visible-parity.ts` — asked it once per distinct
-- path over 18,710 rows and never finished: a verification seat killed the run
-- three times on 2026-09-21 without ever reaching part B's verdict. A guard
-- that cannot finish is unmeasured, and an unmeasured guard is not a pass.
--
-- This is the same rule, asked once for a whole corpus: 4,945 distinct paths in
-- 0.8 seconds. It adds NO second rule — the body calls the scalar function, so
-- the two can never disagree.
--
-- RETURNS jsonb, NOT SETOF, deliberately. PostgREST caps a set-returning RPC at
-- `db-max-rows`, which is 1000 here: the first version of this function was a
-- `returns table`, and a 2000-path batch came back with 1000 verdicts and no
-- error — the same unmeasured-reads-as-measured failure one layer down. A jsonb
-- object is one value and is never truncated.
--
-- Applied to brsgrqvjdzwihsvnfqkf through the Supabase MCP on 2026-09-21 and
-- verified there; this file is the record. Everything below is idempotent.

drop function if exists files.is_user_visible_paths(text[]);

create or replace function files.is_user_visible_paths(p_paths text[])
returns jsonb
language sql
immutable
parallel safe
as $$
  select coalesce(jsonb_object_agg(p, files.is_user_visible_path(p)), '{}'::jsonb)
  from (select distinct unnest(coalesce(p_paths, '{}'::text[])) as p) s;
$$;

comment on function files.is_user_visible_paths(text[]) is
  'Set-based form of files.is_user_visible_path: one round trip for a whole corpus, returned as a jsonb path->boolean object. Added 2026-09-21 for folder-sync L5-4 — the browser/daemon visibility parity guard issued one RPC per path over 18,710 rows and never finished, which made an unmeasured guard read as a slow one. Returns jsonb rather than SETOF deliberately: PostgREST caps a set-returning RPC at db-max-rows (1000) and would silently drop paths, which is the same unmeasured-reads-as-measured failure one layer down. Pure, IMMUTABLE, no table access; same verdict as the scalar function by construction.';

revoke all on function files.is_user_visible_paths(text[]) from public;
grant execute on function files.is_user_visible_paths(text[]) to authenticated, service_role;
