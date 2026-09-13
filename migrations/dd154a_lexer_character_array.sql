-- DRAFT ONLY: DD154 lexical fixed-width read optimization. Never ledger or apply directly.
-- Requires the live PG17 source pin and preserves every non-prosrc pg_proc field.
DO $dd154_lexer_character_array$
DECLARE
  v_oid oid := 'platform._ddl_guard()'::regprocedure;
  v_before text;
  v_initial_source text;
  v_after text;
  v_definition text;
  v_header text;
  v_meta jsonb;
  v_event_meta jsonb;
  v_post_meta jsonb;
  v_post_events jsonb;
  v_initial_meta jsonb;
  v_initial_events jsonb;
  v_expected_meta constant jsonb := '{"proacl":null,"probin":null,"procost":100,"prokind":"f","prolang":"13619","proname":"_ddl_guard","prorows":0,"pronargs":0,"proowner":"16388","proconfig":null,"proretset":false,"prosecdef":false,"prorettype":"3838","prosqlbody":null,"prosupport":"-","proargmodes":null,"proargnames":null,"proargtypes":[],"proisstrict":false,"proparallel":"u","protrftypes":null,"provariadic":"0","provolatile":"v","proleakproof":false,"pronamespace":"1697874","proallargtypes":null,"proargdefaults":null,"pronargdefaults":0}'::jsonb;
  v_expected_event constant jsonb := '{"evtfoid":"1700135","evtname":"ddl_guard","evttags":["CREATE TABLE","ALTER TABLE","CREATE FUNCTION","CREATE TRIGGER"],"evtevent":"ddl_command_end","evtowner":"16388","evtenabled":"O"}'::jsonb;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SELECT p.prosrc, to_jsonb(p) - 'prosrc'
    INTO STRICT v_initial_source, v_initial_meta FROM pg_proc p WHERE p.oid = v_oid;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) INTO v_initial_events FROM pg_event_trigger e;
  SELECT to_jsonb(e) - 'oid' INTO STRICT v_event_meta FROM pg_event_trigger e WHERE e.evtname = 'ddl_guard';
  IF (v_initial_meta - 'oid') IS DISTINCT FROM v_expected_meta
     OR v_event_meta IS DISTINCT FROM v_expected_event THEN
    RAISE EXCEPTION 'DD154 lexer draft: semantic pg_proc/event metadata drifted before owner-DDL lock';
  END IF;
  IF encode(digest(v_initial_source, 'sha256'), 'hex') NOT IN (
       'db595feedc5bcc3840345e16fb982c6bcebaa91a9c5b997140d69ed9106dd3a6',
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d') THEN
    RAISE EXCEPTION 'DD154 lexer draft: unknown _ddl_guard source; refuse surgical transform';
  END IF;

  -- Supported owner DDL takes the function tuple lock on BOTH initial and
  -- idempotent paths. Pin checks above precede any possible DDL side effect.
  ALTER FUNCTION platform._ddl_guard() COST 100;
  SELECT p.prosrc, pg_get_functiondef(p.oid), to_jsonb(p) - 'prosrc'
    INTO STRICT v_before, v_definition, v_meta FROM pg_proc p WHERE p.oid = v_oid;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) INTO v_event_meta FROM pg_event_trigger e;
  IF v_before IS DISTINCT FROM v_initial_source
     OR v_meta IS DISTINCT FROM v_initial_meta
     OR v_event_meta IS DISTINCT FROM v_initial_events THEN
    RAISE EXCEPTION 'DD154 lexer draft: source or metadata changed while waiting for owner-DDL lock';
  END IF;
  IF encode(digest(v_before, 'sha256'), 'hex') =
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d' THEN
    RETURN;
  END IF;

  -- The full source pin plus computed postimage makes these two fixed-width
  -- expressions an exact 36-read patch; every other source byte must survive.
  v_after := replace(v_before, 'v_scan_len integer;', 'v_scan_chars text[]; v_scan_len integer;');
  v_after := replace(v_after, 'v_scan_len := length(v_function_source);',
    E'v_scan_len := length(v_function_source);\n      v_scan_chars := string_to_array(v_function_source, NULL);');
  IF regexp_count(v_before,
      $dd154_width_one$substr\(v_function_source, (v_scan_(?:pos|next_pos|uescape_pos)(?: \+ \d+)?), 1\)$dd154_width_one$) <> 24
     OR regexp_count(v_before,
      $dd154_width_two$substr\(v_function_source, (v_scan_(?:pos|next_pos|uescape_pos)(?: \+ \d+)?), 2\)$dd154_width_two$) <> 12 THEN
    RAISE EXCEPTION 'DD154 lexer draft: fixed-width source anchors are ambiguous';
  END IF;
  v_after := regexp_replace(v_after,
    $dd154_width_one$substr\(v_function_source, (v_scan_(?:pos|next_pos|uescape_pos)(?: \+ \d+)?), 1\)$dd154_width_one$,
    $dd154_replace_one$coalesce(v_scan_chars[\1], '')$dd154_replace_one$, 'g');
  v_after := regexp_replace(v_after,
    $dd154_width_two$substr\(v_function_source, (v_scan_(?:pos|next_pos|uescape_pos)(?: \+ \d+)?), 2\)$dd154_width_two$,
    $dd154_replace_two$(coalesce(v_scan_chars[\1], '') || coalesce(v_scan_chars[\1 + 1], ''))$dd154_replace_two$, 'g');
  IF encode(digest(v_after, 'sha256'), 'hex') <>
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d' THEN
    RAISE EXCEPTION 'DD154 lexer draft: computed postimage differs; source anchors are not exact';
  END IF;
  v_header := split_part(v_definition, '$function$', 1);
  IF v_header = v_definition OR split_part(v_definition, '$function$', 3) <> E'\n' THEN
    RAISE EXCEPTION 'DD154 lexer draft: function definition delimiter is not exact';
  END IF;
  EXECUTE v_header || '$function$' || v_after || '$function$';

  SELECT p.prosrc, to_jsonb(p) - 'prosrc' INTO STRICT v_after, v_post_meta FROM pg_proc p WHERE p.oid = v_oid;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) INTO v_post_events FROM pg_event_trigger e;
  IF encode(digest(v_after, 'sha256'), 'hex') <>
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d'
     OR v_post_meta IS DISTINCT FROM v_initial_meta
     OR v_post_events IS DISTINCT FROM v_initial_events THEN
    RAISE EXCEPTION 'DD154 lexer draft: source or full pg_proc/event-trigger metadata did not survive';
  END IF;
END
$dd154_lexer_character_array$;
