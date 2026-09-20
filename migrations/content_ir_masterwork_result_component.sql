-- D14 (cold walk 12, 2026-09-20): `masterwork_result` was an ACTIVE kind with
-- NO `kind_component` row at all — the one payload an Expert actually reads
-- reached her through the shared readout fallback, which has no text hook and
-- no reach to her Rulebook. That absence is why a stored rule id cited in the
-- ruling (`prohibit-head-adjustments-before-pressure-testin`, cut at 48 chars
-- by kebabRuleId at mint time) had nowhere to be resolved.
--
-- The compiled web/output renderer is
-- components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx,
-- reached through SHAPE_BLOCK_DISPATCH's `masterwork_result` key. Idempotent
-- on the live component identity, same shape as
-- migrations/content_ir_cms_html_page_result_component.sql.
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config,
   is_default, is_active, sort_order, organization_id)
select d.id, 'web', 'output', 'masterwork_result', 'bundled',
       '{"legacyBlockType":"masterwork_result"}'::jsonb,
       true, true, 100, d.organization_id
from content_ir.kind_definition d
where d.kind = 'masterwork_result' and d.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component c
    where c.kind_definition_id = d.id and c.platform = 'web'
      and c.role = 'output' and c.component_key = 'masterwork_result'
      and c.deleted_at is null
  );
