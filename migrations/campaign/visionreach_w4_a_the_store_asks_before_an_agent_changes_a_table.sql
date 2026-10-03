-- chair-step: CREATES two helpers, custom.declared_conversation() and custom._agent_change_gate(uuid, uuid, text, uuid) (SECURITY INVOKER, no grant: the store's event trigger leaves a new custom function to postgres only, and only the SECURITY DEFINER doors below call them), and replaces seven door bodies (custom.record_write, record_write_many, record_change_many, record_update, record_delete, field_declare, table_declare — same signatures, security and grants) with ONE added line each that calls the gate after the door's own access checks. Effect: a write DECLARED by an agent (platform.declared_actor_tier() = 'agent') that calls one of these doors directly is refused with 42501 and the organization's own two sentences whenever custom.agent_change_approval says a person must be asked. No table, trigger, policy, grant or row is touched. custom.field_update rides its own file (visionreach_w4_a2_…) because lane 10's p4 replaces that body too. ORDER: the aidream commit that declares app.conversation_id (matrx_orm declaring_conversation + matrx_records.acting_as) must be LIVE on the server first, or an agent's change to a table it made in this conversation is refused under `ask`.
-- lane: VISION-REACH
-- based-on: custom.record_write(uuid, uuid, jsonb) dda4e143b1ee6cfb52a8579a5be7ac6e27055ae230144e3f7d98bcc85ca1525a
-- based-on: custom.record_write_many(uuid, uuid, jsonb[], uuid[]) d9f8b51784053c0b03b73e5c21044e8f6fb97062da13083049cc1a71e8abc86c
-- based-on: custom.record_change_many(uuid, uuid, jsonb) 22729091e2594ddbb9b2a58c5b549f634480abd3d03e4acda87f55a59980dcfc
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) f7c0d7515fe21200c0291177808a3b1e526b3ebcaea195862b5ca1b7f9e03a93
-- based-on: custom.record_delete(uuid, uuid) 93794b4c52f131b8c3705b1060b33306898b12e51842bc7454eb37311cd3df1e
-- based-on: custom.field_declare(uuid, uuid, jsonb) 40ac965c6a9da02693a0e60e499a6ebf6af267f6c22ab21a08c94429fc071c33
-- based-on: custom.table_declare(uuid, jsonb) d92c9e0250f1776db8efefb0f40d4959db691ace0ee849a8cd0e39d0bc5e2a10
--
-- LANE 5 VISION-REACH, WAVE 4 (a) — THE STORE ASKS BEFORE AN AGENT CHANGES A TABLE.
-- Approved in principle by the chair 2026-10-02 10:40 PT ("(a) is the right place to enforce the knob").
--
-- MEASURED BEFORE THIS FILE (clone, scripts/campaign-tests/visionreach_w4_propose_before_apply.sql): with
-- Cedar Ridge Physical Therapy's "Agent changes to this organization's data" on `ask`, an agent-declared
-- connection called custom.field_declare on the existing Visits table and the column was ADDED. The
-- setting lived only in the agent client (matrx_records RecordStore.change_approval): any caller that did
-- not ask — the Table API's agent writes, a background writer, a browser agent client — changed somebody's
-- existing table with no person asked.
-- THE RULE NOW: the door asks the same question the client asks (custom.agent_change_approval), so the
-- two cannot disagree; the client still asks first and files a proposal, and the door is the wall.
-- Inverse: migrations/inverse/visionreach_w4_a_the_store_asks_before_an_agent_changes_a_table_down.sql
-- 1. WHICH CONVERSATION THIS WRITE BELONGS TO. The server declares it (`app.conversation_id`, landed at
--    every BEGIN by matrx_orm's provider while matrx_records.acting_as holds a principal that has one); an
--    agent client in a browser may name it in `x-matrx-conversation-id` on the client channel only. It is
--    an ADDRESS, never authority: it can only match a Table the store itself stamped as made in that
--    conversation (custom.agent_table_origin). Anything that is not a uuid is no conversation, said aloud.
CREATE OR REPLACE FUNCTION custom.declared_conversation()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_raw text := nullif(btrim(coalesce(current_setting('app.conversation_id', true), '')), '');
begin
  if v_raw is null and platform.is_client_channel() then
    begin
      v_raw := nullif(btrim(coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-matrx-conversation-id', '')), '');
    exception when others then
      v_raw := null;
    end;
  end if;
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::uuid;
  exception when others then
    raise warning '[agent-changes] % is not a conversation id, so this write names no conversation; a table the agent made in it will ask a person.', v_raw;
    return null;
  end;
end
$function$;

-- 2. THE ONE CHECK. Every door below calls this, right after its own access checks and before it reads or
--    writes anything. It asks exactly the question the agent client asks before it writes —
--    custom.agent_change_approval(org, conversation, table) — so the door and the client can never
--    disagree; the client asks first and files a proposal, and this is the wall for every caller that
--    did not ask.
--    It acts on exactly one caller: a write DECLARED by an agent (platform.declared_actor_tier() = 'agent').
--    A person's own write, the platform's own work, and a person approving an agent's change
--    (custom.work_approval_decide runs as the deciding person) pass untouched.
--    It judges the door the caller CALLED, not the doors that door calls in turn. A compound door that
--    reaches record_write / field_declare for its own bookkeeping (work_approval_request trying the
--    change in a savepoint before it files it, the import, the graph writer, the decision itself) is
--    judged at its own top, or not at all — never half-way down, where a refusal would break the very
--    proposal path the knob sends an agent to.
--    The store's kernels (its own definition tables) are never asked about, and two kinds of Table are the
--    agent's own by construction and are never asked about either: one made in THIS
--    transaction (an agent that declares a table and its columns in one breath, conversation or not),
--    and one the app keeps for a purpose (`kept_for` set: context, choices, agent outputs, bookings,
--    checklists, workflows, kits, the app's own) — the app's machinery, not somebody's business table.
CREATE OR REPLACE FUNCTION custom._agent_change_gate(p_organization_id uuid, p_table_id uuid, p_door text, p_record_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table  uuid := p_table_id;
  v_row    record;
  v_stack  text;
  v_frames integer;
  v_said   jsonb;
begin
  if platform.declared_actor_tier() is distinct from 'agent' then
    return;
  end if;

  -- The door the caller called is frame 2 (this check is frame 1). A third frame that is a function of the
  -- database's own schemas means the door was reached from inside another door, which is judged at its own
  -- top. A caller's anonymous block or session-temporary helper is not a door and does not count.
  get diagnostics v_stack = pg_context;
  select count(*) into v_frames
    from regexp_split_to_table(coalesce(v_stack, ''), E'\n') l
   where l ~ '^(PL/pgSQL|SQL) function [a-z_][a-z0-9_]*\.'
     and l !~ '^(PL/pgSQL|SQL) function pg_temp';
  if v_frames > 2 then
    return;
  end if;

  -- WHAT IS BEING CHANGED, AS A TABLE. A record is changed on its table; a column on the table it belongs
  -- to; a table's own definition on itself.
  if p_record_id is not null then
    select r.data_class, r.table_id, r.data ->> 'entity_definition_id' as field_table
      into v_row
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
    if not found then
      return;   -- the door says "no such record" in its own words
    end if;
    v_table := case v_row.data_class
                 when 'record' then v_row.table_id
                 when 'field'  then nullif(v_row.field_table, '')::uuid
                 when 'table'  then p_record_id
                 else null end;
    if v_table is null then
      return;   -- an approval, a rule, a view …: not a change to a business table
    end if;
  end if;

  if v_table is not null then
    -- The store's own definition tables (Table, Field, Organization/Home, Person, File, Rule …) are
    -- kernels, kept by the platform in its own organization: an agent making a Home for the table it
    -- was allowed to make is building, not changing somebody's data. Their shape checks guard them.
    if exists (select 1 from custom.record k where k.id = v_table and k.data_class = 'kernel') then
      return;
    end if;
    if exists (select 1 from custom.record t
                where t.organization_id = p_organization_id and t.id = v_table
                  and (t.created_at = now() or nullif(t.data ->> 'kept_for', '') is not null)) then
      return;
    end if;
  end if;

  v_said := custom.agent_change_approval(p_organization_id, custom.declared_conversation(), v_table);
  if coalesce((v_said ->> 'approval_required')::boolean, true) then
    raise exception '%', coalesce(nullif(v_said ->> 'why', ''), 'This organization asks a person before an agent makes this change.')
      using errcode = '42501',
            hint = coalesce(v_said ->> 'how_to_change', '') ||
                   ' Nothing was changed. An agent asks for this change instead (it waits in the approval queue for a person).',
            detail = jsonb_build_object('door', p_door, 'reason', v_said ->> 'reason',
                                        'setting', v_said ->> 'setting', 'table_id', v_table)::text;
  end if;
end
$function$;


CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE ENVELOPE KEY COMES OFF FIRST. Before the door predicates, before the undeclared-key
  -- guard, before storage — `custom.record.data` must never hold it.
  p_data := custom._take_op_id(p_data, 'custom.record_write');

  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  -- KINDS-GLUE N-C6 (CHAIR-DOORS-2): ADDING a record is the editor rung on the Table, except on a
  -- Table the app keeps for agent outputs, where every member who may see it may add (viewer);
  -- changing a record already there is still decided on that record, so a member edits only her own.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          custom.table_add_rung(p_organization_id, p_table_id), 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.record_write');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
  -- CHAIR-DOORS-2 j: and it is shown to whoever its Table's "Shown to by default" names (null = the
  -- organization's default, read at list time, as before).
  insert into custom.record (organization_id, table_id, data, shown_to)
  values (p_organization_id, p_table_id,
          custom._record_defaults_filled(p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb)),
          (custom._table_row_defaults(p_organization_id, p_table_id) ->> 'shown_to')::platform.shown_to)
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_write_many(p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids   uuid[];
  v_n     integer := coalesce(cardinality(p_rows), 0);
  v_clean jsonb[];
  v_seen  text := null;
  v_this  text;
  ord     integer;
  v_shown platform.shown_to;
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  -- KINDS-GLUE N-C6 (CHAIR-DOORS-2): ADDING a record is the editor rung on the Table, except on a
  -- Table the app keeps for agent outputs, where every member who may see it may add (viewer);
  -- changing a record already there is still decided on that record, so a member edits only her own.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          custom.table_add_rung(p_organization_id, p_table_id), 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.record_write_many');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    perform set_config('custom.op_id', '', true);
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  -- ONE STATEMENT IS ONE OPERATION. Every row's `_op_id` comes off, and they must AGREE: a
  -- batch is one paste, one import, one click. Two different ids in one statement would make
  -- one notice that could only name one of them, so the other writer would be told to drop an
  -- echo that was never its own — which is the one way an echo filter loses a real change.
  v_clean := array[]::jsonb[];
  for ord in 1..v_n loop
    v_this := case when p_rows[ord] is not null and jsonb_typeof(p_rows[ord]) = 'object'
                   then p_rows[ord] ->> '_op_id' else null end;
    if v_this is not null then
      if v_seen is not null and v_seen <> v_this then
        raise exception 'custom.record_write_many: this batch carries two different _op_id values (% and %), and one statement announces itself once.', left(v_seen, 64), left(v_this, 64)
          using errcode = '22023',
                hint = 'Nothing was written. A batch is ONE client operation — one paste, one import, one click — so every row either carries the same _op_id or carries none. Split the rows into one call per operation, or leave the key out.';
      end if;
      v_seen := v_this;
    end if;
    v_clean := v_clean || case
                 when p_rows[ord] is null or jsonb_typeof(p_rows[ord]) <> 'object' then p_rows[ord]
                 -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
                 else custom._record_defaults_filled(p_organization_id, p_table_id, p_rows[ord] - '_op_id') end;
  end loop;

  -- Validated and remembered ONCE for the batch, through the same one place the single-row
  -- door uses, so a malformed id is refused with the same sentence.
  perform custom._take_op_id(
    case when v_seen is null then '{}'::jsonb else jsonb_build_object('_op_id', v_seen) end,
    'custom.record_write_many');

  if p_ids is null then
    select array_agg(gen_random_uuid() order by s) into v_ids
      from generate_subscripts(v_clean, 1) s;
  else
    v_ids := p_ids;
  end if;

  -- CHAIR-DOORS-2 j: every row of the batch is shown to whoever its Table's "Shown to by default" names.
  v_shown := (custom._table_row_defaults(p_organization_id, p_table_id) ->> 'shown_to')::platform.shown_to;
  insert into custom.record (organization_id, table_id, id, data, shown_to)
  select p_organization_id, p_table_id, v_ids[s], coalesce(v_clean[s], '{}'::jsonb), v_shown
    from generate_subscripts(v_clean, 1) s
   order by s;

  return v_ids;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_change_many(p_organization_id uuid, p_table_id uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n         integer;
  v_ceiling   integer;
  v_i         integer;
  v_change    jsonb;
  v_op        text;
  v_key       text;
  v_id        uuid;
  v_out       jsonb[];
  v_inserts   jsonb[] := array[]::jsonb[];
  v_insert_at integer[] := array[]::integer[];
  v_new_ids   uuid[];
  v_patches   jsonb := '{}'::jsonb;   -- record id -> the merged patch (one row is updated once)
  v_expected  jsonb := '{}'::jsonb;   -- record id -> the version the caller wrote against
  v_first_at  jsonb := '{}'::jsonb;   -- record id -> the first change (0-based) that named it
  v_versions  jsonb := '{}'::jsonb;   -- record id -> the version the update produced
  v_patch     jsonb;
  v_current   integer;
  v_at        timestamptz;
  v_state     text;
  v_msg       text;
  v_detail    text;
  v_hint      text;
begin
  -- The switch, then the editor rung on the Table — the same two questions custom.record_write_many
  -- asks, once for the batch. Every record is then asked its own rung below, as record_update asks.
  perform custom.assert_store_door(p_organization_id, 'custom.record_change_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_change_many',
                                          'editor'::public.permission_level, 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.record_change_many');

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'custom.record_change_many: the changes must be a list, and they are a %', coalesce(jsonb_typeof(p_changes), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"op":"update","record_id":…,"patch":{…}}, {"op":"archive","record_id":…}, {"op":"insert","data":{…}}]. Nothing was written.';
  end if;
  v_n := jsonb_array_length(p_changes);
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  v_ceiling := custom.page_ceiling(p_organization_id);
  if v_n > v_ceiling then
    raise exception 'This batch holds % changes, and the store takes at most % in one transaction, so nothing was written rather than part of it.', v_n, v_ceiling
      using errcode = '54000',
            hint = 'Split the changes into batches of ' || v_ceiling || ' or fewer. An organization that genuinely writes bigger batches raises the knob custom/page_size_ceiling.';
  end if;
  v_out := array_fill(null::jsonb, array[v_n]);

  -- ── read the batch: every change is checked for shape before anything is written ──
  for v_i in 0 .. v_n - 1 loop
    v_change := p_changes -> v_i;
    v_op := coalesce(v_change ->> 'op', 'update');
    begin
      if v_op = 'insert' then
        v_inserts := v_inserts || coalesce(v_change -> 'data', '{}'::jsonb);
        v_insert_at := v_insert_at || v_i;
        continue;
      end if;
      if v_op not in ('update', 'archive') then
        raise exception 'custom.record_change_many: "%" is not a change this door makes.', v_op
          using errcode = '22023', hint = 'Each change is an insert, an update or an archive.';
      end if;
      v_id := (v_change ->> 'record_id')::uuid;
      if v_id is null or not exists (
           select 1 from custom.record r
            where r.organization_id = p_organization_id and r.id = v_id
              and r.table_id = p_table_id and r.deleted_at is null) then
        raise exception 'There is no record % in this table any more.', coalesce(v_change ->> 'record_id', '(no id)')
          using errcode = '02000',
                hint = 'It was archived, it belongs to another table, or it never existed here.';
      end if;
      -- The editor rung on THIS record, the question custom.record_update asks first.
      perform custom.assert_client_may_change(p_organization_id, v_id, 'custom.record_change_many');
      v_key := v_id::text;
      if not (v_first_at ? v_key) then
        v_first_at := v_first_at || jsonb_build_object(v_key, v_i);
      end if;
      if v_op = 'update' then
        v_patch := v_change -> 'patch';
        if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
          raise exception 'custom.record_change_many: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(v_patch), 'nothing')
            using errcode = '22023';
        end if;
        -- The envelope key comes off before the merge, exactly as in custom.record_update.
        v_patch := custom._take_op_id(v_patch, 'custom.record_change_many');
        v_patches := v_patches || jsonb_build_object(v_key, coalesce(v_patches -> v_key, '{}'::jsonb) || v_patch);
        if v_change ? 'expected_version' and nullif(v_change ->> 'expected_version', '') is not null then
          v_expected := v_expected || jsonb_build_object(v_key, (v_change ->> 'expected_version')::integer);
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                      v_n, v_i + 1, coalesce(v_change ->> 'record_id', 'new'))
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;
  end loop;

  -- ── 1. new records, in ONE statement through custom.record_write_many ──
  if cardinality(v_inserts) > 0 then
    begin
      v_new_ids := custom.record_write_many(p_organization_id, p_table_id, v_inserts, null);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: one of its %s new records was refused, and the batch is one transaction.', v_n, cardinality(v_inserts))
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;
    for v_i in 1 .. cardinality(v_insert_at) loop
      v_out[v_insert_at[v_i] + 1] := jsonb_build_object('op', 'insert', 'id', v_new_ids[v_i]);
    end loop;
  end if;

  -- ── 2. every update in ONE statement: statement triggers (the change notice, the history,
  --      the activity bridge) fire once for the batch; row triggers (validation, the value
  --      envelope, the write door) fire for every row, exactly as for one record ──
  if v_patches <> '{}'::jsonb then
    begin
      with changed as (
        update custom.record r
           set data = r.data || p.value
          from jsonb_each(v_patches) p
         where r.organization_id = p_organization_id
           and r.table_id = p_table_id
           and r.id = p.key::uuid
           and r.deleted_at is null
           and (not (v_expected ? p.key) or r.version = (v_expected ->> p.key)::integer)
        returning r.id, r.version)
      select coalesce(jsonb_object_agg(c.id::text, c.version), '{}'::jsonb) into v_versions from changed c;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      -- WHICH change? The statement answers for the set; the one-record door answers for a row.
      -- Each update is replayed through custom.record_update (the failed statement is already
      -- rolled back) until one refuses, and THAT refusal is raised with its position.
      for v_key, v_patch in select e.key, e.value from jsonb_each(v_patches) e
                             order by (v_first_at ->> e.key)::integer loop
        begin
          perform custom.record_update(p_organization_id, v_key::uuid, v_patch, (v_expected ->> v_key)::integer);
        exception when others then
          get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                                  v_detail = pg_exception_detail, v_hint = pg_exception_hint;
          raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
            hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                          v_n, (v_first_at ->> v_key)::integer + 1, v_key)
                   || coalesce(' ' || nullif(v_hint, ''), '');
        end;
      end loop;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: the changes were refused together, though none is refused alone.', v_n)
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;

    -- A row the statement did not change was archived meanwhile, or moved past the version the
    -- caller wrote against: the same two answers custom.record_update gives, for that change.
    for v_key in select e.key from jsonb_each(v_patches) e
                  where not (v_versions ? e.key)
                  order by (v_first_at ->> e.key)::integer loop
      select r.version into v_current from custom.record r
       where r.organization_id = p_organization_id and r.id = v_key::uuid and r.deleted_at is null;
      if v_current is null then
        raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', v_key
          using errcode = '02000',
                hint = format('Nothing in this batch of %s changes was saved: change %s was refused, and the batch is one transaction.',
                              v_n, (v_first_at ->> v_key)::integer + 1);
      end if;
      raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                      v_expected ->> v_key, v_current
        using errcode = 'PT409',
              detail = jsonb_build_object('expected_version', (v_expected ->> v_key)::integer,
                                          'current_version',  v_current,
                                          'record_id',        v_key)::text,
              hint = format('Nothing in this batch of %s changes was saved: change %s was refused, and the batch is one transaction. Look at what changed and write it again against version %s.',
                            v_n, (v_first_at ->> v_key)::integer + 1, v_current);
    end loop;

    -- The columns the patch named must be the Table's own, the check custom.record_update makes.
    for v_key, v_patch in select e.key, e.value from jsonb_each(v_patches) e loop
      perform custom.assert_columns_are_defined(p_organization_id, v_key::uuid, v_patch);
    end loop;
  end if;

  -- ── 3. archives, one record at a time through custom.record_delete (it cascades by rule) ──
  for v_i in 0 .. v_n - 1 loop
    v_change := p_changes -> v_i;
    v_op := coalesce(v_change ->> 'op', 'update');
    if v_op = 'update' then
      v_key := v_change ->> 'record_id';
      v_out[v_i + 1] := jsonb_build_object('op', 'update', 'id', v_key, 'version', (v_versions ->> lower(v_key))::integer);
    elsif v_op = 'archive' then
      begin
        v_at := custom.record_delete(p_organization_id, (v_change ->> 'record_id')::uuid);
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                                v_detail = pg_exception_detail, v_hint = pg_exception_hint;
        raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
          hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                        v_n, v_i + 1, v_change ->> 'record_id')
                 || coalesce(' ' || nullif(v_hint, ''), '');
      end;
      v_out[v_i + 1] := jsonb_build_object('op', 'archive', 'id', v_change ->> 'record_id', 'archived_at', v_at);
    end if;
  end loop;

  return to_jsonb(v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_update');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, null, 'custom.record_update', p_record_id);

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE ENVELOPE KEY COMES OFF BEFORE THE MERGE. `data || p_patch` would otherwise write it
  -- straight into the record, where it would then be a column nobody declared, forever.
  p_patch := custom._take_op_id(p_patch, 'custom.record_update');
  if p_patch = '{}'::jsonb then
    raise exception 'custom.record_update: the patch is empty once the platform envelope keys are taken off it, so there is nothing to write.'
      using errcode = '22023',
            hint = 'Nothing was written. Send at least one field key -> value beside _op_id.';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no such record in this organization any more.' using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
    end if;
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no such record in this organization any more - somebody deleted it while you were working on it.' using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
  v_prev  text;
  -- STORE-TAILS-3: THE ARCHIVE EVENT this call belongs to, and what it took.
  v_event     uuid;
  v_own_event boolean := false;
  v_took      uuid[];
  v_class     text;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, null, 'custom.record_delete', p_record_id);

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;

  -- STORE-TAILS-3: THE TOP OF ONE ARCHIVE. Everything this call and its cascade take is written
  -- down, in order, so the restore can bring back exactly this set. A Table's archive opens its
  -- event HERE, before the first row moves, so every History version this statement writes
  -- carries the event's id; `custom.table_archive` opens one for all of its chunks and says so
  -- in `custom.archive_event`.
  if v_depth = 0 then
    perform set_config('custom.archive_took', '', true);
    v_event := nullif(current_setting('custom.archive_event', true), '')::uuid;
    select r.data_class into v_class
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    if v_event is null
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_record_id
                      and r.table_id = custom.table_kernel_id() and r.data_class <> 'kernel'
                      and r.deleted_at is null) then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   'STORE-TAILS-3: a table archived as one unit — its fields, saved views, rules and records with it; restoring the table brings back exactly this set.');
      v_own_event := true;
    end if;
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    -- THE WHOLE SET, SAID OUT LOUD BEFORE THE FIRST ROW GOES. REC-18 refuses a Field something
    -- still reads; inside this table, what reads it is going too, so it is not something that
    -- still reads it. Transaction-local, and put back exactly as it was afterwards.
    v_prev := coalesce(current_setting('custom.delete_set', true), '');
    perform set_config('custom.delete_set',
      v_prev || ',' || p_record_id::text || ',' ||
      coalesce((select string_agg(x #>> '{}', ',')
                  from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x), ''),
      true);
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
    perform set_config('custom.delete_set', v_prev, true);
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no such record in this organization.' using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  -- STORE-TAILS-3: this row is part of what this archive took, in the order it went.
  perform set_config('custom.archive_took',
                     coalesce(current_setting('custom.archive_took', true), '') || p_record_id::text || ',',
                     true);

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);

  -- STORE-TAILS-3: THE BOTTOM OF ONE ARCHIVE. Write down what it took. A single row that took
  -- nothing with it needs no event (bringing it back was always exact); anything more — a table,
  -- a record that took what it contained, a row archived inside a table's chunked archive —
  -- is written to its event, each row with the exact moment it was archived.
  if v_depth = 0 then
    v_took := coalesce(string_to_array(rtrim(coalesce(current_setting('custom.archive_took', true), ''), ','), ',')::uuid[],
                       '{}'::uuid[]);
    perform set_config('custom.archive_took', '', true);
    if v_event is null and cardinality(v_took) > 1 then
      v_event := history.migration_record(p_organization_id, 'archive', coalesce(v_class, 'record'), p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   format('STORE-TAILS-3: archived with %s row(s) it contained or cascaded to; restoring it brings back exactly this set.',
                          cardinality(v_took) - 1));
      v_own_event := true;
    end if;
    if v_event is not null and cardinality(v_took) > 0 then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                       || coalesce((select jsonb_agg(t.x::text order by t.o)
                                      from unnest(v_took) with ordinality as t(x, o)
                                     where t.x::text is distinct from m.inverse ->> 'record_id'), '[]'::jsonb),
               'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                       || (select jsonb_agg(jsonb_build_array(t.x::text, v_at) order by t.o)
                             from unnest(v_took) with ordinality as t(x, o)),
               'open', case when v_own_event then 'false'::jsonb else coalesce(m.inverse -> 'open', 'true'::jsonb) end,
               'archived_at', case when v_own_event then to_jsonb(v_at) else m.inverse -> 'archived_at' end)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;
  return v_at;
