-- dd186_anon_columns_podcast — THE SIGNED-OUT COLUMN SURFACE OF THE `podcast` SCHEMA
-- (DD-186. SECURITY. db-rules §0/§6d/§9. GRANTS ONLY — no policy is created, altered or dropped.
--  RLS filters ROWS and cannot express a COLUMN at all; the column privilege is the only layer
--  that can, and `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot undo it.)
--
-- ═══ THE DECISION THIS FILE MAKES ══════════════════════════════════════════════════════════════
-- These 5 relations are anon-readable ON PURPOSE: each carries a permissive SELECT policy
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


-- podcast.pc_articles — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on podcast.pc_articles from anon;
grant select (id, show_id, episode_id, kind, slug, title, content_markdown, og_image_url, canonical_url, status, created_at, updated_at, deleted_at, visibility) on podcast.pc_articles to anon;

-- podcast.pc_episodes — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on podcast.pc_episodes from anon;
grant select (id, slug, show_id, title, description, audio_url, image_url, video_url, display_mode, episode_number, duration_seconds, is_published, created_at, updated_at, og_image_url, thumbnail_url, host_count, speakers, script, deleted_at, visibility) on podcast.pc_episodes to anon;

-- podcast.pc_race — revoked: verdict_by, organization_id, created_by, updated_by, version, metadata
revoke select on podcast.pc_race from anon;
grant select (id, topic, request, status, arms, verdict_winner, verdict_notes, verdict_at, error, completed_at, created_at, updated_at, deleted_at, visibility) on podcast.pc_race to anon;

-- podcast.pc_shows — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on podcast.pc_shows from anon;
grant select (id, slug, title, description, image_url, author, is_published, created_at, updated_at, og_image_url, thumbnail_url, rss_settings, deleted_at, visibility) on podcast.pc_shows to anon;

-- podcast.pc_studio_runs — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on podcast.pc_studio_runs from anon;
grant select (id, status, input_data_type, podcast_type, request, title, description, script, audio_url, image_urls, video_urls, image_prompts, video_prompts, selected_cover_url, show_id, episode_id, episode_slug, error, created_at, updated_at, backend_run_id, host_count, speakers, deleted_at, visibility) on podcast.pc_studio_runs to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['podcast.pc_articles','podcast.pc_episodes','podcast.pc_race','podcast.pc_shows','podcast.pc_studio_runs']) rel
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
      message = 'DD-186 (podcast): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

