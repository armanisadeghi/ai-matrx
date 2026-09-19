-- chair-step: it calls `platform.reopen_declared_doors('custom')`, because `custom.io_revisions`
--   gains two answer columns and a function's return type cannot be changed in place — it is
--   dropped and recreated, which drops its EXECUTE grant with it. Everything else is additive:
--   two nullable columns, four `create or replace` bodies with their `-- based-on:` lines.
-- guard: custom/system_enabled
--
-- based-on: history.record_capture() 99c96788d1d1242555e7128b3ca3010c9084bc179642cdbac6d99b0ab718d328
-- based-on: history.migration_record(uuid, text, text, uuid, jsonb, text) 932d680dec0c5e1feda9dc009d769b58d1afb39862c33969b78f2766ea58dfb6
-- based-on: history.migration_undo(uuid, uuid) 979c14a5e4ff92a12977f560291a24dd5a3c8de56b3f77bcf4b7ece9e1aa947c
-- based-on: custom.io_changed_keys(jsonb, jsonb) c47320c868007092c63403058051a5d0cc4f7c375f9e2ac42ced96f58cea78b5
--
-- MERGE-HISTORY — T5's last clause: HISTORY SHOWS THE MERGE.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-19, in a rolled-back transaction: merge two Chens and
-- ask the one door a person has, `custom.io_revisions`. It answers
--
--     version 3, UPDATE, 2026-09-19 18:15, 0 field(s) changed
--
-- for the merge, and — this is the part that says it is a class and not a merge bug —
--
--     version 2, UPDATE, 2026-09-19 18:15, 0 field(s) changed
--
-- for an ORDINARY edit that changed a name. Every revision of every record on the platform has
-- been saying "0 field(s) changed" since the door was built. THREE causes, all of them here:
--
--   1. THE COUNT ASKED ABOUT NO TABLE. `custom.io_revisions` called
--      `custom.io_changed_field_ids(p_organization_id, NULL, old, new)`, and that function
--      resolves keys to Field ids through `custom.applicable_fields(org, p_table_id, …)`, whose
--      predicate is `entity_definition_id = p_table_id`. With a NULL table id it matches no
--      Field ever, so `jsonb_array_length` was counting an array that is empty by construction.
--      Nothing was broken in the diff; nobody was asked for a diff.
--   2. A COMPOUND OPERATION WRITES INTO THE ENVELOPE, AND THE DIFF DID NOT LOOK THERE.
--      `custom.io_changed_keys` skips every key whose name starts with `_`, which is right for
--      the bookkeeping keys themselves and wrong for what they hold: a merge keeps the losing
--      record's phone number as a ranked alternate under `_values.phone.alternates`, and a
--      retype files a value it could not carry under `_retired`. The phone number of a merged
--      record changed; the document's top level did not. So even with cause 1 fixed, a merge
--      would still have answered "0 field(s) changed" — truthfully, about the wrong question.
--   3. THE OPERATION HAD NO NAME IN THE VERSION CHAIN. `history.migration_log` knows the word
--      "merge"; `history.row_versions` — the chain `custom.io_revisions` reads — knows only
--      INSERT / UPDATE / SOFT_DELETE / RESTORE. The two were never joined: `row_version_lo` is
--      NULL on every Migration ever recorded and `row_version_hi` holds the high-water mark
--      taken BEFORE the verb ran, so the range names none of the versions the verb wrote. A
--      merge, a split, a retype, a cascade delete and an undo all reached history as "UPDATE".
--
-- THE FIX IS THE CLASS, not the merge. A compound operation SIGNS the versions it writes:
--
--   · `history.row_versions` gains `migration_id` and `operation_name` (both nullable).
--   · `history.migration_record` — which EVERY compound verb already calls, because HIS-8
--     refuses a Migration with no stored inverse — marks the statement it is running in.
--     `history.record_capture`, the one trigger that writes every version of every record,
--     stamps that mark onto each version it writes. No verb body is edited, so merge, split,
--     retype, reparent, extract-parent, promote, demote, rename, delete-with-its-contents,
--     purge and every compound verb added after tonight are covered the moment they record
--     their inverse. A verb that records no Migration writes no mark, and its versions read
--     exactly as they do today.
--   · THE MARK IS FENCED BY THE STATEMENT, not by the transaction. `set_config(…, true)` lasts
--     the whole transaction, and a transaction that runs a merge and then an ordinary edit
--     would stamp the edit "merge". The mark therefore carries `statement_timestamp()`, which
--     is fixed for one top-level statement and moves for the next, and `record_capture` honours
--     it only while they match. A client's `select custom.migrate_merge(…)` is one statement and
--     everything the merge writes is inside it.
--   · THE OUTERMOST VERB WINS. A compound verb that calls another compound verb records two
--     Migrations; the first mark of a statement stands, because the operation a person asked
--     for is the one they typed, not the one it decomposed into.
--   · `history.migration_undo` marks itself too ("undo of merge") — it restores records and
--     revokes an alias without recording a Migration of its own, so it is the one writer that
--     has to say its own name.
--
-- AND THE ANSWER SAYS BOTH THINGS. `custom.io_revisions` gains `operation` and `changed_fields`
-- and its sentence names the fields:
--
--     version 3, merge, 2026-09-19 18:15, 1 field(s) changed: phone
--
-- The two new columns are APPENDED, so `select *`, a four-column `select` and every existing
-- caller keep working.
--
-- INVERSE: migrations/inverse/mergehist_a_compound_operation_signs_its_revision_down.sql

