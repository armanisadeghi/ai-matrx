-- Canonical web/output routes for the three durable Meet operation outcomes.
--
-- These payloads already exist in content_ir.  They use the platform's shared
-- `flow_step_result` component: outcome/status is the primary answer, counters
-- are promoted, and IDs/detail remain visible.  No Meet-local renderer exists.
--
-- Activation stays outside this data registration and must run through
-- content_ir.set_kind_activation after a current render is observed.

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', 'flow_step_result', 'bundled',
       jsonb_build_object('legacyBlockType', 'flow_step_result'), kd.organization_id
from content_ir.kind_definition kd
where kd.kind in (
  'meet_intelligence_result',
  'meet_recording_landing_result',
  'meet_recording_transcription_result'
)
  and kd.deleted_at is null
  and not exists (
    select 1
    from content_ir.kind_component existing
    where existing.kind_definition_id = kd.id
      and existing.platform = 'web'
      and existing.role = 'output'
      and existing.deleted_at is null
  );
