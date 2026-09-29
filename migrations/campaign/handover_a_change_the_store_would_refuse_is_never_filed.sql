-- additive: yes
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 9573954927e3e5f8627ebee39dfa537e0286973355db6946bcb656e856edc45d
--
-- HANDOVER (2026-09-28) — A CHANGE THE STORE WOULD REFUSE IS NEVER FILED FOR APPROVAL.
--
-- Adds ONE helper (custom._held_change_refusal, SECURITY INVOKER) and replaces one live body,
-- same signature (custom.work_approval_request, declared in platform.client_callable_door);
-- nothing dropped, granted or revoked; no row touched.
--
-- What a person met: Cedar Ridge Physical Therapy's workflow "Add a referred patient: Rafael
-- Moreno" paused on a held write ("Held for your approval: 1 new record on Patients"). The owner
-- pressed Approve and only then read "Insurance does not have a choice called 'Blue Shield'".
-- The request door now tries a record_add / record_patch through the doors approval applies
-- with, in a rolled-back savepoint, and refuses to file one the store would refuse, in the
-- store's own words. A refusal about the seat (42501) is still filed: who decides is the queue's
-- question, not the values'.
-- Guard: scripts/campaign-tests/handover_a_change_the_store_would_refuse_is_never_filed.sql

-- What the store would say if this held change were applied now, or NULL when it would land.
-- It runs the SAME doors custom.work_approval_decide applies with (custom.record_write per row;
-- custom.record_update with the approval flag the stage gates step aside for), inside a
-- savepoint that is always rolled back, so nothing is written and nothing is announced. A
-- refusal about the SEAT (42501) is not an answer about the values: who may decide is the
-- queue's question, so that one is let through to be filed.
CREATE OR REPLACE FUNCTION custom._held_change_refusal(p_organization_id uuid, p_kind text, p_subject_id uuid, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_message text;
  v_hint    text;
  v_code    text;
begin
  begin
    if p_kind = 'record_patch' then
      perform set_config('custom.applying_approval_for', p_subject_id::text, true);
      perform custom.record_update(p_organization_id, p_subject_id, p_change -> 'patch', null);
    elsif p_kind = 'record_add' then
      for v_doc in select value from jsonb_array_elements(p_change -> 'rows') loop
        perform custom.record_write(p_organization_id, p_subject_id, v_doc);
      end loop;
    end if;
    raise exception 'held change tried' using errcode = 'MXD01';
  exception
    when sqlstate 'MXD01' then
      perform set_config('custom.applying_approval_for', '', true);
      return null;
    when insufficient_privilege then
      perform set_config('custom.applying_approval_for', '', true);
      return null;
    when others then
      get stacked diagnostics v_message = message_text, v_hint = pg_exception_hint, v_code = returned_sqlstate;
      perform set_config('custom.applying_approval_for', '', true);
      return jsonb_build_object('message', v_message, 'hint', nullif(v_hint, ''), 'code', v_code);
  end;
end
$function$;

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
  v_refusal jsonb;
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

  -- A CHANGE THE STORE WOULD REFUSE IS NEVER FILED (lane HANDOVER, 2026-09-28). Cedar Ridge
  -- Physical Therapy's workflow proposed a patient with Insurance "Blue Shield"; the wait was
  -- filed, the run paused, and only Approve found the store refuses that choice, so a person had
  -- been asked to sign for a change nobody could make. The change is now tried through the very
  -- doors approval uses, in a savepoint, and the store's own refusal is raised here instead.
  if v_kind in ('record_add', 'record_patch') then
    v_refusal := custom._held_change_refusal(p_organization_id, v_kind, p_subject_id, p_change);
    if v_refusal is not null then
      raise exception '%', v_refusal ->> 'message'
        using errcode = coalesce(nullif(v_refusal ->> 'code', ''), 'P0001'),
              hint = concat_ws(' ', nullif(v_refusal ->> 'hint', ''),
                               'Nothing was filed for approval: correct the change and ask again.');
    end if;
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
