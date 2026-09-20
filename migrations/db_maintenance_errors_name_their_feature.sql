-- An in-database error names its FEATURE, not only its app.
--
-- `source_app` / `source_feature` are ONE two-level categorization: the app,
-- then the feature inside it (Arman, 2026-09-18). `ops.system_error` gained
-- `source_feature` on 2026-09-20 (aidream migration 0938) and every Python
-- writer now stamps both halves — but SQL running INSIDE the database was
-- invisible to that sweep, because a Python guard cannot read a function body
-- stored in `pg_proc`.
--
-- Six maintenance functions insert into `ops.system_error`. Measured live
-- 2026-09-20, none of them named a feature, and four of the six invented their
-- own app label instead:
--
--   history.ensure_row_version_partitions            no source_app at all
--   hr.heal_grant_drift                              no source_app at all
--   hr.raise_compliance_exception                    source_app 'hr.jurisdiction'
--   platform._report_undeclared_confirmation_write   source_app 'database'
--   platform.audit_carrying_cycles                   source_app 'postgres'
--   platform.heal_reachability_drift                 source_app 'postgres-cron'
--
-- `'hr.jurisdiction'` is the exact shape Arman named: a FEATURE written into the
-- APP slot. Four labels for one producer means no filter can ask "what broke
-- inside the database", and none of the six could ever be narrowed to the
-- subsystem that owns the remedy.
--
-- After this file, all six carry `source_app = 'database'` — the database IS
-- the app here — plus the registered feature of the subsystem that failed:
-- `row_history`, `hr`, `hr`, `provenance`, `reachability`, `reachability`.
-- Every slug is registered in
-- aidream/aidream/services/conversation_context/source_attribution.py, and the
-- four retired app labels are aliased there so rows already persisted under
-- them still normalize.
--
-- NOTHING ELSE IN THESE BODIES CHANGES. Each definition below is
-- `pg_get_functiondef` read off the live catalogue immediately before this file
-- was written, with the INSERT's column list and values as the only edit.
--
-- Header-less on purpose: this is an ordinary repo migration, not a campaign
-- file, and it carries no deny-listed statement — six `CREATE OR REPLACE
-- FUNCTION`s, each declaring the live body it was written against (DD-220).
--
-- based-on: history.ensure_row_version_partitions(integer) c1c142cb97fd8c472954bd0a435abdb46c786ab6d782fad4a9eea5a4e93c69d3
-- based-on: hr.heal_grant_drift() 56a26fc90ed448a753ef1a9ad106f3513846cc954e959a84cbce53fd8d3ed0cb
-- based-on: hr.raise_compliance_exception(uuid, text, uuid, integer, text, text, text, jsonb) 22d056f136fc80a218a63f0f0e7169c4bf6850ef32654935144f0b3b2be4223c
-- based-on: platform._report_undeclared_confirmation_write(oid, uuid, uuid) f5aa51071a2b5df03c59e846ef5f4e68245b2ec13b5b9be52320b92b4f90d442
-- based-on: platform.audit_carrying_cycles() fd4c5e6931e247899ca603bc391a3730dd8a1a827ca43c7dc79b52b09bbf6934
-- based-on: platform.heal_reachability_drift() 7c905f6e249667a9176b60105b375ddea52dbca361bac456a0143f5471251b84

-- ── history.ensure_row_version_partitions ─────────────────────────
CREATE OR REPLACE FUNCTION history.ensure_row_version_partitions(months_ahead integer DEFAULT 18)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'history', 'public', 'pg_catalog'
AS $function$
DECLARE m date:=date_trunc('month',now())::date;
        stop date:=(date_trunc('month',now())+make_interval(months=>months_ahead))::date;
        part text; created int:=0; default_rows bigint; v_rel regclass; r record;
