-- public_mnd_list_scoped_invoker_dd137c4_fix1 — THE LADDER'S "SERVER" TEST NEVER MATCHED
-- (repairs DD-137c step 4; live outage 2026-09-12 18:32Z → 18:5xZ: every mandate resolved to no rungs)
--
-- WHAT BROKE. dd137c4 added chokepoint 3 to `mandate._rungs`:
--     AND (current_user = 'service_role' OR iam.has_access('mandate', x.id, 'viewer'))
-- `_rungs` is SECURITY DEFINER and owned by `postgres`. Inside a SECURITY DEFINER function
-- `current_user` IS THE OWNER — it is `postgres` for every caller, so the left side is never true.
-- The server (AI Dream) does not connect as `service_role` either (its pooler login is a
-- `postgres…` role), and it calls the ladder with no JWT, so `iam.has_access` → `auth.uid()` is
-- NULL → false. Net effect from 18:32Z: `mandate.resolve_for(<any key>, …)` returned ZERO rows for
-- every mandate — the Masterwork Conductor answered "the resolution door returned no rungs for a
-- mandate that exists", and so did every other mandate-backed surface. Measured live before this
-- fix: `resolve_for('masterwork.conductor', …)` → 0 rows, `resolve_for('masterwork.understudy', …)`
-- → 0 rows, as `postgres` and as the server.
--
-- THE HONEST TEST. "Is this a client?" is answered by the connection, not by `current_user`:
--   * a browser reaches Postgres through PostgREST, whose login role is `authenticator`
--     (`session_user`, which SET ROLE and SECURITY DEFINER never change), and it carries JWT claims;
--   * the server impersonating a person (`rls_session` / `acting_as_user`) sets
--     `request.jwt.claims` transaction-locally, so `auth.uid()` is real and the kernel must be asked;
--   * the server on its own pool connection has neither, and is not narrowed — exactly the intent
--     dd137c4 wrote in its comment ("the service role, which is how the server reads, is not a
--     client and is not narrowed").
-- So the guard becomes: not narrowed only when (session_user <> 'authenticator' AND no JWT claims
-- are set); otherwise the kernel decides. `anon` through PostgREST has no `sub` → has_access is
-- false → no rungs, as before.
--
-- SIBLINGS (census, not changed here): `browser._action_event_append_only` and
-- `hr.rpc_calculation_snapshot_get` carry the same `current_user = 'service_role'` test inside a
-- SECURITY DEFINER body owned by `postgres`; their "server" branches never fire either. Their owners
-- decide what those branches were meant to do.
--
-- Applied LIVE through the Supabase MCP on 2026-09-12 (outage repair; the authoring sandbox has no
-- Postgres egress). This file is the RECORD; `pnpm db:apply` from a connected checkout re-runs it as
-- a no-op (the anchor is gone after the first run, and the DO block says so instead of failing).

do $$
declare v_def text; v_new text;
  v_old_anchor text := E'      AND (current_user = ''service_role'' OR iam.has_access(''mandate'', x.id, ''viewer''))';
  v_new_anchor text :=
    E'      -- dd137c4_fix1: inside SECURITY DEFINER, current_user IS THE OWNER (postgres), never\n'
    '      -- service_role. A client is a PostgREST connection (session_user = authenticator) or any\n'
    '      -- caller carrying JWT claims (the server impersonating a person); only a bare server\n'
    '      -- connection is not narrowed.\n'
    '      AND ((session_user <> ''authenticator''\n'
    '            AND nullif(current_setting(''request.jwt.claims'', true), '''') IS NULL)\n'
    '           OR iam.has_access(''mandate'', x.id, ''viewer''))';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'mandate' and p.proname = '_rungs';
  if v_def is null then raise exception 'dd137c4_fix1: mandate._rungs does not exist'; end if;
  if position(v_new_anchor in v_def) > 0 then
    raise notice 'dd137c4_fix1: already applied — nothing to do';
    return;
  end if;
  v_new := replace(v_def, v_old_anchor, v_new_anchor);
  if v_new = v_def then
    raise exception 'dd137c4_fix1: mandate._rungs no longer contains the dd137c4 guard this file '
                    'repairs — it changed underneath and must be re-read, never patched blind.';
  end if;
  execute v_new;
end $$;

-- PARITY: the ladder must resolve a system mandate for a bare (non-client) connection again.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from mandate._rungs(
      ARRAY(select d.id from mandate.definition d where d.mandate_key = 'masterwork.conductor' and d.deleted_at is null limit 1),
      null::uuid, null::uuid);
  if v_n = 0 then
    raise exception 'dd137c4_fix1: mandate._rungs still returns no rungs for masterwork.conductor on a bare connection';
  end if;
end $$;
