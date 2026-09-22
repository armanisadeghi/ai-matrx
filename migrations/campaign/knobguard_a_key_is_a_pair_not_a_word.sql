-- additive: yes
-- based-on: platform.knob_delete_refuses_a_live_reader() 378108fb8450e6452dc6aba22710c2acfb4c338261e6a616e2452c4d5c61f2f7
--
-- KNOB-GUARD — A LIVE READER NAMES THE PAIR, NOT JUST THE WORD.
--
-- `platform.knob_delete_refuses_a_live_reader()` (the BEFORE DELETE trigger on
-- `platform.feature_knob`) refuses a hard delete when the row's bare KEY string
-- appears anywhere inside ANY function body on the database — no check that the
-- body also names the FEATURE, no check the two appear together as the knob
-- doors actually read them. A key that happens to be a common English word
-- (`'enabled'`) therefore matches 18 unrelated function bodies that never once
-- read that knob, and the row can never be deleted or archived. OLD-TABLES-2
-- (2026-09-22) hit this directly and had to name its own knob
-- `relation_columns_enabled` instead of the honest `enabled` to dodge it —
-- documented as finding (2) in its BUILD-LOG row.
--
-- THE HONEST PREDICATE: a function body is a live reader of a knob only when it
-- names BOTH halves of the address TOGETHER, in one of the two shapes the knob
-- doors actually take:
--   platform.knob_resolve('feature', 'key', ...)   -- adjacent literal pair
--   'feature.key'                                   -- the single dotted address
-- A key that merely appears as a word inside an unrelated string, comment, or a
-- DIFFERENT knob's own body no longer counts.
--
-- `platform.knob_live_readers(feature, key)` is the ONE function this predicate
-- now lives in. `platform.knob_delete_refuses_a_live_reader()` calls it, and so
-- does the campaign-but-not-yet-applied `platform.knob_archive` door
-- (`migrations/campaign/settings3_a_retired_knob_is_archived_not_deleted.sql`,
-- edited in the same lane to call the shared function instead of carrying its
-- own copy of the old, dishonest query) — one predicate, never two copies that
-- can drift apart again.
--
-- The refusal for a REAL reader is unchanged: `communication.notifications` /
-- `default_timezone` is still read by `communication.person_notification_window`
-- and a hard delete of that row is still refused, by name, after this file.
--
-- The inverse is
-- migrations/inverse/knobguard_a_key_is_a_pair_not_a_word_down.sql.

set lock_timeout = '4s';

create or replace function platform.knob_live_readers(p_feature text, p_key text)
returns text
language plpgsql
stable
as $function$
declare
  v_readers        text;
  v_esc_feature    text;
  v_esc_key        text;
  v_esc_dotted     text;
  v_pair_pattern   text;
  v_dotted_pattern text;
begin
  -- Escape the two regex metacharacters a namespaced knob address actually
  -- contains (backslash, and the dot every dotted feature name carries, e.g.
  -- `data_tables.relation`) so the address is matched literally, not as a
  -- pattern. Real knob addresses are otherwise plain identifiers.
  v_esc_feature := replace(replace(p_feature, '\', '\\'), '.', '\.');
  v_esc_key      := replace(replace(p_key, '\', '\\'), '.', '\.');
  v_esc_dotted   := replace(replace(p_feature || '.' || p_key, '\', '\\'), '.', '\.');

  v_pair_pattern   := '''' || v_esc_feature || '''\s*,\s*''' || v_esc_key || '''';
  v_dotted_pattern := '''' || v_esc_dotted || '''';

  select string_agg(distinct n.nspname || '.' || p.proname, ', ' order by n.nspname || '.' || p.proname)
    into v_readers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and n.nspname not in ('pg_catalog', 'information_schema')
     and (
       pg_get_functiondef(p.oid) ~ v_pair_pattern
       or pg_get_functiondef(p.oid) ~ v_dotted_pattern
     );

  return v_readers;
end;
$function$;

comment on function platform.knob_live_readers(text, text) is
  'THE ONE PREDICATE for "does any database function still read this knob?" — a body counts only when it names BOTH the feature and the key together, as platform.knob_resolve(''feature'', ''key'', ...) or the single literal ''feature.key''. Shared by platform.knob_delete_refuses_a_live_reader() and platform.knob_archive so the two doors can never disagree or drift apart. A key that merely appears as a word (e.g. ''enabled'') does not count.';

create or replace function platform.knob_delete_refuses_a_live_reader()
returns trigger
language plpgsql
as $function$
declare
  v_readers text;
begin
  -- A register row is not a record of a decision, it IS the value the resolver
  -- returns, and knob_resolve RAISES on a key it cannot find. So deleting a row
  -- some function still reads does not degrade that function — it takes it down.
  --
  -- This exists because on 2026-09-19 a convergence migration deleted
  -- hr.time_and_attendance.punch_enabled_worker_classes with the pattern
  -- `like 'punch_enabled_worker_class_%'`: in LIKE, `_` matches any single
  -- character, so the pattern written to match four booleans also matched the
  -- composite the punch gate itself reads. The delete was correct about the
  -- booleans and catastrophic about the fifth row, and nothing stopped it.
  --
  -- 2026-09-22: the original predicate matched the bare KEY string anywhere in
  -- ANY function body, so a common-word key (e.g. 'enabled') refused deletion
  -- against 18 unrelated bodies that never read it. platform.knob_live_readers
  -- now requires the feature AND the key together, in the shape the knob doors
  -- actually take.
  v_readers := platform.knob_live_readers(old.feature, old.key);

  if v_readers is not null then
    raise exception 'platform.feature_knob: %.% is still read by %',
      old.feature, old.key, v_readers
      using errcode = '23503',
            hint = 'knob_resolve RAISES on a missing key, so deleting this row breaks those functions. Repoint or delete the readers first. If the match is coincidental, remove the reader in the same transaction.';
  end if;

  return old;
end;
$function$;

comment on function platform.knob_delete_refuses_a_live_reader() is
  'BEFORE DELETE guard on platform.feature_knob. Refuses a hard delete when platform.knob_live_readers(feature, key) finds a function that still names the pair (or the dotted address) — not merely the bare key as a word. See migrations/campaign/knobguard_a_key_is_a_pair_not_a_word.sql.';
