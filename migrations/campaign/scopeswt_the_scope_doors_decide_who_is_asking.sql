-- chair-step: lane SCOPES-WRITE-THROUGH, VERIFIER-27's finding on check:store-doors-decide. custom.context_writer and custom._ctx_answer answered any signed-in person which system writes ANY organization's scopes. custom.context_writer closes to clients (its door row says no client calls it; the SECURITY DEFINER bodies of the fences, follow triggers and the switch call it as its owner); custom._ctx_answer decides the caller through custom.assert_client_may_reach before it answers. The three invoker doors and the copy fence that asked custom.context_writer as the caller now ask the deciding door instead (the value door's dispatch moves into custom._ctx_value_write_store, which already makes set_context_value's permission decision; the copy fence checks the transaction marker first, then asks custom._ctx_answer).
-- based-on: custom._ctx_answer(uuid, uuid, jsonb) 12ede5ba20e854d1bbf8cc32069e2345274239960156e37f136c400a9d8e6776
-- based-on: custom.context_value_write(jsonb) d832feb44d14a4d67b4839eda58747e9bd4bcb451aa87a32f3478489d42b19c3
-- based-on: custom.context_tags_set(text, uuid, uuid[]) ec2cd391a6627fff2dbbd01b5731afd4ec2b9785b2e191b4889048ed870996d2
-- based-on: custom.context_template_apply(uuid, uuid) 4f33320036b5337a8e2f8892d11574b3eb3da6f68c3e1f44752b3d05c0df2117
-- based-on: custom._ctx_value_write_store(jsonb) 7ce019d88c8b096780def426caee9db6ff77cee07ae92db0acae83bb922d8217
-- based-on: custom._context_copy_fence() feac0eb3241a3b073270bc04d927a21ff14a6b963c8a93674ef5089064275ab6
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_the_scope_doors_decide_who_is_asking_down.sql
-- window-class: function bodies, one door row, one revoke. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. A signed-in stranger asks custom.context_writer about Castellano & Reyes: refused
-- (permission denied) — and custom._ctx_answer tells her "You are not a member of that organization".
-- Harbor Dental Group's owner writing a value, a tag or a template sees exactly what she saw before.

CREATE OR REPLACE FUNCTION custom._ctx_answer(p_org uuid, p_id uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- WHO IS ASKING, DECIDED (VERIFIER-27): the store's one ladder, as every door into custom does. A
  -- caller who may not reach the organization learns nothing about it, not even which system writes it.
  if p_org is null then
    return jsonb_build_object('ok', true, 'writer', 'old', 'row', p_row, 'store', null);
  end if;
  perform custom.assert_client_may_reach(p_org, 'custom._ctx_answer');
  return (
  -- The store row's facts are answered only to a member of its organization (or the server).
    select jsonb_build_object(
      'ok', true,
      'writer', custom.context_writer(p_org),
      'row', p_row,
      'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'data_class', r.data_class,
                                          'version', r.version, 'archived', r.deleted_at is not null)
                  from custom.record r
                 where r.organization_id = p_org and r.id = p_id
                   and (auth.uid() is null or iam.is_org_member(auth.uid(), p_org))))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_value_write(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- ONE DOOR DECIDES (VERIFIER-27): custom._ctx_value_write_store makes the permission decision
  -- set_context_value makes, and chooses the writer itself, so this invoker door asks no question
  -- about an organization of its own.
  return custom._ctx_value_write_store(p_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_value_write_store(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_item    uuid := (p_payload ->> 'context_item_id')::uuid;
  v_scope   uuid := (p_payload ->> 'scope_id')::uuid;
  v_source  text := coalesce(p_payload ->> 'source_type', 'ai_enriched');
  v_org     uuid;
  v_owner   uuid;
  v_id      uuid := gen_random_uuid();
  v_version int;
  v_image   jsonb;
  v_was     text;
  v_row     context.context_item_values;
begin
  if v_uid is null and nullif(current_setting('request.jwt.claims', true), '') is null then
    v_uid := (p_payload ->> 'acting_user_id')::uuid;       -- the server's own trusted path, as set_context_value
  end if;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'unauthorized', 'message', 'no acting user'));
  end if;
  if v_item is null or v_scope is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', 'context_item_id and scope_id are required'));
  end if;
  select s.organization_id, s.created_by into v_org, v_owner from context.scopes s where s.id = v_scope;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'message', 'scope not found'));
  end if;
  if not (v_owner = v_uid or context._scope_readable_for(v_uid, v_scope, 'editor')) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'forbidden',
      'message', context._scope_denial_message(v_scope, 'editor')));
  end if;
  -- AN ORGANIZATION WHOSE OLD TABLES STILL WRITE ITS SCOPES: today's value door, unchanged.
  if custom.context_writer(v_org) <> 'store' then
    return public.set_context_value(p_payload) || jsonb_build_object('writer', 'old');
  end if;

  begin
    perform context.validate_reference_value(v_item, p_payload ->> 'value_text');
    perform pg_advisory_xact_lock(hashtext('civ:' || v_item::text || ':' || v_scope::text));
    select coalesce(max(v.version), 0) + 1 into v_version
      from context.context_item_values v where v.context_item_id = v_item and v.scope_id = v_scope;
    v_image := jsonb_build_object(
      'id', v_id, 'context_item_id', v_item, 'scope_id', v_scope, 'version', v_version, 'is_current', true,
      'value_text', p_payload -> 'value_text', 'value_number', p_payload -> 'value_number',
      'value_boolean', p_payload -> 'value_boolean', 'value_json', p_payload -> 'value_json',
      'value_date', p_payload -> 'value_date', 'value_document_url', p_payload -> 'value_document_url',
      'value_timestamp', p_payload -> 'value_timestamp', 'value_time', p_payload -> 'value_time',
      'source_type', v_source, 'authored_by', v_uid, 'change_summary', p_payload -> 'change_summary',
      'created_at', now());

    -- THE STORE FIRST: its rules decide.
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_value(v_org, v_image);

    -- THE IMAGE: the old row, under the id the Record's source names.
    insert into context.context_item_values (
      id, context_item_id, scope_id,
      value_text, value_number, value_boolean, value_json, value_date, value_document_url,
      value_timestamp, value_time, source_type, authored_by, change_summary)
    values (
      v_id, v_item, v_scope,
      p_payload ->> 'value_text',
      case when p_payload ? 'value_number' then (p_payload ->> 'value_number')::numeric end,
      case when p_payload ? 'value_boolean' then (p_payload ->> 'value_boolean')::boolean end,
      case when p_payload ? 'value_json' then p_payload -> 'value_json' end,
      case when p_payload ? 'value_date' then (p_payload ->> 'value_date')::date end,
      p_payload ->> 'value_document_url',
      case when p_payload ? 'value_timestamp' then (p_payload ->> 'value_timestamp')::timestamptz end,
      case when p_payload ? 'value_time' then (p_payload ->> 'value_time')::time end,
      v_source::public.context_source_type, v_uid, p_payload ->> 'change_summary')
    returning * into v_row;
    perform context.index_reference_value(v_row.id, v_item, v_scope, p_payload ->> 'value_text');
    perform custom._ctx_mark(v_was);
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'message', 'concurrent write on this cell — retry'));
    when sqlstate '22023' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_argument', 'message', sqlerrm));
  end;
  return jsonb_build_object('ok', true, 'writer', 'store', 'data', jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_date', v_row.value_date,
    'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'source_type', v_row.source_type),
    'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'version', r.version)
                from custom.record r where r.organization_id = v_org and r.id = v_scope));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_out jsonb;
