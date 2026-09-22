-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
--
-- W3-HIST, part four — HIS-8, HIS-N-1, HIS-N-2 and VIS-16: the undo primitive a Migration is
--                      reversed through, a File-shaped record's snapshot chain, a single
--                      Value edit undone through the same write path, and "who could see
--                      Record R on date D" answered by REPLAY rather than from a stored
--                      access-history table.
--
-- THE DIVISION OF LABOUR WITH W3-MIG, STATED SO NEITHER LANE BUILDS THE OTHER'S HALF
-- ---------------------------------------------------------------------------------
-- W3-MIG builds the nine verbs (promote, demote, extract parent, merge, split, reparent,
-- retype, rename, delete). This lane builds the STORAGE they record into
-- (`history.migration_log`, part two) and the ONE primitive they are undone through
-- (`history.migration_undo`). A verb calls `history.migration_record` with the inverse it
-- computed WHILE IT STILL HAD THE OLD VALUES — that is the whole of HIS-8: "undoable from
-- History, which requires the inverse to be stored AT THE TIME of the Migration", because the
-- inverse of a retype cannot be reconstructed afterwards from a row that no longer holds what
-- it used to hold.
--
-- ONE WRITE PATH, THREE UNDOS (HIS-N-2)
-- -------------------------------------
-- A Migration undo, a Value undo and a snapshot restore all go through
-- `custom.record_update(org, id, patch, expected_version)` — the door, the envelope, the
-- optimistic concurrency, the history capture, all of it. An undo that wrote directly would
-- be a second way into the store and would not be recorded, which would make the undo itself
-- invisible to History. Every undo here is itself a change, and it is recorded like any
-- other: putting something back is not the same as it never having happened.
--
-- `useCellUndo` in the frontend already proves the pattern — capture the inverse before the
-- write, apply it through the same path — and dies with the tab. This is that, in the store.
--
-- VIS-16 IS A REPLAY, AND ITS HONESTY IS THE HARD PART
-- ---------------------------------------------------
-- "Who could see R on date D" is answered by replaying History: the record's own visibility
-- and containment as they stood at D, plus the grant rows as they stood at D — including
-- principals who have since lost access, which is the whole point of asking. No separate
-- access-history store is kept (VIS-16), and the cost is measured rather than assumed.
--
-- `iam.permissions` carried NO version capture before this file (measured 2026-09-18: eight
-- triggers, none of them a capture), so the grant half of the replay had nothing to read. It
-- does now — through THIS lane's own capture, not through `platform._version_capture`, for
-- one reason: the campaign's writer must be inert while the OFF switch is off, and a body
-- that does not read the guard cannot be inert. A capture that is inert is not a silent one:
-- `history.capture_window` records when it opened and `history.who_could_see` REFUSES by name
-- for any earlier moment. A replay that would have to guess says so.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ═════════════════════════════════════════════════════════════════════════════
-- HIS-8 — the Migration log's two verbs: record the inverse, and run it.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function history.migration_record(p_organization_id uuid,
                                                    p_verb text,
                                                    p_target_kind text,
                                                    p_target_id uuid,
                                                    p_inverse jsonb,
                                                    p_note text default null)
returns uuid
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
  v_hi bigint;
