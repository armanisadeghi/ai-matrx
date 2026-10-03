-- lane KINDS-GLUE wave 4 slice 4.1 (2026-10-03) — the `relation` and `pick_list` kinds get their compiled web output
-- component, so content_ir.evaluate_kind_activation can activate them. The INSERT is the lane's READY SQL verbatim
-- (board KINDS-GLUE.md, "READY SQL (wave 4.1"): one row per kind in the AI Matrx platform organization, only where no
-- live web output component exists. Applied by the chair (CHAIR-APPLY-3).
-- Inverse: migrations/inverse/kindsglue_w4s1_relation_and_pick_list_have_their_compiled_component_down.sql
-- lane: KINDS-GLUE

insert into content_ir.kind_component (kind_definition_id, component_key, platform, role, source, is_active, is_default, sort_order, semver, version, config, metadata, custom_fields, organization_id, created_by, notes)
select kd.id, kd.kind, 'web','output','bundled', true, true, 0, '1.0.0', 1, '{}', '{"consumer":"matrx-frontend","seeded_by":"kindsglue_w4_1"}', '{}', '39c38960-d30c-4840-b0c1-c9960de95582', '87a6e699-3622-4869-8843-d0867456c0dd', 'KINDS-GLUE W4 slice 4.1 — compiled component'
from content_ir.kind_definition kd where kd.kind in ('relation','pick_list') and kd.deleted_at is null and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and not exists (select 1 from content_ir.kind_component c where c.kind_definition_id=kd.id and c.role='output' and c.platform='web' and c.deleted_at is null);
