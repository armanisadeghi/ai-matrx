-- chair-step: it puts back the first version of custom.list_door_disagreements, which read a
-- door DYING as a door saying no and called query_by_coordinates with the wrong empty value.
--
-- THE INVERSE of migrations/campaign/leakt10_the_census_knows_a_refusal_from_a_breakage.sql.
-- Run it and census 13 names 147 rows on the main database, 141 of which are its own two bugs.

CREATE OR REPLACE FUNCTION custom.list_door_disagreements(
  p_pretend text DEFAULT NULL,
  p_only_organization uuid DEFAULT NULL,
  p_sample integer DEFAULT 200)
RETURNS TABLE(organization_id uuid, organization_name text, member_id uuid, table_id uuid,
              record_id uuid, door text, why text)
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
begin
  if p_pretend is not null and p_pretend <> 'a_home_of_a_table_is_the_whole_table' then
    raise exception 'custom.list_door_disagreements: p_pretend is null or ''a_home_of_a_table_is_the_whole_table'', not %', p_pretend;
  end if;
  v_saved := coalesce(current_setting('request.jwt.claims', true), '');

  for v_org in
    select o.id, o.name
      from iam.organizations o
     where custom.store_is_open(o.id)
       and (p_only_organization is null or o.id = p_only_organization)
     order by o.name
  loop
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

        if v_homes > 1 or v_rows <= p_sample then
          select coalesce(array_agg(r.id order by r.id), '{}'::uuid[]) into v_cand
            from custom.record r
           where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null;
        else
          select coalesce(array_agg(x.id), '{}'::uuid[]) into v_cand
            from (select r.id from custom.record r
                   where r.organization_id = v_org.id and r.table_id = v_tbl and r.deleted_at is null
                   order by r.id limit p_sample) x;
        end if;
        if coalesce(array_length(v_cand, 1), 0) = 0 then continue; end if;

        -- THE TRUTH, ROW BY ROW: the door a person uses to OPEN one record. It raises when she
        -- may not, which is the answer, so each one is caught.
        v_truth := '{}'::uuid[];
        foreach v_id in array v_cand loop
          begin
            perform custom.read_record(v_org.id, v_id, true);
            v_truth := v_truth || v_id;
          exception when others then null;
          end;
        end loop;

        -- WHAT THE OLD LINE WOULD HAVE DONE, for the red half only.
        v_shortcut := false;
        if p_pretend = 'a_home_of_a_table_is_the_whole_table' then
          v_shortcut := custom.reaches_directly(v_member, 'record', v_tbl,
                                                'viewer'::public.permission_level);
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
                from custom.query_by_coordinates(v_org.id, v_tbl, '{}'::jsonb, 1000, 0, 'viewer') d;
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
        if v_homes > 1 or v_rows <= p_sample then
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
            if coalesce(v_count, 0) is distinct from coalesce(array_length(v_truth, 1), 0)::bigint then
              organization_id := v_org.id; organization_name := v_org.name;
              member_id := v_member; table_id := v_tbl; record_id := null; door := v_door;
              why := format('doors-disagree: %s counts %s row(s) of this Table and custom.read_record '
                         || 'opens %s of them', v_door, coalesce(v_count, 0),
                            coalesce(array_length(v_truth, 1), 0));
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