end
$function$;

CREATE OR REPLACE FUNCTION custom.field_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_listed  boolean;
  v_key     text;
  v_fields  jsonb;
  v_opts    uuid;
  v_id      uuid;
  v_existing uuid;
  v_same     uuid;
  v_holder   text;          -- DATA-V2-BASICS: the label of the column already holding the key
  v_base     text;
  v_n        integer;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          'admin'::public.permission_level, 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.field_declare');

  select r.data -> 'fields' into v_fields
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_fields is null then
    raise exception 'That table is not in this organization, so a field cannot be added to it.'
      using errcode = '23514',
            hint = 'REC-29: organizations are hard walls. Open the table you meant and add the field there.';
  end if;

  v_doc := custom._field_document_for(p_organization_id, p_table_id, p_spec);
  v_key := v_doc ->> 'key';

  -- ── DATA-V2-BASICS, 2026-09-27: A KEY THE STORE DERIVED NEVER LANDS ON ANOTHER COLUMN. ────
  -- Arman's Coding Accounts: the column "Resets" (key `resets`) was renamed "Account Type".
  -- Adding a new column called "Resets" derived the key `resets` again, and this door answered
  -- 23505 *"This table already has a field called "Resets""* — false: no column on the screen
  -- is called that. Had the new column been a choice list like the old one, the same-type rule
  -- below would have returned the OLD column's id and the person's new column would never have
  -- appeared at all. And a key a RETIRED column held still sits under every record's history,
  -- so a new column given it would show the old column's values.
  -- THE RULE: when the caller did not ask for a key, the key is the store's to choose, and it
  -- chooses one no column of this table has ever held (`resets_2`, `resets_3` …) unless the
  -- column holding it is the SAME column said again — the same name (and then the same-type
  -- rule below answers, or the name is refused as taken). A key a caller asked for by name is
  -- still exactly that key, and a clash on it is refused naming the column that holds it.
  -- ── DATA-V2-BASICS (BREAKER-1 F8): A NEW COLUMN NEVER TAKES ANOTHER COLUMN'S NAME. ─────────
  -- The same name AND the same key AND the same kind is the same column said again (a caller's
  -- repeated declaration, answered below by the same-type rule). Any other column already called
  -- that is refused by name: two headers reading "Patient Name" over different data is how a paste
  -- matched the wrong column and blanked a real one (BREAKER-1 F10).
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
                and lower(btrim(coalesce(r.data ->> 'label', ''))) = lower(btrim(coalesce(v_doc ->> 'label', '')))
                and not (nullif(p_spec ->> 'key', '') is not null
                         and r.data ->> 'key' = v_key
                         and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
                             is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text'))) then
    raise exception 'You already have a column called "%".', btrim(v_doc ->> 'label')
      using errcode = '23505',
            hint = 'Open that column from its header to change it, or give the new one another name. Nothing was added.';
  end if;

  if nullif(p_spec ->> 'key', '') is null then
    select coalesce(r.data ->> 'label', r.data ->> 'name', '') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
       and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
     limit 1;
    if (v_holder is not null
          and lower(btrim(v_holder)) is distinct from lower(btrim(coalesce(v_doc ->> 'label', ''))))
       or (v_holder is null and exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is not null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)
           and not exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)) then
      v_base := left(v_key, 44);
      v_n := 2;
      loop
        v_key := v_base || '_' || v_n;
        exit when not exists (
                    select 1 from custom.record r
                     where r.organization_id = p_organization_id
                       and r.table_id = custom.field_kernel_id()
                       and r.data_class = 'field'
                       and r.data ->> 'entity_definition_id' = p_table_id::text
                       and r.data ->> 'key' = v_key)
                  and not exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
        v_n := v_n + 1;
      end loop;
      v_doc := jsonb_set(v_doc, '{key}', to_jsonb(v_key));
    end if;
  end if;

  -- ── RELATION-DECLARE, 2026-09-20: "MAY I POINT AT IT" IS "MAY I SEE IT". ───────────────
  -- Pointing a column at a Table is how that Table's titles get onto your screen: the picker
  -- lists its records and platform.relation_label hydrates a chip from each one. So the
  -- question this door was not asking is the question every OTHER door onto a Table asks
  -- (T10) - and this is the one that makes a LASTING link. A caller who names the target
  -- themselves is asked it here; the Person and File columns, whose target is a kernel Table
  -- this door fills in, are untouched.
  -- LIMITS-FIX 2026-09-21: `target_table` is the same question as `relation_target`
  -- (custom._field_document_for reads both), so the may-I-see-it check has to recognise
  -- both too. Reading only one word here would let a caller reach a Table it may not see
  -- simply by spelling the argument the other way.
  if coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', '')) is not null
     and nullif(v_doc ->> 'relation_target', '') is not null then
    perform custom.assert_may_know_table(p_organization_id,
              (v_doc ->> 'relation_target')::uuid, 'custom.field_declare');
  end if;

  -- ── SEAT-SUITES, 2026-09-19: A COLUMN A TABLE DECLARED COULD NEVER BE DEFINED. ──────
  -- `custom._table_shape_guard` refuses a table that declares no fields, so EVERY table made
  -- through `custom.table_declare` names at least one column. `table_declare` writes only the
  -- NAME into the table's `fields` list — it makes no Field row — so `custom.applicable_fields`
  -- answers ZERO columns for a brand-new table, and this door then refused every one of those
  -- names as "already there". Through the doors alone, a signed-in person's first column had no
  -- type, no rules, no validation and no way to ever get one. The old suites never saw it
  -- because they INSERTed the Field rows straight into `custom.record` as the role that owns
  -- the table — a privilege no person has. Measured from the seat `authenticated` on the main
  -- database on 2026-09-19: applicable_fields = 0, then 23505 "This table already has a field
  -- called Pname", then applicable_fields = 0 again.
  --
  -- THE RULE: a NAME the table declared and never defined is FILLED IN by this door. Only a
  -- name that already has a Field ROW is a duplicate, and that is still refused by name.
  v_listed := exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
  -- ── LIMITS-FIX 2026-09-21: A COLUMN BORN WITH ITS TABLE IS FILLED IN HERE, NOT REFUSED.
  -- `custom.table_declare` now materialises the columns a table's spec names, and stamps
  -- each one `declared_with_table`. The documented build is two steps — declare the table
  -- naming its columns, then define each column here — so meeting one of those rows means
  -- step two has arrived for a column step one only sketched, and the right answer is to
  -- DEFINE it: the type, the rules, the choices and the label the caller is now giving.
  -- The marker comes off in the same write, so a THIRD attempt at the same key is an
  -- ordinary duplicate and is refused exactly as it always was. A field somebody has
  -- already defined is never silently overwritten by this door.
  select r.id into v_existing
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce((r.data ->> 'declared_with_table')::boolean, false)
   limit 1;

  -- ── LIMITS-FIX 2026-09-21: DECLARING THE SAME COLUMN TWICE IS THE SAME COLUMN. ───────
  -- Real-data crew A: "Create and import a file" on a brand-new table answered 409 on the
  -- table's OWN default Title column — the create path declares Title, the import path
  -- declares Title, and the second one was a conflict. Real-data crew E2 hit the same wall
  -- from another direction with a table whose own column is called `name`. Neither caller
  -- was asking for a second column; both were saying the same true thing twice, and the
  -- store treated the repetition as a contradiction.
  -- THE RULE: the same key with the same TYPE already defined is that column, returned
  -- unchanged and not written again — declaring is idempotent, as a declaration should be.
  -- The same key with a DIFFERENT type is a real conflict and is still refused by name,
  -- because silently retyping a live column would take its values with it.
  select r.id into v_same
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
         is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text')
   limit 1;
  if v_existing is null and v_same is not null then
    return v_same;
  end if;

  if v_existing is null and exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key) then
    -- DATA-V2-BASICS: the sentence names the column that is really there. A clash on the
    -- NAME says the name; a clash on a key the caller asked for names the column holding it.
    select coalesce(r.data ->> 'label', r.data ->> 'name', r.data ->> 'key') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
     limit 1;
    if lower(btrim(coalesce(v_holder, ''))) = lower(btrim(coalesce(v_doc ->> 'label', ''))) then
      raise exception 'This table already has a field called "%".', v_doc ->> 'label'
        using errcode = '23505',
              hint = 'Two columns of one table cannot share a name and a kind. Give this one a different name, or edit the one that is already there.';
    end if;
    raise exception 'The column "%" already uses the key %, so "%" cannot have it too.', v_holder, v_key, v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Leave the key out and the store picks a free one, or rename the column that holds it.';
  end if;

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    -- CHOICE-COLUMN-EDIT, 2026-09-27: none typed yet is an empty list, not a refusal — the column
    -- is a choice column from the start and its first choice is added later (settings or a cell).
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label',
                                        case when jsonb_typeof(p_spec -> 'options') = 'array'
                                             then p_spec -> 'options' else '[]'::jsonb end);
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-01): the default fits the column, or nothing is written.
  v_doc := custom._field_default_fitted(p_organization_id, v_doc);

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-16): A NEW COLUMN GOES AFTER THE OTHERS. Every column was
  -- born at sort 100, so a table of ten columns added one at a time listed them alphabetically, not in
  -- the order they were added. A column that does not ask for a place goes after the last one.
  if not (p_spec ? 'sort') then
    v_doc := jsonb_set(v_doc, '{sort}', to_jsonb(coalesce(
      (select max((f.data ->> 'sort')::numeric)
         from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and coalesce(f.data_class, '') <> 'kernel'
          and f.data ->> 'entity_definition_id' = p_table_id::text
          and f.data ->> 'sort' ~ '^-?[0-9]+(\.[0-9]+)?$'), 90) + 10));
  end if;

  -- ONE SOURCE OF TRUTH, both ways: the TABLE declares which fields it has and
  -- `custom.field` defines what one of them is, so the table is told first —
  -- the field guard refuses a definition for a field the table never declared,
  -- which is the exact sentence every "Add field" ended on.
  -- A name the table already declared is not added to the list a second time; a table that
  -- listed the same column twice would show it twice on every screen.
  if not v_listed then
    update custom.record
       set data = jsonb_set(data, '{fields}',
                            coalesce(data -> 'fields', '[]'::jsonb)
                            || jsonb_build_array(jsonb_build_object('name', v_key))),
           updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_table_id
       and table_id = custom.table_kernel_id();
  end if;

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  -- The sketch this table was born with becomes the column the caller just described.
  if v_existing is not null then
    update custom.record
       set data = v_doc, updated_at = now(), version = version + 1
     where organization_id = p_organization_id and id = v_existing;
    return v_existing;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_declare(p_organization_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid;
  v_field jsonb;
  v_doc   jsonb;
  v_opts  uuid;
  v_n     integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_declare');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, null, 'custom.table_declare');

  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;

  -- ── LIMITS-FIX 2026-09-21: THE FIELDS A TABLE DECLARES NOW EXIST. ─────────────────────
  -- `custom._table_shape_guard` REFUSES a table that declares no fields, so every table
  -- made here names its columns — and this door used to write those names into the table's
  -- own document and make no Field record for any of them. The consequence, measured on the
  -- main database on 2026-09-21: of 770 tables in the store, 104 across 15 organizations
  -- hold 315 declared field names with NO backing Field record. For those tables
  -- `custom.applicable_fields` answers ZERO columns, so `store.fields()` returns an empty
  -- array for a table that plainly has columns and already holds rows using them; the grid
  -- has nothing to draw, and `custom.field_declare`'s own `via`/`of` validation — which
  -- reads that same list — cannot resolve a lookup or a rollup at all. Real-data crew D hit
  -- every one of those symptoms within ten minutes of starting a podcast episode pipeline.
  --
  -- The two halves were never reconciled: the table document said one thing and the Field
  -- records said another, and the store had no opinion about which was true. They are now
  -- written in ONE statement, so they cannot disagree at birth.
  --
  -- It reuses `custom._field_document_for` — the SAME builder `custom.field_declare` uses —
  -- rather than composing a second field document here, so a field born with its table and a
  -- field added later are the same kind of thing, validated by the same guards. The inline
  -- entry's own word for the column's name (`name`) is what that builder now reads.
  -- The table's `fields` list is NOT appended to: the spec already carries these names, and
  -- adding them again would show every column twice on every screen.
  --
  -- A field that cannot be made fails the WHOLE declaration. A table that half exists, with
  -- some of its columns real and the rest only named, is the state this fix is removing.
  if jsonb_typeof(p_spec -> 'fields') = 'array' then
    for v_field in select * from jsonb_array_elements(p_spec -> 'fields') loop
      v_n := v_n + 1;
      -- IN THE ORDER A PERSON WROTE THEM. `sort` is what every reader orders columns by, so
      -- position in the declared list becomes position on the screen unless the caller said
      -- otherwise. Without this the columns come back in whatever order the plan produced.
      if (v_field ->> 'sort') is null then
        v_field := v_field || jsonb_build_object('sort', v_n * 100);
      end if;

      v_doc := custom._field_document_for(p_organization_id, v_id, v_field);

      -- ── LIMITS-FIX 2026-09-21: THIS COLUMN WAS BORN WITH ITS TABLE, AND SAYS SO. ──────
      -- The documented way to build a table is two steps: declare the table naming its
      -- columns, then define each column with `custom.field_declare`. Once this door
      -- materialises the names, step two meets a row that already exists and used to be
      -- refused "This table already has a field called X" — which is how
      -- `pnpm check:store-doors-decide` went red within minutes of the first apply.
      -- The marker is what tells the two apart: a column this door created and NOBODY has
      -- defined yet is the SAME column step two is describing, so step two fills it in.
      -- `custom.field_declare` drops the marker the moment it does, so the second real
      -- attempt at the same key is a duplicate again and is refused by name.
      v_doc := v_doc || jsonb_build_object('declared_with_table', true);

      -- THE CHOICE LIST, exactly as `custom.field_declare` builds it: the words a person
      -- typed are kept the only way FLD-5/FLD-6 allows, as the records of a Table.
      if (v_doc ->> 'type') = 'list'
         and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
        -- CHOICE-COLUMN-EDIT, 2026-09-27: none given yet is an empty list, not a refusal.
        v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label',
                                            case when jsonb_typeof(v_field -> 'options') = 'array'
                                                 then v_field -> 'options' else '[]'::jsonb end);
        v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
      end if;

      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, custom.field_kernel_id(), 'field', v_doc);
    end loop;
  end if;

  return v_id;
end;
$function$;
