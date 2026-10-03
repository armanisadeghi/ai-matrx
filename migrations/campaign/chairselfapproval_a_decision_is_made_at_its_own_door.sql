-- chair-step: this file REPLACES the bodies of thirteen `custom` functions — the approval guard
--   trigger function and the twelve doors that write a work_approval or sign_request row — and
--   creates nothing, drops nothing, revokes nothing, touches no row of anybody's data and takes no
--   table lock beyond the function catalogue. Lane CHAIR-SELF-APPROVAL; inverse is
--   `migrations/inverse/chairselfapproval_a_decision_is_made_at_its_own_door_down.sql`.
-- lock: custom
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 1c7ec23f69e50ccbf6778bdc88a63f40588b65f2bf0a180be415d527381a187a
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) e3ef058019d584309c3080dce9f0ab655d1a825d347064ced826cfb4cef6023c
-- based-on: custom._work_approvals_withdraw_on_archive() c7ead0afcdeaa7c0619d8f4b85db89352ae1e18adb13360287e11f223cc55144
-- based-on: custom._organization_work_withdraw(uuid, uuid) 2179995c85379cf44b39a257c0e01df126e53ae4f00fb766d544dc7cb18b789d
-- based-on: custom._organization_work_return(uuid, uuid) 7f16bdb7bc5ea6f5738b817910620c7c155c58fbfba334373a9e9642d8637d34
-- based-on: custom.sign_request_create(uuid, uuid, text, text, text, interval) 6e548dddb68e5450c55f3ff293040c825bdf0dcc288dd97bc3d836f2fc461d38
-- based-on: custom.sign_request_sign(text, text, text, text, text, text, text) c7d87b3fee1765cb5a467c7f1b594cf4fae2897cec58da3263ef0d87ede1a0de
-- based-on: custom.sign_request_decline(text, text, text, text) 7701358c30906db4d39b31464fbeb9ccedcd941dcea82c08715305bd7f23dee5
-- based-on: custom.sign_request_public(text, text) cc08abb2513d07fd045c09ec4179297f915e2848a9efedb9196b2eb8d3b98cf1
-- based-on: custom.sign_request_cancel(uuid, uuid, text) 0d9820e49613ee35cc8e801775b77ce13f7f1ce3b043e3543fb71eb291c7b05f
-- based-on: custom.sign_request_remind(uuid, uuid) ff2b261999d8b3f2f008ec2ce439a8a5cec4a8d0d08ddef2d93ab9f5fdf9fa59
-- based-on: custom._sign_request_resolve(text) 641a6639e66ccff014ea64d48d76b541ee482297dc6b1a21fcb60c82185f8783
-- based-on: custom._workdoors_approval_guard() 8b8647d4d8b2e7547b92d436eb3ad82ed950cf4b7a5a205e990748cbd5c0430a
--
-- CHAIR-SELF-APPROVAL — A DECISION IS MADE AT ITS OWN DOOR, NEVER BY WRITING THE RECORD.
--
-- THE HOLE (lane 11's board, item 0; proven on the clone as test@test.com, a plain member, and again
-- with the agent tier declared): custom.work_approval_request files an approval; then
-- custom.record_update(org, approval_id, {"state":"approved","decided_at":…,"decided_by":me}) returns
-- the next version and custom.work_approval_read shows it approved. Nothing in that path asked
-- custom.work_approval_decide's three questions — is the caller a person, may they decide this, did
-- they ask for it themselves — because the only guard on the row, custom._workdoors_approval_guard,
-- checked shape (a subject, a known kind, a decided_at beside a decided state) and never WHO was
-- writing. The same plain write flips `origin` to agent so the requester may approve their own
-- request at the real door, swaps `change` after it was shown to the approver, renames
-- `requested_by`, and record_restore_version puts a declined approval back to pending to be decided
-- again. An agent working on a person's session could therefore approve its own held writes.
--
-- THE SIBLING (same census, same hole): a sign_request row is read as signed the moment `signed_at`
-- is a key (custom.sign_request_state), and custom.record_update wrote that key for anyone holding
-- editor on the row. The signature table itself was already immutable; the request's state was not.
--
-- THE FIX — THE CLASS, NOT THE INSTANCE. The guard now refuses any INSERT of, or any change to the
-- `data` or `data_class` of, a work_approval or sign_request row unless one of that class's own
-- doors holds the transaction-local mark `custom.decision_door = '<class>:<door>'` around the one
-- statement it writes — the pattern of platform.final_switch_acting and custom.applying_approval_for
-- (set_config is no client door, so a record write, a batch, a graph, an import, a restore, REST v1
-- or the MCP cannot carry it). Each door marks its own transition and the guard checks the mark
-- against the transition it sees (request: insert pending; decide: pending → approved|declined with
-- decided_by; withdraw: pending → withdrawn; return: withdrawn → pending), so a door with a hole in
-- it is refused by name too. Archive and restore change deleted_at only and pass as before. The
-- trigger is on custom.record (and its partitions), which is the one table every write path ends in.
--
-- WHAT STILL WORKS, proven by scripts/campaign-tests/chairselfapproval_a_decision_is_made_at_its_own_door.sql
-- (RED on these bodies' predecessors, GREEN after): decide by an approver; the requester still refused
-- (second pair of eyes); the agent tier still refused at decide; withdraw on archive; archiving and
-- restoring the approval row itself; work_decide_many; the organization archive's withdraw/return.
--
-- Other censused state machines, for the record: checklist_run (`closed_at` is a derived fact the watch
-- rewrites, not an authority; an editor can rewrite it — noted, not a decision door), work_instantiation
-- and enrichment_run (logs), platform.assists (no table grant to members; its own doors), list_change
-- proposals (client-side kind that files through work_approval_request/decide — lane 4).

-- ── 1. the guard: a decision record changes only at its own door ──────────────────────────

CREATE OR REPLACE FUNCTION custom._workdoors_approval_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d       jsonb := new.data;
  v_class text;
  v_door  text := coalesce(current_setting('custom.decision_door', true), '');
  v_verb  text;
  v_from  text;
  v_to    text;
begin
  -- CHAIR-SELF-APPROVAL (2026-10-03): A DECISION IS MADE AT ITS OWN DOOR, AND NOWHERE ELSE.
  -- Proven on the clone as a signed-in member: custom.work_approval_request filed an approval, then
  -- custom.record_update(org, id, {"state":"approved","decided_at":…,"decided_by":me}) went through and
  -- work_approval_read showed it approved — skipping custom.work_approval_decide's agent refusal,
  -- may_decide and the second pair of eyes. The same write could flip `origin` to agent (so the
  -- requester may approve their own request at the real door), swap `change` after it was filed,
  -- rename `requested_by`, or put a declined approval back to pending through record_restore_version.
  -- A signature request had the same hole: `signed_at` written by record_update reads as signed.
  --
  -- THE RULE. A work_approval or sign_request row's `data` (and its data_class) changes only while one
  -- of its own doors holds the transaction-local mark `custom.decision_door` = '<class>:<door>' around
  -- the one statement it writes — the pattern of platform.final_switch_acting and
  -- custom.applying_approval_for: set_config is no client door, so no record write, batch, graph,
  -- import, restore, REST or MCP call can carry it. This trigger sits on custom.record, so every path
  -- that reaches the row passes here. Archive and restore (deleted_at alone) are not decisions and
  -- pass as before. The doors, each named for the one transition it may make:
  --   work_approval: request (insert, pending) · decide (pending → approved|declined, decided_by set)
  --                  · withdraw (pending → withdrawn) · return (withdrawn → pending)
  --   sign_request:  create (insert) · sign · decline · view · cancel · remind · resolve · withdraw · return
  v_class := case
               when new.data_class in ('work_approval', 'sign_request') then new.data_class
               when tg_op = 'UPDATE' and old.data_class in ('work_approval', 'sign_request') then old.data_class
             end;
  if v_class is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.data is distinct from new.data
     or old.data_class is distinct from new.data_class then
    if split_part(v_door, ':', 1) <> v_class then
      if v_class = 'work_approval' then
        raise exception 'An approval is decided at its own door, never by writing the record.'
          using errcode = '42501',
                hint = 'Nothing was changed. Approve or decline it from the approval card or the inbox (custom.work_approval_decide). A record write, batch, import or restore cannot decide, reopen or rewrite an approval.';
      end if;
      raise exception 'A signature request is answered through its signing link, never by writing the record.'
        using errcode = '42501',
              hint = 'Nothing was changed. Send, remind, cancel or sign it through its own doors (custom.sign_request_*). A record write, batch, import or restore cannot sign, decline or rewrite a signature request.';
    end if;
    v_verb := split_part(v_door, ':', 2);
    if v_class = 'work_approval' then
      -- THE DOOR MAY MAKE ONLY ITS OWN TRANSITION. A mark that is held while the wrong change
      -- goes through is a door with a hole in it, and is refused by name.
      v_from := case when tg_op = 'UPDATE' then lower(coalesce(old.data ->> 'state', 'pending')) end;
      v_to   := lower(coalesce(d ->> 'state', ''));
      if not (   (v_verb = 'request'  and tg_op = 'INSERT' and v_to = 'pending'
                  and nullif(d ->> 'decided_at', '') is null and nullif(d ->> 'decided_by', '') is null)
              or (v_verb = 'decide'   and tg_op = 'UPDATE' and v_from = 'pending'
                  and v_to in ('approved', 'declined') and nullif(d ->> 'decided_by', '') is not null)
              or (v_verb = 'withdraw' and tg_op = 'UPDATE' and v_from = 'pending'   and v_to = 'withdrawn')
              or (v_verb = 'return'   and tg_op = 'UPDATE' and v_from = 'withdrawn' and v_to = 'pending')) then
        raise exception 'The approval door "%" does not make the change % → %.', v_verb, coalesce(v_from, 'nothing'), coalesce(nullif(v_to, ''), 'nothing')
          using errcode = '42501',
                hint = 'Nothing was changed. request files a pending approval; decide takes pending to approved or declined; withdraw takes pending to withdrawn; return takes withdrawn back to pending.';
      end if;
    elsif not (   (v_verb = 'create' and tg_op = 'INSERT')
               or (v_verb in ('sign', 'decline', 'view', 'cancel', 'remind', 'resolve', 'withdraw', 'return') and tg_op = 'UPDATE')) then
      raise exception 'The signature door "%" does not % a signature request.', v_verb, lower(tg_op)
        using errcode = '42501',
              hint = 'Nothing was changed. create inserts a request; every other door updates one that exists.';
    end if;
  end if;

  if v_class = 'sign_request' then
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

-- ── 2. the doors, each marking the one write it makes ─────────────────────────────────────

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

  perform set_config('custom.decision_door', 'work_approval:request', true);
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
  perform set_config('custom.decision_door', '', true);

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
  v_by_name text;
  v_fill    jsonb;
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
    -- HANDOVER (2026-09-27): no clock in the sentence. WHEN it closed is a fact for the reader's
    -- own clock, so it rides in DETAIL (ISO 8601) and the screen says it in the reader's words.
    raise exception 'That was withdrawn. %', coalesce(v_row.data ->> 'withdrawn_reason', '')
      using errcode = '23505',
            hint = 'A withdrawn approval is closed. Bring the record back from the archive and ask again if the change still needs making.',
            detail = jsonb_build_object('state', 'withdrawn',
                                        'decided_at', nullif(v_row.data ->> 'decided_at', ''))::text;
  end if;
  if coalesce(v_row.data ->> 'state', 'pending') <> 'pending' then
    -- HANDOVER (2026-09-27): WHO in the sentence, WHEN in DETAIL. The sentence read "That was
    -- already approved, on 2026-09-28T01:23:12.271Z." on a person's screen; the time is now a
    -- structured fact (state, decided_at, decided_by, decided_by_name) the card says as
    -- "Approved by admin 12 minutes ago."
    v_by_name := (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                                   nullif(u.raw_user_meta_data ->> 'full_name', ''),
                                   split_part(u.email::text, '@', 1))::text
                      from auth.users u where u.id = nullif(v_row.data ->> 'decided_by', '')::uuid);
    raise exception 'That was already % by %.', v_row.data ->> 'state', coalesce(v_by_name, 'somebody')
      using errcode = '23505',
            hint = 'An approval is decided once. Ask for the change again if it still needs making.',
            detail = jsonb_build_object('state', v_row.data ->> 'state',
                                        'decided_at', nullif(v_row.data ->> 'decided_at', ''),
                                        'decided_by', nullif(v_row.data ->> 'decided_by', ''),
                                        'decided_by_name', v_by_name)::text;
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
      -- B4-03 (2026-09-30): A COLUMN AN IMPORT ASKED FOR ARRIVES WITH ITS VALUES, in this
      -- transaction and as the approver, through the one update door.
      if jsonb_typeof(v_change -> 'fill') = 'object' then
        v_fill := custom._io_fill_held_column(p_organization_id, v_subject, v_field,
                    nullif(v_change #>> '{fill,import_id}', '')::uuid, v_change #>> '{fill,column}');
        v_outcome := v_outcome || ' ' || (v_fill ->> 'message');
      end if;
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

  perform set_config('custom.decision_door', 'work_approval:decide', true);
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
  perform set_config('custom.decision_door', '', true);

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
  v_fields uuid[];                     -- FIELD-ARCHIVE-CASCADE: the field definitions this Table took
  v_why    text;
begin
  -- A TABLE'S ARCHIVE TAKES ITS FIELD DEFINITIONS WITH IT (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
  -- custom.record_delete already archives a Table's Fields before the Table (its delete rule), but a
  -- Table is also archived by statements that never pass that door: the context follow and
  -- custom._ctx_store_type (which archived only the four scope columns), the mover, the clean-up of a
  -- test. Each left the Table's other Fields live, and a live Field under an archived Table is refused
  -- by every later write (FLD-8: "the field … says it belongs to a table this organization does not
  -- have") and cannot be brought back on its own (custom._field_shape_guard). Measured on production
  -- 2026-09-30: 42 live Fields under archived Tables in 3 organizations. This trigger fires on EVERY
  -- archive of a Table record, whatever wrote it, so the class is closed where all of them pass.
  --
  -- THE MARK IS THE MOMENT. Each Field is archived at the Table's own deleted_at — a pure retirement
  -- (only deleted_at changes, so every guard reads it as one) — and custom.record_restore brings back
  -- exactly the Fields archived at that moment when the Table comes back; a Field a person retired
  -- earlier carries its own, earlier moment and stays retired. Inside custom.record_delete the door has
  -- taken the Fields already (none is left live here); a Field archived here during that door's run is
  -- written into the same archive event, so "Bring it back" names it too.
  if new.data_class = 'table' and new.table_id = custom.table_kernel_id() then
    begin
      with gone as (
        update custom.record f
           set deleted_at = new.deleted_at
         where f.organization_id = new.organization_id
           and f.table_id = custom.field_kernel_id()
           and f.data_class <> 'kernel'
           and f.data ->> 'entity_definition_id' = new.id::text
           and f.deleted_at is null
        returning f.id)
      select coalesce(array_agg(g.id), '{}'::uuid[]) into v_fields from gone g;
    exception when check_violation or foreign_key_violation or raise_exception
                or invalid_parameter_value or not_null_violation or unique_violation then
      -- Never a reason to refuse the Table's own archive (that was always allowed): the Fields stay
      -- as they were, and the warning says so by name.
      get stacked diagnostics v_why = message_text;
      v_fields := '{}'::uuid[];
      raise warning 'The table was archived, but its columns could not be archived with it: %', v_why
        using hint = 'FIELD-ARCHIVE-CASCADE: archive the columns, then bring the table back to check they return with it.';
    end;
    if cardinality(v_fields) > 0
       and coalesce(nullif(current_setting('custom.delete_depth', true), ''), '0') <> '0' then
      perform set_config('custom.archive_took',
                         coalesce(current_setting('custom.archive_took', true), '') || array_to_string(v_fields, ',') || ',',
                         true);
    end if;
  end if;

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
    perform set_config('custom.decision_door', 'work_approval:withdraw', true);
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     v_by::text,
             'withdrawn_reason', v_reason,
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = new.organization_id and r.id = a.id;
    perform set_config('custom.decision_door', '', true);
  end loop;
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION custom._organization_work_withdraw(p_organization_id uuid, p_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     iam.organizations%rowtype;
  v_when    timestamptz;
  v_at      text;
  v_reason  text;
  v_sreason text;
  v_log     uuid := gen_random_uuid();
  v_appr    jsonb := '[]'::jsonb;
  v_asg     jsonb := '[]'::jsonb;
  v_sign    jsonb := '[]'::jsonb;
  v_note    text;
begin
  select * into v_org from iam.organizations g where g.id = p_organization_id;
  if not found or v_org.archived_at is null then
    return null;                               -- only an archived organization gives anything up
  end if;
  v_when := v_org.archived_at;
  v_at   := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_reason := format('%s was archived on %s, so this change can no longer be made there.',
                     v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'))
              || coalesce(' Reason given: ' || nullif(btrim(v_org.archive_reason), '') || '.', '');
  v_sreason := format('%s was archived on %s, so this signature request was withdrawn and the link no longer works.',
                      v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'));

  -- EVERY VERSION THIS WRITES POINTS AT ONE EVENT (history.record_capture reads these three).
  perform set_config('history.mark_at',   statement_timestamp()::text, true);
  perform set_config('history.mark_id',   v_log::text,                 true);
  perform set_config('history.mark_verb', 'archive of organization',   true);

  perform set_config('custom.decision_door', 'work_approval:withdraw', true);
  -- a. PENDING APPROVALS
  with w as (
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     p_by::text,
             'withdrawn_reason', v_reason,
             'withdrawn_with',   'organization',
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and coalesce(r.data ->> 'state', 'pending') = 'pending'
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_appr from w;
  perform set_config('custom.decision_door', '', true);

  -- b. OPEN ASSIGNMENTS (the same predicate custom._inbox_items lists: a live record whose Assignee
  --    names a person record, in a state that is not finished)
  with open_work as (
    select r.id, r.data ->> 'assignee' as assignee
      from custom.record r
      join custom.record pr
        on pr.organization_id = r.organization_id
       and pr.id::text = r.data ->> 'assignee'
       and pr.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.data_class = 'record'
       and r.deleted_at is null
       and nullif(r.data ->> 'assignee', '') is not null
       and not coalesce((s.data ->> 'terminal')::boolean, false)
  ),
  w as (
    update custom.record r
       set data = r.data - 'assignee'
      from open_work o
     where r.organization_id = p_organization_id and r.id = o.id
    returning r.id, o.assignee, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.assignee, w.version) order by w.id), '[]'::jsonb) into v_asg from w;

  perform set_config('custom.decision_door', 'sign_request:withdraw', true);
  -- c. SIGNATURE REQUESTS STILL WAITING ON THEIR SIGNER
  with w as (
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at',      now(),
             'invalidation_reason', v_sreason,
             'invalidated_by',      p_by::text,
             'invalidated_with',    'organization')
     where r.organization_id = p_organization_id
       and r.data_class = 'sign_request'
       and r.deleted_at is null
       and custom.sign_request_state(r.data) in ('sent', 'viewed')
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_sign from w;
  perform set_config('custom.decision_door', '', true);

  if jsonb_array_length(v_appr) + jsonb_array_length(v_asg) + jsonb_array_length(v_sign) = 0 then
    return jsonb_build_object('event_id', null, 'approvals', 0, 'assignments', 0, 'sign_requests', 0);
  end if;

  v_note := format('%s archived: %s waiting approval(s) withdrawn, %s open assignment(s) unassigned, %s signature request(s) stopped. Restoring the organization brings back each one whose subject is still live.',
                   v_org.name, jsonb_array_length(v_appr), jsonb_array_length(v_asg), jsonb_array_length(v_sign));
  insert into history.migration_log (id, organization_id, verb, target_kind, target_id, inverse, applied_by, note)
  values (v_log, p_organization_id, 'archive', 'organization', p_organization_id,
          jsonb_build_object(
            'kind',        'organization_restore',
            'open',        false,
            'archived_at', v_when,
            'reason',      v_reason,
            'took',        jsonb_build_object('approvals', v_appr, 'assignments', v_asg, 'sign_requests', v_sign)),
          p_by, v_note);

  return jsonb_build_object('event_id', v_log,
                            'approvals', jsonb_array_length(v_appr),
                            'assignments', jsonb_array_length(v_asg),
                            'sign_requests', jsonb_array_length(v_sign),
                            'sentence', v_note);
end
$function$;

CREATE OR REPLACE FUNCTION custom._organization_work_return(p_organization_id uuid, p_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  x        jsonb;
  v_back_a integer := 0;
  v_back_s integer := 0;
  v_back_w integer := 0;
  v_left   jsonb := '[]'::jsonb;
  v_n      integer;
  v_d      jsonb;
  v_ver    integer;
  v_del    timestamptz;
  v_total  integer := 0;
  v_events integer := 0;
begin
  if exists (select 1 from iam.organizations g where g.id = p_organization_id and g.archived_at is not null) then
    return null;                               -- still archived: nothing comes back
  end if;

  -- EVERY OPEN EVENT, newest first (an organization archived, restored and archived again has one
  -- open event per archive that nothing has undone yet).
  for m in
    select * from history.migration_log l
     where l.organization_id = p_organization_id
       and l.target_kind = 'organization' and l.target_id = p_organization_id
       and l.verb = 'archive' and l.undone_at is null
     order by l.applied_at desc
  loop
    v_events := v_events + 1;
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   m.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive of organization', true);

    -- a. APPROVALS: back to pending only if nothing changed them since and their subject is live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,approvals}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.version, r.deleted_at into v_d, v_ver, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'the approval itself was archived'));
      elsif v_d ->> 'state' <> 'withdrawn' or v_d ->> 'withdrawn_with' is distinct from 'organization'
            or v_ver <> (x ->> 1)::integer then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'it was changed after the organization was archived'));
      elsif custom.work_approval_withdrawal(p_organization_id, v_d) is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval',
                    'why', custom.work_approval_withdrawal(p_organization_id, v_d)));
      else
        perform set_config('custom.decision_door', 'work_approval:return', true);
        update custom.record r
           set data = (r.data - 'decided_at' - 'withdrawn_by' - 'withdrawn_reason' - 'withdrawn_with' - 'outcome')
                      || '{"state":"pending"}'::jsonb
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        perform set_config('custom.decision_door', '', true);
        v_back_a := v_back_a + 1;
      end if;
    end loop;

    -- b. ASSIGNMENTS: back to the same person only if the record is live, nobody reassigned it and
    --    that person record is still live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,assignments}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'the record was archived'));
      elsif nullif(v_d ->> 'assignee', '') is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'it was assigned again since'));
      elsif not exists (select 1 from custom.record pr
                         where pr.organization_id = p_organization_id and pr.id::text = x ->> 1
                           and pr.table_id = custom.person_kernel_id() and pr.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'that person is no longer here'));
      else
        update custom.record r
           set data = r.data || jsonb_build_object('assignee', x ->> 1)
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        v_back_w := v_back_w + 1;
      end if;
    end loop;

    -- c. SIGNATURE REQUESTS: the same link works again only if its record is live and nothing
    --    else answered or stopped it.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,sign_requests}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the request was archived'));
      elsif v_d ->> 'invalidated_with' is distinct from 'organization' or v_d ? 'signed_at' or v_d ? 'declined_at' then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'it was answered or stopped some other way'));
      elsif not exists (select 1 from custom.record s
                         where s.organization_id = p_organization_id and s.id = nullif(v_d ->> 'record_id', '')::uuid
                           and s.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the record it asks about was archived'));
      else
        perform set_config('custom.decision_door', 'sign_request:return', true);
        update custom.record r
           set data = r.data - 'invalidated_at' - 'invalidation_reason' - 'invalidated_by' - 'invalidated_with'
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        perform set_config('custom.decision_door', '', true);
        v_back_s := v_back_s + 1;
      end if;
    end loop;

    update history.migration_log l
       set undone_at = now(), undone_by = p_by,
           inverse = l.inverse || jsonb_build_object('left', v_left)
     where l.organization_id = p_organization_id and l.id = m.id;
  end loop;

  return jsonb_build_object('events', v_events, 'approvals', v_back_a, 'assignments', v_back_w,
                            'sign_requests', v_back_s, 'left', v_left,
                            'sentence', format('%s of %s waiting item(s) came back; %s stayed withdrawn.',
                                               v_back_a + v_back_w + v_back_s, v_total, jsonb_array_length(v_left)));
end
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_create(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_email text, p_signer_name text, p_expires_in interval DEFAULT '14 days'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     record;
  v_field   jsonb;
  v_secret  bytea;
  v_id      uuid;
  v_token   text;
  v_expires timestamptz;
  v_signer  uuid;
  v_email   text := lower(btrim(coalesce(p_signer_email, '')));
  v_name    text := btrim(coalesce(p_signer_name, ''));
  v_prior   uuid;
  v_tmpl    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_create');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_create');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.sign_request_create: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.template_id, d.template_version, d.content_hash
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no such document in this organization to ask anybody to sign' using errcode = '02000',
            hint = 'A signature request is over a rendered document version. Render one first: custom.doc_render_document(organization, template, record).',
            detail = jsonb_build_object('render_id', p_render_id)::text;
  end if;

  -- THE LADDER, ASKED WHERE THE RECORD IS KNOWN — the lesson W3-DOC's own door learned the
  -- hard way (`custom.doc_sign` once named a parameter it did not have and died on line nine).
  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id,
                                          'custom.sign_request_create',
                                          'editor'::public.permission_level, 'record');

  -- VAL-10: THE FIELD IS NAMED WHEN THE ASK IS MADE, not when the signature arrives, so
  -- nobody can be asked for one signature and made to give another.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ALREADY SIGNED IS NOT A THING TO ASK ABOUT. `custom.doc_sign` would refuse at the end of
  -- the journey; refusing here means the client never gets a link that was never going to work.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, so there is nothing left to ask for',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed. A further agreement is a further Field with its own signature, or a further document version with its own seal.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'a signature request has to be addressed to somebody, and "%" is not an email address', p_signer_email
      using errcode = '23514';
  end if;
  if v_name = '' then
    raise exception 'a signature request has to name who is being asked to sign'
      using errcode = '23514',
            hint = 'The name is shown on the signing page so the person opening the link can see they are the one who was meant to.';
  end if;

  v_expires := now() + coalesce(p_expires_in, interval '14 days');
  if v_expires <= now() then
    raise exception 'a signing link has to expire in the future, and this one does not' using errcode = '22023',
            detail = jsonb_build_object('expires', v_expires)::text;
  end if;

  -- THE SIGNER'S ACCOUNT, IF THERE IS ONE. A member signing in the app and an outsider
  -- (VIS-31's external principal) reach the same link; the difference is only that we can tell
  -- the first one about it through the notification system. No account is the normal case and
  -- is never an obstacle.
  select u.id into v_signer from auth.users u where lower(u.email) = v_email limit 1;

  select coalesce(r.data ->> 'name', 'a document') into v_tmpl
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_doc.template_id
     and r.data_class = 'doc_template';

  v_secret := extensions.gen_random_bytes(32);
  v_id := extensions.gen_random_uuid();

  perform set_config('custom.decision_door', 'sign_request:create', true);
  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (p_organization_id, v_id, null, 'sign_request', jsonb_strip_nulls(jsonb_build_object(
    'render_id',        p_render_id,
    'record_id',        v_doc.record_id,
    'table_id',         v_doc.table_id,
    'template_id',      v_doc.template_id,
    'document_title',   v_tmpl,
    'field_key',        p_field_key,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_user_id',   v_signer,
    'token_hash',       encode(sha256(convert_to(
                          custom.sign_token_encode(
                            decode(replace(p_organization_id::text, '-', ''), 'hex')
                            || decode(replace(v_id::text, '-', ''), 'hex')
                            || v_secret), 'UTF8')), 'hex'),
    'document_hash',    v_doc.content_hash,
    'document_version', v_doc.template_version,
    'sent_at',          now(),
    'expires_at',       v_expires,
    'bad_attempts',     0,
    'reminder_count',   0)));
  perform set_config('custom.decision_door', '', true);

  v_token := custom.sign_token_encode(
               decode(replace(p_organization_id::text, '-', ''), 'hex')
               || decode(replace(v_id::text, '-', ''), 'hex')
               || v_secret);

  -- THE ONE AND ONLY TIME THE SECRET EXISTS OUTSIDE THE SIGNER'S EMAIL.
  return jsonb_build_object(
    'request_id',       v_id,
    'token',            v_token,
    'path',             '/sign/' || v_token,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_has_account', v_signer is not null,
    'document_title',   v_tmpl,
    'document_version', v_doc.template_version,
    'document_hash',    v_doc.content_hash,
    'expires_at',       v_expires,
    'state',            'sent');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_sign(p_token text, p_signed_name text, p_mark text, p_image text DEFAULT NULL::text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_origin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r       record;
  v_state   text;
  v_name    text := btrim(coalesce(p_signed_name, ''));
  v_mark    text := lower(btrim(coalesce(p_mark, 'typed')));
  v_file    uuid;
  v_sig     uuid;
  v_held    text;
  v_asker   uuid;
  v_src     jsonb;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    return jsonb_build_object('signed', false, 'found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_sign');

  if v_mark not in ('typed', 'drawn') then
    raise exception 'a signature is typed or drawn, and "%" is neither', p_mark
      using errcode = '23514',
            hint = 'A third way of signing would be a third thing every screen that shows a signature has to know how to draw.';
  end if;
  if v_name = '' then
    raise exception 'Please type your name as you sign.'
      using errcode = '22004',
            hint = 'VAL-10: the signature IS the Value on the record, and its text is the name the signer gave.';
  end if;
  if v_mark = 'drawn' and coalesce(p_image, '') !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$' then
    raise exception 'The drawing did not arrive. Please sign again.'
      using errcode = '22023',
            hint = 'A drawn signature reaches this door as a data: URL holding a PNG or a JPEG.';
  end if;

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    return jsonb_build_object('signed', false, 'found', true, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- DECISION 4 AGAIN, AT THE MOMENT OF SIGNING. The open may have been ten minutes ago.
  if not custom.sign_request_unchanged(v_r.organization_id, v_r.request_id) then
    perform set_config('custom.decision_door', 'sign_request:sign', true);
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at', now(),
             'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
    returning r.data into v_r.data;
    perform set_config('custom.decision_door', '', true);
    return jsonb_build_object('signed', false, 'found', true, 'state', 'invalidated',
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- DECISION 7. `custom.doc_sign` asks `editor` on the record and a signer has no principal at
  -- all, so the session takes the claims of the person who ASKED for exactly this one call and
  -- gives them back afterwards, exception path included. What gets written is the SIGNER's
  -- name and the SIGNER's provenance; the borrowed principal is only the right to write it.
  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id;
  v_held := current_setting('request.jwt.claims', true);
  begin
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;

    -- THE DRAWN MARK IS A FILE, because that is what an image is on this platform (REC-27)
    -- and because a signature people can see has to be a thing the rest of the system can
    -- show, print and attach - never a blob wedged into one feature's own column.
    --
    -- IT IS WRITTEN INSIDE THE BORROW, AND THAT IS THE SECOND HALF OF THE SAME DEFECT THE
    -- FRESHNESS CHECK HAD. Written above this block it went in with NO principal, and the
    -- record store's own insert path asks a membership question through
    -- custom.table_type_field - so the first real signature drawn in a browser came back as
    -- *"You are not a member of that organization, so custom.table_type_field has nothing to
    -- do there."* The File belongs to the ASKER's organization and is written on their
    -- behalf, exactly as the Value below is; it carries the SIGNER's name and nothing of
    -- the asker's.
    if v_mark = 'drawn' then
      insert into custom.record (organization_id, table_id, data_class, data)
      values (v_r.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
        'name',        format('Signature of %s', v_name),
        'mime_type',   split_part(split_part(p_image, ';', 1), ':', 2),
        'content',     p_image,
        'byte_size',   length(p_image),
        'kind',        'signature'))
      returning id into v_file;
    end if;

    v_sig := custom.doc_sign(v_r.organization_id, (v_r.data ->> 'render_id')::uuid,
                             v_r.data ->> 'field_key', v_name,
                             (v_r.data ->> 'signer_user_id')::uuid);

    -- THE SIGNBLOCK, COMPLETED. `custom.doc_sign` writes the Value with the render, the
    -- template, the document version and the document hash. The rest of what a certificate
    -- means - who, by what address, from where, on what browser, drawn or typed, and the
    -- drawing itself - is written here, onto the SAME Value, in the SAME transaction, by the
    -- SAME act. It is a completion of one signature's provenance, not a later actor editing a
    -- sealed one: `custom.doc_sign` refuses any second signature on this Field from here on.
    v_src := jsonb_strip_nulls(jsonb_build_object(
      'kind',             'signature',
      'request_id',       v_r.request_id,
      'render_id',        (v_r.data ->> 'render_id')::uuid,
      'template_id',      (v_r.data ->> 'template_id')::uuid,
      'document_version', (v_r.data ->> 'document_version')::integer,
      'document_hash',    v_r.data ->> 'document_hash',
      'signature_id',     v_sig,
      'signer_name',      v_name,
      'signer_email',     v_r.data ->> 'signer_email',
      'signer_user_id',   (v_r.data ->> 'signer_user_id')::uuid,
      'signed_at',        now(),
      'mark',             v_mark,
      'signature_file_id', v_file,
      'ip',               nullif(btrim(coalesce(p_ip, '')), ''),
      'user_agent',       left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512),
      'origin',           nullif(btrim(coalesce(p_origin, '')), '')));

    perform custom.record_update(v_r.organization_id, (v_r.data ->> 'record_id')::uuid,
      jsonb_build_object(
        '_actor', 'user',
        v_r.data ->> 'field_key', to_jsonb(v_name),
        '_values', jsonb_build_object(v_r.data ->> 'field_key',
                                      jsonb_build_object('src', v_src))));

    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    raise;
  end;

  perform set_config('custom.decision_door', 'sign_request:sign', true);
  update custom.record r
     set data = jsonb_strip_nulls(r.data || jsonb_build_object(
           'signed_at',         now(),
           'signed_name',       v_name,
           'signature_id',      v_sig,
           'signature_file_id', v_file,
           'signature_mark',    v_mark,
           'signer_ip',         nullif(btrim(coalesce(p_ip, '')), ''),
           'signer_user_agent', left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512)))
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id
  returning r.data into v_r.data;
  perform set_config('custom.decision_door', '', true);

  -- THE PERSON WHO ASKED IS TOLD, through the one notification system.
  if v_asker is not null then
    perform custom.agg_deliver(
      v_r.organization_id, v_r.request_id, (v_r.data ->> 'record_id')::uuid, 'in_app', v_asker,
      'custom.signature.signed',
      format('Signed: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
      format('%s signed %s.', v_name, coalesce(v_r.data ->> 'document_title', 'the document')),
      jsonb_build_object('sign_request_id', v_r.request_id, 'signature_id', v_sig,
                         'source', 'signature'));
  end if;

  return jsonb_build_object('signed', true, 'found', true, 'state', 'signed',
                            'signature_id', v_sig, 'signature_file_id', v_file,
                            'document_hash', v_r.data ->> 'document_hash',
                            'message', custom.sign_request_sentence(v_r.data));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_decline(p_token text, p_reason text DEFAULT NULL::text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r     record;
  v_state text;
  v_asker uuid;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    return jsonb_build_object('declined', false, 'found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_decline');

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    return jsonb_build_object('declined', false, 'found', true, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- A DECLINE IS AN ANSWER, NOT A FAILURE, and it ends the request as finally as a signature
  -- does. No hash check: somebody saying no to a document that has since changed is still no.
  perform set_config('custom.decision_door', 'sign_request:decline', true);
  update custom.record r
     set data = jsonb_strip_nulls(r.data || jsonb_build_object(
           'declined_at',       now(),
           'decline_reason',    nullif(btrim(coalesce(p_reason, '')), ''),
           'signer_ip',         nullif(btrim(coalesce(p_ip, '')), ''),
           'signer_user_agent', left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512)))
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id
  returning r.data into v_r.data;
  perform set_config('custom.decision_door', '', true);

  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id;
  if v_asker is not null then
    perform custom.agg_deliver(
      v_r.organization_id, v_r.request_id, (v_r.data ->> 'record_id')::uuid, 'in_app', v_asker,
      'custom.signature.declined',
      format('Declined: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
      custom.sign_request_sentence(v_r.data),
      jsonb_build_object('sign_request_id', v_r.request_id, 'source', 'signature'));
  end if;

  return jsonb_build_object('declined', true, 'found', true, 'state', 'declined',
                            'message', custom.sign_request_sentence(v_r.data));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_public(p_token text, p_origin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r      record;
  v_state  text;
  v_body   text;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    -- ONE ANSWER FOR THREE QUESTIONS, ON PURPOSE: a link that was never ours, one whose
    -- request is gone, and one whose secret is wrong. Telling them apart would make the link
    -- a way to learn that something is there. The fourth — a store that is switched off —
    -- left this sentence below, because the signer was SENT this address.
    return jsonb_build_object('found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;

  if not custom.store_is_open(v_r.organization_id) then
    return jsonb_build_object(
      'found', true, 'state', 'unavailable', 'signable', false,
      'message', custom.store_off_sentence(v_r.organization_id));
  end if;

  v_state := custom.sign_request_state(v_r.data);

  -- DECISION 4, ON EVERY OPEN: has the record moved since the ask?
  if v_state in ('sent', 'viewed') then
    if not custom.sign_request_unchanged(v_r.organization_id, v_r.request_id) then
      perform set_config('custom.decision_door', 'sign_request:view', true);
      update custom.record r
         set data = r.data || jsonb_build_object(
               'invalidated_at', now(),
               'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
       where r.organization_id = v_r.organization_id and r.id = v_r.request_id
      returning r.data into v_r.data;
      perform set_config('custom.decision_door', '', true);
      v_state := 'invalidated';
    end if;
  end if;

  -- VIEWED IS WRITTEN ONCE. "They have seen it" is the fact; "they looked again" is not.
  if v_state = 'sent' then
    perform set_config('custom.decision_door', 'sign_request:view', true);
    update custom.record r
       set data = r.data || jsonb_build_object('viewed_at', now())
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
       and not (r.data ? 'viewed_at')
    returning r.data into v_r.data;
    perform set_config('custom.decision_door', '', true);
    v_state := 'viewed';
  end if;

  -- THE DOCUMENT IS THE FROZEN ONE. What the signer reads is the text that was rendered when
  -- the ask was made and whose hash they will be sealing - never a fresh render, which is the
  -- whole difference between a signature and a screenshot.
  select d.body into v_body
    from custom.doc_render d
   where d.organization_id = v_r.organization_id
     and d.id = (v_r.data ->> 'render_id')::uuid;

  return jsonb_build_object(
    'found',            true,
    'state',            v_state,
    'signable',         v_state in ('sent', 'viewed'),
    'message',          case when v_state in ('sent','viewed') then null
                             else custom.sign_request_sentence(v_r.data) end,
    'document_title',   v_r.data ->> 'document_title',
    'document_version', (v_r.data ->> 'document_version')::integer,
    'document_hash',    v_r.data ->> 'document_hash',
    'body',             coalesce(v_body, ''),
    'signer_name',      v_r.data ->> 'signer_name',
    'signer_email',     v_r.data ->> 'signer_email',
    'expires_at',       v_r.data ->> 'expires_at',
    'signed_name',      v_r.data ->> 'signed_name',
    'signed_at',        v_r.data ->> 'signed_at');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_cancel(p_organization_id uuid, p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_cancel');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_cancel');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no such signature request in this organization' using errcode = '02000',
            detail = jsonb_build_object('request_id', p_request_id)::text;
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_cancel',
                                          'editor'::public.permission_level, 'record');

  -- A FINISHED ANSWER IS NOT CANCELLED. Signed is signed; declined is an answer too.
  if custom.sign_request_state(v_r.data) in ('signed', 'declined') then
    raise exception 'this request was already answered - %', custom.sign_request_sentence(v_r.data)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed, and a decline is an answer rather than a failure. Ask again with a new document version if the agreement changed.';
  end if;

  perform set_config('custom.decision_door', 'sign_request:cancel', true);
  update custom.record r
     set data = r.data || jsonb_build_object(
           'invalidated_at', now(),
           'invalidation_reason', coalesce(nullif(btrim(p_reason), ''),
             'This signature request was withdrawn by the organization that sent it, so the link no longer works.'))
   where r.organization_id = p_organization_id and r.id = p_request_id;
  perform set_config('custom.decision_door', '', true);

  return jsonb_build_object('request_id', p_request_id, 'state', 'invalidated');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_remind(p_organization_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r     record;
  v_state text;
  v_n     uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_remind');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_remind');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no such signature request in this organization' using errcode = '02000',
            detail = jsonb_build_object('request_id', p_request_id)::text;
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_remind',
                                          'editor'::public.permission_level, 'record');

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    -- NOTHING FAILS SILENTLY, AND NOTHING PRETENDS EITHER. There is nothing to remind about.
    return jsonb_build_object('reminded', false, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- REMINDERS GO THROUGH THE NOTIFICATION SYSTEM THAT ALREADY EXISTS — `custom.agg_deliver`,
  -- which writes `communication.notification`, the one sender with the one retry policy. Its
  -- dedupe key is (rule, record, day), so passing the REQUEST as the rule holds this to one
  -- reminder per request per day without a counter anybody has to trust.
  if (v_r.data ->> 'signer_user_id') is null then
    -- ABSENT, NEVER DEAD. We cannot notify somebody who has no account here, and the store
    -- says so in words rather than returning a cheerful null.
    return jsonb_build_object(
      'reminded', false, 'state', v_state,
      'message', format('%s does not have an account here, so there is nothing to send them through the app. Send them the signing link again yourself - it is the same link, and it works until %s.',
                        v_r.data ->> 'signer_email',
                        to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')));
  end if;

  v_n := custom.agg_deliver(
    p_organization_id, p_request_id, (v_r.data ->> 'record_id')::uuid, 'in_app',
    (v_r.data ->> 'signer_user_id')::uuid, 'custom.signature.reminder',
    format('Still waiting on your signature: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
    format('%s is waiting for you to sign %s. The link works until %s.',
           coalesce(v_r.data ->> 'signer_name', 'Somebody'),
           coalesce(v_r.data ->> 'document_title', 'a document'),
           to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')),
    jsonb_build_object('sign_request_id', p_request_id, 'source', 'signature'));

  perform set_config('custom.decision_door', 'sign_request:remind', true);
  update custom.record r
     set data = r.data || jsonb_build_object(
           'reminded_at', now(),
           'reminder_count', coalesce((r.data ->> 'reminder_count')::integer, 0) + 1)
   where r.organization_id = p_organization_id and r.id = p_request_id;
  perform set_config('custom.decision_door', '', true);

  return jsonb_build_object('reminded', true, 'state', v_state, 'notification_id', v_n,
                            'message', 'Reminder sent.');
end;
$function$;

CREATE OR REPLACE FUNCTION custom._sign_request_resolve(p_token text)
 RETURNS TABLE(organization_id uuid, request_id uuid, data jsonb, ok boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_asker uuid;
  v_b   bytea := custom.sign_token_decode(p_token);
  v_org uuid;
  v_id  uuid;
  v_d   jsonb;
  v_n   integer;
begin
  if v_b is null then
    return;                      -- a link that is not one of ours resolves to nothing at all
  end if;
  v_org := encode(substring(v_b from 1 for 16), 'hex')::uuid;
  v_id  := encode(substring(v_b from 17 for 16), 'hex')::uuid;

  -- THE POINT READ. `custom.record`'s primary key is (organization_id, id) and the store is
  -- hash partitioned on organization_id, so this prunes to ONE partition. That is the whole
  -- reason the token carries its own address.
  select r.data into v_d
    from custom.record r
   where r.organization_id = v_org and r.id = v_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_d is null then
    return;
  end if;

  if (v_d ->> 'token_hash') is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    -- The wrong-secret counter is a write into custom.record too, so it needs the same
    -- identity for the same reason, one statement earlier.
    select r.created_by into v_asker
      from custom.record r
     where r.organization_id = v_org and r.id = v_id;
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;
    -- DECISION 6: the wrong secret aimed at a real request is counted, and at ten the request
    -- is stopped. The caller still gets nothing back, so this leaks no fact about the request.
    v_n := coalesce((v_d ->> 'bad_attempts')::integer, 0) + 1;
    perform set_config('custom.decision_door', 'sign_request:resolve', true);
    update custom.record r
       set data = r.data || jsonb_build_object('bad_attempts', v_n)
                         || case when v_n >= 10 and not (r.data ? 'signed_at')
                                   and not (r.data ? 'declined_at') and not (r.data ? 'invalidated_at')
                                 then jsonb_build_object(
                                   'invalidated_at', now(),
                                   'invalidation_reason', 'This link was tried with the wrong address ten times, so it was stopped. Ask whoever sent it for a new one.')
                                 else '{}'::jsonb end
     where r.organization_id = v_org and r.id = v_id;
    perform set_config('custom.decision_door', '', true);
    return;
  end if;

  -- ══ THE SESSION BECOMES THE PERSON WHO ASKED, HERE, ONCE ══════════════════════
  -- THE DEFECT THIS CLOSES, measured three times in one browser session on 2026-09-20 and
  -- each time with the store's own sentence — *"You are not a member of that organization,
  -- so custom.table_type_field / custom.applicable_fields has nothing to do there."*
  --
  -- The three signing doors are SERVER-LANE: their caller is `service_role` holding no
  -- claims at all, which is the whole point, because the signer's address and browser have
  -- to be read off the request rather than asserted by a browser. But EVERY write they make
  -- lands in `custom.record`, and the record store asks a MEMBERSHIP question on the way in
  -- and on the way out — `custom.table_type_field` inside the merge, `custom.io_record_changed`
  -- inside the update trigger, `custom.applicable_fields` inside that. So a caller with no
  -- principal is not a member of any organization on the platform, correctly, and the first
  -- three writes each failed at a different one of those places.
  --
  -- Patching them one at a time was fixing instances. The CLASS is: *a server-lane door
  -- acting on a signature request acts on the ASKER's own record, and must therefore act as
  -- the asker.* This is the one place where the request's identity is established, so it is
  -- the one place the session takes that identity — AGT-N-5, and the same borrow
  -- `custom.anon_clear` makes for a stranger's form answer.
  --
  -- WHY IT IS NOT RESTORED HERE. `set_config(..., is_local => true)` is scoped to the
  -- TRANSACTION, and these three doors are each the whole of one: PostgREST runs one call
  -- per transaction, and Postgres unwinds the setting at its end whether the door returned
  -- or raised — a stronger guarantee than an exception handler. This function is granted to
  -- NOBODY and is called only from those three doors, so there is no other caller whose
  -- session could be changed under it.
  --
  -- WHAT IT DOES NOT GRANT. The asker is borrowed to WRITE THE ASKER'S OWN RECORD, and the
  -- doors write nothing else: the signature Value, its seal, the File holding the drawn mark
  -- and the request's own answer. It never borrows to READ anything back to the signer — what
  -- the signer is shown is the frozen body of `custom.doc_render` and nothing more.
  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_org and r.id = v_id;
  if custom.query_principal() is null and v_asker is not null then
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
  end if;

  organization_id := v_org; request_id := v_id; data := v_d; ok := true;
  return next;
end;
$function$;
