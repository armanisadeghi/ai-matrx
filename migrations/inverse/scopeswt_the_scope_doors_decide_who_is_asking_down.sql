-- INVERSE of migrations/campaign/scopeswt_the_scope_doors_decide_who_is_asking.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: puts back the six bodies as scopeswt_scopes_are_written_in_the_store_first.sql and scopeswt_the_scope_doors.sql made them, reopens custom.context_writer to signed-in callers (its door row first, then the grant) — which is VERIFIER-27's finding put back.
-- ground-standing-ok: b — this inverse runs first (7 → 6 → 5 → 4 → 3 → 2 → 1); the bodies it puts back belong to files 1 and 2, whose own inverses drop them with their callees.
-- based-on: custom._ctx_answer(uuid, uuid, jsonb) abdb58c9b01849050f7bc75d00768f32c9602d10f31b477606ef3f90f2633578
-- based-on: custom.context_value_write(jsonb) ab34ebdc736757ee7a34d6d28c129561fed3da38f0418c840271f81dc1723945
-- based-on: custom.context_tags_set(text, uuid, uuid[]) 057f5b6157ff9ba395f7aa3fbabe3b8b0631009c5149115a1e37216b1fed205a
-- based-on: custom.context_template_apply(uuid, uuid) 87635a30af1aa761a0e7ffb095e49304684fbdbcf6b71456cdca7830d49eb128
-- based-on: custom._ctx_value_write_store(jsonb) c6bd4d94fc6c9d6fecc2ffba3b19024fbc92354fdc148d6427acf72e8b2cc2de
-- based-on: custom._context_copy_fence() 255372a9abfdbb033276890dfc4b86d53ab70cbcf9ed7d222f589d2d6bb16e28

CREATE OR REPLACE FUNCTION custom._ctx_answer(p_org uuid, p_id uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION custom.context_value_write(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select s.organization_id from context.scopes s where s.id = (p_payload ->> 'scope_id')::uuid);
  v_out jsonb;
begin
  if custom.context_writer(v_org) = 'store' then
    return custom._ctx_value_write_store(p_payload);
  end if;
  v_out := public.set_context_value(p_payload);
  return v_out || jsonb_build_object('writer', 'old');
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_out jsonb;
begin
  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, coalesce(p_scope_ids, '{}'::uuid[])));
  return jsonb_build_object('ok', true, 'row', v_out,
    'writers', coalesce((select jsonb_object_agg(x.org, custom.context_writer(x.org))
                           from (select distinct s.organization_id as org from context.scopes s
                                  where s.id = any (coalesce(p_scope_ids, '{}'::uuid[]))) x), '{}'::jsonb));
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom.context_writer(p_organization_id));
end;
$function$

;

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
$function$

;

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
  if custom.context_writer(new.organization_id) = 'store' then
    if custom._ctx_marked() then
      return new;
    end if;
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
$function$

;

update platform.client_callable_door
   set signed_in_callers = true, anonymous_callers = false, non_client_lane = null,
       reason = 'Read-only: answers store or old for the organization named. The copy fence (custom._context_copy_fence, SECURITY INVOKER, running as the signed-in writer) asks it on every write into a context Table, and the web app''s scopes service asks it to say which system writes; it reveals no row and changes nothing.'
 where schema_name = 'custom' and function_name = 'context_writer';
grant execute on function custom.context_writer(uuid) to authenticated, service_role;
