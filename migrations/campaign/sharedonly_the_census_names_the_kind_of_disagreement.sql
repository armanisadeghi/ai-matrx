-- target: branch,production
-- additive: yes
-- based-on: custom.shared_only_disagreements(text) b103693f5f73ff5e6a4ff2d4de7b0407231ec11512da66f0450fbb2ba2671c5e
-- guard: custom/system_enabled
--
-- SHARED-ONLY — THE CENSUS SAYS WHICH KIND OF DISAGREEMENT IT FOUND.
--
-- Its first run on the green suite's own fixture found this, and it is right:
--
--     member shared ONE record, organization at shared_only
--     row = the TABLE that record lives in
--     ladder t · read door t · RLS mirror f
--
-- The doors agree with each other. The mirror does not, and it CANNOT: it is generated from
-- `iam.has_access_for_base`, the platform kernel, and "she may know this Table because a record
-- inside it is visible" is arm 4 of `custom.has_visibility`, one layer above the kernel —
-- along with `iam.effective_level` and the store's own carrying walk. Every one of those lives
-- behind a SECURITY DEFINER door that no client role may execute, which is census 7's
-- invariant, so no policy TEXT can carry them and no policy text is reachable either.
--
-- Treating that as a pass would be an excuse; treating it as a failure would make the guard
-- permanently red for the correct behaviour. So the census NAMES the three kinds and the
-- guard decides:
--
--   The kind is the FIRST WORD of `why`, so the shape of the row never changes.
--
--   doors-disagree      the one ladder and the read door differ — always a failure
--   mirror-admits-more  the policy text admits a row every door refuses — always a failure,
--                       and it is exactly what custom/member_default_visibility left open
--   mirror-admits-less  the doors admit through an arm above the kernel — counted and
--                       reported, and `pnpm check:store-doors-decide` makes it a FAILURE the
--                       moment census 7 finds a table privilege in schema `custom`

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
      why := format('unmeasured: %s (member, record) pairs, over the ceiling of %s. Raise '
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
          -- THE TWO THINGS THAT MUST BE EQUAL, AND THE ONE THAT MAY ONLY BE NARROWER.
          --
          -- The ladder and the read door are the SAME question asked two ways - per row and
          -- set-based - so anything but equality is a defect on one of them, in either
          -- direction. That is `doors-disagree`.
          --
          -- The RLS mirror is built from the PLATFORM KERNEL (`iam.has_access_for_base`) and
          -- the store's ladder has three arms above it: `iam.effective_level`, the store's own
          -- carrying walk, and knowing a Table because a record inside it is visible. No policy
          -- TEXT can carry those while schema `custom` holds no table privilege for any client
          -- role, because every one of them lives behind a SECURITY DEFINER door the client
          -- cannot execute. So the mirror being NARROWER is a measured, named consequence
          -- (`mirror-admits-less`) rather than a silent one - it is returned, counted, and
          -- `pnpm check:store-doors-decide` turns it into a FAILURE the moment census 7 finds a
          -- table privilege in schema `custom`, which is the moment the policy text starts
          -- deciding a real read.
          --
          -- The mirror being WIDER is never excused (`mirror-admits-more`): that is a stranger
          -- let in by a policy while every door refuses them, and it is exactly the shape of
          -- the hole `custom/member_default_visibility` left in this function until today.
          if coalesce(ladder, false) is distinct from coalesce(read_door, false) then
            why := format('doors-disagree: the one ladder says %s and the read door says %s about the same row',
                          coalesce(ladder, false), coalesce(read_door, false));
            return next;
          elsif coalesce(rls_mirror, false) and not coalesce(ladder, false) then
            why := 'mirror-admits-more: the RLS policy text admits this row and every door refuses it';
            return next;
          elsif coalesce(ladder, false) and not coalesce(rls_mirror, false) then
            why := 'mirror-admits-less: the doors admit this row through an arm of the store ladder that sits above '
                || 'the platform kernel the mirror is built from - harmless while schema custom '
                || 'holds no table privilege, a refusal for a legitimate person the day it does';
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
