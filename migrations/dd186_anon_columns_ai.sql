-- dd186_anon_columns_ai — THE SIGNED-OUT COLUMN SURFACE OF THE `ai` SCHEMA
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


-- ai.api — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on ai.api from anon;
grant select (id, visibility, created_at, updated_at, deleted_at, name, display_name, translator_key, transport, rules, request_defaults, description) on ai.api to anon;

-- ai.endpoint — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on ai.endpoint from anon;
grant select (id, visibility, created_at, updated_at, deleted_at, vendor, internal_name, display_name, base_url, auth_ref, byok_secret_key, priority, is_active, notes, doc_sources) on ai.endpoint to anon;

-- ai.model_alias — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on ai.model_alias from anon;
grant select (id, visibility, created_at, updated_at, deleted_at, alias, model_id, kind, notes) on ai.model_alias to anon;

-- ai.model_definition — revoked: created_by, organization_id, is_system, updated_by, version, metadata
revoke select on ai.model_definition from anon;
grant select (id, name, common_name, context_window, max_tokens, capabilities, provider_id, is_deprecated, is_primary, is_premium, mid_fallback_id, guest_fallback_id, visibility, deleted_at, created_at, updated_at, release_date, description, cost_rating, speed_rating, retry_fallback_id, retry_max_attempts, retired_at, successor_id) on ai.model_definition to anon;

-- ai.offering — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on ai.offering from anon;
grant select (id, model_id, provider_model_id, priority, is_available, pricing, usage_basis, capabilities_override, override, notes, visibility, created_at, updated_at, deleted_at, token_billed, endpoint_id, api_id, pricing_verified_at) on ai.offering to anon;

-- ai.provider — revoked: created_by, organization_id, is_system, updated_by, version, metadata
revoke select on ai.provider from anon;
grant select (id, name, company_description, documentation_link, models_link, provider_models_cache, visibility, deleted_at, created_at, updated_at, slug, website_url, logo_url, doc_sources, sync_policy) on ai.provider to anon;

-- ai.setting — revoked: organization_id, is_system, created_by, updated_by, version, metadata
revoke select on ai.setting from anon;
grant select (id, key, value_type, canonical_min, canonical_max, canonical_values, default_value, ui, description, visibility, created_at, updated_at, deleted_at) on ai.setting to anon;

-- ai.voices — revoked: organization_id, metadata, created_by, updated_by, version
revoke select on ai.voices from anon;
grant select (id, provider, provider_voice_id, name, voice_type, gender, accent, age, language, languages, tags, quality_score, description, style, sample_file_id, sample_url, preview_url, enabled, is_verified, sort_order, created_at, updated_at, deleted_at, visibility) on ai.voices to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['ai.api','ai.endpoint','ai.model_alias','ai.model_definition','ai.offering','ai.provider','ai.setting','ai.voices']) rel
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
      message = 'DD-186 (ai): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

