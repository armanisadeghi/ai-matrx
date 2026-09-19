-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom.relation_own(uuid, uuid, uuid) b97f37c6ef190722c6d9ba0f978c0af7921166b335e026458688bb118d21b0de
--
-- STORE-REL 3 — T3. A SECOND PARENT IS REFUSED, AND IT NAMES THE FIRST ONE.
--
-- THE DEFECT. T3's last clause is *"Make Class 101 contained by both X and Y: refused; the way
-- to get it into both is a referenced carrying relation."* The containment door,
-- `custom.relation_own`, wrote `parent_id` unconditionally:
--
--     update custom.record r set data = r.data || jsonb_build_object('parent_id', p_owner_id)
--
-- so calling it a second time with a different owner was ACCEPTED and the first parent simply
-- disappeared. Nothing was refused and nothing was said. That is the same defect the fourth
-- pass recorded twice: T3's "two parents is not refused", and T2's *"calling the owned-
-- containment door twice does not add a second parent, it silently moves the record"*.
--
-- REC-7 is not "at most one parent wins"; it is *"a Record has zero or one parent, never two"*
-- — and a door that answers a request for a second parent by deleting the first has answered
-- a question nobody asked. A move is a MOVE and has its own verbs (`custom.record_reparent`,
-- `custom.migrate_reparent`, which log it and can undo it). This door now refuses, names the
-- parent that is in the way, and names both ways forward.
--
-- Everything else in the door is unchanged, including the order of its access questions.
--
-- INVERSE: migrations/inverse/storerel_a_second_parent_is_never_a_silent_move_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

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
    select coalesce(nullif(r.data ->> (t.data ->> 'title_field'), ''),
                    nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), r.id::text)
      into v_name
      from custom.record r
      left join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = p_organization_id and r.id = v_parent;
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
$function$;
