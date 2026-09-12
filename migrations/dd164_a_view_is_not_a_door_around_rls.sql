-- dd164_a_view_is_not_a_door_around_rls — a view is not a door around RLS.
--
-- THE CLASS (DD-164). A Postgres view created without `security_invoker` runs as
-- its OWNER (postgres here, which is BYPASSRLS). The row-level security on every
-- base table it reads is then never evaluated, and the view's own inline WHERE is
-- the entire access contract — hand-written, invisible to `iam.apply_rls`, to
-- `iam.verify_canonical`, and to every door guard that reads `pg_policy`. Grant
-- such a view to `anon` or `authenticated` and you have published whatever its
-- WHERE forgot.
--
-- MEASURED LIVE 2026-09-12 on `brsgrqvjdzwihsvnfqkf`: THIRTEEN client-readable
-- relations run as their owner. Eleven of the twelve turn out to carry a real
-- caller filter of their own (`is_platform_admin() OR created_by = auth.uid()`,
-- `auth.uid()`, `iam.has_org_access()`) or to publish nothing but platform
-- catalog/registry facts — each is now written down and re-checked every run by
-- `pnpm check:rls-on` ARM B, which this migration's sibling widens from the
-- registry to EVERY client-readable view.
--
-- 🚨 ONE WAS A REAL OPEN DOOR, and the brief did not name it.
-- `agent.context_menu_view` has no caller filter at all and was granted SELECT,
-- INSERT, UPDATE and DELETE to `anon` AND `authenticated`. Probed with the real
-- roles inside a rolled-back transaction:
--
--   as `anon` (logged out, from the internet)
--     view agent_shortcut items ......... 207   RLS on agent.shortcut admits ...  30
--     view category rows ................  66   RLS on platform.categories admits  0
--   as a plain member (test@test.com, 4060701e-706a-4c76-b3ca-0bbc69fa5a14)
--     view agent_shortcut items ......... 207   of which owned by OTHER users .. 177
--     view category rows ................  66   RLS admits ..................... 56
--
-- Each leaked item carries that person's `default_user_input`, `default_variables`,
-- `context_overrides`, `llm_overrides` and `value_mappings` — their prompt content,
-- not just a label.
--
-- THE REPAIR IS NOT A DESIGN GUESS. `mandate.context_menu_view`, the cutover twin
-- of this exact view (`lib/supabase/shortcutStorage.ts` switches between them on
-- SHORTCUT_STORAGE_CUTOVER), already carries `security_invoker=true` and is granted
-- SELECT to `authenticated` only. This migration brings the `agent.` side to the
-- shape its own twin already has. The only consumer, `app/api/agent-context-menu/
-- route.ts`, returns 401 before it reads anything when there is no user, so the
-- `anon` grant fed nothing but the open door.
--
-- THE OTHER TWO CHANGES are the brief's second remedy — a relation that must
-- aggregate across rows the caller may not read is revoked from `authenticated`
-- and gated behind the platform-admin door:
--
--   * `platform.v_lifecycle_enlisted` — 0 rows today, no client consumer at all
--     (only aidream's read-only `VLifecycleEnlisted` model, which runs as the
--     service role). The `authenticated` grant bought nothing and laundered
--     `platform.entity_types`, whose RESTRICTIVE `platform_admin_only` policy
--     admits 0 rows to a plain member. Revoked.
--   * `chat.mv_tool_refetch_summary` — a MATERIALIZED view, which can NEVER carry
--     `security_invoker` and over which RLS never applies: it is a frozen snapshot
--     of the owner's unfiltered read of `chat.request`, `chat.tool_call` and
--     `tool.definition`. Every signed-in user could read the platform's whole
--     tool-call telemetry. It backs ONE admin screen
--     (/administration/reporting/tool-refetch), so it moves behind a declared
--     admin door and the console reads that instead.
--
-- Idempotent (ALTER/REVOKE are repeatable; CREATE OR REPLACE + ON CONFLICT DO
-- NOTHING). Reversible: re-grant, `set (security_invoker = false)`, drop the
-- function. Asserts its premises before acting and its result after.
-- db-rules §6d-4: the `platform.client_callable_door` row is declared BEFORE the
-- GRANT, or `platform.enforce_definer_client_grants` revokes the client EXECUTE
-- inside the GRANT and writes a `ddl_guard_log` row.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

-- ── Premises (refuse to run against a database that is not the one measured) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'agent' AND c.relname = 'context_menu_view' AND c.relkind = 'v'
  ) THEN
    RAISE EXCEPTION 'DD-164 premise failed: agent.context_menu_view is not a view here. Re-measure before applying.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'mandate' AND c.relname = 'context_menu_view'
       AND array_to_string(c.reloptions, ',') ~ 'security_invoker=(true|on)'
  ) THEN
    RAISE EXCEPTION 'DD-164 premise failed: mandate.context_menu_view is not security_invoker. The repair below copies that twin; if the twin changed, re-review first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'chat' AND c.relname = 'mv_tool_refetch_summary' AND c.relkind = 'm'
  ) THEN
    RAISE EXCEPTION 'DD-164 premise failed: chat.mv_tool_refetch_summary is not a materialized view here.';
  END IF;
END $$;

-- ── 1. agent.context_menu_view — the open door ───────────────────────────────

