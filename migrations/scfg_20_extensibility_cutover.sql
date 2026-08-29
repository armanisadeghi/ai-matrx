-- scfg_20: extensibility joins the scoped-configuration primitive. The
-- hardcoded platform-only key list inside platform.extensibility_knob (ext_07
-- lines 104-106) becomes overridable_by curation, and the org branch reads
-- platform.knob_override instead of iam.organizations.settings->'extensibility'
-- (0 live rows — verified scfg_00; no data move needed). The definition/target
-- column branches are untouched: those read real entity columns and "a knob is
-- not a rule".

update platform.feature_knob
   set overridable_by = '{organization}'
 where feature = 'extensibility'
   and key not in ('custom_fields.promoted_indexes_per_target',
                   'custom_entities.record_name_backfill_batch',
                   'tier3.enabled');
-- The three formerly-hardcoded locks stay '{}' (the scfg_01 backfill default).

CREATE OR REPLACE FUNCTION platform.extensibility_knob(p_key text, p_organization_id uuid DEFAULT NULL::uuid, p_target_token text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v jsonb; d record; t record;
BEGIN
  IF p_definition_id IS NOT NULL THEN
    SELECT max_fields, max_records, is_searchable, validation_mode, ai_exposure
      INTO d FROM platform.custom_entity_definition WHERE id = p_definition_id;
    IF FOUND THEN
      v := CASE p_key
             WHEN 'custom_entities.max_fields_per_definition'  THEN to_jsonb(d.max_fields)
             WHEN 'custom_entities.max_records_per_definition' THEN to_jsonb(d.max_records)
             WHEN 'custom_entities.search_enabled'             THEN to_jsonb(d.is_searchable)
             WHEN 'custom_fields.validation_mode'              THEN to_jsonb(d.validation_mode)
             WHEN 'custom_fields.ai_exposure_default'          THEN to_jsonb(d.ai_exposure)
           END;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'null' THEN RETURN v; END IF;
    END IF;
  END IF;

  IF p_target_token IS NOT NULL THEN
    SELECT is_enabled, validation_mode, max_fields, max_custom_bytes, ai_exposure_ceiling
      INTO t FROM platform.custom_field_target
     WHERE target_token = p_target_token AND deleted_at IS NULL;
    IF FOUND THEN
      v := CASE p_key
             WHEN 'custom_fields.enabled'                 THEN to_jsonb(t.is_enabled)
             WHEN 'custom_fields.validation_mode'         THEN to_jsonb(t.validation_mode)
             WHEN 'custom_fields.max_fields_per_target'   THEN to_jsonb(t.max_fields)
             WHEN 'custom_fields.max_custom_bytes_per_row' THEN to_jsonb(t.max_custom_bytes)
             WHEN 'custom_fields.ai_exposure_default'     THEN to_jsonb(t.ai_exposure_ceiling)
           END;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'null' THEN RETURN v; END IF;
    END IF;
  END IF;

  -- Org rung + platform rung, overridability, range clamp, and the P0001
  -- missing-knob refusal now all come from the ONE resolver (the hardcoded
  -- NOT IN lock list is overridable_by='{}' curation on the register).
  RETURN platform.knob_resolve('extensibility', p_key, p_organization_id);
END $function$;

-- Round-trip probe: an org override written through the shared body resolves
-- through extensibility_knob_int, the locked key refuses, and cleanup leaves
-- zero rows. Aborts the migration on any failure.
do $$
declare v jsonb; n int;
begin
  v := platform._knob_override_write('extensibility','custom_fields.max_keys_per_row',
        'organization','39c38960-d30c-4840-b0c1-c9960de95582','39c38960-d30c-4840-b0c1-c9960de95582',
        '55'::jsonb,'scfg_20 probe', null);
  if not (v->>'ok')::boolean then
    raise exception 'scfg_20 probe: org override refused: %', v;
  end if;
  n := platform.extensibility_knob_int('custom_fields.max_keys_per_row','39c38960-d30c-4840-b0c1-c9960de95582');
  if n is distinct from 55 then
    raise exception 'scfg_20 probe: expected 55, got %', n;
  end if;
  n := platform.extensibility_knob_int('custom_fields.max_keys_per_row',null);
  if n = 55 then
    raise exception 'scfg_20 probe: org override leaked to null-org resolution';
  end if;
  v := platform._knob_override_write('extensibility','tier3.enabled',
        'organization','39c38960-d30c-4840-b0c1-c9960de95582','39c38960-d30c-4840-b0c1-c9960de95582',
        'true'::jsonb,'scfg_20 probe', null);
  if (v->>'ok')::boolean or (v->>'reason') <> 'not_overridable' then
    raise exception 'scfg_20 probe: locked key did not refuse: %', v;
  end if;
  v := platform._knob_override_write('extensibility','custom_fields.max_keys_per_row',
        'organization','39c38960-d30c-4840-b0c1-c9960de95582','39c38960-d30c-4840-b0c1-c9960de95582',
        null,'', null);
  if not (v->>'ok')::boolean or not (v->>'key_removed')::boolean then
    raise exception 'scfg_20 probe: clear failed: %', v;
  end if;
  select count(*) into n from platform.knob_override where feature='extensibility';
  if n <> 0 then
    raise exception 'scfg_20 probe: % leftover probe row(s)', n;
  end if;
  raise notice 'scfg_20 probe: all legs green';
end $$;
