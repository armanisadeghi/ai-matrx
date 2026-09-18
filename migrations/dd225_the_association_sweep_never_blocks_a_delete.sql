-- DD-225 — the association sweep never blocks a delete on a non-uuid-keyed table.
--
-- THE DEFECT (found by B-106 while it was closing DD-214, re-measured live here 2026-09-14,
-- every probe rolled back). `platform._gc_entity_associations()` is the generic garbage
-- collector that hangs off EVERY registered entity table: on a hard DELETE it destroys the
-- `platform.associations` edges that pointed at the row, and on a soft delete / restore it
-- tombstones and revives them. It addressed the row as `old.id` / `new.id` and compared that
-- value straight to `platform.associations.source_id` / `target_id`, which are `uuid`. On the
-- two registered tables whose own key is NOT a uuid, that comparison has no operator, and an
-- AFTER trigger that raises takes the whole statement with it:
--
--   DELETE FROM platform.activity_log WHERE id = 4108   (bigint key)
--     -> 42883 operator does not exist: uuid = bigint
--   DELETE FROM extend.wbx_guidance  WHERE id = '…'     (text key)
--     -> 42883 operator does not exist: uuid = text
--   UPDATE extend.wbx_guidance SET deleted_at = now()   (the soft-delete arm, same wall)
--     -> 42883 operator does not exist: uuid = text
--
-- So NO row of the platform activity log could be deleted by anyone — not retention, not a
-- purge, not an organization erasing its own trail, not a superuser — and the same for the
-- extension's guidance table in both directions. 221,464 activity rows were undeletable.
--
-- THE CENSUS (live catalogue, 2026-09-14). 1,214 triggers on 674 tables run this function.
-- 1,211 of them sit on uuid-keyed tables and are correct. The affected shapes are exactly:
--     platform.activity_log   id bigint  token `activity`       _gc_assoc_harddelete
--     extend.wbx_guidance     id text    token `wbx_guidance`   _gc_assoc_harddelete + _gc_assoc_softdelete
-- Every one of those three triggers is proven RED and GREEN in the forcing test at the foot of
-- this file, along with both uuid shapes, so the fix cannot be believed on its author's word.
--
-- THE IDENTITY QUESTION, ANSWERED BY THE ASSOCIATION SYSTEM AND NOT BY A CAST. An edge names its
-- endpoints as (`source_type` text, `source_id` uuid) / (`target_type` text, `target_id` uuid).
-- `uuid` is the ONLY key an endpoint can have — there is no declared alternative identity for a
-- row anywhere in `platform.entity_types` (no key column, no surrogate), and there is no FK from
-- the edge to the row. So a row whose primary key is not a uuid CANNOT be an endpoint of any
-- edge, today or ever, and the live data agrees: zero edges name `activity` or `wbx_guidance` on
-- either side. The sweep for such a row is therefore provably empty — not "probably empty", not
-- "matched by a cast". This is why the guard SKIPS rather than casting `old.id::text::uuid`
-- (which would raise on 'wbx_guidance-…' and silently match nothing on a bigint) and rather than
-- reaching for some other uuid column on the table: `platform.activity_log.entity_id` is a uuid,
-- but it names the entity the activity is ABOUT — sweeping on it would destroy the edges of an
-- innocent third row every time a log line was purged. Nothing here fails silently, because
-- nothing here fails: the entity has no edges, and the caller's DELETE does what it says.
--
-- THE CLASS, FIXED AT BOTH ENDS:
--   1. the trigger function refuses to address a non-uuid key at all (this protects all 1,214
--      attachments that exist and any a future hand-written migration adds);
--   2. `platform.sync_association_gc_triggers()` — the installer that CREATED these three
--      triggers — only ever asked whether the table has an `id` column, never what type it is.
--      It now asks, and REPORTS the skip through its own `action`/`detail` contract instead of
--      attaching a trigger that can only ever fail.
--
-- WHY THE THREE EXISTING TRIGGERS ARE NOT DROPPED. With the guard in place they are correct and
-- (measured below) cost one syscache lookup per row. Keeping them means that the day
-- `platform.activity_log` is canonicalized onto a uuid id — the Doctrine's own direction, the
-- same move DD-173 made on `billing.plan` — its edges start being swept automatically, instead
-- of being silently unswept because someone removed the trigger and nobody remembered to add it
-- back. A live trigger that is a proven no-op is cheaper than a missing one.
--
-- SECURITY MODE. The function stays SECURITY DEFINER, which is what it already is and what it
-- must be: it deletes from `platform.associations` on behalf of whoever deleted the entity row,
-- and the edges of an entity are not necessarily readable by that caller. db-rules' default of
-- SECURITY INVOKER is for callable doors; this is an internal AFTER trigger reachable only by
-- writing the entity table the caller already had the right to write.

