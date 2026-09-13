-- dd186_anon_columns_platform — THE SIGNED-OUT COLUMN SURFACE OF THE `platform` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 7 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- platform.assurance_level — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on platform.assurance_level from anon;
grant select (slug, label, blurb, rank, is_active, created_at, updated_at, id, visibility) on platform.assurance_level to anon;

-- platform.categories — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on platform.categories from anon;
grant select (id, dimension, name, slug, parent_id, color, icon, position, created_at, updated_at, deleted_at, placement_type, visibility) on platform.categories to anon;

-- platform.feature_knob — revoked: updated_by
revoke select on platform.feature_knob from anon;
grant select (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description, set_by, basis, review_due, created_at, updated_at, overridable_by, override_direction, bound_value, ui, taxonomy_node_id, propagation, public_read) on platform.feature_knob to anon;

-- platform.flexible_data — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on platform.flexible_data from anon;
grant select (id, label, slug, data, created_at, updated_at, deleted_at, visibility, category_id) on platform.flexible_data to anon;

-- platform.rulebook — revoked: version, organization_id, created_by, updated_by, metadata
revoke select on platform.rulebook from anon;
grant select (id, name, slug, description, source, sections, rules, status, visibility, created_at, updated_at, deleted_at, industry_id, source_rulebook_id, source_version, source_synced_at, source_authority, assurance_level) on platform.rulebook to anon;

-- platform.shareable_resource_registry — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on platform.shareable_resource_registry from anon;
grant select (resource_type, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission, is_active, notes, created_at, updated_at, content_role, is_scopeable, schema_name, public_columns, is_link_shareable, id, visibility) on platform.shareable_resource_registry to anon;

-- platform.source_authority — revoked: metadata, organization_id, created_by, updated_by, version
revoke select on platform.source_authority from anon;
grant select (slug, label, blurb, rank, is_active, created_at, updated_at, id, visibility) on platform.source_authority to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['platform.assurance_level','platform.categories','platform.feature_knob','platform.flexible_data','platform.rulebook','platform.shareable_resource_registry','platform.source_authority']) rel
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
      message = 'DD-186 (platform): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

