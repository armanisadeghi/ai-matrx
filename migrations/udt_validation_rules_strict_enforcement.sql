-- udt_validation_rules_strict_enforcement
--
-- Column validation rules (`workbench.udt_dataset_fields.validation_rules`)
-- become enforceable in the DATABASE — but ONLY under
-- `udt_datasets.validation_mode = 'strict'`. Permissive stays a pure
-- passthrough: that is a standing invariant of this feature
-- (`features/data-tables/FEATURE.md`), because 118 pre-existing datasets were
-- created before any of this existed and none of them opted in.
--
-- WHAT IS ENFORCED HERE: min / max / minLength / maxLength / pattern (`~`) /
-- allowedValues.
--
-- WHAT IS DELIBERATELY NOT: `unique`. It is a statement about the OTHER rows,
-- and a cross-row check inside a per-row BEFORE trigger is the wrong shape —
-- it cannot see a concurrent insert (so it would be a guarantee that is not
-- one), and it walks the table on every single write. Uniqueness is checked by
-- the client against the rows it has loaded (`validateCellValue`'s
-- `existingValues`), and a real guarantee, if one is ever wanted, is a unique
-- expression index on the column — not a trigger.
--
-- `required` is likewise absent from `validation_rules` by design: the column
-- already declares it as `is_required`, which this same function has always
-- enforced. One fact, one home.
--
-- The rule-checking itself is factored into a NEW pure helper,
-- `public.udt_validate_cell_rules`, for two reasons: it is the only shape in
-- which this logic can be ASSERTED in-transaction (the row validator needs a
-- real dataset row, which this migration has no business creating), and it
-- keeps the TypeScript twin (`features/data-tables/validation.ts`) checkable
-- against a single SQL function rather than against a trigger's innards. The
-- two must agree on every reason string; the DO block at the bottom pins the
-- SQL half.
--
-- based-on: public.udt_validate_row(uuid, jsonb, jsonb) 745073f1a788b0990da4ded6266bdfbacdbe31b91d1f5b505a2a4fd478adc8d9


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The pure rule checker. NULL = the value is acceptable; otherwise the
--    plain-English reason it is not, worded EXACTLY as the browser words it.
--    SECURITY INVOKER (the default) and it touches no table: it is arithmetic
--    over its arguments, so it needs no door row and no grant of its own.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.udt_validate_cell_rules(
  p_rules     jsonb,
  p_value     jsonb,
  p_data_type text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_text text;
  v_num  numeric;
  v_len  int;
  v_min  numeric;
  v_max  numeric;
  v_n    int;
  v_ok   boolean;
  v_list text;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RETURN NULL; END IF;
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RETURN NULL; END IF;

  -- An array reads as the user sees it — "a, b" — so a length rule measures
  -- the same characters in both engines.
  IF jsonb_typeof(p_value) = 'array' THEN
    IF jsonb_array_length(p_value) = 0 THEN RETURN NULL; END IF;
    SELECT string_agg(t.e #>> '{}', ', ' ORDER BY t.ord)
      INTO v_text
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS t(e, ord);
  ELSE
    v_text := p_value #>> '{}';
  END IF;

  -- THE EMPTY-VALUE LAW: emptiness is `is_required`'s question, asked once, by
  -- the caller. A `min: 0` rule must never make an optional column mandatory.
  IF v_text IS NULL OR btrim(v_text) = '' THEN RETURN NULL; END IF;

  BEGIN v_num := v_text::numeric; EXCEPTION WHEN OTHERS THEN v_num := NULL; END;

  -- ── range ─────────────────────────────────────────────────────────────────
  -- Only when a number can honestly be read out of the value. A non-numeric
  -- value in a number column is a TYPE problem this same function already
  -- reports; "Must be at least 0" about the word "pending" is a worse answer to
  -- a question already asked.
  IF v_num IS NOT NULL AND p_rules ? 'min' THEN
    BEGIN v_min := (p_rules->>'min')::numeric; EXCEPTION WHEN OTHERS THEN v_min := NULL; END;
    IF v_min IS NOT NULL AND v_num < v_min THEN
      RETURN 'Must be at least ' || (p_rules->>'min');
    END IF;
  END IF;
  IF v_num IS NOT NULL AND p_rules ? 'max' THEN
    BEGIN v_max := (p_rules->>'max')::numeric; EXCEPTION WHEN OTHERS THEN v_max := NULL; END;
    IF v_max IS NOT NULL AND v_num > v_max THEN
      RETURN 'Must be at most ' || (p_rules->>'max');
    END IF;
  END IF;

  -- ── length ────────────────────────────────────────────────────────────────
  v_len := char_length(v_text);
  IF p_rules ? 'minLength' THEN
    BEGIN v_n := (p_rules->>'minLength')::int; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
    IF v_n IS NOT NULL AND v_len < v_n THEN
      RETURN 'Must be at least ' || v_n
             || CASE WHEN v_n = 1 THEN ' character' ELSE ' characters' END
             || ' (this is ' || v_len || ')';
    END IF;
  END IF;
  IF p_rules ? 'maxLength' THEN
    BEGIN v_n := (p_rules->>'maxLength')::int; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
    IF v_n IS NOT NULL AND v_len > v_n THEN
      RETURN 'Must be at most ' || v_n
             || CASE WHEN v_n = 1 THEN ' character' ELSE ' characters' END
             || ' (this is ' || v_len || ')';
    END IF;
  END IF;

  -- ── shape ─────────────────────────────────────────────────────────────────
  -- The pattern is stored in the dialect BOTH engines understand and is
  -- anchored by its author. An unparseable one is the AUTHOR's defect, not this
  -- value's: it is refused where it is written, and here it must never become a
  -- refusal the typist cannot act on.
  IF p_rules ? 'pattern' AND btrim(COALESCE(p_rules->>'pattern', '')) <> '' THEN
    BEGIN
      IF NOT (v_text ~ (p_rules->>'pattern')) THEN
        RETURN 'Must match the pattern '
               || COALESCE(
                    NULLIF(btrim(COALESCE(p_rules->>'patternHint', '')), ''),
                    p_rules->>'pattern');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ── membership ────────────────────────────────────────────────────────────
  -- A CHOICE column never carries this: its options live in its format, are
  -- offered in the picker, and an off-list value there is legal and amber by
  -- design. The editor refuses to write `allowedValues` on one, so this function
  -- never has to know about formats to agree with the browser.
  IF p_rules ? 'allowedValues'
     AND jsonb_typeof(p_rules->'allowedValues') = 'array'
     AND jsonb_array_length(p_rules->'allowedValues') > 0 THEN
    SELECT EXISTS (
             SELECT 1
               FROM jsonb_array_elements_text(p_rules->'allowedValues') AS a
              WHERE lower(btrim(a)) = lower(btrim(v_text))
           )
      INTO v_ok;
    IF NOT v_ok THEN
      SELECT string_agg(t.a, ', ' ORDER BY t.ord)
        INTO v_list
        FROM jsonb_array_elements_text(p_rules->'allowedValues') WITH ORDINALITY AS t(a, ord);
      RETURN 'Must be one of: ' || v_list;
    END IF;
  END IF;

  -- `unique` is intentionally not reachable from here — see the header.
  -- `p_data_type` is accepted but unread: every rule above is answered by the
  -- VALUE, and the storage type is enforced by the caller. It stays in the
  -- signature because the first rule that needs it (a date range) could not be
  -- added without changing every callsite.

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.udt_validate_cell_rules(jsonb, jsonb, text) IS
  'Judges one cell value against one column''s validation_rules. NULL = acceptable; otherwise the plain-English reason, worded identically to features/data-tables/validation.ts. Does NOT check `unique` (a cross-row claim) and never treats an empty value as a violation.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The row validator now also consults the per-field rules — strict only.
--    Everything above the new block is byte-for-byte the live body.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field RECORD; v_value JSONB; v_old_value JSONB; v_mode TEXT;
  v_is_insert BOOLEAN := p_prior IS NULL; v_had BOOLEAN; v_has BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT validation_mode INTO v_mode FROM workbench.udt_datasets WHERE id = p_table_id;
  IF v_mode IS NULL THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  -- permissive (default for every pre-existing dataset) enforces NOTHING.
  IF v_mode <> 'strict' THEN
    RETURN p_data;
  END IF;

  FOR v_field IN
    SELECT field_name, data_type, is_required, validation_rules FROM workbench.udt_dataset_fields WHERE table_id = p_table_id
  LOOP
    v_value := p_data -> v_field.field_name;
    v_old_value := p_prior -> v_field.field_name;
    v_has := v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null';
    v_had := v_old_value IS NOT NULL AND jsonb_typeof(v_old_value) <> 'null';

    IF v_field.is_required AND NOT v_has THEN
      IF v_is_insert THEN
        RAISE EXCEPTION 'udt_validate_row: required field % missing on insert into table %', v_field.field_name, p_table_id;
      ELSIF v_had THEN
        RAISE EXCEPTION 'udt_validate_row: required field % cannot be dropped on table %', v_field.field_name, p_table_id;
      END IF;
      CONTINUE;
    END IF;

    IF v_has THEN
      CASE v_field.data_type::text
        WHEN 'string' THEN
          IF jsonb_typeof(v_value) NOT IN ('string','number') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'number' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects number, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          IF jsonb_typeof(v_value) = 'string' THEN
            BEGIN PERFORM (v_value #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not numeric', v_field.field_name; END;
          END IF;
        WHEN 'integer' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects integer, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::bigint;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not an integer', v_field.field_name; END;
        WHEN 'boolean' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects boolean, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'date','datetime' THEN
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects ISO date string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::timestamptz;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not parseable as date', v_field.field_name; END;
        WHEN 'json' THEN NULL;
        WHEN 'array' THEN
          IF jsonb_typeof(v_value) <> 'array' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects array, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        ELSE NULL;
      END CASE;

      -- Column validation rules. Type first, then the rule: a value that is not
      -- even the right type must hear about THAT, not about a range it could
      -- never have satisfied.
      v_reason := public.udt_validate_cell_rules(
        v_field.validation_rules, v_value, v_field.data_type::text);
      IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'udt_validate_row: field %: %', v_field.field_name, v_reason;
      END IF;
    END IF;
  END LOOP;
  RETURN p_data;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Prove the helper, in this transaction, before anything is ledgered.
--    Every case is asserted against its EXACT reason string, because the reason
--    is the product: a rule that refuses without saying why is a dead end.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
  v_got text;
  v_fail int := 0;

  v_note text := 'udt_validate_cell_rules self-test';

  -- (rules, value, data_type, expected)
  v_cases jsonb := jsonb_build_array(
    -- no rules at all
    jsonb_build_array('{}',                                   '"anything"',  'string',  null),
    jsonb_build_array('null',                                 '"anything"',  'string',  null),
    -- THE EMPTY-VALUE LAW
    jsonb_build_array('{"min":5,"minLength":3,"pattern":"^x$"}', 'null',      'number',  null),
    jsonb_build_array('{"min":5,"minLength":3}',              '""',          'string',  null),
    jsonb_build_array('{"minLength":3}',                      '"   "',       'string',  null),
    jsonb_build_array('{"minLength":3}',                      '[]',          'array',   null),
    -- range
    jsonb_build_array('{"min":0,"max":100}',                  '0',           'number',  null),
    jsonb_build_array('{"min":0,"max":100}',                  '100',         'number',  null),
    jsonb_build_array('{"min":0,"max":100}',                  '-1',          'number',  'Must be at least 0'),
    jsonb_build_array('{"min":0,"max":100}',                  '101',         'number',  'Must be at most 100'),
    jsonb_build_array('{"min":0}',                            '"-5"',        'number',  'Must be at least 0'),
    -- a non-numeric value is a TYPE problem, not a range problem
    jsonb_build_array('{"min":0,"max":100}',                  '"pending"',   'number',  null),
    -- length
    jsonb_build_array('{"minLength":3}',                      '"ab"',        'string',  'Must be at least 3 characters (this is 2)'),
    jsonb_build_array('{"maxLength":5}',                      '"abcdef"',    'string',  'Must be at most 5 characters (this is 6)'),
    jsonb_build_array('{"maxLength":1}',                      '"ab"',        'string',  'Must be at most 1 character (this is 2)'),
    jsonb_build_array('{"maxLength":3}',                      '12345',       'integer', 'Must be at most 3 characters (this is 5)'),
    -- an array is measured as the user reads it
    jsonb_build_array('{"maxLength":3}',                      '["ab","cd"]', 'array',   'Must be at most 3 characters (this is 6)'),
    -- pattern
    jsonb_build_array('{"pattern":"^\\d{3}-\\d{4}$","patternHint":"###-####"}', '"555-1234"', 'string', null),
    jsonb_build_array('{"pattern":"^\\d{3}-\\d{4}$","patternHint":"###-####"}', '"5551234"',  'string', 'Must match the pattern ###-####'),
    jsonb_build_array('{"pattern":"^a+$"}',                   '"b"',         'string',  'Must match the pattern ^a+$'),
    -- an unparseable pattern never refuses the typist
    jsonb_build_array('{"pattern":"([unclosed"}',             '"anything"',  'string',  null),
    -- allowed values
    jsonb_build_array('{"allowedValues":["Red","Green","Blue"]}', '"green"',  'string',  null),
    jsonb_build_array('{"allowedValues":["Red","Green","Blue"]}', '"  BLUE "','string',  null),
    jsonb_build_array('{"allowedValues":["Red","Green","Blue"]}', '"Purple"', 'string',  'Must be one of: Red, Green, Blue'),
    -- `unique` is never enforced here, by design
    jsonb_build_array('{"unique":true}',                      '"acme"',      'string',  null),
    -- first failure wins, in the order a person checks them
    jsonb_build_array('{"min":10,"maxLength":1,"pattern":"^zzz$"}', '5',      'number',  'Must be at least 10')
  );
  v_case jsonb;
BEGIN
  FOR v_case IN SELECT * FROM jsonb_array_elements(v_cases) LOOP
    v_got := public.udt_validate_cell_rules(
      (v_case->>0)::jsonb,
      (v_case->>1)::jsonb,
      v_case->>2
    );
    IF v_got IS DISTINCT FROM (v_case->>3) THEN
      v_fail := v_fail + 1;
      RAISE WARNING '% FAILED: rules=% value=% type=% expected=% got=%',
        v_note, v_case->>0, v_case->>1, v_case->>2,
        COALESCE(v_case->>3, '<ok>'), COALESCE(v_got, '<ok>');
    END IF;
  END LOOP;

  IF v_fail > 0 THEN
    RAISE EXCEPTION '% failed % of % cases — nothing applied',
      v_note, v_fail, jsonb_array_length(v_cases);
  END IF;

  RAISE NOTICE '% passed all % cases', v_note, jsonb_array_length(v_cases);
END;
$selftest$;
