-- chair-step: it calls `platform.reopen_declared_doors('custom')` so the two doors it declares actually reach a
--   signed-in caller — a GRANT, which the additive allow-list refuses by name and rightly so. Nothing else here
--   is anything but additive: two NEW functions and two rows in platform.client_callable_door. The grant handed
--   out is exactly the one those two rows declare; no other function's posture moves.
-- guard: custom/system_enabled
--
-- STORE-REL 2 — T2. THE CARRYING LINK A CLIENT COULD NOT MAKE.
--
-- THE DEFECT. T2 is built on a referenced CARRYING relation: a note reaches three records of
-- three different Tables, and a person shared on any one of them sees the note. The store can
-- do it — `custom.record_carrying_edges` arm 2 turns a `data_class = 'relation'` record with
-- `carrying: true` into a `references` edge, and `custom.carrying_rule` caps it at viewer, so
-- T11's "the level stepped down" is already right. What was missing is a DOOR: the only ways
-- to make one were an INSERT into `custom.record` as the table's owner (what the test suites
-- do) or `custom.home_add`, which refuses anything that is not a Table — *"that is not a table,
-- so it cannot be given another home"*. So a person and an agent could not link two records at
-- all, and the fourth pass recorded T2 as failing on exactly that.
--
-- THE DOOR, on the one ladder. `custom.relation_carry` is `custom.relation_own`'s sibling: the
-- same shape, the same refusals, and the one difference that matters — it does NOT touch
-- `parent_id`, so the item keeps its single parent (REC-7) and gains a second reach. That is
-- T3's own sentence: *"the way to get it into both is a referenced carrying relation."*
--
--   · editor on the ITEM, because making a carrying link changes who can reach it;
--   · viewer on the CONTAINER, because you cannot hang something off a record you cannot see.
--
-- `custom.relation_uncarry` unmakes it, because a link with no way back is a dead end.
--
-- INVERSE: migrations/inverse/storerel_a_carrying_link_has_a_door_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function custom.relation_carry(
  p_organization_id uuid,
  p_container_id    uuid,
  p_item_id         uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_id          uuid;
  v_item_org    uuid;
  v_cont_org    uuid;
  v_cont_detail text;
  v_already     uuid;
begin
  -- THE WALL, THEN THE TWO ROWS, on the one ladder every other door in this store asks.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_carry');
  perform custom.assert_client_may_change(p_organization_id, p_item_id, 'custom.relation_carry', 'editor'::public.permission_level, 'record');
  perform custom.assert_client_may_open(p_organization_id, p_container_id, 'custom.relation_carry', 'viewer'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_carry');

  if p_organization_id is null or p_container_id is null or p_item_id is null then
    raise exception 'custom.relation_carry: the organization, the record it hangs from and the record it reaches are all required'
      using errcode = '22004';
  end if;
  if p_container_id = p_item_id then
    raise exception 'A record cannot carry itself.'
      using errcode = '22023',
            hint = 'REL-5 / T11: a carrying link goes from one record to another. Nothing was written.';
  end if;

  select r.organization_id into v_cont_org from custom.record r
   where r.organization_id = p_organization_id and r.id = p_container_id and r.deleted_at is null;
  if v_cont_org is null then
    raise exception 'The record this would hang from is not in this organization.'
      using errcode = '23503', hint = 'REC-29: organizations are hard walls. Nothing was written.';
  end if;
  select r.organization_id into v_item_org from custom.record r
   where r.organization_id = p_organization_id and r.id = p_item_id and r.deleted_at is null;
  if v_item_org is null then
    raise exception 'The record this would reach is not in this organization.'
      using errcode = '23503', hint = 'REC-29: organizations are hard walls. Nothing was written.';
  end if;

  -- REC-11, the same sentence `custom.home_add` says: a detail record inherits only, so it
  -- takes no direct shares and can carry nothing of its own.
  select t.data ->> 'type' into v_cont_detail
    from custom.record c join custom.record t
      on t.organization_id = c.organization_id and t.id = c.table_id
   where c.organization_id = p_organization_id and c.id = p_container_id;
  if v_cont_detail = 'detail' then
    raise exception 'A detail record cannot carry another record.'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and convey nothing onward. Hang this off the record that CONTAINS the detail instead.';
  end if;

  -- The same link twice is one link. Announced by name rather than quietly de-duplicated.
  select r.id into v_already
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce(r.data ->> 'kind', 'referenced') = 'referenced'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' = p_container_id::text
     and r.data ->> 'to'   = p_item_id::text
   limit 1;
  if v_already is not null then
    raise exception 'These two records are already linked that way.'
      using errcode = '23505',
            hint = 'REL-9: a relation is visible from both ends and there is only ever one of it. Nothing was written and the existing link is unchanged.';
  end if;

  -- REL-6 / REC-26: a referenced CARRYING relation, from the record that conveys to the
  -- record that is conveyed. `custom.carrying_rule` caps what `references` conveys at viewer,
  -- which is T11's "the level stepped down"; `custom._containment_association` writes the
  -- association, so this door knows nothing about the edge table.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', true, 'role', 'references',
                             'from', p_container_id, 'to', p_item_id))
  returning id into v_id;
  return v_id;
end;
$function$;

comment on function custom.relation_carry(uuid, uuid, uuid) is
  'REL-6 / REC-26 / T2. Makes a referenced carrying link: the item becomes reachable by everybody who can reach the container, capped at viewer, WITHOUT changing the item''s one containment parent.';

create or replace function custom.relation_uncarry(
  p_organization_id uuid,
  p_container_id    uuid,
  p_item_id         uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_uncarry');
  perform custom.assert_client_may_change(p_organization_id, p_item_id, 'custom.relation_uncarry', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_uncarry');

  -- SOFT, like every unmaking of an edge here (REL-13): the relation record is trashed, the
  -- association trigger withdraws the edge in the same transaction, and the history of the
  -- link stays readable.
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce(r.data ->> 'kind', 'referenced') = 'referenced'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' = p_container_id::text
     and r.data ->> 'to'   = p_item_id::text;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'These two records are not linked that way, so nothing was unlinked.'
      using errcode = '02000',
            hint = 'REL-9: a carrying link goes one way - from the record that conveys to the record it reaches. Check which of the two is the container.';
  end if;
  return v_n;
end;
$function$;

comment on function custom.relation_uncarry(uuid, uuid, uuid) is
  'REL-13 / T2. Unmakes a referenced carrying link, softly, so the record of it stays.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'relation_carry', 'p_organization_id uuid, p_container_id uuid, p_item_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'Linking two records - "this note is about that customer" - is the everyday act T2 is made of, and until now no client could do it at all. p_organization_id is the organization both records must live in and is never NULL; p_container_id is decided at viewer and p_item_id at editor through custom.has_visibility before anything is written, so a caller can only link records they already reach.',
   'migrations/campaign/storerel_a_carrying_link_has_a_door.sql',
   true, false),
  ('custom', 'relation_uncarry', 'p_organization_id uuid, p_container_id uuid, p_item_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'The way back from custom.relation_carry, because a link a person can make and cannot unmake is a dead end. p_organization_id is never NULL and p_item_id is decided at editor through custom.has_visibility before the link is withdrawn.',
   'migrations/campaign/storerel_a_carrying_link_has_a_door.sql',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select * from platform.reopen_declared_doors('custom');
