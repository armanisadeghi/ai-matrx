-- component_created_by_conformance_report.sql (2026-08-21)
--
-- TASK B of the DB drift-audit adjudication (2026-08-21) — D182 follow-up 3
-- (matrx-frontend/FOUND_DEFECTS.md). Canon:
-- common-docs/systems/platform/db-rules/FEATURE.md §6d-1 (THE COMPONENT OWNERSHIP LAW).
--
-- THE LAW: `iam.apply_rls(…,'component')` NEVER emits a `created_by` clause. A
-- component has no owner column; its access IS its parent's. The D182(3) bug was
-- a component `std_insert` parent-editor arm that left `created_by` unconstrained
-- while `std_select` led with `created_by = auth.uid()` — so a parent-editor could
-- stamp another user as creator and hand them owner-read. 56 active component
-- tables carried that shape. Fixed live; verified at ZERO.
--
-- THIS is the standing conformance report that keeps it at zero. It is the SQL
-- side of scripts/access-matrix/check-component-created-by.ts, wired blocking into
-- run-release-gates.sh. Pattern mirrors public.access_drift_report()
-- (migrations/access_matrix_probe_helpers.sql).
--
-- READ-ONLY. Changes no grant and no policy on any table.

create or replace function public.component_created_by_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  with components as (
    select et.schema_name, et.table_name
    from platform.entity_types et
    where et.rls_variant = 'component' and et.is_active
  ),
  offenders as (
    select p.schemaname   as schema_name,
           p.tablename    as table_name,
           p.policyname   as policy_name,
           p.cmd,
           (coalesce(p.qual, '')       ~ '\mcreated_by\M') as in_qual,
           (coalesce(p.with_check, '') ~ '\mcreated_by\M') as in_with_check
    from pg_policies p
    join components c
      on c.schema_name = p.schemaname and c.table_name = p.tablename
    where coalesce(p.qual, '')       ~ '\mcreated_by\M'
       or coalesce(p.with_check, '') ~ '\mcreated_by\M'
  )
  select jsonb_build_object(
    'component_tables', (select count(*) from components),
    'policies_scanned', (
      select count(*) from pg_policies p
      join components c on c.schema_name = p.schemaname and c.table_name = p.tablename
    ),
    'offender_count', (select count(*) from offenders),
    'offenders', coalesce(
      (select jsonb_agg(to_jsonb(o) order by o.schema_name, o.table_name, o.policy_name)
       from offenders o),
      '[]'::jsonb)
  );
$function$;

revoke all on function public.component_created_by_report() from public;
grant execute on function public.component_created_by_report() to authenticated, service_role;