begin
  perform custom.assert_store_door(p_organization_id, 'history.migration_log');

  if p_verb is null or btrim(p_verb) = '' then
    raise exception 'history.migration_record: a Migration is recorded under the verb that was run.'
      using errcode = '22004';
  end if;
  -- HIS-8: an inverse is the POINT of the row. A log entry with nothing to put it back with
  -- is a log entry that lies about being undoable, and is refused here rather than discovered
  -- sixty days later by somebody trying to undo it.
  if p_inverse is null or jsonb_typeof(p_inverse) <> 'object' or p_inverse = '{}'::jsonb then
    raise exception 'The Migration "%" was not recorded, because nothing was stored to put it back with.', p_verb
      using errcode = '22004',
            hint = 'HIS-8: the inverse is worked out and stored WHILE the Migration runs, because afterwards the old values are gone. A verb that cannot describe its own undo says so at the time — it does not record a row that pretends.';
  end if;
  if not (p_inverse ? 'kind') then
    raise exception 'The undo stored for "%" does not say what kind of undo it is.', p_verb
      using errcode = '22023',
            hint = 'HIS-8: the inverse carries "kind" — "patch" to write values back through custom.record_update, "restore" to bring a deleted record back, or "none" for a verb that is deliberately one-way and says so.';
  end if;
  if (p_inverse ->> 'kind') not in ('patch', 'restore', 'none') then
    raise exception 'The undo stored for "%" is a "%", and this store knows how to undo a patch, a restore, or nothing at all.', p_verb, p_inverse ->> 'kind'
      using errcode = '22023', hint = 'HIS-8: patch, restore, none.';
  end if;

  select max(v.id) into v_hi from history.row_versions v
   where v.entity_type = 'custom.record' and v.organization_id = p_organization_id;

  insert into history.migration_log
    (organization_id, verb, target_kind, target_id, inverse, row_version_hi, applied_by, note)
  values
    (p_organization_id, p_verb, p_target_kind, p_target_id, p_inverse, v_hi,
     coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
     p_note)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function history.migration_record(uuid, text, text, uuid, jsonb, text) is
  'HIS-8: record a Migration with the inverse stored AT THE TIME it ran. W3-MIG''s nine verbs call this. An entry with no inverse, or with an inverse this store cannot execute, is refused rather than written — a log that claims undoability it does not have is worse than no log.';

create or replace function history.migration_undo(p_organization_id uuid, p_log_id uuid)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
begin
  perform custom.assert_store_door(p_organization_id, 'history.migration_log');

  select * into m from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if m.id is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;
  if m.undone_at is not null then
    raise exception 'That Migration was already undone, on %.', m.undone_at
      using errcode = '22023',
            hint = 'HIS-8: undoing it twice would apply the same inverse to values that are already back. Nothing was changed. The undo itself is on the record too, so you can see what it did.';
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience: an undo that wrote
  -- around custom.record_update would skip the door, the envelope, the concurrency check and
  -- the history capture — so the undo itself would not be recorded.
  if v_kind = 'restore' then
    perform custom.record_restore(p_organization_id, v_target);
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    -- The expected version is deliberately NOT passed: an undo is a decision a person has
    -- already made against what they can see now, and refusing it because a background stamp
    -- moved the version would be the store arguing with them. Their write is recorded like
    -- any other, so a later reader sees exactly what the undo overwrote.
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver, 'at', now());
end;
$fn$;

comment on function history.migration_undo(uuid, uuid) is
  'HIS-8: undo a logged Migration by running the inverse stored when it ran — through custom.record_update or custom.record_restore, the same write path everything else uses, so the undo is itself recorded. The log entry is never deleted; it is marked undone.';

-- ═════════════════════════════════════════════════════════════════════════════
-- HIS-N-2 — ONE Value, put back, through the same door.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function history.value_undo(p_organization_id uuid, p_record_id uuid, p_key text)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_now    jsonb;
  v_prev   jsonb;
  v_found  boolean := false;
  r        record;
