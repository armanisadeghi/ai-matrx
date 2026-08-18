-- The list projection behind /workflows. Lightweight by design: the nodes /
-- edges / variables jsonb blobs are NEVER selected (a 75-row catalog would
-- otherwise ship megabytes), but the two facts a catalog row actually needs —
-- how many steps it runs and when it last ran — are computed here.
-- security_invoker: the caller's RLS on workflow.definition is the ceiling.
create or replace view workflow.v_definition_catalog
with (security_invoker = true) as
select
  d.id,
  d.name,
  d.description,
  d.category,
  d.tags,
  d.is_favorite,
  d.is_active,
  d.is_archived,
  d.visibility,
  d.organization_id,
  d.created_by,
  d.created_at,
  d.updated_at,
  d.engram_state,
  coalesce(jsonb_array_length(d.nodes), 0) as step_count,
  r.last_run_id,
  r.last_run_status,
  r.last_run_at,
  coalesce(r.run_count, 0) as run_count
from workflow.definition d
left join lateral (
  select
    (array_agg(x.id order by x.created_at desc))[1]      as last_run_id,
    (array_agg(x.status order by x.created_at desc))[1]  as last_run_status,
    max(x.created_at)                                     as last_run_at,
    count(*)                                              as run_count
  from workflow.run x
  where x.definition_id = d.id and x.deleted_at is null
) r on true
where d.deleted_at is null;

grant select on workflow.v_definition_catalog to authenticated;
