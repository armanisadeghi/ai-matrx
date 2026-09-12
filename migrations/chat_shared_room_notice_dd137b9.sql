-- chat_shared_room_notice_dd137b9 — "INSIDE A SHARED ROOM — MEMBERS CAN SEE THIS" (DD-137b).
--
-- WHAT V-33 MEASURED AND NOBODY HAD SAID OUT LOUD (report §9.1, 2026-09-12). DD-136 closed the
-- organization-admin lane on `personal` rows, and the numbers proved it: a plain member and an
-- organization admin both read 0 of other people's private conversations by role. But BOTH of them
-- still read some — by a different path entirely. An owner drops a `personal` conversation into an
-- `internal` war room, `platform.reachability` records the containment at `editor`, and the room's
-- own lane opens the conversation inside it. An admin read 7 that way; a plain MEMBER read 5, which
-- is what proves it is not an admin-lane leak at all.
--
-- 🚨 THIS IS NOT A HOLE, IT IS RULE 9'S UNION, AND THE FIX IS TO SAY SO. Access is the UNION of
-- every lane: putting your private thing inside a shared room IS sharing it, exactly as dropping a
-- private file into a shared folder is. Closing that would break the product — a war room whose
-- conversations its members cannot read is not a war room. What was wrong is that NOTHING TOLD THE
-- PERSON. Their conversation still says `personal`, their screen said nothing, and they had no way
-- to know their teammates could read it.
--
-- So this file adds the sentence's data source and nothing else: one SECURITY DEFINER door that
-- answers, for a conversation the caller can already read, "is this inside a room other people can
-- reach, and what is it called". Measured live before building it: 24,591 personal conversations
-- exist and 12 of them sit inside a container (8 threads, 8 war rooms, 4 tasks). Twelve rows is not
-- the argument for building this — Doctrine R15, and Arman 2026-09-12: never a row count as an
-- argument, design for 100x the first live week. The argument is that a screen that says `personal`
-- while teammates read it is a screen that lies.
CREATE OR REPLACE FUNCTION public.conversation_shared_room_notice(p_conversation_id uuid)
RETURNS TABLE (in_shared_room boolean, room_count integer, room_label text, room_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','platform','iam','chat','workspace'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_vis platform.visibility;
  v_owner uuid;
  r record;
  v_count integer := 0;
  v_label text; v_first_type text;
  v_schema text; v_table text; v_title_col text; v_type_label text;
begin
  if v_uid is null then
    -- Signed out: no conversation, no sentence. Never a NULL row that a client reads as "fine".
    return;
  end if;

  -- 🚨 THE DOOR NEVER WIDENS ANYTHING. It answers only about a conversation the caller can ALREADY
  -- read — asked through the same kernel every policy asks — so it cannot become a way to probe
  -- somebody else's rooms by id.
  if not iam.has_access('conversation', p_conversation_id, 'viewer'::public.permission_level) then
    return;
  end if;

  select c.visibility, c.created_by into v_vis, v_owner
    from chat.conversation c where c.id = p_conversation_id;
  if v_vis is null then return; end if;

  -- The sentence is for the OWNER of a conversation that is still marked private. A conversation
  -- that is already `internal` says what it is; a reader who is not the owner is being told nothing
  -- they do not know by being in the room.
  if v_vis > 'personal'::platform.visibility or v_owner is distinct from v_uid then
    return query select false, 0, null::text, null::text;
    return;
  end if;

  -- 🚨 THE ROOM'S NAME IS RESOLVED FROM THE REGISTRY, NOT FROM A LIST OF THREE CONTAINER TYPES.
  -- `platform.entity_types` already knows every token's schema, table and `title_column`, so this
  -- names a war room today and names whatever container someone registers next year without anybody
  -- editing this function. A hard-coded `case container_type` here would be a second registry that
  -- silently says "thread" for every container it had not heard of.
  for r in
    select rr.container_type, rr.container_id
      from platform.reachability rr
     where rr.item_type = 'conversation'
       and rr.item_id = p_conversation_id
       and rr.max_level >= 'viewer'::public.permission_level
       and (rr.container_type, rr.container_id) is distinct from ('conversation', p_conversation_id)
     order by rr.container_type, rr.container_id
  loop
    v_count := v_count + 1;
    if v_label is null then
      select et.schema_name, et.table_name, et.title_column, et.label
        into v_schema, v_table, v_title_col, v_type_label
        from platform.entity_types et where et.token = r.container_type and et.is_active;
      v_type_label := coalesce(v_type_label, r.container_type);
      if v_schema is not null and v_title_col is not null
         and to_regclass(format('%I.%I', v_schema, v_table)) is not null then
        begin
          execute format('select %I from %I.%I where id = $1', v_title_col, v_schema, v_table)
            into v_label using r.container_id;
        exception when others then
          -- A name we cannot read is not a reason to say nothing: the sentence's JOB is the warning,
          -- and "a shared room" is still true.
          v_label := null;
        end;
      end if;
      v_label := coalesce(nullif(btrim(coalesce(v_label,'')), ''), v_type_label);
      v_first_type := r.container_type;
    end if;
  end loop;

  return query select v_count > 0, v_count, v_label, v_first_type;
end
$function$;

-- db-rules §6d-4: the door declares itself BEFORE the GRANT, or a DB-wide guard revokes the client
-- EXECUTE inside the GRANT itself.
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
values ('public', 'conversation_shared_room_notice', 'p_conversation_id uuid',
        'chat_shared_room_notice_dd137b9',
        'Tells the OWNER of a still-private conversation that it sits inside a room other people '
        || 'can reach, so the screen never says `personal` while teammates are reading it '
        || '(DD-137b, V-33 section 9.1 - Rule 9 union, made visible). It answers only about a '
        || 'conversation the caller can already read (iam.has_access is asked first) and only to '
        || 'that conversation''s owner, and it exposes a room NAME and a count - never the room''s '
        || 'contents, never its member list.')
on conflict do nothing;

revoke all on function public.conversation_shared_room_notice(uuid) from public, anon;
grant execute on function public.conversation_shared_room_notice(uuid) to authenticated, service_role;

-- ═══ proven live, with real identities, rolled back where it writes nothing ═══
do $$
declare
  v_conv uuid; v_owner uuid; r record; v_n integer;
begin
  -- a real personal conversation that IS inside a container
  select c.id, c.created_by into v_conv, v_owner
    from chat.conversation c
    join platform.reachability rr on rr.item_type='conversation' and rr.item_id=c.id
   where c.visibility='personal' and c.created_by is not null
   limit 1;
  if v_conv is null then
    raise exception 'dd137b9: no personal conversation inside a container to prove against — the '
      'door cannot be shipped unproven';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.conversation_shared_room_notice(v_conv);
  execute 'reset role';
  if r is null or not r.in_shared_room then
    raise exception 'dd137b9: the owner of a personal conversation inside a room was NOT told';
  end if;
  raise notice 'dd137b9: the owner is told — in a room called %, % room(s)', r.room_label, r.room_count;

  -- a personal conversation NOT in any container: the sentence must not appear
  select c.id, c.created_by into v_conv, v_owner
    from chat.conversation c
   where c.visibility='personal' and c.created_by is not null
     and not exists (select 1 from platform.reachability rr
                      where rr.item_type='conversation' and rr.item_id=c.id)
   limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.conversation_shared_room_notice(v_conv);
  execute 'reset role';
  if r is null or r.in_shared_room then
    raise exception 'dd137b9: a conversation in NO room was told it was in one — a notice that '
      'fires everywhere is a notice nobody reads';
  end if;

  -- somebody else's conversation answers NOTHING, not `false`: the door is not a probe.
  select c.id into v_conv from chat.conversation c
   where c.visibility='personal' and c.created_by is distinct from v_owner limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.conversation_shared_room_notice(v_conv);
  execute 'reset role';
  if v_n > 0 then
    raise exception 'dd137b9: the door answered about somebody else''s conversation';
  end if;

  raise notice 'dd137b9: told in a room, silent outside one, and silent about other people''s';
end $$;
