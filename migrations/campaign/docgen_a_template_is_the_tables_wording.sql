-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.doc_unresolved_tokens(uuid, uuid, text) 0609d7e7c597e08401111738d90ddf7f6ba11e2c139080a223708ba7f88967cd
-- based-on: custom.work_approval_kinds() 713130e7454699f793773a41b0e61c54011f4624522bdee8cd70a6f5aa474605
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 3c2bf27b70e095d1c4f010b9d64d9fd82ea7d6ff2643a328b8343ea6db9636ac
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) 47702a2508f1efc21599354ebefe0426f0a7784b2c6087646dfa17b036836043
--
-- LANE DOCGEN — PRODUCT #5. "TURN THIS JOB INTO A PROPOSAL WITH OUR LETTERHEAD."
--
-- Everything a person needs for that sentence already existed on 2026-09-20 except three
-- things, and this file is those three. Measured on the main database before it:
--
--  1. A TOKEN THAT NAMES A COLUMN BY WORD WAS NOT A TOKEN AT ALL, AND THE MERGE LIED.
--     `custom.doc_token_pattern()` matches `{{field:<uuid>}}` and nothing else — which is
--     REC-68 and is right, because an id is why renaming a column never breaks a template.
--     But `{{field:salary}}` therefore passed `custom.doc_template_save` untouched, was not
--     in `custom.doc_unresolved_tokens`, and RENDERED INTO THE DOCUMENT AS ITSELF. A
--     proposal handed to a customer with `{{field:salary}}` printed in it is the merge
--     lying about what it merged, and it is the one failure product #5 cannot have. It is
--     now refused AT SAVE, in the same sentence and the same place as a wrong id, with the
--     table's real columns listed — so one refusal teaches both mistakes and an agent that
--     wrote the wrong word fixes it in one more call instead of shipping it.
--
--  2. THERE WAS NO LETTERHEAD ANYWHERE, AND THE ORGANIZATION ALREADY HAD ONE.
--     `iam.organizations` carries `name`, `logo_url`, `logo_file_id`, `website`,
--     `description` and `abbreviation` — the branding a person already filled in on the
--     organization settings screen — and nothing read them for a document.
--     `custom.doc_letterhead` reads exactly those, so a letterhead is never a second place
--     to type a company name. When an organization has set none of it, the knob
--     `custom/document_letterhead` supplies the rest (an address, a phone, a footer line)
--     and the door SAYS which of the two answered, so a screen or an agent never presents
--     a default as the company's own.
--
--  3. A DOCUMENT TEMPLATE IS THE TABLE'S OWN WORDING AND COULD NOT WAIT FOR A PERSON.
--     `custom.work_approval_kinds()` held six kinds and none of them was a template, so an
--     organization on `always_ask` had an agent that could write the words of its
--     customer-facing proposal with nobody asked. A template now waits exactly as a new
--     column does: it hangs on the TABLE, its approvers resolve on the one ladder
--     (`custom.work_approval_approvers`), the card carries the whole template so a person
--     signs for the words they were shown, and approving runs `custom.doc_template_save`
--     with those bytes — every refusal of that door included.
--
-- NOTHING IS DROPPED, RENAMED OR REVOKED. Four replacements, each based-on-verified against
-- the live body, each keeping every existing branch; two new functions; one new door row.

-- ─────────────────────────────────────────────── 1. the word-shaped token ──

-- `{{field:<a word>}}` — the shape a model writes when it has not been given the ids, and
-- the shape a person writes by hand. It is NEVER a merge (REC-68 keeps the id), so naming
-- it is the only way to refuse it.
create or replace function custom.doc_name_token_pattern()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select '\{\{field:([A-Za-z][A-Za-z0-9 _.:-]{0,63})\}\}';
$function$;

