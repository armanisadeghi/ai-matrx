-- dd186_anon_columns_users — THE SIGNED-OUT COLUMN SURFACE OF THE `users` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 12 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- users.feedback_comments — revoked: (none; bounded so a new column is closed by default)
revoke select on users.feedback_comments from anon;
grant select (id, feedback_id, author_type, author_name, content, created_at) on users.feedback_comments to anon;

-- users.guest_execution_log — revoked: fingerprint, ip_address
revoke select on users.guest_execution_log from anon;
grant select (id, guest_id, resource_type, resource_id, resource_name, task_id, success, error_message, tokens_used, cost, execution_time_ms, user_agent, referer, created_at) on users.guest_execution_log to anon;

-- users.guest_executions — revoked: fingerprint, ip_address, metadata
revoke select on users.guest_executions from anon;
grant select (id, user_agent, total_executions, first_execution_at, last_execution_at, daily_reset_at, daily_executions, is_blocked, blocked_until, blocked_reason, converted_to_user_id, converted_at, created_at, updated_at, auth_user_id) on users.guest_executions to anon;

-- users.invitation_requests — revoked: (none; bounded so a new column is closed by default)
revoke select on users.invitation_requests from anon;
grant select (id, status) on users.invitation_requests to anon;

-- users.profiles — revoked: created_by, organization_id, updated_by, version, metadata
revoke select on users.profiles from anon;
grant select (id, display_name, avatar_url, status_text, is_online, last_seen_at, created_at, updated_at, deleted_at, visibility, creator_handle, creator_public, creator_tagline, creator_bio, creator_links, creator_featured, creator_published_at, age_band) on users.profiles to anon;

-- users.system_announcements — revoked: created_by, organization_id, metadata, updated_by, version
revoke select on users.system_announcements from anon;
grant select (id, title, message, announcement_type, is_active, created_at, updated_at, min_display_seconds, target_user_id, visibility) on users.system_announcements to anon;

-- users.user_achievements — revoked: created_by, updated_by, organization_id, version, metadata
revoke select on users.user_achievements from anon;
grant select (id, achievement_type, achievement_data, unlocked_at, created_at, updated_at, deleted_at, visibility) on users.user_achievements to anon;

-- users.user_analysis_preferences — revoked: user_id, organization_id, created_by, updated_by, metadata, version
revoke select on users.user_analysis_preferences from anon;
grant select (per_detector_enabled, default_tier_per_detector, custom_patterns, default_redaction_mode, per_file_type_overrides, substitute_formats, updated_at, deleted_at) on users.user_analysis_preferences to anon;

-- users.user_follows — revoked: (none; bounded so a new column is closed by default)
revoke select on users.user_follows from anon;
grant select (id, follower_id, following_id, created_at) on users.user_follows to anon;

-- users.user_form_profile — revoked: user_id, organization_id, created_by, updated_by, metadata, version
revoke select on users.user_form_profile from anon;
grant select (legal_first_name, legal_middle_name, legal_last_name, preferred_name, name_suffix, pronouns, date_of_birth, phones, emails, social_handles, website_url, shipping_line1, shipping_line2, shipping_city, shipping_region, shipping_postal_code, shipping_country, billing_same_as_shipping, billing_line1, billing_line2, billing_city, billing_region, billing_postal_code, billing_country, company_name, job_title, emergency_contacts, images, custom_fields, created_at, updated_at, deleted_at) on users.user_form_profile to anon;

-- users.user_markdown_samples — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on users.user_markdown_samples from anon;
grant select (id, name, description, content, detected_blocks, created_at, updated_at, deleted_at, visibility) on users.user_markdown_samples to anon;

-- users.user_memory — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on users.user_memory from anon;
grant select (id, path, content, labels, created_at, updated_at, deleted_at, visibility) on users.user_memory to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['users.feedback_comments','users.guest_execution_log','users.guest_executions','users.invitation_requests','users.profiles','users.system_announcements','users.user_achievements','users.user_analysis_preferences','users.user_follows','users.user_form_profile','users.user_markdown_samples','users.user_memory']) rel
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
      message = 'DD-186 (users): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