set lock_timeout = '3s';
set statement_timeout = '5min';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE TWO COLUMNS. Nullable, so every version ever written stays exactly as true as it was.
-- ─────────────────────────────────────────────────────────────────────────────────────────
alter table history.row_versions add column if not exists migration_id   uuid;
alter table history.row_versions add column if not exists operation_name text;

comment on column history.row_versions.migration_id is
  'MERGE-HISTORY: the history.migration_log entry of the compound operation that wrote this version, stamped by history.record_capture from the mark history.migration_record leaves on the statement. NULL means an ordinary write, which is most of them.';
comment on column history.row_versions.operation_name is
  'MERGE-HISTORY: the verb a person asked for — merge, split, retype, delete, undo of merge — carried on the version itself so it survives the pruning of history.migration_log.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE MARK: recorded by the verb that already records its inverse, fenced to its statement
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION history.migration_record(p_organization_id uuid, p_verb text, p_target_kind text, p_target_id uuid, p_inverse jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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

  -- MERGE-HISTORY: THE MARK. Every version `history.record_capture` writes for the rest of
  -- THIS STATEMENT carries this Migration's id and this verb's name, which is how a merge
  -- stops reaching history as "UPDATE". The fence is `statement_timestamp()`: it is fixed for
  -- one top-level statement and moves for the next, so the mark cannot leak onto an ordinary
  -- edit that happens later in the same transaction. The FIRST verb of a statement wins — a
  -- compound verb that calls another records two Migrations, and the operation a person asked
  -- for is the outer one.
  if coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   v_id::text,                  true);
    perform set_config('history.mark_verb', p_verb,                      true);
  end if;

  return v_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE TRIGGER THAT WRITES EVERY VERSION, now writing down what the write was FOR
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION history.record_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row   jsonb;
  v_old   jsonb;
  v_op    text;
  v_org   uuid := coalesce(new.organization_id, old.organization_id);
  v_mig   uuid;
  v_verb  text;
begin
  -- THE GUARD, through the one predicate (see history.capture_is_open). An AFTER trigger on
  -- a write the BEFORE triggers already admitted must never raise, so the refusal is read as
  -- a boolean here and the window below is what keeps the silence honest.
  if not history.capture_is_open(v_org) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_op  := 'DELETE';
  else
    v_row := to_jsonb(new);
    if tg_op = 'INSERT' then
      v_op := 'INSERT';
    else
      v_old := to_jsonb(old);
      -- REC-23's soft delete and its undo are distinguishable operations in the store, or
      -- "who deleted this and when did it come back" is unanswerable.
      v_op := case
                when v_row ->> 'deleted_at' is not null and v_old ->> 'deleted_at' is null then 'SOFT_DELETE'
                when v_row ->> 'deleted_at' is null and v_old ->> 'deleted_at' is not null then 'RESTORE'
                else 'UPDATE'
              end;
      -- The contentless-update guard, the same one platform._version_capture applies: a
      -- snapshot identical to its predecessor in everything but the bookkeeping columns is
      -- not a version of anything. HIS-1 is "nothing can opt out of being RECORDED", not
      -- "every statement writes a row whether or not it changed anything".
      if v_op = 'UPDATE'
         and (v_row - 'version' - 'updated_at' - 'updated_by')
             is not distinct from (v_old - 'version' - 'updated_at' - 'updated_by') then
        return new;
      end if;
    end if;
  end if;

  -- MERGE-HISTORY: WHAT THIS WRITE WAS FOR. `history.migration_record` marks the statement a
  -- compound verb runs in; the mark is honoured only while `statement_timestamp()` still
  -- matches, so it belongs to that verb's call and to nothing that runs after it.
  if nullif(current_setting('history.mark_at', true), '') = statement_timestamp()::text then
    v_mig  := nullif(current_setting('history.mark_id', true), '')::uuid;
    v_verb := nullif(current_setting('history.mark_verb', true), '');
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  values ('custom.record',
          (v_row ->> 'id')::uuid,
          v_org,
          coalesce((v_row ->> 'version')::integer, 1),
          v_op,
          v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier(),
          v_mig,
          v_verb);

  -- The window opens on the first row actually recorded, never on the apply. A replay can
  -- then tell "nothing happened" from "nobody was watching".
  insert into history.capture_window (entity_type, note)
  values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE WRITER THAT RECORDS NO MIGRATION OF ITS OWN, SAYING ITS OWN NAME
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION history.migration_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
  v_also   uuid;
  v_back   integer := 0;
  v_unalias uuid;
  v_revoked integer := 0;
