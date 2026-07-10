-- ai_030_model_config_view.sql
-- Phase D of the AI catalog migration: the RESOLUTION LAYER.
--
-- ai.resolve_model_config(model_id) computes, for a model's PREFERRED offering
-- (lowest priority, available, endpoint active, not deleted), the FE-facing
-- `controls` (NormalizedControls-compatible per-key definitions) and
-- `constraints` (ModelConstraint[] DSL) from:
--   ai.api.rules.params  ⊕  ai.offering.override.params   (per-key jsonb merge,
--   override wins per FIELD; keys with merged supported=false are EXCLUDED)
--   × ai.setting (canonical dictionary: value_type, canonical range/values,
--   default_value)
-- plus capability-derived UI-envelope keys (tools/image_urls/file_urls/
-- youtube_videos/internal_* search gates/response_format) that reproduce what
-- the legacy model_definition.controls carried. Per-model output ceilings live
-- on model_definition.max_tokens (caps max_output_tokens.max) — NOT in
-- overrides.
--
-- ai.model_config is the user-facing view over ACTIVE models exposing the
-- resolved payload. Masked like ai.model_public: NO endpoint/vendor/translator
-- information is exposed.
--
-- Idempotent: CREATE OR REPLACE throughout.

-- Integral numerics render as integers (512 not 512.0).
create or replace function ai.jsonb_num(n numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select case when n = trunc(n) then to_jsonb(n::bigint) else to_jsonb(n) end;
$fn$;

create or replace function ai.resolve_model_config(p_model_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_model record;
  v_off record;
  v_has_offering boolean := false;
  v_api_params jsonb := '{}'::jsonb;
  v_ovr_params jsonb := '{}'::jsonb;
  v_constraints jsonb := '[]'::jsonb;
  v_api_name text := '';
  v_controls jsonb := '{}'::jsonb;
  v_key text;
  v_rule jsonb;
  v_setting record;
  v_ctrl jsonb;
  v_type text;
  v_min numeric;
  v_max numeric;
  v_default jsonb;
  v_enum jsonb;
  v_feats jsonb := '[]'::jsonb;
  v_inputs jsonb := '[]'::jsonb;
  v_chatish boolean;
  v_rf_enum jsonb;
begin
  select m.id, m.max_tokens, m.capabilities
    into v_model
  from ai.model_definition m
  where m.id = p_model_id and m.deleted_at is null;
  if not found then
    return null;
  end if;

  if jsonb_typeof(v_model.capabilities -> 'features') = 'array' then
    v_feats := v_model.capabilities -> 'features';
  end if;
  if jsonb_typeof(v_model.capabilities -> 'input') = 'array' then
    v_inputs := v_model.capabilities -> 'input';
  end if;

  -- Preferred offering: lowest priority, available, endpoint active, api live.
  select o.override as override, a.rules as rules, a.name as api_name
    into v_off
  from ai.offering o
  join ai.endpoint e on e.id = o.endpoint_id and e.deleted_at is null and e.is_active
  join ai.api a on a.id = o.api_id and a.deleted_at is null
  where o.model_id = p_model_id
    and o.deleted_at is null
    and o.is_available
  order by o.priority, o.created_at, o.id
  limit 1;
  v_has_offering := found;

  if v_has_offering then
    v_api_name := coalesce(v_off.api_name, '');
    if jsonb_typeof(v_off.rules -> 'params') = 'object' then
      v_api_params := v_off.rules -> 'params';
    end if;
    if jsonb_typeof(v_off.override -> 'params') = 'object' then
      v_ovr_params := v_off.override -> 'params';
    end if;
    if jsonb_typeof(v_off.rules -> 'constraints') = 'array' then
      v_constraints := v_off.rules -> 'constraints';
    end if;
    if jsonb_typeof(v_off.override -> 'constraints') = 'array' then
      v_constraints := v_constraints || (v_off.override -> 'constraints');
    end if;
  end if;

  -- `_chat`-style wire contracts drive chat-surface affordances. google_image
  -- is chat-shaped too (Gemini multimodal image models ride the chat surface).
  v_chatish := v_api_name like '%\_chat' escape '\' or v_api_name = 'google_image';

  -- ── Params: union of family rule keys and per-offering override keys ──────
  for v_key in
    select distinct t.k
    from (
      select jsonb_object_keys(v_api_params) as k
      union
      select jsonb_object_keys(v_ovr_params) as k
    ) t
    order by t.k
  loop
    -- Per-key merge: override wins per FIELD.
    v_rule := coalesce(v_api_params -> v_key, '{}'::jsonb)
              || coalesce(v_ovr_params -> v_key, '{}'::jsonb);

    if (v_rule ->> 'supported') = 'false' then
      continue;
    end if;

    select s.value_type, s.canonical_min, s.canonical_max,
           s.canonical_values, s.default_value
      into v_setting
    from ai.setting s
    where s.key = v_key and s.deleted_at is null
    order by s.is_system desc
    limit 1;
    if not found then
      -- Rule key with no canonical setting: not renderable — skip.
      continue;
    end if;

    v_type := coalesce(v_setting.value_type, 'string');
    v_min := v_setting.canonical_min;
    v_max := v_setting.canonical_max;

    -- Narrow canonical range by the merged clamp.
    if jsonb_typeof(v_rule -> 'clamp') = 'object' then
      if (v_rule -> 'clamp' ->> 'min') is not null then
        v_min := greatest(coalesce(v_min, (v_rule -> 'clamp' ->> 'min')::numeric),
                          (v_rule -> 'clamp' ->> 'min')::numeric);
      end if;
      if (v_rule -> 'clamp' ->> 'max') is not null then
        v_max := least(coalesce(v_max, (v_rule -> 'clamp' ->> 'max')::numeric),
                       (v_rule -> 'clamp' ->> 'max')::numeric);
      end if;
    end if;

    -- Per-model output ceiling lives on model_definition.max_tokens.
    if v_key = 'max_output_tokens'
       and v_model.max_tokens is not null and v_model.max_tokens > 0 then
      v_max := least(coalesce(v_max, v_model.max_tokens::numeric),
                     v_model.max_tokens::numeric);
    end if;

    -- Default: const > rule default > canonical default.
    if v_rule ? 'const' then
      v_default := v_rule -> 'const';
    elsif v_rule ? 'default' then
      v_default := v_rule -> 'default';
    else
      v_default := v_setting.default_value;
    end if;

    -- Enum: value_map keys are the CANONICAL accepted values, ordered per
    -- setting.canonical_values (unknown keys appended alphabetically).
    v_enum := null;
    if jsonb_typeof(v_rule -> 'value_map') = 'object' then
      select coalesce(
               jsonb_agg(to_jsonb(mk.k) order by coalesce(cv.ord, 2147483647), mk.k),
               '[]'::jsonb)
        into v_enum
      from (select jsonb_object_keys(v_rule -> 'value_map') as k) mk
      left join lateral (
        select c.ord
        from jsonb_array_elements_text(coalesce(v_setting.canonical_values, '[]'::jsonb))
             with ordinality c(val, ord)
        where c.val = mk.k
        limit 1
      ) cv on true;
    elsif v_rule ? 'const' then
      v_enum := jsonb_build_array(v_rule -> 'const');
    elsif v_type = 'enum'
          and jsonb_typeof(v_setting.canonical_values) = 'array' then
      v_enum := v_setting.canonical_values;
    end if;

    -- Build the FE control definition.
    if v_key = 'tts_voice'
       and coalesce(jsonb_typeof(v_rule -> 'value_map'), '') <> 'object' then
      -- Voice lists without an explicit value_map are DYNAMIC (fetched from the
      -- provider / ai.voices at runtime) — never the mixed canonical list.
      v_ctrl := jsonb_build_object('type', 'dynamic', 'source', 'api');
      if v_max is not null then
        v_ctrl := v_ctrl || jsonb_build_object('max', ai.jsonb_num(v_max));
      end if;
      if v_default is not null and jsonb_typeof(v_default) <> 'null' then
        v_ctrl := v_ctrl || jsonb_build_object('default', v_default);
      end if;
    elsif v_key = 'multi_speaker' then
      -- Legacy gate shape: { allowed: bool, max: n } (allowed when >1 speaker).
      v_ctrl := jsonb_build_object('allowed', coalesce(v_max, 1) > 1);
      if v_max is not null then
        v_ctrl := v_ctrl || jsonb_build_object('max', ai.jsonb_num(v_max));
      end if;
    else
      v_ctrl := jsonb_build_object(
        'type', case when v_enum is not null then 'enum' else v_type end);
      if v_min is not null then
        v_ctrl := v_ctrl || jsonb_build_object('min', ai.jsonb_num(v_min));
      end if;
      if v_max is not null then
        v_ctrl := v_ctrl || jsonb_build_object('max', ai.jsonb_num(v_max));
      end if;
      if v_enum is not null then
        v_ctrl := v_ctrl || jsonb_build_object('enum', v_enum);
      end if;
      if v_default is not null and jsonb_typeof(v_default) <> 'null' then
        v_ctrl := v_ctrl || jsonb_build_object('default', v_default);
      end if;
    end if;

    v_controls := v_controls || jsonb_build_object(v_key, v_ctrl);
  end loop;

  -- ── UI-envelope keys derived from capabilities (never wire params) ────────

  -- tools: every model declares the gate (legacy always carried it).
  if not (v_controls ? 'tools') then
    v_controls := v_controls || jsonb_build_object(
      'tools', jsonb_build_object('allowed', v_feats ? 'function_calling'));
  end if;

  -- Chat-surface attachment gates.
  if v_chatish and v_inputs ? 'image' then
    if not (v_controls ? 'image_urls') then
      v_controls := v_controls || jsonb_build_object(
        'image_urls', jsonb_build_object('allowed', true, 'default', false));
    end if;
    if not (v_controls ? 'file_urls') then
      v_controls := v_controls || jsonb_build_object(
        'file_urls', jsonb_build_object('allowed', true, 'default', false));
    end if;
  end if;
  if v_chatish and v_api_name like 'google\_%' escape '\' and v_inputs ? 'image'
     and not (v_controls ? 'youtube_videos') then
    v_controls := v_controls || jsonb_build_object(
      'youtube_videos', jsonb_build_object('allowed', true, 'default', false));
  end if;

  -- Provider-native search affordances.
  if v_feats ? 'web_search' and not (v_controls ? 'internal_web_search') then
    v_controls := v_controls || jsonb_build_object(
      'internal_web_search', jsonb_build_object('allowed', true));
  end if;
  if v_feats ? 'web_search' and v_api_name like 'google\_%' escape '\'
     and not (v_controls ? 'internal_url_context') then
    v_controls := v_controls || jsonb_build_object(
      'internal_url_context', jsonb_build_object('allowed', true));
  end if;
  if v_feats ? 'x_search' and not (v_controls ? 'internal_x_search') then
    v_controls := v_controls || jsonb_build_object(
      'internal_x_search', jsonb_build_object('allowed', true));
  end if;

  -- response_format for structured-output-capable chat models.
  if v_chatish
     and not (v_controls ? 'response_format')
     and not (v_controls ? 'output_format')
     and (v_feats ? 'json_mode' or v_feats ? 'structured_output') then
    v_rf_enum := jsonb_build_array('text');
    if v_feats ? 'json_mode' then
      v_rf_enum := v_rf_enum || jsonb_build_array('json_object');
    end if;
    if v_feats ? 'structured_output' then
      v_rf_enum := v_rf_enum || jsonb_build_array('json_schema');
    end if;
    v_controls := v_controls || jsonb_build_object(
      'response_format',
      jsonb_build_object('type', 'enum', 'enum', v_rf_enum, 'default', 'text'));
  end if;

  return jsonb_build_object('controls', v_controls, 'constraints', v_constraints);
end;
$fn$;

comment on function ai.resolve_model_config(uuid) is
  'Resolves FE-facing controls/constraints for a model''s preferred offering from ai.api.rules ⊕ ai.offering.override × ai.setting. Returns {controls, constraints}.';

create or replace view ai.model_config as
select
  m.id,
  m.name,
  m.common_name,
  p.name as maker,
  m.cost_rating,
  m.speed_rating,
  m.is_premium,
  m.is_primary,
  m.context_window,
  m.max_tokens,
  m.capabilities,
  r.cfg -> 'controls'    as controls,
  r.cfg -> 'constraints' as constraints
from ai.model_definition m
join ai.provider p on p.id = m.provider_id
cross join lateral (select ai.resolve_model_config(m.id) as cfg) r
where m.deleted_at is null
  and coalesce(m.is_deprecated, false) = false;

comment on view ai.model_config is
  'User-facing resolved model configuration (active models × preferred offering). Masked like model_public: no endpoint/vendor/translator data.';

grant execute on function ai.resolve_model_config(uuid) to anon, authenticated;
grant execute on function ai.jsonb_num(numeric) to anon, authenticated;
grant select on ai.model_config to anon, authenticated;