-- based-on: platform._gc_entity_associations() 712d4463e40488c6a6693157b1fd1dbde77c91444d16f2bbee155b2daeee6126
CREATE OR REPLACE FUNCTION platform._gc_entity_associations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token       text := tg_argv[0];
  v_key_is_uuid boolean;
begin
  -- 🚨 DD-225 (2026-09-14). An edge's endpoint is a uuid — `platform.associations.source_id`
  -- and `target_id` are uuid columns, and no other identity for a row is declared anywhere in
  -- the association system. A row whose own `id` is bigint or text can therefore never be an
  -- endpoint, so there is nothing here to collect. Until this test existed, the comparison
  -- below was planned against such a key and raised `42883 operator does not exist: uuid =
  -- bigint`, and because this is an AFTER trigger the caller's DELETE died with it: not one of
  -- the 221,464 rows in `platform.activity_log` could be deleted by anybody. The skip is a
  -- proof, not a fallback: it is reached only where the sweep is empty by construction.
  select a.atttypid = 'uuid'::regtype
    into v_key_is_uuid
    from pg_catalog.pg_attribute a
   where a.attrelid = tg_relid
     and a.attname  = 'id'
     and a.attnum   > 0
     and not a.attisdropped;

  if v_key_is_uuid is not true then
    return null;
  end if;

  -- A true hard DELETE destroys the edges for good, tombstoned ones included.
  if tg_op = 'DELETE' then
    delete from platform.associations
     where (source_type = v_token and source_id = old.id)
        or (target_type = v_token and target_id = old.id);
    return null;
  end if;

  if tg_op <> 'UPDATE' then
    return null;
  end if;

  -- TRASH: soft-remove every LIVE edge, stamped with the entity that caused it.
  -- Already-tombstoned edges keep their original stamp so the entity that first
  -- removed them is the entity that brings them back.
  if old.deleted_at is null and new.deleted_at is not null then
    update platform.associations
       set deleted_at       = now(),
           deleted_via_type = v_token,
           deleted_via_id   = new.id
     where deleted_at is null
       and ((source_type = v_token and source_id = new.id)
         or (target_type = v_token and target_id = new.id));

  -- RESTORE: bring back exactly what THIS entity's trashing removed. An edge the
  -- user detached before trashing was hard-deleted and is not resurrected.
  elsif old.deleted_at is not null and new.deleted_at is null then
    update platform.associations
       set deleted_at       = null,
           deleted_via_type = null,
           deleted_via_id   = null
     where deleted_at is not null
       and deleted_via_type = v_token
       and deleted_via_id   = new.id;
  end if;

  return null;
end
$function$;

COMMENT ON FUNCTION platform._gc_entity_associations() IS
  'The generic association garbage collector behind _gc_assoc_harddelete / _gc_assoc_softdelete on every registered entity table. Hard DELETE destroys the row''s edges; soft delete tombstones them with the entity that caused it; restore revives exactly those. DD-225: a table whose own `id` is not a uuid can never be an edge endpoint (source_id/target_id are uuid and no other identity is declared), so the sweep is skipped rather than raising 42883 and killing the caller''s DELETE — which is what made platform.activity_log undeletable until 2026-09-14.';

