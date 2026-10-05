-- lane: AGENTS-ON-DATA
-- based-on: custom.enrich_normalize(uuid, uuid, text, jsonb) bf7f04644b6b22b484e8b816df4bd10437db50a6879002851d10a79bfb868f95
--
-- AGENTS-ON-DATA item 5 close-out — "Fill a column with AI" in an organization set to "Never ask".
-- custom.enrich_normalize read custom/agent_schema_changes raw and accepted only auto/ask, so the
-- canonical value never_ask refused every enrichment declaration ("never_ask is not a way of deciding…").
-- It now takes the organization's answer from custom.agent_change_approval, the one reader.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.enrich_normalize(p_organization_id uuid, p_table_id uuid, p_field_key text, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_spec    jsonb := coalesce(p_spec, '{}'::jsonb);
  v_instr   text;
  v_inputs  jsonb := '[]'::jsonb;
  v_keys    text[];
  v_key     text;
  v_ceiling text;
  v_rank    integer;
  v_floor   numeric;
  v_every   integer;
  v_policy  text;
  v_model   text;
  v_cap     integer;
  v_sens    text;
begin
  if jsonb_typeof(v_spec) is distinct from 'object' then
    raise exception 'An enrichment has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'AGT-6: an enrichment is {"instruction": "…", "inputs": ["company_name"], "review_interval_days": 30}.';
  end if;

  -- ── THE INSTRUCTION, IN PLAIN WORDS. It is the whole product: a person says what they
  -- want filled in and the platform carries it. A blank one is refused here rather than
  -- discovered by a model that then invents a job for itself.
  v_instr := nullif(btrim(coalesce(v_spec ->> 'instruction', '')), '');
  if v_instr is null then
    raise exception 'An enrichment has to say, in plain words, what to fill in.'
      using errcode = '22004',
            hint = 'For example: "the industry this company is in, in two or three words". That sentence is what the model is asked, so write it the way you would say it to a person.';
  end if;
  if length(v_instr) < 8 then
    raise exception 'The instruction "%" is too short to be an instruction.', v_instr
      using errcode = '22004',
            hint = 'Say what you want filled in and how you want it written — a few words is enough, but "yes" or "do it" is not something a model can act on.';
  end if;

  -- ── THE SENSITIVITY CEILING (AGT-7), asked ONCE for the whole declaration.
  v_ceiling := coalesce(nullif(btrim(platform.knob_resolve('custom', 'enrichment_sensitivity_ceiling',
                                                           p_organization_id) #>> '{}'), ''), 'internal');
  if custom.enrich_sensitivity_rank(v_ceiling) is null then
    raise exception 'This organization''s enrichment sensitivity ceiling is set to "%", which is not one of the four levels.', v_ceiling
      using errcode = '22023',
            hint = 'The levels, least to most, are public, internal, restricted, confidential. Fix custom/enrichment_sensitivity_ceiling for this organization.';
  end if;

  select f.data ->> 'sensitivity' into v_sens
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = p_field_key;
  if custom.enrich_sensitivity_rank(coalesce(v_sens, 'internal')) > custom.enrich_sensitivity_rank(v_ceiling) then
    raise exception 'A model may not fill in "%" — that field is marked % and this organization lets an enrichment go no higher than %.',
                    p_field_key, coalesce(v_sens, 'internal'), v_ceiling
      using errcode = '42501',
            hint = 'AGT-7: either lower the field''s sensitivity, or raise custom/enrichment_sensitivity_ceiling for this organization. Nothing was saved.';
  end if;

  -- ── THE INPUTS: other Fields of the same record. Anything that is not one is refused by
  -- name with the real keys, because a typo here means an enrichment that reads nothing and
  -- answers anyway.
  select coalesce(array_agg(f.data ->> 'key' order by f.data ->> 'key'), '{}'::text[])
    into v_keys
    from custom.applicable_fields(p_organization_id, p_table_id, null) f
   where nullif(f.data ->> 'key', '') is not null;

  if jsonb_typeof(v_spec -> 'inputs') = 'array' then
    for v_key in select value from jsonb_array_elements_text(v_spec -> 'inputs') loop
      v_key := btrim(v_key);
      if v_key = p_field_key then
        raise exception 'An enrichment cannot read the very field it fills in.'
          using errcode = '22023',
                hint = format('"%s" is the field this enrichment writes. Give it the OTHER columns the answer can be worked out from.', p_field_key);
      end if;
      if not (v_key = any (v_keys)) then
        raise exception 'This table has no field called "%", so an enrichment cannot read it.', v_key
          using errcode = '22023',
                hint = format('The columns are %s.', array_to_string(v_keys, ', '));
      end if;
      select f.data ->> 'sensitivity' into v_sens
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
         and f.data ->> 'key' = v_key;
      if custom.enrich_sensitivity_rank(coalesce(v_sens, 'internal')) > custom.enrich_sensitivity_rank(v_ceiling) then
        raise exception 'An enrichment may not read "%" — that field is marked % and this organization lets an enrichment go no higher than %.',
                        v_key, coalesce(v_sens, 'internal'), v_ceiling
          using errcode = '42501',
                hint = 'AGT-7: a sensitive value is not fed to a model just because it is next door. Drop it from the inputs, lower its sensitivity, or raise custom/enrichment_sensitivity_ceiling. Nothing was saved.';
      end if;
      v_inputs := v_inputs || to_jsonb(v_key);
    end loop;
  end if;

  -- ── FRESHNESS (AGT-6). Absent means "fill it once and leave it alone", which is a real
  -- answer and not an omission, so it is kept as null rather than given a number nobody chose.
  if v_spec ? 'review_interval_days' and jsonb_typeof(v_spec -> 'review_interval_days') <> 'null' then
    if jsonb_typeof(v_spec -> 'review_interval_days') <> 'number'
       or (v_spec ->> 'review_interval_days')::numeric < 1
       or (v_spec ->> 'review_interval_days')::numeric <> floor((v_spec ->> 'review_interval_days')::numeric) then
      raise exception 'How often to check a value again is a whole number of days, 1 or more, and this says "%".',
                      v_spec ->> 'review_interval_days'
        using errcode = '22023',
              hint = 'AGT-6: 30 means "look at it again a month after it was written". Leave it out entirely to fill the column once and never re-check it.';
    end if;
    v_every := (v_spec ->> 'review_interval_days')::integer;
  end if;

  -- ── THE CONFIDENCE FLOOR.
  v_floor := coalesce(
    case when v_spec ? 'confidence_floor' and jsonb_typeof(v_spec -> 'confidence_floor') = 'number'
         then (v_spec ->> 'confidence_floor')::numeric end,
    (platform.knob_resolve('custom', 'enrichment_confidence_floor', p_organization_id) #>> '{}')::numeric,
    0.6);
  if v_floor < 0 or v_floor > 1 then
    raise exception 'How sure the model has to be is a number between 0 and 1, and this says "%".', v_floor
      using errcode = '22023',
            hint = '0.6 means "write it when the model is at least sixty percent sure, otherwise keep it as a candidate". 0 writes whatever it says; 1 writes almost nothing.';
  end if;

  -- ── THE WRITE POLICY (AGT-4). It inherits the organization's own agent-change setting,
  -- because "may an agent change my data without asking" is one question and not two.
  -- ONE READER OF THE SETTING (AGENTS-ON-DATA, found live 2026-10-05): the organization's answer
  -- comes from custom.agent_change_approval — the same never_ask / ask / always_ask the settings
  -- screen writes and the approval check reads. This used to read the raw knob and know only the
  -- old words, so an organization set to "Never ask" could not set up any column a model fills.
  v_policy := lower(btrim(coalesce(
    nullif(v_spec ->> 'write_policy', ''),
    case (custom.agent_change_approval(p_organization_id) ->> 'setting')
      when 'never_ask' then 'auto'
      else 'ask' end)));
  if v_policy not in ('auto', 'ask') then
    raise exception '"%" is not a way of deciding whether an agent may write this column.', v_policy
      using errcode = '22023',
            hint = 'AGT-4: it is auto (the enrichment writes as soon as an admin enables it) or ask (somebody answers a request first). It defaults to this organization''s custom/agent_schema_changes.';
  end if;

  v_model := coalesce(nullif(btrim(coalesce(v_spec ->> 'model', '')), ''),
                      nullif(platform.knob_resolve('custom', 'enrichment_model', p_organization_id) #>> '{}', ''),
                      'claude-fable-5-latest');

  v_cap := coalesce(
    case when v_spec ? 'cost_cap_cents' and jsonb_typeof(v_spec -> 'cost_cap_cents') = 'number'
         then (v_spec ->> 'cost_cap_cents')::integer end,
    (platform.knob_resolve('custom', 'enrichment_cost_cap_cents', p_organization_id) #>> '{}')::integer,
    2000);

  return jsonb_strip_nulls(jsonb_build_object(
    'instruction',      v_instr,
    'inputs',           v_inputs,
    'web_search',       coalesce((v_spec ->> 'web_search')::boolean, false),
    'connected_source', nullif(btrim(coalesce(v_spec ->> 'connected_source', '')), ''),
    'model',            v_model,
    'confidence_floor', v_floor,
    'write_policy',     v_policy,
    'cost_cap_cents',   v_cap,
    'review_interval_days', v_every,
    'enabled',          coalesce((v_spec ->> 'enabled')::boolean, false),
    'enabled_by',       nullif(v_spec ->> 'enabled_by', ''),
    'enabled_at',       nullif(v_spec ->> 'enabled_at', ''),
    'declared_by',      nullif(v_spec ->> 'declared_by', ''),
    'declared_at',      nullif(v_spec ->> 'declared_at', '')));
end;
$function$;
