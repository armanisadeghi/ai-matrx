-- chair-step: puts custom.archived_tables_everywhere back to the body it had before tableactions_d_an_archived_table_says_who_made_it.sql (tableactions_a's): archived rows again carry no created_by / created_by_name. Same signature and grants.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: custom.archived_tables_everywhere(text, integer, integer) 2c592e85cf2167a9966788310b37c453a1ccc24b6ce79891751204d27609e929

CREATE OR REPLACE FUNCTION custom.archived_tables_everywhere(p_lane text DEFAULT 'org'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cap    integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_need   integer;
  v_kernel uuid := custom.table_kernel_id();
  v_window integer;
  v_cands  jsonb;
  v_n      integer;
  v_last   boolean;
  v_b_at   timestamptz;
  v_b_id   uuid;
  v_org    uuid;
  v_k      integer;
  v_name   text;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
  v_had    jsonb := '{}'::jsonb;   -- organization -> how many of its own newest it has answered
  v_spent  jsonb := '{}'::jsonb;   -- organization -> true once it has nothing more to give
  v_in     integer;
  v_all    jsonb := '[]'::jsonb;
  v_rows   jsonb;
begin
  -- THE ARCHIVED TABLES OF EVERY ORGANIZATION THE CALLER BELONGS TO (org-filter sweep, 2026-09-29;
  -- lane DATA-HOME-3B2, 2026-10-01). Every row comes from custom.read_records_archived over the
  -- Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the
  -- request's role through custom.caller_role(), so this door being SECURITY DEFINER admits nobody)
  -- and the row ladder in its own body; an organization whose wall refuses (42501) contributes
  -- nothing. This body only adds the answers together.
  --
  -- DRIVEN FROM THE ARCHIVE ROWS, NEVER FROM THE MEMBERSHIPS (TABLE-ACTIONS, 2026-10-03). Each
  -- organization asked costs its wall, its ladder, its mask and its rendering (60-300 ms on the
  -- clone), and this body used to ask EVERY organization holding an archived Table for its newest
  -- v_cap + v_off — 28 organizations and ~1,300 rendered rows for admin@admin.com to show 200, 4.6 s
  -- cold, a statement timeout under load. Now:
  --   1. THE WINDOW. The newest archived Tables across the person's organizations are read as keys
  --      only (organization, id, moment), one indexed statement. The ladder only ever REMOVES rows,
  --      so the page lies inside the window as soon as enough of the window is readable.
  --   2. ONLY THE ORGANIZATIONS IN THE WINDOW ARE ASKED, each for exactly as many of its own newest as
  --      it has in the window (its readable rows up to the window's edge are all among them), through
  --      the same door as before. An organization outside the window is never asked.
  --   3. If fewer than v_cap + v_off readable rows reach the window's edge, the window doubles and only
  --      the organizations' next rows are asked (the door's own offset). The answer is the same page
  --      the old body produced; the cost follows the page, not the number of organizations.
  v_need := v_cap + v_off;
  v_window := v_need;
  loop
    select coalesce(jsonb_agg(jsonb_build_object('o', c.organization_id, 'i', c.id, 'a', c.deleted_at)
                              order by c.deleted_at desc, c.id), '[]'::jsonb)
      into v_cands
      from (select r.organization_id, r.id, r.deleted_at
              from custom.record r
             where r.organization_id = any (array(select o.id
                                                    from iam.organizations o
                                                   where o.id in (select iam.my_orgs())
                                                     and o.archived_at is null))
               and r.table_id = v_kernel
               and r.deleted_at is not null
             order by r.deleted_at desc, r.id
             limit v_window) c;
    v_n := jsonb_array_length(v_cands);
    v_last := v_n < v_window;            -- the window holds every archived Table there is
    if v_n > 0 then
      v_b_at := (v_cands -> (v_n - 1) ->> 'a')::timestamptz;
      v_b_id := (v_cands -> (v_n - 1) ->> 'i')::uuid;
    end if;

    for v_org, v_k in
      select (x ->> 'o')::uuid, count(*)::integer
        from jsonb_array_elements(v_cands) x
       group by 1
    loop
      continue when v_spent ? v_org::text;
      v_at := coalesce((v_had ->> v_org::text)::integer, 0);
      continue when v_at >= v_k;
      select o.name::text into v_name from iam.organizations o where o.id = v_org;
      begin
        v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
        loop
          v_chunk := least(v_k - v_at, v_ceil);
          exit when v_chunk < 1;
          select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('organization_id', v_org,
                                                                      'organization_name', v_name)), '[]'::jsonb),
                 count(*)
            into v_page, v_got
            from custom.read_records_archived(v_org, v_kernel, p_lane, false, v_chunk, v_at) x;
          v_all := v_all || v_page;
          v_at := v_at + v_got;
          if v_got < v_chunk then
            v_spent := v_spent || jsonb_build_object(v_org::text, true);
            exit;
          end if;
        end loop;
        v_had := v_had || jsonb_build_object(v_org::text, v_at);
      exception when insufficient_privilege then
        v_spent := v_spent || jsonb_build_object(v_org::text, true);
        continue;
      end;
    end loop;

    exit when v_last;
    -- Every readable row up to the window's edge is now known. Enough of them is the page.
    select count(*) into v_in
      from jsonb_array_elements(v_all) w
     where (w ->> 'archived_at')::timestamptz > v_b_at
        or ((w ->> 'archived_at')::timestamptz = v_b_at and (w ->> 'id')::uuid <= v_b_id);
    exit when v_in >= v_need;
    v_window := v_window * 2;
  end loop;

  select coalesce(jsonb_agg(w order by (w ->> 'archived_at')::timestamptz desc nulls last, (w ->> 'id')::uuid), '[]'::jsonb)
    into v_rows
    from (select w from jsonb_array_elements(v_all) w
           order by (w ->> 'archived_at')::timestamptz desc nulls last, (w ->> 'id')::uuid
           limit v_cap offset v_off) s;
  return jsonb_build_object('success', true, 'tables', v_rows, 'limit', v_cap, 'offset', v_off);
end
$function$

;