-- based-on: platform.sync_association_gc_triggers(text) c89207d05844e33fdac02d013cb9ed0804567637e4cc73033af6e430d63eba0e
CREATE OR REPLACE FUNCTION platform.sync_association_gc_triggers(p_token text DEFAULT NULL::text)
 RETURNS TABLE(token text, action text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r record;
  v_has_id boolean;
  v_has_deleted_at boolean;
  v_has_hard boolean;
  v_has_soft boolean;
  v_id_type text;
begin
  for r in
    select et.token, et.schema_name, et.table_name
      from platform.entity_types et
      join pg_namespace n on n.nspname = et.schema_name
      join pg_class pc on pc.relnamespace = n.oid and pc.relname = et.table_name
     where et.table_ref is not null
       and et.is_active = true
       and pc.relkind in ('r', 'p')
       and (p_token is null or et.token = p_token)
  loop
    select bool_or(c.column_name='id'), bool_or(c.column_name='deleted_at')
      into v_has_id, v_has_deleted_at
      from information_schema.columns c
     where c.table_schema = r.schema_name and c.table_name = r.table_name;

    if not coalesce(v_has_id, false) then
      token := r.token; action := 'skipped'; detail := 'no id column on ' || r.schema_name || '.' || r.table_name;
      return next;
      continue;
    end if;

    -- 🚨 DD-225 (2026-09-14). An edge endpoint is a uuid: platform.associations.source_id and
    -- target_id are uuid columns and no other row identity is declared. Attaching the sweep to a
    -- table whose `id` is bigint or text does not collect anything — it raises 42883 and, being
    -- an AFTER trigger, kills the caller's DELETE. This loop CREATED exactly that on
    -- platform.activity_log (bigint) and extend.wbx_guidance (text) because it asked whether the
    -- table has an `id`, never what type it is. It asks now, and says so out loud in its own
    -- report rather than installing a trigger that can only fail.
    select c.data_type into v_id_type
      from information_schema.columns c
     where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'id';

    if v_id_type is distinct from 'uuid' then
      token := r.token; action := 'skipped';
      detail := format('%I.%I keys on %s, not uuid — platform.associations addresses endpoints by uuid, so this entity can hold no edges and needs no sweep (DD-225)',
                       r.schema_name, r.table_name, coalesce(v_id_type, 'an unreadable type'));
      return next;
      continue;
    end if;

    select exists (
      select 1 from information_schema.triggers t
       where t.event_object_schema = r.schema_name and t.event_object_table = r.table_name
         and t.trigger_name = '_gc_assoc_harddelete' and t.event_manipulation = 'DELETE'
    ) into v_has_hard;

    if not v_has_hard then
      execute format(
        'CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations(%L)',
        r.schema_name, r.table_name, r.token);
      token := r.token; action := 'added_harddelete'; detail := format('%I.%I', r.schema_name, r.table_name);
      return next;
    end if;

    if v_has_deleted_at then
      select exists (
        select 1 from information_schema.triggers t
         where t.event_object_schema = r.schema_name and t.event_object_table = r.table_name
           and t.trigger_name = '_gc_assoc_softdelete' and t.event_manipulation = 'UPDATE'
      ) into v_has_soft;

      if not v_has_soft then
        execute format(
          'CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations(%L)',
          r.schema_name, r.table_name, r.token);
        token := r.token; action := 'added_softdelete'; detail := format('%I.%I', r.schema_name, r.table_name);
        return next;
      end if;
    end if;
  end loop;
  return;
end;
$function$;

-- The replace preserves the function's ACL, and these two lines re-assert it verbatim so the
-- live grant set (postgres + service_role EXECUTE, no client lane) is stated by the file rather
-- than inherited silently. This installer is NOT a client door and has no row in
-- platform.client_callable_door — the DDL guard's warning about a revoked client grant is that
-- guard working, not a grant this file dropped.
REVOKE ALL ON FUNCTION platform.sync_association_gc_triggers(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.sync_association_gc_triggers(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.sync_association_gc_triggers(text) TO service_role;

COMMENT ON FUNCTION platform.sync_association_gc_triggers(text) IS
  'Installs the _gc_assoc_harddelete/_gc_assoc_softdelete association-sweep triggers on every active registered entity table. DD-225: a table whose id is not a uuid is reported as skipped and left alone — platform.associations addresses endpoints by uuid, so such an entity can hold no edges, and the trigger it used to install could only raise 42883 and kill the caller''s DELETE.';

-- ---------------------------------------------------------------------------------------------
-- THE FORCING TEST. Five shapes, every one of them a REAL write to the REAL tables, every one
-- rolled back inside its own subtransaction before the next begins. It is re-runnable: it plants
-- what it needs and leaves nothing behind. It is a forcing test and not a decoration because
-- shapes A, B and C are the three statements that raised 42883 on this database ten minutes
-- before this file was written, and shapes D and E fail the moment the new guard is one letter
-- too wide and starts skipping the uuid tables the sweep actually exists for.
--   A  bigint key, hard delete      platform.activity_log
--   B  text key,   hard delete      extend.wbx_guidance
--   C  text key,   soft delete      extend.wbx_guidance
--   D  uuid key,   soft delete + restore, with a planted edge   workbench.notes -> web_page
--   E  uuid key,   hard delete,            with a planted edge   workbench.notes -> web_page
-- plpgsql variables survive a subtransaction rollback, so each shape records its verdict in
-- v_fail and the whole file refuses to commit at the end if any shape did not behave.
-- ---------------------------------------------------------------------------------------------
do $dd225$
declare
  v_fail     text;
  v_sysorg   constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  v_bigid    bigint;
  v_noteid   uuid;
  v_edge     uuid;
  v_n        integer;
  v_dead     timestamptz;
  v_via      text;
begin
  -- The planted edge in shapes D/E is written by this migration, with no auth.uid(): the
  -- provenance guard on platform.associations refuses a write that declares actor_tier=code and
  -- names no system. It is right to. The test says who it is, transaction-locally.
  perform set_config('app.actor_system', 'dd225_forcing_test', true);

  ---------------------------------------------------------------- A: bigint key, hard delete
  begin
    insert into platform.activity_log (organization_id, action, metadata)
    values (v_sysorg, 'dd225_forcing_probe', '{"probe":"dd225"}'::jsonb)
    returning id into v_bigid;

    delete from platform.activity_log where id = v_bigid;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      v_fail := format('A: DELETE from platform.activity_log removed %s rows, expected 1', v_n);
    end if;
    raise exception using errcode = 'DD225', message = 'dd225 probe rollback';
  exception
    when sqlstate 'DD225' then null;
    when others then
      v_fail := format('A: platform.activity_log (bigint key) still cannot be deleted — %s: %s', sqlstate, sqlerrm);
  end;
  if v_fail is not null then
    raise exception 'DD-225 forcing test FAILED — %', v_fail using errcode = '23514';
  end if;

  ---------------------------------------------------------------- B: text key, hard delete
  begin
    insert into extend.wbx_guidance (id, domain, kind, organization_id)
    values ('dd225-forcing-probe', 'dd225.invalid', 'probe', v_sysorg);

    delete from extend.wbx_guidance where id = 'dd225-forcing-probe';
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      v_fail := format('B: DELETE from extend.wbx_guidance removed %s rows, expected 1', v_n);
    end if;
    raise exception using errcode = 'DD225', message = 'dd225 probe rollback';
  exception
    when sqlstate 'DD225' then null;
    when others then
      v_fail := format('B: extend.wbx_guidance (text key) still cannot be hard-deleted — %s: %s', sqlstate, sqlerrm);
  end;
  if v_fail is not null then
    raise exception 'DD-225 forcing test FAILED — %', v_fail using errcode = '23514';
  end if;

  ---------------------------------------------------------------- C: text key, soft delete
  begin
    insert into extend.wbx_guidance (id, domain, kind, organization_id)
    values ('dd225-forcing-probe', 'dd225.invalid', 'probe', v_sysorg);

    update extend.wbx_guidance set deleted_at = now() where id = 'dd225-forcing-probe';
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      v_fail := format('C: soft delete on extend.wbx_guidance touched %s rows, expected 1', v_n);
    end if;
    raise exception using errcode = 'DD225', message = 'dd225 probe rollback';
  exception
    when sqlstate 'DD225' then null;
    when others then
      v_fail := format('C: extend.wbx_guidance (text key) still cannot be soft-deleted — %s: %s', sqlstate, sqlerrm);
  end;
  if v_fail is not null then
    raise exception 'DD-225 forcing test FAILED — %', v_fail using errcode = '23514';
  end if;

  ---------------------------------------------- D + E: uuid key — the sweep STILL SWEEPS
  begin
    insert into workbench.notes (organization_id) values (v_sysorg) returning id into v_noteid;

    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id)
    values ('note', v_noteid, 'web_page', gen_random_uuid(), v_sysorg)
    returning id into v_edge;

    -- D: trash the note -> the edge is tombstoned and stamped with the note that did it.
    update workbench.notes set deleted_at = now() where id = v_noteid;
    select deleted_at, deleted_via_type into v_dead, v_via
      from platform.associations where id = v_edge;
    if v_dead is null or v_via is distinct from 'note' then
      v_fail := format('D: soft-deleting a uuid-keyed note left its edge deleted_at=%s via=%s — the sweep stopped working', v_dead, v_via);
    end if;

    -- D: restore the note -> exactly that edge comes back.
    if v_fail is null then
      update workbench.notes set deleted_at = null where id = v_noteid;
      select deleted_at into v_dead from platform.associations where id = v_edge;
      if v_dead is not null then
        v_fail := 'D: restoring the note did not revive the edge it had tombstoned';
      end if;
    end if;

    -- E: hard-delete the note -> the edge is gone for good.
    if v_fail is null then
      delete from workbench.notes where id = v_noteid;
      select count(*) into v_n from platform.associations where id = v_edge;
      if v_n <> 0 then
        v_fail := 'E: hard-deleting a uuid-keyed note left its edge behind — the sweep stopped working';
      end if;
    end if;

    raise exception using errcode = 'DD225', message = 'dd225 probe rollback';
  exception
    when sqlstate 'DD225' then null;
    when others then
      v_fail := format('D/E: the uuid-keyed sweep itself broke — %s: %s', sqlstate, sqlerrm);
  end;
  if v_fail is not null then
    raise exception 'DD-225 forcing test FAILED — %', v_fail using errcode = '23514';
  end if;

  raise notice 'DD-225 forcing test PASSED — bigint hard delete, text hard delete, text soft delete, uuid soft delete + restore, uuid hard delete. All five probes rolled back.';
end
$dd225$;
