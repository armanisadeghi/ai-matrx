-- content_ir_input_component_bindings.sql
-- D1 (Content IR Wave 3, lane W3-B): register the input-role component
-- bindings so every ACTIVE display root and every workflow-I/O structural
-- kind resolves an INPUT path through the (kind, platform, role) resolver.
--
-- component_key 'generic_structured' (role='input') routes to the canonical
-- KindInputForm (features/content-ir/input/KindInputForm.tsx): kind fields →
-- kindFieldsToVariableDefinitions (R5) → production VariableInputComponent →
-- assembled instance validated by the activation gate's structural leg.
-- Kinds with no stored field list (the workflow-I/O scalars, data = NULL)
-- take the form's documented whole-instance-JSON mode.
--
-- NON-INTERACTIVE BY CLASSIFICATION (deliberately NO rows): the generated
-- data-only contract families — metadata.data_only = 'true' (tool_io 315 /
-- action_io 176 / workflow_io 76 / agent_io 68) — are machine-filled
-- contracts; fabricating human forms for them is forbidden (project D1).
-- Nested child kinds (flashcard, timeline_event, …) get no DB rows either:
-- the compiled floor (registry/system-components.ts) already gives every
-- compiled kind an input entry, and children are edited inside their root.
--
-- Dedicated editors: NONE registered in this pass. Searched candidates
-- (2026-07-15): the mermaid workbench (components/mermaid/workbench/) is an
-- artifact/canvas surface with no controlled onChange contract, and
-- CodeModePane is coupled to the workbench dispatch — neither is a drop-in
-- field editor. A dedicated binding lands only WITH its KindInputForm
-- routing (kind-input-resolution.ts refuses unrouted keys loudly).
--
-- Idempotent, data-only (no DDL). Safe to re-apply: re-application also
-- HEALS coverage for roots activated after this migration first ran.

insert into content_ir.kind_component (
  kind_definition_id,
  platform,
  role,
  component_key,
  source,
  is_default,
  is_active,
  sort_order,
  organization_id,
  metadata
)
select
  kd.id,
  'web',
  'input',
  'generic_structured',
  'bundled',
  true,
  true,
  100,
  '39c38960-d30c-4840-b0c1-c9960de95582', -- system org (platform kinds)
  jsonb_build_object(
    'note',
    'D1 generic input binding (lane W3-B, 2026-07-15): KindInputForm bridges kind fields to the production VariableDefinition renderers; no-field kinds use whole-instance JSON mode.'
  )
from content_ir.kind_definition kd
where kd.deleted_at is null
  and (kd.metadata ->> 'data_only') is distinct from 'true'
  and (
    -- (a) every ACTIVE display root (non-generated kinds; nested children are
    --     inactive and excluded by is_active)
    kd.is_active
    -- (b) every workflow-I/O structural kind (text/number/json/…): inactive as
    --     display kinds but the human-input targets of io.user_input and
    --     node input_kind gates
    or kd.metadata ->> 'family' = 'workflow_io'
  )
  and not exists (
    select 1
    from content_ir.kind_component kc
    where kc.kind_definition_id = kd.id
      and kc.platform = 'web'
      and kc.role = 'input'
      and kc.deleted_at is null
  );
