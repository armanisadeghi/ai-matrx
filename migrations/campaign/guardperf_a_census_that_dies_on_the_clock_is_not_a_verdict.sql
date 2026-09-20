-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- GUARD-PERF — A CENSUS THAT DIES ON THE CLOCK IS NOT A VERDICT.
--
-- `pnpm check:store-doors-decide` stopped finishing. Measured on the main database on
-- 2026-09-20: census 12 (`custom.shared_only_disagreements`) was killed at a 900 s
-- statement timeout without returning, and census 13 (`custom.list_door_disagreements`)
-- took ~73 s of that run on its own. A guard nobody can wait for is a guard nobody runs,
-- and an unrun guard is the same as a deleted one. NEITHER CENSUS LOSES A CLAUSE HERE.
--
-- WHERE THE TIME WENT — measured, not guessed.
--
--   CENSUS 12. The RLS mirror was evaluated inside a CORRELATED SUBQUERY, once PER ROW:
--       (select (<iam.entity_read_expr text>) from custom.record m
--         where m.organization_id = r.organization_id and m.id = r.id)
--     The mirror's last arm reaches `iam.accessible_entity_ids('record', 'viewer', 0, true)`,
--     which (with the `custom/accessible_entity_ids_guard` knob on) returns
--     `custom.visible_record_ids(uid, 'viewer')` — the per-row ladder over EVERY record on
--     the database, with no organization to bound it. Timed live: 13 s to 41 s for ONE
--     member. Inside a correlated subquery that whole walk is re-entered for every row, so
--     the census cost (rows x whole-database ladder walk) and never returned.
--     The mirror's verdict does not depend on the ROW the census is standing on — only on
--     the MEMBER. So it is now evaluated ONCE PER DISTINCT MEMBER for the whole run, over
--     the records of every `shared_only` organization at once, and cached in the function.
--     Every (member, record) pair is still judged: nothing is sampled, nothing is skipped.
--
--   CENSUS 13. It CALLED seven doors per (member, Table) and `custom.read_record` per
--     (member, record) — 202 (member, Table) pairs and ~900 `read_record` calls on this
--     database, 55 s and 18 s respectively. `custom.read_record` decides the row with
--     `custom.has_visibility` and then WORKS OUT EVERY COLUMN of the record; the census
--     needs the decision, not the columns. And every one of the seven doors builds its row
--     set from `custom.visible_set` — directly, through `custom.visible_predicate_sql`, or
--     through `custom.query_visible_ids`. So the default run now compares those two SETS in
--     ONE query per (member, Table): `custom.visible_set`'s predicate against
--     `custom.has_visibility`, which is exactly the two sides LEAK-T10 pulled apart.
--
--     THE ROUTE IS CHECKED, NOT ASSUMED. Substituting the set for the door is only honest
--     while the doors are still built on it, so the fast path FIRST reads the catalogue and
--     requires each door's body to still reach `visible_set` / `visible_predicate_sql` /
--     `query_visible_ids` (for `custom.record_aggregate`, the body of `custom.agg_sql`,
--     which is where its predicate is built). A door that stops routing through the set is
--     reported as `unmeasured` naming `--exhaustive` — never passed in silence.
--
--     AND THE DOOR-CALLING CENSUS IS NOT DELETED. `p_exhaustive => true` runs it exactly as
--     it stood: every door called, every row, no sampling. `pnpm check:store-doors-decide
--     --exhaustive` is that run, for the nightly non-blocking workflow.
--
--   SAMPLING, AND WHERE IT IS FORBIDDEN. The fast path judges EVERY (member, record) pair
--     in an organization at `shared_only` and EVERY pair of a Table that lives in more than
--     one Home — the two shapes the leak lived in. Elsewhere, a Table with more rows than
--     `p_sample` is sampled with a FIXED SEED (`md5(id || 'store-doors-decide')`), so two
--     runs a week apart judge the same rows and a regression cannot hide behind a lucky
--     draw. `p_exhaustive => true` and `p_sample => 0` both mean "every row".
--
-- WHAT DOES NOT CHANGE: the kinds (`doors-disagree` always a failure, `unmeasured` never a
-- pass), the ceiling, the `p_pretend` red halves of both censuses, the `p_only_organization`
-- argument census 13's two-Home fixture is run through, and the columns both return.
--
-- THE INVERSE is migrations/inverse/guardperf_a_census_that_dies_on_the_clock_is_not_a_verdict_down.sql.
--
-- based-on: custom.shared_only_disagreements(text) 7867799285141855b4b2842d06084ce0ef31c8c7f79829d2301623858229505b
-- based-on: custom.list_door_disagreements(text, uuid, integer) dcdd2a36e5deac24a85ce7f338c004c9cc04a63ae6f6301c35d7e32aadad0cb9

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

  select coalesce(array_agg(o.id), '{}'::uuid[]) into v_orgs
    from iam.organizations o
   where custom.store_is_open(o.id)
     and not iam.member_lane_open(o.id);

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

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- CENSUS 13 — the same question, in one query per (member, Table) instead of eight calls.
-- `p_exhaustive => true` is the door-calling census, unchanged and undeleted.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- 🚨 THE FOUR-ARGUMENT FORM CARRIES NO DEFAULTS, ON PURPOSE. The three-argument census
-- LEAK-T10 declared keeps its own signature and its own defaults below, and a default on
-- this one would make every existing two- and three-argument call ambiguous
-- (`function custom.list_door_disagreements(...) is not unique`). Callers that want the
-- door-calling census say so in full.
CREATE OR REPLACE FUNCTION custom.list_door_disagreements(p_pretend text, p_only_organization uuid, p_sample integer, p_exhaustive boolean)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, table_id uuid, record_id uuid, door text, why text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org      record;
  v_member   uuid;
  v_tbl      uuid;
  v_homes    integer;
  v_rows     bigint;
  v_pairs    bigint;
  v_ceiling  integer := custom.read_door_ladder_ceiling();
  v_claims   text;
  v_saved    text;
  v_cand     uuid[];
  v_truth    uuid[];
  v_id       uuid;
  v_door     text;
  v_ids      uuid[];
  v_count    bigint;
  v_shortcut boolean;
  v_broke    text;
  v_strict   boolean;
  v_knows    boolean;
  v_pred     text;
  v_route    record;
  v_body     text;
