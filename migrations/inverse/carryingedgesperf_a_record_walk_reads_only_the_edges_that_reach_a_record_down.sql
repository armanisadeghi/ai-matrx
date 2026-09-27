-- chair-step: the inverse of migrations/campaign/carryingedgesperf_a_record_walk_reads_only_the_edges_that_reach_a_record.sql (lane CARRYING-EDGES-PERF) — puts custom.carrying_edges_in back exactly as production held it before (pg_get_functiondef, 2026-09-27). Nothing of anybody's data is touched.
-- based-on: custom.carrying_edges_in(uuid) cd27c63180613bd2ae8753f7fff085ce1131e6b1e5ec8ac3d38342b3574565ac

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    -- arm 1 — platform.containment_edges
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
      from platform.associations a
      join platform.association_types r
        on r.source_type = a.source_type
       and r.target_type = a.target_type
       and (r.label is null or r.label = a.label)
     where a.deleted_at is null
       and r.is_active
       and r.container_side = any (array['source', 'target'])
       and (a.organization_id = p_organization_id or a.organization_id is null)
    union
    -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
    select case when cr.container_side = 'source' then a.source_type else a.target_type end,
           case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
           case when cr.container_side = 'source' then a.target_type else a.source_type end,
           case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
           cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr
        on cr.role = a.role
       and cr.is_active
     where a.deleted_at is null
       and (a.organization_id = p_organization_id or a.organization_id is null)
    union
    -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
    -- the container; the record holding the Field is the item. This is what makes "only theirs"
    -- answerable without a per-portal query: an outsider holding her own client record reaches
    -- exactly the records that name it, at the level the portal declared, through the same
    -- ladder as everything else on this platform.
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record'
       and a.target_type = 'record';
end
$function$
;
