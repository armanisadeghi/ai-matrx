-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) e7b6c33998d2d03a6ed9385a6c7dd24e162d9f16b6cf7d2292b6c598309e1bef
-- based-on: custom.undeclared_keys(uuid, uuid, jsonb) fd1ae43c091acc9ec6810c3be19e325d99d2272ec7f4c3dbaab0ec3995d67d49
--
-- FIELD-TRUTH — TWO THINGS THE CLAIMED-COLUMN RULE FOUND ONCE IT WAS ASKED AT THE DOOR.
--
-- 1. APPROVING AN AGENT'S NEW COLUMN LEFT THE TABLE CLAIMING IT FOR ONE STATEMENT.
-- `custom.work_approval_decide` wrote the NAME into the table's `fields` list and then, in
-- the NEXT statement, defined the column. Between those two statements the table claimed a
-- column no Field record backed — no type, no rules, no validation, never answered by
-- `custom.applicable_fields`, never drawn by a grid. That is crew E's defect (Cascade
-- Electronics Recovery, `client_site` and `pickup`) reached through a different door, and
-- `custom.assert_columns_are_defined` refused it out loud: *"Estimates says it has a column
-- called "rate_card", and there is no such field"* — `workdoors_green.sql` PART 5, an
-- agent's Rate card proposal being approved.
-- The pre-add was REDUNDANT as well as wrong: `custom.field_declare` appends the name to the
-- table's list itself, in the same call that writes the definition. That is the whole point
-- of there being ONE door for a column, and it is now the only thing this path does.
--
-- 2. `custom.undeclared_keys` WAS RE-PLANNED ON EVERY WRITE. It is on the write path — the
-- undeclared-key guard calls it for every record — and it was `LANGUAGE sql` with a
-- `SET search_path`, which makes it non-inlinable, so PostgreSQL re-planned its body on
-- every call: the plan cache of a non-inlined SQL function lives for the calling query, not
-- the session. `custom.ladder_replanners` names it and `writeperf2_green.sql` clause 9 fails
-- the whole write path on it. The body is identical, moved into plpgsql, which is the exact
-- remedy that census prints (LADDER-PERF measured 7.24 ms -> 1.36 ms doing this).
--
-- REC-1 / REC-51.

CREATE OR REPLACE FUNCTION custom.undeclared_keys(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys text[];
begin
  -- EVERY Field row of the Table, not custom.applicable_fields: a Value for a Field that
  -- does not apply to THIS record's type is a different question entirely, and
  -- custom._record_field_validation's retype path already answers it by moving the value
  -- into `_retired` with its reason. Asking applicable_fields here would call such a value
  -- undeclared and refuse a write that is perfectly legal.
  select coalesce(array_agg(k.key order by k.key), array[]::text[])
    into v_keys
    from jsonb_object_keys(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) k(key)
   where left(k.key, 1) <> '_'
     and not (k.key = any (custom.record_platform_keys()))
     and not exists (
           select 1
             from custom.record f
            where f.organization_id = p_organization_id
              and f.table_id = custom.field_kernel_id()
              and f.data_class = 'field'
              and f.deleted_at is null
              and f.data ->> 'entity_definition_id' = p_table_id::text
              and f.data ->> 'key' = k.key);
  return v_keys;
end;
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
$function$

;