begin
  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, coalesce(p_scope_ids, '{}'::uuid[])));
  -- Which system writes each scope's organization is answered by custom._ctx_answer, which decides
  -- who is asking (VERIFIER-27); a tag door names only the tags it set.
  return jsonb_build_object('ok', true, 'row', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$;

CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
  v_older  text;
  v_copyof uuid;
begin
  v_copyof := case when new.data_class = 'table' then new.id
                   when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                   else new.table_id end;

  -- THE ONE WRITER. The store owner's own connection — the scopes mover, the follow worker and
  -- the older-tables mover's rerun — may write any copy. Read from the catalogue, never a role
  -- literal, exactly as custom._store_door's operator lane is. When it rewrites a test-copy row a
  -- person had touched, what it writes is the image the switch will put back (COPY-WRITABLE).
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    if tg_op = 'UPDATE' and custom._copy_evaluation_is_open(new.organization_id, new.id) then
      perform custom._copy_evaluation_reimage(new.organization_id, new.id, to_jsonb(new));
    end if;
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH — FOR AGENTS, AUTOMATIONS AND INTEGRATIONS
  -- (WHERE-LIVES-SWITCH, amended by COPY-WRITABLE 2026-09-25). COPY mode keeps every older table
  -- live beside its same-id copy until an owner presses the organization's Data tables switch.
  -- A PERSON's own write to the copy (the new table page, the record page) is a test: allowed,
  -- and noted with the row as the mover left it, so the switch can replace it with the older
  -- table's truth. Any other writer is refused with the older table's address.
  v_older := custom._older_table_copy_refusal(v_copyof);
  if v_older is null and v_copyof is not null then
    perform custom._copy_evaluation_note(new.organization_id, v_copyof, new.id, new.data_class);   -- notes only a person's write to a test copy
  elsif v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH / COPY-WRITABLE: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off), and this write declares an agent, automation or integration (or is not a signed-in person''s own). Nothing was written. Write the older table; after the switch the copy is the table.';
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := v_copyof;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the scope doors and the
  -- write-through (both marked for this transaction) write a context Table, and nothing else does:
  -- a generic store write (the grid, the records tool, a sync client) would leave the current
  -- context tables, which every not-yet-moved reader still reads, behind.
  -- The marker is set only by the scope doors and the write-through, and only in such an
  -- organization, so a marked write passes before anything else is asked.
  if custom._ctx_marked() then
    return new;
  end if;
  if custom._ctx_answer(new.organization_id, null, null) ->> 'writer' = 'store' then
    v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;
    raise exception '% is written through the scopes screens (or an agent''s context tools), so the current context system stays exact while it is still read. Edit it on %.',
                    case when new.data_class = 'record' then 'This scope' else 'This scope type' end, v_where
      using errcode = '42501',
            hint = 'SCOPES-WRITE-THROUGH: this organization''s scopes are written in the record store first (custom.context_writer = store), through the scope doors (custom.context_*), which keep the old context tables exact in the same transaction. A write through any other door is refused until the final switch lifts this. Nothing was written.';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$;

-- custom.context_writer: no client calls it. Close the row first, then revoke (§6d).
update platform.client_callable_door
   set signed_in_callers = false, anonymous_callers = false,
       non_client_lane = 'server_only: the SECURITY DEFINER bodies of the copy and tag fences, the old tables'' and the tags'' follow triggers, the scope doors'' answer (custom._ctx_answer, which decides the caller first) and the scopes switch call it as its owner; no client asks it directly (VERIFIER-27).',
       reason = 'Answers store or old for the organization named — which system writes that organization''s scopes. Closed to clients: a caller learns it only through custom._ctx_answer, which decides who is asking first.'
 where schema_name = 'custom' and function_name = 'context_writer';
revoke all on function custom.context_writer(uuid) from public, anon, authenticated;
