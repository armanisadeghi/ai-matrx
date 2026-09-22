-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- REALTIME, file 2 — `custom` CLAIMS ITS TOPIC PREFIX, AND ANSWERS WITH THE LADDER THE DOORS
-- ALREADY ASK.
--
-- ONE TOPIC PER TABLE: `custom:table:<table_id>`, private. Not one per record (a browser
-- watching a forty-row table would hold forty sockets, and a record created after the join
-- would have no topic to arrive on) and not one per organization (a person with rights to one
-- table would be handed every notice in the company).
--
-- THE ANSWER IS `custom.assert_may_know_table`, WHICH IS THE SAME CALL `custom.read_records`
-- MAKES ON ITS SECOND LINE. That is the whole point of the file. A subscriber is admitted to
-- a table's live topic exactly when the read door would let her ask about that table, by the
-- same two ways through (she may open the Table itself, or something in it has been shared
-- with her), behind the same wall (`custom.assert_client_may_reach`: the organization is
-- hers, the store is open, an archived organization refuses). Writing a second, "cheaper"
-- membership check here is how a platform ends up with two ladders that disagree on a Tuesday.
--
-- WHY THIS IS SECURITY DEFINER AND WHY THAT IS STILL HONEST. Schema `custom` is doors-only:
-- measured, `authenticated` holds no table grant in it AND no EXECUTE on `custom.caller_role`,
-- so a policy predicate running as the subscriber cannot reach the ladder at all. It must be
-- a definer function. The seat survives that boundary intact, because the store never asks
-- `current_user`: `custom.caller_role()` reads the `role` GUC and `custom.query_principal()`
-- reads `request.jwt.claims`, and Realtime sets both before it evaluates the policy. Proved
-- by measurement on the live database, through exactly this shape, on Rincon Plumbing Co's
-- Jobs table: admin@admin.com → `yes`; test@test.com, who is not a member → `no (42501 You
-- are not a member of that organization…)`.
--
-- AND THE ONE WAY THAT COULD GO WRONG IS CLOSED BY NAME. If Realtime ever evaluated this
-- policy WITHOUT setting the role — or as a role that belongs to the store's owner —
-- `custom.assert_client_may_reach` would take its server-lane shortcut and admit EVERY
-- subscriber to EVERY table. So the first thing this function does is refuse a seat that
-- belongs to the store's owner role. A live topic is a thing people subscribe to; the store's
-- own writer never does, and if it ever appears here something is badly wrong and the honest
-- answer is no.


create or replace function custom.realtime_topic_admits(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_table_id uuid;
  v_org      uuid;
  v_owner    oid;
begin
  -- THE GRAMMAR, and nothing else is this schema's topic. A malformed topic is not a refused
  -- person; it is a socket asking for something that does not exist.
  if p_topic !~ '^custom:table:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  v_table_id := substring(p_topic from 14)::uuid;

  -- THE SEAT MUST BE A PERSON. See the header: the store's owner role passes every wall by
  -- design, so if it ever turns up as a SUBSCRIBER the shortcut would open every table at
  -- once. Read the owner from the catalogue rather than naming a role literal, exactly as
  -- `custom.assert_client_may_reach` does, so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(custom.caller_role(), v_owner, 'member') then
    return false;
  end if;
  if custom.query_principal() is null then
    -- Nobody is signed in. The read door's own first sentence.
    return false;
  end if;

  -- WHICH ORGANIZATION THIS TABLE BELONGS TO. The store is keyed `(organization_id, id)` and
  -- the topic carries only the id, so the organization is looked up here rather than written
  -- into the topic — a topic carrying the organization would let a caller assert one.
  -- Measured: 0.26 ms across all sixteen partitions, once per socket join, never per message.
  select r.organization_id
    into v_org
    from custom.record r
   where r.id = v_table_id
     and r.data_class = 'table'
     and r.deleted_at is null;

  if v_org is null then
    -- No such live Table. Saying "no" is also the right answer for a table that was archived
    -- while somebody had its page open: their socket stops being admitted on the next join.
    return false;
  end if;

  begin
    perform custom.assert_may_know_table(v_org, v_table_id, 'the live updates for this table');
    return true;
  exception
    -- THE LADDER'S OWN TWO REFUSALS, and only those two. `42501` is "not a member of that
    -- organization" and "you do not have access to this table"; `22004` is a door called
    -- without an organization. Anything else is a FAULT, not a refusal, and it is re-raised
    -- so `platform.realtime_topic_admits` records it instead of burying it in a `false`.
    when insufficient_privilege then return false;
    when null_value_not_allowed then return false;
  end;
end;
$$;

comment on function custom.realtime_topic_admits(text) is
  'Whether this seat may subscribe to custom:table:<table_id>. Asks custom.assert_may_know_table — the SAME call custom.read_records makes — so a live topic admits exactly the people the read door admits, behind the same organization wall. Refuses the store-owner role by name: a subscriber is always a person.';

-- THE DOOR DECLARATION. It must come AFTER the function, not before: `ddl_guard` resolves
-- `identity_args` against the live catalogue and refuses a row naming a function that does
-- not exist yet (DD-223). The EXECUTE grant lives in the switch file, and the guard keeps
-- it because this row is already here when that GRANT fires.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, anonymous_callers, signed_in_callers)
values
  ('custom', 'realtime_topic_admits', 'p_topic text',
   'Reached only through platform.realtime_topic_admits, which is the USING clause of the one RLS policy on realtime.messages, so Postgres evaluates it AS the subscribing role and that role must hold EXECUTE. It answers true/false about a table id the caller already holds, and it answers it by asking custom.assert_may_know_table — the read door''s own question — so it can tell nobody anything the read door would not.',
   false, true)
on conflict do nothing;
