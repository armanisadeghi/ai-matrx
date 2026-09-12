-- platform_unregistered_client_readable_dd159_batch3 — THE PUBLIC-REFERENCE, MACHINERY, VOCABULARY
-- AND LEDGER TABLES ENTER THE REGISTRY (DD-159, batch 3).
--
-- Batch 1 registered the 47 personal-shaped tables of B-41b §FR1.8 and left 204 client-readable
-- relations outside `platform.entity_types`. This registers 74 more of them: the groups whose
-- registration carries no judgement call, because the live door already says what they are.
--
-- SAME RULE AS BATCH 1: REGISTERED, NOT REGENERATED. No policy and no grant moves here. `iam.apply_rls`
-- DROPS every policy on a table before it generates, and nothing in this lane has proven any of these
-- tables' live policy sets equivalent to a generated one. Registration is what makes them visible to
-- `iam.verify_canonical`, to `iam.class_lanes` and to `pnpm check:unregistered-client-readable`;
-- generating is a separate, per-table, proven-equivalent act. Section 3 PROVES nothing moved rather
-- than asserting it.
--
-- THE FOUR GROUPS, and why each one is not a judgement call:
--   * PUBLIC REFERENCE CATALOG (25) — measured live on 2026-09-12 as the `anon` role, each of these
--     returns EVERY row it holds to a client with no session at all (billing.plan 9/9,
--     platform.feature_knob is NOT in this batch, tool.mcp_server 130/130, ui.ui_surface_value
--     5109/5109, …). `data_class='public'` describes the door that exists. It does not open one.
--   * MACHINERY (34) — registries, guard logs, audit backing tables and migration ledgers that the
--     access kernel, the provisioner or the conformance toolkit reads. `audit_class='machinery'`
--     with its reason on the row is db-rules §1's sanctioned way to sit outside certification, and
--     it is what makes `iam.apply_rls` REFUSE the table.
--   * VOCABULARY (6) — platform-wide controlled vocabularies read by every organization; signed-in
--     readers only.
--   * LEDGER (9) — append-only, server-written, no owner. `history.row_versions` is here, and its 28
--     partitions are covered by it: a partition inherits its parent's grants and RLS and is not a
--     separate entity, which is why the guard folds them into the parent rather than demanding 28
--     more tokens.
--
-- NOT IN THIS BATCH, deliberately: `platform.feature_knob` returns all 517 rows to an anonymous
-- client, and unlike a price list that is the platform's whole settings registry. Whether that door
-- should be open is a RULING, not a classification, so it stays on the guard's allowlist named for
-- the chair rather than being quietly stamped `public` here.

-- ═════════════════════════════════════════════ 1. the reads, BEFORE anything moves
create temporary table _b48c_scope(sch text, tbl text) on commit drop;
insert into _b48c_scope
  with g as (select c.oid, bool_or(x.grantee in ('anon','authenticated') and x.priv='SELECT') sel
               from pg_class c
               cross join lateral (select (aclexplode(c.relacl)).grantee::regrole::text grantee,
                                          (aclexplode(c.relacl)).privilege_type priv) x
              where c.relkind in ('r','p') group by c.oid)
  select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join g on g.oid=c.oid
    left join platform.entity_types et on et.schema_name=n.nspname and et.table_name=c.relname
   where c.relkind in ('r','p') and g.sel and et.token is null
     and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime',
          'vault','supabase_migrations','extensions','graphql','graphql_public','net','pgsodium',
          'pgsodium_masks','supabase_functions','cron','pgbouncer','_analytics','_realtime');

create temporary table _b48c_before(sch text, tbl text, identity text, readable boolean) on commit drop;
create temporary table _b48c_after (sch text, tbl text, identity text, readable boolean) on commit drop;

create or replace function pg_temp._b48c_measure(p_into text) returns void language plpgsql as $fn$
declare
  r record; i int; v_name text; v_uid text; v_any boolean;
  ids text[][] := array[
    array['anon',''], array['padmin','6555aa73-c647-4ecf-8a96-b60e315b6b18'],
    array['owner','392afd39-d59c-4418-866b-451e9d93fead'],
    array['orgadmin','34ed4fc3-c527-4819-99bf-15c26603b261'],
    array['member','f0146c96-e02e-420b-a99f-92774da0566c']];
