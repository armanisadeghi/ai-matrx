-- chair-step: this puts `custom.carrying_edges_of` and `custom.carrying_edges_in` back to the bodies they held before lane PORTAL — the same arms, minus the ONE arm each that reads `custom.portal_table`. After it, no portal carries anything: an outsider keeps the grant on her own client record and every Job and Invoice naming it stops reaching her, silently, because nothing is refused — there is simply no edge. Nothing else about either function changes and nothing else on the platform reads those arms.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)
--
-- These are the exact bytes `scripts/campaign-tests/portal_red.sql` plants to make RED 1 red,
-- so running that suite is also what proves this file executes.

create or replace function custom.carrying_edges_of(p_item_type text, p_item_id uuid)
    returns table(container_type text, container_id uuid, conveys_max permission_level)
    language sql stable security definer set search_path to ''
    as $body$
      select a.source_type, a.source_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select a.source_type, a.source_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select 'record'::text, r.table_id, 'admin'::public.permission_level
        from custom.record r
        join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id and t.deleted_at is null
       where p_item_type = 'record' and r.id = p_item_id and r.table_id is not null
         and r.table_id <> r.id and r.deleted_at is null
         and r.visibility >= 'internal'::platform.visibility;
    $body$;

create or replace function custom.carrying_edges_in(p_organization_id uuid)
returns table(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
language sql
stable security definer
set search_path to ''
as $function$
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
     and (a.organization_id = p_organization_id or a.organization_id is null);
$function$;
