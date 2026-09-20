-- chair-step: it replaces two live client doors' bodies in schema `custom`. The production
--   allow-list would take them behind a `-- guard:` header, but the knob that header names is
--   `custom/system_enabled` and BOTH bodies now read it the only way this store ever reads it -
--   `custom.assert_store_door`, which resolves it through `custom.store_is_open`. Writing a
--   second, literal `platform.knob_resolve('custom','system_enabled', ...)` beside that call so a
--   regular expression can see it would be a knob read that exists to satisfy a grep, which is
--   the thing this campaign calls a comment pretending to be a switch. Nothing is dropped,
--   nothing is revoked, no grant is issued, no row is deleted: two function bodies, replaced.
--
-- CHOICE-VALUE (4 of 4) - THE LAST TWO DOORS DECIDING OUTSIDE THE ONE LADDER.
--
-- `pnpm check:store-doors-decide` names exactly two doors today, and it has named them since
-- ~05:50Z on 2026-09-20 (lane LEAK-T10 recorded them arriving while it worked):
--
--   * census 1, `custom.work_approval_request` - a SECURITY DEFINER door, granted, taking an
--     organization id, whose body never reaches any of the six names that census reads for. It
--     asked `custom.assert_client_may_open`, which IS a wall and IS a rung, but is not one of
--     them - lane WORK-DOORS hit this on four other doors the same day and made those four state
--     their wall by name rather than widen another lane's guard. This is the fifth.
--   * census 6, `custom.subscription_mute` - a declared client door that runs
--     `update custom.record` and never asks whether the store is open.
--
-- WHAT CHANGES, and it is not only the census. Asking for approval used to take VIEWER on the
-- subject, so anybody who could read a record could put a change to it in somebody's inbox. The
-- rung is now COMMENTER - the participation rung - because a request is not a write and the
-- authority to APPLY it is asked, separately and at admin, in `custom.work_approval_decide`. A
-- viewer is now told the true thing ("you can read this, but asking for a change to it is for the
-- people who work on it") instead of being handed a request they had no standing to make.
--
-- Muting is unchanged in WHO may do it - your own notification is yours to switch off, somebody
-- else's takes admin on the Table it is about - and gains the switch it never asked, plus the
-- store-owner arm so an operator with no session is named rather than silently refused.
--
-- THE INVERSE: migrations/inverse/choiceval_two_doors_on_the_one_ladder_down.sql.

-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 533452c6cc0307b86ddf0ff75cd7611bbd70711258d425d7ad6f239d3cfec438
-- based-on: custom.subscription_mute(uuid, uuid, boolean) 2448077cd1b3dbba3146cf817df6855429d5aafbf5412154501b8368d9fed7eb

set lock_timeout = '45s';
set statement_timeout = '600s';

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
$function$;

CREATE OR REPLACE FUNCTION custom.subscription_mute(p_organization_id uuid, p_rule_id uuid, p_muted boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_rule  custom.record;
  v_who   uuid;
  v_table uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_mute');
  -- THE SWITCH, BEFORE THE WRITE. Muting a subscription writes a row of this store, and while
  -- `custom/system_enabled` is off this store answers a sentence rather than taking the write
  -- quietly. It was the one thing this door never asked.
  perform custom.assert_store_door(p_organization_id, 'custom.subscription_mute');
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  v_who := nullif(v_rule.data -> 'subscription' ->> 'recipient_user_id', '')::uuid;
  v_table := (v_rule.data ->> 'scope_table_id')::uuid;

  -- YOUR OWN NOTIFICATION IS YOURS TO SWITCH OFF. Requiring an administrator for that is
  -- how an organization ends up with a rule nobody reads and nobody can kill. Somebody
  -- else's is an admin act on the Table it is about, which is where that authority lives.
  -- The rung, unchanged and on the one ladder: your own notification is yours, and somebody
  -- else's takes admin on the Table it is about. The store owner (a migration, an operator at a
  -- terminal) is named rather than slipping through `has_visibility` returning false for a
  -- caller with no session.
  if v_who is distinct from v_me
     and not custom.query_is_store_owner()
     and not custom.has_visibility(v_me, 'record', v_table, 'admin'::public.permission_level) then
    raise exception 'That notification is not addressed to you, so you cannot switch it off.'
      using errcode = '42501',
            hint = 'A notification you receive is always yours to stop. Switching off somebody else''s takes the admin level on the table it is about — ask whoever holds it.';
  end if;

  update custom.record
     set data = jsonb_set(data, '{subscription,muted}', to_jsonb(coalesce(p_muted, true)), true),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = p_rule_id;
  return coalesce(p_muted, true);
end;
$function$;