begin
  for r in
    with g as (
      select c.oid,
             bool_or(x.grantee='anon' and x.priv='SELECT') anon_sel,
             bool_or(x.grantee='authenticated' and x.priv='SELECT') auth_sel
        from pg_class c
        cross join lateral (select (aclexplode(c.relacl)).grantee::regrole::text grantee,
                                   (aclexplode(c.relacl)).privilege_type priv) x
       where c.relkind in ('r','p') group by c.oid)
    select s.sch, s.tbl, g.anon_sel, g.auth_sel
      from _b48c_scope s
      join pg_namespace n on n.nspname = s.sch
      join pg_class c on c.relnamespace = n.oid and c.relname = s.tbl
      join g on g.oid = c.oid
     order by 1,2
  loop
    for i in 1..array_length(ids,1) loop
      v_name := ids[i][1]; v_uid := ids[i][2]; v_any := null;
      begin
        if v_name = 'anon' then
          if not r.anon_sel then continue; end if;
          perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
          execute 'set local role anon';
        else
          if not r.auth_sel then continue; end if;
          perform set_config('request.jwt.claims',
            json_build_object('sub',v_uid,'role','authenticated')::text, true);
          execute 'set local role authenticated';
        end if;
        execute format('select exists (select 1 from %I.%I)', r.sch, r.tbl) into v_any;
      exception when others then
        v_any := null;
      end;
      begin execute 'reset role'; exception when others then null; end;
      execute format('insert into %s values ($1,$2,$3,$4)', p_into) using r.sch, r.tbl, v_name, v_any;
    end loop;
  end loop;
end $fn$;

do $$
declare n int;
begin
  select count(*) into n from _b48c_scope;
  if n <> 204 then
    raise exception 'dd159 batch 3: the unregistered client-readable set is % relations, not the 204 '
      'batch 1 left behind. Somebody else moved the set; re-measure before applying.', n;
  end if;
  perform pg_temp._b48c_measure('_b48c_before');
  raise notice 'dd159 batch 3: baseline read for % relation/identity pairs',
    (select count(*) from _b48c_before);
end $$;

-- ═════════════════════════════════════════════ 2. token collisions are checked, never assumed
do $$
declare v_clash text;
begin
  select string_agg(t, ', ') into v_clash from unnest(array[
      'billing_capability',
      'billing_capability_limit',
      'billing_plan',
      'billing_plan_limit',
      'billing_price',
      'billing_product',
      'jurisdiction_policy',
      'content_certification',
      'wbx_recipe',
      'industry',
      'assurance_level',
      'source_authority',
      'shareable_resource_registry',
      'app_config',
      'catalog_entry',
      'tool_binding',
      'tool_executor',
      'mcp_config',
      'mcp_server',
      'tool_surface_defaults',
      'ui_client',
      'ui_surface_agent_role',
      'ui_surface_client_tool',
      'ui_surface_value',
      'ui_surface_write_target',
      'audit_broken_functions',
      'audit_canonical_findings',
      'audit_function_deps',
      'audit_function_runtime_probe',
      'audit_m2m_candidates',
      'audit_refresh_log',
      'audit_stale_registry',
      'audit_unregistered_candidates',
      'meta_excluded_schema',
      'meta_table_stats_history',
      'association_type',
      'ddl_guard_log',
      'deprecated_relation',
      'edge_payload_kind',
      'entity_grant',
      'entity_relationship',
      'entity_type',
      'platform_reachability',
      'platform_reference_category',
      'platform_reference_declaration',
      'platform_schema',
      'platform_repo',
      'lifecycle_archive',
      'lifecycle_archive_row',
      'lifecycle_audit',
      'lifecycle_entity_plan',
      'lifecycle_map_build',
      'lifecycle_reference_map',
      'lifecycle_run',
      'lifecycle_tier_ledger',
      'mtx_public_url_guard',
      'schema_migration_ledger',
      'schema_migration_legacy',
      'infra_status',
      'change_type_default',
      'knob_scope_kind',
      'taxonomy_node',
      'stage_ref_kind',
      'seo_ai_capability',
      'files_account_tier',
      'row_version',
      'execution_event_cursor',
      'knob_override_audit',
      'org_admin_audit',
      'rag_library_audit_log',
      'guest_conversion_audit',
      'admin_audit_log',
      'admin_email_log',
      'dev_login_audit']) t
   where exists (select 1 from platform.entity_types e where e.token = t);
  if v_clash is not null then
    raise exception 'dd159 batch 3: these tokens already exist and this batch would collide with '
      'them: %. A token is the only stable identity (db-rules §1) — pick a different name, never '
      'reuse.', v_clash;
  end if;