BEGIN
  WHILE m < stop LOOP
    part:=format('row_versions_%s',to_char(m,'YYYY_MM'));
    IF to_regclass(format('history.%I',part)) IS NULL THEN
      EXECUTE format('CREATE TABLE history.%I PARTITION OF history.row_versions FOR VALUES FROM (%L) TO (%L)',part,m::timestamptz,(m+interval '1 month')::timestamptz);
      created:=created+1; RAISE NOTICE 'history.ensure_row_version_partitions: created %',part;
    END IF;
    -- Reconcile every requested child on every run, not merely the creation branch.
    v_rel:=to_regclass(format('history.%I',part));
    PERFORM history.install_confidential_row_version_boundary(v_rel);
    m:=(m+interval '1 month')::date;
  END LOOP;
  IF to_regclass('history.row_versions_default') IS NOT NULL THEN
    PERFORM history.install_confidential_row_version_boundary('history.row_versions_default'::regclass);
    EXECUTE 'SELECT count(*) FROM ONLY history.row_versions_default' INTO default_rows;
    IF default_rows>0 THEN
      RAISE WARNING 'history.row_versions_default holds % row(s) — provisioning gap',default_rows;
      IF NOT EXISTS (SELECT 1 FROM ops.system_error WHERE kind='row_versions_default_partition_used' AND resolved_at IS NULL) THEN
        -- ops.system_error.organization_id is NOT NULL with no default and no
        -- stamping trigger (ops._stamp_capture_org was retired), so a system-lane
        -- forensic row names the Matrx System organization explicitly, the way
        -- every other system writer on this database does.  Without it the alarm
        -- raises 23502 and takes the partition provisioner down with it — the
        -- announcement killing the run it was announcing.
        INSERT INTO ops.system_error (organization_id,kind,error_type,error_text,context,source_app,source_feature)
        VALUES ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'row_versions_default_partition_used','PartitionProvisioningGap',
          format('history.row_versions_default holds %s row(s): the monthly partition provisioner did not run in time. User writes were saved, but version history landed in the catch-all. Run history.ensure_row_version_partitions().',default_rows),
          jsonb_build_object('default_rows',default_rows,'first_seen_at',now()),
          'database','row_history');
      END IF;
    END IF;
  END IF;
  -- A caller may ask for only the next month while an older direct child was
  -- repaired manually or was created before this boundary existed.  Reconcile
  -- the complete direct-child census on every invocation; do not make repair
  -- conditional on the creation branch or the requested horizon.
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'history.row_versions'::regclass
  LOOP
    PERFORM history.install_confidential_row_version_boundary(r.rel);
  END LOOP;
  RETURN created;
END $function$
;

-- ── hr.heal_grant_drift ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.heal_grant_drift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_before jsonb; v_after jsonb; v_count int; v_sample jsonb; v_emps uuid[];
  v_org uuid; v_incident_filed boolean := false; v_incident_error text;
