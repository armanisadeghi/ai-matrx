-- lane: DATA-DEFECTS-3
-- lock: custom,platform
-- based-on: custom.table_archive(uuid, uuid, integer, boolean) 055c5fd9bcc73808363a412cf3fb4458bb306ad152f1daa3168188dcc2eb58e5
-- based-on: custom.record_restore(uuid, uuid) 6a2a7d42170a6f49197dc9d7cfbe83a5920c77807277c05211047156bd3ab2b0
-- based-on: platform._cascade_soft_delete() 3767d27b42c9cf00d1d663ca2bce956703e89be14873ad4ee8df2a4e6b868516
-- based-on: custom._work_approvals_withdraw_on_archive() 4bbcc04ca691c2da8ead6687f60caa7abf8cb3924ac8daacdc4f898136acfec8
--
-- The inverse is `migrations/inverse/datadefects3_c_the_archive_and_restore_triggers_stand_aside_for_a_set_based_batch_down.sql`.
--
-- THE ARCHIVE AND RESTORE TRIGGERS STAND ASIDE FOR A SET-BASED BATCH (DATA-DEFECTS-3, 2026-10-10).
-- After datadefects3_a/b a record archive cost ~11 ms a row, now almost all of it row triggers on the
-- single UPDATE: zz_w4_approvals_withdraw_on_archive (~2.4 ms: a GIN probe for pending approvals about the
-- row) and _cascade_softdelete (~1.7 ms: the soft-delete registry and the trash-cascading association types).
-- Restore paid the same per row plus a per-row UPDATE (~30 ms).
-- THE CAUSE IS THE QUESTION ASKED PER ROW, not a missing index (the GIN probe is 1 ms batched): both triggers
-- answer questions that are one set-wise question for a batch. So, with the SAME behaviour:
--   · both trigger functions return at once when `custom.archive_bulk` = 'on' (transaction-local, set only by
--     custom.table_archive's record batch and custom.record_restore's record batch around their one UPDATE);
--   · the batch is only marked 'on' when custom._bulk_rows_skip_trigger_work says the cascade trigger has
--     nothing to do (no soft-delete registry edge on custom.record, no trash-cascading association touching
--     a row; restore asks it about associations in any state, as the trigger does);
--   · the one thing the approvals trigger does for an ordinary record — withdraw the pending approvals
--     about it — is done for the whole batch by custom._withdraw_approvals_for_batch right after the UPDATE
--     (same reason text, same fields, same decision door);
--   · custom.record_restore brings the event's ordinary records back with ONE update instead of one each
--     (access is still asked of every row, by the same door, first); structure rows, reconstructed events,
--     waiting rows and built-on rows keep their per-row paths.
-- The archive record budget is 4.5 s (was 3 s). No table, index, policy or grant change; no access logic changed.

