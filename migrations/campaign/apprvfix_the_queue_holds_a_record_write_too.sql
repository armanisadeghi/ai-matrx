-- additive: yes
--   It REPLACES three functions and one trigger function of schema `custom` that
--   `workdoors_one_approval_queue.sql` created hours ago, and adds nothing else. Every
--   replacement keeps the existing signature, the existing security, the existing search_path
--   and every existing branch; what changes is that a THIRD kind of pending change
--   (`record_add`) is accepted where two were, and that an approval an AGENT asked for may be
--   decided by the person it was asked on behalf of. No table, column, policy or grant is
--   touched; no row is deleted or rewritten; the two existing kinds behave exactly as before.
--   The inverse is `migrations/inverse/apprvfix_the_queue_holds_a_record_write_too_down.sql`,
--   which restores the three bodies as `workdoors_one_approval_queue.sql` wrote them.
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE — the file is production-only and
--   judged by the deny-list, which is the shape this change actually is. A `-- guard:` header
--   declares that a file's NEW served code is held off by a knob, and the runner rightly
--   refuses a replacement whose body never NAMES that knob: a guard the body does not read is
--   a comment. This file adds no served surface. It replaces three bodies that already open
--   with `custom.assert_store_door(…)` — which IS the OFF switch — and leaves that first line
--   of each untouched, so the switch still closes every one of them. Writing a header this
--   file cannot honour, or duplicating the switch in the body to satisfy a text search, would
--   both be worse than saying plainly which judgement it is under.
-- based-on: custom._workdoors_approval_guard() 3d44132c6ab0ac8681cd58d3748b7bda2f54412cff340097a3f4905c921153ed
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) c58bbd0a4986af42e77d71b79d13b8304ffeab144560015c0c036e239d7fa27b
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) 1ff67ade0d4aaf80e668a42725f784dbf21080f7347d4343bd6e488cba08a20d
--
-- APPROVAL-FIX — THE THING AN AGENT ACTUALLY DOES ALL DAY IS WRITE A ROW.
--
-- The seventh verification pass, 2026-09-19, ran a blank agent against the deployed server
-- with the organization on its default `ask`, and found the rule half-applied: adding a
-- COLUMN to a table that already existed waited for a person, and adding a RECORD to that
-- same table went straight through, unasked. The setting a person reads as "ask before an
-- agent changes my tables" does not distinguish a column from twenty new rows, and nothing on
-- any screen said it did. `custom.agent_change_approval` was always the whole decision — it
-- answers about a TABLE, not about a kind of change — so the defect was never in the policy.
-- It was that the record-writing path never asked it, and that the queue it would have had to
-- file into could not hold a record write.
--
-- WHAT THIS FILE ADDS, and it is one word in three places: `record_add`.
--
--   change = {"kind": "record_add", "rows": [ {...}, {...} ]}   subject = the TABLE
--
-- It is the one kind `custom.work_approval_request` could not express. `record_patch` changes
-- a record that exists, and its subject is that record; `field_add` adds a column, and its
-- subject is the table. Creating rows in a table is the third, and its subject is the table
-- too — so `work_approval_decide` applies it through `custom.record_write`, once per row, in
-- the decision's own transaction, as the person who approved. Same door, every guard, every
-- validator, the approver's name on each history row. A batch is all-or-nothing, which is
-- also what a person means when they say yes to twenty rows.
--
-- AND ONE FIX TO A BAR THAT WAS RIGHT FOR PEOPLE AND WRONG FOR AGENTS. The queue refuses to
-- let a requester decide their own request, which is exactly right when a PERSON asks: the
-- whole product is that somebody else says yes. But the store runs an agent's every call as
-- the person it is working for, so an agent's request is filed with that person as
-- `requested_by` — and the bar then refused the one person in the world the organization's
-- setting means to ask. `ask` says "a person is asked before an AGENT changes this", not "two
-- people". So the bar now reads `origin`: it holds for a request a person made, and lifts for
-- one an agent made. Nothing else about who may decide changes — `work_approval_may_decide`
-- still has the final word, and an agent's request is still decided only by an approver.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the shape guard: three kinds, not two ────────────────────────────────────────────────
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
  if lower(coalesce(d #>> '{change,kind}', '')) not in ('record_patch', 'record_add', 'field_add') then
    raise exception 'an approval has to carry a change somebody could actually apply'
      using errcode = '23514',
            hint = 'record_patch, record_add or field_add. Anything else would be approved and then do nothing.';
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

-- ── file a request ───────────────────────────────────────────────────────────────────────
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
  if v_kind not in ('record_patch', 'record_add', 'field_add') then
    raise exception 'This store can hold three kinds of pending change: a change to a record''s values, new records in a table, and a new column on a table. It was asked to hold "%".',
                    coalesce(nullif(p_change ->> 'kind', ''), 'nothing')
      using errcode = '22023',
            hint = 'Send {"kind":"record_patch","patch":{...}}, {"kind":"record_add","rows":[{...}]} or {"kind":"field_add","field":{...}}. Anything else would be a change nobody could apply when they approved it.';
  end if;
  if v_kind = 'record_patch'
     and (jsonb_typeof(p_change -> 'patch') is distinct from 'object'
          or p_change -> 'patch' = '{}'::jsonb) then
    raise exception 'A change waiting for approval has to say what it would change.'
      using errcode = '22004';
  end if;
  -- A BATCH THAT CARRIES NO ROWS IS NOT A CHANGE. It would be approved and write nothing,
  -- which is the dead end in a smaller font.
  if v_kind = 'record_add'
     and (jsonb_typeof(p_change -> 'rows') is distinct from 'array'
          or jsonb_array_length(p_change -> 'rows') = 0) then
    raise exception 'Records waiting for approval have to say what would be written.'
      using errcode = '22004',
            hint = 'Send {"kind":"record_add","rows":[{...}]} with at least one record.';
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
  -- Records go IN a table. Filing them against a row would produce an approval whose yes
  -- nobody could carry out.
  if v_kind = 'record_add' and v_word <> 'table' then
    raise exception 'Records are added to a table, and this is a %.', v_word
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

-- ── decide it, and APPLY it ──────────────────────────────────────────────────────────────
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
  v_written uuid[] := '{}';
  v_one     uuid;
  v_doc     jsonb;
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
  -- THE SECOND PAIR OF EYES IS FOR A PERSON'S REQUEST. An agent's call runs as the person it
  -- is working for, so `requested_by` on an agent request names THAT person — the very one
  -- `ask` exists to consult. Holding the bar there would have made every agent wait
  -- undecidable by the only person looking at it. It still holds for `origin = 'person'`.
  if v_me is not null and nullif(v_row.data ->> 'requested_by', '')::uuid = v_me
     and coalesce(v_row.data ->> 'origin', 'person') <> 'agent'
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
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      v_outcome := format('Applied. %s is now at version %s.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'), v_version);
    elsif v_kind = 'record_add' then
      -- THE SAME DOOR THE UNATTENDED PATH USES, once per row, in THIS transaction. Every
      -- guard, every validator and the value envelope run per row exactly as they would for
      -- an agent that was never asked; the difference is whose name is on the history row.
      -- One refused row rolls the whole decision back, which is what a person means by
      -- saying yes to a batch.
      for v_doc in select value from jsonb_array_elements(v_change -> 'rows')
      loop
        v_one := custom.record_write(p_organization_id, v_subject, v_doc);
        v_written := v_written || v_one;
      end loop;
      v_outcome := format('Applied. %s %s now in %s.',
                          cardinality(v_written),
                          case when cardinality(v_written) = 1 then 'record is' else 'records are' end,
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
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
    v_outcome := case
                   when v_kind = 'field_add'
                     then format('The column %s was not added.',
                                 coalesce(nullif(v_change #>> '{field,label}', ''),
                                          nullif(v_change #>> '{field,key}', ''), 'asked for'))
                   when v_kind = 'record_add'
                     then format('%s %s not written to %s.',
                                 jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)),
                                 case when jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)) = 1
                                      then 'record was' else 'records were' end,
                                 coalesce(v_row.data ->> 'subject_title', 'that table'))
                   else format('%s was left as it was.',
                               coalesce(v_row.data ->> 'subject_title', 'That record')) end;
  end if;

  update custom.record r
     set data = r.data || jsonb_strip_nulls(jsonb_build_object(
           'state',         case when p_approve then 'approved' else 'declined' end,
           'decided_by',    v_me::text,
           'decided_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'decision_note', nullif(btrim(coalesce(p_note, '')), ''),
           'applied_field_id', v_field::text,
           'applied_record_ids', case when cardinality(v_written) > 0
                                      then to_jsonb(v_written) end,
           'outcome',       v_outcome))
   where r.organization_id = p_organization_id and r.id = p_approval_id;

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'state',       case when p_approve then 'approved' else 'declined' end,
    'subject_id',  v_subject,
    'applied',     coalesce(p_approve, false),
    'field_id',    v_field,
    'record_ids',  case when cardinality(v_written) > 0 then to_jsonb(v_written) end,
    'version',     v_version,
    'message',     v_outcome);
end
$$;

comment on function custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) is
  'File a pending change: record_patch (a patch for an existing record), record_add (rows for '
  'a table) or field_add (a new column on a table). APPROVAL-FIX 2026-09-19 added record_add, '
  'because the change an agent makes most often is a row.';

comment on function custom.work_approval_decide(uuid, uuid, boolean, text) is
  'Decide one pending change and, on yes, APPLY it in the same transaction through the store''s '
  'own doors as the person deciding. A requester may not decide their own request unless an '
  'AGENT filed it — an agent runs as the person it works for, and that person is exactly who '
  '`ask` means to consult.';