begin
  -- ---------- evidence FIRST: count, per-kind breakdown and a 25-row sample, captured before
  -- anything is touched. A heal that cannot say what it healed is a heal nobody can audit.
  select count(*)::int, jsonb_object_agg(kind, n)
    into v_count, v_before
    from (select kind, count(*)::int as n from hr.grant_drift() group by kind) s;
  v_count := coalesce(v_count, 0);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sample
    from (select * from hr.grant_drift() limit 25) x;

  -- hr_l3_47 decision 3: ops.system_error.organization_id is NOT NULL with no default.
  -- Read it from the drift itself where the rows agree, else the Matrx System org, since
  -- drift spanning employers is a platform incident. Captured here because grant_drift()
  -- is empty once the heal below has run.
  select case when count(distinct d.grantee_organization_id) = 1
              then (array_agg(distinct d.grantee_organization_id))[1] end
    into v_org
    from hr.grant_drift() d where d.grantee_organization_id is not null;
  v_org := coalesce(v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

  if v_count = 0 then
    return jsonb_build_object('drift', 0, 'healed', false);
  end if;

  -- ---------- re-derive
  select coalesce(array_agg(id), '{}'::uuid[]) into v_emps
    from hr.employment where deleted_at is null;
  perform hr.derive_grants_bulk(v_emps);

  -- ---------- re-measure to CONFIRM convergence rather than assume it
  select jsonb_object_agg(kind, n) into v_after
    from (select kind, count(*)::int as n from hr.grant_drift() group by kind) s;

  -- ---------- file the incident (RECORDED DECISION 5)
  if to_regclass('ops.system_error') is not null then
    begin
      execute $q$insert into ops.system_error (kind, error_text, context, organization_id,
                                         source_app, source_feature)
                 values ('hr_grant_drift_detected', $1, $2, $3, 'database', 'hr')$q$
        using format('HR derived-grant drift: %s rows', v_count),
              jsonb_build_object('before', coalesce(v_before,'{}'::jsonb),
                                 'after', coalesce(v_after,'{}'::jsonb),
                                 'sample', v_sample),
              v_org;
      v_incident_filed := true;
    exception when others then
      -- the incident lane must never be able to fail the heal (unchanged) -- but the
      -- failure is no longer invisible: for as long as this said `null`, the heal
      -- reported success while filing nothing, every single time (hr_l3_47 decision 4).
      v_incident_error := sqlstate || ': ' || sqlerrm;
    end;
  end if;

  return jsonb_build_object('drift', v_count, 'healed', true,
                            'before', coalesce(v_before,'{}'::jsonb),
                            'after', coalesce(v_after,'{}'::jsonb), 'sample', v_sample,
                            'incident_filed', v_incident_filed,
                            'incident_error', v_incident_error);
end
$function$
;

-- ── hr.raise_compliance_exception ─────────────────────────────────
CREATE OR REPLACE FUNCTION hr.raise_compliance_exception(p_organization_id uuid, p_jurisdiction_key text, p_rule_id uuid, p_rule_version integer, p_class text, p_code text, p_message text, p_org_config_ref jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_id uuid;
begin
  -- hr.compliance_exception is SPEC-DATA-MODEL section 16's table and belongs to lane L9. Until
  -- it lands, the evidence is KEPT rather than dropped: one ops.system_error row per occurrence,
  -- carrying every field section 3.4 names, so L9's backfill has something to read. When L9
  -- ships the table, ONLY THIS BODY changes -- no call site moves.
  insert into ops.system_error (organization_id, kind, error_type, error_text, context, source_app,
                                source_feature)
  values (p_organization_id, 'hr_compliance_exception_pending', p_code, p_message,
          jsonb_build_object('jurisdiction_key', p_jurisdiction_key, 'rule_id', p_rule_id,
                             'rule_version', p_rule_version, 'class', p_class,
                             'org_config_ref', p_org_config_ref,
                             'owed_to', 'SPEC-DOMAIN-WIDE / L9 hr.compliance_exception'),
          'database', 'hr')
  returning id into v_id;
  return v_id;
end
$function$
;

-- ── platform._report_undeclared_confirmation_write ────────────────
CREATE OR REPLACE FUNCTION platform._report_undeclared_confirmation_write(p_relid oid, p_org uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into ops.system_error (kind, error_type, error_text, source_app, source_feature, route,
                                organization_id, user_id, created_by, context)
  values (
    'provenance',
    'undeclared_actor_on_admitted_table',
    format(
      'A write to %s was born unconfirmed because the door that made it declared no actor. '
      || 'This is a defect in that door: a server path must declare app.actor_tier before it writes '
      || 'to a table admitted to the confirmation rule. The row is honest in the meantime.',
      p_relid::regclass::text),
    'database', 'provenance', p_relid::regclass::text,
    p_org, p_user, p_user,
    jsonb_build_object('relation', p_relid::regclass::text, 'session_role', current_user,
                       'register', 'DD-131')
  );
end
$function$
;

-- ── platform.audit_carrying_cycles ────────────────────────────────
CREATE OR REPLACE FUNCTION platform.audit_carrying_cycles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_n bigint; v_sample jsonb; v_open_id uuid; v_error_id uuid; v_occ int := 1; v_declared bigint;
BEGIN
  SELECT count(*) INTO v_declared FROM platform.carrying_cycles();
  WITH c AS MATERIALIZED (SELECT * FROM platform.undeclared_carrying_cycles())
  SELECT (SELECT count(*) FROM c),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM c ORDER BY 1,2,3,4 LIMIT 25) s), '[]'::jsonb)
  INTO v_n, v_sample;
  v_declared := v_declared - v_n;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('cycles', 0, 'declared', v_declared, 'incident', null, 'checked_at', now());
  END IF;

  RAISE WARNING 'audit_carrying_cycles: % undeclared carrying cycle(s) present — every NEGATIVE access question on a record inside one is answered false by a bounded walk and logged (DD-263)', v_n;

  SELECT e.id INTO v_open_id FROM ops.system_error e
  WHERE e.kind = 'carrying_cycle_detected' AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (kind, error_type, source_app, source_feature, route, error_text, context)
    VALUES (
      'carrying_cycle_detected', 'CarryingCycle', 'database', 'reachability', 'db:platform.audit_carrying_cycles',
      format('%s undeclared carrying cycle(s) exist in platform.reachability: two or more records '
             'each contain the other through a carrying relation. Since DD-263 the access kernel '
             'answers false and warns instead of crashing, so nobody is locked out by a stack '
             'overflow — but a record inside a cycle can be DENIED access that a container would '
             'otherwise convey. THIS IS A DEFECT: break the '
             'loop (soft-delete one platform.associations row, or clear the parent_id that closes '
             'it), or declare the relation type allows_loops = true if the loop is deliberate. '
             'Evidence in context.sample.', v_n),
      jsonb_build_object('cycles', v_n, 'declared', v_declared, 'sample', v_sample, 'first_seen_at', now(),
                         'occurrences', 1, 'guard', 'carrying_cycle', 'severity', 'high')
    ) RETURNING id INTO v_error_id;
  ELSE
    v_error_id := v_open_id;
    SELECT COALESCE((e.context->>'occurrences')::int, 1) + 1 INTO v_occ
      FROM ops.system_error e WHERE e.id = v_error_id;
    UPDATE ops.system_error e
    SET context = e.context || jsonb_build_object('occurrences', v_occ, 'last_seen_at', now(),
                                                  'cycles', v_n, 'declared', v_declared, 'sample', v_sample)
    WHERE e.id = v_error_id;
  END IF;

  RETURN jsonb_build_object('cycles', v_n, 'declared', v_declared, 'sample', v_sample, 'incident_id', v_error_id,
                            'incident', CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
                            'checked_at', now());
