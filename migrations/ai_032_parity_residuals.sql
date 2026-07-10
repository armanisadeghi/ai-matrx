-- ai_032_parity_residuals.sql
-- Final residuals from the Phase D controls-parity gate (see
-- docs/db_rebuild/proposals/ai_model_config_parity.md):
--   1. gemini-3-pro-image gets its reasoning_effort override copied from its
--      text sibling gemini-3-pro-preview (google_thinking processor), same as
--      ai_031 did for the 3.1 flash image models.
--   2. Capability feature gaps where legacy controls proved the feature exists
--      but capabilities.features lacked the flag (drives the resolver's UI
--      gates): x_search on grok-4.5, web_search on grok-build-0.1 and
--      gemini-3.1-flash-lite-image.
-- Idempotent: existence-checked writes only.

with pref as (
  select distinct on (o.model_id) o.model_id, o.id as offering_id, o.override
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  where o.deleted_at is null and o.is_available
  order by o.model_id, o.priority, o.created_at, o.id
),
src as (
  select p.override->'params'->'reasoning_effort' as rule
  from pref p
  join ai.model_definition m on m.id = p.model_id
  where m.name = 'gemini-3-pro-preview' and m.deleted_at is null
    and p.override->'params' ? 'reasoning_effort'
  limit 1
),
tgt as (
  select p.offering_id
  from pref p
  join ai.model_definition m on m.id = p.model_id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and m.name = 'gemini-3-pro-image'
    and jsonb_typeof(m.controls->'reasoning_effort') = 'object'
    and not (coalesce(p.override->'params','{}'::jsonb) ? 'reasoning_effort')
)
update ai.offering o
set override = jsonb_set(
      case when jsonb_typeof(o.override) = 'object' then o.override
           else '{"params":{},"constraints":[]}'::jsonb end,
      '{params}',
      coalesce(o.override->'params','{}'::jsonb)
        || jsonb_build_object('reasoning_effort', s.rule)),
    updated_at = now()
from tgt t, src s
where o.id = t.offering_id and s.rule is not null;

update ai.model_definition
set capabilities = jsonb_set(capabilities, '{features}',
      (capabilities->'features') || '["x_search"]'::jsonb),
    updated_at = now()
where deleted_at is null and coalesce(is_deprecated,false) = false
  and name = 'grok-4.5'
  and jsonb_typeof(capabilities->'features') = 'array'
  and not (capabilities->'features' ? 'x_search')
  and jsonb_typeof(controls->'internal_x_search') = 'object';

update ai.model_definition
set capabilities = jsonb_set(capabilities, '{features}',
      (capabilities->'features') || '["web_search"]'::jsonb),
    updated_at = now()
where deleted_at is null and coalesce(is_deprecated,false) = false
  and name in ('grok-build-0.1','gemini-3.1-flash-lite-image')
  and jsonb_typeof(capabilities->'features') = 'array'
  and not (capabilities->'features' ? 'web_search')
  and jsonb_typeof(controls->'internal_web_search') = 'object';
