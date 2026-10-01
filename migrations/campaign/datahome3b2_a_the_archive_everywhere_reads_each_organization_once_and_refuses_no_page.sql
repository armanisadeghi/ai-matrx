-- chair-step: this REPLACES the body of custom.archived_tables_everywhere(text, integer, integer) — the data home's and the old hub's Archived section — so no page is ever refused and the whole archive comes back in one call: each organization is read through its own custom.read_records_archived in pages within that organization's own page ceiling (never limit + offset in one ask, which the store refused past 1000 rows with 22023 PAGE-1), organizations with no archived Table at all are not asked, and one call may now carry up to 1000 rows (was 200). The function becomes SECURITY DEFINER only so it can see which of HER organizations hold an archived Table before asking them; every row still comes from read_records_archived, which decides the organization wall (custom.assert_client_may_reach, via custom.caller_role() = the request's role) and the row ladder itself. Same signature, same answer shape, same EXECUTE grants; its platform.client_callable_door row is re-declared. No table, no permission, no data row is touched; only catalog locks.
-- lane: DATA-HOME-3B2
-- based-on: custom.archived_tables_everywhere(text, integer, integer) 13b40ffa9bbfb44acc93f0446bb363aaa60c9f650a9fcfad8156a442bcd0d6da
--
-- WHY (production, 2026-10-01, Supabase logs): 3 of ~12 data-home walks met this door failing.
--   400 at 10:03:49Z — 22023 "custom.read_records_archived was asked for 1200 rows": the page at
--       offset 1000 asked every organization for limit + offset = 1200 rows in one page.
--   500 at 10:09:53Z and five more to 10:10:13Z — 57014 statement timeout (authenticated = 8 s):
--       every page paid all 52 of admin's organizations' wall, mask and ladder again (~50 ms each),
--       about 3 s a page quiet (pg_stat_statements: mean 3291 ms, max 7973 ms over 1219 calls) and
--       past 8 s while the database was busy. The clone never showed it because psql runs as the
--       owner with a 30 s timeout.
-- NOW: an organization is asked only if it holds at least one archived Table at all (26 of admin's
-- 52, 11 of the member's 17), each asked once per call, in pages of at most its own ceiling; the
-- page the client asks for may be up to 1000 rows, so the home reads its archive in ONE call.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome3b2_the_archive_everywhere_answers_every_page.sql
-- Inverse: migrations/inverse/datahome3b2_a_the_archive_everywhere_reads_each_organization_once_and_refuses_no_page_down.sql

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
  v_org    uuid;
  v_name   text;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
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
  -- The newest v_cap rows after v_off across organizations can only come from each organization's
  -- own newest v_cap + v_off, so that is all each one is asked for — in pages of at most its own
  -- ceiling (custom.page_ceiling), never in one ask the store would refuse (PAGE-1).
  --
  -- SECURITY DEFINER for one reason: to skip HER organizations that hold no archived Table at all
  -- (the exists below) instead of paying their wall, mask and ladder for nothing. That test only
  -- narrows which organizations are asked; it is never an answer.
  v_need := v_cap + v_off;
  for v_org, v_name in
    select o.id, o.name::text
      from iam.organizations o
     where o.id in (select iam.my_orgs())
       and o.archived_at is null
       and exists (select 1 from custom.record r
                    where r.organization_id = o.id
                      and r.table_id = v_kernel
                      and r.deleted_at is not null)
  loop
    begin
      v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
      v_at := 0;
      loop
        v_chunk := least(v_need - v_at, v_ceil);
        exit when v_chunk < 1;
        select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('organization_id', v_org,
                                                                    'organization_name', v_name)), '[]'::jsonb),
               count(*)
          into v_page, v_got
          from custom.read_records_archived(v_org, v_kernel, p_lane, false, v_chunk, v_at) x;
        v_all := v_all || v_page;
        v_at := v_at + v_got;
        exit when v_got < v_chunk;
      end loop;
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
  select coalesce(jsonb_agg(w order by (w ->> 'archived_at') desc nulls last, w ->> 'id'), '[]'::jsonb)
    into v_rows
    from (select w from jsonb_array_elements(v_all) w
           order by (w ->> 'archived_at') desc nulls last, w ->> 'id' limit v_cap offset v_off) s;
  return jsonb_build_object('success', true, 'tables', v_rows, 'limit', v_cap, 'offset', v_off);
end
$function$;

update platform.client_callable_door
   set declared_by    = 'datahome3b2_a_the_archive_everywhere_reads_each_organization_once_and_refuses_no_page.sql',
       reason         = 'SECURITY DEFINER wrapper (DATA-HOME-3B2, 2026-10-01). Reads the archived Tables of every organization the caller belongs to (iam.my_orgs()), each through custom.read_records_archived over the Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the request role via custom.caller_role(), so definer rights admit nobody) and the row ladder in its own body; an organization that refuses contributes nothing. Definer rights are used only to skip her organizations holding no archived Table at all (an existence test that narrows which organizations are asked, never an answer). Each organization is read in pages within its own page ceiling. It only adds the answers together and writes nothing.',
       argument_rules = jsonb_set(argument_rules, '{arguments,p_limit,check}',
                          to_jsonb('clamped to 1..1000 here; each organization is read in pages within custom.page_ceiling(org).'::text))
 where schema_name = 'custom' and function_name = 'archived_tables_everywhere';
