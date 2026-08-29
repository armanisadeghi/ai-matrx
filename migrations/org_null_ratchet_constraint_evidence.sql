-- NO NULL ORG ratchet — teach the snapshot to report CONSTRAINT EVIDENCE
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 / §6e): NULL is never a
-- scope, and the checks must "scream and paint everything RED" when it is used
-- as one.
--
-- THE PROBLEM THIS SOLVES, found 2026-08-29 while clearing the 136 new NULL-org
-- rows the release gate had been printing a silent green over.
--
-- Five of the eight regressed tables turned out to be tables where a LIVE CHECK
-- CONSTRAINT REQUIRES `organization_id` TO BE NULL for a defined class of row:
--
--   platform.retention_policy        retention_policy_scope_addressing
--   platform.entity_grants           entity_grants_audience_shape
--   users.integration_connections    integration_connections_owner_shape
--   users.user_secrets               user_secrets_scope_exclusive
--   users.credential_items           credential_items_one_owner_check
--
-- On those tables `organization_id` is not an OWNER column at all — it is a
-- scope selector (which rung of a policy ladder this row addresses), a grant
-- TARGET (who receives the grant), or one arm of an XOR ownership union
-- (personal row vs org row). Backfilling any of them does not "fix" anything:
-- it raises a check violation. The ratchet was counting them as debt anyway,
-- so its number grew every time a user saved a personal credential, and the
-- growth it reported was ~90% noise. A gate that cries wolf is a gate somebody
-- eventually mutes — which is the failure mode this whole ratchet exists to
-- prevent.
--
-- THE FIX, AND WHY IT IS NOT JUST AN ALLOWLIST.
-- An allowlist entry is an ASSERTION: "trust me, this table is fine." Assertions
-- rot silently — the constraint gets dropped in some unrelated migration and the
-- exemption keeps quietly excusing real debt forever. That is precisely the
-- "silent green" pathology, moved one layer down.
--
-- So the exemption is made SELF-VERIFYING. This migration adds `org_constraints`
-- to `public.org_null_ratchet_snapshot()`: every CHECK constraint, on every
-- table in the ratchet's scan set, whose definition mentions `organization_id`
-- — read live from pg_constraint. The checker's baseline names the specific
-- constraint each exemption rests on, and the checker refuses to honour an
-- exemption whose constraint is not in this live list. Drop the constraint and
-- the exemption dies LOUDLY on the next run, which is the only way an exemption
-- should ever be allowed to exist.
--
-- Human judgement stays in the baseline (the reason). The PREMISE of that
-- judgement is machine-checked here. Neither half is trusted alone.
--
-- CONTRACT PRESERVED: this is a strictly ADDITIVE change to the returned JSON.
-- Every existing key keeps its name, type and meaning, so both readers
-- (matrx-frontend scripts/canonical-ratchets/check-org-null.ts and
-- aidream scripts/check_org_null.py) keep working untouched. Section 2 asserts
-- that key-for-key rather than trusting this paragraph.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_null_ratchet_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_exempt_schemas CONSTANT text[] := ARRAY[
    'graveyard','auth','storage','realtime','vault','extensions','supabase_functions',
    'supabase_migrations','cron','net','pgsodium','_analytics','_realtime'];
  -- see the header: history is a snapshot of rows counted at their source.
  c_exempt_rowscan CONSTANT text[] := ARRAY['history'];
  rec record;
  v_nulls bigint;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
