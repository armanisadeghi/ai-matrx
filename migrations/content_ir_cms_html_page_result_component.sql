-- Canonical web/output renderer binding for the Python-owned
-- cms_html_page_result kind. Idempotent on the live component identity.
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config,
   is_default, is_active, sort_order, organization_id)
select d.id, 'web', 'output', 'cms_html_page_result', 'bundled',
       '{"legacyBlockType":"cms_html_page_result"}'::jsonb,
       true, true, 100, d.organization_id
from content_ir.kind_definition d
where d.kind = 'cms_html_page_result' and d.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component c
    where c.kind_definition_id = d.id and c.platform = 'web'
      and c.role = 'output' and c.component_key = 'cms_html_page_result'
      and c.deleted_at is null
  );
