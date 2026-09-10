select kd.id, kd.kind, kd.variants,
       jsonb_agg(jsonb_build_object(
         'component_key', kc.component_key,
         'role', kc.role,
         'platform', kc.platform,
         'is_default', kc.is_default,
         'is_active', kc.is_active
       ) order by kc.created_at) filter (where kc.id is not null) as components
from content_ir.kind_definition kd
left join content_ir.kind_component kc
  on kc.kind_definition_id = kd.id and kc.deleted_at is null
where kd.kind = 'text' and kd.deleted_at is null
group by kd.id, kd.kind, kd.variants;