begin
  -- THE SWITCH, READ HERE. This function lives in `history`, not in `custom`, so it is not
  -- covered by the schema's own closed-door posture and says out loud which knob holds it off:
  -- while custom/system_enabled resolves false for this organization the record store takes
  -- writes only from the role that owns custom.record, and an undo is a write.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false) then
    perform custom.assert_store_door(p_organization_id, 'history.migration_log');
  end if;

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

  -- MERGE-HISTORY: THE UNDO SAYS ITS OWN NAME. Every other compound verb is stamped through
  -- `history.migration_record`, because HIS-8 makes it record its inverse before it writes.
  -- An undo records none — it IS the inverse — so it marks the statement itself, and the
  -- versions it writes read "undo of merge" instead of "UPDATE" and "RESTORE".
  if coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   p_log_id::text,              true);
    perform set_config('history.mark_verb', 'undo of ' || m.verb,        true);
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience.
  if v_kind = 'restore' then
    perform custom.record_restore(p_organization_id, v_target);
    -- EVERYTHING THE DELETE TOOK WITH IT. A delete that cascaded and an undo that put one
    -- record back is not an undo; it is a smaller version of the same data loss.
    for v_also in select (x #>> '{}')::uuid
                    from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_also
                    and r.deleted_at is not null) then
        perform custom.record_restore(p_organization_id, v_also);
        v_back := v_back + 1;
      end if;
    end loop;
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  -- THE ID HAS TO STOP RESOLVING (T5). A merge sends the loser's id to the winner forever;
  -- undoing the merge puts the loser back, and an id still pointing at the winner lands every
  -- relation to the restored record on the WRONG record. The alias is revoked rather than
  -- deleted: the merge happened, and the record of it stays.
  v_unalias := nullif(m.inverse ->> 'unalias', '')::uuid;
  if v_unalias is not null then
    update custom.record_alias a
       set revoked_at = now()
     where a.organization_id = p_organization_id and a.old_id = v_unalias
       and a.revoked_at is null;
    get diagnostics v_revoked = row_count;
    if v_revoked = 0 then
      raise exception 'The undo of "%" says the id % must stop resolving, and there is no live alias for it. Nothing here is half done — the restore above is in this same transaction and goes back with this refusal.', m.verb, v_unalias
        using errcode = '02000',
              hint = 'HIS-8 / T5: an undo that could not put the id back would leave every relation to the restored record pointing at the record it was merged into.';
    end if;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver,
                            'also_restored', v_back, 'ids_unaliased', v_revoked, 'at', now());
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- WHAT COUNTS AS A FIELD CHANGING: the value, its envelope, and what was retired from it
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_changed_keys(p_old jsonb, p_new jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Envelope bookkeeping is not a value: `_values`, `_sources`, `_computed`, `_derived`,
  -- `_retired`, `_actor` and anything else the store keeps under a leading underscore is never
  -- itself a changed key.
  --
  -- MERGE-HISTORY: BUT WHAT THEY HOLD IS. A merge keeps the losing record's phone number as a
  -- ranked alternate under `_values.phone.alternates`, a retype files a value it could not
  -- carry under `_retired`, and a dated correction rewrites `_values.address.periods`. In every
  -- one of those the field changed and the document's top level did not, so asking only the top
  -- level answered "nothing moved" about the operations people most want to see. The keys are
  -- therefore gathered from three places and judged in all three.
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_old -> '_values') = 'object'
                                               then p_old -> '_values' else '{}'::jsonb end) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_new -> '_values') = 'object'
                                               then p_new -> '_values' else '{}'::jsonb end) k
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e
  )
  select coalesce(array_agg(k order by k), array[]::text[])
    from keys
   where k is not null
     and left(k, 1) <> '_'
     and ((coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k)
          or (p_old -> '_values' -> k) is distinct from (p_new -> '_values' -> k)
          or (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k)
             is distinct from
             (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k));
$function$;

comment on function custom.io_changed_keys(jsonb, jsonb) is
  'W4-IO / MERGE-HISTORY: the field keys that moved between two record documents — by their value, by their envelope under _values (alternates, sources, dated periods), or by what stands under _retired for them. A key named _something is bookkeeping and is never itself reported.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE CHAIN, CARRYING THE OPERATION
