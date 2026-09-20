-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- GUARD-PERF — THE MIRROR IS ASKED ABOUT THE ROWS THE CENSUS WILL JUDGE, AND NO OTHERS.
--
-- guardperf_a_census_that_dies_on_the_clock_is_not_a_verdict.sql took the RLS mirror out of a
-- per-row correlated subquery and asked it ONCE PER MEMBER, over every `shared_only`
-- organization at once. Measured right after it landed: 178 s, where before it was killed at
-- 900 s without an answer.
--
-- Then a 100,007-record organization (`ZZZ DASHBOARDS Jobs`, two members, `shared_only`) landed
-- on the main database at 08:36Z. Census 12 correctly reports it `unmeasured` — 200,014
-- (member, record) pairs is far over `custom.read_door_ladder_ceiling()` — and never compares a
-- single one of its rows. But the per-member mirror query still had it in scope, so it scanned
-- ~100,200 rows per member instead of ~200 and the census stopped finishing again. A census
-- must not pay for rows it has already said it will not judge.
--
-- The scope is now the organizations that are UNDER the ceiling, decided once, from the same
-- count the `unmeasured` row is built from. Every clause, kind and verdict is unchanged.
--
-- THE INVERSE is migrations/inverse/guardperf_the_mirror_is_asked_about_the_rows_it_will_judge_down.sql.
--
-- based-on: custom.shared_only_disagreements(text) 03bd032a610ea0ccc663bd16f40442e2de8721d85a6f107d8087d5abdaa51c74

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
  -- THE MIRROR, ONCE PER MEMBER. `v_orgs` is every organization this run will judge, so one
  -- evaluation serves all of them; `v_mirror_ids` caches the answer per member id.
  v_orgs     uuid[];
  v_mirror_ids jsonb := '{}'::jsonb;
  v_ids      uuid[];
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

  -- 🚨 THE ONE-PER-MEMBER MIRROR IS SCOPED TO THE ORGANIZATIONS THIS RUN WILL ACTUALLY JUDGE.
  -- An organization over `custom.read_door_ladder_ceiling()` is reported `unmeasured` and its
  -- rows are never compared, so sweeping them into the per-member mirror query buys nothing and
  -- costs everything: a 100,007-record organization landed on this database at 08:36Z and the
  -- mirror query went from ~200 rows per member to ~100,200, which is what a census that used
  -- to return in 178 s dying on the clock looked like. The ceiling decides the scope, once.
  select coalesce(array_agg(o.id), '{}'::uuid[]) into v_orgs
    from iam.organizations o
   where custom.store_is_open(o.id)
     and not iam.member_lane_open(o.id)
     and (select count(*)
            from iam.memberships m
            join custom.record r on r.organization_id = o.id and r.deleted_at is null
           where m.organization_id = o.id
             and m.container_type = 'organization'
             and m.status = 'active') <= v_ceiling;

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

      -- 🚨 THE MIRROR IS ASKED ONCE PER MEMBER, NOT ONCE PER ROW. Its verdict is a function
      -- of the member and the row's own columns; the expensive part of it
      -- (`iam.accessible_entity_ids` -> `custom.visible_record_ids`, the per-row ladder over
      -- every record on the database) depends on the member ALONE. Evaluated inside a
      -- correlated per-row subquery it was re-entered for every row and the census never
      -- returned. Evaluated here it runs once and answers for every row of every
      -- `shared_only` organization this member belongs to. Same text, same verdict.
      if v_mirror_ids -> v_member::text is null then
        execute format($q$
          select coalesce(array_agg(id), '{}'::uuid[])
            from custom.record
           where organization_id = any (%L::uuid[])
             and deleted_at is null
             and (%s)
        $q$, v_orgs, v_mirror) into v_ids;
        v_mirror_ids := v_mirror_ids || jsonb_build_object(v_member::text, to_jsonb(v_ids));
      end if;
      select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_ids
        from jsonb_array_elements_text(v_mirror_ids -> v_member::text) x;

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
                 (r.id = any (%L::uuid[])) as rls_mirror
            from custom.record r
           where r.organization_id = %L::uuid
             and r.table_id is not distinct from %L::uuid
             and r.deleted_at is null
        $q$, v_org.id, v_org.name, v_member, v_member, v_pred, v_ids, v_org.id, v_table)
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
