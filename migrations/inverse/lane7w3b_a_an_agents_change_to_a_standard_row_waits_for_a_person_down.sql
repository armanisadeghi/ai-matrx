-- inverse of lane7w3b_a_an_agents_change_to_a_standard_row_waits_for_a_person.sql — removes each fragment
-- (asserted), puts custom.work_approval_kinds back, drops the two new functions and their declarations.
-- Refused while an entity_row_change approval is still pending (it would be approved and do nothing).
set local lock_timeout = '3s';
do $$
begin
  if exists (select 1 from custom.record r where r.data_class = 'work_approval' and r.deleted_at is null
              and r.data #>> '{change,kind}' = 'entity_row_change' and coalesce(r.data ->> 'state', 'pending') = 'pending') then
    raise exception 'A change to a standard record is still waiting for a person; decide it first. Nothing was changed.' using errcode = '55000';
  end if;
end $$;
do $do$
declare
  r     record;
  v_def text;
  v_n   integer;
begin
  for r in select * from (values
    ($w3b$custom.work_approval_request(uuid,uuid,jsonb,text,uuid,text,uuid)$w3b$,
     $w3b$  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
  -- LANE7-W3B[q1]: A CHANGE TO A STANDARD ROW (a CRM person, …) is not a record of this store; it is
  -- filed by custom._entity_change_file, only after custom.entity_row_propose tried it as the caller.
  if v_kind = 'entity_row_change' then
    return custom._entity_change_file(p_organization_id, p_subject_id, p_change, p_note, p_approver_id,
                                      v_origin, p_conversation_id);
  end if;
$w3b$,
     $w3b$  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
$w3b$),
    ($w3b$custom.work_approval_decide(uuid,uuid,boolean,text)$w3b$,
     $w3b$                             'record_restore_version', 'subscription_add',
                             'entity_row_change');   -- LANE7-W3B[d1]
$w3b$,
     $w3b$                             'record_restore_version', 'subscription_add');
$w3b$),
    ($w3b$custom.work_approval_decide(uuid,uuid,boolean,text)$w3b$,
     $w3b$    elsif v_kind = 'entity_row_change' then
      -- LANE7-W3B[d2]: A STANDARD ROW, THROUGH ITS ONE WRITE DOOR, IN THIS TRANSACTION. The custom-field
      -- guard judges the values for the person deciding; a stale version or a refused value rolls the
      -- decision back in the store's own words.
      v_fill := custom.entity_row_write(p_organization_id, v_change ->> 'token', v_subject,
                  coalesce(v_change -> 'columns', '{}'::jsonb), coalesce(v_change -> 'custom', '{}'::jsonb),
                  nullif(v_change ->> 'expected_version', '')::integer,
                  case when jsonb_typeof(v_change -> 'archive') = 'boolean' then (v_change ->> 'archive')::boolean end);
      v_fill := null;
      v_written := array[v_subject];
      v_outcome := case when jsonb_typeof(v_change -> 'archive') = 'boolean' and (v_change ->> 'archive')::boolean
                        then format('Archived. %s can be put back.', coalesce(v_row.data ->> 'subject_title', 'That record'))
                        when jsonb_typeof(v_change -> 'archive') = 'boolean'
                        then format('Put back. %s is here again.', coalesce(v_row.data ->> 'subject_title', 'That record'))
                        else format('Applied. %s has the new values.', coalesce(v_row.data ->> 'subject_title', 'That record')) end;
    elsif v_kind = 'doc_template_add' then
$w3b$,
     $w3b$    elsif v_kind = 'doc_template_add' then
$w3b$)
  ) t(fn, old_frag, new_frag)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n = 0 then
      continue;   -- already without this edit
    end if;
    if v_n <> 1 then
      raise exception 'LANE7-W3B inverse: % carries the fragment % times', r.fn, v_n;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end
$do$;

CREATE OR REPLACE FUNCTION custom.work_approval_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- EVERY KIND THE ONE QUEUE CAN HOLD, AND THE ONLY PLACE THE SET IS WRITTEN.
  -- A kind here has an arm in custom.work_approval_decide; a kind without one would be
  -- approved and then do nothing, which is the dead end this store keeps refusing.
  -- VISION-REACH W4 (c): `record_restore_version` (a record, or one value, put back to an earlier version)
  -- and `subscription_add` (a saved view and the notifications on it) — the agent client filed both and this
  -- list refused them (22023), so the agent's change was neither applied nor waiting. Both have an arm now.
  -- `signature_request` stays out on purpose: its link is shown once to whoever makes it, so approving
  -- could hand it to nobody; the client now tells the person to ask for the signature themselves.
  select array['record_patch', 'record_add', 'field_add',
               'record_delete', 'record_restore', 'table_add',
               'doc_template_add', 'record_restore_version', 'subscription_add']::text[];
$function$;

DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name IN ('entity_row_propose', '_entity_change_file');
DROP FUNCTION IF EXISTS custom.entity_row_propose(uuid, text, uuid, jsonb, jsonb, integer, boolean, text, uuid);
DROP FUNCTION IF EXISTS custom._entity_change_file(uuid, uuid, jsonb, text, uuid, text, uuid);