begin
  perform custom.assert_store_door(p_organization_id, 'history.value_undo');

  select rec.data into v_now
    from custom.record rec
   where rec.organization_id = p_organization_id and rec.id = p_record_id;
  if v_now is null then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000';
  end if;

  -- Walk BACK through the versions until a different value for this key appears. The most
  -- recent version is the current state, and the one before the last CHANGE to this key is
  -- what "undo" means to a person — not "the previous row", which may differ only in some
  -- other field they never touched.
  for r in
    select v.row_data -> 'data' as d, v.occurred_at
      from history.row_versions v
     where v.entity_type = 'custom.record'
       and v.organization_id = p_organization_id
       and v.row_id = p_record_id
     order by v.occurred_at desc, v.id desc
  loop
    if (r.d -> p_key) is distinct from (v_now -> p_key) then
      v_prev := r.d;
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception '% has not been changed since this store started recording it, so there is nothing to put back.', p_key
      using errcode = '02000',
            hint = format('HIS-N-2: undo puts back the value this field held before its last change. History began recording this store on %s.',
                          coalesce((select w.opened_at::text from history.capture_window w where w.entity_type = 'custom.record'), 'a date this store has not written yet'));
  end if;

  -- THE SAME WRITE PATH (HIS-N-2, verbatim: "through the same write path the core already
  -- uses for Migrations"). The undo is a write, so it gets a version, an envelope, an author
  -- and a history row of its own.
  perform custom.record_update(p_organization_id, p_record_id,
                               jsonb_build_object(p_key, v_prev -> p_key));

  return jsonb_build_object('record_id', p_record_id, 'key', p_key,
                            'was', v_now -> p_key, 'now', v_prev -> p_key,
                            'restored_from', (v_prev -> '_values' -> p_key ->> 'at'),
                            'at', now());
end;
$fn$;

comment on function history.value_undo(uuid, uuid, text) is
  'HIS-N-2: put one Value back to what it was before its last change, through custom.record_update — the same write path Migrations use. The undo is itself a change and is recorded like any other; putting something back is not the same as it never having happened.';

-- ═════════════════════════════════════════════════════════════════════════════
-- HIS-N-1 — a File-shaped record's snapshot chain IS its History.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function history.snapshot_chain(p_organization_id uuid, p_record_id uuid)
returns table(version integer, label text, occurred_at timestamptz, actor_id uuid, body jsonb)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v.version,
         -- The label is what a person picks a snapshot by: the moment and what happened,
         -- never a version number on its own.
         case v.operation
           when 'INSERT' then 'Created'
           when 'SOFT_DELETE' then 'Deleted'
           when 'RESTORE' then 'Brought back'
           else coalesce(nullif(v.row_data -> 'data' ->> '_snapshot_label', ''), 'Saved')
         end || ' · ' || to_char(v.occurred_at, 'FMDay FMDD FMMonth YYYY, HH24:MI'),
         v.occurred_at,
         v.actor_id,
         v.row_data -> 'data'
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
   order by v.occurred_at desc, v.id desc;
$fn$;

comment on function history.snapshot_chain(uuid, uuid) is
  'HIS-N-1: a document''s or a spreadsheet''s snapshot chain, labelled and restorable — and it is this store''s ordinary History for that record, not a second mechanism beside it. The live udt_workbook_snapshots / udt_document_snapshots chains are what this replaces for File-shaped records here.';

create or replace function history.snapshot_restore(p_organization_id uuid, p_record_id uuid, p_version integer)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_body jsonb;
  v_at   timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'history.snapshot_restore');

  select v.row_data -> 'data', v.occurred_at into v_body, v_at
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_body is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = format('HIS-N-1: the saved versions are listed by history.snapshot_chain(organization, record). Value history older than this table''s retention may have been pruned — the two most recent are always kept, and %s.',
                          case when exists (select 1 from history.row_versions v2
                                             where v2.entity_type = 'custom.record'
                                               and v2.organization_id = p_organization_id
                                               and v2.row_id = p_record_id)
                               then 'this record does have others' else 'this record has none at all' end);
  end if;

  -- The same write path again, so going back to an old version is a new version rather than
  -- a hole in the record: the chain keeps growing forwards, always.
  perform custom.record_update(p_organization_id, p_record_id,
                               v_body - '_values' - '_sources' - '_computed' - '_derived' - '_retired');

  return jsonb_build_object('record_id', p_record_id, 'restored_version', p_version,
                            'saved_at', v_at, 'at', now());
end;
$fn$;

comment on function history.snapshot_restore(uuid, uuid, integer) is
  'HIS-N-1: go back to a saved version, through custom.record_update. Restoring is a new version rather than a hole in the chain — the record keeps growing forwards, so what was undone is still readable.';

