-- Inverse of handover_a_change_the_store_would_refuse_is_never_filed.sql: the body it replaced, byte for byte, and the helper it added, dropped.
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 1c7ec23f69e50ccbf6778bdc88a63f40588b65f2bf0a180be415d527381a187a
-- chair-step: restores custom.work_approval_request and drops custom._held_change_refusal (handover_a_change_the_store_would_refuse_is_never_filed.sql)

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

DROP FUNCTION IF EXISTS custom._held_change_refusal(uuid, text, uuid, jsonb);
