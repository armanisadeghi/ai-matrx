-- chair-step: this puts custom.data_home back to the one-argument body datahome2_g made (no p_search): the signature loses an argument, so custom.data_home(uuid, text) is dropped and custom.data_home(uuid) made again; its platform.client_callable_door row is moved back to the old identity and its EXECUTE grant to authenticated kept. No table, no permission change, no data row is touched.
-- lane: DATA-HOME-3B
-- based-on: custom.data_home(uuid,text) 9bfb6b26320d2fe8f89fc8358fa4d0388120befc2ba3f3eddafd6f88184beaaf

drop function if exists custom.data_home(uuid, text);

CREATE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
declare
  v_me      uuid := custom.query_principal();
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tables
    from custom.data_home_tables(p_organization_id) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  with ids as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
end;
$function$

;

update platform.client_callable_door
   set identity_args     = 'p_organization_id uuid',
       identity_argtypes = array['uuid'::regtype::oid],
       declared_by       = 'datahome2_g_the_data_home_is_one_call.sql',
       reason            = 'Decides a named organization first in its own name (custom.assert_client_may_reach), asks the Table-visibility walk (custom.tables_seen_once_per_group) once for the caller''s organizations, then answers with the rows of custom.data_home_tables, custom.data_home_items and custom.data_home_changed_by — each of which decides every organization and row by its own walls, unchanged. p_organization_id only NARROWS. An anonymous caller gets empty lists. It writes nothing.'
 where schema_name = 'custom' and function_name = 'data_home';

update platform.client_callable_door
   set reason = replace(reason, 'SERVED BY custom.data_home(uuid, text)', 'SERVED BY custom.data_home(uuid)')
 where schema_name = 'custom'
   and function_name in ('data_home_tables', 'data_home_items', 'data_home_changed_by')
   and reason like '%SERVED BY custom.data_home(uuid, text)%';

grant execute on function custom.data_home(uuid) to authenticated;
