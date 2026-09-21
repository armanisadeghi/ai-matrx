-- INVERSE of migrations/campaign/mergehist_a_compound_operation_signs_its_revision.sql
--
-- It puts the five bodies back exactly as they were on the main database at 2026-09-19 18:20Z
-- and takes the two columns off `history.row_versions`. After it runs, every revision reads
-- "0 field(s) changed" again and a merge reaches history as "UPDATE" — which is the defect, so
-- this file exists to be RUN ONCE in a rolled-back transaction (the red twin does exactly that)
-- and never on purpose otherwise.

set lock_timeout = '3s';
set statement_timeout = '5min';

drop function if exists custom.io_revisions(uuid, uuid);
drop function if exists history.record_versions(uuid, uuid);

CREATE OR REPLACE FUNCTION history.record_versions(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(version integer, operation text, occurred_at timestamp with time zone, actor_id uuid, row_data jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select v.version, v.operation, v.occurred_at, v.actor_id, v.row_data
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.row_id = p_record_id
     and v.organization_id = p_organization_id
   order by v.occurred_at, v.id;
$function$
;
CREATE OR REPLACE FUNCTION custom.io_revisions(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(version integer, changed_at timestamp with time zone, changed_by uuid, summary text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_revisions');
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
    return;
  end if;
  -- `history.record_versions` is the store's own chain. This wraps it so a person is told what
  -- each version IS before they are asked to choose one — "restore to version 7" with no
  -- sentence beside it is a button nobody can press responsibly.
  -- `history.record_versions` answers (version, operation, occurred_at, actor_id, row_data).
  -- The previous document is the PRECEDING version's, read with a window rather than a
  -- self-join, so a record with two hundred versions costs one pass.
  return query
    select v.version, v.occurred_at, v.actor_id,
           format('version %s, %s, %s, %s field(s) changed',
                  v.version, v.operation,
                  to_char(v.occurred_at, 'YYYY-MM-DD HH24:MI'),
                  jsonb_array_length(custom.io_changed_field_ids(
                    p_organization_id, null,
                    coalesce(v.previous_data, '{}'::jsonb),
                    coalesce(v.row_data -> 'data', '{}'::jsonb))))
      from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id, rv.row_data,
                   lag(rv.row_data -> 'data') over (order by rv.version) as previous_data
              from history.record_versions(p_organization_id, p_record_id) rv) v
     order by v.version desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION custom.io_changed_keys(p_old jsonb, p_new jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Envelope bookkeeping is not a value: `_values`, `_sources`, `_computed`, `_derived`,
  -- `_retired`, `_actor` and anything else the store keeps under a leading underscore.
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union
    select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
  )
  select coalesce(array_agg(k order by k), array[]::text[])
    from keys
   where left(k, 1) <> '_'
     and (coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k);
$function$
;
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

  return v_id;
end;
$function$
;
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

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values ('custom.record',
          (v_row ->> 'id')::uuid,
          v_org,
          coalesce((v_row ->> 'version')::integer, 1),
          v_op,
          v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier());

  -- The window opens on the first row actually recorded, never on the apply. A replay can
  -- then tell "nothing happened" from "nobody was watching".
  insert into history.capture_window (entity_type, note)
  values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$function$
;
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
$function$
;

-- 🚨 THE TWO COLUMNS STAY (lane RED-SUITES-3, 2026-09-21). This file dropped them because
-- MERGE-HIST's up-file added them, and the history store has moved on: the STATEMENT-level
-- capture the perf rewrite installed — `history.record_capture_stmt_insert` / `_stmt_update` /
-- `_stmt_delete`, attached to `custom.record` as `zzz_history_capture_s_i` / `_s_u` / `_s_d` —
-- NAMES `migration_id` in its own INSERT. So dropping the column stopped the store recording
-- anything at all, and `mergehist_red.sql` died on its first write:
--     ERROR:  column "migration_id" of relation "row_versions" does not exist
--     CONTEXT:  PL/pgSQL function history.record_capture_stmt_insert() line 17
-- before it asked a single one of its questions. A history store that cannot take a row is not
-- the defect this file exists to restore.
--
-- WHAT THE DEFECT IS, and it is fully restored above: nothing SIGNS a revision any more. Every
-- door that wrote or read the signature is back to the body it had before MERGE-HIST, so the
-- two columns sit there empty for anything those doors touch — which is exactly what "a
-- compound operation does not sign its revision" looks like. Emptying them is the restoration;
-- demolishing them is a broken table.
update history.row_versions set operation_name = null, migration_id = null
 where operation_name is not null or migration_id is not null;

select * from platform.reopen_declared_doors('custom');
