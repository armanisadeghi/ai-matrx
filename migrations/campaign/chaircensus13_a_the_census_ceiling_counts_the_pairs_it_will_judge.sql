-- chair-step: lane CHAIR-CENSUS-13 — census 13 (custom.list_door_disagreements) compares its pair ceiling against the (person, row) judgements it will actually make — every live row of a Table it judges whole, p_sample rows of a Table it samples, no row without a Table — instead of people × every live row; and the census ceiling (custom.store_census_pair_ceiling, read by censuses 12 and 13 only) moves from 20,000 to 60,000 judgements, measured on the clone at about 4.3 ms each. The doors' own cut-off (custom.read_door_ladder_ceiling, 5,000) is untouched; no door, grant, policy, table or row of anybody's data changes; what a list door or custom.read_record answers is byte-for-byte the same. Locks: pg_proc row locks only.
-- lane: CHAIR-CENSUS-13
-- lock: custom
-- based-on: custom.list_door_disagreements(text, uuid, integer, boolean) 7be0016415294443991cf10b7d287977d4f0adc77187411ecfb6becf1e51ccf6
-- based-on: custom.store_census_pair_ceiling() bd82ab6063625a3a2eacc0192eabd1b0587850267752cfe6dd53cb5e754cc6a4
--
-- THE CENSUS CEILING COUNTS THE PAIRS THE CENSUS WILL JUDGE.
--
-- WHAT WAS RED. The T10 leak suite's part 4a (scripts/campaign-tests/leakt10_green.sql; safety-net
-- check drill.sql-leak-t10) asserts census 13 reads zero over the whole database. On the clone of
-- 2026-10-03 (exerfbdiksdjilwerpda, identical bodies to production) it read ONE row:
--   "unmeasured: 97540 (member, record) pairs, over the ceiling of 20000" for Arman's organization
--   (3e790542-…) — one member, nine people a record was shared with, 9,754 live rows in 144 Tables.
-- The 33 rows the chair's log names for 2026-10-02 (a route tripwire for custom.listed_predicate_sql
-- and 32 portal-principal pairs where the carried-edge set admitted a row custom.read_record refused)
-- are gone: lane CD-LADDER's archived-organization arm (access ladder T-33, "an archived organization
-- is closed to everyone") closed the 32 on the SET side — custom.reaches_directly, custom.visible_set
-- and custom.visible_predicate_sql all answer false for an archived organization now, as the kernel
-- and custom.read_record always did — and the same lane added the listed_predicate_sql route row to
-- this census. Measured here: census 13 with the ceiling lifted finds 0 doors-disagree rows on that
-- organization in 154 s; census 14 reads zero.
--
-- WHY IT WAS RED. CD-LADDER rightly widened the people this census asks about from members to
-- members ∪ portal principals ∪ everyone a record is shared with: a sharee is exactly the person a
-- list door could hand a whole Table to. The ceiling check then multiplied those people by EVERY
-- live row, while the loops below judge a Table bigger than p_sample on p_sample fixed-seed rows
-- (outside a Table in more than one Home and a shared_only organization) and never judge a row with
-- no Table. So the census refused an organization over a cost it would never pay: 97,540 counted,
-- 35,480 judged.
--
-- THE FIX, ONE PLACE. The number compared with the ceiling is the number of judgements the census
-- makes: people × Σ over Tables (every live row where the Table is judged whole, p_sample where it
-- is sampled). Census 12 (custom.shared_only_disagreements) samples nothing, so the pairs it counts
-- are the pairs it judges already and its body is untouched; the ceiling it shares now carries the
-- same meaning in both. The ceiling moves to 60,000 so the organization measured today (35,480) is
-- judged with headroom, and a run stays about 4 minutes for one organization inside the suite's
-- 20-minute clock. "Unmeasured is not passed" stands: an organization over 60,000 judgements is
-- still named, never skipped.
--
-- GUARD. The suite itself: part 4a red before this file (1 row), green after, both on the clone.
--
-- INVERSE: migrations/inverse/chaircensus13_a_the_census_ceiling_counts_the_pairs_it_will_judge_down.sql

