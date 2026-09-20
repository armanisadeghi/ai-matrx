-- chair-step: it replaces `custom._work_shape_guard`, a TRIGGER body on the live `custom.record`
--   table. The production allow-list requires a file that replaces a trigger body to read
--   `custom/system_enabled` in that body; this one does not, because the body ALREADY opens with
--   `custom.assert_store_door(new.organization_id, 'custom.record')`, which resolves exactly that
--   knob through `custom.store_is_open`. A second, literal read beside it would be ceremony, and
--   a knob read that exists to satisfy a grep is the thing this campaign calls a comment
--   pretending to be a switch. Nothing is dropped, nothing is revoked, no grant is issued and no
--   row is deleted: five function bodies are replaced and one new function is added.
--
-- CHOICE-VALUE (3c of 4) - A WORKFLOW STATE IS A WORD TOO.
--
-- MEASURED, 2026-09-20 07:04Z, while converting the live choice cells: converting the `status`
-- column of a work table raised `22P02 invalid input syntax for type uuid: "in_progress"`. The
-- work layer (REC-69) stores a record's state in a CHOICE column and then casts what is stored
-- straight to uuid, because until this lane a choice value WAS the option record's id. Six casts
-- in five functions made that assumption - `custom._work_shape_guard` (twice), `custom.work_list`,
-- `custom.work_whose_turn`, `custom.work_record_states` and `custom.work_set_state` - censused
-- from `pg_proc` rather than found one at a time.
--
-- This is the class, not the instance: any code that wants the state RECORD asks ONE function,
-- `custom.work_state_id(organization, table, value)`, which accepts the option's key (what is
-- stored now), its label (what a person types) or its id (what was stored before this lane) and
-- answers the state record's id. A value that names no state answers null, exactly as the cast
-- used to answer null for an empty string - so a record with no status is still a record with no
-- status and nothing new is refused.
--
-- THE INVERSE: migrations/inverse/choiceval_a_state_is_a_word_too_down.sql.

-- based-on: custom._work_shape_guard() 3a21f301f77617956fd8fda6d872d73b8233cb4573fe4573516893d28f181cb4
-- based-on: custom.work_list(uuid, text, boolean, integer, integer) 86a9785f7de1909f004b32fa2185945d57333c283a8852b41f5521ad4fc40e81
-- based-on: custom.work_whose_turn(uuid, uuid, boolean) 6f9b5b65d8346505430e64c3ab106e06a9fc166066183f7345b2f6b80de050f7
-- based-on: custom.work_record_states(uuid, uuid) 5585fba204011f0bb179e85c30c1c79bf05591663489061fabc5c3d02cfc56ff
-- based-on: custom.work_set_state(uuid, uuid, uuid) 844c11f4190333aac7430caa12a3b8e1c7706525adfc8a2c09c00d61045208b0

set lock_timeout = '45s';
set statement_timeout = '600s';