END $function$
;

-- ── platform.heal_reachability_drift ──────────────────────────────
CREATE OR REPLACE FUNCTION platform.heal_reachability_drift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10min'
AS $function$
DECLARE
  v_before        bigint;
  v_by_kind       jsonb;
  v_sample        jsonb;
  v_rebuilt       bigint  := NULL;
  v_after         bigint  := NULL;
  v_containers    bigint;
  v_hit_containers bigint;
  v_hit_sample    jsonb;
  v_open_id       uuid;
  v_error_id      uuid;
  v_paused        boolean := false;
  v_knob_readable boolean := true;
  v_knob_error    text    := NULL;
  v_repair        text;            -- 'repaired' | 'failed' | 'skipped_paused'
  v_repair_error  text    := NULL;
  v_headline      text;
  v_occurrences   int     := 1;
BEGIN
  -- --- Measure -----------------------------------------------------------
  -- Measure-first so the disagreeing rows are captured BEFORE the rebuild
  -- destroys the evidence: once rebuild_reachability() truncates, nobody can
  -- reconstruct what was wrong, and "the cache was broken, we don't know how"
  -- is not a triageable defect. MATERIALIZED so the derivation runs once.
  WITH d AS MATERIALIZED (
    SELECT * FROM platform.reachability_drift()
  )
  SELECT
    (SELECT count(*) FROM d),
    COALESCE((SELECT jsonb_object_agg(k.disagreement, k.n)
              FROM (SELECT dd.disagreement, count(*) AS n
                    FROM d dd GROUP BY 1) k), '{}'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(s))
              FROM (SELECT * FROM d
                    ORDER BY disagreement, container_type, container_id,
                             item_type, item_id
                    LIMIT 25) s), '[]'::jsonb),
    (SELECT count(*) FROM (SELECT DISTINCT dd.container_type, dd.container_id FROM d dd) h),
    COALESCE((SELECT jsonb_agg(to_jsonb(c))
              FROM (SELECT DISTINCT dd.container_type, dd.container_id
                    FROM d dd ORDER BY 1, 2 LIMIT 50) c), '[]'::jsonb)
  INTO v_before, v_by_kind, v_sample, v_hit_containers, v_hit_sample;

  SELECT count(*) INTO v_containers
  FROM (SELECT DISTINCT ce.container_type, ce.container_id
        FROM platform.containment_edges ce) c;

  -- --- Clean: the expected nightly outcome. Nothing to heal, nothing to file.
  IF v_before = 0 THEN
    RETURN jsonb_build_object(
      'drift_before', 0,
      'healed',       false,
      'containers',   v_containers,
      'cached_rows',  (SELECT count(*) FROM platform.reachability),
      'checked_at',   now()
    );
  END IF;

  RAISE WARNING 'heal_reachability_drift: % disagreeing row(s) % across % container(s) — filing before touching anything',
    v_before, v_by_kind, v_hit_containers;

  -- --- FILE FIRST ---------------------------------------------------------
  -- DD-259: the incident row exists BEFORE any repair is attempted, so a repair
  -- that throws cannot take the evidence down with it. `kind` is the ONLY thing
  -- the triage ranker reads: aidream's admin_persistence `_patrol_priority()`
  -- buckets by kind string alone and 'reachability_drift_detected' is in its
  -- `urgent` set; an unregistered kind sorts last and is filtered OUT of any
  -- priority-scoped query. Neither `metadata` nor `source_app` is loaded by the
  -- collapsed list and `metadata` is not loaded by the detail view either, so
  -- every fact a human needs goes in `error_text` (always shown, part of the
  -- grouping signature) and `context` (shown on detail).
  -- One OPEN alarm at a time: a write path that stays broken must not
  -- manufacture a new ticket every night, but each recurrence is visible on the
  -- one that is open.
  SELECT e.id INTO v_open_id
  FROM ops.system_error e
  WHERE e.kind = 'reachability_drift_detected'
    AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (
      kind, error_type, source_app, source_feature, route, error_text, context
    ) VALUES (
      'reachability_drift_detected',
      'ReachabilityCacheDrift',
      'database',
      'reachability',
      'cron:reachability-drift-selfheal',
      format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        'across %s of %s containers. Repair not yet attempted — this row was filed FIRST. '
        'THIS IS A DEFECT: a trigger-maintained cache that needs healing means an '
        'association write path or trg_associations_reachability stopped working. '
        'Find the write path before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_hit_containers, v_containers
      ),
      jsonb_build_object(
        'drift_before',      v_before,
        'drift_by_kind',     v_by_kind,
        'drift_sample',      v_sample,
        'containers',        v_containers,
        'containers_hit',    v_hit_containers,
        'containers_sample', v_hit_sample,
        'repair',            'pending',
        'first_seen_at',     now(),
        'occurrences',       1,
        'guard',             'reachability',
        'severity',          'critical'
      )
    )
    RETURNING id INTO v_error_id;
  ELSE
    -- Already open: fold this firing into it rather than duplicating the ticket.
    -- `occurred_at` is deliberately NOT bumped. It stays at first-seen so the
    -- incident visibly AGES in the triage burn-down buckets. Recurrence is
    -- recorded as context.occurrences / last_seen_at.
    v_error_id := v_open_id;
    SELECT COALESCE((e.context->>'occurrences')::int, 1) + 1
      INTO v_occurrences
      FROM ops.system_error e WHERE e.id = v_error_id;
    UPDATE ops.system_error e
    SET context = e.context || jsonb_build_object(
          'occurrences',       v_occurrences,
          'last_seen_at',      now(),
          'drift_before',      v_before,
          'drift_by_kind',     v_by_kind,
          'drift_sample',      v_sample,
          'containers',        v_containers,
          'containers_hit',    v_hit_containers,
          'containers_sample', v_hit_sample,
          'repair',            'pending',
          'severity',          'critical'
        )
    WHERE e.id = v_error_id;
  END IF;

  -- --- Freeze check -------------------------------------------------------
  -- Read AFTER filing, so a knob that cannot be read still leaves an incident
  -- behind. knob_resolve RAISES on an unseeded knob by design (a missing knob
  -- must never fall back to a hard-coded value); here that would mean skipping
  -- the repair people's access depends on, so the fallback is "repair anyway"
  -- and it announces itself in the row and in the receipt.
  BEGIN
    v_paused := COALESCE(
      (platform.knob_resolve('platform.reachability', 'selfheal_pause', NULL) #>> '{}')::boolean,
      false);
  EXCEPTION WHEN OTHERS THEN
    v_knob_readable := false;
    v_knob_error    := SQLSTATE || ': ' || SQLERRM;
    v_paused        := false;
    RAISE WARNING 'heal_reachability_drift: could not read platform.reachability.selfheal_pause (%) — repairing anyway; re-seed the knob',
      v_knob_error;
  END;

  IF v_paused THEN
    -- --- Repair frozen ----------------------------------------------------
    v_repair := 'skipped_paused';
    RAISE WARNING 'heal_reachability_drift: repair SKIPPED — platform.reachability.selfheal_pause is true; % row(s) left wrong', v_before;
  ELSE
    -- --- Heal -------------------------------------------------------------
    -- The ONLY mutation path. Takes its own advisory xact lock internally.
    -- Wrapped so a failure amends the filed row instead of rolling it back.
    BEGIN
      v_rebuilt := platform.rebuild_reachability();
      -- Re-verify: proves the heal actually worked. A rebuild that leaves drift
      -- behind means the derivation disagrees with itself (non-determinism, or
      -- a graph mutating mid-run) — strictly worse news than the original drift.
      SELECT count(*) INTO v_after FROM platform.reachability_drift();
      v_repair := 'repaired';
    EXCEPTION WHEN OTHERS THEN
      v_repair       := 'failed';
      v_repair_error := SQLSTATE || ': ' || SQLERRM;
      RAISE WARNING 'heal_reachability_drift: rebuild FAILED (%) — incident % stands with the evidence',
        v_repair_error, v_error_id;
    END;
  END IF;

  -- --- Amend the filed row with what actually happened --------------------
  v_headline := CASE v_repair
    WHEN 'repaired' THEN
      format('The cache was self-healed by platform.rebuild_reachability() (%s rows rebuilt) and re-checked: %s.',
             v_rebuilt,
             CASE WHEN v_after = 0 THEN 'clean'
                  ELSE format('STILL %s DISAGREEING ROW(S) — HEAL FAILED', v_after) END)
    WHEN 'skipped_paused' THEN
      'THE REPAIR WAS SKIPPED: the knob platform.reachability.selfheal_pause is ON, so the cache is knowingly still wrong and people may be seeing access they were not granted (or missing access they were). Turn the knob back off — platform.feature_knob_set(''platform.reachability'',''selfheal_pause'',''false'') — or run public.admin_heal_reachability_drift() once the cutover that set it is finished.'
    ELSE
      format('THE REPAIR FAILED and the cache is still wrong: %s. Run public.admin_heal_reachability_drift() after fixing the cause.',
             v_repair_error)
  END;

  UPDATE ops.system_error e
  SET error_text = format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        'across %s of %s containers. %s '
        'THIS IS A DEFECT: a trigger-maintained cache that needs healing means an '
        'association write path or trg_associations_reachability stopped working. '
        'Find the write path before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_hit_containers, v_containers, v_headline),
      context = e.context || jsonb_build_object(
        'repair',          v_repair,
        'repair_error',    v_repair_error,
        'rebuilt_rows',    v_rebuilt,
        'drift_after',     v_after,
        'heal_confirmed',  (v_repair = 'repaired' AND v_after = 0),
        'selfheal_paused', v_paused,
        'knob_readable',   v_knob_readable,
        'knob_error',      v_knob_error,
        'severity',        CASE WHEN v_repair = 'repaired' AND v_after = 0
                                THEN 'high' ELSE 'critical' END
      )
  WHERE e.id = v_error_id;

  IF v_repair = 'repaired' AND v_after > 0 THEN
    RAISE WARNING 'heal_reachability_drift: rebuild did NOT converge — % row(s) still disagree', v_after;
  END IF;

  RETURN jsonb_build_object(
    'drift_before',      v_before,
    'drift_by_kind',     v_by_kind,
    'containers',        v_containers,
    'containers_hit',    v_hit_containers,
    'incident_id',       v_error_id,
    'incident',          CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
    'repair',            v_repair,
    'repair_error',      v_repair_error,
    'healed',            (v_repair = 'repaired'),
    'rebuilt_rows',      v_rebuilt,
    'drift_after',       v_after,
    'heal_confirmed',    (v_repair = 'repaired' AND v_after = 0),
    'selfheal_paused',   v_paused,
    'knob_readable',     v_knob_readable,
    'knob_error',        v_knob_error,
    'checked_at',        now()
  );
END $function$
;

-- ── The access decision these five owe, IN DATA ──────────────────────────────
-- `platform._provision_shape_settled` refuses at COMMIT when a SECURITY DEFINER
-- function reaches it with no declared access decision. All five predate that
-- rule and carried none, so replacing a body is the moment the debt comes due
-- (measured: this file failed exactly that way on its first apply, 2026-09-20).
-- Every one of them is a maintenance lane nothing outside the server calls: the
-- live grants are `postgres` and, for three of them, `service_role` — no `anon`,
-- no `authenticated` — and `platform.heal_reachability_drift` already has a
-- separate `public.admin_heal_reachability_drift()` wrapper for the client side.
-- So each is declared server-only: signed_in_callers false, anonymous_callers
-- false, and a `non_client_lane` sentence naming who does call it.
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers
)
select v.schema_name, v.function_name,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       v.reason,
       'db_maintenance_errors_name_their_feature.sql',
       v.non_client_lane, false, false
  from (values
    ('history', 'ensure_row_version_partitions',
     'Takes no entity id at all — one integer horizon in months. It creates the coming row_versions partitions and reconciles the confidential boundary on every direct child, then files a system_error naming the row_history feature when the catch-all partition has been used. Nothing about it reads or returns a caller''s data, so there is nothing to check an argument against; a null horizon takes the function''s own default of 18.',
     'server_only: the partition provisioner. Run by the scheduled maintenance lane and by an operator repairing a provisioning gap; no client path exists and none should, because a client calling it would do DDL as postgres.'),
    ('hr', 'heal_grant_drift',
     'Takes no arguments, so there is no entity id to check. It re-derives every HR grant from live employment and files a system_error naming the hr feature with before/after evidence. It reads and rewrites derived grants across EVERY employer, which is exactly why no tenant-scoped caller may reach it.',
     'server_only: the HR grant self-heal. Run by the nightly HR maintenance lane and by an operator after a derivation change; it spans employers by design, so a client call could never be scoped to one organization.'),
    ('hr', 'raise_compliance_exception',
     'p_organization_id is the organization the exception BELONGS to and is written straight onto the ops.system_error row; it is not checked against the caller, because there is no caller identity on this lane — the function is reached only from HR calculation code already running inside a chosen organization. The rule/jurisdiction arguments are evidence fields, not ids that grant anything. A null organization is a not-null violation on the error row, which is the intended loud failure.',
     'server_only: the HR compliance evidence lane. Called by hr calculation paths while SPEC section 16''s hr.compliance_exception table is still owed; when that table lands, only this body changes and no call site moves.'),
    ('platform', 'audit_carrying_cycles',
     'Takes no arguments, so there is no entity id to check. It counts undeclared carrying cycles in platform.reachability and files or folds one open system_error naming the reachability feature. It reads the containment graph for the whole database, which is why it is not scoped to, or reachable by, one tenant.',
     'server_only: the carrying-cycle audit. Run by the scheduled access-graph maintenance lane; its whole job is a database-wide read of the containment graph, so there is no tenant a client call could be scoped to.'),
    ('platform', 'heal_reachability_drift',
     'Takes no arguments, so there is no entity id to check. It measures platform.reachability against a fresh derivation, files the incident FIRST naming the reachability feature, then rebuilds the cache and re-verifies. It rewrites the access cache for every container in the database.',
     'server_only: the reachability self-heal. Run by the nightly cron lane; the client-facing path is the separate public.admin_heal_reachability_drift() wrapper, which is where an admin''s call is authorized.')
  ) as v(schema_name, function_name, reason, non_client_lane)
  join pg_proc p on p.proname = v.function_name
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = v.schema_name
 where not exists (
   select 1 from platform.client_callable_door d
    where d.schema_name = v.schema_name and d.function_name = v.function_name
      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

-- Proof, in the same transaction: all six name both halves, and no function in
-- this database still inserts an error row without a feature.
do $$
declare
  v_bad text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname)
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prokind in ('f', 'p')
     and p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+ops\.system_error'
     and p.prosrc !~* 'source_feature';
  if v_bad is not null then
    raise exception
      'these database functions still insert an error row with no source_feature: %. An error that names only its app cannot be filtered by feature.', v_bad;
  end if;
end $$;
