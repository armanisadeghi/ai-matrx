-- DRAFT ONLY: DD154 lexical fixed-width read optimization. Never ledger or apply directly.
-- Requires the live PG17 source pin and preserves every non-prosrc pg_proc field.
DO $dd154_lexer_character_array$
DECLARE
  v_oid oid := 'platform._ddl_guard()'::regprocedure;
  v_before text;
  v_after text;
  v_definition text;
  v_header text;
  v_meta jsonb;
  v_event_meta jsonb;
  v_post_meta jsonb;
  v_post_events jsonb;
  v_cost real;
BEGIN
  SET LOCAL lock_timeout = '2s';

  -- The initial cost check is deliberately before the owner-DDL lock. The
  -- ALTER below has the same cost and is the supported pg_proc tuple lock.
  SELECT p.prosrc, p.procost INTO v_before, v_cost FROM pg_proc p WHERE p.oid = v_oid;
  IF v_cost <> 100 THEN
    RAISE EXCEPTION 'DD154 lexer draft: expected _ddl_guard COST 100, found %', v_cost;
  END IF;
  IF encode(digest(v_before, 'sha256'), 'hex') =
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d' THEN
    -- Exact postimage idempotence: verify the expected function/event identity
    -- without taking the same-cost lock.  This accepts existing postimage
    -- metadata; it does not make a before/after preservation assertion.
    SELECT to_jsonb(p) - 'prosrc', to_jsonb(e)
      INTO v_meta, v_event_meta
      FROM pg_proc p
      JOIN pg_event_trigger e ON e.evtfoid = p.oid
      WHERE p.oid = v_oid AND e.evtname = 'ddl_guard';
    IF v_meta IS NULL OR v_event_meta IS NULL THEN
      RAISE EXCEPTION 'DD154 lexer draft: postimage lacks expected ddl_guard function/event identity';
    END IF;
    RETURN;
  END IF;
  IF encode(digest(v_before, 'sha256'), 'hex') <>
       'db595feedc5bcc3840345e16fb982c6bcebaa91a9c5b997140d69ed9106dd3a6' THEN
    RAISE EXCEPTION 'DD154 lexer draft: unknown _ddl_guard source; refuse surgical transform';
  END IF;

  ALTER FUNCTION platform._ddl_guard() COST 100;
  SELECT p.prosrc, pg_get_functiondef(p.oid), to_jsonb(p) - 'prosrc'
    INTO v_before, v_definition, v_meta FROM pg_proc p WHERE p.oid = v_oid;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) INTO v_event_meta
    FROM pg_event_trigger e;
  IF encode(digest(v_before, 'sha256'), 'hex') <>
       'db595feedc5bcc3840345e16fb982c6bcebaa91a9c5b997140d69ed9106dd3a6' THEN
    RAISE EXCEPTION 'DD154 lexer draft: _ddl_guard changed while waiting for owner-DDL lock';
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

  SELECT p.prosrc, to_jsonb(p) - 'prosrc' INTO v_after, v_post_meta FROM pg_proc p WHERE p.oid = v_oid;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) INTO v_post_events FROM pg_event_trigger e;
  IF encode(digest(v_after, 'sha256'), 'hex') <>
       '5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d'
     OR v_post_meta IS DISTINCT FROM v_meta
     OR v_post_events IS DISTINCT FROM v_event_meta THEN
    RAISE EXCEPTION 'DD154 lexer draft: source or full pg_proc/event-trigger metadata did not survive';
  END IF;
END
$dd154_lexer_character_array$;
