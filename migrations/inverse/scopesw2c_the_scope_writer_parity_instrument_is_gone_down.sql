-- Inverse of migrations/campaign/scopesw2c_the_scope_writer_parity_instrument_is_gone.sql: the body, owner and grants exactly as production held them on 2026-10-05.

CREATE OR REPLACE FUNCTION platform.cutover_store_writer_scope_parity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- READINESS-PARITY (2026-10-01, SAFETY-NET W1). For every organization whose scopes are written in the
-- store first (custom.context_writer = 'store'), the live scopes of the current scope tables against the
-- live Records of the store BY ID, both directions, per live scope type — the measure rows_copied uses
-- (platform.cutover_scope_rows_copied: a scope's Record is custom.record, data_class 'record', same id,
-- table_id = its scope type). One set-based read over every organization; the writer is asked only of
-- the organizations that differ. Reads only, as the owner (the readiness doors are SECURITY DEFINER).
-- One element per (organization, scope type) that differs; [] when none does.
declare
  v_out jsonb;
begin
  with lt as (
    select t.id, t.organization_id, coalesce(nullif(btrim(t.label_plural), ''), t.slug, 'Untitled scope type') as name
      from context.scope_types t
     where t.deleted_at is null
  ), img as (
    select s.id, s.organization_id, s.scope_type_id, s.name
      from context.scopes s
      join lt on lt.id = s.scope_type_id and lt.organization_id = s.organization_id
     where s.deleted_at is null
  ), sto as (
    select r.id, r.organization_id, r.table_id as scope_type_id, r.data ->> 'name' as name
      from custom.record r
      join lt on lt.id = r.table_id and lt.organization_id = r.organization_id
     where r.data_class = 'record' and r.deleted_at is null
  ), a as (
    select i.organization_id, i.scope_type_id, count(*) as n,
           (array_agg(coalesce(nullif(btrim(i.name), ''), i.id::text) order by i.name, i.id))[1:5] as ex
      from img i
     where not exists (select 1 from sto s where s.organization_id = i.organization_id and s.id = i.id)
     group by 1, 2
  ), b as (
    select s.organization_id, s.scope_type_id, count(*) as n,
           (array_agg(coalesce(nullif(btrim(s.name), ''), s.id::text) order by s.name, s.id))[1:5] as ex
      from sto s
     where not exists (select 1 from img i where i.organization_id = s.organization_id and i.id = s.id)
     group by 1, 2
  ), d as (
    select organization_id, scope_type_id,
           coalesce(a.n, 0) as image_only, coalesce(a.ex, '{}') as image_ex,
           coalesce(b.n, 0) as store_only, coalesce(b.ex, '{}') as store_ex
      from a full join b using (organization_id, scope_type_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'organization_id', d.organization_id, 'organization', o.name,
           'scope_type_id', d.scope_type_id, 'scope_type', lt.name,
           'image_only', d.image_only, 'image_only_examples', to_jsonb(d.image_ex),
           'store_only', d.store_only, 'store_only_examples', to_jsonb(d.store_ex))
           order by o.name, lt.name, d.scope_type_id), '[]'::jsonb)
    into v_out
    from d
    join lt on lt.id = d.scope_type_id and lt.organization_id = d.organization_id
    join iam.organizations o on o.id = d.organization_id
   where custom.context_writer(d.organization_id) = 'store';
  return v_out;
end;
$function$

;
alter function platform.cutover_store_writer_scope_parity() owner to postgres;
revoke all on function platform.cutover_store_writer_scope_parity() from public;
grant execute on function platform.cutover_store_writer_scope_parity() to dashboard_user, service_role, svc_seo;
