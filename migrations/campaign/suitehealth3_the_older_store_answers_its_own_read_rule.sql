-- additive: yes
-- based-on: custom.where_tables_live(uuid[]) c226dbae020fd64fd51c69e0b72d9aa33f8eaa5c2e8ea0a4d0ad07c42723a9b3
--
-- chair-step: it ADDS one SECURITY INVOKER function, `workbench.dataset_readable_by(uuid, uuid)`
--   (no client grant — PUBLIC, anon and authenticated hold no EXECUTE), and REPLACES the body of
--   `custom.where_tables_live(uuid[])` (identical signature, volatility, security and grants) so
--   it asks that function instead of spelling the older store's read rule inline. Every answer is
--   unchanged. The inverse is
--   `migrations/inverse/suitehealth3_the_older_store_answers_its_own_read_rule_down.sql`.
--
-- LANE SUITE-HEALTH-3 follow-up to `suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it.sql`.
-- After that apply, `pnpm check:store-doors-decide` census 4 (`custom.doors_not_on_one_ladder`)
-- named `custom.where_tables_live`: a body in schema `custom` naming `iam.has_access_for`. That
-- rule is the one ladder's rule for RECORD-STORE rows, and the door still asks the one ladder
-- (`custom.has_visibility`) about the record-store copy. The other question it asks — may this
-- person open the OLDER table — is not a record-store question: it is the older store's own read
-- rule (workbench.udt_datasets' std_select + platform_admin_read, measured identical to that RLS
-- for admin@admin.com, test@test.com and a stranger over all 95 older tables on the dev clone).
-- So it now lives with the older store, in schema `workbench`, once, and the door asks it by name.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION workbench.dataset_readable_by(p_user uuid, p_dataset_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- THE OLDER STORE'S OWN READ RULE, for one person and one older table: the same arms as
  -- workbench.udt_datasets' `std_select` and `platform_admin_read` policies (creator, public,
  -- the dataset's access grants, a platform admin). SECURITY INVOKER and no client grant: it is
  -- asked from inside custom.where_tables_live, which runs as the definer and names the person.
  return exists (
    select 1 from workbench.udt_datasets d
     where d.id = p_dataset_id
       and (d.created_by = p_user
            or d.visibility = 'public'::platform.visibility
            or iam.has_access_for(p_user, 'dataset', d.id, 'viewer'::public.permission_level)
            or public.is_platform_admin()));
end;
$function$;

revoke all on function workbench.dataset_readable_by(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           case h.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (SUITE-HEALTH-3). A person is told an older table's home only
      -- when she may open it: the older store's own read rule for her, or the one ladder on its
      -- record-store copy. Anyone else hears `record` — the word an id nobody minted answers —
      -- and the store's doors then say "not found" for it exactly as for that id. No person
      -- (the service lane, the store owner) is answered as before.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when workbench.dataset_readable_by(v_me, i.id) then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$function$;