create or replace function custom.doc_name_tokens(p_body text)
 RETURNS TABLE(ordinal integer, raw text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- A uuid starts with a hex digit or a letter, so the pattern above can also match one:
  -- the uuid arm owns those and this one must not claim them twice.
  select row_number() over ()::integer, '{{field:' || m[1] || '}}'
    from regexp_matches(coalesce(p_body, ''), custom.doc_name_token_pattern(), 'gi') m
   where m[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

-- The refusal that teaches, extended to the word-shaped token.
CREATE OR REPLACE FUNCTION custom.doc_unresolved_tokens(p_organization_id uuid, p_table_id uuid, p_body text)
 RETURNS TABLE(raw text, field_id uuid, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- ── TOKENS THAT NAME A FIELD ID AND GET IT WRONG (the original arm) ───────────
  select distinct t.raw, t.field_id,
         case when f.id is null
                then 'there is no Field with that id in this organization'
              else 'that Field belongs to another table'
         end
    from custom.doc_tokens(p_body) t
    left join custom.field f
      on f.organization_id = p_organization_id and f.id = t.field_id
   where f.id is null or f.entity_definition_id is distinct from p_table_id
  union
  -- ── TOKENS THAT NAME A COLUMN BY WORD, WHICH IS NOT A MERGE AT ALL ────────────
  -- MEASURED 2026-09-20, lane DOCGEN. `custom.doc_token_pattern()` requires a uuid, so
  -- `{{field:salary}}` was NOT a token: it passed the save untouched and rendered into a
  -- customer's proposal AS THE LITERAL TEXT `{{field:salary}}`. A merge that prints its own
  -- plumbing into a document somebody is about to sign is the merge lying, which is the one
  -- thing product #5 may not do. It is refused here, at save, with the real columns listed —
  -- the same place and the same sentence as a wrong id, so one refusal teaches both.
  select distinct n.raw, null::uuid,
         'that names no column of this table'
    from custom.doc_name_tokens(p_body) n;
$function$;

-- ────────────────────────────────── 3. a template waits like a column ──

CREATE OR REPLACE FUNCTION custom.work_approval_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- EVERY KIND THE ONE QUEUE CAN HOLD, AND THE ONLY PLACE THE SET IS WRITTEN.
  -- A kind here has an arm in custom.work_approval_decide; a kind without one would be
  -- approved and then do nothing, which is the dead end this store keeps refusing.
  select array['record_patch', 'record_add', 'field_add',
               'record_delete', 'record_restore', 'table_add',
               'doc_template_add']::text[];
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
  v_conv    := nullif(v_row.data ->> 'conversation_id', '')::uuid;

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

-- ───────────────────────────────────────────────────── 2. the letterhead ──

create or replace function custom.doc_letterhead(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  record;
  v_knob jsonb;
  v_out  jsonb;
  v_from text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_letterhead');
  perform custom.assert_store_door(p_organization_id, 'custom.doc_letterhead');

  select o.name, o.logo_url, o.logo_file_id, o.website, o.description, o.abbreviation
    into v_org
    from iam.organizations o
   where o.id = p_organization_id;
  if v_org.name is null then
    raise exception 'There is no such organization, so it has no letterhead.'
      using errcode = '02000';
  end if;

  -- THE ORGANIZATION'S OWN BRANDING FIRST. These are the fields a person already filled in
  -- on the organization settings screen; a document must never ask them to type a company
  -- name a second time.
  begin
    v_knob := platform.knob_resolve('custom', 'document_letterhead', p_organization_id);
  exception when others then
    v_knob := null;
  end;
  if jsonb_typeof(v_knob) is distinct from 'object' then
    v_knob := '{}'::jsonb;
  end if;

  v_out := jsonb_strip_nulls(jsonb_build_object(
    'name',        coalesce(nullif(v_knob ->> 'name', ''), v_org.name),
    'logo_url',    coalesce(nullif(v_knob ->> 'logo_url', ''), nullif(v_org.logo_url, '')),
    'logo_file_id', v_org.logo_file_id::text,
    'website',     coalesce(nullif(v_knob ->> 'website', ''), nullif(v_org.website, '')),
    'tagline',     coalesce(nullif(v_knob ->> 'tagline', ''), nullif(v_org.description, '')),
    'address',     nullif(v_knob ->> 'address', ''),
    'phone',       nullif(v_knob ->> 'phone', ''),
    'email',       nullif(v_knob ->> 'email', ''),
    'footer',      nullif(v_knob ->> 'footer', '')));

  -- WHICH OF THE TWO ANSWERED, SAID OUT LOUD. A letterhead nobody set is a DEFAULT, and a
  -- screen that presented a default as the company's own branding would be a screen lying
  -- quietly. `source` is what a caller repeats.
  v_from := case
              when v_knob <> '{}'::jsonb and (v_org.logo_url is not null or v_org.website is not null)
                then 'this organization''s branding, with its document letterhead settings over the top'
              when v_knob <> '{}'::jsonb then 'this organization''s document letterhead settings'
              when v_org.logo_url is not null or v_org.website is not null
                then 'this organization''s own branding (its name, logo and website)'
              else 'its name only - nobody has set a logo, a website or a letterhead for this organization yet'
            end;

  return v_out || jsonb_build_object(
    'source', v_from,
    'is_default', (v_knob = '{}'::jsonb and v_org.logo_url is null and v_org.website is null));
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'doc_letterhead',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry, so an organization this caller is not in is refused there by name and NULL is refused there too; custom.assert_store_door then resolves the custom/system_enabled guard. It reads ONE row of iam.organizations - that organization''s own name, logo, website and description, which every member of it can already see on the organization settings screen - with the custom/document_letterhead knob resolved at the same organization over the top. It reads no record, no document and no other tenant''s row, and it writes nothing.',
        'docgen_a_template_is_the_tables_wording.sql',
        null, true, false)
on conflict do nothing;

-- THE KNOB, so the lines an organization's branding does NOT hold (an address, a phone, a
-- footer) are a setting with a default and never a sentence typed into a template by hand.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'document_letterhead', '{}'::jsonb, '{}'::jsonb, 'json',
   'What goes at the top of this organization''s documents',
   'PRODUCTS row 5. The letterhead on a rendered document comes from this organization''s own '
   'branding first - iam.organizations.name, logo_url, website and description, which a person '
   'already filled in on the organization settings screen. This knob carries only what that row '
   'has no column for (address, phone, email, footer) and may override any of the rest. Left '
   'empty - the default - a document carries the organization''s name, its logo and its website '
   'and nothing invented, and custom.doc_letterhead says so in its `source`.',
   'agent', 'Unified data campaign, lane DOCGEN, 2026-09-20: PRODUCTS row 5.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
