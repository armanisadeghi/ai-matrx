-- chair-step: this puts custom.archived_tables_everywhere(text, integer, integer) back to the org-filter sweep's SECURITY INVOKER body (limit + offset asked of every organization in one page, 200-row cap) and its platform.client_callable_door row back to that declaration. Same signature and grants; no table, permission or data row is touched.
-- lane: DATA-HOME-3B2
-- based-on: custom.archived_tables_everywhere(text, integer, integer) 85fadb80e608a24ccfb656b97cc256e65aa11d2ce61076902069abdfef7d6837

CREATE OR REPLACE FUNCTION custom.archived_tables_everywhere(p_lane text DEFAULT 'org'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cap integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_org uuid;
  v_all jsonb := '[]'::jsonb;
  v_rows jsonb;
begin
  -- THE ARCHIVED TABLES OF EVERY ORGANIZATION THE CALLER BELONGS TO (org-filter sweep, 2026-09-29).
  -- Each organization is read through custom.read_records_archived over the Table kernel, i.e.
  -- through its own wall and ladder; this only adds the answers together, each row carrying its
  -- organization. An organization whose wall refuses (42501) contributes nothing.
  for v_org in select o.id from iam.organizations o where o.id in (select iam.my_orgs()) and o.archived_at is null loop
    begin
      v_all := v_all || coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('organization_id', v_org,
                 'organization_name', (select g.name::text from iam.organizations g where g.id = v_org)))
              from custom.read_records_archived(v_org, custom.table_kernel_id(), p_lane, false, v_cap + v_off, 0) x), '[]'::jsonb);
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
   set declared_by = 'org_filter_sweep_2026_09_29',
       reason = 'SECURITY INVOKER wrapper. Reads the archived Tables of every organization the caller belongs to (iam.my_orgs()), each through custom.read_records_archived over the Table kernel, which decides the organization wall (custom.assert_client_may_reach) and the row ladder in its own body; an organization that refuses contributes nothing. It only adds the answers together and writes nothing.',
       argument_rules = '{"version": 1, "arguments": {"p_lane": {"type": "text", "check": "vocabulary (mine|org) refused by custom.read_records_archived in each organization.", "position": 1, "verified": "2026-09-29 org-filter sweep"}, "p_limit": {"type": "integer", "check": "clamped to 1..200 here and by custom.page_size per organization.", "position": 2, "verified": "2026-09-29 org-filter sweep"}, "p_offset": {"type": "integer", "check": "clamped to >= 0.", "position": 3, "verified": "2026-09-29 org-filter sweep"}}, "declared_at": "2026-09-29 org-filter sweep", "declared_by": "org_filter_sweep_2026_09_29"}'::jsonb
 where schema_name = 'custom' and function_name = 'archived_tables_everywhere';
