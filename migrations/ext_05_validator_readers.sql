-- ext_05_validator_readers.sql
-- HRB-010 / C6 -- the NORMATIVE constraint readers.
-- Inherited ruling (f) from the CMS validator, verbatim: a MALFORMED constraint
-- is IGNORED (treated as absent), never silently reinterpreted.
-- NOTE: platform._cf_options is superseded by ext_06c (a NULL-propagation fix).

CREATE OR REPLACE FUNCTION platform._cf_num_opt(p_rules jsonb, p_name text)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT CASE WHEN jsonb_typeof(p_rules -> p_name) = 'number'
                THEN platform._cf_as_double(p_rules -> p_name) END $$;

-- max_length / max_values / max_size / decimals: a NON-NEGATIVE INTEGRAL JSON
-- number only. -1, true, "5", null, 2.5 are malformed -> ignored. 2.0 is
-- honoured as 2 (JSON cannot distinguish it from 2).
CREATE OR REPLACE FUNCTION platform._cf_int_opt(p_rules jsonb, p_name text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE d double precision;
BEGIN
  IF jsonb_typeof(p_rules -> p_name) <> 'number' THEN RETURN NULL; END IF;
  d := platform._cf_as_double(p_rules -> p_name);
  IF d IS NULL OR d = 'Infinity'::double precision OR d = '-Infinity'::double precision THEN RETURN NULL; END IF;
  IF d <> trunc(d) OR d < 0 THEN RETURN NULL; END IF;
  RETURN d::integer;
END $fn$;

CREATE OR REPLACE FUNCTION platform._cf_str_array(p_value jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE v text[];
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) = 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) e WHERE jsonb_typeof(e) <> 'string') THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(e #>> '{}' ORDER BY ord) INTO v
    FROM jsonb_array_elements(p_value) WITH ORDINALITY t(e, ord);
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION platform._cf_options(p_definition jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE raw jsonb; v text[];
BEGIN
  raw := p_definition -> 'options';
  IF raw IS NULL OR jsonb_typeof(raw) <> 'array' OR jsonb_array_length(raw) = 0 THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(raw) e WHERE jsonb_typeof(e) <> 'string') THEN
    SELECT array_agg(e #>> '{}' ORDER BY ord) INTO v
      FROM jsonb_array_elements(raw) WITH ORDINALITY t(e, ord);
    RETURN v;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(raw) e
     WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'value') <> 'string'
  ) THEN
    SELECT array_agg(e ->> 'value' ORDER BY ord) INTO v
      FROM jsonb_array_elements(raw) WITH ORDINALITY t(e, ord);
    RETURN v;
  END IF;
  RETURN NULL;
END $fn$;

-- Strict ISO-8601 calendar validity (dialect shared with the CMS validator).
CREATE OR REPLACE FUNCTION platform._cf_valid_datetime(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE m text[]; y int; mo int; d int; hh int; mi int; ss int; tz text;
BEGIN
  m := regexp_match(p_value,
        '^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2})(:(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$');
  IF m IS NULL THEN RETURN false; END IF;
  y := m[1]::int; mo := m[2]::int; d := m[3]::int;
  BEGIN PERFORM make_date(y, mo, d); EXCEPTION WHEN OTHERS THEN RETURN false; END;
  IF m[4] IS NOT NULL THEN
    hh := m[5]::int; mi := m[6]::int; ss := COALESCE(m[8]::int, 0);
    IF hh > 23 OR mi > 59 OR ss > 59 THEN RETURN false; END IF;
  END IF;
  tz := m[10];
  IF tz IS NOT NULL AND tz <> 'Z' THEN
    IF substr(tz,2,2)::int > 23 OR substr(tz,5,2)::int > 59 THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION platform._cf_valid_date(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
BEGIN
  IF p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  BEGIN
    PERFORM make_date(substr(p_value,1,4)::int, substr(p_value,6,2)::int, substr(p_value,9,2)::int);
  EXCEPTION WHEN OTHERS THEN RETURN false; END;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION platform._cf_pattern_fails(p_value text, p_pattern text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
$fn$
DECLARE ok boolean;
BEGIN
  IF p_pattern IS NULL THEN RETURN false; END IF;
  BEGIN ok := (p_value ~ p_pattern); EXCEPTION WHEN OTHERS THEN RETURN false; END;
  RETURN NOT ok;
END $fn$;
