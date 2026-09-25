-- LANE S5-PRIME (UI-CHAMPIONS-PLAN S5') — AN ARCHIVED THING TAKES ITS APPROVALS OUT OF THE INBOX.
--
-- THE DEFECT (PROGRESS-S4 finding 1, measured again 2026-09-24): after `custom.table_archive`,
-- `custom.work_inbox` still listed that table's records' pending approvals as actionable — 84 on
-- production, 55 on the dev clone — so a person could approve a change to an archived record.
-- Lane S4 declined 16 by hand to clear its walk. That was the instance; this file is the class.
--
-- WHAT THIS FILE LANDS
--   1. `custom.work_approval_withdrawal(org, approval_data)` — THE ONE QUESTION: is the thing this
--      approval would change archived, or inside an archived table? It answers the sentence that
--      says so, or null. A put-back (record_restore) of an archived record is exactly what an
--      archived subject is FOR, so only its TABLE being archived counts against it.
--   2. `custom._work_approvals_withdraw_on_archive` — AFTER UPDATE OF deleted_at on custom.record,
--      only for a live record or table becoming archived. Every pending approval about it (and,
--      for a table, about any record in it) becomes state `withdrawn`, with `decided_at`,
--      `withdrawn_by` (whoever archived it) and `withdrawn_reason`. It is an UPDATE of the
--      approval record, so history.record_capture keeps the reason in the record's history.
--   3. `_workdoors_approval_guard` accepts `withdrawn` as the fourth state and requires the reason.
--   4. `custom.work_approval_request` refuses to file a change against a record in an archived
--      table (55000), so no approval is ever born about an archived thing.
--   5. `custom.work_approval_decide` refuses a pending approval whose subject is archived, by
--      name (55000), and a withdrawn one says when and why (23505, like any decided one).
--      `custom.work_decide_many` answers that refusal as verdict `archived`.
--   6. `custom.work_inbox` (drop, create, re-open the declared door; the argument list is
--      unchanged): never lists a pending decision whose subject is archived, and every row now
--      carries table_id / table_name (grouping by table), decided_by / decided_by_name /
--      decided_at / outcome (a closed item says who decided and when). Columns appended at the
--      end; every existing column keeps its position.
--   7. THE BACKLOG: every pending approval already about an archived thing is withdrawn now,
--      with the same reason, through the same guard, captured by the same history trigger.
--
-- INVERSE: migrations/inverse/uichamp_s5_an_archived_thing_takes_its_approvals_out_of_the_inbox_down.sql
--
-- chair-step: the return type of custom.work_inbox gains six columns and Postgres has no CREATE OR REPLACE across a changed OUT list, so it is dropped and recreated in this transaction. Same argument list, same door row; custom.reopen_declared_doors() puts EXECUTE back.
-- based-on: custom.work_inbox(uuid, integer, integer, boolean) 441c5822313e8cad48dc2f1ebc0221c2bbed442019cfac73ea7ee41687a74ef2
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) 3ef2f637bce124ad7bbde074128372c3dafa438f656f61850ca5cf02dca09def
-- based-on: custom.work_decide_many(uuid, jsonb) fea59ee72acbd911d6c722614a5aae810436ddaf00f83c92d76958cace1e651b
-- based-on: custom._workdoors_approval_guard() 4825aca9363639797a81b245eaf190f307c35b5655cf0ad56451fc92283f9e96
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 90b5166786da1ce5fff270b335a2f86c4262c29ccf5fa7c4e9baa71a1fc8c6fa

set lock_timeout = '30s';
set statement_timeout = '300s';

