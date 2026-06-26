-- iam_canonical_sweep_ledger.sql
-- ---------------------------------------------------------------------------
-- The claim ledger + live status board for parallelizing the canonical sweep.
-- An agent claims a table atomically (no two agents grab the same one),
-- runs the runbook, then iam.sweep_record() re-verifies and marks it done.
-- iam.sweep_refresh() re-checks every row (the drift board / cron).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS iam.canonical_sweep (
  schema_name  text NOT NULL,
  table_name   text NOT NULL,
  token        text NOT NULL,
  variant      text NOT NULL DEFAULT 'entity',   -- entity | component | ledger
  status       text NOT NULL DEFAULT 'todo',      -- todo | claimed | done | blocked
  claimed_by   text,
  claimed_at   timestamptz,
  verified_ok  boolean,
  fails        text,
  warns        text,
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schema_name, table_name)
);

-- seed the work-list from the access registry (governed entities)
INSERT INTO iam.canonical_sweep (schema_name, table_name, token, variant)
SELECT schema_name, table_name, token, CASE WHEN is_component THEN 'component' ELSE 'entity' END
FROM platform.entity_types WHERE is_active IS TRUE
ON CONFLICT (schema_name, table_name) DO UPDATE SET token=EXCLUDED.token, variant=EXCLUDED.variant;

-- re-verify one row and update its board entry (idempotent)
CREATE OR REPLACE FUNCTION iam.sweep_record(p_schema text, p_table text)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE r record; v_ok boolean; v_fails text; v_warns text;
BEGIN
  SELECT * INTO r FROM iam.canonical_sweep WHERE schema_name=p_schema AND table_name=p_table;
  IF NOT FOUND THEN RAISE EXCEPTION 'sweep_record: % .% not in ledger', p_schema, p_table; END IF;
  SELECT string_agg(check_name||COALESCE(' ('||detail||')',''), '; ') FILTER (WHERE status='FAIL'),
         string_agg(check_name, ', ') FILTER (WHERE status='WARN')
    INTO v_fails, v_warns
    FROM iam.verify_canonical(p_schema, p_table, r.token, NULLIF(r.variant,'auto'));
  v_ok := v_fails IS NULL;
  UPDATE iam.canonical_sweep SET
    verified_ok = v_ok, fails = v_fails, warns = v_warns,
    status = CASE WHEN v_ok THEN 'done' ELSE (CASE WHEN status='done' THEN 'todo' ELSE status END) END,
    updated_at = now()
  WHERE schema_name=p_schema AND table_name=p_table;
  RETURN v_ok;
END;
$function$;

-- re-verify the whole board (drift cron)
CREATE OR REPLACE FUNCTION iam.sweep_refresh()
RETURNS TABLE(total int, done int, todo int)
LANGUAGE plpgsql AS $function$
DECLARE r record;
BEGIN
  FOR r IN SELECT schema_name, table_name FROM iam.canonical_sweep LOOP
    PERFORM iam.sweep_record(r.schema_name, r.table_name);
  END LOOP;
  RETURN QUERY SELECT count(*)::int,
                      count(*) FILTER (WHERE verified_ok)::int,
                      count(*) FILTER (WHERE NOT COALESCE(verified_ok,false))::int
               FROM iam.canonical_sweep;
END;
$function$;

-- atomic claim — only one agent can win a 'todo'/'blocked' row
CREATE OR REPLACE FUNCTION iam.sweep_claim(p_schema text, p_table text, p_agent text)
RETURNS boolean LANGUAGE sql AS $function$
  UPDATE iam.canonical_sweep
     SET status='claimed', claimed_by=p_agent, claimed_at=now(), updated_at=now()
   WHERE schema_name=p_schema AND table_name=p_table AND status IN ('todo','blocked')
  RETURNING true;
$function$;