CREATE OR REPLACE FUNCTION custom._bulk_rows_skip_trigger_work(p_organization_id uuid, p_ids uuid[], p_any_state boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- True when platform._cascade_soft_delete has nothing to do for these rows: no cascade edge of the
  -- soft-delete registry on custom.record, and no association of a trash-cascading type touching any of them.
  select not exists (select 1 from platform.soft_delete_edge e
                      where e.parent_schema = 'custom' and e.parent_table like 'record%')
     and not exists (select 1
                       from platform.associations a
                       join platform.association_types r
                         on r.source_type = a.source_type and r.target_type = a.target_type
                        and (r.label is null or r.label = a.label)
                      where r.cascades_trash and r.is_active
                        and a.organization_id = p_organization_id
                        and (p_any_state or a.deleted_at is null)
                        and (a.source_id = any (p_ids) or a.target_id = any (p_ids)));
$function$;

CREATE OR REPLACE FUNCTION custom._withdraw_approvals_for_batch(p_organization_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  a        record;
  v_reason text;
  v_by     uuid := custom.query_principal();
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  -- Only the set-based archive/restore may call this: they mark the transaction first (no client door sets it).
  if current_setting('custom.archive_bulk', true) is distinct from 'withdraw' then
    raise exception 'custom._withdraw_approvals_for_batch is called by the archive and restore doors only' using errcode = '42501';
  end if;
  -- What custom._work_approvals_withdraw_on_archive does for each row of a batch of ordinary records
  -- (data_class 'record'), asked once for the batch: the pending approvals about any of them.
  for a in
    select x.id, x.data
      from custom.record x
     where x.organization_id = p_organization_id
       and x.data_class = 'work_approval'
       and x.deleted_at is null
       and x.data @> '{"state": "pending"}'::jsonb
       and x.data ->> 'subject_id' = any (select i::text from unnest(p_ids) i)
  loop
    v_reason := custom.work_approval_withdrawal(p_organization_id, a.data);
    continue when v_reason is null;
    perform set_config('custom.decision_door', 'work_approval:withdraw', true);
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     v_by::text,
             'withdrawn_reason', v_reason,
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = p_organization_id and r.id = a.id;
    perform set_config('custom.decision_door', '', true);
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION custom._work_approvals_withdraw_on_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  a        record;
  v_reason text;
  v_by     uuid := custom.query_principal();
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_fields uuid[];                     -- FIELD-ARCHIVE-CASCADE: the field definitions this Table took
  v_why    text;
begin
  -- DATA-DEFECTS-3: a set-based archive/restore (custom.table_archive, custom.record_restore) has already
  -- decided, for the whole batch, that nothing here has work to do, and does the one thing this would
  -- (withdraw pending approvals) itself, set-wise, right after its statement. Transaction-local; no client sets it.
  if current_setting('custom.archive_bulk', true) = 'on' then
    return null;
  end if;
  -- A TABLE'S ARCHIVE TAKES ITS FIELD DEFINITIONS WITH IT (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
  -- custom.record_delete already archives a Table's Fields before the Table (its delete rule), but a
  -- Table is also archived by statements that never pass that door: the context follow and
  -- custom._ctx_store_type (which archived only the four scope columns), the mover, the clean-up of a
  -- test. Each left the Table's other Fields live, and a live Field under an archived Table is refused
  -- by every later write (FLD-8: "the field … says it belongs to a table this organization does not
  -- have") and cannot be brought back on its own (custom._field_shape_guard). Measured on production
  -- 2026-09-30: 42 live Fields under archived Tables in 3 organizations. This trigger fires on EVERY
  -- archive of a Table record, whatever wrote it, so the class is closed where all of them pass.
  --
  -- THE MARK IS THE MOMENT. Each Field is archived at the Table's own deleted_at — a pure retirement
  -- (only deleted_at changes, so every guard reads it as one) — and custom.record_restore brings back
  -- exactly the Fields archived at that moment when the Table comes back; a Field a person retired
  -- earlier carries its own, earlier moment and stays retired. Inside custom.record_delete the door has
  -- taken the Fields already (none is left live here); a Field archived here during that door's run is
  -- written into the same archive event, so "Bring it back" names it too.
  if new.data_class = 'table' and new.table_id = custom.table_kernel_id() then
    begin
      with gone as (
        update custom.record f
           set deleted_at = new.deleted_at
         where f.organization_id = new.organization_id
           and f.table_id = custom.field_kernel_id()
           and f.data_class <> 'kernel'
           and f.data ->> 'entity_definition_id' = new.id::text
           and f.deleted_at is null
        returning f.id)
      select coalesce(array_agg(g.id), '{}'::uuid[]) into v_fields from gone g;
    exception when check_violation or foreign_key_violation or raise_exception
                or invalid_parameter_value or not_null_violation or unique_violation then
      -- Never a reason to refuse the Table's own archive (that was always allowed): the Fields stay
      -- as they were, and the warning says so by name.
      get stacked diagnostics v_why = message_text;
      v_fields := '{}'::uuid[];
      raise warning 'The table was archived, but its columns could not be archived with it: %', v_why
        using hint = 'FIELD-ARCHIVE-CASCADE: archive the columns, then bring the table back to check they return with it.';
    end;
    if cardinality(v_fields) > 0
       and coalesce(nullif(current_setting('custom.delete_depth', true), ''), '0') <> '0' then
      perform set_config('custom.archive_took',
                         coalesce(current_setting('custom.archive_took', true), '') || array_to_string(v_fields, ',') || ',',
                         true);
    end if;
  end if;

  for a in
    select x.id, x.data
      from custom.record x
     where x.organization_id = new.organization_id
       and x.data_class = 'work_approval'
       and x.deleted_at is null
       and x.data @> jsonb_build_object('subject_id', new.id::text, 'state', 'pending')
    union
    select x.id, x.data
      from custom.record x
     where new.data_class = 'table'
       and x.organization_id = new.organization_id
       and x.data_class = 'work_approval'
       and x.deleted_at is null
       and x.data @> jsonb_build_object('subject_table_id', new.id::text, 'state', 'pending')
  loop
    v_reason := custom.work_approval_withdrawal(new.organization_id, a.data);
    continue when v_reason is null;
    perform set_config('custom.decision_door', 'work_approval:withdraw', true);
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     v_by::text,
             'withdrawn_reason', v_reason,
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = new.organization_id and r.id = a.id;
    perform set_config('custom.decision_door', '', true);
  end loop;
  return null;
end
$function$
;


CREATE OR REPLACE FUNCTION platform._cascade_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e record;
  v_rows bigint;
  v_parent_key text;
  v_child_type text;
  v_job uuid;
  v_token text;
  v_id uuid;
begin
  -- DATA-DEFECTS-3: a set-based archive/restore (custom.table_archive, custom.record_restore) has already
  -- decided, for the whole batch, that nothing here has work to do, and does the one thing this would
  -- (withdraw pending approvals) itself, set-wise, right after its statement. Transaction-local; no client sets it.
  if current_setting('custom.archive_bulk', true) = 'on' then
    return null;
  end if;
  for e in
    select child_schema, child_table, child_column, parent_column
      from platform.soft_delete_edge
     where parent_schema = tg_table_schema
       and parent_table  = tg_table_name
       and action = 'cascade'
     order by child_schema, child_table, child_column
  loop
    v_rows := 0;
    -- The key travels as text and is compared cast to the child column's real
    -- type: uuid edges keep their index, text edges (surface names, executor
    -- names) work instead of failing a uuid cast.
    v_parent_key := to_jsonb(new) ->> e.parent_column;
    continue when v_parent_key is null;
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_child_type
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.format('%I.%I', e.child_schema, e.child_table)::pg_catalog.regclass
       and a.attname = e.child_column and not a.attisdropped;

    -- TRASH: stamp every live part with the parent's EXACT deleted_at. The
    -- shared timestamp is what makes the restore below exact — it is the same
    -- trick platform._gc_entity_associations plays with deleted_via_id, without
    -- needing two new columns on every child table.
    if old.deleted_at is null and new.deleted_at is not null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = $1 where %I = $2::%s and deleted_at is null',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using new.deleted_at, v_parent_key;
      get diagnostics v_rows = row_count;

    -- RESTORE: bring back exactly what THIS removal took, and nothing else. A
    -- part someone had already removed by hand keeps its own timestamp and
    -- stays removed.
    elsif old.deleted_at is not null and new.deleted_at is null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = null where %I = $1::%s and deleted_at = $2',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using v_parent_key, old.deleted_at;
      get diagnostics v_rows = row_count;
    end if;
    if v_rows > 0 then
      -- Nothing fails silently, and nothing succeeds silently either: a removal
      -- that reached other rows says so where the DB log can be read.
      raise notice '[soft-delete-cascade] %.% -> %.%.% : % row(s) followed %.% %',
        tg_table_schema, tg_table_name, e.child_schema, e.child_table,
        e.child_column, v_rows, tg_table_schema, tg_table_name, v_parent_key;
    end if;
  end loop;

  -- DEFERRED: parts that can be too many to stamp inside one request are queued
  -- (platform.soft_delete_cascade_job) and one bounded step runs right here, so a
  -- small parent still finishes in its own request and a large one never times out.
  if (old.deleted_at is null) <> (new.deleted_at is null) then
    for e in
      select distinct parent_column
        from platform.soft_delete_edge
       where parent_schema = tg_table_schema
         and parent_table  = tg_table_name
         and action = 'cascade_deferred'
    loop
      v_parent_key := to_jsonb(new) ->> e.parent_column;
      continue when v_parent_key is null;
      v_job := platform._soft_delete_cascade_enqueue(
        tg_table_schema, tg_table_name, e.parent_column, v_parent_key,
        case when new.deleted_at is not null then 'trash' else 'restore' end,
        coalesce(new.deleted_at, old.deleted_at));
      perform platform.soft_delete_cascade_step(
        v_job, platform._soft_delete_cascade_knob('inline_budget_ms', 1500));
    end loop;
  end if;

  -- CONTAINMENT EDGES (2026-10-05, Spaces): an association type flagged cascades_trash carries the
  -- container's removal to what it contains (a page's sub-pages) and its restore back, with the same
  -- exact-timestamp rule as the column edges above. Runs before this row's _gc_assoc_softdelete
  -- (alphabetical), so on trash the edges are still live; the item's own trash then tombstones them.
  if (old.deleted_at is null) <> (new.deleted_at is null)
     and exists (select 1 from platform.association_types r where r.cascades_trash and r.is_active) then
    -- A partitioned container (custom.record) fires this per partition: name it by its partition root.
    select et.token into v_token
      from platform.entity_types et
     where et.is_active
       and ((et.schema_name = tg_table_schema and et.table_name = tg_table_name)
            or (et.schema_name, et.table_name) = (
                 select n.nspname::text, c.relname::text
                   from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                  where c.oid = pg_catalog.pg_partition_root(tg_relid)))
     limit 1;
    if v_token is not null and exists (
         select 1 from platform.association_types r
          where r.cascades_trash and r.is_active
            and ((r.container_side = 'target' and r.target_type = v_token)
              or (r.container_side = 'source' and r.source_type = v_token))) then
      v_id := (to_jsonb(new) ->> 'id')::uuid;
      for e in
        select distinct it.schema_name, it.table_name, x.item_id
          from (
            select a.source_type as item_type, a.source_id as item_id, a.deleted_at, a.deleted_via_type, a.deleted_via_id
              from platform.associations a
              join platform.association_types r
                on r.source_type = a.source_type and r.target_type = a.target_type
               and (r.label is null or r.label = a.label)
             where r.cascades_trash and r.is_active and r.container_side = 'target'
               and a.target_type = v_token and a.target_id = v_id
            union all
            select a.target_type, a.target_id, a.deleted_at, a.deleted_via_type, a.deleted_via_id
              from platform.associations a
              join platform.association_types r
                on r.source_type = a.source_type and r.target_type = a.target_type
               and (r.label is null or r.label = a.label)
             where r.cascades_trash and r.is_active and r.container_side = 'source'
               and a.source_type = v_token and a.source_id = v_id
          ) x
          join platform.entity_types it on it.token = x.item_type and it.is_active
         where new.deleted_at is null   -- restore: any edge state; the exact timestamp decides
            or x.deleted_at is null
            or (x.deleted_via_type = v_token and x.deleted_via_id = v_id)
      loop
        if new.deleted_at is not null then
          execute pg_catalog.format('update %I.%I set deleted_at = $1 where id = $2 and deleted_at is null',
                                    e.schema_name, e.table_name)
            using new.deleted_at, e.item_id;
        else
          execute pg_catalog.format('update %I.%I set deleted_at = null where id = $1 and deleted_at = $2',
                                    e.schema_name, e.table_name)
            using e.item_id, old.deleted_at;
        end if;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          raise notice '[soft-delete-cascade] %.% % -> contained %.% % followed',
            tg_table_schema, tg_table_name, v_id, e.schema_name, e.table_name, e.item_id;
        end if;
      end loop;
    end if;
  end if;

  return null;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.table_archive(p_organization_id uuid, p_table_id uuid, p_chunk integer DEFAULT 50, p_include_table boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- THE MOST ONE CALL WILL TAKE ON. Not the most a SCREEN should ask for: a client call goes
  -- through PostgREST, which cancels at ~8 s whatever this function would have been happy to
  -- do, so `p_chunk`'s DEFAULT (50) is the honest number and this cap is for a caller with a
  -- real budget.
  c_max     constant integer := 1000;
  v_chunk   integer;
  v_id      uuid;
  v_did     integer := 0;
  v_live    integer;
  v_gone    integer;
  v_name    text;
  v_table   boolean;                   -- is the Table record itself still live?
  v_whole   boolean;                   -- was this call asked to archive the Table too?
  v_done    boolean := false;
  v_table_now boolean := false;      -- did THIS call archive the Table record itself?
  v_event   uuid;                    -- STORE-TAILS-3: the one archive event of this operation
  v_prev_event text;
  -- DATA-V2-BASICS-2: an archive of this table was started and has not finished.
  v_open    boolean := false;
  v_list    uuid;                    -- DATA-V2-BASICS-2: a pick list this table's columns made
  -- THE REVERSIBLE ACTION (2026-10-02): the organization's line above which a screen asks before
  -- archiving this table (knob custom/archive_confirm_over). At or under it a screen archives at once
  -- and announces it with Undo. Answered on every call, the chunk-0 look included.
  v_confirm_over integer;
  -- T2.1 (2026-10-02): WHAT IS BUILT ON THIS TABLE GOES WITH IT, in this same archive event.
  v_built   uuid;
  v_now     timestamptz := now();
  v_on      jsonb := '[]'::jsonb;
  -- CHAIR-ACCESS d (lane 2): a child Table the store names by THIS table's id (a bookings Table's slots)
  v_child   uuid;
  v_child_res jsonb;
  -- TABLE-ACTIONS (2026-10-03): THE LAST STEP IS CHUNKED TOO. What is left of p_chunk after this call's
  -- records is the budget for what is built on the table; nothing new starts once the call has run
  -- for c_pass and done something.
  c_pass    constant interval := interval '1 second';
  v_until   timestamptz := clock_timestamp() + c_pass;
  v_left    integer;
  v_on_did  integer := 0;               -- built-on rows (and child-table passes) THIS call archived
  v_more    boolean := false;           -- something built on the table is left for the next call
  v_n       integer;
  -- DATA-DEFECTS-3: the set-based record phase.
  c_call_rows constant integer := 5000;          -- the most records one call takes on
  c_batch     constant integer := 100;           -- records per set-based step
  c_rows_pass constant interval := interval '4500 milliseconds';  -- the record phase stops starting steps after this
  v_take    integer;
  v_ids     uuid[];
  v_slow    uuid[];
  v_fast    uuid[];
  v_parents uuid[];
  v_skip    boolean;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- The rung is the one `custom.record_delete` asks of the Table record, asked ONCE here so a
  -- person who may not do this is told before the first row moves rather than after.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at is null
    into v_name, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.data_class = 'table';
  if not found then
    raise exception 'There is no such table in this organization, so there is nothing to archive.' using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_archive');

  -- LANE 12 P5 (Arman, 2026-10-02: a table the app's code relies on "cannot easily be deleted").
  -- A table whose document carries `code_depends: true` is refused HERE, before the first record
  -- moves — not at the last step, where earlier chunks would already have emptied it. Emptying it
  -- and keeping it (p_include_table = false) is not archiving it, and is unchanged. The one way
  -- through is custom.table_archive_deliberately; custom._code_depends_hold (asked by the
  -- zzz_table_columns_word row trigger) holds every other door.
  if coalesce(p_include_table, true) then
    perform custom._code_depends_refuse(p_table_id,
      (select r.data from custom.record r
        where r.organization_id = p_organization_id and r.id = p_table_id and r.data_class = 'table'),
      'archived');
  end if;

  v_confirm_over := greatest(0,
    (platform.knob_resolve('custom', 'archive_confirm_over', p_organization_id) #>> '{}')::integer);

  v_whole := coalesce(p_include_table, true);
  -- HOW MUCH THIS CALL TAKES ON. 0 means "tell me, change nothing" — which is what a screen
  -- asks before it shows a person a number and a button. Above c_max is clamped rather than
  -- refused, because a caller asking for too much wants the work done, not a lecture; the
  -- answer says what it actually did.
  v_chunk := least(greatest(coalesce(p_chunk, 50), 0), c_max);

  -- STORE-TAILS-3: ONE EVENT FOR THE WHOLE OPERATION. A screen calls this door until `done`;
  -- every call's rows are written to the SAME open event, so the restore brings back the records
  -- chunk one archived together with the columns the last call archived. Opened only when this
  -- call is going to archive something.
  if v_chunk > 0
     and (exists (select 1 from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = p_table_id
                     and r.data_class = 'record' and r.deleted_at is null)
          or (v_whole and v_table)) then
    select m.id into v_event
      from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive'
       and m.target_kind = 'table'
       and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false)
     order by m.applied_at desc
     limit 1;
    if v_event is null then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_table_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_table_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true,
                                      'whole', v_whole),
                   format('STORE-TAILS-3: %s archived as one unit — its records, fields, saved views and rules with it; restoring it brings back exactly this set.', v_name));
    end if;
    v_prev_event := coalesce(current_setting('custom.archive_event', true), '');
    perform set_config('custom.archive_event', v_event::text, true);
  end if;

  if v_chunk > 0 then
    -- SET-BASED (DATA-DEFECTS-3, 2026-10-10). The records no longer go one door-call each. Per row the old
    -- loop paid custom.record_delete's whole delete rule — custom.containment_edges(organization), a scan of
    -- the organization's every containment edge, ~80 ms a row and growing with the organization — plus a
    -- rewrite of the archive event's ever-longer `took` list, and stopped after 1 s, so the client's 20-row
    -- pass archived ~10 rows: a 20-row table took 6 passes, a 162-row table 17. Now, per sub-batch:
    --   · the access question is asked of EVERY row, by the same door as before (assert_client_may_change);
    --   · a row the delete rule could act on — something inbound points at it by a relation, it contains
    --     other records, or tables live in it — still goes through custom.record_delete, exactly as before;
    --   · every other row (the whole of an ordinary table) is archived by ONE update, and the event learns
    --     the batch with ONE write (`also` and `took` carry the same entries record_delete would have written);
    --   · the call works for its own time budget (c_rows_pass), not the client's chunk: `p_chunk` is now the
    --     least this call takes on, so the deployed client's 20-row passes finish a table in one call.
    -- The old 1 s cut-off is gone for records; the call still answers done = false when its budget is spent
    -- and the caller's loop carries on, so nothing a caller relies on changed.
    v_take := least(greatest(v_chunk, c_call_rows), c_call_rows);
    v_until := clock_timestamp() + c_rows_pass;
    select coalesce(array_agg(distinct e.parent_id), '{}') into v_parents
      from custom.containment_edges(p_organization_id) e where e.via = 'contained';
    loop
      exit when v_did >= v_take;
      exit when v_did > 0 and clock_timestamp() > v_until;
      select coalesce(array_agg(s.id order by s.created_at, s.id), '{}') into v_ids
        from (select r.id, r.created_at
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = p_table_id
                 and r.data_class = 'record'
                 and r.deleted_at is null
               order by r.created_at, r.id
               limit least(c_batch, v_take - v_did)) s;
      exit when cardinality(v_ids) = 0;

      -- Access: the same question record_delete asks, of every row.
      perform custom.assert_client_may_change(p_organization_id, x, 'custom.record_delete') from unnest(v_ids) x;

      -- The rows the delete rule could act on keep the full door.
      select coalesce(array_agg(x), '{}') into v_slow
        from unnest(v_ids) x
       where x = any (v_parents)
          or exists (select 1 from platform.associations a
                      where a.organization_id = p_organization_id and a.target_id = x
                        and a.relation_field_id is not null and a.deleted_at is null)
          or exists (select 1 from custom.home h
                      where h.organization_id = p_organization_id and h.home_record_id = x);
      foreach v_id in array v_slow loop
        if exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          perform custom.record_delete(p_organization_id, v_id);
          v_did := v_did + 1;
        end if;
      end loop;

      -- Everyone else: one update, one note in the event. The row triggers that have nothing to do for this
      -- batch (custom._bulk_rows_skip_trigger_work) are told to stand aside; the approvals they would withdraw
      -- are withdrawn set-wise right after.
      v_skip := custom._bulk_rows_skip_trigger_work(p_organization_id, v_ids, false);
      perform set_config('custom.archive_bulk', case when v_skip then 'on' else 'off' end, true);
      with gone as (
        update custom.record r
           set deleted_at = v_now
         where r.organization_id = p_organization_id
           and r.id = any (v_ids)
           and not (r.id = any (v_slow))
           and r.deleted_at is null
        returning r.id)
      select coalesce(array_agg(g.id order by array_position(v_ids, g.id)), '{}') into v_fast from gone g;
      perform set_config('custom.archive_bulk', 'off', true);
      if v_skip and cardinality(v_fast) > 0 then
        perform set_config('custom.archive_bulk', 'withdraw', true);
        perform custom._withdraw_approvals_for_batch(p_organization_id, v_fast);
        perform set_config('custom.archive_bulk', 'off', true);
      end if;
      v_n := cardinality(v_fast);
      if v_n > 0 then
        v_did := v_did + v_n;
        if v_event is not null then
          update history.migration_log m
             set inverse = m.inverse || jsonb_build_object(
                   'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                           || (select jsonb_agg(t.x::text order by t.o) from unnest(v_fast) with ordinality as t(x, o)),
                   'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                           || (select jsonb_agg(jsonb_build_array(t.x::text, v_now) order by t.o)
                                 from unnest(v_fast) with ordinality as t(x, o)))
           where m.organization_id = p_organization_id and m.id = v_event;
        end if;
      end if;
      -- A batch that moved nothing would repeat itself forever.
      exit when v_n = 0 and cardinality(v_slow) = 0;
    end loop;
    -- The tail (what is built on the table, the table itself) gets its own second after the records.
    v_until := clock_timestamp() + c_pass;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_gone
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record';

  -- THE TABLE GOES LAST, AND ONLY WHEN IT IS EMPTY — AND ONLY AFTER WHAT IS BUILT ON IT HAS GONE.
  -- … AND ONLY WHEN THIS CALL WAS ASKED TO CHANGE SOMETHING. `p_chunk = 0` means "tell me,
  -- change nothing" (ARGS-RULED-2, 2026-09-23): until this line an empty Table with the table
  -- included was archived by the very call that promised to change nothing.
  --
  -- THE LAST STEP IS CHUNKED TOO (TABLE-ACTIONS, 2026-10-03). It used to take the pick lists, every
  -- dashboard and checklist, every form, inbound address, saved view and portal, every child Table
  -- (looped to its end) AND the Table itself in ONE call; with 5 records left it hit the 8 s signed-in
  -- limit under load, and nothing bounded it but how much happened to be built on the table. Now the
  -- built-on rows go in their own passes, out of the same budget the records use: at most what is
  -- left of `p_chunk` after this call's records, and nothing new is started once the call has run
  -- for c_pass and done something. A pass that stops early answers done = false and the caller's loop
  -- calls again (the contract it already keeps). The Table itself flips only in a pass that found
  -- nothing more built on it and still has time: never after a long one. Every row, in every pass,
  -- goes into the SAME open archive event — the records and dashboards through custom.record_delete
  -- (its `took`), the rest named in its `built_on` with the moment each went — so custom.record_restore
  -- brings back exactly these and never something archived on its own earlier.
  if v_chunk > 0 and v_live = 0 and v_whole and v_table then
    v_left := greatest(coalesce(v_take, v_chunk) - v_did, 50);

    -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-24): ITS PICK LISTS GO WITH IT. Every choice column
    -- makes a list of its own ("Visit Status choices"); archiving the table left all six of them live
    -- in the Tables index. A list that only this table's columns use (live or removed, in use or kept
    -- by a column that became Text) is archived in this same event, so bringing the table back brings
    -- them back. A list another table's column also uses stays.
    for v_list in
      select distinct l.id
        from custom.record f
        cross join lateral (select nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as id
                            union select nullif(f.data -> 'config' ->> 'list_kept', '')::uuid) l
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and coalesce(f.data_class, '') <> 'kernel'
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and l.id is not null
    loop
      if exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_list
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null)
         and not exists (select 1 from custom.record o
                          where o.organization_id = p_organization_id
                            and o.table_id = custom.field_kernel_id()
                            and o.deleted_at is null
                            and o.data ->> 'entity_definition_id' is distinct from p_table_id::text
                            and (o.data -> 'config' ->> 'options_table_id' = v_list::text
                                 or o.data -> 'config' ->> 'list_kept' = v_list::text)) then
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        perform custom.record_delete(p_organization_id, v_list);
        v_left := v_left - 1;
        v_on_did := v_on_did + 1;
      end if;
    end loop;

    -- WHAT IS BUILT ON IT GOES WITH IT (handoff T2.1, 2026-10-02: "Restore (or Undo) brings it
    -- back with its forms and dashboards"). Before this a table's forms and booking pages kept
    -- taking submissions into an archived table, its dashboards and saved views stayed listed, and
    -- a portal kept opening onto it.
    --   · dashboards and checklists are store records: through the store's own door, so they join
    --     the event's `took` list like every other row;
    if not v_more then
      for v_built in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.deleted_at is null
           and ((r.data_class = 'dashboard' and r.data ->> 'subject_table_id' = p_table_id::text)
                or (r.data_class in ('checklist_template', 'checklist_run')
                    and r.data ->> 'about_table_id' = p_table_id::text))
         order by r.created_at, r.id
      loop
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        perform custom.record_delete(p_organization_id, v_built);
        v_left := v_left - 1;
        v_on_did := v_on_did + 1;
      end loop;
    end if;

    --   · forms and booking pages (custom.anon_form), inbound addresses (custom.anon_inbound),
    --     saved views (platform.saved_view) and portals opened onto it (custom.portal) live outside
    --     the record table, so the event names them in `built_on` with the moment they went. Each
    --     kind is taken at most v_left rows a pass.
    if not v_more and exists (select 1 from custom.anon_form x
                               where x.organization_id = p_organization_id and x.table_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.anon_form f set deleted_at = v_now
           where f.organization_id = p_organization_id
             and f.id in (select x.id from custom.anon_form x
                           where x.organization_id = p_organization_id and x.table_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning f.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_form', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from custom.anon_inbound x
                               where x.organization_id = p_organization_id and x.table_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.anon_inbound i set deleted_at = v_now
           where i.organization_id = p_organization_id
             and i.id in (select x.id from custom.anon_inbound x
                           where x.organization_id = p_organization_id and x.table_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning i.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_inbound', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from platform.saved_view x
                               where x.organization_id = p_organization_id and x.subject_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update platform.saved_view v set deleted_at = v_now
           where v.organization_id = p_organization_id
             and v.id in (select x.id from platform.saved_view x
                           where x.organization_id = p_organization_id and x.subject_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning v.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'saved_view', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from custom.portal x
                               where x.organization_id = p_organization_id and x.client_table_id = p_table_id and x.archived_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.portal p
             set archived_at = v_now, archived_by = custom.query_principal(),
                 archive_reason = 'Its table was archived.'
           where p.organization_id = p_organization_id
             and p.id in (select x.id from custom.portal x
                           where x.organization_id = p_organization_id and x.client_table_id = p_table_id
                             and x.archived_at is null
                           order by x.id limit v_left)
          returning p.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'portal', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;

    --   · CHILD TABLES THE STORE NAMES BY THIS TABLE'S ID (CHAIR-ACCESS d, lane 2 MAKE-HOME): a bookings
    --     Table's slots Table (slug booking_slots_<this table's id without dashes>, made by
    --     custom.booking_declare through custom.work_slots_declare) stayed live when its bookings Table
    --     was archived, still holding and expiring slots for a page that was gone. It goes with its
    --     parent: archived as a whole through this same door (its own event, every chunk, the rung asked
    --     of it by name), and named here in `built_on` (kind table) so custom.record_restore brings it
    --     back with the parent. This is the one pattern by which the store names a child Table after
    --     its parent's id; a second one joins this predicate, never a door of its own. ONE PASS OF THE
    --     CHILD PER PASS OF THE PARENT, out of the parent's budget; the child is named once it is done.
    if not v_more then
      for v_child in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.data_class = 'table'
           and r.deleted_at is null
           and r.id <> p_table_id
           and r.data ->> 'slug' = 'booking_slots_' || replace(p_table_id::text, '-', '')
         order by r.created_at, r.id
      loop
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        v_child_res := custom.table_archive(p_organization_id, v_child, v_left, true);
        v_n := coalesce((v_child_res ->> 'archived')::integer, 0)
             + coalesce((v_child_res ->> 'built_on_archived')::integer, 0)
             + case when coalesce((v_child_res ->> 'table_archived')::boolean, false) then 1 else 0 end;
        v_left := v_left - greatest(v_n, 1);
        v_on_did := v_on_did + greatest(v_n, 1);
        if coalesce((v_child_res ->> 'done')::boolean, true) then
          v_on := v_on || jsonb_build_object('kind', 'table', 'id', v_child, 'at', v_now);
        else
          v_more := true;
          exit;
        end if;
      end loop;
    end if;

    -- WHAT THIS PASS TOOK OUTSIDE THE RECORD TABLE IS NAMED IN THE EVENT NOW, pass by pass, each
    -- entry with the moment it went (custom.record_restore matches on that moment).
    if jsonb_array_length(v_on) > 0 and v_event is not null then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object('built_on', coalesce(m.inverse -> 'built_on', '[]'::jsonb) || v_on)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;

    -- THE TABLE ITSELF: by now its own cascade is the Fields, the saved views kept as records and the
    -- Rules it carries — tens of rows. It flips in a pass that found nothing more built on it and has
    -- time left (or has done nothing else).
    if not v_more
       and (v_did + v_on_did = 0 or clock_timestamp() <= v_until) then
      perform custom.record_delete(p_organization_id, p_table_id);
      v_table := false;
      v_table_now := true;
    end if;
  end if;

  v_done := v_live = 0 and (not v_whole or not v_table);

  -- STORE-TAILS-3: THE EVENT CLOSES WHEN THE OPERATION IS DONE — the table archived, or (for
  -- "empty it but keep it") every record archived. From then on a restore of the table brings
  -- back exactly what it names, and a later archive is a new event.
  if v_event is not null then
    perform set_config('custom.archive_event', v_prev_event, true);
    if v_done then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'open', false,
               'archived_at', (select to_jsonb(r.deleted_at) from custom.record r
                                where r.organization_id = p_organization_id and r.id = p_table_id))
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;

  -- UNDER WAY (DATA-V2-BASICS-2, 2026-09-29). BREAKER-1 B-F13: a reload in the middle of a run showed a
  -- fresh "Archive this table" button, because nothing the page could ask said a run was open. The open
  -- archive event IS that fact; every answer — the chunk-0 look included — now says it.
  v_open := not v_done and exists (
    select 1 from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive' and m.target_kind = 'table' and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false));

  return jsonb_build_object(
    'table_id',   p_table_id,
    'in_progress', v_open,               -- an earlier run of this archive was started and not finished
    'table_name', v_name,
    'archived',   v_did,                 -- what THIS call archived
    'remaining',  v_live,                -- records still live in this table
    'total',      v_live + v_gone,       -- records this table has ever held
    'archived_total', v_gone,            -- records of this table already archived, all runs
    'table_archived', not v_table,
    'done',       v_done,
    'chunk',      v_chunk,
    'archive_event', v_event,            -- STORE-TAILS-3: what "Bring it back" will restore
    'built_on_archived', v_on_did,      -- TABLE-ACTIONS: what is built on the table THIS call archived
    'confirm_over', v_confirm_over,      -- THE REVERSIBLE ACTION: ask first above this many live records
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      -- SAY WHAT THIS CALL DID (ARGS-RULED-2). An empty Table archived by THIS call used to be
      -- told "is already archived. Nothing was changed." — the opposite of what had happened.
      when v_chunk = 0 and v_whole and v_table then
        format('%s has no records left, so archiving it now would archive the table itself. Nothing has been changed yet.', v_name)
      when v_table_now and v_did = 0 then
        format('%s had no records left to archive, so the table itself is now archived — it can be brought back.', v_name)
      when v_done and v_did = 0 and not v_whole then
        format('Nothing is left to archive in %s. Nothing was changed.', v_name)
      when v_done and v_did = 0 then
        format('%s is already archived. Nothing was changed.', v_name)
      -- WHICH OF THE TWO ACTUALLY HAPPENED. Archiving everything IN a table is not archiving
      -- the table, and a screen that says it is has lied to the person who kept it on purpose.
      when v_done and not v_whole then
        format('%s record%s archived. %s is now empty and still here, and everything in it can be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      when v_done then
        format('%s record%s archived. %s is archived, and everything in it can still be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      -- TABLE-ACTIONS: the records are gone and what is built on the table is going, pass by pass.
      when not v_done and v_live = 0 and v_whole then
        format('%s record%s and %s thing%s built on %s archived. Call again to carry on — the table itself goes last.',
               v_did, case when v_did = 1 then '' else 's' end,
               v_on_did, case when v_on_did = 1 then '' else 's' end, v_name)
      else
        format('%s record%s archived, %s to go in %s. Call again to carry on — it picks up where this left off.',
               v_did, case when v_did = 1 then '' else 's' end, v_live, v_name)
    end);
end;
$function$
;


CREATE OR REPLACE FUNCTION custom.record_restore(p_organization_id uuid, p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rows  bigint;
  e       history.migration_log;       -- STORE-TAILS-3: the archive event this restore undoes
  m       record;
  v_back  integer := 0;
  v_left  integer := 0;
  v_wait  uuid[] := '{}';              -- structure rows whose guard wants another row back first
  v_again uuid[];
  v_round integer := 0;
  v_why   text;
  v_whose text;
  v_root_at timestamptz;               -- the moment the root was archived
  v_back_ids uuid[] := '{}';           -- every row this restore brought back (root included)
  v_back_at  timestamptz[] := '{}';    -- ... and the moment each had been archived
  a        record;
  v_joined integer := 0;
  v_kept   integer := 0;
  v_recon  boolean := false;           -- an event reconstructed for an archive made before events existed
  v_refused integer := 0;
  v_refused_why text;
  v_is_table boolean := false;         -- FIELD-ARCHIVE-CASCADE: is the row brought back a Table?
  v_fback    integer := 0;             -- ... Fields brought back with it (archived at its moment)
  v_fwait    uuid[] := '{}';           -- ... Fields whose guard wants the rest of the Table back first
  v_fleft    integer := 0;             -- ... Fields still refused after that
  v_fwhy     text;
  v_on       record;                   -- T2.1: one row built on a Table that its archive took
  v_on_back  integer := 0;
  v_on_left  integer := 0;
  v_on_why   text;
  v_bulk_ids uuid[] := '{}';           -- DATA-DEFECTS-3: records of the event brought back by one update
  v_bulk_at  timestamptz[] := '{}';
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- STORE-TAILS-3: WHAT THIS ARCHIVE TOOK WITH IT, read before the row moves (the event names
  -- the row by the `deleted_at` it carries now).
  e := custom.archive_event_of(p_organization_id, p_record_id);
  if e.id is not null
     and coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    -- The History versions this restore writes read "undo of archive" and carry the event's id.
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   e.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive',           true);
  end if;

  select r.deleted_at into v_root_at
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no such record in this organization.' using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  v_back_ids := array[p_record_id];
  v_back_at  := array[v_root_at];

  -- A TABLE COMES BACK WITH THE FIELDS ITS ARCHIVE TOOK (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
  -- Every archive of a Table archives its live Fields at the Table's own moment (the trigger
  -- zz_w4_approvals_withdraw_on_archive, custom._work_approvals_withdraw_on_archive), whatever wrote it
  -- — so a Table archived outside custom.record_delete has no event naming them. Exactly the Fields
  -- archived at that moment come back, before any record (a record's values are judged against its
  -- Fields); a Field a person retired earlier carries an earlier moment and is left. A Field the event
  -- below names is the event's. One whose guard refuses it now is asked again after the event's
  -- structure is back.
  select r.table_id = custom.table_kernel_id() and r.data_class = 'table' into v_is_table
    from custom.record r where r.organization_id = p_organization_id and r.id = p_record_id;
  if coalesce(v_is_table, false) and v_root_at is not null then
    for m in
      select f.id
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.data ->> 'entity_definition_id' = p_record_id::text
         and f.deleted_at = v_root_at
         and not exists (select 1 from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) t
                          where t ->> 0 = f.id::text)
       order by f.created_at, f.id
    loop
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        v_fback := v_fback + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        v_fwait := v_fwait || m.id;
      end;
    end loop;
  end if;
  v_recon := coalesce((e.inverse ->> 'reconstructed')::boolean, false);

  if e.id is not null then
  -- EVERYTHING THE ARCHIVE TOOK, EXACTLY. Structure first — tables, then fields, then rules,
  -- then saved views — so every guard on a returning record has its table and its columns in
  -- front of it; then the records in the order they went (a container before what it
  -- contained). A row that is no longer archived at the moment this event archived it was
  -- brought back, or archived again, on its own since: it is not this event's, and it is left.
  --
  -- A column can depend on another column of the same set (a rollup reads through a relation
  -- column; a formula reads another formula), and the order the archive took them in says
  -- nothing about that. So a structure row whose own guard refuses it NOW is asked again after
  -- the rest of the structure is back, round by round, until a round brings nothing more back;
  -- one still refused then is refused by name, and nothing of this restore is kept.
  for m in
    select t.id, t.at, r.deleted_at as now_at,
           case when r.table_id = custom.table_kernel_id() then 1
                when r.table_id = custom.field_kernel_id() then 2
                when r.table_id = custom.rule_kernel_id() then 3
                when r.data ? 'layout' then 4
                else 5 end as pass,
           t.o
      from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
              from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) with ordinality as j(x, o)) t
      join custom.record r
        on r.organization_id = p_organization_id and r.id = t.id
     where t.id <> p_record_id
     order by pass, t.o
  loop
    -- The structure is not all back yet: the records wait for it (below).
    exit when m.pass = 5 and cardinality(v_wait) > 0;
    if m.now_at is null or m.now_at <> m.at then
      v_left := v_left + 1;
      continue;
    end if;
    perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
    if m.pass < 5 then
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        v_wait := v_wait || m.id;
      end;
    else
      -- The structure is all back by now, so a record that is refused is refused for itself.
      -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
      -- records by inference, so one of them refused on its own (a unique value that another
      -- record now holds) is left archived and counted, not a reason to bring back nothing.
      if v_recon then
        begin
          update custom.record
             set deleted_at = null
           where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
          v_back := v_back + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
        exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                    or invalid_parameter_value or not_null_violation then
          get stacked diagnostics v_refused_why = message_text;
          v_refused := v_refused + 1;
        end;
      else
        -- DATA-DEFECTS-3: collected, brought back by ONE update below (access was asked of this row above).
        v_bulk_ids := v_bulk_ids || m.id; v_bulk_at := v_bulk_at || m.at;
      end if;
    end if;
  end loop;

  if cardinality(v_bulk_ids) > 0 then
    perform set_config('custom.archive_bulk',
      case when custom._bulk_rows_skip_trigger_work(p_organization_id, v_bulk_ids, true) then 'on' else 'off' end, true);
    update custom.record r
       set deleted_at = null
      from unnest(v_bulk_ids, v_bulk_at) as b(id, at)
     where r.organization_id = p_organization_id and r.id = b.id and r.deleted_at = b.at;
    if current_setting('custom.archive_bulk', true) = 'on' then
      perform set_config('custom.archive_bulk', 'withdraw', true);
      perform custom._withdraw_approvals_for_batch(p_organization_id, v_bulk_ids);
    end if;
    perform set_config('custom.archive_bulk', 'off', true);
    v_back := v_back + cardinality(v_bulk_ids);
    v_back_ids := v_back_ids || v_bulk_ids; v_back_at := v_back_at || v_bulk_at;
  end if;

  while cardinality(v_wait) > 0 loop
    v_round := v_round + 1;
    v_again := '{}';
    v_why := null;
    for m in select t.id, t.at
               from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                       from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
              where t.id = any (v_wait)
              order by t.o loop
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        get stacked diagnostics v_why = message_text;
        v_again := v_again || m.id;
      end;
    end loop;
    if cardinality(v_again) = cardinality(v_wait) then
      select coalesce(nullif(r.data ->> 'label', ''), nullif(r.data ->> 'name', ''), r.data ->> 'key', r.id::text)
        into v_whose
        from custom.record r where r.organization_id = p_organization_id and r.id = v_wait[1];
      raise exception 'This could not be brought back as it was archived: "%" is refused on its own (%), so nothing was brought back.', v_whose, v_why
        using errcode = '23514',
              hint = 'STORE-TAILS-3: a restore brings back the whole of what its archive took, or none of it. Change what the refusal names (it changed after the archive), then bring it back again.';
    end if;
    v_wait := v_again;
    if cardinality(v_wait) = 0 then
      -- The structure is complete: now the records, in the order they went.
      for m in
        select t.id, t.at, r.deleted_at as now_at
          from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                  from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
          join custom.record r on r.organization_id = p_organization_id and r.id = t.id
         where t.id <> p_record_id
           and r.table_id is distinct from custom.table_kernel_id()
           and r.table_id is distinct from custom.field_kernel_id()
           and r.table_id is distinct from custom.rule_kernel_id()
           and not (r.data ? 'layout')
         order by t.o
      loop
        if m.now_at is not null and m.now_at = m.at then
          perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
          -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
          -- records by inference, so one of them refused on its own (a unique value that another
          -- record now holds) is left archived and counted, not a reason to bring back nothing.
          if v_recon then
            begin
              update custom.record
                 set deleted_at = null
               where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
              v_back := v_back + 1;
              v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
            exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                        or invalid_parameter_value or not_null_violation then
              get stacked diagnostics v_refused_why = message_text;
              v_refused := v_refused + 1;
            end;
          else
            update custom.record
               set deleted_at = null
             where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
            v_back := v_back + 1;
            v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
          end if;
        else
          v_left := v_left + 1;
        end if;
      end loop;
    end if;
  end loop;

  end if;

  -- FIELD-ARCHIVE-CASCADE: the Fields that waited for the rest of the Table, asked once more. One still
  -- refused stays archived and is named below — never a reason to keep the Table itself archived.
  if cardinality(v_fwait) > 0 then
    for m in select x.id from unnest(v_fwait) with ordinality as x(id, o) order by x.o loop
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        v_fback := v_fback + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        get stacked diagnostics v_fwhy = message_text;
        v_fleft := v_fleft + 1;
      end;
    end loop;
  end if;
  if v_fback > 0 or v_fleft > 0 then
    raise notice '%', format('Columns brought back with the table: %s%s.', v_fback,
      case when v_fleft > 0 then format('; %s stayed archived (the last said: %s)', v_fleft, v_fwhy) else '' end);
  end if;

  -- THE POINTERS THE ARCHIVE TOOK OUT OF OTHER RECORDS GO BACK IN. A relation set to "clear it"
  -- (`set_null`, `platform.relation_on_delete`) took this row's id out of every live record that
  -- pointed at it and tombstoned that edge in the same transaction — the tombstone (`deleted_at`
  -- = the moment this row was archived, no `deleted_via`, a relation field) is the record of it.
  -- For every row this restore brought back, each such pointer is written back into the record
  -- that held it, if that record is still here, the relation column still exists, and the
  -- pointer's place is still free (a single-value relation that now points somewhere else was
  -- changed on purpose since, and is left). The relation's own triggers put the edge back.
  for a in
    select x.id as edge_id, x.source_id, x.role, x.target_id
      from unnest(v_back_ids, v_back_at) as b(id, at)
      join platform.associations x
        on x.organization_id = p_organization_id
       and x.target_type = 'record' and x.target_id = b.id
       and x.source_type = 'record'
       and x.relation_field_id is not null
       and x.deleted_at = b.at
       and x.deleted_via_type is null
     order by x.created_at
  loop
    if exists (select 1 from custom.record s
                where s.organization_id = p_organization_id and s.id = a.source_id and s.deleted_at is null)
       and platform.relation_edge_has_a_live_field(p_organization_id,
             (select x.relation_field_id from platform.associations x where x.id = a.edge_id)) then
      update custom.record s
         set data = case
               when jsonb_typeof(s.data -> a.role) = 'array' then
                 case when s.data -> a.role @> to_jsonb(array[a.target_id::text]) then s.data
                      else jsonb_set(s.data, array[a.role], (s.data -> a.role) || to_jsonb(a.target_id::text)) end
               when jsonb_typeof(s.data -> a.role) = 'string' then s.data
               else jsonb_set(s.data, array[a.role],
                              case when coalesce((select (f.data ->> 'multi')::boolean
                                                    from custom.record f
                                                   where f.organization_id = p_organization_id
                                                     and f.id = (select x.relation_field_id from platform.associations x where x.id = a.edge_id)), false)
                                   then jsonb_build_array(a.target_id::text)
                                   else to_jsonb(a.target_id::text) end)
             end
       where s.organization_id = p_organization_id and s.id = a.source_id
         and jsonb_typeof(s.data -> a.role) is distinct from 'string';
      if found then v_joined := v_joined + 1; else v_kept := v_kept + 1; end if;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  if e.id is null then
    if v_joined > 0 or v_kept > 0 then
      raise notice 'Linked back: % record(s) that pointed at it%.', v_joined,
        case when v_kept > 0 then format('; %s had changed since and were left as they are', v_kept) else '' end;
    end if;
    return;
  end if;

  -- T2.1 (2026-10-02): WHAT WAS BUILT ON THE TABLE COMES BACK WITH IT — the forms, booking pages,
  -- inbound addresses, saved views and portals custom.table_archive named in this event's
  -- `built_on`, each only if it still carries the moment this archive put it away (one archived
  -- or brought back on its own since is left as it is). A row whose name a live one took meanwhile
  -- stays archived and is counted, never a reason to keep the table archived.
  for v_on in
    select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
      from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x
  loop
    begin
      if v_on.kind = 'anon_form' then
        update custom.anon_form set deleted_at = null
         where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
      elsif v_on.kind = 'anon_inbound' then
        update custom.anon_inbound set deleted_at = null
         where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
      elsif v_on.kind = 'saved_view' then
        update platform.saved_view set deleted_at = null
         where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
      elsif v_on.kind = 'portal' then
        update custom.portal set archived_at = null, archived_by = null, archive_reason = null
         where organization_id = p_organization_id and id = v_on.id and archived_at = v_on.at;
      elsif v_on.kind = 'table' then
        -- CHAIR-ACCESS d (lane 2): a child Table its parent's archive took (a bookings Table's slots,
        -- custom.table_archive `built_on` kind table) comes back through its OWN restore, with
        -- everything its own archive event took; one already brought back on its own is left as it is.
        if exists (select 1 from custom.record c
                    where c.organization_id = p_organization_id and c.id = v_on.id
                      and c.data_class = 'table' and c.deleted_at is not null) then
          perform custom.record_restore(p_organization_id, v_on.id);
          v_on_back := v_on_back + 1;
        else
          v_on_left := v_on_left + 1;
        end if;
        continue;
      end if;
      if found then v_on_back := v_on_back + 1; else v_on_left := v_on_left + 1; end if;
    exception when unique_violation or check_violation then
      get stacked diagnostics v_on_why = message_text;
      v_on_left := v_on_left + 1;
    end;
  end loop;
  if v_on_back > 0 or v_on_left > 0 then
    raise notice '%', format('Built on it and brought back: %s%s.', v_on_back,
      case when v_on_left > 0 then format('; %s stayed as they were (the last said: %s)', v_on_left, coalesce(v_on_why, 'changed since')) else '' end);
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = e.id;

  raise notice '%', format('Brought back with it: %s row(s) this archive took%s%s; %s record(s) that pointed at them linked back%s.',
    v_back,
    case when v_left > 0
         then format('; %s it also took had already come back or been archived again on their own since, and were left as they are', v_left)
         else '' end,
    case when v_refused > 0
         then format('; %s record(s) this reconstructed archive named were refused on their own and left archived (the last said: %s)', v_refused, v_refused_why)
         else '' end,
    v_joined,
    case when v_kept > 0 then format(' (%s had changed since and were left)', v_kept) else '' end);
end
$function$
;
