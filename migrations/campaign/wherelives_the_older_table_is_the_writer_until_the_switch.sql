-- chair-step: lane WHERE-LIVES-SWITCH (census row X1). ADDS the one answer to "where does this table live?" — private platform.table_lives_in(uuid), read from the organization's Data tables switch (platform.cutover_seam_press, FLIP-SEAMS) and never from "does a copy with this id exist?" — its one client door custom.where_tables_live(uuid[]) (signed-in people and the server key; declared in platform.client_callable_door), and custom._older_table_copy_refusal(uuid) (the fence's question; executable by every writer role because the fence runs as the writer). REPLACES the body of custom._context_copy_fence() (the copy fence on custom.record) so that, while an organization's switch is off, a write by any client role to the same-id copy of a live older table is refused with the older table's address; the context fence below it is byte-identical. No trigger, table, policy or grant on an existing object changes; no row is written except the door's declaration.
-- based-on: custom._context_copy_fence() 3469a2ce7b5620ba6c20c81fe8d30eaf32d6bd25582b9f07405daeea6dc16be1
-- lane: WHERE-LIVES-SWITCH
-- INVERSE: migrations/inverse/wherelives_the_older_table_is_the_writer_until_the_switch_down.sql
--
-- THE DEFECT. COPY mode (owner, 2026-09-23: old and new side by side until he flips) made a copy
-- of every older table in custom.record under the SAME id, and left the older table live. Every
-- integration decided where to write by asking "does the store hold a Table with this id?"
-- (aidream table_home, the app's whereThisTableLives / locateTable, the extension's homeOf), so
-- the agents' dataset tool, workflow steps, chat appends and the extension wrote the COPY while
-- the owner kept working in the older table — two tables that silently disagree.
--
-- THE RULE (one fact, asked by every client):
--   · an older table that is live, in an organization whose Data tables switch is OFF → 'older':
--     the older table is read and written; its copy is read-only (this file's fence) and is kept
--     current by the mover's rerun;
--   · the switch ON (the press archived the older tables) → 'record' when the copy is there;
--   · an id the older store never held → 'record' (the store's own doors then decide whether it
--     exists and whether this person may reach it);
--   · an archived older table with no live copy → 'older' (its own door says it is archived).
-- The switch's state is its latest completed press (none = old), exactly as
-- platform.cutover_seams reads it.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- ── 1. THE ONE FACT ───────────────────────────────────────────────────────────────────────────
create or replace function platform.table_lives_in(p_table_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org  uuid;
  v_live boolean;
begin
  if p_table_id is null then
    return null;
  end if;
  select d.organization_id, d.deleted_at is null into v_org, v_live
    from workbench.udt_datasets d where d.id = p_table_id;
  if not found then
    return 'record';
  end if;
  if v_live and coalesce((platform._cutover_seam_last_done('older_tables', v_org)).direction, 'old') = 'old' then
    return 'older';
  end if;
  if exists (select 1 from custom.record t
              where t.organization_id = v_org and t.id = p_table_id
                and t.data_class = 'table' and t.deleted_at is null) then
    return 'record';
  end if;
  return 'older';
end;
$$;

comment on function platform.table_lives_in(uuid) is
  'WHERE-LIVES-SWITCH: the one answer to "which store is table <id> read and written in?" — ''older'' while its older table is live and the organization''s Data tables switch (platform.cutover_seam_press, older_tables) is off, even when a same-id copy exists in the record store; ''record'' after the switch, or for an id the older store never held. Never decided by whether a copy exists. Private: clients ask custom.where_tables_live.';

revoke all on function platform.table_lives_in(uuid) from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', 'table_lives_in', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH)',
       'p_table_id is only looked up (workbench.udt_datasets by primary key, then custom.record on the dataset''s own organization and id); NULL answers NULL. It returns one store word and nothing about the table.',
       'server_only: called only from inside custom.where_tables_live (the client door) and custom._older_table_copy_refusal (the copy fence); EXECUTE is revoked from every client role and from the server key.',
       false, false
  from pg_proc p where p.oid = 'platform.table_lives_in(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 2. THE CLIENT DOOR ────────────────────────────────────────────────────────────────────────
create or replace function custom.where_tables_live(p_table_ids uuid[])
returns table (table_id uuid, lives_in text, why text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if auth.uid() is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           l.lives_in,
           case l.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l;
end;
$$;

comment on function custom.where_tables_live(uuid[]) is
  'WHERE-LIVES-SWITCH: the one client door to "where does each of these tables live?" — one row per id: lives_in ''older'' (read and write the older table; its copy is read-only until the organization''s Data tables switch) or ''record'' (the record store), and the sentence why. Answers from platform.table_lives_in, never from whether a copy exists. Says only which store to ask; that store''s own door decides existence and access.';

revoke all on function custom.where_tables_live(uuid[]) from public, anon;
grant execute on function custom.where_tables_live(uuid[]) to authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', 'where_tables_live', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH)',
       'Every client (the app, the extension, the server under a person) asks here which store a table id is read and written in, instead of inferring it from whether the record store holds a same-id copy. It answers only the store word and a fixed sentence per id — never a name, organization, row or count — so it reveals nothing the older store''s or record store''s own doors would not; those doors then decide existence and access.',
       true
  from pg_proc p where p.oid = 'custom.where_tables_live(uuid[])'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 3. THE COPY IS READ-ONLY UNTIL THE SWITCH ─────────────────────────────────────────────────
create or replace function custom._older_table_copy_refusal(p_table_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_name text;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select case when auth.uid() is null or iam.has_org_access(d.organization_id)
              then coalesce(nullif(d.table_name, ''), 'this table') else 'this table' end
    into v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  return format('This is the new system''s copy of %s; the older table is still the one in use until an owner switches Data tables on the organization''s settings page. Edit it at /data/%s.',
                v_name, p_table_id);
end;
$$;

comment on function custom._older_table_copy_refusal(uuid) is
  'WHERE-LIVES-SWITCH: the copy fence''s question — null when a client may write table <id> in the record store, else the sentence that refuses it (its older table is live and the organization''s Data tables switch is off). Private: called by custom._context_copy_fence().';

-- The fence runs as the writer (it is not SECURITY DEFINER), so every role that can write the store
-- may ask this; it names the table only to a member of its organization.
revoke all on function custom._older_table_copy_refusal(uuid) from public;
grant execute on function custom._older_table_copy_refusal(uuid) to anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers, anonymous_purpose)
select 'custom', '_older_table_copy_refusal', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH)',
       'The copy fence''s question, asked by custom._context_copy_fence() as the writer. p_table_id is only looked up; NULL answers NULL. It answers NULL or a refusal sentence; the sentence names the table only when the caller is a member of the table''s organization (iam.has_org_access), else says "this table".',
       true, true,
       'The copy fence runs as whichever role writes custom.record, including a public form submitted by a visitor who is not signed in; without EXECUTE that write would fail on permission instead of on the fence. A signed-out caller learns only that an id is a copy, never its name.'
  from pg_proc p where p.oid = 'custom._older_table_copy_refusal(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

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
begin
  -- THE ONE WRITER. The store owner's own connection — the scopes mover and the follow worker —
  -- is the only one that may write the copy. Read from the catalogue, never a role literal,
  -- exactly as custom._store_door's operator lane is.
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH (lane WHERE-LIVES-SWITCH). COPY mode keeps
  -- every older table live beside its same-id copy in this store; until an owner presses the
  -- organization's Data tables switch, the older table is the one in use and its copy only
  -- follows it (the mover's rerun). So a person, agent, workflow, sync or grid writing the copy
  -- — the Table, one of its Fields or one of its Records — is refused with the older table's
  -- address. The mover and the undo write as the store owner and passed above.
  v_older := custom._older_table_copy_refusal(
               case when new.data_class = 'table' then new.id
                    when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                    else new.table_id end);
  if v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off). Nothing was written. Write the older table; after the switch the copy is the table.';
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
    v_table := case when new.data_class = 'field'
                    then nullif(new.data ->> 'entity_definition_id', '')::uuid
                    else new.table_id end;
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
