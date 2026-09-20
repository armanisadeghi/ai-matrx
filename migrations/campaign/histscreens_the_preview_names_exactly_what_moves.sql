-- target: branch,production
-- additive: yes
--   It REPLACES two function bodies in place — `custom.record_restore_preview` and
--   `custom.io_restore` — each pinned by a `-- based-on:` line below. Signatures, rungs and
--   return types are unchanged. It creates nothing, drops nothing, revokes nothing, touches
--   no table, column, trigger, policy or enum, and rewrites no row.
--   The inverse is `migrations/inverse/histscreens_the_preview_names_exactly_what_moves_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.io_restore(uuid, uuid, integer) 250216a0b07fafc54a5c4dbd9c8db717095f33364db0e101f77008874a4a9a3d
-- based-on: custom.record_restore_preview(uuid, uuid, integer, text) 9d5b2fea7d99463871e45337c0cd2039481a945d34b67a849f534f94c20d871b
--
-- LANE HISTORY-SCREENS — three defects, all found by RUNNING the doors this lane landed
-- forty minutes earlier against real records on the main database.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- 1. THE PREVIEW DIFFED THE WRONG PAIR, AND IN THE WRONG DIRECTION.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `custom.record_restore_preview` compared the RESTORE BODY against the record as it stands.
-- Two things came out wrong and both of them are the sentence a person reads before pressing
-- a button that changes their data:
--
--   · **Backwards.** `before` was the value the record WOULD take and `after` the value it
--     has. A preview that says "price: 950 → 1200" about a restore that will make it 950 is
--     worse than no preview.
--   · **Everything looked changed.** A restore body carries no `_values` envelope, so
--     `custom.io_changed_keys` — which MERGE-HISTORY correctly taught to judge a key by its
--     envelope as well as its top-level value — saw an envelope on one side and none on the
--     other for EVERY key, and reported `title: "Roof repair" → "Roof repair"` as a change.
--     Restoring one field listed all four.
--
-- The pair to diff is the record as it stands against the record as this write will leave it:
-- `current` against `current || body`, both stripped of the envelope the store re-derives on
-- the way in. That is literally what `custom.record_update` is about to do, so the sentence
-- and the act are now the same computation and cannot disagree.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- 2. `custom.io_restore` HAS ALWAYS RETURNED NULL. NOT SINCE THIS LANE — ALWAYS.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Its last line is `return (v_doc ->> 'version')::integer` over `custom.read_record`. The
-- read door answers the record's DOCUMENT — the field values, plus `_alternates`, `_retired`
-- and `_hidden` — and `version` is a COLUMN of `custom.record`, not a key of the document.
-- So `v_doc ->> 'version'` is null for every record that has ever existed, and every caller
-- of `custom.io_restore` has been handed null and told nothing. Measured on the main
-- database, 2026-09-20: a restore that worked returned null.
--
-- The version does not need a read at all: `custom.record_update` RETURNS it, from the row
-- it just wrote. The extra read of the record was buying nothing and answering nothing, so
-- it goes — which also removes the `42501` arm that existed only to explain the null.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- 3. AND THE ONE THAT MADE BOTH OF THEM FINDABLE
-- ════════════════════════════════════════════════════════════════════════════════
--
-- None of this was visible in the SQL, in a type, or in a door's declaration. It took
-- running the three doors over a real four-version record and reading the sentences they
-- produced — the same argument lane DASHBOARDS made about rendering a chart rather than
-- reading its code, one layer further down.

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.record_restore_preview — now diffs the record against what the write will leave.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.record_restore_preview(p_organization_id uuid,
                                                         p_record_id uuid,
                                                         p_version integer,
                                                         p_field_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_target  jsonb;
  v_current jsonb;
  v_table   uuid;
  v_at      timestamptz;
  v_now     integer;
  v_before  jsonb;
  v_after   jsonb;
  v_changes jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_preview');
  perform custom.assert_client_may_change(p_organization_id, p_record_id,
                                          'custom.record_restore_preview');

  select v.row_data -> 'data', v.occurred_at into v_target, v_at
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned.';
  end if;

  select r.data, r.table_id, r.version into v_current, v_table, v_now
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- THE RECORD AS IT STANDS, and THE RECORD AS THIS WRITE WILL LEAVE IT. The envelope keys
  -- are stripped from both sides so the comparison is like for like: the store re-derives
  -- `_values`, `_sources`, `_computed`, `_derived` and `_retired` on the way in, and a key
  -- whose envelope exists on one side only is not a key that moved.
  v_before := coalesce(v_current, '{}'::jsonb)
                - '_values' - '_sources' - '_computed' - '_derived' - '_retired';
  v_after  := v_before || custom.history_restore_body(v_current, v_target, p_field_key);

  v_changes := custom.history_changes(p_organization_id, v_table, v_before, v_after);

  return jsonb_build_object(
    'record_id', p_record_id,
    'from_version', v_now,
    'to_version', p_version,
    'saved_at', v_at,
    'field_key', p_field_key,
    -- `before` is what the record says now; `after` is what it would say. A key that the
    -- target version did not have comes back with `after` of JSON null — the screen says
    -- "cleared", because that is what the write does to it.
    'changes', v_changes,
    'count', jsonb_array_length(v_changes));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.io_restore — answers the version it actually wrote.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_restore(p_organization_id uuid, p_record_id uuid,
                                             p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user    uuid := custom.query_principal();
  v_target  jsonb;
  v_current jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter
  -- who could restore would be able to change every value on the record without being
  -- allowed to change one.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.record_history(organization, record) lists them with who changed what.'
      using errcode = '22004';
  end if;

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned — the two most recent are always kept.';
  end if;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- THE SAME WRITE PATH AGAIN, so going back to an old version is a NEW version rather than
  -- a hole in the record: the chain keeps growing forwards, always. And the version comes
  -- from the write itself — `custom.record_update` returns the row it wrote. The old body
  -- asked `custom.read_record` for it, which answers the DOCUMENT and never a column, so
  -- this door returned null to every caller it ever had.
  return custom.record_update(p_organization_id, p_record_id,
                              custom.history_restore_body(v_current, v_target, null));
end;
$$;