create function custom.work_state_id(p_organization_id uuid, p_table_id uuid, p_value text)
returns uuid
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- The state RECORD behind whatever the document holds. The key first (the contract), then the
  -- label, then the option's own id - `custom.choice_key_of` asks all three in that order - and
  -- finally a bare uuid that names no choice at all, which is handed back as itself so a state
  -- written outside the choice machinery still resolves. Anything else is null.
  select coalesce(
    (select (m.f -> 'options' -> custom.choice_key_of(m.f, btrim(coalesce(p_value, ''))) ->> 'id')::uuid
       from (select custom.choice_field_map(p_organization_id, p_table_id) -> 'status' as f) m),
    case when btrim(coalesce(p_value, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then btrim(p_value)::uuid end);
$function$;

CREATE OR REPLACE FUNCTION custom._work_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d       jsonb := new.data;
  v_why   text;
  v_kind  text;
  v_until timestamptz;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  if new.data_class = 'work_template' then
    v_why := custom.work_template_refusal(d -> 'graph');
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-70: a template is judged when it is written, not when somebody runs it.';
    end if;
    return new;
  end if;

  if new.data_class = 'work_instantiation' then
    if nullif(d ->> 'template_id', '') is null
       or jsonb_typeof(d -> 'records') is distinct from 'array' then
      raise exception 'a record of an instantiation has to name its template and the records it made'
        using errcode = '23514',
              hint = 'REC-70: the act is logged, and a log that cannot say what it made is not one.';
    end if;
    return new;
  end if;

  if new.table_id is null or new.data_class in ('kernel', 'table', 'field', 'rule', 'relation', 'merge_field') then
    return new;
  end if;

  -- REC-69 — THE ACTION STATES. A move the model forbids is refused, naming both states and
  -- saying where the record CAN go instead. The cheap test is first: this costs a `jsonb ->>`
  -- on every write to the store and a query only on a write that actually moves a status.
  if tg_op = 'UPDATE'
     and nullif(new.data ->> 'status', '') is distinct from nullif(old.data ->> 'status', '')
     and nullif(old.data ->> 'status', '') is not null
     and nullif(new.data ->> 'status', '') is not null then
    -- CHOICE-VALUE. `status` is a choice column and a choice value is the option's own key
    -- now, not the option record's uuid. `custom.work_state_id` turns whatever is stored - the
    -- key, the label, or an id written before that lane - into the state RECORD this model is
    -- expressed in. Six casts in five work functions made the same assumption; all six now ask
    -- this one question.
    v_why := custom.work_transition_refusal(new.organization_id,
                                            custom.work_state_id(new.organization_id, new.table_id,
                                                                 old.data ->> 'status'),
                                            custom.work_state_id(new.organization_id, new.table_id,
                                                                 new.data ->> 'status'));
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-69: the states a record can move to are declared on the state it is in. Change the state records if this organization works differently.';
    end if;
  end if;

  -- A HOLD. Its Table says so; nothing here guesses from a field name.
  select t.data ->> 'work_kind' into v_kind
    from custom.record t
   where t.organization_id = new.organization_id
     and t.id = new.table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_kind is distinct from 'slot' then
    return new;
  end if;

  if nullif(d ->> 'slot_key', '') is null then
    raise exception 'a hold has to say which slot it is on'
      using errcode = '23514', hint = 'REC-71: slot_key is what the unique index keeps single.';
  end if;
  if nullif(d ->> 'holder', '') is null then
    raise exception 'a hold has to say who is holding it'
      using errcode = '23514', hint = 'REC-71: a reservation nobody holds is not a reservation.';
  end if;
  begin
    v_until := (nullif(d ->> 'expires_at', ''))::timestamptz;
  exception when others then
    v_until := null;
  end;
  if v_until is null then
    raise exception 'a hold has to say when it runs out'
      using errcode = '23514',
            hint = 'REC-71: a slot hold is a reservation WITH an expiry - a hold with no expiry would keep the slot forever.';
  end if;
  if tg_op = 'INSERT' and v_until <= now() then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: the expiry is in the future when the hold is taken.';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_list(p_organization_id uuid, p_flavour text DEFAULT 'mine'::text, p_include_finished boolean DEFAULT false, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(record_id uuid, table_id uuid, table_name text, title text, assignee_id uuid, assignee_name text, assignee_user_id uuid, due_on timestamp with time zone, due_state text, status text, terminal boolean, assigned_by uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid;
  v_person uuid;
  v_flav   text := lower(coalesce(nullif(btrim(p_flavour), ''), 'mine'));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_list');
  if v_flav not in ('mine', 'assigned', 'unassigned') then
    raise exception 'There are three work lists: mine, assigned and unassigned, and "%" is none of them.', p_flavour
      using errcode = '22023',
            hint = '`mine` is what is waiting on you, `assigned` is what you gave to other people, `unassigned` is what is waiting on somebody being chosen.';
  end if;
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;
  v_person := custom.work_person(p_organization_id, v_me, false);
  if v_flav = 'mine' and v_person is null then
    return;
  end if;

  return query
    select r.id,
           r.table_id,
           t.data ->> 'name',
           r.data ->> coalesce(t.data ->> 'title_field', 'name'),
           p.id,
           p.data ->> 'name',
           nullif(p.data ->> 'user_id', '')::uuid,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           s.data ->> 'name',
           coalesce((s.data ->> 'terminal')::boolean, false),
           r.updated_by,
           r.updated_at
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id
       and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
      left join custom.record p
        on p.organization_id = r.organization_id
       and p.id = nullif(r.data ->> 'assignee', '')::uuid
       and p.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and r.data_class = 'record'
       and (coalesce(p_include_finished, false)
            or not coalesce((s.data ->> 'terminal')::boolean, false))
       and case v_flav
             when 'mine'       then nullif(r.data ->> 'assignee', '')::uuid = v_person
             when 'unassigned' then nullif(r.data ->> 'assignee', '') is null
                                and r.data ? 'status'
             else                   nullif(r.data ->> 'assignee', '') is not null
                                and nullif(r.data ->> 'assignee', '')::uuid is distinct from v_person
                                and r.updated_by = v_me
           end
       -- THE ONE LADDER, row by row. The candidate set is already narrow (one person's work
       -- inside one organization), so the per-row question is the honest one to ask here.
       and (custom.query_is_store_owner()
            or custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level))
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.updated_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_whose_turn(p_organization_id uuid, p_table_id uuid, p_include_finished boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, title text, assignee_id uuid, turn text, due_on timestamp with time zone, state text, status text, terminal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_whose_turn');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.work_whose_turn');
  v_me   := custom.query_principal();
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  return query execute format($q$
    select r.id,
           r.data ->> coalesce((select t.data ->> 'title_field'
                                  from custom.record t
                                 where t.organization_id = %1$L::uuid
                                   and t.id = %2$L::uuid), 'name'),
           nullif(r.data ->> 'assignee', '')::uuid,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'nobody'
                when p.id is null then 'unassigned'
                else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           s.data ->> 'name',
           coalesce((s.data ->> 'terminal')::boolean, false)
      from custom.record r
      left join custom.record p
        on p.organization_id = r.organization_id
       and p.id = nullif(r.data ->> 'assignee', '')::uuid
       and p.table_id = custom.person_kernel_id()
       and p.deleted_at is null
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is null
       and (%4$L::boolean or not coalesce((s.data ->> 'terminal')::boolean, false))
       and (%3$s)
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.created_at
  $q$, p_organization_id, p_table_id, v_pred, coalesce(p_include_finished, false));
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_record_states(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(state_id uuid, name text, sort integer, terminal boolean, is_current boolean, allowed boolean, refusal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record;
  v_states  uuid;
  v_current uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_record_states');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.work_record_states',
                                        'viewer'::public.permission_level, 'record');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_current := custom.work_state_id(v_row.organization_id, v_row.table_id, v_row.data ->> 'status');

  select f.data #>> '{config,options_table_id}' into v_states
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = v_row.table_id
     and f.data ->> 'key' = 'status'
   limit 1;
  if v_states is null then
    return;
  end if;

  return query
    select s.id,
           s.data ->> 'name',
           coalesce((s.data ->> 'sort')::integer, 0),
           coalesce((s.data ->> 'terminal')::boolean, false),
           s.id = v_current,
           v_current is null
             or s.id = v_current
             or (select c.data -> 'next' ? (s.data ->> 'name')
                   from custom.record c
                  where c.organization_id = p_organization_id and c.id = v_current),
           case when v_current is null or s.id = v_current then null
                else custom.work_transition_refusal(p_organization_id, v_current, s.id) end
      from custom.record s
     where s.organization_id = p_organization_id
       and s.table_id = v_states
       and s.deleted_at is null
     order by coalesce((s.data ->> 'sort')::integer, 0);
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_set_state(p_organization_id uuid, p_record_id uuid, p_state_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record;
  v_from    uuid;
  v_why     text;
  v_version integer;
  v_to      text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_set_state');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.work_set_state',
                                          'editor'::public.permission_level, 'record');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_from := custom.work_state_id(v_row.organization_id, v_row.table_id, v_row.data ->> 'status');

  if p_state_id is not null then
    select s.data ->> 'name' into v_to from custom.record s
     where s.organization_id = p_organization_id and s.id = p_state_id and s.deleted_at is null;
    if v_to is null then
      raise exception 'That is not a state of this table, so nothing was moved.'
        using errcode = '23503',
              hint = 'REC-69: the states live as records of the table''s own workflow-state table. Ask for them with custom.work_record_states.';
    end if;
  end if;

  if v_from is not null and p_state_id is not null then
    v_why := custom.work_transition_refusal(p_organization_id, v_from, p_state_id);
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-69: the states a record can move to are declared on the state it is in. Change the state records if this organization works differently.';
    end if;
  end if;

  v_version := custom.record_update(p_organization_id, p_record_id,
                                    jsonb_build_object('status',
                                      case when p_state_id is null then null else p_state_id::text end),
                                    null);
  return jsonb_build_object(
    'record_id', p_record_id,
    'from',      v_from,
    'to',        p_state_id,
    'state',     v_to,
    'version',   v_version,
    'message',   case when p_state_id is null then 'This has no state now.'
                      else format('Moved to %s.', v_to) end);
end
$function$;
