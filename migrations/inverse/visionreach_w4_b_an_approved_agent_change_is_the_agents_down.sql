-- chair-step: undo visionreach_w4_b_an_approved_agent_change_is_the_agents.sql — restores custom.work_approval_decide, custom.history_actor, custom.record_history and custom.field_history exactly as they are on production 2026-10-03 (work_approval_decide carrying CHAIR-SELF-APPROVAL's decision mark; field_history carrying the "Only me" listing predicate). Reopens: an approved agent change is written and shown as the approving person's own edit, and History names no approver.
-- lane: VISION-REACH
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) 930d3b8aa5f7233013a07ed08ec261f960090be4d4ecc19053096d02ef080d9e
-- based-on: custom.history_actor(text, jsonb, uuid, jsonb) 66667b1fdedaa5701ff6454cbbc17dc5e2caf96ccd1d475c835339112193ebe8
-- based-on: custom.record_history(uuid, uuid, integer, integer) bf9e1ff866b0ecf4069ef4d3bef273825ea789f7dcb3fc86faf305a6e34e882f
-- based-on: custom.field_history(uuid, uuid, text, integer, integer, uuid) c63ddc244db970d00a5455cf17e5484499c9f48bc1f4ba3c95d1c1a5bb05ca9c
-- RE-BASED 2026-10-03 on CHAIR-SELF-APPROVAL (chairselfapproval_a_decision_is_made_at_its_own_door.sql, live): work_approval_decide / work_approval_request keep its custom.decision_door mark around the one statement that writes the approval row; this file's changes are otherwise unchanged.

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

