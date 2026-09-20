-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.context_resolve(uuid, jsonb, text) 92372a8f47f9af1b00f0135ff349a937a3286f165d7c20dc8144f07fbbebe94c
--
-- CONTEXT-PERF — ONE DOOR ANSWERS A WHOLE TURN'S CONTEXT, IN ONE ROUND TRIP.
--
-- THE DEFECT, MEASURED. Lane CONTEXT-FIELDS proved that a context item IS a Field of the
-- Record its scope is, and shipped the store-backed path behind
-- `custom/consumer_context_enabled` (off everywhere). Its own closing measurement said what
-- it cost: **0.27–0.34 s on the old path against 4.2–5.6 s on the store-backed one**, and
-- named the cause — "four extra round trips through the store's doors per assembly".
--
-- Re-measured on the main database on 2026-09-20, with three parity agents carrying THREE
-- context items each (the CONTEXT-FIELDS fixture carried one, which hid the per-item cost):
--
--     old path   2–3 database round trips   260–333 ms
--     new path   60–62 round trips          8.03–8.24 s
--
-- Sixty. The assembly reads the scopes page, then per BOUND FIELD opens `custom.read_record`,
-- `history.record_versions` and `custom.record_values_versioned` — three statements a field,
-- each one 223 ms of Wi-Fi and hosted pooler (the floor lane LATENCY measured and could not
-- tune). None of it is the database being slow: every one of those statements answers in
-- single-digit to low-tens of milliseconds. It is the SHAPE — a per-item conversation with a
-- database that is one network away.
--
-- WHAT THIS DOOR IS. `custom.context_resolve` takes a whole turn's BINDINGS — every
-- (context item, scope) pair the turn is about — and answers all of them at once:
--
--   * it maps each legacy scope id onto the store Record that scope IS, through the read
--     door, by the `id` the Record's own document carries (which is how the repointed
--     `context.scopes` relation has always been addressed);
--   * it reads each distinct Record ONCE through `custom.read_record` — the same door, the
--     same masking, the same `_hidden` notices, under the same person — and pairs it with
--     `custom.record_values_versioned` for the triple (field id, value version, written at);
--   * it applies the two ceilings the declarations carry: AGT-7's SENSITIVITY ceiling (a
--     restricted, privileged or confidential field is never delivered inline) and §D's
--     FRESHNESS ceiling (a value older than its own `review_interval_days` is delivered and
--     marked stale, never silently passed off as current);
--   * it orders the bindings by `depends_on`, naming a cycle rather than looping;
--   * and it answers the provenance triple for every value, so "why does it say that" is
--     answerable from the same call that produced it.
--
-- NOTHING HERE DECIDES WHO MAY SEE WHAT, AND THE `SECURITY DEFINER` ON IT CHANGES THAT NOT AT
-- ALL — which is the one claim in this file worth checking rather than believing. Every value in
-- the answer came out of `custom.read_record`; every version out of
-- `custom.record_values_versioned`; every refusal is one of those doors' own. This function
-- reads no table directly and holds no visibility logic. It is `security definer` for the same
-- reason every other door in this store is: `custom.assert_client_may_reach` is not granted to
-- `authenticated` (it is a door's internal first line, not a client call), and a SECURITY INVOKER
-- body could therefore not even ask the organization question. THE CALLER IS STILL THE CALLER
-- INSIDE IT: `custom.caller_role()` deliberately reads the `role` GUC rather than `current_user`
-- — "inside a SECURITY DEFINER door `current_user` has ALREADY been rewritten to the definer" —
-- so the wall, the ladder and the masking all still see `authenticated` and the person the JWT
-- names. A caller who may not open a Record gets that Record's own refusal, named, in
-- `unresolved`, and the other scopes' values still arrive: one scope that is not yours does not
-- take the turn down.
--
-- This was measured, not assumed: the first version of this file WAS `security invoker`, and it
-- failed on the very first real call with `permission denied for function
-- assert_client_may_reach`.
--
-- WHY IT IS NOT `custom.agent_context`. That door (W4-DOOR) answers a whole TABLE for an
-- agent — `read_records` with a limit. This one answers a LIST OF BOUND CELLS across several
-- Records. Neither is the other; `custom.agent_context` is untouched.

create or replace function custom.context_resolve(
  p_organization_id uuid,
  p_bindings        jsonb,
  p_scope_slug      text default 'scopes'
) returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me           uuid;
  v_binding      jsonb;
  v_scope_table  uuid;
  v_scope_ids    text[] := '{}';
  v_scope_map    jsonb := '{}'::jsonb;
  v_record_ids   uuid[] := '{}';
  v_records      jsonb := '{}'::jsonb;
  v_unresolved   jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_rec          uuid;
  v_doc          jsonb;
  v_hidden       jsonb;
  v_values       jsonb;
  v_row          record;
  v_key          text;
  v_field        text;
  v_cell         jsonb;
  v_sens         text;
  v_hint         text;
  v_delivery     text;
  v_note         text;
  v_fresh        text;
  v_stale        text;
  v_age          numeric;
  v_ceiling      numeric;
  v_written      timestamptz;
  v_order        jsonb := '{}'::jsonb;
  v_ready        text[];
  v_pending      jsonb;
  v_index        int := 0;
  v_progress     boolean;
  v_dep          jsonb;
  v_blocked      boolean;
begin
  -- THE ORGANIZATION WALL FIRST, in the same order and the same sentence as every other
  -- door in this store. Nothing below reads a row this has not already admitted the caller to.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_resolve');

  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
    raise exception 'custom.context_resolve was asked to resolve something that is not a list of bindings.'
      using errcode = '22004',
            hint = 'Pass a JSON array of {key, scope_id|record_id, field_key} objects. A turn with no context items passes [] and gets an empty answer.';
  end if;

  if jsonb_array_length(p_bindings) = 0 then
    return jsonb_build_object(
      'scope_records', '{}'::jsonb, 'records', '{}'::jsonb, 'bindings', '[]'::jsonb,
      'unresolved', '[]'::jsonb,
      'read_as', 'the person operating this agent', 'through', 'custom.read_record');
  end if;

  if exists (select 1 from jsonb_array_elements(p_bindings) b
              where jsonb_typeof(b) <> 'object') then
    -- A LIST OF THE RIGHT LENGTH MADE OF THE WRONG THING IS NOT A LIST OF BINDINGS.
    -- `list({"key": ...})` in Python is `["key"]` — an array of STRINGS — and without this
    -- the door answered an empty result for it instead of saying what was wrong, which is
    -- exactly the silent shrug this store exists to refuse.
    raise exception 'custom.context_resolve was handed a list whose entries are not bindings.'
      using errcode = '22004',
            hint = 'Each entry is an object: {key, scope_id|record_id, field_key}. An array of strings or numbers is not a turn''s context cells.';
  end if;

  if jsonb_array_length(p_bindings) > 500 then
    raise exception 'custom.context_resolve was handed % bindings and the ceiling is 500.',
      jsonb_array_length(p_bindings)
      using errcode = '22003',
            hint = 'A turn addresses a handful of context cells. A list this long is a caller asking for a whole catalogue, which is a different door (custom.agent_context reads a Table).';
  end if;

  v_me := custom.query_principal();

  -- ── 1. THE SCOPES THIS TURN NAMES, AS RECORDS ─────────────────────────────────────────
  -- One page of the scope Table through the read door, indexed here on the legacy id the
  -- Record's own document carries. This is the read the client used to make separately.
  select array_agg(distinct b ->> 'scope_id')
    into v_scope_ids
    from jsonb_array_elements(p_bindings) b
   where b ? 'scope_id' and nullif(b ->> 'scope_id', '') is not null;

  if coalesce(array_length(v_scope_ids, 1), 0) > 0 then
    select d.id into v_scope_table
      from custom.read_records(p_organization_id, custom.table_kernel_id(), false, 1000, 0) d
     where d.document ->> 'slug' = p_scope_slug
     limit 1;

    if v_scope_table is null then
      -- A NAMED ABSENCE, never an empty map passed off as "no scopes". An organization with
      -- no scope Table has not been ramped onto the store for this consumer, and the caller
      -- must be able to tell that from "this person may not see those scopes".
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', '*',
        'reason', format(
          'this organization has no Table with slug %L that you can see, so none of this turn''s scopes are Records yet. Nothing was read and nothing was guessed.',
          p_scope_slug));
    else
      select coalesce(jsonb_object_agg(d.document ->> 'id', d.id), '{}'::jsonb)
        into v_scope_map
        from custom.read_records(p_organization_id, v_scope_table, false, 1000, 0) d
       where d.document ->> 'id' = any (v_scope_ids);
    end if;
  end if;

  -- ── 2. EVERY DISTINCT RECORD, READ ONCE, THROUGH THE READ DOOR ────────────────────────
  select array_agg(distinct x) into v_record_ids from (
    select coalesce(nullif(b ->> 'record_id', ''), v_scope_map ->> (b ->> 'scope_id'))::uuid as x
      from jsonb_array_elements(p_bindings) b
  ) s where x is not null;

  foreach v_rec in array coalesce(v_record_ids, array[]::uuid[]) loop
    begin
      v_doc := custom.read_record(p_organization_id, v_rec, false);
    exception when others then
      -- THE DOOR'S OWN REFUSAL, CARRIED, NOT SWALLOWED. One scope this person may not open
      -- must not end the other two scopes' turn, and it must not be reported as "empty".
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'sqlstate', sqlstate, 'reason', sqlerrm);
      continue;
    end;

    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);
    v_values := '{}'::jsonb;

    -- The triple. `custom.record_values_versioned` is a client-callable door and it is
    -- asked as the caller, not around them: when it refuses, every value keeps its value
    -- and SAYS its version is unknown rather than being rendered as version 1.
    begin
      for v_row in
        select * from custom.record_values_versioned(p_organization_id, v_rec)
      loop
        v_values := v_values || jsonb_build_object(v_row.field_key, jsonb_build_object(
          'value',         v_doc -> v_row.field_key,
          'field_id',      v_row.field_id,
          'value_version', v_row.value_version,
          'written_at',    v_row.written_at,
          'absent_reason', v_row.absent_reason,
          'actor',         v_row.actor,
          'source',        v_row.source,
          'masked',        v_hidden ? v_row.field_key,
          'mask_reason',   v_hidden -> v_row.field_key ->> 'reason'));
      end loop;
    exception when others then
      select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
               'value',         e.value,
               'field_id',      null,
               'value_version', null,
               'written_at',    null,
               'absent_reason', format('the store did not let this principal read value versions (%s) — the value is the read door''s and its version is unknown rather than guessed', sqlerrm),
               'masked',        v_hidden ? e.key,
               'mask_reason',   v_hidden -> e.key ->> 'reason')), '{}'::jsonb)
        into v_values
        from jsonb_each(v_doc - '_hidden' - '_alternates' - '_retired') e;
    end;

    v_records := v_records || jsonb_build_object(v_rec::text, v_values);
  end loop;

  -- ── 3. EVERY BINDING, WITH ITS TWO CEILINGS ───────────────────────────────────────────
  for v_binding in select b from jsonb_array_elements(p_bindings) b loop
    v_key   := v_binding ->> 'key';
    v_field := v_binding ->> 'field_key';
    v_rec   := coalesce(nullif(v_binding ->> 'record_id', ''),
                        v_scope_map ->> (v_binding ->> 'scope_id'))::uuid;

    if v_rec is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key,
        'reason', format('the scope %s is not a Record in the store yet, so this field resolves the way it always has (nothing was dropped and nothing was guessed).',
                         coalesce(v_binding ->> 'scope_id', '(unnamed)')));
      continue;
    end if;
    if not (v_records ? v_rec::text) then
      continue;  -- the record's own refusal is already in v_unresolved, with its sentence
    end if;

    -- AGT-7's SENSITIVITY CEILING. Delivery may not widen what sensitivity allows. A
    -- restricted field is not dropped — dropping a real value is worse — it is moved off
    -- the inline tier so the agent fetches it when it actually needs it.
    v_hint := lower(coalesce(nullif(btrim(v_binding ->> 'fetch_hint'), ''), 'always'));
    v_sens := lower(coalesce(nullif(btrim(v_binding ->> 'sensitivity'), ''), ''));
    v_note := null;
    v_delivery := case v_hint
                    when 'always' then 'inline'
                    when 'on_demand' then 'on_demand'
                    when 'lazy' then 'on_demand'
                    when 'batch_related' then 'on_demand'
                    else null
                  end;
    if v_delivery is null then
      v_delivery := 'inline';
      v_note := format('this field asks to be fetched %L, which is not a delivery this system knows; it is delivered inline rather than dropped', v_hint);
    end if;
    if v_delivery = 'inline' and v_sens in ('restricted', 'privileged', 'confidential') then
      v_delivery := 'on_demand';
      v_note := format('this field is %s, so it is never written into the prompt unasked — the agent fetches it when it needs it (AGT-7)', v_sens);
    end if;

    v_cell := v_records -> v_rec::text -> v_field;
    if v_cell is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key, 'record_id', v_rec,
        'reason', format('the record this field points at has no field %L you can read', v_field));
      continue;
    end if;

    -- §D's FRESHNESS CEILING, read off `review_interval_days`. A value past its own declared
    -- review interval is DELIVERED and marked stale with its age. An unreadable timestamp is
    -- named, not treated as fresh: "we could not tell how old it is" is not "it is current".
    v_fresh := 'live';
    v_stale := null;
    v_ceiling := nullif(v_binding ->> 'freshness_seconds', '')::numeric;
    v_written := nullif(v_cell ->> 'written_at', '')::timestamptz;
    if v_ceiling is not null and v_ceiling > 0 then
      if v_written is null then
        v_stale := 'this value carries no write time, so whether it is inside its freshness ceiling is unknown';
      else
        v_age := extract(epoch from (now() - v_written));
        if v_age > v_ceiling then
          v_fresh := 'stale';
          v_stale := format('last written %s day(s) ago, past the %s-day freshness this field declares — it is delivered anyway and marked stale rather than dropped',
                            floor(v_age / 86400)::int, greatest(floor(v_ceiling / 86400)::int, 1));
        end if;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'key',           v_key,
      'scope_id',      v_binding -> 'scope_id',
      'record_id',     v_rec,
      'field_key',     v_field,
      'field_id',      v_cell -> 'field_id',
      'value',         v_cell -> 'value',
      'value_version', v_cell -> 'value_version',
      'written_at',    v_cell -> 'written_at',
      'masked',        v_cell -> 'masked',
      'mask_reason',   v_cell -> 'mask_reason',
      'absent_reason', v_cell -> 'absent_reason',
      'delivery',      v_delivery,
      'delivery_note', v_note,
      'freshness',     v_fresh,
      'stale_note',    v_stale,
      -- CARRIED, and this is not decoration: the ordering step below reads `depends_on`
      -- off these rows. Leaving it out made `v_pending` a map of empty arrays, so every
      -- binding looked ready at once and the order was whatever `jsonb_object_keys`
      -- happened to answer — which the seat suite caught as `2 < 0`.
      'depends_on',    coalesce(v_binding -> 'depends_on', '[]'::jsonb));
  end loop;

  -- ── 4. `depends_on` ORDER, AND A CYCLE NAMED RATHER THAN LOOPED ───────────────────────
  -- DYN-9 belongs at SAVE time and this is not save time, so a circle written before anybody
  -- checked it must not end somebody's turn. The bindings inside it are ordered last, and the
  -- answer SAYS which keys made the circle so the panel can render the remedy.
  select coalesce(jsonb_object_agg(b ->> 'key', coalesce(b -> 'depends_on', '[]'::jsonb)), '{}'::jsonb)
    into v_pending
    from jsonb_array_elements(v_out) b;

  loop
    v_progress := false;
    v_ready := '{}';
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_blocked := false;
      for v_dep in select d from jsonb_array_elements(v_pending -> v_key) d loop
        if v_pending ? (v_dep #>> '{}') and (v_dep #>> '{}') <> v_key then
          v_blocked := true;
        end if;
      end loop;
      if not v_blocked then
        v_ready := v_ready || v_key;
      end if;
    end loop;
    exit when coalesce(array_length(v_ready, 1), 0) = 0;
    foreach v_key in array v_ready loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
      v_pending := v_pending - v_key;
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;

  if v_pending <> '{}'::jsonb then
    v_unresolved := v_unresolved || jsonb_build_object(
      'key', (select string_agg(k, ' -> ') from jsonb_object_keys(v_pending) k),
      'reason', 'these context fields depend on each other in a circle, so no order can satisfy them all. They are resolved last, in the order they were declared, and the circle is what to fix.');
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(b || jsonb_build_object('order_index', v_order -> (b ->> 'key'))
                            order by coalesce((v_order ->> (b ->> 'key'))::int, 2147483647)), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(v_out) b;

  return jsonb_build_object(
    'scope_records', v_scope_map,
    'records',       v_records,
    'bindings',      v_out,
    'unresolved',    v_unresolved,
    'read_as',       'the person operating this agent',
    'through',       'custom.read_record',
    'principal',     v_me);
end;
$$;

comment on function custom.context_resolve(uuid, jsonb, text) is
  'CONTEXT-PERF: a whole agent turn''s bound context cells, resolved in ONE round trip through custom.read_record, with the two ceilings (sensitivity, freshness), the depends_on order and the provenance triple. Holds no visibility logic of its own.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'context_resolve', 'p_organization_id uuid, p_bindings jsonb, p_scope_slug text',
   array['uuid'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid],
   'CONTEXT-PERF',
   'DOOR-5 / DYN-23: a turn''s context cells, resolved together under the person operating the agent. It batches custom.read_record and custom.record_values_versioned — both of which this caller already holds — and decides nothing itself.',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set identity_args = excluded.identity_args,
      reason        = excluded.reason,
      declared_by   = excluded.declared_by;
