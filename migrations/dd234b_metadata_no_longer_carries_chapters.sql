-- dd234b_metadata_no_longer_carries_chapters
-- (DD-234, the second half. db-rules §0/§4/§9. Data + one registry row. No DDL, no policy,
--  no grant. Apply ONLY after the DD-234 writer is live and verified on production.)
--
-- ═══ WHAT THIS FILE IS FOR ════════════════════════════════════════════════════════════════════
-- `dd234_public_chapters_are_a_public_column.sql` added `podcast.pc_episodes.chapters`, backfilled
-- it and published it to `anon`. It deliberately left `metadata->'chapters'` in place, because the
-- code that writes it was still the DEPLOYED code until the release train ran (DD-173's lesson: the
-- writer ships before the read path depends on it).
--
-- This file runs after that deploy and closes the door behind it — and CLOSING A CLASS MEANS
-- REMOVING THE DOOR, not leaving a safe path beside an unsafe one. Deleting the
-- `platform.metadata_reserved_keys` row is what makes `platform._metadata_guard` REFUSE, with its
-- own sentence, any client that writes `metadata.chapters` on this table again. That row's own
-- reason says so: "Destination: a real chapters column (or a child table). Delete this row when
-- that lands."
--
-- ═══ THE RE-SYNC, AND WHY IT IS SAFE TO PREFER metadata ═══════════════════════════════════════
-- The first file's backfill made column and metadata EQUAL on every row that carried the key, and
-- asserted it. So a row where they now DIFFER can only have been written by the old code after
-- that backfill — during the deploy window — which makes `metadata` the newer value on exactly
-- those rows and on no others. Equal rows are untouched.

-- ── 1. Anything the deploy window wrote through the old path ─────────────────────────────────
update podcast.pc_episodes
   set chapters = metadata -> 'chapters'
 where metadata ? 'chapters'
   and jsonb_typeof(metadata -> 'chapters') = 'array'
   and chapters is distinct from metadata -> 'chapters';

-- ── 2. The key leaves metadata ───────────────────────────────────────────────────────────────
update podcast.pc_episodes
   set metadata = metadata - 'chapters'
 where metadata ? 'chapters';

-- ── 3. The door ──────────────────────────────────────────────────────────────────────────────
delete from platform.metadata_reserved_keys
 where table_token = 'pc_episode' and key = 'chapters';

-- ═══ THE ASSERTIONS ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_left    bigint;
  v_lost    bigint;
  v_allowed bigint;
begin
  -- (a) nothing was dropped on the floor: every row that HAD chapters still has them, in the column.
  select count(*) into v_lost
    from podcast.pc_episodes
   where metadata ? 'chapters';
  if v_lost > 0 then
    raise exception 'DD-234b: % episode row(s) still carry metadata->''chapters''.', v_lost;
  end if;

  select count(*) into v_left from podcast.pc_episodes where chapters is not null;
  if v_left = 0 then
    raise exception 'DD-234b: NO episode carries chapters in the column. The first file backfilled '
                    'rows that did; ending with zero means this file destroyed them. Roll back.';
  end if;

  -- (b) the door is gone, so a client writing metadata.chapters is refused by name from here on.
  select count(*) into v_allowed
    from platform.metadata_reserved_keys
   where table_token = 'pc_episode' and key = 'chapters';
  if v_allowed > 0 then
    raise exception 'DD-234b: metadata key "chapters" is still registered for pc_episode, so a '
                    'client can write it back into metadata and the class is not closed.';
  end if;

  raise notice 'DD-234b: metadata no longer carries chapters; % episode row(s) hold them in the '
               'column; the reserved-key door is removed.', v_left;
end $$;
