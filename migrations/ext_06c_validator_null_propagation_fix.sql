-- ext_06c_validator_null_propagation_fix.sql
-- HRB-010 / C6 -- 🚨 DEFECT FOUND BY THE FIXTURE, NOT BY READING.
--
-- jsonb_typeof(x -> 'missing_key') is SQL NULL, not the string 'absent'. Every test
-- of the form `jsonb_typeof(v -> 'k') <> 'string'` therefore evaluated to NULL when
-- the key was ABSENT, and `NULL OR NULL` is not true, so the ELSIF was never taken:
-- a `file` value with NO file_id and a `currency` value with NO currency both
-- validated CLEAN. Equality tests (`= 'number'`) were always safe; only the
-- INEQUALITY tests leaked -- which is why the smoke test, whose traps all supplied
-- the key with a WRONG value, was green and said nothing. The fixture cases
-- `file_requires_a_uuid_file_id`, `currency_missing_the_currency_key_is_type_mismatch`
-- and `object_options_without_a_value_key_leave_select_unconstrained` pin it forever.
--
-- The applied migration patched the two branches inside platform.validate_custom_values
-- in place; ext_06b's FILE already carries them, so this file only re-states the
-- _cf_options half and the four behavioural assertions, which are the real gate.

CREATE OR REPLACE FUNCTION platform._cf_options(p_definition jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE raw jsonb; v text[];
BEGIN
  raw := p_definition -> 'options';
  IF raw IS NULL OR jsonb_typeof(raw) <> 'array' OR jsonb_array_length(raw) = 0 THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(raw) e
                  WHERE COALESCE(jsonb_typeof(e), 'absent') <> 'string') THEN
    SELECT array_agg(e #>> '{}' ORDER BY ord) INTO v
      FROM jsonb_array_elements(raw) WITH ORDINALITY t(e, ord);
    RETURN v;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(raw) e
     WHERE COALESCE(jsonb_typeof(e), 'absent') <> 'object'
        OR COALESCE(jsonb_typeof(e -> 'value'), 'absent') <> 'string'
  ) THEN
    SELECT array_agg(e ->> 'value' ORDER BY ord) INTO v
      FROM jsonb_array_elements(raw) WITH ORDINALITY t(e, ord);
    RETURN v;
  END IF;
  RETURN NULL;
END $fn$;

-- The gate. These four run on every replay and fail the migration if the hole reopens.
DO $assert$
DECLARE r jsonb;
BEGIN
  r := platform.validate_custom_values('[{"field_key":"a","field_type":"file"}]','{"a":{"name":"x.pdf"}}','strict');
  IF (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'ext_06c: a file value with no file_id still validates clean'; END IF;

  r := platform.validate_custom_values('[{"field_key":"a","field_type":"currency"}]','{"a":{"amount":10}}','strict');
  IF (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'ext_06c: a currency value with no currency still validates clean'; END IF;

  r := platform.validate_custom_values('[{"field_key":"a","field_type":"single_select","options":[{"label":"Gold"}]}]','{"a":"zzz"}','strict');
  IF NOT (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'ext_06c: options objects with no value must leave the select UNCONSTRAINED, not constrain it to NULL'; END IF;

  r := platform.validate_custom_values('[{"field_key":"a","field_type":"currency"}]','{"a":{"amount":10,"currency":"USD"}}','strict');
  IF NOT (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'ext_06c: a well-formed currency value must still pass'; END IF;
END $assert$;