CREATE OR REPLACE FUNCTION custom.history_actor(p_tier text, p_document jsonb, p_actor_id uuid, p_people jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with envelope as (
    select e.value ->> 'actor'        as word,
           e.value ->> 'on_behalf_of' as obo
      from jsonb_each(case when jsonb_typeof(p_document -> '_values') = 'object'
                           then p_document -> '_values' else '{}'::jsonb end) e
     where jsonb_typeof(e.value) = 'object'
       and e.value ? 'actor'
     limit 1
  ),
  said as (
    select coalesce((select word from envelope),
                    custom.retired_actor_words() ->> p_tier,
                    case when p_tier in ('user', 'agent', 'system') then p_tier end,
                    'system') as kind,
           (select obo from envelope) as obo
  )
  select jsonb_build_object(
           -- user | agent | system, and nothing else is ever printed here.
           'kind', said.kind,
           'user_id', p_actor_id,
           'name', coalesce(p_people -> (p_actor_id::text) ->> 'name',
                            case said.kind when 'system' then 'the platform' else null end),
           -- AGT-N-4 / VAL-8: an agent NEVER stands alone on this screen. It names the
           -- person whose authority it carried, because that is who is answerable.
           'on_behalf_of',
           case when said.obo is null then null
                else jsonb_build_object(
                       'user_id', said.obo,
                       'name', coalesce(p_people -> said.obo ->> 'name', null))
           end)
    from said;
$function$;

CREATE OR REPLACE FUNCTION custom.record_history(p_organization_id uuid, p_record_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(version integer, occurred_at timestamp with time zone, operation text, operation_label text, actor jsonb, changes jsonb, migration_id uuid, undoable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table  uuid;
  v_people jsonb;
  v_mask   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_history');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_history',
                                        'viewer'::public.permission_level, 'record');

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  select custom.history_people(
           p_organization_id,
           array(select distinct a.id from (
                   select v.actor_id as id
                     from history.record_versions(p_organization_id, p_record_id) v
                   union
                   select (e.value ->> 'on_behalf_of')::uuid
                     from history.record_versions(p_organization_id, p_record_id) v,
                          lateral jsonb_each(
                            case when jsonb_typeof(v.row_data -> 'data' -> '_values') = 'object'
                                 then v.row_data -> 'data' -> '_values' else '{}'::jsonb end) e
                    where (e.value ->> 'on_behalf_of') is not null) a
                  where a.id is not null))
    into v_people;

  return query
    select w.version,
           w.occurred_at,
           coalesce(w.operation_name, lower(w.operation)) as operation,
           case
             when w.operation_name is not null then
               w.operation_name || case w.operation
                                     when 'SOFT_DELETE' then ' (record removed)'
                                     when 'RESTORE'     then ' (record restored)'
                                     when 'INSERT'      then ' (record created)'
                                     else '' end
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'UPDATE'      then 'edited'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else lower(w.operation)
           end as operation_label,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           -- THE MASK. A change to a field this reader may not see is still a CHANGE — the
           -- panel says "Tax ID was edited" and who edited it, which is the audit trail — but
           -- the before and the after do not leave, and the entry says why.
           coalesce((select jsonb_agg(
                              case when custom.mask_says_withheld(v_mask, c ->> 'key')
                                   then (c - 'before' - 'after' - 'alternates')
                                        || custom.withheld_marker(v_mask, c ->> 'key')
                                   else c end
                              order by ord)
                       from jsonb_array_elements(
                              custom.history_changes(p_organization_id, v_table,
                                                     coalesce(w.previous_data, '{}'::jsonb),
                                                     coalesce(w.row_data -> 'data', '{}'::jsonb)))
                              with ordinality as e(c, ord)),
                    '[]'::jsonb),
           w.migration_id,
           (w.migration_id is not null
            and exists (select 1 from history.migration_log m
                         where m.id = w.migration_id
                           and m.organization_id = p_organization_id
                           and m.undone_at is null)) as undoable
      from (select v.*,
                   lag(v.row_data -> 'data') over (order by v.version) as previous_data
              from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id,
                           rv.row_data, rv.migration_id, rv.operation_name,
                           hv.actor_tier
                      from history.record_versions(p_organization_id, p_record_id) rv
                      left join lateral (
                        select h.actor_tier
                          from history.row_versions h
                         where h.entity_type = 'custom.record'
                           and h.organization_id = p_organization_id
                           and h.row_id = p_record_id
                           and h.version = rv.version
                           and h.occurred_at = rv.occurred_at
                         limit 1) hv on true) v) w
     order by w.version desc, w.occurred_at desc
     limit custom.page_size(p_organization_id, 'custom.record_history', p_limit, 200, 500)
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.field_history(p_organization_id uuid, p_table_id uuid, p_field_key text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_record_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(record_id uuid, record_title text, version integer, occurred_at timestamp with time zone, operation_label text, actor jsonb, before jsonb, after jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_people jsonb;
  v_titlek text;
  v_sql    text;
  v_ids    uuid[];
  v_me     uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.field_history');

  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.field_history: name the column whose history you want.'
      using errcode = '22004',
            hint = 'custom.applicable_fields(organization, table, null) lists this table''s columns with their keys.';
  end if;

  if not exists (select 1
                   from custom.applicable_fields(p_organization_id, p_table_id, null) f
                  where (f.data ->> 'key') = p_field_key) then
    raise exception 'This table has no column called "%", so there is no history of it.', p_field_key
      using errcode = '22023',
            hint = 'Check the column''s name on the table''s own settings panel — the history is kept per column key, and a renamed column keeps the key it was declared with.';
  end if;

  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();

  v_sql := format(
    'select array_agg(r.id) from custom.record r
      where r.organization_id = %L::uuid and r.table_id = %L::uuid and %s %s',
    p_organization_id, p_table_id,
    custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    case when p_record_id is null then ''
         else format('and r.id = %L::uuid', p_record_id) end);
  execute v_sql into v_ids;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  select custom.history_people(
           p_organization_id,
           array(select distinct h.actor_id
                   from history.row_versions h
                  where h.entity_type = 'custom.record'
                    and h.organization_id = p_organization_id
                    and h.row_id = any (v_ids)
                    and h.actor_id is not null))
    into v_people;

  return query
  with masks as (
    -- ONE mask per record this person may see, and nothing more: the id set is already the
    -- read door's own answer, so this adds the FIELD question to the ROW question.
    select i.id as row_id, custom.read_mask(p_organization_id, i.id, 'read') as m
      from unnest(v_ids) i(id)
  )
    select w.row_id,
           coalesce(nullif(btrim(coalesce(
                      case when v_titlek is null then null
                           else custom._card_words(p_organization_id, w.row_data -> 'data' ->> v_titlek, 'record') end, '')), ''),
                    'Untitled'),
           w.version,
           w.occurred_at,
           case
             when w.operation_name is not null then w.operation_name
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else 'edited'
           end,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.previous_data -> p_field_key end,
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.row_data -> 'data' -> p_field_key end
      from (select h.row_id, h.version, h.operation, h.operation_name, h.occurred_at,
                   h.actor_id, h.actor_tier, h.row_data,
                   lag(h.row_data -> 'data') over (partition by h.row_id order by h.version)
                     as previous_data
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = any (v_ids)) w
      join masks mk on mk.row_id = w.row_id
     where (coalesce(w.previous_data, '{}'::jsonb) -> p_field_key)
             is distinct from (coalesce(w.row_data -> 'data', '{}'::jsonb) -> p_field_key)
     order by w.occurred_at desc, w.row_id, w.version desc
     limit custom.page_size(p_organization_id, 'custom.field_history', p_limit, 100, 500)
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;