begin
  if p_pretend is not null and p_pretend <> 'a_home_of_a_table_is_the_whole_table' then
    raise exception 'custom.list_door_disagreements: p_pretend is null or ''a_home_of_a_table_is_the_whole_table'', not %', p_pretend;
  end if;
  v_saved := coalesce(current_setting('request.jwt.claims', true), '');

  -- ═══ THE ROUTE, READ FROM THE CATALOGUE BEFORE ANYTHING IS BELIEVED ═══
  -- The fast path compares the SET every list-shaped door is built from against the per-row
  -- ladder `custom.read_record` decides with. That substitution is honest only while each
  -- door is still built on that set, so it is checked rather than assumed. The second column
  -- is the body the route lives in: `custom.record_aggregate` builds its predicate inside
  -- `custom.agg_sql`, every other door builds it in its own body.
  if not p_exhaustive then
    for v_route in
      select * from (values
        ('custom.read_records',         'read_records'),
        ('custom.query_visible_ids',    'query_visible_ids'),
        ('custom.query_across_homes',   'query_across_homes'),
        ('custom.query_by_coordinates', 'query_by_coordinates'),
        ('custom.query_table_as_of',    'query_table_as_of'),
        ('custom.io_export',            'io_export'),
        ('custom.record_aggregate',     'agg_sql')
      ) as t(door, carries_the_route)
    loop
      select string_agg(pg_get_functiondef(p.oid), E'\n') into v_body
        from pg_catalog.pg_proc p
       where p.pronamespace = 'custom'::regnamespace
         and p.proname = v_route.carries_the_route;
      if v_body is null
         or regexp_replace(v_body, '--[^' || chr(10) || ']*', '', 'g')
            !~ 'custom\.(visible_set|visible_predicate_sql|query_visible_ids)' then
        organization_id := null; organization_name := null; member_id := null;
        table_id := null; record_id := null; door := v_route.door;
        why := format('unmeasured: this census compares custom.visible_set against '
                   || 'custom.has_visibility because every list-shaped door builds its rows '
                   || 'from custom.visible_set - and custom.%s, which is where %s builds its '
                   || 'predicate, no longer reaches it. Run '
                   || 'pnpm check:store-doors-decide --exhaustive, which calls the doors '
                   || 'themselves, and fix the door or this census before believing a green '
                   || 'answer here.', v_route.carries_the_route, v_route.door);
        return next;
      end if;
    end loop;
  end if;

  for v_org in
    select o.id, o.name, not iam.member_lane_open(o.id) as strict
      from iam.organizations o
     where custom.store_is_open(o.id)
       and (p_only_organization is null or o.id = p_only_organization)
     order by o.name
  loop
    v_strict := v_org.strict;
    -- UNMEASURED IS NOT PASSED — the same rule census 12 keeps.
    select count(*) into v_pairs
      from iam.memberships m
      join custom.record r on r.organization_id = v_org.id and r.deleted_at is null
     where m.organization_id = v_org.id
       and m.container_type = 'organization'
       and m.status = 'active';
    if v_pairs > v_ceiling then
      organization_id := v_org.id; organization_name := v_org.name;
      member_id := null; table_id := null; record_id := null; door := null;
      why := format('unmeasured: %s (member, record) pairs, over the ceiling of %s. Raise '
                 || 'custom.read_door_ladder_ceiling(), or census this organization on its own '
                 || 'with p_only_organization.', v_pairs, v_ceiling);
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

      for v_tbl in
        select distinct r.table_id from custom.record r
         where r.organization_id = v_org.id and r.deleted_at is null and r.table_id is not null
         order by 1
      loop
        -- HOW MANY HOMES? More than one and every row is checked, because that is the shape the
        -- defect lived in. `custom.carrying_edges_of` on the TABLE names its containers.
        select count(*) into v_homes from custom.carrying_edges_of('record', v_tbl);
        select count(*) into v_rows from custom.record r
         where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null;

        -- EXHAUSTIVE WHERE THE DEFECT LIVES. A Table in more than one Home and an
        -- organization that has said `shared_only` are judged row by row, always. Elsewhere a
        -- Table bigger than the sample is sampled with a FIXED SEED, so the same rows are
        -- judged every run and a regression cannot hide behind a lucky draw.
        if p_exhaustive or v_homes > 1 or v_strict or p_sample <= 0 or v_rows <= p_sample then
          select coalesce(array_agg(r.id order by r.id), '{}'::uuid[]) into v_cand
            from custom.record r
           where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null;
        else
          select coalesce(array_agg(x.id), '{}'::uuid[]) into v_cand
            from (select r.id from custom.record r
                   where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null
                   order by pg_catalog.md5(r.id::text || 'store-doors-decide') limit p_sample) x;
        end if;
        if coalesce(pg_catalog.array_length(v_cand, 1), 0) = 0 then continue; end if;

        -- WHAT THE OLD LINE WOULD HAVE DONE, for the red half only.
        v_shortcut := false;
        if p_pretend = 'a_home_of_a_table_is_the_whole_table' then
          v_shortcut := custom.reaches_directly(v_member, 'record', v_tbl,
                                                'viewer'::public.permission_level);
        end if;

        if not p_exhaustive then
          -- ═══ THE FAST PATH: ONE QUERY, TWO SETS ═══
          -- The truth is `custom.has_visibility` - the line `custom.read_record` itself
          -- decides the row with, before it works out a single column. The door's answer is
          -- `custom.visible_set`, rendered by `custom.visible_predicate_sql` exactly as the
          -- doors render it, plus the screen gate every list door runs first
          -- (`custom.assert_may_know_table`): a door that refuses the Table returns no rows,
          -- so a refusal is the empty set here too.
          v_knows := true;
          begin
            perform custom.assert_may_know_table(v_org.id, v_tbl, 'custom.list_door_disagreements');
          exception
            when insufficient_privilege then v_knows := false;
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null;
              door := 'custom.assert_may_know_table';
              why := format('unmeasured: custom.assert_may_know_table raised %s (%s) on this '
                         || 'Table, so this census did not learn whether its doors open at '
                         || 'all. That is a door dying on data, not an answer about access.',
                            sqlstate, sqlerrm);
              return next;
              v_knows := null;
          end;
          if v_knows is null then continue; end if;

          begin
            if not v_knows then
              v_pred := 'false';
            elsif v_shortcut then
              -- THE PRETEND: the whole Table, exactly as the old shortcut handed it over.
              v_pred := 'r.visibility >= ''internal''::platform.visibility';
            else
              v_pred := custom.visible_predicate_sql(v_member, v_org.id, v_tbl,
                                                     'viewer'::public.permission_level, 'r');
            end if;
          exception
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null;
              door := 'custom.visible_set';
              why := format('unmeasured: custom.visible_predicate_sql raised %s (%s), so this '
                         || 'census never learned what the list doors would return.',
                            sqlstate, sqlerrm);
              return next;
              v_pred := null;
          end;
          if v_pred is null then continue; end if;

          for record_id, door, why in execute format($q$
            select q.id,
                   'custom.visible_set'::text,
                   format('doors-disagree: the set every list-shaped door is built from '
                       || '(custom.visible_set, through custom.read_records, '
                       || 'custom.query_visible_ids, custom.query_across_homes, '
                       || 'custom.query_by_coordinates, custom.query_table_as_of, '
                       || 'custom.io_export and custom.record_aggregate) %%s this row and '
                       || 'custom.read_record %%s it',
                       case when q.in_set then 'carries' else 'withholds' end,
                       case when q.truth then 'opens' else 'refuses' end)
              from (select r.id,
                           coalesce(custom.has_visibility(%L::uuid, 'record', r.id,
                                    'viewer'::public.permission_level), false) as truth,
                           coalesce((%s), false) as in_set
                      from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and r.id = any (%L::uuid[])) q
             where q.truth is distinct from q.in_set
             order by q.id
          $q$, v_member, v_pred, v_org.id, v_tbl, v_cand)
          loop
            organization_id := v_org.id; organization_name := v_org.name;
            member_id := v_member; table_id := v_tbl;
            return next;
          end loop;

          continue;
        end if;

        -- ═══ THE EXHAUSTIVE PATH: EVERY DOOR CALLED, EXACTLY AS IT WAS ═══
        -- THE TRUTH, ROW BY ROW: the door a person uses to OPEN one record. It raises when she
        -- may not, which is the answer, so each one is caught.
        v_truth := '{}'::uuid[];
        v_broke := null;
        foreach v_id in array v_cand loop
          begin
            perform custom.read_record(v_org.id, v_id, true);
            v_truth := v_truth || v_id;
          exception
            -- 🚨 ONLY A PERMISSION REFUSAL MEANS "SHE MAY NOT SEE IT" (LEAK-T10, second pass).
            -- The first version of this census read EVERY exception as a refusal, and on the
            -- main database `custom.read_record` raises 22023 — "this rule points at a field
            -- with title instead of with its id" — for a Table whose Rule row is malformed.
            -- That is a BREAKAGE, not an answer, and reading it as "no" made the census report
            -- twelve list-door LEAKS that were not leaks. A door that cannot answer is
            -- unmeasured; a census that guesses is worse than no census.
            when insufficient_privilege then null;
            when others then v_broke := sqlstate || ' (' || sqlerrm || ')';
          end;
          exit when v_broke is not null;
        end loop;
        if v_broke is not null then
          organization_id := v_org.id; organization_name := v_org.name;
          member_id := v_member; table_id := v_tbl; record_id := null; door := 'custom.read_record';
          why := format('unmeasured: custom.read_record raised %s on a row of this Table, so there '
                     || 'is no truth to compare the list doors against. That is a door dying on '
                     || 'data, not an answer about access - fix it before believing anything about '
                     || 'this Table.', v_broke);
          return next;
          continue;
        end if;

        -- EACH LIST-SHAPED DOOR, CALLED. A refusal is the empty set.
        foreach v_door in array array['custom.read_records', 'custom.query_visible_ids',
                                      'custom.query_across_homes', 'custom.query_by_coordinates',
                                      'custom.query_table_as_of']
        loop
          begin
            if v_door = 'custom.read_records' then
              select coalesce(array_agg(d.id), '{}'::uuid[]) into v_ids
                from custom.read_records(v_org.id, v_tbl, true, 1000, 0) d;
            elsif v_door = 'custom.query_visible_ids' then
              select coalesce(array_agg(d), '{}'::uuid[]) into v_ids
                from custom.query_visible_ids(v_org.id, v_tbl, 'viewer') d;
            elsif v_door = 'custom.query_across_homes' then
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_across_homes(v_org.id, v_tbl, 1000, 0, 'viewer') d;
            elsif v_door = 'custom.query_by_coordinates' then
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_by_coordinates(v_org.id, v_tbl, '[]'::jsonb, 1000, 0, 'viewer') d;
            else
              select coalesce(array_agg(d.record_id), '{}'::uuid[]) into v_ids
                from custom.query_table_as_of(v_org.id, v_tbl, now(), null, 1000, 0, 'viewer') d;
            end if;
          exception
            -- REFUSING HER OUTRIGHT IS AN ANSWER, and the answer is "no rows".
            when insufficient_privilege then v_ids := '{}'::uuid[];
            -- ANYTHING ELSE IS THE CENSUS FAILING TO MEASURE, and a census that reports its own
            -- broken call as a defect is worse than no census. It says so instead.
            when others then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
              why := format('unmeasured: %s raised %s (%s), so this census did not learn what it '
                         || 'returns. Fix the call or the door before believing the green above.',
                            v_door, sqlstate, sqlerrm);
              return next;
              v_ids := null;
          end;
          if v_ids is null then continue; end if;

          -- THE PRETEND: the whole Table, exactly as the old shortcut handed it over — every
          -- live row the Table edge carries, which is every row at or above `internal`.
          if v_shortcut then
            select coalesce(array_agg(r.id), '{}'::uuid[]) into v_ids
              from custom.record r
             where r.organization_id = v_org.id and r.table_id = v_tbl
               and r.deleted_at is null
               and r.visibility >= 'internal'::platform.visibility;
          end if;

          foreach v_id in array v_cand loop
            if (v_id = any (v_ids)) is distinct from (v_id = any (v_truth)) then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := v_id; door := v_door;
              why := format('doors-disagree: %s %s this row and custom.read_record %s it',
                            v_door,
                            case when v_id = any (v_ids) then 'returns' else 'withholds' end,
                            case when v_id = any (v_truth) then 'opens' else 'refuses' end);
              return next;
            end if;
          end loop;
        end loop;

        -- THE TWO DOORS THAT CARRY NO IDS: their COUNT must be the count `read_record` opens.
        -- Only meaningful when the candidate set is the whole Table; a sample would compare a
        -- sample against a full count and name a row that is not a defect.
        if p_exhaustive or v_homes > 1 or p_sample <= 0 or v_rows <= p_sample then
          foreach v_door in array array['custom.io_export', 'custom.record_aggregate'] loop
            begin
              if v_door = 'custom.io_export' then
                select jsonb_array_length(custom.io_export(v_org.id, v_tbl, null, 1000, 'viewer') -> 'rows')
                  into v_count;
              else
                -- ONE GROUP (`p_group_by = []`), so `row_count` IS the number of rows the
                -- aggregate could see.
                select coalesce(sum(a.row_count), 0) into v_count
                  from custom.record_aggregate(v_org.id, v_tbl, '[]'::jsonb, '[]'::jsonb,
                                               null, '{}'::jsonb, 1000, 'viewer') a;
              end if;
            exception
              when insufficient_privilege then v_count := 0;
              when others then
                organization_id := v_org.id; organization_name := v_org.name;
                member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
                why := format('unmeasured: %s raised %s (%s), so this census did not learn what it '
                           || 'counts.', v_door, sqlstate, sqlerrm);
                return next;
                v_count := null;
              end;
              if v_count is null then continue; end if;
            if v_shortcut then
              select count(*) into v_count from custom.record r
               where r.organization_id = v_org.id and r.table_id = v_tbl
                 and r.deleted_at is null
                 and r.visibility >= 'internal'::platform.visibility;
            end if;
            if coalesce(v_count, 0) is distinct from coalesce(pg_catalog.array_length(v_truth, 1), 0)::bigint then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
              why := format('doors-disagree: %s counts %s row(s) of this Table and custom.read_record '
                         || 'opens %s of them', v_door, coalesce(v_count, 0),
                            coalesce(pg_catalog.array_length(v_truth, 1), 0));
              return next;
            end if;
          end loop;
        end if;
      end loop;
    end loop;
  end loop;

  perform set_config('request.jwt.claims', v_saved, true);
  return;
end;
$function$;


-- THE THREE-ARGUMENT CENSUS KEEPS ITS SIGNATURE AND ITS NAME. It is what
-- `pnpm check:store-doors-decide` and `scripts/campaign-tests/leakt10_*.sql` already call,
-- and it now means "the fast comparison": the same question, the same kinds, the same
-- exhaustiveness where the defect lives. `--exhaustive` calls the four-argument form.
CREATE OR REPLACE FUNCTION custom.list_door_disagreements(p_pretend text DEFAULT NULL::text, p_only_organization uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 200)
 RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, table_id uuid, record_id uuid, door text, why text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select * from custom.list_door_disagreements(p_pretend, p_only_organization, p_sample, false);
$function$;
