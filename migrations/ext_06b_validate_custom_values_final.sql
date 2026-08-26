-- ext_06b_validate_custom_values_final.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.4.2: THE CANONICAL write-time validator.
--
-- Pure: no DB access, no clock, no network. Anything needing a read (reference
-- resolution, structured-list options, quota counts) is done by the CALLER and
-- handed in. That purity is what lets ONE language-neutral fixture pin every twin:
-- features/platform/custom-fields/custom-field-validation-rules.json.
--
-- Generalizes aidream/aidream/services/cms/collection_validation.py (validate_item)
-- to the 15-type set. Everything hardened there is inherited VERBATIM: the `key`
-- identifier property, malformed constraints IGNORED (ruling f), max_length in
-- Unicode CODE POINTS on every string value whatever the type (ruling b),
-- `required` = the literal boolean true only (ruling h), "" is an absence ONLY on
-- string-ish types (ruling a), anchored regexes with the explicit whitespace class
-- (rulings c/d/e), numbers compared as the IEEE-754 double the wire carried
-- (ruling g), and EVERY constraint failure reported, not just the first (ruling j)
-- -- while a type mismatch still short-circuits.
--
-- FOUR DELIBERATE DIVERGENCES from the CMS reference, each recorded:
--  1. Unknown keys WARN in advisory (CMS passes them silently). SPEC-EXTENSIBILITY
--     2.4 and 6-B test 2 both require the warning.
--  2. required_missing, archived_field and byte_cap reject in BOTH modes. 2.4.2's
--     mode table names only required_missing, but 2.2 says an archived definition
--     "rejects new writes" and 3.6 says a quota is "a first-class, explained
--     refusal, never a silent truncation" -- a warning that the write went through
--     anyway defeats both. OWED: 2.4.2's mode paragraph.
--  3. A string that fails a FORMAT dialect (email/url/date/datetime) is
--     invalid_format, not type_mismatch, and does NOT short-circuit the remaining
--     constraints. A non-string on those types is still type_mismatch.
--  4. An ARCHIVED definition is checked FIRST and is never also required: an
--     archived field that is absent produces nothing at all.
--
-- date/datetime min/max compare LEXICOGRAPHICALLY on the ISO string -- exact for
-- the ISO forms this validator accepts, no clock, no timezone database, trivially
-- reproducible in every twin.
--
-- 🚨 FILE-vs-APPLIED NOTE, stated plainly. The migration applied live under this
-- name lacked the two COALESCE(jsonb_typeof(...), 'absent') guards in the currency
-- and file branches; ext_06c patched them in-session after the fixture caught the
-- resulting hole. This file carries the CORRECTED body so a replay is one clean
-- pass, and ext_06c's four behavioural assertions gate the outcome either way.

