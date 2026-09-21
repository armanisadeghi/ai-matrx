-- lane: ARGS-RULED
--
-- chair-step: it REPLACES the live bodies of two client doors in schema `custom`. Inverse:
--   migrations/inverse/argsruled_the_parent_is_a_record_you_may_open_down.sql.
--
-- based-on: custom.record_reparent(uuid, uuid, uuid) 13b6a568b09da381050962ea10ebc8faec2052977c2980cf2d52ed3d7b7ae0fa
-- based-on: custom.relation_own(uuid, uuid, uuid) 4fdef3243898e3719d4874c047f5aded95b54c5cecdc0518672e1980d400fe3c
--
-- ARGS-RULED — THE PARENT IS A RECORD YOU MAY OPEN.
--
-- `custom.record_reparent(p_parent_id)` and `custom.relation_own(p_owner_id)` both write
-- `parent_id` onto a record the caller was just asserted at EDITOR on. Both asked NOTHING about
-- the container itself.
--
-- `parent_id` is not a label. It is a CARRYING edge: `custom.visibility_ancestors` walks it and
-- `custom.reaches_directly` arm 3 says an ancestor conveys its level to what is inside it. So the
-- unchecked argument is the one that decides WHO ELSE reaches the record being moved. A caller
-- could file their record inside a container they cannot see — handing it to whoever holds that
-- container, and putting a row into a list its owner never added to — or name an id in another
-- organization entirely and leave a pointer to nothing.
--
-- `viewer`, not `editor`: filing something into a container is not changing the container, and
-- this store decides changing one separately. NULL stays legal on `record_reparent` and means
-- what it always meant — take it out of whatever it was in.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION custom.record_reparent(p_organization_id uuid, p_record_id uuid, p_parent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_reparent');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.record_reparent');
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_reparent: the organization and the record are required'
      using errcode = '22004';
  end if;
  -- ARGS-RULED (2026-09-21). THE PARENT IS A RECORD YOU MAY OPEN, IN THIS ORGANIZATION.
  -- `parent_id` is a CARRYING edge: `custom.visibility_ancestors` walks it and
  -- `custom.reaches_directly` arm 3 says an ancestor conveys its level to what is inside it. So
  -- this argument decides WHO ELSE can reach the record being moved — and it was never asked
  -- about. A caller could put their record inside a container they cannot see (handing it to
  -- whoever holds that container, and adding a row to a list its owner never added to), or name
  -- an id in another organization entirely and leave a pointer to nothing.
  -- `viewer` and not `editor`: filing something into a container is not changing the container,
  -- and the store already decides changing it separately.
  if p_parent_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_parent_id, 'custom.record_reparent',
                                          'viewer'::public.permission_level, 'record');
  end if;

  update custom.record r
     set data = case when p_parent_id is null
                     then r.data - 'parent_id'
                     else r.data || jsonb_build_object('parent_id', p_parent_id::text) end
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    raise exception 'that record is not in this organization' using errcode = '23503';
  end if;
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id     uuid;
  v_parent uuid;
  v_name   text;
  v_found  boolean := false;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_own');
  perform custom.assert_client_may_change(p_organization_id, p_target_id, 'custom.relation_own', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_own');
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-7, BEFORE ANYTHING IS WRITTEN. A record has zero or one parent, never two — so a
  -- second call with a different owner is a REQUEST FOR A SECOND PARENT, and the only two
  -- honest answers are "refused" and "that is a move, ask for a move". It used to be neither:
  -- the old parent was overwritten in silence.
  -- ARGS-RULED (2026-09-21). THE PARENT IS A RECORD YOU MAY OPEN, IN THIS ORGANIZATION.
  -- `parent_id` is a CARRYING edge: `custom.visibility_ancestors` walks it and
  -- `custom.reaches_directly` arm 3 says an ancestor conveys its level to what is inside it. So
  -- this argument decides WHO ELSE can reach the record being moved — and it was never asked
  -- about. A caller could put their record inside a container they cannot see (handing it to
  -- whoever holds that container, and adding a row to a list its owner never added to), or name
  -- an id in another organization entirely and leave a pointer to nothing.
  -- `viewer` and not `editor`: filing something into a container is not changing the container,
  -- and the store already decides changing it separately.
  perform custom.assert_client_may_open(p_organization_id, p_owner_id, 'custom.relation_own',
                                        'viewer'::public.permission_level, 'record');

  select true, custom.containment_parent(r.data)
    into v_found, v_parent
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_target_id and r.deleted_at is null;
  if not coalesce(v_found, false) then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  if v_parent is not null and v_parent = p_owner_id then
    raise exception 'That record is already inside this one.'
      using errcode = '23505',
            hint = 'REC-7: a record is inside one record, once. Nothing was written and nothing moved.';
  end if;

  if v_parent is not null then
    v_name := custom.record_words(p_organization_id, v_parent);
    raise exception 'That record is already inside "%", and a record is inside one record at a time — so nothing was moved.',
      coalesce(v_name, v_parent::text)
      using errcode = '23514',
            hint = format(
              'REC-7 / T3: a Record has zero or one parent, never two. To MOVE it out of "%s" and into this one, ask for the move — custom.record_reparent, or custom.migrate_reparent, which records it so it can be undone. To leave it where it is and ALSO make it reachable from this one, link the two instead: custom.relation_carry, a carrying link, which is the way T3 names to get a record into both places.',
              coalesce(v_name, v_parent::text));
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$function$

;