-- ─────────────────────────────────────────────────────────────────────────────────────────
drop function if exists history.record_versions(uuid, uuid);
create function history.record_versions(p_organization_id uuid, p_record_id uuid)
returns table(version integer, operation text, occurred_at timestamptz, actor_id uuid,
              row_data jsonb, migration_id uuid, operation_name text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- MERGE-HISTORY appends `migration_id` and `operation_name`: the compound operation that
  -- wrote the version, stamped by history.record_capture. The five older columns keep their
  -- names, their types and their order.
  select v.version, v.operation, v.occurred_at, v.actor_id, v.row_data,
         v.migration_id, v.operation_name
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.row_id = p_record_id
     and v.organization_id = p_organization_id
   order by v.occurred_at, v.id;
$fn$;

comment on function history.record_versions(uuid, uuid) is
  'HIS-1 / MERGE-HISTORY: one record''s version chain, each version carrying the compound operation that wrote it (merge, split, retype, delete, undo of merge) or NULL for an ordinary write.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE DOOR A PERSON HAS: what each version IS, in words, with the fields that moved
-- ─────────────────────────────────────────────────────────────────────────────────────────
drop function if exists custom.io_revisions(uuid, uuid);
create function custom.io_revisions(p_organization_id uuid, p_record_id uuid)
returns table(version integer, changed_at timestamptz, changed_by uuid, summary text,
              operation text, changed_fields jsonb)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_revisions');
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
    return;
  end if;

  -- THE RECORD'S OWN TABLE. It used to pass NULL here, and every changed-field count on the
  -- platform was an empty array being measured (see this file's header, cause 1). The record
  -- is read by id whether or not it is deleted: the last version of a merged-away record is
  -- exactly the one somebody wants explained.
  select r.table_id into v_table from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- `history.record_versions` is the store's own chain. This wraps it so a person is told what
  -- each version IS before they are asked to choose one — "restore to version 7" with no
  -- sentence beside it is a button nobody can press responsibly.
  -- The previous document is the PRECEDING version's, read with a window rather than a
  -- self-join, so a record with two hundred versions costs one pass.
  return query
    select v.version, v.occurred_at, v.actor_id,
           format('version %s, %s, %s, %s',
                  v.version,
                  -- THE OPERATION IN THE WORD A PERSON USED. A compound verb signs its
                  -- versions (MERGE-HISTORY); an ordinary write is described by what it did.
                  case
                    when v.operation_name is not null then
                      v.operation_name || case v.operation
                                            when 'SOFT_DELETE' then ' (record removed)'
                                            when 'RESTORE'     then ' (record restored)'
                                            when 'INSERT'      then ' (record created)'
                                            else '' end
                    when v.operation = 'INSERT'      then 'created'
                    when v.operation = 'UPDATE'      then 'updated'
                    when v.operation = 'SOFT_DELETE' then 'deleted'
                    when v.operation = 'RESTORE'     then 'restored'
                    else lower(v.operation)
                  end,
                  to_char(v.occurred_at, 'YYYY-MM-DD HH24:MI'),
                  case when coalesce(array_length(v.keys, 1), 0) = 0
                       then 'no field values changed'
                       else format('%s field(s) changed: %s',
                                   array_length(v.keys, 1), array_to_string(v.keys, ', '))
                  end),
           coalesce(v.operation_name, lower(v.operation)),
           jsonb_build_object(
             'keys', to_jsonb(v.keys),
             -- The Field ids too, where the Table declares its Fields as Field records. An
             -- empty array here never means "nothing changed" — `keys` answers that.
             'field_ids', custom.io_changed_field_ids(p_organization_id, v_table,
                            coalesce(v.previous_data, '{}'::jsonb),
                            coalesce(v.row_data -> 'data', '{}'::jsonb)),
             'migration_id', to_jsonb(v.migration_id))
      from (select w.*,
                   custom.io_changed_keys(coalesce(w.previous_data, '{}'::jsonb),
                                          coalesce(w.row_data -> 'data', '{}'::jsonb)) as keys
              from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id, rv.row_data,
                           rv.migration_id, rv.operation_name,
                           lag(rv.row_data -> 'data') over (order by rv.version) as previous_data
                      from history.record_versions(p_organization_id, p_record_id) rv) w) v
     order by v.version desc;
end;
$fn$;

comment on function custom.io_revisions(uuid, uuid) is
  'DOOR-16 / MERGE-HISTORY: one record''s revisions, each with the operation a person asked for (merge, split, retype, delete, undo of merge, or an ordinary created/updated/deleted) and the field keys that actually moved — including the ones a compound operation moved into the envelope.';

-- The door was dropped to widen its answer, and a dropped function takes its EXECUTE grant
-- with it. This is the declared-door register putting back exactly what it declares, which is
-- why this file is a chair step.
select * from platform.reopen_declared_doors('custom');