CREATE OR REPLACE FUNCTION platform.validate_custom_values(
  p_definitions jsonb,
  p_values      jsonb,
  p_mode        text,
  p_limits      jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_e164 constant text := '^\+[1-9][0-9]{1,14}$';
  v_re_email text := platform.cf_re_email();
  v_re_url   text := platform.cf_re_url();
  v_strict   boolean;
  v_vals     jsonb;
  v_lim      jsonb;
  v_declared jsonb := '{}'::jsonb;
  v_issues   jsonb := '[]'::jsonb;
  v_errs     jsonb;
  v_warns    jsonb;
  r          record;
  v_d        jsonb;
  v_rules    jsonb;
  v_k        text;
  v_ft       text;
  v_val      jsonb;
  v_multi    boolean;
  v_req      boolean;
  v_arch     boolean;
  v_present  boolean;
  v_empty    boolean;
  v_type_bad text;
  v_fmt_bad  text;
  v_s        text;
  v_dbl      double precision;
  v_mn       double precision;
  v_mx       double precision;
  v_len      integer;
  v_cap      integer;
  v_opts     text[];
  v_list     text[];
  v_item     jsonb;
  v_res      jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('advisory','strict') THEN
    RAISE EXCEPTION 'validate_custom_values: unknown validation_mode %; expected advisory or strict', p_mode
      USING ERRCODE = '22023',
            HINT = 'Fail closed on a corrupt mode rather than silently defaulting.';
  END IF;
  v_strict := (p_mode = 'strict');

  v_vals := CASE WHEN p_values IS NOT NULL AND jsonb_typeof(p_values) = 'object' THEN p_values ELSE '{}'::jsonb END;
  v_lim  := CASE WHEN p_limits IS NOT NULL AND jsonb_typeof(p_limits) = 'object' THEN p_limits ELSE '{}'::jsonb END;

  IF p_definitions IS NOT NULL AND jsonb_typeof(p_definitions) = 'array' THEN
    FOR v_d IN SELECT e FROM jsonb_array_elements(p_definitions) t(e) LOOP
      IF jsonb_typeof(v_d) = 'object'
         AND jsonb_typeof(v_d -> 'field_key') = 'string'
         AND (v_d ->> 'field_key') <> '' THEN
        v_declared := v_declared || jsonb_build_object(v_d ->> 'field_key', v_d);
      END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT key AS dk, value AS dv FROM jsonb_each(v_declared) ORDER BY key LOOP
    v_k := r.dk;
    v_d := r.dv;
    v_ft := v_d ->> 'field_type';
    v_rules := CASE WHEN jsonb_typeof(v_d -> 'validation_rules') = 'object'
                    THEN v_d -> 'validation_rules' ELSE '{}'::jsonb END;
    v_multi := (v_d -> 'is_multi')    = 'true'::jsonb;
    v_req   := (v_d -> 'is_required') = 'true'::jsonb;
    v_arch  := (v_d -> 'archived')    = 'true'::jsonb;
    v_present := (v_vals ? v_k);
    v_val := v_vals -> v_k;

    IF v_arch THEN
      IF v_present AND v_val IS NOT NULL AND jsonb_typeof(v_val) <> 'null' THEN
        v_issues := v_issues || jsonb_build_object(
          'key', v_k, 'code', 'archived_field',
          'message', 'field is archived and no longer accepts writes', 'cls', 'reject');
      END IF;
      CONTINUE;
    END IF;

    v_empty := jsonb_typeof(v_val) = 'string'
               AND (v_val #>> '{}') = ''
               AND ( v_ft IN ('text','long_text','date','datetime','single_select','url','email','phone')
                     OR (v_ft IN ('entity_reference','user_reference') AND NOT v_multi) );

    IF NOT v_present OR v_val IS NULL OR jsonb_typeof(v_val) = 'null' OR v_empty THEN
      IF v_req THEN
        v_issues := v_issues || jsonb_build_object(
          'key', v_k, 'code', 'required_missing',
          'message', 'required field is missing or empty', 'cls', 'reject');
      END IF;
      CONTINUE;
    END IF;

    v_type_bad := NULL;
    v_fmt_bad  := NULL;

    CASE v_ft
      WHEN 'text', 'long_text' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a string, got ' || jsonb_typeof(v_val);
        END IF;

      WHEN 'number' THEN
        IF jsonb_typeof(v_val) <> 'number' THEN
          v_type_bad := 'expected a JSON number (strings are never coerced)';
        ELSE
          v_dbl := platform._cf_as_double(v_val);
          IF v_dbl = 'Infinity'::double precision OR v_dbl = '-Infinity'::double precision THEN
            v_type_bad := 'number is outside the finite IEEE-754 double range';
          END IF;
        END IF;

      WHEN 'currency' THEN
        IF jsonb_typeof(v_val) <> 'object' THEN
          v_type_bad := 'expected {amount, currency}, got ' || jsonb_typeof(v_val);
        ELSIF COALESCE(jsonb_typeof(v_val -> 'amount'), 'absent') <> 'number' OR COALESCE(jsonb_typeof(v_val -> 'currency'), 'absent') <> 'string' THEN
          v_type_bad := 'expected {amount: number, currency: string}';
        END IF;

      WHEN 'boolean' THEN
        IF jsonb_typeof(v_val) <> 'boolean' THEN
          v_type_bad := 'expected true or false (no 0/1/string coercion)';
        END IF;

      WHEN 'date' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a YYYY-MM-DD string, got ' || jsonb_typeof(v_val);
        ELSIF NOT platform._cf_valid_date(v_val #>> '{}') THEN
          v_fmt_bad := 'expected a YYYY-MM-DD calendar date';
        END IF;

      WHEN 'datetime' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected an ISO-8601 string, got ' || jsonb_typeof(v_val);
        ELSIF NOT platform._cf_valid_datetime(v_val #>> '{}') THEN
          v_fmt_bad := 'expected a strict ISO-8601 date/datetime';
        END IF;

      WHEN 'single_select' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a string option, got ' || jsonb_typeof(v_val);
        END IF;

      WHEN 'multi_select' THEN
        IF jsonb_typeof(v_val) <> 'array' THEN
          v_type_bad := 'expected an array of option values, got ' || jsonb_typeof(v_val);
        ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_val) e WHERE jsonb_typeof(e) <> 'string') THEN
          v_type_bad := 'every multi_select value must be a string option';
        END IF;

      WHEN 'entity_reference', 'user_reference' THEN
        IF v_multi THEN
          IF jsonb_typeof(v_val) <> 'array' THEN
            v_type_bad := 'expected an array of ids, got ' || jsonb_typeof(v_val);
          ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_val) e WHERE jsonb_typeof(e) <> 'string') THEN
            v_type_bad := 'every reference must be an id string';
          END IF;
        ELSIF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected an id string, got ' || jsonb_typeof(v_val);
        END IF;

      WHEN 'file' THEN
        IF jsonb_typeof(v_val) <> 'object' THEN
          v_type_bad := 'expected a file reference object, got ' || jsonb_typeof(v_val);
        ELSIF COALESCE(jsonb_typeof(v_val -> 'file_id'), 'absent') <> 'string' OR (v_val ->> 'file_id') !~ c_uuid THEN
          v_type_bad := 'expected {file_id: uuid, ...}; the bytes live in files.files';
        END IF;

      WHEN 'url' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a string, got ' || jsonb_typeof(v_val);
        ELSIF (v_val #>> '{}') !~ v_re_url THEN
          v_fmt_bad := 'expected an http(s) URL';
        END IF;

      WHEN 'email' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a string, got ' || jsonb_typeof(v_val);
        ELSIF (v_val #>> '{}') !~ v_re_email THEN
          v_fmt_bad := 'expected an email address';
        END IF;

      WHEN 'phone' THEN
        IF jsonb_typeof(v_val) <> 'string' THEN
          v_type_bad := 'expected a string, got ' || jsonb_typeof(v_val);
        ELSIF (v_val #>> '{}') !~ c_e164 THEN
          v_issues := v_issues || jsonb_build_object(
            'key', v_k, 'code', 'invalid_format',
            'message', 'phone is not in E.164 form (advisory only; never rejected on shape)', 'cls', 'warn');
        END IF;

      ELSE
        v_type_bad := 'field schema declares unknown field_type ' || COALESCE(v_ft, 'null');
    END CASE;

    IF v_type_bad IS NOT NULL THEN
      v_issues := v_issues || jsonb_build_object(
        'key', v_k, 'code', 'type_mismatch', 'message', v_type_bad, 'cls', 'mode');
      CONTINUE;
    END IF;

    IF v_fmt_bad IS NOT NULL THEN
      v_issues := v_issues || jsonb_build_object(
        'key', v_k, 'code', 'invalid_format', 'message', v_fmt_bad, 'cls', 'mode');
    END IF;

    IF jsonb_typeof(v_val) = 'string' THEN
      v_len := platform._cf_int_opt(v_rules, 'max_length');
      IF v_len IS NOT NULL AND char_length(v_val #>> '{}') > v_len THEN
        v_issues := v_issues || jsonb_build_object(
          'key', v_k, 'code', 'max_length',
          'message', 'exceeds max_length ' || v_len || ' (counted in code points)', 'cls', 'mode');
      END IF;
      IF jsonb_typeof(v_rules -> 'pattern') = 'string'
         AND platform._cf_pattern_fails(v_val #>> '{}', v_rules ->> 'pattern') THEN
        v_issues := v_issues || jsonb_build_object(
          'key', v_k, 'code', 'invalid_format',
          'message', 'does not match the declared pattern',
          'cls', CASE WHEN v_ft = 'phone' THEN 'warn' ELSE 'mode' END);
      END IF;
    END IF;

    IF jsonb_typeof(v_val) = 'array' THEN
      v_cap := platform._cf_int_opt(v_rules, 'max_values');
      IF v_cap IS NOT NULL AND jsonb_array_length(v_val) > v_cap THEN
        v_issues := v_issues || jsonb_build_object(
          'key', v_k, 'code', 'too_many_values',
          'message', 'holds ' || jsonb_array_length(v_val) || ' values, over max_values ' || v_cap, 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft = 'number' THEN
      v_dbl := platform._cf_as_double(v_val);
      v_mn := platform._cf_num_opt(v_rules, 'min');
      v_mx := platform._cf_num_opt(v_rules, 'max');
      IF v_mn IS NOT NULL AND v_dbl < v_mn THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'below min ' || v_mn, 'cls', 'mode');
      END IF;
      IF v_mx IS NOT NULL AND v_dbl > v_mx THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'above max ' || v_mx, 'cls', 'mode');
      END IF;
      v_cap := platform._cf_int_opt(v_rules, 'decimals');
      IF v_cap IS NOT NULL AND scale((v_val #>> '{}')::numeric) > v_cap THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'more than ' || v_cap || ' decimal places', 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft = 'currency' THEN
      v_dbl := platform._cf_as_double(v_val -> 'amount');
      v_mn := platform._cf_num_opt(v_rules, 'min');
      v_mx := platform._cf_num_opt(v_rules, 'max');
      IF v_mn IS NOT NULL AND v_dbl < v_mn THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'amount below min ' || v_mn, 'cls', 'mode');
      END IF;
      IF v_mx IS NOT NULL AND v_dbl > v_mx THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'amount above max ' || v_mx, 'cls', 'mode');
      END IF;
      v_list := platform._cf_str_array(v_rules -> 'allowed_currencies');
      IF v_list IS NOT NULL AND NOT ((v_val ->> 'currency') = ANY (v_list)) THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_option',
          'message', 'currency is not one of the allowed currencies', 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft IN ('date','datetime') THEN
      v_s := v_val #>> '{}';
      IF jsonb_typeof(v_rules -> 'min') = 'string' AND v_s < (v_rules ->> 'min') THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'before min ' || (v_rules ->> 'min'), 'cls', 'mode');
      END IF;
      IF jsonb_typeof(v_rules -> 'max') = 'string' AND v_s > (v_rules ->> 'max') THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'after max ' || (v_rules ->> 'max'), 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft = 'single_select' THEN
      v_opts := platform._cf_options(v_d);
      IF v_opts IS NOT NULL AND NOT ((v_val #>> '{}') = ANY (v_opts)) THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_option',
          'message', 'not one of the declared options', 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft = 'multi_select' THEN
      v_opts := platform._cf_options(v_d);
      IF v_opts IS NOT NULL THEN
        FOR v_item IN SELECT e FROM jsonb_array_elements(v_val) t(e) LOOP
          IF NOT ((v_item #>> '{}') = ANY (v_opts)) THEN
            v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_option',
              'message', 'not one of the declared options: ' || (v_item #>> '{}'), 'cls', 'mode');
          END IF;
        END LOOP;
      END IF;
    END IF;

    IF v_ft = 'file' THEN
      v_cap := platform._cf_int_opt(v_rules, 'max_size');
      IF v_cap IS NOT NULL AND jsonb_typeof(v_val -> 'size') = 'number'
         AND platform._cf_as_double(v_val -> 'size') > v_cap THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'out_of_range',
          'message', 'file is larger than max_size ' || v_cap, 'cls', 'mode');
      END IF;
      v_list := platform._cf_str_array(v_rules -> 'allowed_mime');
      IF v_list IS NOT NULL AND NOT (COALESCE(v_val ->> 'mime', '') = ANY (v_list)) THEN
        v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_option',
          'message', 'mime type is not allowed for this field', 'cls', 'mode');
      END IF;
    END IF;

    IF v_ft IN ('entity_reference','user_reference') THEN
      v_res := CASE WHEN jsonb_typeof(v_d -> 'resolved') = 'object' THEN v_d -> 'resolved' END;
      FOR v_item IN
        SELECT e FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_val) = 'array' THEN v_val ELSE jsonb_build_array(v_val) END) t(e)
      LOOP
        v_s := v_item #>> '{}';
        IF v_s !~ c_uuid THEN
          v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_reference',
            'message', 'not an id: ' || v_s, 'cls', 'mode');
        ELSIF v_res IS NOT NULL AND (v_res -> v_s) IS DISTINCT FROM 'true'::jsonb THEN
          v_issues := v_issues || jsonb_build_object('key', v_k, 'code', 'invalid_reference',
            'message', 'reference does not resolve to a readable same-organization ' ||
                       COALESCE(v_d ->> 'reference_target_token', 'target'), 'cls', 'mode');
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR r IN SELECT key AS dk FROM jsonb_each(v_vals) ORDER BY key LOOP
    IF NOT (v_declared ? r.dk) THEN
      v_issues := v_issues || jsonb_build_object('key', r.dk, 'code', 'unknown_key',
        'message', 'key is not a live custom field for this target', 'cls', 'mode');
    END IF;
  END LOOP;

  v_cap := platform._cf_int_opt(v_lim, 'max_custom_bytes');
  IF v_cap IS NOT NULL AND platform.cf_item_byte_size(v_vals) > v_cap THEN
    v_issues := v_issues || jsonb_build_object('key', '__row__', 'code', 'byte_cap',
      'message', 'custom values are ' || platform.cf_item_byte_size(v_vals) ||
                 ' bytes, over the max_custom_bytes limit of ' || v_cap, 'cls', 'reject');
  END IF;
  v_cap := platform._cf_int_opt(v_lim, 'max_keys_per_row');
  IF v_cap IS NOT NULL AND platform.cf_count_keys(v_vals) > v_cap THEN
    v_issues := v_issues || jsonb_build_object('key', '__row__', 'code', 'byte_cap',
      'message', 'custom values hold ' || platform.cf_count_keys(v_vals) ||
                 ' keys, over the max_keys_per_row limit of ' || v_cap, 'cls', 'reject');
  END IF;

  SELECT COALESCE(jsonb_agg(i - 'cls' ORDER BY ord), '[]'::jsonb) INTO v_errs
    FROM jsonb_array_elements(v_issues) WITH ORDINALITY t(i, ord)
   WHERE i ->> 'cls' = 'reject' OR (i ->> 'cls' = 'mode' AND v_strict);

  SELECT COALESCE(jsonb_agg(i - 'cls' ORDER BY ord), '[]'::jsonb) INTO v_warns
    FROM jsonb_array_elements(v_issues) WITH ORDINALITY t(i, ord)
   WHERE i ->> 'cls' = 'warn' OR (i ->> 'cls' = 'mode' AND NOT v_strict);

  RETURN jsonb_build_object(
    'ok',       jsonb_array_length(v_errs) = 0,
    'errors',   v_errs,
    'warnings', v_warns);
END $fn$;

COMMENT ON FUNCTION platform.validate_custom_values(jsonb, jsonb, text, jsonb) IS
'THE canonical custom-value validator (SPEC-EXTENSIBILITY 2.4.2). Pure. Pinned byte-for-byte by custom-field-validation-rules.json; every repo twin (Python in aidream, TypeScript in matrx-frontend) runs the same fixture or CI fails. p_limits is a DEFAULTED 4th parameter so the spec''s 3-argument signature still calls identically; it carries the row-level ceilings (max_custom_bytes, max_keys_per_row) the 3-arg signature had nowhere to put.';

GRANT EXECUTE ON FUNCTION platform.validate_custom_values(jsonb, jsonb, text, jsonb) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION platform.cf_utf8_byte_length(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.cf_item_byte_size(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.cf_count_keys(jsonb) TO authenticated, service_role;
