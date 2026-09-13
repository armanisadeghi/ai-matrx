-- dd186_anon_columns_tool — THE SIGNED-OUT COLUMN SURFACE OF THE `tool` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 6 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
-- reaching `anon` — in almost every case the generated `pub_read` (`deleted_at is null and
-- visibility = 'public'`). That ROW decision was made by the DD-173 base-contract campaign and is
-- not touched here. The COLUMN decision had never been made by anyone: every one of them answered
-- `select=*` to the published publishable key over HTTPS, so a table became a publishing decision
-- the moment a column was added to it. DD-182 found exactly this on `public.catalog_entries`
-- (a platform admin's uuid in `updated_by`, served to the internet, while the SAME feature's other
-- public path stripped it on purpose). This file is that finding applied to the rest of the surface.
--
-- WHAT IS REVOKED, and it is a closed list of exact column NAMES — never a name pattern, because a
-- gate that guesses is a gate that gets switched off:
--   who   — created_by, updated_by, deleted_by, changed_by, ratified_by, certified_by,
--           human_verified_by, verdict_by, synced_by, last_checked_by, check_claimed_by,
--           user_id, owner_id, owner_user_id, author_id, organization_id, org_id
--   books — version, metadata, is_system
--   contact/secret — email, contact_email, ip_address, fingerprint, phone, phone_number,
--           token, access_token, refresh_token, api_key, secret, password, password_hash
-- Deliberately NOT revoked: `visibility` and `deleted_at` (the gate's own columns — a row a
-- signed-out visitor can see always reads 'public'/null, so they carry no information, and clients
-- legitimately filter on them, which PostgREST cannot do without the column privilege); and names
-- that only LOOK like the list — `max_tokens`, `token_billed`, `total_tokens_used`, `min_tier`,
-- `emitted_fingerprint` (a content hash), and `content_ir.kind_surface.token`, whose values are
-- 'flashcards' and 'mermaid'.
--
-- THE MECHANISM, and why it is the durable one: each relation's TABLE-level grant is revoked and
-- replaced by a COLUMN-level grant naming exactly what stays. A column added to one of these
-- tables tomorrow is therefore NOT readable by a signed-out visitor — the default flips from
-- published to closed, which is the actual class fix. `pnpm check:anon-column-surface` fails on a
-- difference in either direction.
--
-- NOTHING SIGNED-IN CHANGES: grants are per-role, `authenticated` keeps every privilege it holds.
-- SECURITY DEFINER doors run as their owner and never consult the caller's table privileges.


-- tool.bundle — revoked: is_system, created_by, metadata, organization_id, updated_by, version
revoke select on tool.bundle from anon;
grant select (id, name, description, lister_tool_id, is_active, created_at, updated_at, visibility, deleted_at) on tool.bundle to anon;

-- tool.definition — revoked: version, created_by, organization_id, metadata, updated_by
revoke select on tool.definition from anon;
grant select (id, name, description, parameters, output_schema, annotations, category, tags, icon, semver, admin_only, tier, gating, dedupe_exempt, validation_exempt, source_kind, managed_by_server_id, max_client_wait_seconds, tool_group, is_active, deactivated_at, created_at, updated_at, visibility, deleted_at, updated_by_tier, updated_by_system, side_effect_class) on tool.definition to anon;

-- tool.executor — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on tool.executor from anon;
grant select (name, description, parent_executor_name, mcp_server_id, config, is_active, created_at, updated_at, id, visibility) on tool.executor to anon;

-- tool.mcp_config — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on tool.mcp_config from anon;
grant select (id, server_id, label, config_type, is_default, command, args, env_schema, requires_docker, npm_package, pip_package, min_node_version, notes, created_at, updated_at, visibility) on tool.mcp_config to anon;

-- tool.mcp_server — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on tool.mcp_server from anon;
grant select (id, slug, name, vendor, description, category, icon_url, color, website_url, docs_url, endpoint_url, transport, auth_strategy, oauth_scopes, oauth_client_id, is_official, is_featured, has_remote, has_local, supports_mcp_apps, status, sort_order, created_at, updated_at, last_synced_at, discovery_ttl_seconds, last_sync_error, last_tested_at, last_test_ok, last_test_status_code, last_test_latency_ms, last_test_error, visibility) on tool.mcp_server to anon;

-- tool.surface_defaults — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on tool.surface_defaults from anon;
grant select (surface_name, always_include_tools, always_include_bundles, never_include_tools, never_include_bundles, arg_defaults, arg_injection, notes, is_active, created_at, updated_at, id, visibility) on tool.surface_defaults to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['tool.bundle','tool.definition','tool.executor','tool.mcp_config','tool.mcp_server','tool.surface_defaults']) rel
    join pg_attribute a on a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
    where a.attname = any (array['created_by','updated_by','deleted_by','changed_by','ratified_by',
        'certified_by','human_verified_by','verdict_by','synced_by','last_checked_by',
        'check_claimed_by','user_id','owner_id','owner_user_id','author_id','organization_id',
        'org_id','created_by_user_id','version','metadata','is_system','email','contact_email',
        'ip_address','fingerprint','phone','phone_number','access_token','refresh_token','api_key',
        'secret','password','password_hash']
        || case when rel = 'content_ir.kind_surface' then array[]::text[] else array['token'] end)
      and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
  ) t;
  if bad is not null then
    raise exception using
      message = 'DD-186 (tool): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

