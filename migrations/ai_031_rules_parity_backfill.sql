-- ai_031_rules_parity_backfill.sql
-- Phase D controls-parity backfill (gate for ai.model_config).
--
-- The ai_030 resolver exposed gaps between the newly-seeded ai.api.rules /
-- ai.offering.override envelopes and what legacy model_definition.controls
-- carried (and what real saved agent settings reference). This migration
-- closes every VERIFIED regression by seeding the missing rule data where it
-- now canonically lives:
--   1. Family-wide chat params the providers natively accept
--      (openai/xai: store + parallel_tool_calls; cerebras: parallel_tool_calls;
--       elevenlabs: stream) + the anthropic streaming constraint (was on the
--      legacy model rows, belongs on the family).
--   2. Gemini reasoning: copy the sibling google_thinking processor rule onto
--      gemini-3.1-flash-image; expose reasoning_summary (consumed by the
--      google_thinking processor) on models whose legacy controls carried it.
--   3. gpt-5.x verbosity (Responses `text.verbosity`).
--   4. Generic per-model override backfill for media/audio families: every
--      legacy control key (canonicalised: n/num_outputs/number_of_images →
--      count, duration/seconds → duration_seconds, ratio → aspect_ratio,
--      image_size → resolution, output_mime_type → output_format, stop →
--      stop_sequences, max_tokens/max_completion_tokens → max_output_tokens)
--      that the resolver does not yet emit becomes an override rule with
--      identity value_map / clamp / default lifted from the legacy control.
--   5. Suppress chat sampling params on models with no text output (TTS etc.)
--      where the chat family rules would wrongly expose them.
--
-- Idempotent: every statement checks for existing keys before writing and
-- only fills gaps; re-running is a no-op.

-- ── 1. Family rule additions ────────────────────────────────────────────────

update ai.api
set rules = jsonb_set(rules, '{params}',
      '{"store":{},"parallel_tool_calls":{}}'::jsonb || coalesce(rules->'params','{}'::jsonb))
where deleted_at is null and name in ('openai_chat','xai_chat');

update ai.api
set rules = jsonb_set(rules, '{params}',
      '{"parallel_tool_calls":{}}'::jsonb || coalesce(rules->'params','{}'::jsonb))
where deleted_at is null and name = 'cerebras_chat';

update ai.api
set rules = jsonb_set(rules, '{params}',
      '{"stream":{}}'::jsonb || coalesce(rules->'params','{}'::jsonb))
where deleted_at is null and name = 'elevenlabs_chat';

-- Anthropic streaming constraint: lived on every legacy claude row; family-wide fact.
update ai.api
set rules = jsonb_set(rules, '{constraints}',
      '[{"id":"anthropic-stream-required-for-high-max-tokens",
         "when":{"op":"gt","field":"max_output_tokens","value":8192},
         "require":{"op":"eq","field":"stream","value":true},
         "severity":"error",
         "message":"Anthropic requires stream: true when max_output_tokens exceeds 8,192"}]'::jsonb)
where deleted_at is null and name = 'anthropic_chat'
  and jsonb_array_length(coalesce(rules->'constraints','[]'::jsonb)) = 0;

