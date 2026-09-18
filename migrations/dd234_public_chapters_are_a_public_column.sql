-- dd234_public_chapters_are_a_public_column
-- (DD-234. db-rules §0/§4/§6d/§9. ONE new column + its backfill + ONE column GRANT.
--  No policy is created, altered or dropped; `iam.apply_rls` is not run and nothing it
--  generates is touched. RLS filters ROWS; a COLUMN is the grant layer's decision alone.)
--
-- ═══ THE RULING THIS FILE EXECUTES ════════════════════════════════════════════════════════════
-- Chapters are podcast CONTENT. They are public exactly when the episode is public. They
-- therefore live in a column of their own that joins the episode's declared signed-out surface —
-- and `metadata` stays withheld from `anon` by DD-186's rule, untouched.
--
-- ═══ WHAT WAS TRUE BEFORE THIS FILE, MEASURED 2026-09-14 ══════════════════════════════════════
-- `pc_episodes.metadata->'chapters'` was the only home an episode's chapter markers ever had:
--   2 live rows carry the key, both `visibility='public'`, `is_published=true`, `deleted_at null`
--   ("live-audio-revolutionizing-your-podcast-creation-process-156a11ff": 3 chapters, 390 bytes;
--    "the-science-of-light-why-is-the-sky-blue-c5efa00d": 6 chapters, 1092 bytes)
--   shape: a JSON ARRAY of objects, keys exactly {start_hint, title, summary} on every element.
-- `metadata` is NOT in this table's anon column grant (DD-186: identity, bookkeeping and metadata
-- leave regardless), so `/podcast/<slug>/chapters.json` answered **404 "No chapters for this
-- episode" to EVERY signed-out listener** — the exact branch V-100 recorded as an honest
-- consequence needing its own register row. This is that row.
--
-- ═══ WHY A COLUMN AND NOT A CHILD TABLE (decided from the WRITERS, per the brief) ═════════════
-- There is exactly ONE writer, and it replaces the WHOLE list in one write:
-- `features/podcasts/service.ts#saveEpisodeChapters`, called from the studio's chapter panel
-- (`EpisodeChaptersPanel.tsx`) and the `episode_chapters` write target. aidream writes no
-- chapters at all — `podcast.chapter_marker` (the agent) EMITS them as the `media_chapters`
-- content-IR kind and the CLIENT persists the parsed list. Nothing edits one chapter
-- independently of its siblings, nothing orders, filters or joins across chapters, and no
-- chapter has an identity of its own. A component child table would buy nothing and cost a
-- parent-gated RLS arm (db-rules §6d-1). db-rules §4: a root column.
--
-- It is also the CONFLICT-DOMAIN rule (db-rules §4, owner ruling 2026-08-10) closing a real
-- contest: `metadata` on this table also carries `raw_script_backup` and
-- `script_canonicalized_at`, written by the script-canonicalisation pass. A jsonb column is ONE
-- field forever, so the chapter agent and that pass were a genuine same-field race in which one
-- of them silently loses. Two writers → two columns.
--
-- ═══ THE ORDER, AND WHY IT IS TWO FILES (DD-173's lesson) ═════════════════════════════════════
-- This file ADDS and BACKFILLS. It does not remove `metadata->'chapters'`, because the code that
-- writes it is still the deployed code until the release train runs. The sibling file
-- `dd234b_metadata_no_longer_carries_chapters.sql` re-syncs anything written in that window and
-- strips the key — and it is applied only AFTER the new writer is live and verified.

-- ── 1. The column ────────────────────────────────────────────────────────────────────────────
-- NULLABLE on purpose: NULL means "chapters were never generated for this episode", `[]` would
-- mean "generated and empty". Those are different facts and the route answers differently. The
-- CHECK tests the shape EXPLICITLY rather than by comparing an extraction (db-rules §10: an
-- absent key silently passes any test written for wrong values).
alter table podcast.pc_episodes
  add column if not exists chapters jsonb;

alter table podcast.pc_episodes
  drop constraint if exists pc_episodes_chapters_is_array;

alter table podcast.pc_episodes
  add constraint pc_episodes_chapters_is_array
  check (chapters is null or jsonb_typeof(chapters) = 'array');

comment on column podcast.pc_episodes.chapters is
  'Ordered chapter markers for the player and the Podcasting 2.0 JSON Chapters document — an '
  'array of {start_hint, title, summary}. PUBLIC CONTENT: public exactly when the episode is '
  '(pub_read gates the row on visibility), and part of the anon column grant, which is why '
  '/podcast/<slug>/chapters.json can serve a listener with no account. Written whole by '
  'features/podcasts/service.ts#saveEpisodeChapters. Moved out of metadata->''chapters'' by '
  'DD-234, 2026-09-14; metadata stays withheld from anon (DD-186).';

-- ── 2. The backfill ──────────────────────────────────────────────────────────────────────────
-- Bounded by construction: only rows that actually carry the key, and only where the column is
-- still empty, so re-running this file is a no-op. The `_touch_row` trigger bumps `version` and
-- `updated_at` on the rows it moves — that is recorded, not hidden: the rows really did change,
-- and `history.row_versions` keeps the before-shape.
update podcast.pc_episodes
   set chapters = metadata -> 'chapters'
 where metadata ? 'chapters'
   and jsonb_typeof(metadata -> 'chapters') = 'array'
   and chapters is null;

-- ── 3. The signed-out bound ──────────────────────────────────────────────────────────────────
-- DD-186 replaced this table's TABLE-level grant with a COLUMN-level one, so a column added
-- today is CLOSED to a signed-out reader until someone names it. Naming it here is the
-- publishing decision, and its reader is `/podcast/<slug>/chapters.json` (plus the
-- `<podcast:chapters>` element feed.xml derives from the same list).
-- `authenticated` is untouched: it holds the table-level grant, which covers the new column.
grant select (chapters) on podcast.pc_episodes to anon;

-- ═══ THE ASSERTIONS — measured, never claimed by the comment above ════════════════════════════
do $$
declare
  v_unmoved  bigint;
  v_mismatch bigint;
  v_bad      bigint;
  v_moved    bigint;
begin
  -- (a) every row that carries the key now carries the column, and they AGREE.
  select count(*) into v_unmoved
    from podcast.pc_episodes
   where metadata ? 'chapters' and chapters is null;
  if v_unmoved > 0 then
    raise exception 'DD-234: % episode row(s) still hold metadata->''chapters'' with an empty '
                    'chapters column. The backfill did not reach them — a non-array value is the '
                    'likely cause; look before widening the filter.', v_unmoved;
  end if;

  select count(*) into v_mismatch
    from podcast.pc_episodes
   where metadata ? 'chapters'
     and chapters is distinct from metadata -> 'chapters';
  if v_mismatch > 0 then
    raise exception 'DD-234: % episode row(s) disagree between metadata->''chapters'' and the '
                    'chapters column. Nothing may strip metadata until they agree.', v_mismatch;
  end if;

  -- (b) the column holds arrays of the shape the readers parse, or nothing at all.
  select count(*) into v_bad
    from podcast.pc_episodes
   where chapters is not null
     and (jsonb_typeof(chapters) <> 'array'
          or exists (select 1
                       from jsonb_array_elements(chapters) e
                      where jsonb_typeof(e) <> 'object' or not (e ? 'title')));
  if v_bad > 0 then
    raise exception 'DD-234: % episode row(s) hold a chapters value that is not an array of '
                    'objects with a title. buildChaptersJson would drop them silently.', v_bad;
  end if;

  -- (c) a signed-out reader can actually READ the new column — the whole point of the file.
  if not has_column_privilege('anon', 'podcast.pc_episodes'::regclass, 'chapters', 'SELECT') then
    raise exception 'DD-234: anon cannot read podcast.pc_episodes.chapters, so '
                    '/podcast/<slug>/chapters.json would answer 42501 for every listener with no '
                    'account. The GRANT above did not take.';
  end if;

  -- (d) and `metadata` is STILL withheld — this file must never have widened DD-186.
  if has_column_privilege('anon', 'podcast.pc_episodes'::regclass, 'metadata', 'SELECT') then
    raise exception 'DD-234: anon can read podcast.pc_episodes.metadata. Chapters moving into '
                    'their own column must never become a metadata grant (DD-186).';
  end if;

  select count(*) into v_moved from podcast.pc_episodes where chapters is not null;
  raise notice 'DD-234: podcast.pc_episodes.chapters is live and readable by anon; % row(s) carry '
               'chapters; metadata remains withheld.', v_moved;
end $$;