ALTER VIEW agent.context_menu_view SET (security_invoker = true);

-- A context menu is not for logged-out visitors; the one consumer 401s without a
-- user. `REVOKE ALL` takes the three write grants with it.
REVOKE ALL ON agent.context_menu_view FROM anon;

-- A projection view is read-only. It has no INSTEAD OF trigger, so every write
-- through it either raised on the parent's policy or returned SUCCESS having
-- touched nothing — a silent no-op, which is law 4 exactly.
REVOKE INSERT, UPDATE, DELETE ON agent.context_menu_view FROM authenticated;

COMMENT ON VIEW agent.context_menu_view IS
  'Shortcut/content-block context menu. security_invoker=true (DD-164): the caller''s own RLS on platform.categories, agent.shortcut, agent.definition, agent.definition_version, platform.associations and skill.render_definition decides every row. Read-only, authenticated only. Same shape as its cutover twin mandate.context_menu_view.';

-- ── 2. platform.v_lifecycle_enlisted — a grant nothing used ──────────────────

REVOKE SELECT ON platform.v_lifecycle_enlisted FROM authenticated;

COMMENT ON VIEW platform.v_lifecycle_enlisted IS
  'Lifecycle-enlisted entity registry. Owner-rights over platform.entity_types (RESTRICTIVE platform_admin_only), so it is service-role only — the authenticated grant was revoked by DD-164 because no client reads it.';

-- ── 3. chat.mv_tool_refetch_summary — behind the admin door ──────────────────

CREATE OR REPLACE FUNCTION public.admin_tool_refetch_all_time()
RETURNS SETOF chat.mv_tool_refetch_summary
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, chat, pg_temp
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform administrator can read the all-time tool re-fetch rollup. It aggregates every organization''s tool calls, so there is no per-user answer to give you.'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM chat.mv_tool_refetch_summary;
END;
$function$;

COMMENT ON FUNCTION public.admin_tool_refetch_all_time() IS
  'Platform-admin only. The all-time per-tool re-fetch rollup behind /administration/reporting/tool-refetch. Definer because chat.mv_tool_refetch_summary is a materialized view: RLS never applies to one and it cannot carry security_invoker, so the snapshot is the owner''s unfiltered read by construction (DD-164).';

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES
  ('public', 'admin_tool_refetch_all_time', '',
   'tool re-fetch console',
   'Platform-admin-only read behind /administration/reporting/tool-refetch. Definer because the underlying relation is a MATERIALIZED view — RLS never applies to one, it cannot carry security_invoker, and it is by construction a snapshot of the owner''s unfiltered read of chat.request, chat.tool_call and tool.definition. Identity is auth.uid() via public.is_platform_admin(); there are no arguments. Returns per-tool aggregate counts only — no user identity, no conversation content, no payloads. Read-only.')
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.admin_tool_refetch_all_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_tool_refetch_all_time() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tool_refetch_all_time() TO service_role;

REVOKE SELECT ON chat.mv_tool_refetch_summary FROM authenticated;

COMMENT ON MATERIALIZED VIEW chat.mv_tool_refetch_summary IS
  'Hourly snapshot of chat.vw_tool_refetch_summary (all-time per-tool re-fetch rollup). refreshed_at is the snapshot time. See aidream db/migrations/0605, 0606. DD-164: service-role and public.admin_tool_refetch_all_time() only — a materialized view cannot carry security_invoker, so a client grant on it is an unfiltered cross-organization read.';

-- ── Verify the result, in the same transaction ───────────────────────────────

DO $$
DECLARE
  v_oid oid;
BEGIN
  SELECT c.oid INTO v_oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'agent' AND c.relname = 'context_menu_view';

  IF NOT (SELECT array_to_string(reloptions, ',') ~ 'security_invoker=(true|on)' FROM pg_class WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'DD-164 verify failed: agent.context_menu_view is still owner-rights.';
  END IF;
  IF has_table_privilege('anon', v_oid, 'SELECT') THEN
    RAISE EXCEPTION 'DD-164 verify failed: anon can still read agent.context_menu_view.';
  END IF;
  IF has_table_privilege('authenticated', v_oid, 'INSERT')
     OR has_table_privilege('authenticated', v_oid, 'UPDATE')
     OR has_table_privilege('authenticated', v_oid, 'DELETE') THEN
    RAISE EXCEPTION 'DD-164 verify failed: agent.context_menu_view is still client-writable.';
  END IF;
  IF NOT has_table_privilege('authenticated', v_oid, 'SELECT') THEN
    RAISE EXCEPTION 'DD-164 verify failed: authenticated lost the read it is supposed to keep.';
  END IF;

  IF has_table_privilege('authenticated', 'platform.v_lifecycle_enlisted', 'SELECT') THEN
    RAISE EXCEPTION 'DD-164 verify failed: authenticated can still read platform.v_lifecycle_enlisted.';
  END IF;
  IF has_table_privilege('authenticated', 'chat.mv_tool_refetch_summary', 'SELECT') THEN
    RAISE EXCEPTION 'DD-164 verify failed: authenticated can still read chat.mv_tool_refetch_summary.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_tool_refetch_all_time()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DD-164 verify failed: the admin door was revoked by enforce_definer_client_grants — check platform.ddl_guard_log.';
  END IF;
END $$;