-- ── 2a. gemini-3.1-flash-image: copy the sibling google_thinking rule ───────

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
  where m.name = 'gemini-3-flash-preview' and m.deleted_at is null
    and p.override->'params' ? 'reasoning_effort'
  limit 1
),
tgt as (
  select p.offering_id
  from pref p
  join ai.model_definition m on m.id = p.model_id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and m.name in ('gemini-3.1-flash-image','gemini-3.1-flash-lite-image')
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

-- ── 2b. reasoning_summary on google models whose legacy controls carried it ─
-- (Consumed by the google_thinking processor — never sent raw.)

with pref as (
  select distinct on (o.model_id) o.model_id, o.id as offering_id, o.override, a.name as api_name
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  join ai.api a on a.id = o.api_id and a.deleted_at is null
  where o.deleted_at is null and o.is_available
  order by o.model_id, o.priority, o.created_at, o.id
),
tgt as (
  select p.offering_id,
         (select jsonb_object_agg(e.value #>> '{}', e.value #>> '{}')
            from jsonb_array_elements(m.controls->'reasoning_summary'->'enum') e
           where jsonb_typeof(e.value) = 'string') as vmap
  from pref p
  join ai.model_definition m on m.id = p.model_id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and p.api_name like 'google\_%' escape '\'
    and jsonb_typeof(m.controls->'reasoning_summary') = 'object'
    and (coalesce(p.override->'params','{}'::jsonb) ? 'reasoning_effort')
    and not (coalesce(p.override->'params','{}'::jsonb) ? 'reasoning_summary')
    and not (ai.resolve_model_config(m.id)->'controls' ? 'reasoning_summary')
)
update ai.offering o
set override = jsonb_set(o.override, '{params}',
      coalesce(o.override->'params','{}'::jsonb)
        || jsonb_build_object('reasoning_summary',
             jsonb_strip_nulls(jsonb_build_object('supported', true, 'value_map', t.vmap)))),
    updated_at = now()
from tgt t
where o.id = t.offering_id;

-- ── 3. gpt-5.x verbosity (OpenAI Responses text.verbosity) ──────────────────

with pref as (
  select distinct on (o.model_id) o.model_id, o.id as offering_id, o.override, a.name as api_name
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  join ai.api a on a.id = o.api_id and a.deleted_at is null
  where o.deleted_at is null and o.is_available
  order by o.model_id, o.priority, o.created_at, o.id
),
tgt as (
  select p.offering_id
  from pref p
  join ai.model_definition m on m.id = p.model_id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and p.api_name = 'openai_chat'
    and jsonb_typeof(m.controls->'verbosity') = 'object'
    and not (coalesce(p.override->'params','{}'::jsonb) ? 'verbosity')
)
update ai.offering o
set override = jsonb_set(
      case when jsonb_typeof(o.override) = 'object' then o.override
           else '{"params":{},"constraints":[]}'::jsonb end,
      '{params}',
      coalesce(o.override->'params','{}'::jsonb)
        || '{"verbosity":{"supported":true,"provider_key":"text.verbosity","value_map":{"low":"low","medium":"medium","high":"high"}}}'::jsonb),
    updated_at = now()
from tgt t
where o.id = t.offering_id;

-- ── 4. Generic media/audio override backfill from legacy controls ──────────

with keymap(legacy, canon) as (
  values ('n','count'),('num_outputs','count'),('number_of_images','count'),
         ('seconds','duration_seconds'),('duration','duration_seconds'),
         ('ratio','aspect_ratio'),('image_size','resolution'),
         ('output_mime_type','output_format'),
         ('max_tokens','max_output_tokens'),('max_completion_tokens','max_output_tokens'),
         ('stop','stop_sequences')
),
pref as (
  select distinct on (o.model_id) o.model_id, o.id as offering_id, o.override, a.name as api_name
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  join ai.api a on a.id = o.api_id and a.deleted_at is null
  where o.deleted_at is null and o.is_available
  order by o.model_id, o.priority, o.created_at, o.id
),
tgt_models as (
  select m.id, m.controls, p.offering_id, p.api_name, p.override,
         ai.resolve_model_config(m.id)->'controls' as resolved
  from ai.model_definition m
  join pref p on p.model_id = m.id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and jsonb_typeof(m.controls) = 'object'
),
cand as (
  select t.id as model_id, t.offering_id,
         coalesce(km.canon, k.key) as canon_key, k.key as legacy_key,
         t.controls->k.key as ctrl
  from tgt_models t
  cross join lateral jsonb_object_keys(t.controls) k(key)
  left join keymap km on km.legacy = k.key
  where jsonb_typeof(t.controls->k.key) = 'object'
    -- gates / junk / FE-envelope keys never become wire rules
    and k.key not in ('tools','image_urls','file_urls','youtube_videos',
      'internal_web_search','internal_url_context','internal_x_search','internal_tools',
      'multi_speaker','voice_settings','text','include','reasoning','prediction',
      'prompt_cache_key','service_tier','user','logit_bias','logprobs','top_logprobs',
      'include_reasoning','reasoning_format','width','height')
    -- processor-domain keys are handled explicitly (steps 2-3), never identity-mapped
    and coalesce(km.canon, k.key) not in ('reasoning_effort','reasoning_summary',
      'thinking_budget','thinking_level','include_thoughts','clear_thinking',
      'verbosity','response_format')
    and (
      t.api_name in ('google_image','google_video','openai_image','openai_video',
                     'replicate_image','replicate_video','together_image','together_video',
                     'xai_image','xai_video','elevenlabs_chat','xai_realtime')
      or (t.api_name like '%\_chat' escape '\'
          and coalesce(km.canon, k.key) in ('tts_voice','audio_format','language_code','apply_text_normalization'))
    )
    and not (t.resolved ? coalesce(km.canon, k.key))
    and not (coalesce(t.override->'params','{}'::jsonb) ? coalesce(km.canon, k.key))
    and exists (select 1 from ai.setting s
                where s.key = coalesce(km.canon, k.key) and s.deleted_at is null)
),
gen as (
  select model_id, offering_id, canon_key,
    jsonb_strip_nulls(jsonb_build_object(
      'supported', true,
      'provider_key', case when legacy_key <> canon_key then to_jsonb(legacy_key) end,
      'clamp', nullif(jsonb_strip_nulls(jsonb_build_object(
                 'min', case when jsonb_typeof(ctrl->'min') = 'number' then ctrl->'min' end,
                 'max', case when jsonb_typeof(ctrl->'max') = 'number' then ctrl->'max' end)),
               '{}'::jsonb),
      'value_map', (select jsonb_object_agg(e.value #>> '{}', e.value #>> '{}')
                      from jsonb_array_elements(ctrl->'enum') e
                     where jsonb_typeof(e.value) = 'string'),
      'default', case when jsonb_typeof(ctrl->'default') in ('string','number','boolean')
                      then ctrl->'default' end
    )) as rule
  from cand
),
agg as (
  select offering_id, jsonb_object_agg(canon_key, rule) as params
  from gen group by 1
)
update ai.offering o
set override = jsonb_set(
      case when jsonb_typeof(o.override) = 'object' then o.override
           else '{"params":{},"constraints":[]}'::jsonb end,
      '{params}',
      a.params || coalesce(o.override->'params','{}'::jsonb)),
    updated_at = now()
from agg a
where o.id = a.offering_id;

-- ── 5. Suppress chat sampling params on non-text-output models ──────────────

with pref as (
  select distinct on (o.model_id) o.model_id, o.id as offering_id, o.override
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  where o.deleted_at is null and o.is_available
  order by o.model_id, o.priority, o.created_at, o.id
),
tgt as (
  select m.id, coalesce(m.controls,'{}'::jsonb) as controls, p.offering_id, p.override,
         ai.resolve_model_config(m.id)->'controls' as resolved
  from ai.model_definition m
  join pref p on p.model_id = m.id
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and (jsonb_typeof(m.capabilities->'output') <> 'array'
         or not (m.capabilities->'output' ? 'text'))
),
supp as (
  select t.offering_id, k.key
  from tgt t
  cross join (values ('temperature'),('top_p'),('top_k'),('max_output_tokens'),
    ('stop_sequences'),('seed'),('frequency_penalty'),('presence_penalty'),
    ('store'),('parallel_tool_calls')) k(key)
  where (t.resolved ? k.key)
    and not (t.controls ? k.key)
    and not (t.controls ? (case k.key when 'max_output_tokens' then 'max_tokens'
                                      when 'stop_sequences' then 'stop'
                                      else k.key end))
    and not (coalesce(t.override->'params','{}'::jsonb) ? k.key)
),
agg as (
  select offering_id,
         jsonb_object_agg(key, '{"supported":false}'::jsonb) as params
  from supp group by 1
)
update ai.offering o
set override = jsonb_set(
      case when jsonb_typeof(o.override) = 'object' then o.override
           else '{"params":{},"constraints":[]}'::jsonb end,
      '{params}',
      a.params || coalesce(o.override->'params','{}'::jsonb)),
    updated_at = now()
from agg a
where o.id = a.offering_id;