-- ── 1. THE ONE QUESTION ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_approval_withdrawal(p_organization_id uuid, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind    text := lower(coalesce(p_data #>> '{change,kind}', ''));
  v_subject uuid;
  v_title   text := coalesce(nullif(p_data ->> 'subject_title', ''), 'That record');
  v_gone    timestamptz;
  v_table   uuid;
  v_tname   text;
  v_tgone   timestamptz;
begin
  begin
    v_subject := nullif(p_data ->> 'subject_id', '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if v_subject is null then
    return null;
  end if;
  select s.deleted_at, s.table_id into v_gone, v_table
    from custom.record s
   where s.organization_id = p_organization_id and s.id = v_subject;
  if not found then
    return null;
  end if;
  -- THE TABLE FIRST: when the whole table is gone, that is the reason worth reading.
  if v_table is not null and v_table <> custom.table_kernel_id() then
    select coalesce(nullif(t.data ->> 'name', ''), 'its table'), t.deleted_at into v_tname, v_tgone
      from custom.record t
     where t.organization_id = p_organization_id and t.id = v_table and t.deleted_at is not null;
    if v_tgone is not null then
      return format('%s is in %s, which was archived on %s, so this change can no longer be made.',
                    v_title, v_tname, to_char(v_tgone at time zone 'utc', 'YYYY-MM-DD'));
    end if;
  end if;
  if v_gone is not null and v_kind <> 'record_restore' then
    return format('%s was archived on %s, so this change can no longer be made.',
                  v_title, to_char(v_gone at time zone 'utc', 'YYYY-MM-DD'));
  end if;
  return null;
end
$function$;
comment on function custom.work_approval_withdrawal(uuid, jsonb) is
  'Lane S5-PRIME. Is the thing this approval would change archived, or inside an archived table? Answers the sentence that says so, or null. A put-back of an archived record counts only when its table is archived. Internal: asked by work_inbox, work_approval_decide and the archive trigger; no client calls it.';
revoke all on function custom.work_approval_withdrawal(uuid, jsonb) from public, anon, authenticated;

-- ── 2. ARCHIVING WITHDRAWS WHAT WAS WAITING ON IT ───────────────────────────────────────────────
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
begin
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
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     v_by::text,
             'withdrawn_reason', v_reason,
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = new.organization_id and r.id = a.id;
  end loop;
  return null;
end
$function$;
comment on function custom._work_approvals_withdraw_on_archive() is
  'Lane S5-PRIME. When a record or table is archived, every pending approval about it (for a table, also about any record in it) becomes withdrawn, with decided_at, withdrawn_by and withdrawn_reason. The history trigger keeps the reason.';
revoke all on function custom._work_approvals_withdraw_on_archive() from public, anon, authenticated;

drop trigger if exists zz_w4_approvals_withdraw_on_archive on custom.record;
create trigger zz_w4_approvals_withdraw_on_archive
  after update of deleted_at on custom.record
  for each row
  when (old.deleted_at is null and new.deleted_at is not null and new.data_class in ('record', 'table'))
  execute function custom._work_approvals_withdraw_on_archive();

-- ── 3. THE GUARD KNOWS THE FOURTH STATE ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._workdoors_approval_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
  if not (lower(coalesce(d #>> '{change,kind}', '')) = any (custom.work_approval_kinds())) then
    raise exception 'an approval has to carry a change somebody could actually apply'
      using errcode = '23514',
            hint = 'One of ' || array_to_string(custom.work_approval_kinds(), ', ') ||
                   '. Anything else would be approved and then do nothing.';
  end if;
  -- LANE S5-PRIME: `withdrawn` is the fourth state. Nobody decided it; the thing it would have
  -- changed was archived, and the store closed it with the reason (`withdrawn_reason`).
  if lower(coalesce(d ->> 'state', '')) not in ('pending', 'approved', 'declined', 'withdrawn') then
    raise exception 'an approval is pending, approved, declined or withdrawn, and this one says %',
                    coalesce(nullif(d ->> 'state', ''), 'nothing')
      using errcode = '23514';
  end if;
  if lower(coalesce(d ->> 'state', '')) = 'withdrawn' and nullif(d ->> 'withdrawn_reason', '') is null then
    raise exception 'a withdrawn approval has to say why it was withdrawn'
      using errcode = '23514', hint = 'The person who asked, and the person it was waiting on, both read that sentence.';
  end if;
  if lower(coalesce(d ->> 'state', '')) <> 'pending' and nullif(d ->> 'decided_at', '') is null then
    raise exception 'a decided approval has to say when it was decided'
      using errcode = '23514', hint = 'Otherwise the queue cannot tell a fresh decision from an old one.';
  end if;
  return new;
end
$function$;

-- ── 4. NO REQUEST IS FILED ABOUT A RECORD IN AN ARCHIVED TABLE ──────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_approval_request(p_organization_id uuid, p_subject_id uuid, p_change jsonb, p_note text DEFAULT NULL::text, p_approver_id uuid DEFAULT NULL::uuid, p_origin text DEFAULT 'person'::text, p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind    text := lower(coalesce(p_change ->> 'kind', ''));
  v_origin  text := lower(coalesce(nullif(btrim(p_origin), ''), 'person'));
  v_me      uuid := custom.query_principal();
  v_subject custom.record;
  v_word    text;
  v_id      uuid;
  v_who     jsonb;
  v_home    text;
begin
  -- THE ORGANIZATION WALL, THE SWITCH, THEN THE RUNG - all three by name, all three on the one
  -- ladder, and all three before anything is read or written.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_request');
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');

  -- ASKING IS NOT CHANGING, AND THE RUNG SAYS SO. This door writes nothing on the subject: it
  -- files a request. `custom.work_approval_decide` is what applies the change, later, as the
  -- person who approved it and through the store's own doors, and the authority to decide is
  -- asked there. So the rung to ASK is the PARTICIPATION rung - commenter - which is what Jira
  -- and ServiceNow require to raise a change request on an item: enough standing to take part,
  -- never enough to make the change. A viewer is told exactly that, by name, rather than being
  -- told they have no access to something they can plainly read.
  if not (custom.query_is_store_owner()
          or custom.has_visibility(v_me, 'record', p_subject_id, 'commenter'::public.permission_level)) then
    if custom.has_visibility(v_me, 'record', p_subject_id, 'viewer'::public.permission_level) then
      raise exception 'You can read this, but asking for a change to it is for the people who work on it.'
        using errcode = '42501',
              hint = 'Raising a change takes the commenter level or higher on it - the same level it takes to leave a comment. Ask somebody who holds it to raise the change, or to share it with you at that level.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'Nothing reads or files against a record around the one ladder. Ask somebody who holds it to share it with you.';
  end if;

  if v_origin not in ('person', 'agent') then
    raise exception 'An approval comes from a person or from an agent, and "%" is neither.', p_origin
      using errcode = '22023';
  end if;
  if not (v_kind = any (custom.work_approval_kinds())) then
    raise exception 'This store can hold a change to a record''s values, new records in a table, a new column on a table, a record being removed or put back, and a new table in a home. It was asked to hold "%".',
                    coalesce(nullif(p_change ->> 'kind', ''), 'nothing')
      using errcode = '22023',
            hint = 'The kinds are ' || array_to_string(custom.work_approval_kinds(), ', ') ||
                   '. Anything else would be a change nobody could apply when they approved it.';
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
  -- A NEW TABLE CARRIES THE WHOLE SPEC, and its fields with it. A card that said "a table
  -- called Invoices" would ask a person to sign for something they were never shown, and an
  -- approval that had to guess the spec back would create a different table than the one
  -- that was refused.
  if v_kind = 'table_add' then
    if jsonb_typeof(p_change -> 'table') is distinct from 'object'
       or nullif(p_change #>> '{table,name}', '') is null then
      raise exception 'A new table waiting for approval has to carry the table it would create.'
        using errcode = '22004',
              hint = 'Send {"kind":"table_add","table":{...the spec custom.table_declare takes...},"fields":[...]}.';
    end if;
    if p_change ? 'fields' and jsonb_typeof(p_change -> 'fields') is distinct from 'array' then
      raise exception 'The columns of a new table waiting for approval have to be a list, even an empty one.'
        using errcode = '22004';
    end if;
  end if;

  -- THE SUBJECT. A record being PUT BACK is deleted by definition, so that one kind looks for
  -- it among the deleted rows; every other kind still requires a live subject.
  if v_kind = 'record_restore' then
    select r.* into v_subject from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is not null;
    if v_subject.id is null then
      raise exception 'There is no deleted record in this organization with that id, so there is nothing to put back.'
        using errcode = '02000',
              hint = 'A record that is still here does not need restoring; one that was never here cannot be.';
    end if;
  else
    select r.* into v_subject from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id and r.deleted_at is null;
    if v_subject.id is null then
      raise exception 'There is no such record in this organization, so there is nothing to approve.'
        using errcode = '02000';
    end if;
  end if;
  -- LANE S5-PRIME: A RECORD IN AN ARCHIVED TABLE IS NOT A THING TO ASK ABOUT. Nobody would ever
  -- see the request (the inbox does not list it) and nobody could decide it (the decide door
  -- refuses it by name), so it is refused here, before it is filed. Put-back included: bringing a
  -- record back into a table that is itself archived restores it into nowhere.
  if v_subject.table_id is not null and v_subject.table_id <> custom.table_kernel_id() then
    select coalesce(nullif(t.data ->> 'name', ''), 'its table') into v_home
      from custom.record t
     where t.organization_id = p_organization_id and t.id = v_subject.table_id
       and t.deleted_at is not null;
    if v_home is not null then
      raise exception '% is in %, which is archived, so a change to it cannot be asked for.',
                      coalesce(custom.record_words(p_organization_id, p_subject_id), 'That record'), v_home
        using errcode = '55000',
              hint = 'Bring the table back from the archive first; then ask again.';
    end if;
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
  -- A DOCUMENT TEMPLATE IS THE TABLE'S OWN WORDING, so it waits on the TABLE, exactly as a
  -- new column does, and its approvers resolve on the same ladder. The card has to carry the
  -- whole template — name and body — because approving is `custom.doc_template_save` with
  -- these bytes and nothing re-derived: a person signs for the words they were shown.
  if v_kind = 'doc_template_add' then
    if v_word <> 'table' then
      raise exception 'A document template is written for a table, and this is a %.', v_word
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_change -> 'template') is distinct from 'object'
       or nullif(p_change #>> '{template,name}', '') is null then
      raise exception 'A document template waiting for approval has to carry the template it would save.'
        using errcode = '22004',
              hint = 'Send {"kind":"doc_template_add","template":{"name":"…","body":"…","template_id":null}}.';
    end if;
  end if;
  -- A NEW TABLE HANGS ON ITS HOME, which is the record it would be made inside. That is what
  -- makes the wait answerable: `custom.work_approval_approvers` resolves the admins on that
  -- Home and then the organization's owners and admins, on the one ladder.
  if v_kind = 'table_add'
     and nullif(p_change #>> '{table,parent_id}', '') is distinct from p_subject_id::text then
    raise exception 'A new table waits on the home it would be made in, and this spec names a different one.'
      using errcode = '22023',
            hint = 'File the request against the record named by the spec''s parent_id.';
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
    'subject_title',   custom.record_words(p_organization_id, p_subject_id),
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
$function$;

-- ── 5. THE DECIDE DOORS REFUSE AN ARCHIVED SUBJECT BY NAME ──────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_table   uuid;
  v_conv    uuid;
  v_at      timestamptz;
  v_why     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  -- LANE S5-PRIME: A WITHDRAWN APPROVAL SAYS WHY. Nobody decided it; the store closed it when the
  -- thing it would change was archived, and the reason is on the approval itself.
  if v_row.data ->> 'state' = 'withdrawn' then
    raise exception 'That was withdrawn on %. %', left(coalesce(v_row.data ->> 'decided_at', 'an earlier day'), 10),
                    coalesce(v_row.data ->> 'withdrawn_reason', '')
      using errcode = '23505',
            hint = 'A withdrawn approval is closed. Bring the record back from the archive and ask again if the change still needs making.';
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

  -- LANE S5-PRIME: NOTHING IS DECIDED ABOUT AN ARCHIVED THING. Archiving withdraws the
  -- approvals waiting on it (custom._work_approvals_withdraw_on_archive); this is the door's own
  -- refusal for any that reach it anyway, in the store's words, before anything is applied.
  v_why := custom.work_approval_withdrawal(p_organization_id, v_row.data);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '55000',
            hint = 'Nothing was changed. Bring it back from the archive first; then ask for the change again.';
  end if;

  v_subject := nullif(v_row.data ->> 'subject_id', '')::uuid;
  v_change  := v_row.data -> 'change';
  v_kind    := lower(coalesce(v_change ->> 'kind', ''));
  v_conv    := nullif(v_row.data ->> 'conversation_id', '')::uuid;

  if p_approve then
    if v_kind = 'record_patch' then
      -- STAGE-RULES: THE GATE THAT ASKED FOR THIS APPROVAL STEPS ASIDE FOR THIS ONE WRITE.
      -- A stage gate whose on_fail is `require_approval` refuses the write by raising, which
      -- is HOW this change got into the queue at all. Applying the yes has to get past the
      -- same gate, and it gets past it by NAMING THE RECORD it is applying an approved
      -- change to, for the length of that one statement and no longer. Every plain refusal,
      -- every other validator and the whole value envelope still run, so an approver is
      -- never told yes over a write the store itself would refuse.
      perform set_config('custom.applying_approval_for', v_subject::text, true);
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      perform set_config('custom.applying_approval_for', '', true);
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
    elsif v_kind = 'record_delete' then
      -- THE STORE'S OWN DELETE, AS THE APPROVER, IN THIS TRANSACTION. custom.record_delete
      -- runs custom.delete_rule first, so a record something still reads is refused here in
      -- the store's own words and the decision rolls back — an approver is never told yes
      -- over a delete the store would have refused.
      v_at := custom.record_delete(p_organization_id, v_subject);
      v_outcome := format('Removed. %s was deleted on %s and can be put back.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'),
                          to_char(v_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'));
    elsif v_kind = 'record_restore' then
      perform custom.record_restore(p_organization_id, v_subject);
      v_outcome := format('Put back. %s is here again.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'));
    elsif v_kind = 'table_add' then
      -- EXACTLY WHAT THE DIRECT PATH RUNS, IN EXACTLY THAT ORDER: custom.table_declare with
      -- the spec that was shown, then custom.field_declare once per column. Not a re-derived
      -- spec and not a second way of making a table — the same two doors, so an approved
      -- table and an unasked one are the same bytes.
      v_table := custom.table_declare(p_organization_id, v_change -> 'table');
      for v_doc in select value from jsonb_array_elements(coalesce(v_change -> 'fields', '[]'::jsonb))
      loop
        v_field := custom.field_declare(p_organization_id, v_table, v_doc);
      end loop;
      -- THE CONVERSATION'S CLAIM TRAVELS WITH THE APPROVAL. A table a person said yes to is
      -- still the table this conversation made, so the agent's next change to it is not a
      -- change to somebody's pre-existing table.
      if v_conv is not null then
        perform custom.agent_table_claim(p_organization_id, v_table, v_conv);
      end if;
      v_field := null;
      v_outcome := format('Created. %s is now a table in %s, with %s column%s.',
                          coalesce(nullif(v_change #>> '{table,name}', ''), 'That table'),
                          coalesce(v_row.data ->> 'subject_title', 'this organization'),
                          jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)),
                          case when jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)) = 1
                               then '' else 's' end);
    elsif v_kind = 'doc_template_add' then
      -- THE SAME DOOR THE UNASKED PATH USES, with the bytes that were shown on the card.
      -- `custom.doc_template_save` re-runs every one of its own refusals here, as the
      -- approver — including the one that names a token pointing at no column — so an
      -- approved template and one written directly are the same template.
      v_written := array[custom.doc_template_save(
                           p_organization_id, v_subject,
                           v_change #>> '{template,name}',
                           coalesce(v_change #>> '{template,body}', ''),
                           nullif(v_change #>> '{template,template_id}', '')::uuid)];
      v_outcome := format('Saved. %s is now a document template on %s.',
                          coalesce(nullif(v_change #>> '{template,name}', ''), 'That template'),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
      -- ── FIELD-TRUTH 2026-09-21: THE NAME AND THE DEFINITION GO ON TOGETHER. ─────────
      -- This used to write the NAME into the table's `fields` list in one statement and
      -- then define the column in the next. Between those two statements the table claimed
      -- a column that no Field record backed — a name with no type, no rules and no
      -- validation, which `custom.applicable_fields` never answers with and no grid can
      -- draw. `custom.assert_columns_are_defined` refuses exactly that shape now, and it
      -- refused this door: *"Estimates says it has a column called "rate_card", and there
      -- is no such field"* when an agent's Rate card proposal was approved.
      -- The pre-add was also REDUNDANT: `custom.field_declare` appends the name to the
      -- table's list itself, in the same call that writes the definition, which is the
      -- whole point of there being one door for a column.
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
                   when v_kind = 'record_delete'
                     then format('%s was not deleted, and is still here.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'record_restore'
                     then format('%s was not put back, and is still deleted.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'table_add'
                     then format('The table %s was not created.',
                                 coalesce(nullif(v_change #>> '{table,name}', ''), 'asked for'))
                   when v_kind = 'doc_template_add'
                     then format('The document template %s was not saved.',
                                 coalesce(nullif(v_change #>> '{template,name}', ''), 'asked for'))
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
           'applied_table_id', v_table::text,
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
    'table_id',    v_table,
    'record_ids',  case when cardinality(v_written) > 0 then to_jsonb(v_written) end,
    'version',     v_version,
    'message',     v_outcome);
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_decide_many(p_organization_id uuid, p_decisions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_max       integer;
  v_n         integer;
  v_dec       jsonb;
  v_i         integer := 0;
  v_item      uuid;
  v_word      text;
  v_note      text;
  v_seen      uuid[] := '{}';
  v_out       jsonb;
  v_one       jsonb;
  v_results   jsonb := '[]'::jsonb;
  v_msg       text;
  v_state     text;
  v_approved  integer := 0;
  v_declined  integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_decide_many');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_decide_many');

  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'A batch of decisions is a list of inbox items, each approved or declined, and this was %.',
      coalesce(jsonb_typeof(p_decisions), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"item": …, "decision": "approve" | "decline", "note": …}, …]. Nothing was decided.';
  end if;
  v_n := jsonb_array_length(p_decisions);
  if v_n = 0 then
    raise exception 'No items were selected, so nothing was decided.'
      using errcode = '22023', hint = 'Select the items, then approve or decline them.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'batch_items_max', p_organization_id) #>> '{}')::integer, 500);
  if v_n > v_max then
    raise exception 'At most % items are decided in one go, and % were selected.', v_max, v_n
      using errcode = '54000',
            hint = 'Decide them in parts. The ceiling is the organization knob custom/batch_items_max. Nothing was decided.';
  end if;

  for v_dec in select value from jsonb_array_elements(p_decisions) loop
    v_i := v_i + 1;
    v_item := null; v_word := null; v_note := null;
    if jsonb_typeof(v_dec) = 'object' then
      begin
        v_item := nullif(v_dec ->> 'item', '')::uuid;
      exception when invalid_text_representation then
        v_item := null;
      end;
      v_word := lower(btrim(coalesce(v_dec ->> 'decision', '')));
      v_note := nullif(btrim(coalesce(v_dec ->> 'note', '')), '');
    end if;

    if v_item is null or v_word not in ('approve', 'decline') then
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'index', v_i, 'item', v_dec ->> 'item', 'decision', nullif(v_word, ''), 'verdict', 'refused',
        'sentence', 'This decision names no item, or says neither approve nor decline, so it was not tried.')));
      continue;
    end if;
    if v_item = any(v_seen) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_i, 'item', v_item, 'decision', v_word, 'verdict', 'refused',
        'sentence', 'This item is already in this batch once, so the second decision was not tried.'));
      continue;
    end if;
    v_seen := v_seen || v_item;

    -- THE SINGLE DOOR, AS IT IS. Its own savepoint: a refused decision leaves that item
    -- waiting, exactly as it was, and every other decision still stands.
    begin
      v_out := custom.work_approval_decide(p_organization_id, v_item, v_word = 'approve', v_note);
      if v_word = 'approve' then v_approved := v_approved + 1; else v_declined := v_declined + 1; end if;
      v_one := jsonb_build_object(
        'index', v_i, 'item', v_item, 'decision', v_word,
        'verdict', v_out ->> 'state',
        'sentence', v_out ->> 'message',
        'subject_id', v_out -> 'subject_id',
        'version', v_out -> 'version',
        'record_ids', v_out -> 'record_ids');
    exception
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'no_right', 'sentence', v_msg, 'code', '42501');
      when unique_violation then
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'already_decided', 'sentence', v_msg, 'code', '23505');
      when object_not_in_prerequisite_state then
        -- LANE S5-PRIME: the thing it would change is archived; the sentence names it.
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'archived', 'sentence', v_msg, 'code', '55000');
      when others then
        get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'refused', 'sentence', v_msg, 'code', v_state);
    end;
    v_results := v_results || jsonb_build_array(jsonb_strip_nulls(v_one));
  end loop;

  return jsonb_build_object(
    'asked',       v_n,
    'approved',    v_approved,
    'declined',    v_declined,
    'not_decided', v_n - v_approved - v_declined,
    'results',     v_results);
end
$function$;

-- ── 6. THE INBOX: never an archived subject, and a closed item says who and when ────────────────
drop function if exists custom.work_inbox(uuid, integer, integer, boolean);
CREATE FUNCTION custom.work_inbox(p_organization_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_at,
           -- THE TABLE IT IS ABOUT: the table itself for a column / records / template, the
           -- record's table otherwise. A new table waits on a home, not a table: none.
           case when coalesce(r.data ->> 'subject_kind', 'record') = 'table'
                  then nullif(r.data ->> 'subject_id', '')::uuid
                when lower(coalesce(r.data #>> '{change,kind}', '')) = 'table_add' then null
                else nullif(r.data ->> 'subject_table_id', '')::uuid end as tid,
           nullif(coalesce(r.data ->> 'decided_by', r.data ->> 'withdrawn_by'), '')::uuid as who
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       -- LANE S5-PRIME: A DECISION ABOUT AN ARCHIVED THING IS NEVER LISTED AS WAITING.
       and (coalesce(r.data ->> 'state', 'pending') <> 'pending'
            or custom.work_approval_withdrawal(p_organization_id, r.data) is null)
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
         a.created_at,
         a.tid,
         (select coalesce(nullif(t.data ->> 'name', ''), 'a table')
            from custom.record t where t.organization_id = p_organization_id and t.id = a.tid),
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then a.who end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = a.who) end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
              then nullif(a.d ->> 'decided_at', '')::timestamptz end,
         case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
              then coalesce(nullif(a.d ->> 'outcome', ''), nullif(a.d ->> 'withdrawn_reason', '')) end
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
         w.updated_at,
         w.table_id, w.table_name,
         null::uuid, null::text, null::timestamptz, null::text
    from custom.work_list(p_organization_id, 'mine', coalesce(p_include_decided, false), 500, 0) w
   order by 11 desc, 8 nulls last, 14 desc
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, 200)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;
comment on function custom.work_inbox(uuid, integer, integer, boolean) is
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my approval, and the agent''s proposals — the same queue and the same right to approve. Lane S5-PRIME: never lists a pending decision whose subject is archived; every row carries table_id/table_name, and a closed row decided_by/decided_by_name/decided_at/outcome (a withdrawn one names whoever archived the subject).';
select custom.reopen_declared_doors();

-- ── 7. THE BACKLOG ──────────────────────────────────────────────────────────────────────────────
select set_config('app.actor_system', 'campaign/uichamp_s5 withdraws approvals about archived things', true);
update custom.record a
   set data = a.data || jsonb_build_object(
         'state',            'withdrawn',
         'decided_at',       to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'withdrawn_reason', q.why,
         'outcome',          'Withdrawn. ' || q.why)
  from (select x.organization_id, x.id, custom.work_approval_withdrawal(x.organization_id, x.data) as why
          from custom.record x
         where x.data_class = 'work_approval' and x.deleted_at is null
           and coalesce(x.data ->> 'state', 'pending') = 'pending') q
 where q.why is not null
   and a.organization_id = q.organization_id and a.id = q.id;
