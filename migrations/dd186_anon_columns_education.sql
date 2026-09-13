-- dd186_anon_columns_education — THE SIGNED-OUT COLUMN SURFACE OF THE `education` SCHEMA
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


-- education.content_certification — revoked: certified_by, human_verified_by, organization_id, metadata, created_by, updated_by, version
revoke select on education.content_certification from anon;
grant select (id, resource_type, resource_id, note, certified_at, human_verified_at, created_at, updated_at, visibility) on education.content_certification to anon;

-- education.learn_doc — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on education.learn_doc from anon;
grant select (id, created_at, updated_at, deleted_at, visibility, slug, title, summary, subject, letter, keywords, sections, related, content_updated_at, published_at) on education.learn_doc to anon;

-- education.math_course_structure — revoked: (none; bounded so a new column is closed by default)
revoke select on education.math_course_structure from anon;
grant select (id, course_name, topic_name, module_name, module_description, lesson_name, lesson_objectives, lesson_content, sort_order, created_at, updated_at) on education.math_course_structure to anon;

-- education.math_problems — revoked: created_by
revoke select on education.math_problems from anon;
grant select (id, title, course_name, topic_name, module_name, description, intro_text, final_statement, problem_statement, solutions, hint, resources, difficulty_level, related_content, sort_order, is_published, created_at, updated_at) on education.math_problems to anon;

-- education.quiz_sessions — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on education.quiz_sessions from anon;
grant select (id, title, state, is_completed, created_at, updated_at, completed_at, quiz_content_hash, quiz_metadata, category, deleted_at, visibility) on education.quiz_sessions to anon;

-- education.study_media — revoked: organization_id, created_by, updated_by, version, metadata
revoke select on education.study_media from anon;
grant select (id, created_at, updated_at, deleted_at, visibility, media_kind, title, description, status, source_kind, source_id, source_title, config, trust, run_id, episode_id, audio_file_id, audio_format, duration_seconds, ir_envelope, diagram_kind) on education.study_media to anon;

-- ═══ THE ASSERTION — measured, not asserted by this comment ════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(rel || '.' || col, ', ' order by rel, col) into bad
  from (
    select rel, a.attname as col
    from unnest(array['education.content_certification','education.learn_doc','education.math_course_structure','education.math_problems','education.quiz_sessions','education.study_media']) rel
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
      message = 'DD-186 (education): a signed-out visitor can still read identity/bookkeeping/secret columns: ' || bad,
      hint    = 'The table-level grant was not replaced, or a column grant survives. Revoke by name.';
  end if;
end $$;

