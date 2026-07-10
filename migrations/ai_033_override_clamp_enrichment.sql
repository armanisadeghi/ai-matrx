-- ai_033_override_clamp_enrichment.sql
-- Phase D parity gate, pass 3: aidream-seeded per-offering override rules for
-- media models (e.g. duration_seconds {supported, provider_key} on Kling /
-- Seedance) carry no clamp/default, so the resolver fell back to the loose
-- canonical range (duration 1..∞ default 8 instead of the model's real 3..12
-- default 5). Enrich EXISTING override rules with the numeric clamp, default,
-- and identity value_map lifted from the legacy model_definition.controls —
-- only where the rule has no processor, no const, and lacks that field.
-- Media/audio families only. Idempotent (fills gaps, never overwrites).

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
cand as (
  select p.offering_id,
         coalesce(km.canon, k.key) as canon_key,
         p.override->'params'->coalesce(km.canon, k.key) as rule,
         m.controls->k.key as ctrl
  from pref p
  join ai.model_definition m on m.id = p.model_id
  cross join lateral jsonb_object_keys(coalesce(m.controls,'{}'::jsonb)) k(key)
  left join keymap km on km.legacy = k.key
  where m.deleted_at is null and coalesce(m.is_deprecated,false) = false
    and p.api_name in ('google_image','google_video','openai_image','openai_video',
                       'replicate_image','replicate_video','together_image','together_video',
                       'xai_image','xai_video','elevenlabs_chat','xai_realtime')
    and jsonb_typeof(m.controls->k.key) = 'object'
    and jsonb_typeof(p.override->'params'->coalesce(km.canon, k.key)) = 'object'
    and (p.override->'params'->coalesce(km.canon, k.key)->>'supported') is distinct from 'false'
    and not (p.override->'params'->coalesce(km.canon, k.key) ? 'processor')
    and not (p.override->'params'->coalesce(km.canon, k.key) ? 'const')
),
gen as (
  select offering_id, canon_key,
    rule
    || case when not (rule ? 'clamp')
             and (jsonb_typeof(ctrl->'min') = 'number' or jsonb_typeof(ctrl->'max') = 'number')
        then jsonb_build_object('clamp', jsonb_strip_nulls(jsonb_build_object(
               'min', case when jsonb_typeof(ctrl->'min') = 'number' then ctrl->'min' end,
               'max', case when jsonb_typeof(ctrl->'max') = 'number' then ctrl->'max' end)))
        else '{}'::jsonb end
    || case when not (rule ? 'default')
             and jsonb_typeof(ctrl->'default') in ('string','number','boolean')
        then jsonb_build_object('default', ctrl->'default')
        else '{}'::jsonb end
    || case when not (rule ? 'value_map')
             and jsonb_typeof(ctrl->'enum') = 'array'
             and (select count(*) from jsonb_array_elements(ctrl->'enum') e
                  where jsonb_typeof(e.value) = 'string') > 0
        then jsonb_build_object('value_map',
               (select jsonb_object_agg(e.value #>> '{}', e.value #>> '{}')
                  from jsonb_array_elements(ctrl->'enum') e
                 where jsonb_typeof(e.value) = 'string'))
        else '{}'::jsonb end
    as enriched,
    rule as original
  from cand
),
agg as (
  select offering_id, jsonb_object_agg(canon_key, enriched) as params
  from gen
  where enriched <> original
  group by 1
)
update ai.offering o
set override = jsonb_set(o.override, '{params}',
      coalesce(o.override->'params','{}'::jsonb) || a.params),
    updated_at = now()
from agg a
where o.id = a.offering_id;
