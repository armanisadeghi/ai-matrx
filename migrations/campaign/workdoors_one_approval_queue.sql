-- chair-step: it GRANTS EXECUTE to `authenticated` on six NEW functions of schema `custom` and
--   attaches ONE new row trigger to `custom.record`. The grant is the one shape this runner's
--   allow-list refuses by name, and it is the point of the file: without it there is no queue a
--   person can reach. Every one of the six is SECURITY DEFINER and asks the one ladder first;
--   the two that write ask `custom.assert_store_door` before anything else, so the OFF switch
--   still closes them. The trigger only ever looks at rows whose `data_class` is
--   `work_approval` — a class that did not exist before this file — and returns NEW on its
--   first line for every other write to the store, so it changes nothing about any existing
--   record. Nothing is dropped, nothing is revoked, no existing function is replaced and no row
--   of any feature is deleted or rewritten. The inverse is
--   `migrations/inverse/workdoors_one_approval_queue_down.sql`.
-- guard: custom/system_enabled
--
-- WORK-DOORS — ONE APPROVAL QUEUE, FOR PEOPLE AND FOR AGENTS.
--
-- PRODUCTS.md row 6, Approvals & assignments: *"One inbox holds human approvals AND the
-- agent's field/table proposals — the same queue, the same right to approve."* Measured on
-- the main database 2026-09-20, it was two things and neither was a queue:
--
--   * A PERSON had no way to ask for approval at all. `custom.record_update` either writes
--     or refuses; "I want to change this price, but somebody has to say yes" had nowhere to
--     live.
--   * AN AGENT's wait existed only in the tool result. `matrx_records`'s `field_propose`
--     answers `awaiting_approval: true` with the change, the reason and the approvers — and
--     writes NOTHING. So the only person who could ever act on it was whoever happened to be
--     reading that conversation at that moment, and only until they closed it. A wait nobody
--     can find is a dead end, which the platform's fourth law forbids.
--
-- THE SHAPE. An approval is a RECORD of this store (`data_class = 'work_approval'`,
-- `table_id` null — the same shape `work_template` and `work_instantiation` already use), so
-- it inherits the organization wall, the history capture, the soft delete and the retention
-- rule without a second table to drift. Its document:
--
--   subject_id, subject_kind    what the change is about (a record, or a Table)
--   change {kind, ...}          `record_patch` (a patch for custom.record_update) or
--                               `field_add` (the declaration custom.field_propose produced)
--   origin                      'person' | 'agent'
--   requested_by, requested_at, note, approver_id, conversation_id
--   state                       'pending' | 'approved' | 'declined'
--   decided_by, decided_at, decision_note, outcome
--
-- WHO MAY DECIDE, and it is ONE query in ONE place (`custom.work_approval_approvers`), asked
-- by the filing door, by the deciding door and by the inbox, so the list a person is shown
-- and the list the store enforces cannot differ:
--   · the named approver, if the request named one;
--   · anybody at ADMIN on the subject (AGT-4: "the approvers of a proposal are the admins on
--     that table, resolved as a query" — here generalised to any subject);
--   · an owner or admin of the organization.
-- The requester may NOT approve their own request unless they are the only one who could —
-- and in that case the request would never have been needed, so it is refused by name.
--
-- APPROVING APPLIES THE CHANGE. Not "marks it approved and hopes somebody re-runs it": the
-- decision and the write are one transaction, through the store's own doors, as the person
-- who approved. A `field_add` is the two writes the unattended path makes, in that order,
-- because `custom._field_shape_guard` refuses a definition for a key the Table never declared.
--
-- THE INVERSE: `migrations/inverse/workdoors_one_approval_queue_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── who may decide, asked once ───────────────────────────────────────────────────────────
create or replace function custom.work_approval_approvers(p_organization_id uuid, p_subject_id uuid,
                                               p_approver_id uuid default null)
returns table (user_id uuid, name text, why text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  return query
  select m.user_id,
         coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1))::text,
         case when m.user_id = p_approver_id then 'Asked for by name'
              when custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record')
                   = 'admin'::public.permission_level then 'Admin on this'
              else 'Owner or admin of this organization' end
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and (m.user_id = p_approver_id
          or custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record')
             = 'admin'::public.permission_level
          or public.is_org_admin_for(m.user_id, p_organization_id))
   order by 3, 2;
end
$$;

comment on function custom.work_approval_approvers(uuid, uuid, uuid) is
  'AGT-4: who may decide this — the named approver, the admins on the subject, and the '
  'organization''s own owners and admins. ONE query, asked by the filing door, the deciding '
  'door and the inbox, so what a person is shown and what the store enforces are the same list.';

-- ── file a request ───────────────────────────────────────────────────────────────────────
-- THE THRESHOLD TO ASK IS `viewer`, deliberately. The whole product is "this change needs
-- somebody else's yes" — a person who could already write it would not be here, and a person
-- who may see the row is entitled to propose a change to it. What they may not do is DECIDE.
create or replace function custom.work_approval_request(p_organization_id uuid, p_subject_id uuid,
                                             p_change jsonb, p_note text default null,
                                             p_approver_id uuid default null,
                                             p_origin text default 'person',
                                             p_conversation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_kind    text := lower(coalesce(p_change ->> 'kind', ''));
  v_origin  text := lower(coalesce(nullif(btrim(p_origin), ''), 'person'));
  v_me      uuid := custom.query_principal();
  v_subject custom.record;
  v_word    text;
  v_id      uuid;
  v_who     jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
  perform custom.assert_client_may_open(p_organization_id, p_subject_id,
                                        'custom.work_approval_request',
                                        'viewer'::public.permission_level, 'record');

  if v_origin not in ('person', 'agent') then
    raise exception 'An approval comes from a person or from an agent, and "%" is neither.', p_origin
      using errcode = '22023';
  end if;
  if v_kind not in ('record_patch', 'field_add') then
    raise exception 'This store can hold two kinds of pending change: a change to a record''s values, and a new column on a table. It was asked to hold "%".',
                    coalesce(nullif(p_change ->> 'kind', ''), 'nothing')
      using errcode = '22023',
            hint = 'Send {"kind":"record_patch","patch":{...}} or {"kind":"field_add","field":{...}}. Anything else would be a change nobody could apply when they approved it.';
  end if;
  if v_kind = 'record_patch'
     and (jsonb_typeof(p_change -> 'patch') is distinct from 'object'
          or p_change -> 'patch' = '{}'::jsonb) then
    raise exception 'A change waiting for approval has to say what it would change.'
      using errcode = '22004';
  end if;
  if v_kind = 'field_add' and jsonb_typeof(p_change -> 'field') is distinct from 'object' then
    raise exception 'A new column waiting for approval has to carry the column it would add.'
      using errcode = '22004';
  end if;

  select r.* into v_subject from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is null;
  if v_subject.id is null then
    raise exception 'There is no such record in this organization, so there is nothing to approve.'
      using errcode = '02000';
  end if;
  v_word := case when v_subject.table_id = custom.table_kernel_id() then 'table' else 'record' end;
  if v_kind = 'field_add' and v_word <> 'table' then
    raise exception 'A new column is added to a table, and this is a %.', v_word
      using errcode = '22023';
  end if;

  if p_approver_id is not null
     and not exists (select 1 from iam.organization_member m
                      where m.organization_id = p_organization_id and m.user_id = p_approver_id) then
    raise exception 'That person is not in this organization, so they cannot be asked to approve anything here.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name, 'why', a.why)), '[]'::jsonb)
    into v_who
    from custom.work_approval_approvers(p_organization_id, p_subject_id, p_approver_id) a;

  if jsonb_array_length(v_who) = 0 then
    raise exception 'Nobody in this organization could approve that, so asking would leave it waiting forever.'
      using errcode = '42501',
            hint = 'Name an approver, or ask an owner of the organization to give somebody admin on it. A request nobody can answer is worse than no request.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_approval', jsonb_strip_nulls(jsonb_build_object(
    'subject_id',      p_subject_id::text,
    'subject_kind',    v_word,
    'subject_table_id', v_subject.table_id::text,
    'subject_title',   coalesce(v_subject.data ->> 'name', v_subject.data ->> 'title'),
    'change',          p_change,
    'origin',          v_origin,
    'note',            nullif(btrim(coalesce(p_note, '')), ''),
    'approver_id',     p_approver_id::text,
    'conversation_id', p_conversation_id::text,
    'requested_by',    v_me::text,
    'requested_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'state',           'pending')))
  returning id into v_id;

  -- THE APPROVERS CAN OPEN WHAT THEY ARE BEING ASKED ABOUT. Without this the queue would
  -- hand somebody a decision and refuse them the row it is about.
  if p_approver_id is not null and not custom.query_is_store_owner() then
    perform custom.share_grant(p_organization_id, v_id, 'person', p_approver_id,
                               'admin'::public.permission_level);
  end if;

  return jsonb_build_object(
    'approval_id', v_id,
    'state',       'pending',
    'subject_id',  p_subject_id,
    'subject_kind', v_word,
    'origin',      v_origin,
    'approvers',   v_who,
    'message',     format('This is waiting for %s.',
                     case when jsonb_array_length(v_who) = 1
                          then coalesce(v_who -> 0 ->> 'name', 'somebody')
                          else format('%s people who can approve it', jsonb_array_length(v_who)) end));
end
$$;

-- ── may I decide this one? ───────────────────────────────────────────────────────────────
create or replace function custom.work_approval_may_decide(p_organization_id uuid, p_approval_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me  uuid := custom.query_principal();
  v_row custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_may_decide');
  if custom.query_is_store_owner() then
    return true;
  end if;
  if v_me is null then
    return false;
  end if;
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    return false;
  end if;
  return exists (select 1
                   from custom.work_approval_approvers(p_organization_id,
                          nullif(v_row.data ->> 'subject_id', '')::uuid,
                          nullif(v_row.data ->> 'approver_id', '')::uuid) a
                  where a.user_id = v_me);
end
$$;

-- ── decide, and APPLY ────────────────────────────────────────────────────────────────────
create or replace function custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid,
                                            p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me      uuid := custom.query_principal();
  v_row     custom.record;
  v_change  jsonb;
  v_kind    text;
  v_subject uuid;
  v_outcome text;
  v_key     text;
  v_fields  jsonb;
  v_spec    jsonb;
  v_field   uuid;
  v_version integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  if coalesce(v_row.data ->> 'state', 'pending') <> 'pending' then
    raise exception 'That was already %, on %.', v_row.data ->> 'state',
                    coalesce(v_row.data ->> 'decided_at', 'an earlier day')
      using errcode = '23505',
            hint = 'An approval is decided once. Ask for the change again if it still needs making.';
  end if;

  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'You are not one of the people who can approve this.'
      using errcode = '42501',
            hint = 'AGT-4: an approval is decided by the person it was addressed to, by anybody with admin on the thing being changed, or by an owner or admin of this organization. Ask one of them.';
  end if;
  if v_me is not null and nullif(v_row.data ->> 'requested_by', '')::uuid = v_me
     and not custom.query_is_store_owner() then
    raise exception 'You asked for this change, so somebody else approves it.'
      using errcode = '42501',
            hint = 'The point of asking is that a second person says yes. If nobody else needs to, make the change directly instead.';
  end if;

  v_subject := nullif(v_row.data ->> 'subject_id', '')::uuid;
  v_change  := v_row.data -> 'change';
  v_kind    := lower(coalesce(v_change ->> 'kind', ''));

  if p_approve then
    if v_kind = 'record_patch' then
      -- AS THE PERSON WHO APPROVED, through the store's own door: their level decides, their
      -- name goes on the history row, and every validator runs. `zzz_history_capture` files
      -- it inside this same transaction as the decision below.
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      v_outcome := format('Applied. %s is now at version %s.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'), v_version);
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
      -- THE TABLE DECLARES THE KEY FIRST. `custom._field_shape_guard` refuses a definition
      -- for a field the Table never declared, and it is right to — so this is the same two
      -- writes, in the same order, the unattended path makes.
      select coalesce(r.data -> 'fields', '[]'::jsonb) into v_fields from custom.record r
       where r.organization_id = p_organization_id and r.id = v_subject;
      if not exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key) then
        perform custom.record_update(p_organization_id, v_subject,
                 jsonb_build_object('fields', v_fields || jsonb_build_array(jsonb_build_object('name', v_key))),
                 null);
      end if;
      v_field := custom.field_declare(p_organization_id, v_subject,
                   v_spec || jsonb_build_object('key', v_key));
      v_outcome := format('%s is now a column on %s.',
                          coalesce(nullif(v_spec ->> 'label', ''), v_key),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    end if;
  else
    v_outcome := case when v_kind = 'field_add'
                      then format('The column %s was not added.',
                                  coalesce(nullif(v_change #>> '{field,label}', ''),
                                           nullif(v_change #>> '{field,key}', ''), 'asked for'))
                      else format('%s was left as it was.',
                                  coalesce(v_row.data ->> 'subject_title', 'That record')) end;
  end if;

  -- THE DECISION, in the same transaction as what it did.
  update custom.record r
     set data = r.data || jsonb_strip_nulls(jsonb_build_object(
           'state',         case when p_approve then 'approved' else 'declined' end,
           'decided_by',    v_me::text,
           'decided_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'decision_note', nullif(btrim(coalesce(p_note, '')), ''),
           'applied_field_id', v_field::text,
           'outcome',       v_outcome))
   where r.organization_id = p_organization_id and r.id = p_approval_id;

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'state',       case when p_approve then 'approved' else 'declined' end,
    'subject_id',  v_subject,
    'applied',     coalesce(p_approve, false),
    'field_id',    v_field,
    'version',     v_version,
    'message',     v_outcome);
end
$$;

-- ── the ONE inbox ────────────────────────────────────────────────────────────────────────
-- Assignments, approvals and the agent's proposals in ONE ordered list with ONE row shape,
-- because ServiceNow's worklist is the bar and a queue per origin is what it beat.
create or replace function custom.work_inbox(p_organization_id uuid, p_limit integer default 50,
                                  p_offset integer default 0,
                                  p_include_decided boolean default false)
returns table (item_id uuid, kind text, origin text, title text, subject_id uuid,
               subject_kind text, summary text, state text, due_on timestamptz,
               due_state text, actionable boolean, requested_by uuid, requested_by_name text,
               at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_at
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       and custom.work_approval_may_decide(p_organization_id, r.id)
  )
  select a.id,
         case when coalesce(a.d ->> 'origin', 'person') = 'agent' then 'proposal' else 'approval' end,
         coalesce(a.d ->> 'origin', 'person'),
         case when (a.d -> 'change') ->> 'kind' = 'field_add'
              then format('Add %s to %s',
                          coalesce(nullif(a.d #>> '{change,field,label}', ''),
                                   nullif(a.d #>> '{change,field,key}', ''), 'a column'),
                          coalesce(a.d ->> 'subject_title', 'a table'))
              else format('Change %s', coalesce(a.d ->> 'subject_title', 'a record')) end,
         nullif(a.d ->> 'subject_id', '')::uuid,
         coalesce(a.d ->> 'subject_kind', 'record'),
         coalesce(nullif(a.d ->> 'note', ''),
                  case when (a.d -> 'change') ->> 'kind' = 'field_add'
                       then 'A new column on a table that already existed.'
                       else (select string_agg(k, ', ' order by k)
                               from jsonb_object_keys(a.d #> '{change,patch}') k) end),
         coalesce(a.d ->> 'state', 'pending'),
         null::timestamptz,
         null::text,
         coalesce(a.d ->> 'state', 'pending') = 'pending',
         nullif(a.d ->> 'requested_by', '')::uuid,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = nullif(a.d ->> 'requested_by', '')::uuid),
         a.created_at
    from approvals a
  union all
  select w.record_id, 'assignment', 'person',
         coalesce(w.title, 'Untitled'), w.record_id, 'record',
         format('%s · %s', coalesce(w.table_name, 'a table'), coalesce(w.status, 'no state')),
         coalesce(w.status, 'open'), w.due_on, w.due_state, true,
         w.assigned_by,
         (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                          nullif(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1))::text
            from auth.users u where u.id = w.assigned_by),
         w.updated_at
    from custom.work_list(p_organization_id, 'mine', coalesce(p_include_decided, false), 500, 0) w
   order by 11 desc, 8 nulls last, 14 desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

comment on function custom.work_inbox(uuid, integer, integer, boolean) is
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my '
  'approval, and the agent''s proposals — the same queue and the same right to approve.';

create or replace function custom.work_approval_read(p_organization_id uuid, p_approval_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row custom.record;
  v_who jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_read');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  if not custom.work_approval_may_decide(p_organization_id, p_approval_id)
     and nullif(v_row.data ->> 'requested_by', '')::uuid is distinct from custom.query_principal() then
    raise exception 'That approval was not addressed to you and you did not ask for it, so there is nothing to show you.'
      using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name, 'why', a.why)), '[]'::jsonb)
    into v_who
    from custom.work_approval_approvers(p_organization_id,
           nullif(v_row.data ->> 'subject_id', '')::uuid,
           nullif(v_row.data ->> 'approver_id', '')::uuid) a;
  return v_row.data
         || jsonb_build_object('approval_id', p_approval_id,
                               'approvers', v_who,
                               'may_decide', custom.work_approval_may_decide(p_organization_id, p_approval_id));
end
$$;

-- ── the shape guard: on the table, where every writer meets it ───────────────────────────
-- A shape enforced only inside the verbs above would be a safe path beside an unsafe one.
create or replace function custom._workdoors_approval_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare d jsonb := new.data;
begin
  if new.data_class is distinct from 'work_approval' then
    return new;
  end if;
  perform custom.assert_store_door(new.organization_id, 'custom.record');
  if nullif(d ->> 'subject_id', '') is null then
    raise exception 'an approval has to say what it is about'
      using errcode = '23514', hint = 'A decision with no subject is a decision nobody could apply.';
  end if;
  if lower(coalesce(d #>> '{change,kind}', '')) not in ('record_patch', 'field_add') then
    raise exception 'an approval has to carry a change somebody could actually apply'
      using errcode = '23514',
            hint = 'record_patch or field_add. Anything else would be approved and then do nothing.';
  end if;
  if lower(coalesce(d ->> 'state', '')) not in ('pending', 'approved', 'declined') then
    raise exception 'an approval is pending, approved or declined, and this one says %',
                    coalesce(nullif(d ->> 'state', ''), 'nothing')
      using errcode = '23514';
  end if;
  if lower(coalesce(d ->> 'state', '')) <> 'pending' and nullif(d ->> 'decided_at', '') is null then
    raise exception 'a decided approval has to say when it was decided'
      using errcode = '23514', hint = 'Otherwise the queue cannot tell a fresh decision from an old one.';
  end if;
  return new;
end
$$;

create or replace trigger zz_workdoors_approval_guard
  before insert or update on custom.record
  for each row execute function custom._workdoors_approval_guard();

-- THE DOOR ROWS COME FIRST, AND THE ORDER IS LOAD-BEARING. Measured on this database at
-- 04:18Z on 2026-09-20: `platform.enforce_definer_client_grants` fires ON THE GRANT, and a
-- SECURITY DEFINER function in a schema declared closed that holds no
-- `platform.client_callable_door` row has its client EXECUTE taken straight back — inside
-- the same transaction, with the run still reporting success. Declare, then grant.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false, 'migrations/campaign/workdoors_one_approval_queue.sql (lane WORK-DOORS)',
       v.why
  from (values
    ('work_approval_approvers',
     'AGT-4''s "who may approve this", resolved as a query over the admins on the subject plus the organization''s own admins plus anybody named. One list, asked by the filing door, the deciding door and the inbox, so what a person is shown is what the store enforces.'),
    ('work_approval_request',
     'Asks for a change rather than making it — a price change, a discount, a new column. Viewer on the subject is enough to ASK, because the whole point is that somebody else says yes; deciding takes admin. Refuses out loud if nobody in the organization could ever answer it.'),
    ('work_approval_may_decide',
     'Whether this person is one of the people who can decide this particular request, so a screen shows an inert row instead of an Approve button that fails.'),
    ('work_approval_decide',
     'Approve or decline — and approving APPLIES the change, through the store''s own doors, as the person who approved, in the same transaction as the decision. The requester cannot approve their own request.'),
    ('work_approval_read',
     'One waiting change in full: what it would do, who asked, who can decide and whether you are one of them. Readable by the people who can decide it and by the person who asked.'),
    ('work_inbox',
     'THE one inbox: what is assigned to me, what is waiting on my approval, and the agent''s proposals, in one ordered list with one row shape. The agent''s wait and a colleague''s request are the same queue with the same right to approve.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.work_approval_approvers(uuid, uuid, uuid) to authenticated;
grant execute on function custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) to authenticated;
grant execute on function custom.work_approval_may_decide(uuid, uuid) to authenticated;
grant execute on function custom.work_approval_decide(uuid, uuid, boolean, text) to authenticated;
grant execute on function custom.work_approval_read(uuid, uuid) to authenticated;
grant execute on function custom.work_inbox(uuid, integer, integer, boolean) to authenticated;