-- ═════════════════════════════════════════════════════════════════════════════
-- VIS-16 — who could see R on date D, by REPLAY. No access-history store.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function history.grants_at(p_resource_type text, p_resource_id uuid, p_at timestamptz)
returns table(permission_id uuid, granted_to_user_id uuid, granted_to_organization_id uuid,
              is_public boolean, level text, status text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- One row per grant id: its state as of the moment asked about, taken from the LAST version
  -- written at or before it. A grant deleted since is still here if it existed then — which
  -- is the whole reason VIS-16 is a replay and not a read of the live table.
  with latest as (
    select distinct on (v.row_id) v.row_id, v.operation, v.row_data
      from history.row_versions v
     where v.entity_type = 'iam.permissions'
       and v.occurred_at <= p_at
     order by v.row_id, v.occurred_at desc, v.id desc
  )
  select l.row_id,
         nullif(l.row_data ->> 'granted_to_user_id', '')::uuid,
         nullif(l.row_data ->> 'granted_to_organization_id', '')::uuid,
         coalesce((l.row_data ->> 'is_public')::boolean, false),
         l.row_data ->> 'permission_level',
         l.row_data ->> 'status'
    from latest l
   where l.operation <> 'DELETE'
     and l.row_data ->> 'resource_type' = p_resource_type
     and (l.row_data ->> 'resource_id')::uuid = p_resource_id
     and coalesce(l.row_data ->> 'status', 'active') <> 'rejected'
     and (nullif(l.row_data ->> 'expires_at', '') is null
          or (l.row_data ->> 'expires_at')::timestamptz > p_at);
$fn$;

comment on function history.grants_at(text, uuid, timestamptz) is
  'VIS-16: the grants on one resource as they stood at a moment, replayed from history.row_versions — including grants that have since been revoked or deleted, which is exactly who an audit is asking about.';

create or replace function history.who_could_see(p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns table(principal_kind text, principal_id uuid, level text, via_kind text, via_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc     jsonb;
  v_node    uuid := p_record_id;
  v_depth   integer := 0;
  v_ceiling integer;
  v_chain   uuid[] := array[]::uuid[];
begin
  -- RULE 16, AND IT IS THE HARD HALF OF VIS-16. A replay of a window the store was not
  -- recording would be a guess with a query's confidence, so both halves must have been
  -- watching: the record's own versions AND the grant rows.
  perform history.assert_watching('custom.record', p_at);
  perform history.assert_watching('iam.permissions', p_at);

  -- The CONTAINMENT CHAIN AS IT STOOD THEN — not as it stands now. A record moved into a
  -- different parent since D would otherwise be answered with today's parent's audience,
  -- which is the wrong answer to the only question anybody asks this for.
  v_ceiling := custom.containment_depth_ceiling(p_organization_id);
  loop
    v_chain := v_chain || v_node;
    v_doc := (history.record_at(p_organization_id, v_node, p_at)) -> 'data';
    exit when v_doc is null;
    v_node := nullif(v_doc ->> 'parent_id', '')::uuid;
    exit when v_node is null;
    exit when v_node = any (v_chain);          -- a loop in the past is still a loop
    v_depth := v_depth + 1;
    exit when v_depth > v_ceiling;
  end loop;

  return query
  -- (1) Everyone a grant named, on the record or on anything it was inside at the time.
  select case when g.granted_to_user_id is not null then 'user'
              when g.granted_to_organization_id is not null then 'organization'
              else 'public' end,
         coalesce(g.granted_to_user_id, g.granted_to_organization_id),
         g.level,
         case when c.node = p_record_id then 'record' else 'container' end,
         c.node
    from unnest(v_chain) as c(node)
    cross join lateral history.grants_at('record', c.node, p_at) g
  union
  -- (2) The organization's own members, when the record's visibility at the time let them
  --     see it. Visibility is read from the REPLAYED document, never from the live row.
  select 'user', m.user_id, 'viewer', 'organization', p_organization_id
    from iam.organization_member m
   where m.organization_id = p_organization_id
     and coalesce(((history.record_at(p_organization_id, p_record_id, p_at)) -> 'data' ->> 'visibility'),
                  ((history.record_at(p_organization_id, p_record_id, p_at)) -> 'visibility')) is not null
     and coalesce(((history.record_at(p_organization_id, p_record_id, p_at)) -> 'visibility') #>> '{}', 'internal')
         in ('internal', 'public');
end;
$fn$;

comment on function history.who_could_see(uuid, uuid, timestamptz) is
  'VIS-16: who could see this record on that date, answered by replaying History — the record''s own visibility and the containment chain AS THEY STOOD THEN, plus the grants as they stood then, including principals who have since lost access. No separate access-history store is kept. A moment History was not recording is refused by name rather than guessed at.';
