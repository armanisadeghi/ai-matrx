-- ext_04_validator_helpers.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.4.2: the normative byte counters.
-- Pinned by their own fixture case sets, exactly like the CMS validator's
-- utf8_byte_length / item_byte_size. Fixture: features/platform/custom-fields/
-- custom-field-validation-rules.json (utf8_byte_length_cases / item_byte_size_cases /
-- count_keys_cases).

CREATE OR REPLACE FUNCTION platform.cf_utf8_byte_length(p_text text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT octet_length(p_text) $$;

COMMENT ON FUNCTION platform.cf_utf8_byte_length(text) IS
'THE normative UTF-8 byte counter for per-field byte caps (SPEC-EXTENSIBILITY 2.4.2). Twins: Python len(s.encode("utf-8")), JS Buffer.byteLength(s).';

-- Compact JSON: no spaces, no ascii escaping -- the same bytes JSON.stringify /
-- json.dumps(separators=(",",":"), ensure_ascii=False) produce. jsonb reorders
-- object keys, which does NOT change the byte COUNT, which is all this feeds.
CREATE OR REPLACE FUNCTION platform.cf_compact_json(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$
  SELECT CASE
    WHEN p_value IS NULL THEN 'null'
    WHEN jsonb_typeof(p_value) = 'null'    THEN 'null'
    WHEN jsonb_typeof(p_value) = 'boolean' THEN CASE WHEN p_value = 'true'::jsonb THEN 'true' ELSE 'false' END
    WHEN jsonb_typeof(p_value) = 'number'  THEN p_value #>> '{}'
    WHEN jsonb_typeof(p_value) = 'string'  THEN to_jsonb(p_value #>> '{}')::text
    WHEN jsonb_typeof(p_value) = 'array'   THEN
      '[' || COALESCE((SELECT string_agg(platform.cf_compact_json(e), ',' ORDER BY ord)
                         FROM jsonb_array_elements(p_value) WITH ORDINALITY t(e, ord)), '') || ']'
    ELSE
      '{' || COALESCE((SELECT string_agg(to_jsonb(kv.key)::text || ':' || platform.cf_compact_json(kv.value), ',' ORDER BY kv.key)
                         FROM jsonb_each(p_value) kv), '') || '}'
  END
$$;

CREATE OR REPLACE FUNCTION platform.cf_item_byte_size(p_value jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT octet_length(platform.cf_compact_json(p_value)) $$;

COMMENT ON FUNCTION platform.cf_item_byte_size(jsonb) IS
'THE normative whole-value byte size (SPEC-EXTENSIBILITY 2.4.2): compact JSON, no ascii escaping, UTF-8. Key ORDER differs from a JS/Python twin (jsonb sorts) but the byte COUNT does not, which is the only thing this feeds.';

CREATE OR REPLACE FUNCTION platform.cf_count_keys(p_value jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT CASE WHEN p_value IS NULL OR jsonb_typeof(p_value) <> 'object'
                THEN 0 ELSE (SELECT count(*)::int FROM jsonb_object_keys(p_value)) END $$;

-- The IEEE-754 double the wire actually carried (CMS ruling (g)): every numeric
-- comparison happens on the double a JS twin would have seen after JSON.parse,
-- never on Postgres's higher-precision numeric.
CREATE OR REPLACE FUNCTION platform._cf_as_double(p_value jsonb)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE v double precision;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'number' THEN RETURN NULL; END IF;
  BEGIN
    v := (p_value #>> '{}')::double precision;
  EXCEPTION WHEN numeric_value_out_of_range OR data_exception THEN
    RETURN CASE WHEN (p_value #>> '{}') LIKE '-%' THEN '-Infinity'::double precision
                ELSE 'Infinity'::double precision END;
  END;
  RETURN v;
END $fn$;
