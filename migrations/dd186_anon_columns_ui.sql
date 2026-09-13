-- dd186_anon_columns_ui — THE SIGNED-OUT COLUMN SURFACE OF THE `ui` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 8 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- ui.ui_client — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on ui.ui_client from anon;
grant select (name, description, is_active, sort_order, created_at, updated_at, id, visibility) on ui.ui_client to anon;

-- ui.ui_surface — revoked: metadata, last_checked_by, check_claimed_by, created_by, updated_by
revoke select on ui.ui_surface from anon;
grant select (name, client_name, description, is_active, sort_order, created_at, updated_at, url_pattern, executor_name, parent_surface_name, execution_mode, supports_dictionary, id, intro, label, value_groups, readiness, readiness_note, overlay_id, last_checked_at, last_check, check_claimed_at) on ui.ui_surface to anon;

-- ui.ui_surface_agent_pref — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on ui.ui_surface_agent_pref from anon;
grant select (id, surface_name, role_name, agent_id, kind, position, settings, scope_id, created_at, updated_at, deleted_at, visibility) on ui.ui_surface_agent_pref to anon;

-- ui.ui_surface_agent_role — revoked: synced_by, organization_id, metadata, created_by, updated_by, version
revoke select on ui.ui_surface_agent_role from anon;
grant select (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order, created_at, updated_at, mandate_key, synced_from, id, visibility) on ui.ui_surface_agent_role to anon;

-- ui.ui_surface_client_tool — revoked: synced_by, organization_id, metadata, created_by, updated_by, version
revoke select on ui.ui_surface_client_tool from anon;
grant select (surface_name, name, label, description, input_schema, mode, created_at, updated_at, synced_from, id, visibility) on ui.ui_surface_client_tool to anon;

-- ui.ui_surface_config — revoked: user_id, organization_id, created_by, updated_by, version, metadata
revoke select on ui.ui_surface_config from anon;
grant select (id, surface_name, namespace, config, scope_id, created_at, updated_at, deleted_at, visibility) on ui.ui_surface_config to anon;

-- ui.ui_surface_value — revoked: synced_by, organization_id, metadata, created_by, updated_by, version
revoke select on ui.ui_surface_value from anon;
grant select (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, created_at, updated_at, auto_context, group_key, synced_from, id, visibility) on ui.ui_surface_value to anon;

-- ui.ui_surface_write_target — revoked: synced_by, organization_id, metadata, created_by, updated_by, version
revoke select on ui.ui_surface_write_target from anon;
grant select (surface_name, name, label, description, value_type, mode, updates_value, group_key, sort_order, created_at, updated_at, apply_policy, synced_from, kind_key, id, visibility) on ui.ui_surface_write_target to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['ui.ui_client','ui.ui_surface','ui.ui_surface_agent_pref','ui.ui_surface_agent_role','ui.ui_surface_client_tool','ui.ui_surface_config','ui.ui_surface_value','ui.ui_surface_write_target']) rel
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
      message = 'DD-186 (ui): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