end $$;

-- ═════════════════════════════════════════════ 3. the 74 registrations
do $$
declare
  v_seen constant text := ' Registered by DD-159 batch 3 (B-48): this table had an anon or '
    'authenticated SELECT grant and no registry row at all, so it had no class, no generated policy '
    'and no guard. REGISTERED, NOT REGENERATED — its live policies are untouched and unproven. Read '
    'iam.verify_canonical on this token before running iam.apply_rls on it: apply_rls DROPS every '
    'policy first.';
  r record;
begin
  for r in
    select * from (values
      ('billing','capability','billing_capability','Billing capability','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('billing','capability_limit','billing_capability_limit','Billing capability limit','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('billing','plan','billing_plan','Billing plan','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('billing','plan_limit','billing_plan_limit','Billing plan limit','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('billing','price','billing_price','Billing price','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('billing','product','billing_product','Billing product','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('crm','jurisdiction_policy','jurisdiction_policy','Jurisdiction policy','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('education','content_certification','content_certification','Content certification','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('extend','wbx_recipe','wbx_recipe','Extension recipe','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('iam','industries','industry','Industry','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('platform','assurance_level','assurance_level','Assurance level','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('platform','source_authority','source_authority','Source authority','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('platform','shareable_resource_registry','shareable_resource_registry','Shareable resource registry','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('public','app_config','app_config','App config','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('public','catalog_entries','catalog_entry','Catalog entry','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('tool','binding','tool_binding','Tool binding','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('tool','executor','tool_executor','Tool executor','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('tool','mcp_config','mcp_config','MCP config','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('tool','mcp_server','mcp_server','MCP server','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('tool','surface_defaults','tool_surface_defaults','Tool surface defaults','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('ui','ui_client','ui_client','UI client','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('ui','ui_surface_agent_role','ui_surface_agent_role','UI surface agent role','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('ui','ui_surface_client_tool','ui_surface_client_tool','UI surface client tool','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('ui','ui_surface_value','ui_surface_value','UI surface value','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('ui','ui_surface_write_target','ui_surface_write_target','UI surface write target','system','public','organization','entity',
       'Every row of this table is readable by a fully ANONYMOUS client today (measured live 2026-09-12 as the anon role: it returns the whole table). data_class=public states what the door already is rather than pretending otherwise. If that is wrong for this table it is a DOOR change, made deliberately and proven — not a silent reclassification.'),
      ('audit','broken_functions','audit_broken_functions','Broken functions','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','canonical_findings','audit_canonical_findings','Canonical findings','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','function_deps','audit_function_deps','Function dependencies','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','function_runtime_probe','audit_function_runtime_probe','Function runtime probe','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','m2m_candidates','audit_m2m_candidates','M2M candidates','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','refresh_log','audit_refresh_log','Audit refresh log','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','stale_registry','audit_stale_registry','Stale registry','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('audit','unregistered_candidates','audit_unregistered_candidates','Unregistered candidates','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('meta','excluded_schema','meta_excluded_schema','Excluded schema','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('meta','table_stats_history','meta_table_stats_history','Table stats history','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','association_types','association_type','Association type','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','ddl_guard_log','ddl_guard_log','DDL guard log','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','deprecated_relations','deprecated_relation','Deprecated relation','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','edge_payload_kind','edge_payload_kind','Edge payload kind','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','entity_grants','entity_grant','Entity grant','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','entity_relationships','entity_relationship','Entity relationship','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','entity_types','entity_type','Entity type','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','reachability','platform_reachability','Reachability','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','reference_categories','platform_reference_category','Reference category','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','reference_declaration','platform_reference_declaration','Reference declaration','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','schemas','platform_schema','Schema','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','repo','platform_repo','Repository','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_archive','lifecycle_archive','Lifecycle archive','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_archive_row','lifecycle_archive_row','Lifecycle archive row','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_audit','lifecycle_audit','Lifecycle audit','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_entity_plan','lifecycle_entity_plan','Lifecycle entity plan','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_map_build','lifecycle_map_build','Lifecycle map build','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_reference_map','lifecycle_reference_map','Lifecycle reference map','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_run','lifecycle_run','Lifecycle run','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','lifecycle_tier_ledger','lifecycle_tier_ledger','Lifecycle tier ledger','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','mtx_public_url_guard','mtx_public_url_guard','Public URL guard','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('public','_schema_migrations','schema_migration_ledger','Migration ledger','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('public','schema_migrations','schema_migration_legacy','Legacy migration ledger','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('public','infra_status','infra_status','Infra status','system','confidential','organization','machinery',
       'The platform''s own bookkeeping — a registry, guard log, audit backing table or migration ledger that the access kernel, the provisioner or the conformance toolkit reads. audit_class=''machinery'' is the sanctioned way to sit outside the certification universe with the reason on the row (db-rules §1), and it is what makes iam.apply_rls REFUSE the table: a generated policy over the kernel''s own input can recursively reference a security-invoker view over its own table and take every dependent read down with 42P17 (db-rules §6d). Registered by DD-159 so the class regime can SEE it; never so it can be generated.'),
      ('platform','change_type_default','change_type_default','Change type default','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('platform','knob_scope_kind','knob_scope_kind','Knob scope kind','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('platform','taxonomy_node','taxonomy_node','Taxonomy node','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('growth','stage_ref_kind','stage_ref_kind','Stage reference kind','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('seo','ai_capability','seo_ai_capability','SEO AI capability','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('files','account_tiers','files_account_tier','File account tier','system','organization','organization','entity',
       'A platform-wide controlled vocabulary every organization reads. Signed-in readers only (measured live 2026-09-12: the anon role is refused or reads nothing).'),
      ('history','row_versions','row_version','Row version','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('runtime','execution_event_cursor','execution_event_cursor','Execution event cursor','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('platform','knob_override_audit','knob_override_audit','Knob override audit','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('iam','org_admin_audit','org_admin_audit','Org admin audit','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('rag','library_audit_log','rag_library_audit_log','Library audit log','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('users','guest_conversion_audit','guest_conversion_audit','Guest conversion audit','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('admin','admin_audit_log','admin_audit_log','Admin audit log','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('admin','admin_email_logs','admin_email_log','Admin email log','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.'),
      ('admin','dev_login_audit','dev_login_audit','Dev login audit','ledger','confidential',null,'entity',
       'Append-only: the server writes it, nobody owns a row and a row has a position rather than an identity. A ledger STATES its class (DD-137b10) because it has no composition parent to inherit one from.')
    ) as v(sch, tbl, token, label, variant, dclass, lscope, aclass, reason)
  loop
    insert into platform.entity_types (
      token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
      is_versioned, has_soft_delete, audit_class, audit_class_reason,
      data_class, default_list_scope, data_class_reason, notes)
    values (r.token, r.sch, r.tbl, r.label, r.variant, true, false, false,
            false, false, r.aclass,
            case when r.aclass = 'machinery' then r.reason else null end,
            r.dclass::platform.data_class, r.lscope::platform.list_scope,
            r.reason || v_seen, v_seen);
    if (select data_class from platform.entity_types where token = r.token)
       is distinct from r.dclass::platform.data_class then
      raise exception 'dd159 batch 3: % was registered with data_class % but the row holds %',
        r.token, r.dclass, (select data_class::text from platform.entity_types where token = r.token);
    end if;
  end loop;
end $$;

-- ═════════════════════════════════════════════ 4. THE PROOF: no door moved
do $$
declare v_diff text; v_n int; v_left int;
begin
  perform pg_temp._b48c_measure('_b48c_after');

  select string_agg(format('%s.%s/%s: %s -> %s', b.sch, b.tbl, b.identity,
                           coalesce(b.readable::text,'refused'), coalesce(a.readable::text,'refused')), '; '),
         count(*)
    into v_diff, v_n
    from _b48c_before b
    join _b48c_after  a on a.sch=b.sch and a.tbl=b.tbl and a.identity=b.identity
   where b.readable is distinct from a.readable;

  if v_n > 0 then
    raise exception 'dd159 batch 3: registration MOVED % of the % reads it promised not to touch: %',
      v_n, (select count(*) from _b48c_before), left(v_diff, 2000);
  end if;

  select count(*) into v_left from _b48c_scope s
   where not exists (select 1 from platform.entity_types e
                      where e.schema_name = s.sch and e.table_name = s.tbl);
  if v_left <> 130 then
    raise exception 'dd159 batch 3: % relations remain unregistered, not the 130 this batch declares', v_left;
  end if;

  raise notice 'dd159 batch 3: 74 registered, % relations still outside the registry (28 of them are '
    'partitions of history.row_versions, which is now registered); % reads identical before and after',
    v_left, (select count(*) from _b48c_before);
end $$;