CREATE OR REPLACE FUNCTION custom.store_census_pair_ceiling()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- lane DOORS-DECIDE-LAST (2026-09-27): admin's Workspace held 5,292 (member, record) pairs, over the
  -- doors' 5,000, so censuses 12 and 13 reported it "unmeasured" (never a pass). 20,000 was about four
  -- times the largest organization either census judged that day.
  -- lane CHAIR-CENSUS-13 (2026-10-03): the number this bounds is the (person, row) JUDGEMENTS a census
  -- makes for one organization (custom.list_door_disagreements counts its fixed-seed sample where it
  -- samples; custom.shared_only_disagreements judges every pair it counts). Measured on the clone the
  -- same day: 35,480 judgements — the largest organization today, one member, nine sharees, 144
  -- Tables — took 154 s, about 4.3 ms each; 60,000 is about 4 minutes for one organization, inside
  -- the 20-minute clock the T10 leak suite (scripts/campaign-tests/leakt10_green.sql, part 4) runs
  -- both censuses under over the whole database, with headroom over today's largest.
  select 60000;
$function$;

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
  v_ceiling  integer := custom.store_census_pair_ceiling();
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
        ('custom.read_records',         'read_records',         'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)'),
        ('custom.query_visible_ids',    'query_visible_ids',    'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)'),
        ('custom.query_across_homes',   'query_across_homes',   'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)'),
        ('custom.query_by_coordinates', 'query_by_coordinates', 'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)'),
        ('custom.query_table_as_of',    'query_table_as_of',    'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)'),
        -- EXPORT-FIX (2026-09-20): `custom.io_export` no longer builds a predicate of its own
        -- at all — it takes its rows FROM `custom.read_records`, the read door, whose own row
        -- in this very list still requires the direct reach to `custom.visible_set`. So the
        -- route is checked one hop further out, not waived: if `read_records` ever stops
        -- reaching the set, THAT row goes red and this door is measured against a door that is
        -- itself red. Accepting `custom.read_records` for `read_records` ITSELF would be a
        -- waiver (`pg_get_functiondef` prints the function's own name), which is why the
        -- accepted pattern is held PER DOOR rather than widened for everybody.
        -- CD-LADDER (2026-10-03): the list doors moved onto custom.listed_predicate_sql (ONLY-ME-LISTED,
        -- 2026-10-02), which is custom.visible_predicate_sql plus the Shown to list filter. The set it
        -- opens from is still the one ladder's, so that hop is checked here rather than assumed.
        ('custom.listed_predicate_sql', 'listed_predicate_sql', 'custom\.visible_predicate_sql'),
        ('custom.io_export',            'io_export',            'custom\.(visible_set|visible_predicate_sql|query_visible_ids|read_records)'),
        ('custom.record_aggregate',     'agg_sql',              'custom\.(visible_set|visible_predicate_sql|query_visible_ids|listed_predicate_sql)')
      ) as t(door, carries_the_route, reaches_the_set)
    loop
      select string_agg(pg_get_functiondef(p.oid), E'\n') into v_body
        from pg_catalog.pg_proc p
       where p.pronamespace = 'custom'::regnamespace
         and p.proname = v_route.carries_the_route;
      if v_body is null
         or regexp_replace(v_body, '--[^' || chr(10) || ']*', '', 'g')
            !~ v_route.reaches_the_set then
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
    select o.id, o.name, not iam.member_lane_open(o.id) as shared_only_org
      from iam.organizations o
     where custom.store_is_open(o.id)
       and (p_only_organization is null or o.id = p_only_organization)
     order by o.name
  loop
    v_strict := v_org.shared_only_org;
    -- UNMEASURED IS NOT PASSED — the same rule census 12 keeps.
    --
    -- CHAIR-CENSUS-13 (2026-10-03): THE CEILING COUNTS THE PAIRS THIS CENSUS WILL JUDGE, NOT THE
    -- PAIRS THAT EXIST. CD-LADDER widened "people" to every person a record here is shared with
    -- (right: a sharee is exactly who a list door could hand a whole Table to), and one open-lane
    -- organization — one member, nine sharees, 9,754 live rows — went from 9,754 pairs to 97,540
    -- and over the ceiling, so the whole organization came back "unmeasured" and the T10 leak
    -- suite (part 4a) went red on a cost this census never pays: outside a Table in more than one
    -- Home and a shared_only organization, a Table bigger than p_sample is judged on p_sample
    -- fixed-seed rows, and a row with no Table is never judged at all. The number compared here is
    -- the number of (person, row) judgements the loops below actually make — people × (every
    -- live row of a Table judged whole, p_sample of a Table that is sampled) — so the ceiling
    -- bounds the work, which is what it is for, and refuses nothing it would have finished.
    select count(*) into v_pairs
      from (select m.user_id
              from iam.memberships m
             where m.organization_id = v_org.id
               and m.container_type = 'organization'
               and m.status = 'active'
            union
            -- PORTAL (2026-09-20): A PORTAL PRINCIPAL IS A PERSON THIS CENSUS MUST ASK ABOUT.
            -- She is deliberately NOT a member - that is the whole of VIS-31 - so a census
            -- that enumerated memberships alone had nothing to say about the one kind of
            -- person whose entire access comes from a grant and a carried edge.
            select pp.user_id
              from custom.portal_principal pp
              join custom.portal p on p.id = pp.portal_id and p.is_active
             where pp.organization_id = v_org.id and pp.is_active and pp.user_id is not null
            union
            -- CD-LADDER (2026-10-03): every person a record here is shared with, member or not.
            select g.granted_to_user_id
              from iam.permissions g
              join custom.record gr on gr.organization_id = v_org.id and gr.id = g.resource_id
             where g.resource_type = 'record' and g.granted_to_user_id is not null
               and g.status <> 'archived' and (g.expires_at is null or g.expires_at > now())
           ) people;
    select v_pairs * coalesce(sum(case when p_exhaustive or v_strict or p_sample <= 0
                                        or t.n <= p_sample or t.homes > 1
                                       then t.n else p_sample end), 0)
      into v_pairs
      from (select r.table_id, count(*) as n,
                   (select count(*) from custom.carrying_edges_of('record', r.table_id)) as homes
              from custom.record r
             where r.organization_id = v_org.id and r.deleted_at is null and r.table_id is not null
             group by r.table_id) t;
    if v_pairs > v_ceiling then
      organization_id := v_org.id; organization_name := v_org.name;
      member_id := null; table_id := null; record_id := null; door := null;
      why := format('unmeasured: %s (person, record) pairs this census would judge, over the ceiling '
                 || 'of %s. Raise custom.store_census_pair_ceiling(), or census this organization on '
                 || 'its own with p_only_organization.', v_pairs, v_ceiling);
      return next;
      continue;
    end if;

    for v_member in
      select people.user_id from (
        select m.user_id from iam.memberships m
         where m.organization_id = v_org.id and m.container_type = 'organization'
           and m.status = 'active'
        union
        -- PORTAL (2026-09-20): the outsiders this organization let in, asked exactly as a
        -- member is asked. Her `request.jwt.claims` go on the session below like anybody
        -- else's, and every door decides for itself.
        select pp.user_id from custom.portal_principal pp
          join custom.portal p on p.id = pp.portal_id and p.is_active
         where pp.organization_id = v_org.id and pp.is_active and pp.user_id is not null
            union
            -- CD-LADDER (2026-10-03): every person a record here is shared with, member or not.
            select g.granted_to_user_id
              from iam.permissions g
              join custom.record gr on gr.organization_id = v_org.id and gr.id = g.resource_id
             where g.resource_type = 'record' and g.granted_to_user_id is not null
               and g.status <> 'archived' and (g.expires_at is null or g.expires_at > now())
      ) people
       order by people.user_id
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

-- THE DOORS' OWN CUT-OFF IS UNTOUCHED AND BOTH CENSUSES STILL READ THE CENSUS CEILING (the two clauses
-- scripts/campaign-tests/doorsdecidelast_green.sql part 4 holds the censuses to).
do $p$
declare n integer;
begin
  if custom.read_door_ladder_ceiling() <> 5000 then
    raise exception 'chaircensus13_a: the doors'' set-based cut-off moved to %; this file touches only the census ceiling', custom.read_door_ladder_ceiling();
  end if;
  select count(*) into n from pg_catalog.pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('list_door_disagreements', 'shared_only_disagreements')
     and p.prosrc like '%v_ceiling  integer := custom.store_census_pair_ceiling();%';
  if n <> 2 then
    raise exception 'chaircensus13_a: % of the two censuses read custom.store_census_pair_ceiling()', n;
  end if;
end $p$;
