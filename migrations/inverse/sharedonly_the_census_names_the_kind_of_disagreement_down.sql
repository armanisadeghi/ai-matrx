-- SHARED-ONLY, the inverse: the census loses the verdict_class column and calls the mirror
-- being narrower than the ladder a disagreement again, which makes it permanently red.

drop function if exists custom.shared_only_disagreements(text);

CREATE OR REPLACE FUNCTION custom.shared_only_disagreements(p_pretend text DEFAULT NULL::text)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, record_id uuid, table_id uuid, ladder boolean, read_door boolean, rls_mirror boolean, why text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org      record;
  v_member   uuid;
  v_table    uuid;
  v_pairs    bigint;
  v_ceiling  integer := custom.read_door_ladder_ceiling();
  v_pred     text;
  v_mirror   text;
  v_claims   text;
  v_saved    text;
begin
  if p_pretend is not null and p_pretend not in ('mirror_forgets_the_knob', 'door_refuses_the_share') then
    raise exception 'custom.shared_only_disagreements: p_pretend is null, ''mirror_forgets_the_knob'' or ''door_refuses_the_share'', not %', p_pretend;
  end if;

  -- The mirror's own text, once. The `pretend` variant is the SAME expression with the one
  -- conjunct this lane added taken back out, so a red run is the mirror as it really was.
  v_mirror := iam.entity_read_expr('custom', 'record', 'record');
  if p_pretend = 'mirror_forgets_the_knob' then
    v_mirror := replace(v_mirror,
      ' and (not custom.store_is_open(organization_id) or iam.member_lane_open(organization_id))', '');
  end if;

  v_saved := coalesce(current_setting('request.jwt.claims', true), '');

  for v_org in
    select o.id, o.name
      from iam.organizations o
     where custom.store_is_open(o.id)
       and not iam.member_lane_open(o.id)
     order by o.name
  loop
    -- UNMEASURED IS NOT PASSED.
    select count(*) into v_pairs
      from iam.memberships m
      join custom.record r on r.organization_id = v_org.id and r.deleted_at is null
     where m.organization_id = v_org.id
       and m.container_type = 'organization'
       and m.status = 'active';
    if v_pairs > v_ceiling then
      organization_id := v_org.id; organization_name := v_org.name;
      member_id := null; record_id := null; table_id := null;
      ladder := null; read_door := null; rls_mirror := null;
      why := format('UNMEASURED: %s (member, record) pairs, over the ceiling of %s. Raise '
                 || 'custom.read_door_ladder_ceiling(), or census this organization on its own.',
                 v_pairs, v_ceiling);
      return next;
      continue;
    end if;

    for v_member in
      select m.user_id from iam.memberships m
       where m.organization_id = v_org.id and m.container_type = 'organization'
         and m.status = 'active'
       order by m.user_id
    loop
      v_claims := json_build_object('sub', v_member::text, 'role', 'authenticated')::text;
      perform set_config('request.jwt.claims', v_claims, true);

      for v_table in
        select distinct r.table_id from custom.record r
         where r.organization_id = v_org.id and r.deleted_at is null
         order by 1
      loop
        -- THE DOOR'S OWN PREDICATE, built the way the door builds it.
        if p_pretend = 'door_refuses_the_share' then
          v_pred := 'false';
        else
          v_pred := custom.visible_predicate_sql(v_member, v_org.id, v_table,
                                                 'viewer'::public.permission_level, 'r');
        end if;

        -- THE THREE ANSWERS, IN ONE PASS OVER THE TABLE'S ROWS, compared in the next.
        for organization_id, organization_name, member_id, record_id, table_id,
            ladder, read_door, rls_mirror in execute format($q$
          select %L::uuid, %L::text, %L::uuid, r.id, r.table_id,
                 custom.has_visibility(%L::uuid, 'record', r.id, 'viewer'::public.permission_level) as ladder,
                 (%s) as read_door,
                 (select (%s) from custom.record m where m.organization_id = r.organization_id and m.id = r.id) as rls_mirror
            from custom.record r
           where r.organization_id = %L::uuid
             and r.table_id is not distinct from %L::uuid
             and r.deleted_at is null
        $q$, v_org.id, v_org.name, v_member, v_member, v_pred, v_mirror, v_org.id, v_table)
        loop
          if coalesce(ladder, false) is distinct from coalesce(read_door, false)
             or coalesce(ladder, false) is distinct from coalesce(rls_mirror, false) then
            why := format('the ladder says %s, the read door says %s, the RLS mirror says %s',
                          coalesce(ladder, false), coalesce(read_door, false), coalesce(rls_mirror, false));
            return next;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', v_saved, true);
  return;
end;
$function$;
