-- based-on: platform.feature_knob_set(text, text, jsonb) 576991d8595b32de3d82ca2433bb1db37ca2cdeb37cb0e277fe4698e6b75a870
-- THE INVERSE of migrations/campaign/storeon_the_record_store_is_on_by_default.sql.
--
-- It puts the three knobs' platform default AND their factory reset back to false — the state
-- the owner ruling of 2026-09-23 moved them off — and restores `platform.feature_knob_set` to
-- the body that file declared in its `-- based-on:` line (sha256 52c2c697e386…), which is the
-- admin-only gate without the register-owner arm.
--
-- It runs the two SETs FIRST, while the owner arm still exists: once `feature_knob_set` is
-- back to `public.is_admin()` only, a migration lane can no longer call it, and neither can
-- `platform.feature_knob_default_set`, which keeps the same gate and is left in place (a
-- door nobody can reach is dead weight, not a hazard, and dropping it is not additive).
--
-- It does NOT put any organization's own override back: the batch that turned 575 active
-- organizations on wrote each of them an ordinary `platform.knob_override` row through
-- `platform.unified_data_store_set`, which is the organization's own switch and is theirs to
-- move. Undoing this file returns the PLATFORM default; it does not reach into an
-- organization's settings.
--
-- Header-less, like the file it inverts.

SELECT platform.feature_knob_default_set('data_tables.relation', 'relation_columns_enabled', 'false'::jsonb);
SELECT platform.feature_knob_set('data_tables.relation', 'relation_columns_enabled', 'false'::jsonb);
SELECT platform.feature_knob_default_set('custom', 'code_paths_enabled', 'false'::jsonb);
SELECT platform.feature_knob_set('custom', 'code_paths_enabled', 'false'::jsonb);
SELECT platform.feature_knob_default_set('custom', 'system_enabled', 'false'::jsonb);
SELECT platform.feature_knob_set('custom', 'system_enabled', 'false'::jsonb);

CREATE OR REPLACE FUNCTION platform.feature_knob_set(p_feature text, p_key text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_row platform.feature_knob%rowtype;
  v_num numeric;
begin
  if not public.is_admin() then
    raise exception 'platform.feature_knob_set: admin only' using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.feature_knob_set: unknown knob %.%', p_feature, p_key
      using errcode = '22023';
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    update platform.feature_knob
       set value = default_value, set_by = 'agent',
           updated_by = auth.uid(), updated_at = now()
     where feature = p_feature and key = p_key
     returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_row.value_type in ('number','integer') then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'platform.feature_knob_set: %.% expects a number, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_row.value_type = 'integer' and v_num <> trunc(v_num) then
      raise exception 'platform.feature_knob_set: %.% expects a whole number, got %',
        p_feature, p_key, v_num using errcode = '22023';
    end if;
    if v_row.min_value is not null and v_num < v_row.min_value then
      raise exception 'platform.feature_knob_set: %.% must be >= % (got %)',
        p_feature, p_key, v_row.min_value, v_num using errcode = '22023';
    end if;
    if v_row.max_value is not null and v_num > v_row.max_value then
      raise exception 'platform.feature_knob_set: %.% must be <= % (got %)',
        p_feature, p_key, v_row.max_value, v_num using errcode = '22023';
    end if;
  elsif v_row.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'platform.feature_knob_set: %.% expects a boolean, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'json' then
    -- jsonb has already parsed the value. Objects, arrays, and scalar JSON are
    -- all valid for a registry key declared as json; SQL null above is reset.
    if jsonb_typeof(p_value) not in ('object', 'array', 'string', 'number', 'boolean') then
      raise exception 'platform.feature_knob_set: %.% expects JSON, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'secret' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'vault_adapter_required',
      'feature', p_feature,
      'key', p_key,
      'detail', 'Secret settings must be changed through the dedicated Vault contract; raw values are never accepted here.'
    );
  else
    if jsonb_typeof(p_value) <> 'string' then
      raise exception 'platform.feature_knob_set: %.% expects a string, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    if v_row.allowed_values is not null
       and not (v_row.allowed_values @> jsonb_build_array(p_value)) then
      raise exception 'platform.feature_knob_set: %.% must be one of %',
        p_feature, p_key, v_row.allowed_values::text using errcode = '22023';
    end if;
  end if;

  update platform.feature_knob
     set value = p_value, set_by = 'human',
         updated_by = auth.uid(), updated_at = now()
   where feature = p_feature and key = p_key
   returning * into v_row;
  return to_jsonb(v_row);
end;
$function$

;