BEGIN
  FOR rec IN
    SELECT n.nspname AS s, c.relname AS t, c.oid,
           EXISTS (SELECT 1 FROM platform.entity_types e
                    WHERE e.schema_name = n.nspname AND e.table_name = c.relname) AS registered,
           (SELECT count(*) FROM pg_attribute a
             WHERE a.attrelid = c.oid AND NOT a.attisdropped
               AND a.attname IN ('created_by','created_at','updated_at','deleted_at',
                                 'metadata','version','visibility')) AS base_col_score
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                         AND NOT org.attisdropped AND NOT org.attnotnull
    WHERE c.relkind IN ('r','p')
      AND NOT c.relispartition
      AND n.nspname NOT LIKE 'pg\_%'
      AND n.nspname <> ALL (c_exempt_schemas)
      AND n.nspname <> ALL (c_exempt_rowscan)
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id IS NULL', rec.s, rec.t)
      INTO v_nulls;
    v_total := v_total + v_nulls;
    IF v_nulls > 0 THEN
      v_rows := v_rows || jsonb_build_object(
        'schema', rec.s, 'table', rec.t, 'null_rows', v_nulls,
        'guarded_class', (rec.registered OR rec.base_col_score >= 3));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'system_org_id', '39c38960-d30c-4840-b0c1-c9960de95582',
    'ddl_guard_attached', (SELECT coalesce(bool_or(evtenabled <> 'D'), false)
                             FROM pg_event_trigger WHERE evtname = 'ddl_guard'),
    'null_org_rows_total', v_total,
    'null_org_rows', v_rows,
    -- NEW (2026-08-29): the evidence half of the exemption contract. Every CHECK
    -- constraint mentioning organization_id on a nullable-org table. The checker
    -- honours an exemption ONLY while its named constraint appears here, so a
    -- dropped constraint turns a quiet exemption back into loud debt.
    -- Deliberately NOT filtered to constraints that "look like" they force NULL:
    -- the two live shapes are `... AND (organization_id IS NULL)` and the XOR
    -- `(user_id IS NOT NULL) <> (organization_id IS NOT NULL)`, and a pattern
    -- narrow enough to catch both would be a pattern that silently misses the
    -- third shape nobody has written yet. Report the facts; let the baseline
    -- name the constraint and a human state the reason.
    'org_constraints', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'schema', s, 'table', t, 'constraint', cname, 'definition', cdef)
             ORDER BY s, t, cname)
      FROM (
        SELECT n.nspname AS s, c.relname AS t, con.conname AS cname,
               pg_get_constraintdef(con.oid) AS cdef
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                             AND NOT org.attisdropped AND NOT org.attnotnull
        WHERE con.contype = 'c'
          AND c.relkind IN ('r','p')
          AND NOT c.relispartition
          AND n.nspname NOT LIKE 'pg\_%'
          AND n.nspname <> ALL (c_exempt_schemas)
          AND pg_get_constraintdef(con.oid) ILIKE '%organization_id%'
      ) q
    ), '[]'::jsonb),
    'nullable_org_columns', coalesce((
      SELECT jsonb_agg(jsonb_build_object('schema', s, 'table', t) ORDER BY s, t)
      FROM (
        SELECT n.nspname AS s, c.relname AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute org ON org.attrelid = c.oid AND org.attname = 'organization_id'
                             AND NOT org.attisdropped AND NOT org.attnotnull
        WHERE c.relkind IN ('r','p')
          AND NOT c.relispartition
          AND n.nspname NOT LIKE 'pg\_%'
          AND n.nspname <> ALL (c_exempt_schemas)
          AND (EXISTS (SELECT 1 FROM platform.entity_types e
                        WHERE e.schema_name = n.nspname AND e.table_name = c.relname)
               OR (SELECT count(*) FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND NOT a.attisdropped
                      AND a.attname IN ('created_by','created_at','updated_at','deleted_at',
                                        'metadata','version','visibility')) >= 3)
      ) q
    ), '[]'::jsonb)
  );
END;
$function$;

-- ── 2. FALSIFICATION — the contract, asserted, not asserted-about ───────────
DO $$
DECLARE
  v jsonb;
  v_missing text;
  v_n int;
BEGIN
  v := public.org_null_ratchet_snapshot();

  -- (a) Every pre-existing key still present, so neither reader breaks.
  FOREACH v_missing IN ARRAY ARRAY['generated_at','system_org_id','ddl_guard_attached',
                                   'null_org_rows_total','null_org_rows','nullable_org_columns']
  LOOP
    IF NOT (v ? v_missing) THEN
      RAISE EXCEPTION 'ABORT: the snapshot lost the pre-existing key "%" — readers would break.', v_missing;
    END IF;
  END LOOP;

  -- (b) The new key exists and is an array.
  IF NOT (v ? 'org_constraints') THEN
    RAISE EXCEPTION 'ABORT: org_constraints was not added.';
  END IF;
  IF jsonb_typeof(v->'org_constraints') <> 'array' THEN
    RAISE EXCEPTION 'ABORT: org_constraints is %, expected an array.', jsonb_typeof(v->'org_constraints');
  END IF;

  -- (c) GREEN: the five constraints the exemptions will rest on are all
  -- reported. If any is absent the exemption contract is unusable, and we must
  -- find that out here rather than by silently excusing real debt later.
  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(v->'org_constraints') e
   WHERE (e->>'schema') || '.' || (e->>'table') || ':' || (e->>'constraint') IN (
     'platform.retention_policy:retention_policy_scope_addressing',
     'platform.entity_grants:entity_grants_audience_shape',
     'users.integration_connections:integration_connections_owner_shape',
     'users.user_secrets:user_secrets_scope_exclusive',
     'users.credential_items:credential_items_one_owner_check');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'ABORT: expected all 5 exemption constraints in org_constraints, found %.', v_n;
  END IF;

  -- (d) RED: a constraint that does not exist must NOT be reported. Proves the
  -- list is read from the catalog and not fabricated — the exemption check is
  -- only worth anything if a missing constraint really is missing.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'org_constraints') e
     WHERE e->>'constraint' = '_zz_constraint_that_does_not_exist')
  THEN
    RAISE EXCEPTION 'ABORT: the snapshot reported a constraint that does not exist.';
  END IF;

  RAISE NOTICE 'org_null_ratchet_snapshot: contract preserved, org_constraints live with % entr(ies); all 5 exemption constraints present.',
               jsonb_array_length(v->'org_constraints');
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
