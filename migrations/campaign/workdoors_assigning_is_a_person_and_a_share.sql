-- chair-step: it GRANTS EXECUTE to `authenticated` on five NEW functions of schema `custom`.
--   A GRANT is the one shape this runner's allow-list refuses by name, and it is the point of
--   the file: without it the work layer has no way to say who a record belongs to. Every one of
--   the five is SECURITY DEFINER and asks the one ladder first — the organization wall, then
--   editor on the row being handed over or viewer on the row being read. Nothing is dropped,
--   nothing is revoked, no existing function is replaced and no row of any feature is deleted
--   or rewritten. The inverse is
--   `migrations/inverse/workdoors_assigning_is_a_person_and_a_share_down.sql`.
-- guard: custom/system_enabled
--
-- WORK-DOORS — ASSIGNING SOMETHING TO SOMEBODY IS TWO FACTS, NOT ONE.
--
-- REC-69 gave every Table an `assignee` Field pointing at the person kernel. Measured on the
-- main database 2026-09-20: the person kernel holds ZERO records carrying a `user_id`, and
-- no Field definitions at all. So `assignee` was a label with a name on it: there was no way
-- to go from "assigned to Dana" to the signed-in person Dana, and therefore no "my work" and
-- no way for Dana to open the thing she had been handed.
--
-- THE CLASS, not the instance: an assignment that does not also GIVE ACCESS is the platform's
-- fourth law broken in the quietest possible way — a person sees a row in her inbox, clicks
-- it and is told she does not have access to it. So `custom.work_assign` does both, in one
-- transaction:
--
--   1. resolves (organization, user) to ONE canonical person-kernel record, creating it the
--      first time and never twice;
--   2. writes `assignee` (and `due_date` when given) through the store's own update door,
--      so the value carries its envelope and `zzz_history_capture` files the change;
--   3. shares the record with that person at EDITOR through `custom.share_grant`, the one
--      grant path — so the ladder that decides every other door decides this one too.
--
-- Un-assigning is the same act backwards, minus the revoke: taking a name off a row is not a
-- reason to take away access somebody may have been given for another reason entirely. It
-- SAYS SO in its answer rather than doing something surprising.
--
-- AND THE TWO LISTS THAT MAKE IT A PRODUCT: "my work" and "work I assigned", across every
-- Table in the organization, with visibility respected row by row. Both are keyed on the
-- person record, so they cost one lookup plus a scan of this organization's own partition.
--
-- THE INVERSE: `migrations/inverse/workdoors_assigning_is_a_person_and_a_share_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the person, resolved once and only once ──────────────────────────────────────────────
-- THE MEMBERSHIP IS THE TRUTH. A person who is not a member of this organization cannot be
-- given work in it; `custom.share_grant` refuses that too (VIS-31), and refusing it HERE
-- means the refusal names assigning rather than sharing.
create function custom.work_person(p_organization_id uuid, p_user_id uuid, p_create boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id   uuid;
  v_name text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_person');
  if p_user_id is null then
    return null;
  end if;

  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.person_kernel_id()
     and r.deleted_at is null
     and nullif(r.data ->> 'user_id', '')::uuid = p_user_id
   order by r.created_at
   limit 1;
  if v_id is not null or not coalesce(p_create, true) then
    return v_id;
  end if;

  if not exists (select 1 from iam.organization_member m
                  where m.organization_id = p_organization_id and m.user_id = p_user_id) then
    raise exception 'That person is not in this organization, so work here cannot be given to them.'
      using errcode = '42501',
            hint = 'Invite them to the organization first. VIS-31: somebody with no membership here is the external-principal lane, and it is not open.';
  end if;

  -- The name a person is KNOWN BY, read exactly the way `custom.share_people` reads it, so
  -- the picker and the assignment cannot disagree about who somebody is.
  select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  nullif(split_part(u.email::text, '@', 1), ''),
                  p_user_id::text)
    into v_name
    from auth.users u
   where u.id = p_user_id;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.person_kernel_id(), 'record',
          jsonb_build_object('name', coalesce(v_name, p_user_id::text),
                             'user_id', p_user_id::text))
  returning id into v_id;
  return v_id;
end
$$;

comment on function custom.work_person(uuid, uuid, boolean) is
  'REC-69: the ONE person-kernel record that stands for a signed-in person inside one '
  'organization''s store. Created on first use, never twice, and only for somebody who is '
  'actually a member.';

-- ── assign ───────────────────────────────────────────────────────────────────────────────
create function custom.work_assign(p_organization_id uuid, p_record_id uuid,
                                   p_assignee_user_id uuid,
                                   p_due_date timestamptz default null,
                                   p_clear_due boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_person  uuid;
  v_was     uuid;
  v_patch   jsonb := '{}'::jsonb;
  v_share   jsonb;
  v_name    text;
  v_row     custom.record;
  v_version integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_assign');
  -- Handing a row to somebody is a CHANGE to that row, so it asks the rung a change asks.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.work_assign',
                                          'editor'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization, so it cannot be assigned.'
      using errcode = '02000';
  end if;
  if not custom.work_has_assignment(p_organization_id, v_row.table_id) then
    raise exception 'This table does not do assignments yet, so nobody can be given one of its records.'
      using errcode = '0A000',
            hint = 'REC-69: turn assignments on for the table first — that adds Assignee, Due date and Status as real columns. An admin of the table does it in one step.';
  end if;

  v_was := nullif(v_row.data ->> 'assignee', '')::uuid;

  if p_assignee_user_id is null then
    v_patch := jsonb_build_object('assignee', null);
  else
    v_person := custom.work_person(p_organization_id, p_assignee_user_id, true);
    v_patch := jsonb_build_object('assignee', v_person::text);
  end if;

  if p_clear_due then
    v_patch := v_patch || jsonb_build_object('due_date', null);
  elsif p_due_date is not null then
    v_patch := v_patch || jsonb_build_object(
      'due_date', to_char(p_due_date at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- THROUGH THE STORE'S OWN UPDATE DOOR, so the value carries its envelope, the validators
  -- run, and `zzz_history_capture` files this change in the SAME transaction as the share.
  v_version := custom.record_update(p_organization_id, p_record_id, v_patch, null);

  if p_assignee_user_id is not null then
    -- AND THE ACCESS. An assignment that did not give access would put a row in somebody's
    -- inbox that they are refused when they click it.
    v_share := custom.share_grant(p_organization_id, p_record_id, 'person', p_assignee_user_id,
                                  'editor'::public.permission_level);
    select r.data ->> 'name' into v_name from custom.record r
     where r.organization_id = p_organization_id and r.id = v_person;
  end if;

  return jsonb_build_object(
    'record_id',   p_record_id,
    'assigned',    p_assignee_user_id is not null,
    'assignee',    v_person,
    'assignee_user_id', p_assignee_user_id,
    'assignee_name', v_name,
    'was',         v_was,
    'due_date',    case when p_clear_due then null else p_due_date end,
    'version',     v_version,
    'access',      coalesce(v_share -> 'message', to_jsonb(
                     'Nobody holds this now. Whatever access was already given stays as it was — '
                     'taking a name off a row is not a reason to take somebody''s access away.'::text)),
    'message',     case when p_assignee_user_id is null
                        then 'Nobody is assigned to this now.'
                        else format('%s has this now, and can edit it.', coalesce(v_name, 'That person')) end);
end
$$;

comment on function custom.work_assign(uuid, uuid, uuid, timestamptz, boolean) is
  'REC-69: give one record to one person — the Assignee value AND editor access, in one '
  'transaction, through the store''s own doors.';

-- ── the states a record can actually be moved to, and the move itself ────────────────────
create function custom.work_record_states(p_organization_id uuid, p_record_id uuid)
returns table (state_id uuid, name text, sort integer, terminal boolean,
               is_current boolean, allowed boolean, refusal text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row     custom.record;
  v_states  uuid;
  v_current uuid;
begin
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.work_record_states',
                                        'viewer'::public.permission_level, 'record');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_current := nullif(v_row.data ->> 'status', '')::uuid;

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
$$;

-- THE MOVE. The trigger `zz_w3_work_shape_guard` is what actually refuses an illegal move —
-- this door asks first so that a screen can say WHY before it acts, and the store still says
-- no if anything raced it.
create function custom.work_set_state(p_organization_id uuid, p_record_id uuid, p_state_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
  v_from := nullif(v_row.data ->> 'status', '')::uuid;

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
$$;

-- ── the two lists ────────────────────────────────────────────────────────────────────────
-- ONE shape for both, so a screen renders one row component. `flavour` says which list a row
-- came from, because the inbox shows them together.
create function custom.work_list(p_organization_id uuid, p_flavour text default 'mine',
                                 p_include_finished boolean default false,
                                 p_limit integer default 100, p_offset integer default 0)
returns table (record_id uuid, table_id uuid, table_name text, title text,
               assignee_id uuid, assignee_name text, assignee_user_id uuid,
               due_on timestamptz, due_state text, status text, terminal boolean,
               assigned_by uuid, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
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
       and s.id = nullif(r.data ->> 'status', '')::uuid
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
$$;

comment on function custom.work_list(uuid, text, boolean, integer, integer) is
  'REC-69: "my work" and "work I assigned", across every Table in one organization, every '
  'row decided by the one ladder.';

-- THE DOOR ROWS COME FIRST, AND THE ORDER IS LOAD-BEARING. Measured on this database at
-- 04:18Z on 2026-09-20: `platform.enforce_definer_client_grants` fires ON THE GRANT, and a
-- SECURITY DEFINER function in a schema declared closed that holds no
-- `platform.client_callable_door` row has its client EXECUTE taken straight back — inside
-- the same transaction, with the run still reporting success. Declare, then grant.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false, 'migrations/campaign/workdoors_assigning_is_a_person_and_a_share.sql (lane WORK-DOORS)',
       v.why
  from (values
    ('work_person',
     'The one person-kernel record that stands for a signed-in person inside this organization''s store, created on first use and never twice. It is what makes "assigned to Dana" and "Dana, signed in" the same fact; it answers for a member of this organization only.'),
    ('work_assign',
     'Gives one record to one person: the Assignee value through the store''s own update door AND editor access through the one grant path, in one transaction. An assignment without access would put a row in somebody''s inbox that they are refused when they open it.'),
    ('work_record_states',
     'Every state this record''s table declares, which one it is in, and which moves the workflow model allows from here — with the refusal sentence for each one it does not. A screen offers the real moves instead of a control that fails.'),
    ('work_set_state',
     'Moves one record along the declared states. Asks the model first so a person is told why before anything happens, and the store''s own trigger still refuses an illegal move if anything raced it.'),
    ('work_list',
     '"My work", "work I assigned" and "waiting on somebody being chosen", across every Table in this organization, ordered by what is overdue. Every row is decided by the one ladder, so this never shows work somebody may not open.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.work_person(uuid, uuid, boolean) to authenticated;
grant execute on function custom.work_assign(uuid, uuid, uuid, timestamptz, boolean) to authenticated;
grant execute on function custom.work_record_states(uuid, uuid) to authenticated;
grant execute on function custom.work_set_state(uuid, uuid, uuid) to authenticated;
grant execute on function custom.work_list(uuid, text, boolean, integer, integer) to authenticated;
