-- content_ir_agent_result_component.sql
--
-- THE `agent_result` output component (2026-08-18).
--
-- `agent_result` — the canonical output of every matrx-ai graph action — was
-- registered and ACTIVE in content_ir.kind_definition with ZERO kind_component
-- rows, so every surface rendering one fell through to the generic JSON viewer
-- and printed the whole run envelope: `usage` (per-model token counts and
-- dollar cost), `messages` (the verbatim system and user prompt), `metadata`,
-- `request_id`, `conversation_id` — around the two keys anyone wants. On the
-- Study Pack run that put the system prompt and the token bill into the box a
-- learner was waiting on for their study notes.
--
-- This row is the BUNDLED (compiled) resolution: component_key
-- 'agent_result' is the block type the unified renderer's
-- BlockComponentRegistry routes on, produced by applyIrKindRoute's
-- compiled-bridge flip for the kind's `legacyBlockType` facet
-- (features/content-ir/kinds/agent-result.ts →
-- components/mardown-display/blocks/agent-result/AgentResultBlock.tsx).
--
-- The kind is already active, so nothing here flips is_active on the
-- definition; `content_ir.set_kind_activation` remains the ONE write path for
-- that column. This row only makes the render leg real.
--
-- Data-only; idempotent (keyed on the kind's (platform, role) pair).

do $$
declare
  v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582'; -- system org
  v_kind uuid;
begin
  select id into v_kind from content_ir.kind_definition
    where kind = 'agent_result' and deleted_at is null;

  if v_kind is null then
    raise exception 'content_ir_agent_result_component: agent_result kind_definition missing';
  end if;

  if not exists (
    select 1 from content_ir.kind_component
    where kind_definition_id = v_kind
      and platform = 'web' and role = 'output'
      and deleted_at is null
  ) then
    insert into content_ir.kind_component
      (kind_definition_id, organization_id, platform, role, component_key,
       source, is_active, is_default, sort_order, config, notes)
    values
      (v_kind, v_org, 'web', 'output', 'agent_result',
       'bundled', true, true, 100,
       jsonb_build_object('legacyBlockType', 'agent_result'),
       'THE renderer for an agent run: what the agent produced (final_text through the canonical markdown pipeline, or structured_output when schema-bound), with duration / turns / tool calls / cost behind one collapsed Run detail row. The envelope''s `messages` never reaches it — the transcript is reached through the conversation door.');
  end if;
end $$;
