-- chair-step: lane PRESS-AT-SIZE (2026-10-01, SAFETY-NET W12). ONE replaced body, platform._final_switch_orphan_lists() (same signature, grants kept, STABLE, reads only). No table, trigger, index, grant, policy or data row is touched; CREATE OR REPLACE FUNCTION takes only the pg_proc row lock. Not in the access kernel's fingerprint.
-- based-on: platform._final_switch_orphan_lists() acc2e6aa790db5f3e05778f59c0c488ca345eb87e69f43350bea7d088b43f53e
-- lane: PRESS-AT-SIZE
-- INVERSE: migrations/inverse/pressatsize_a_list_something_chooses_from_goes_where_it_is_chosen_down.sql
-- TEST: scripts/campaign-tests/pressatsize_a_chosen_from_list_keeps_its_choices_red_green.sql (RED before, GREEN after; clone only, rolled back)
--
-- THE DEFECT (W12). An older pick list with no organization whose maker belongs to several organizations
-- is archived by the final switch "with no owner organization" and has no copy in the store; after the
-- press public.get_structured_list_for_selection answers null for it (platform._older_list_moved_by_switch
-- needs an organization), so anything that chooses from it loses its choices with no word. Production
-- 2026-10-01 (read-only): the agent "Generate custom speech" (Matrx System) has a "scene" variable whose
-- picker reads "scene options" (6a7822ca…, 9 choices, maker in 5 organizations) — its 9 chips would go.
--
-- THE FIX. Where the maker does not decide the organization, what CHOOSES FROM the list does: when every
-- live agent variable picker, older column and store field that reads the list is in ONE organization, the
-- list resolves to that organization (resolution 'organization'), so Step 1 gives it that organization and
-- copies it into the store like every other list there, and after the press it reads from its copy. A list
-- chosen from in several organizations stays 'no_owner' and its "why" says so, by count.

CREATE OR REPLACE FUNCTION platform._final_switch_orphan_lists()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with o as (
    select l.id, l.list_name, l.user_id
      from workbench.udt_structured_lists l
     where l.organization_id is null and l.deleted_at is null
  ), b as (
    -- PRESS-AT-SIZE (W12): the organizations of everything that chooses from each such list.
    select o.id, d.organization_id as org
      from o join agent.definition d
        on d.deleted_at is null and d.organization_id is not null
       and jsonb_path_exists(coalesce(d.variable_definitions, '[]'::jsonb),
                             '$[*].customComponent.picklist.listId ? (@ == $id)', jsonb_build_object('id', o.id::text))
    union
    select o.id, ds.organization_id
      from o join workbench.udt_dataset_fields f
        on f.deleted_at is null and f.metadata #>> '{format,options,structuredList,listId}' = o.id::text
      join workbench.udt_datasets ds on ds.id = f.table_id and ds.deleted_at is null and ds.organization_id is not null
    union
    select o.id, r.organization_id
      from o join custom.record r
        on r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null
       and (r.data -> 'config' ->> 'options_table_id' = o.id::text
            or r.data #>> '{custom_component,picklist,listId}' = o.id::text)
  ), bo as (
    select b.id, count(distinct b.org)::int as n, (array_agg(distinct b.org))[1] as org
      from b join iam.organizations x on x.id = b.org and x.archived_at is null
     group by b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
           'maker', coalesce((select u.email::text from auth.users u where u.id = l.user_id), 'nobody'),
           'resolution', case when m.n = 1 or coalesce(c.n, 0) = 1 then 'organization' else 'no_owner' end,
           'organization_id', case when m.n = 1 then m.org when c.n = 1 then c.org end,
           'organization_name', (select x.name::text from iam.organizations x
                                  where x.id = case when m.n = 1 then m.org when c.n = 1 then c.org end),
           'why', case when m.n = 1 then 'its maker belongs to one organization'
                       when c.n = 1 then 'what chooses from it is in one organization'
                       when c.n > 1 then format('chosen from in %s organizations', c.n)
                       when l.user_id is null then 'it has no maker'
                       when m.n = 0 then 'its maker belongs to no organization'
                       else format('its maker belongs to %s organizations', m.n) end)
         order by l.list_name, l.id), '[]'::jsonb)
    from o l
    cross join lateral (
      select count(*)::int as n, (array_agg(x.organization_id))[1] as org
        from iam.organization_member x
        join iam.organizations z on z.id = x.organization_id and z.archived_at is null
       where x.user_id = l.user_id) m
    left join bo c on c.id = l.id;
$function$;
