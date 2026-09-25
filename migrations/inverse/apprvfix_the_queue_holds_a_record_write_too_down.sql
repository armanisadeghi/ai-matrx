-- target: branch
--
-- THE INVERSE of `migrations/campaign/apprvfix_the_queue_holds_a_record_write_too.sql`
-- (§4.13, rule 27). It restores the three bodies exactly as
-- `migrations/campaign/workdoors_one_approval_queue.sql` wrote them hours earlier: the shape
-- guard that knew two kinds, the filing door that knew two kinds, and the deciding door whose
-- second-pair-of-eyes bar did not read `origin`. Nothing is dropped and no approval row is
-- touched — a `record_add` row already filed would simply become one the guard refuses to
-- rewrite, which is the honest consequence of taking the kind away.
--
-- `-- target: branch` like every other inverse here: rule 9.

set lock_timeout = '2s';
set statement_timeout = '600s';

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
