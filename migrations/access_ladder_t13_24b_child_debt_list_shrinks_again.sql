-- access_ladder_t13_24b_child_debt_list_shrinks_again.sql
-- chair-step: replaces the T-13 2.3b guard function body only (read-only function, no data or policy touched); the REVOKE re-closes EXECUTE on it to client roles, as at its birth.
--
-- T-13 2.3d: eight more children read only through their parent (23o-23r, 23t-23w) and come off the
-- shrink-only debt list. 14 remain.
--
-- based-on: iam.children_with_own_read_arms() 2de69f01cad1a0ab94e521f4aac0fd0413af4966c3f25949b54622dd8a298d1c

create or replace function iam.children_with_own_read_arms()
 RETURNS TABLE(check_name text, token text, table_name text, policy_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- ACCESS LADDER T-13 2.3b guard. One row per child (registered component) whose read policies
  -- carry an arm not derived from its parent. ZERO ROWS OR IT FAILED.
  --   own_arm_in_std_select    std_select reads a column of the child other than its id and its
  --                            composition parent columns (a stray organization / owner / row-class
  --                            column), or the organization-admin set, or the system-organization lane
  --   no_parent_arm            std_select does not name every composition parent column
  --   anon_read_not_via_parent pub_read on a child that does not declare the anon-via-public-parent
  --                            lane, or whose text reads no composition parent table
  --   bespoke_read_policy      any other permissive client read policy (hand-written), outside the debt list
  --   bespoke_debt_cleared     a debt-list child now clean: take it off the list (the list only shrinks)
  with debt(token) as (
    -- Hand-written read policies on children, found 2026-09-28 (T-13 2.3b census). Each needs its
    -- own review before it is superseded by the generated set; the list may only shrink.
    -- 2026-09-28 T-13 2.3c/2.3d: 14 cleared; 14 remain (reasons in the access-ladder REGISTER).
    select unnest(array['credential_attachment',
      'embeddings_google_gemini_2_1536', 'embeddings_oai_3_small_1536', 'embeddings_voyage_4_large_1024',
      'embeddings_voyage_code_3_1024', 'file_analysis', 'global_execution_control', 'kg_chunk_entities',
      'kg_edges', 'org_industries', 'organization_preferences', 'sms_webhook_logs',
      'udt_dataset_row_versions', 'user_follows'])
  ),
  child as (
    select et.token, et.schema_name, et.table_name, coalesce(et.component_anon_read_via_public_parent, false) anon_flag,
           to_regclass(format('%I.%I', et.schema_name, et.table_name)) rel
      from platform.entity_types et
     where et.is_active and (et.is_component or et.rls_variant = 'component')
  ),
  pol as (
    select c.token, c.table_name, c.schema_name || '.' || c.table_name tbl, c.rel, c.anon_flag, p.polname::text polname,
           pg_get_expr(p.polqual, p.polrelid) qual,
           -- the same text with string literals, output aliases and casts removed, so only identifiers remain
           regexp_replace(regexp_replace(regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
                          '''[^'']*''', '', 'g'), ' AS [a-z_]+', '', 'g'), '::[a-z_.]+', '', 'g') ident_text
      from child c join pg_policy p on p.polrelid = c.rel
     where p.polpermissive and p.polcmd in ('r', '*')
       and (p.polroles = '{0}'::oid[]
            or exists (select 1 from unnest(p.polroles) r
                        where pg_get_userbyid(r) in ('anon', 'authenticated')))
  ),
  own_col as (
    -- the child's own columns that no parent-derived arm may read: all but id and parent columns
    select pol.token, pol.polname, a.attname::text col
      from pol join pg_attribute a on a.attrelid = pol.rel and a.attnum > 0 and not a.attisdropped
     where pol.polname = 'std_select'
       and a.attname <> 'id'
       and a.attname not in (select er.fk_column from platform.entity_relationships er
                              where er.child_type = pol.token and er.kind in ('composition', 'containment'))
       and (pol.ident_text ~ ('(^|[^.a-z0-9_])' || a.attname || '\M(?![.(])')
            or pol.ident_text ~ ('\m' || pol.table_name || '\.' || a.attname || '\M'))
  ),
  found as (
    select 'own_arm_in_std_select'::text, pol.token, pol.tbl, pol.polname from pol
     where pol.polname = 'std_select'
       and (exists (select 1 from own_col o where o.token = pol.token)
            or pol.qual ~ '(my_admin_orgs|global_readable)')
    union all
    select 'no_parent_arm', pol.token, pol.tbl, pol.polname from pol
     where pol.polname = 'std_select'
       and exists (select 1 from platform.entity_relationships er
                    where er.child_type = pol.token and er.kind = 'composition'
                      and pol.qual !~ ('\m' || er.fk_column || '\M'))
    union all
    select 'anon_read_not_via_parent', pol.token, pol.tbl, pol.polname from pol
     where pol.polname = 'pub_read'
       and (not pol.anon_flag
            or not exists (select 1 from platform.entity_relationships er
                             join platform.entity_types pt on pt.token = er.parent_type
                            where er.child_type = pol.token and er.kind = 'composition'
                              and position(lower('FROM ' || pt.schema_name || '.' || pt.table_name) in lower(pol.qual)) > 0))
    union all
    select 'bespoke_read_policy', token, tbl, polname from pol
     where polname not in ('std_select', 'pub_read', 'platform_admin_read', 'platform_admin_all',
                           'platform_admin_only', 'platform_admin_select', 'org_open_gate')
       and token not in (select token from debt)
  )
  select * from found
  union all
  select 'bespoke_debt_cleared', d.token, null, null from debt d
   where not exists (select 1 from pol
                      where pol.token = d.token
                        and pol.polname not in ('std_select', 'pub_read', 'platform_admin_read', 'platform_admin_all',
                                                'platform_admin_only', 'platform_admin_select', 'org_open_gate'))
  order by 1, 2, 4;
$function$;

revoke all on function iam.children_with_own_read_arms() from public, anon, authenticated;
