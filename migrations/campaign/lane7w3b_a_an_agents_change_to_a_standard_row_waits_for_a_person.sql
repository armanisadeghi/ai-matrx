-- chair-step: functions only. Creates custom.entity_row_propose (SECURITY INVOKER, granted to signed-in
-- callers) and custom._entity_change_file (SECURITY DEFINER, revoked from clients); replaces
-- custom.work_approval_kinds (one more kind); edits two live bodies by asserted fragment:
-- custom.work_approval_request (one early branch for the new kind) and custom.work_approval_decide (its
-- arm, and the kind joins the agent-credit list). No table DDL, no policy change.
-- GRANT NAMED: EXECUTE on custom.entity_row_propose to authenticated (an invoker door: the table's own
-- row rules decide; declared in platform.client_callable_door).
-- lock: custom
-- based-on: custom.work_approval_kinds() 37157b377f0e1e3365cee1d28b8ea0e1f3edf0e66b5db4cd1c228ffbb7a8d26d
--
-- LANE FINISH-THE-SWITCH · FTS-2 · WAVE 3b (a) — AN AGENT'S CHANGE TO A STANDARD ROW WAITS FOR A PERSON.
-- Design: common-docs/projects/data-doctrine-adoption/v6/DESIGN-STANDARD-TABLES-W3.md §2 "AI clients" / §6 3b;
-- chair ruling 2026-10-02 10:40 (agent writes to standard rows are approved like custom ones, through the
-- organization's custom.agent_change_approval and the one queue work_approval_request / _decide).
--
-- THE ONE DOOR: custom.entity_row_propose(org, token, id, columns, custom, expected_version, archive, note,
-- conversation). SECURITY INVOKER, so every read and the tried write are the caller's own.
--   * A PERSON (declared tier is not `agent`) writes straight through custom.entity_row_write — the door
--     the app and REST already use. A personal-key caller IS the person (chair ruling 2026-10-03).
--   * AN AGENT asks custom.agent_change_approval about the row's organization. `never_ask` writes; any
--     other setting waits: a standard table always existed before the conversation, so it is never the
--     agent's own table. The change is TRIED as the caller first (a savepoint that always rolls back) —
--     a change the store would refuse is never filed (lane HANDOVER's rule), and a row the caller may not
--     change is refused in the table's own words. Then it is filed as `entity_row_change`.
-- custom.work_approval_request hands that kind to custom._entity_change_file, which files it only when the
-- invoker door tried it in this transaction (custom.entity_change_tried = the row id); the approvers are
-- the queue's own (named person, admin on it, owners/admins of the organization).
-- custom.work_approval_decide applies it with custom.entity_row_write, in the decision's transaction —
-- the custom-field guard still judges the values for the approver (auth.uid()), and the version history
-- is marked `approved agent change` as for every agent kind.
set local lock_timeout = '3s';

-- ── 1. THE KIND ──────────────────────────────────────────────────────────────────────────
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
  -- LANE7-W3B: `entity_row_change` — an agent's change to a STANDARD row (a CRM person, …), filed only by
  -- custom.entity_row_propose and applied by custom.entity_row_write.
  select array['record_patch', 'record_add', 'field_add',
               'record_delete', 'record_restore', 'table_add',
               'doc_template_add', 'record_restore_version', 'subscription_add',
               'entity_row_change']::text[];
$function$;

-- ── 2. FILING IT (definer; reached only through work_approval_request) ─────────────────────
CREATE OR REPLACE FUNCTION custom._entity_change_file(p_organization_id uuid, p_subject_id uuid, p_change jsonb,
                                                      p_note text, p_approver_id uuid, p_origin text,
                                                      p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_token text := nullif(p_change ->> 'token', '');
  t       record;
  v_org   uuid;
  v_title text;
  v_who   jsonb;
  v_id    uuid;
begin
  -- LANE7-W3B: TRIED FIRST, AS THE CALLER. custom.entity_row_propose (SECURITY INVOKER) ran the change
  -- through custom.entity_row_write as the person and rolled it back; only then is it filed. A request
  -- that did not come that way was never tried as anybody, so it is not filed.
  if coalesce(current_setting('custom.entity_change_tried', true), '') is distinct from p_subject_id::text then
    raise exception 'A change to a standard record is asked for through custom.entity_row_propose, which tries it as you first. Nothing was filed.'
      using errcode = '42501';
  end if;
  perform set_config('custom.entity_change_tried', '', true);

  if p_origin not in ('person', 'agent') then
    raise exception 'An approval comes from a person or from an agent, and "%" is neither.', p_origin
      using errcode = '22023';
  end if;
  if p_origin = 'agent' and platform.declared_actor_tier() is distinct from 'agent' then
    raise exception 'This was asked for by a person, so it waits for somebody else to approve it, not as an agent''s request.'
      using errcode = '42501';
  end if;
  if v_token is null then
    raise exception 'A change to a standard record names its table''s token.' using errcode = '22004';
  end if;
  if (jsonb_typeof(coalesce(p_change -> 'columns', '{}'::jsonb)) <> 'object')
     or (jsonb_typeof(coalesce(p_change -> 'custom', '{}'::jsonb)) <> 'object') then
    raise exception 'A change to a standard record names its values as {"name": value}.' using errcode = '22023';
  end if;
  if coalesce(p_change -> 'columns', '{}'::jsonb) = '{}'::jsonb
     and coalesce(p_change -> 'custom', '{}'::jsonb) = '{}'::jsonb
     and jsonb_typeof(p_change -> 'archive') is distinct from 'boolean' then
    raise exception 'A change waiting for approval has to say what it would change.' using errcode = '22004';
  end if;

  select * into t from custom.entity_table(v_token);
  execute format('select x.organization_id, %s from %I.%I x where x.id = $1',
                 case when t.title_column is null then 'null::text' else format('x.%I::text', t.title_column) end,
                 t.schema_name, t.table_name)
    into v_org, v_title using p_subject_id;
  if v_org is null or v_org is distinct from p_organization_id then
    raise exception 'There is no % in this organization with that id, so there is nothing to approve.', t.label
      using errcode = '02000';
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
            hint = 'Name an approver, or ask an owner of the organization to give somebody admin on it.';
  end if;

  perform set_config('custom.decision_door', 'work_approval:request', true);
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_approval', jsonb_strip_nulls(jsonb_build_object(
    'subject_id',      p_subject_id::text,
    'subject_kind',    'standard_row',
    'subject_token',   t.token,
    'subject_label',   t.label,
    'subject_title',   coalesce(nullif(btrim(v_title), ''), t.label),
    'change',          p_change || jsonb_build_object('label', t.label),
    'origin',          p_origin,
    'note',            nullif(btrim(coalesce(p_note, '')), ''),
    'approver_id',     p_approver_id::text,
    'conversation_id', p_conversation_id::text,
    'requested_by',    v_me::text,
    'requested_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'state',           'pending')))
  returning id into v_id;
  perform set_config('custom.decision_door', '', true);

  if p_approver_id is not null and not custom.query_is_store_owner() then
    perform custom.share_grant(p_organization_id, v_id, 'person', p_approver_id, 'admin'::public.permission_level);
  end if;

  return jsonb_build_object(
    'approval_id',  v_id,
    'state',        'pending',
    'subject_id',   p_subject_id,
    'subject_kind', 'standard_row',
    'origin',       p_origin,
    'approvers',    v_who,
    'message',      format('This is waiting for %s.',
                      case when jsonb_array_length(v_who) = 1
                           then coalesce(v_who -> 0 ->> 'name', 'somebody')
                           else format('%s people who can approve it', jsonb_array_length(v_who)) end));
end
$function$;
REVOKE ALL ON FUNCTION custom._entity_change_file(uuid, uuid, jsonb, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. THE ONE DOOR (invoker) ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_row_propose(p_organization_id uuid, p_token text, p_record_id uuid,
                                                     p_columns jsonb DEFAULT '{}'::jsonb,
                                                     p_custom jsonb DEFAULT '{}'::jsonb,
                                                     p_expected_version integer DEFAULT NULL::integer,
                                                     p_archive boolean DEFAULT NULL::boolean,
                                                     p_note text DEFAULT NULL::text,
                                                     p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t         record;
  v_tier    text := platform.declared_actor_tier();
  v_org     uuid;
  v_policy  jsonb;
  v_tried   jsonb;
  v_labels  jsonb;
  v_filed   jsonb;
begin
  if p_record_id is null then
    raise exception 'A change names the record it changes.' using errcode = '22004';
  end if;
  select * into t from custom.entity_table(p_token);

  -- A PERSON'S CHANGE IS THE PERSON'S: the same door the app and the REST API use.
  if v_tier is distinct from 'agent' then
    return jsonb_build_object('applied', true,
             'row', custom.entity_row_write(p_organization_id, p_token, p_record_id, p_columns, p_custom,
                                            p_expected_version, p_archive));
  end if;

  -- THE ROW'S OWN ORGANIZATION, as the caller may read it.
  execute format('select x.organization_id from %I.%I x where x.id = $1', t.schema_name, t.table_name)
    into v_org using p_record_id;
  if v_org is null then
    raise exception 'There is no % you can open with that id.', t.label using errcode = '02000';
  end if;
  if p_organization_id is not null and v_org is distinct from p_organization_id then
    raise exception 'This % belongs to another organization, not to the one this call names.', t.label
      using errcode = '42501', hint = 'Leave the organization out, or name the one the record belongs to.';
  end if;

  v_policy := custom.agent_change_approval(v_org, p_conversation_id, null);
  if v_policy ->> 'setting' = 'never_ask' and not coalesce((v_policy ->> 'approval_required')::boolean, true) then
    return jsonb_build_object('applied', true, 'approval', v_policy,
             'row', custom.entity_row_write(v_org, p_token, p_record_id, p_columns, p_custom,
                                            p_expected_version, p_archive));
  end if;
  -- A standard table existed before any conversation, so it is never the agent's own table.
  if v_policy ->> 'reason' is distinct from 'caller_not_verified' then
    v_policy := v_policy || jsonb_build_object(
      'approval_required', true, 'own_table', false, 'reason', 'standard_table_needs_a_person',
      'why', format('%s records already existed in this organization, so a person is asked before an agent changes one.', t.label));
  end if;

  -- TRIED AS THE CALLER, ALWAYS ROLLED BACK. The store's refusal (rights, values, version) is raised
  -- here and nothing is filed; a change that changes nothing is answered as such and nothing waits.
  begin
    v_tried := custom.entity_row_write(v_org, p_token, p_record_id, p_columns, p_custom, p_expected_version, p_archive);
    raise exception 'entity change tried' using errcode = 'MXD02';
  exception when sqlstate 'MXD02' then
    null;
  end;
  if coalesce((v_tried ->> 'unchanged')::boolean, false) then
    return jsonb_build_object('applied', true, 'unchanged', true, 'approval', v_policy, 'row', v_tried);
  end if;

  begin
    select jsonb_object_agg(f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'name', f.data ->> 'key'))
      into v_labels
      from custom.entity_fields(v_org, p_token) f
     where coalesce(p_custom, '{}'::jsonb) ? (f.data ->> 'key');
  exception when others then
    v_labels := null;   -- the card falls back to the keys
  end;

  perform set_config('custom.entity_change_tried', p_record_id::text, true);
  v_filed := custom.work_approval_request(
    v_org, p_record_id,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', 'entity_row_change', 'token', t.token,
      'columns', coalesce(p_columns, '{}'::jsonb), 'custom', coalesce(p_custom, '{}'::jsonb),
      'labels', v_labels, 'archive', p_archive, 'expected_version', p_expected_version)),
    p_note, null, 'agent', p_conversation_id);
  return v_filed || jsonb_build_object('applied', false, 'waiting', true, 'approval', v_policy,
                                       'organization_id', v_org, 'token', t.token);
end
$function$;
-- THE DOOR REGISTER BEFORE THE GRANT (a client grant on a closed schema needs its row first).
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
SELECT d.* FROM (VALUES
  ('custom', 'entity_row_propose', 'p_organization_id uuid, p_token text, p_record_id uuid, p_columns jsonb, p_custom jsonb, p_expected_version integer, p_archive boolean, p_note text, p_conversation_id uuid',
   ARRAY['uuid'::regtype,'text'::regtype,'uuid'::regtype,'jsonb'::regtype,'jsonb'::regtype,'integer'::regtype,'boolean'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'SECURITY INVOKER: p_record_id is read and written as the caller through the table''s own row rules (custom.entity_row_write); p_organization_id must be the row''s own or is refused; an agent''s change is filed in the row''s organization.',
   'migrations/campaign/lane7w3b_a_an_agents_change_to_a_standard_row_waits_for_a_person.sql (FINISH-THE-SWITCH FTS-2 wave 3b)',
   NULL, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "position": 1, "optional": true, "null_rule": {}, "foreign": {"bounded": true, "note": "Must equal the row''s own organization (refused otherwise)."}}, "p_token": {"type": "text", "position": 2, "optional": false, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_record_id": {"type": "uuid", "position": 3, "optional": false, "null_rule": {}, "foreign": {"bounded": true, "note": "Read and changed as the caller under the table''s own row rules."}}, "p_columns": {"type": "jsonb", "position": 4, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_custom": {"type": "jsonb", "position": 5, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_expected_version": {"type": "integer", "position": 6, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_archive": {"type": "boolean", "position": 7, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_note": {"type": "text", "position": 8, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_conversation_id": {"type": "uuid", "position": 9, "optional": true, "null_rule": {}, "foreign": {"bounded": true, "note": "Only recorded on the approval; decides nothing for a standard row."}}}}'::jsonb),
  ('custom', '_entity_change_file', 'p_organization_id uuid, p_subject_id uuid, p_change jsonb, p_note text, p_approver_id uuid, p_origin text, p_conversation_id uuid',
   ARRAY['uuid'::regtype,'uuid'::regtype,'jsonb'::regtype,'text'::regtype,'uuid'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'p_subject_id: filed only when custom.entity_row_propose tried that very row as the caller in this transaction (custom.entity_change_tried); the row must be in p_organization_id.',
   'migrations/campaign/lane7w3b_a_an_agents_change_to_a_standard_row_waits_for_a_person.sql (FINISH-THE-SWITCH FTS-2 wave 3b)',
   'server_only: called only by custom.work_approval_request (definer) for the entity_row_change kind; no client grant.', false, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "position": 1, "optional": false, "null_rule": {}, "foreign": {"bounded": true, "note": "Walled by custom.work_approval_request before this runs."}}, "p_subject_id": {"type": "uuid", "position": 2, "optional": false, "null_rule": {}, "foreign": {"bounded": true, "note": "Must be the row custom.entity_row_propose tried as the caller."}}, "p_change": {"type": "jsonb", "position": 3, "optional": false, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_note": {"type": "text", "position": 4, "optional": true, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_approver_id": {"type": "uuid", "position": 5, "optional": true, "null_rule": {}, "foreign": {"bounded": true, "note": "Refused unless a member of the organization."}}, "p_origin": {"type": "text", "position": 6, "optional": false, "null_rule": {}, "foreign": {"not_an_id": true}}, "p_conversation_id": {"type": "uuid", "position": 7, "optional": true, "null_rule": {}, "foreign": {"bounded": true, "note": "Only recorded."}}}}'::jsonb)
) d(schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door c WHERE c.schema_name = d.schema_name AND c.function_name = d.function_name);

GRANT EXECUTE ON FUNCTION custom.entity_row_propose(uuid, text, uuid, jsonb, jsonb, integer, boolean, text, uuid) TO authenticated, service_role;



-- ── 4. THE QUEUE'S TWO DOORS, BY ASSERTED FRAGMENT ─────────────────────────────────────────
do $do$
declare
  r     record;
  v_def text;
  v_n   integer;
begin
  for r in select * from (values
    ($w3b$custom.work_approval_request(uuid,uuid,jsonb,text,uuid,text,uuid)$w3b$,
     $w3b$  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
$w3b$,
     $w3b$  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_request');
  -- LANE7-W3B[q1]: A CHANGE TO A STANDARD ROW (a CRM person, …) is not a record of this store; it is
  -- filed by custom._entity_change_file, only after custom.entity_row_propose tried it as the caller.
  if v_kind = 'entity_row_change' then
    return custom._entity_change_file(p_organization_id, p_subject_id, p_change, p_note, p_approver_id,
                                      v_origin, p_conversation_id);
  end if;
$w3b$, $w3b$LANE7-W3B[q1]$w3b$),
    ($w3b$custom.work_approval_decide(uuid,uuid,boolean,text)$w3b$,
     $w3b$                             'record_restore_version', 'subscription_add');
$w3b$,
     $w3b$                             'record_restore_version', 'subscription_add',
                             'entity_row_change');   -- LANE7-W3B[d1]
$w3b$, $w3b$LANE7-W3B[d1]$w3b$),
    ($w3b$custom.work_approval_decide(uuid,uuid,boolean,text)$w3b$,
     $w3b$    elsif v_kind = 'doc_template_add' then
$w3b$,
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
$w3b$, $w3b$LANE7-W3B[d2]$w3b$)
  ) t(fn, old_frag, new_frag, mark)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.mark in v_def) > 0 then
      continue;   -- already carries this edit (idempotent)
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n <> 1 then
      raise exception 'LANE7-W3B: % carries the expected fragment % times, not once (edit %) — its body moved; re-read it and re-base this file', r.fn, v_n, r.mark;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end
$do$;
