-- lane: access-ladder T-35g — every database writer of ops.system_error goes through its one door.
-- based-on: platform.kernel_equivalence_expected() 495f5c155ff3cbe9b7c2bba7fabcbe5096cea12f314244d90c2ffb05100e1d66
-- based-on: billing.seed_prelaunch_complimentary() 4947431397ee0c275a7f83bada00c8096e7e3c88a3c81c3961d0bc9839a46b2a
-- based-on: communication._meet_audience_after_end() a8db9f41c68ea521d0b1adeec29cbe452551b7e7b651305ebc84e4a6e1629f95
-- based-on: communication._meet_audience_after_recording() 536612a92207469e7fa0e99dd79d8d56de9b818483bd8e392b9b2668a841078e
-- based-on: communication.report_dropped_sms_part(text, uuid, uuid, text, integer, integer, text, text, jsonb) d3bb7608b1e030a0aa172bc98cdf373340ef899e4b03c9c8bdc82c5e7d8c2e03
-- based-on: communication.sms_notification_gate(uuid, timestamp with time zone) 95f0e2cd33a93d3e2044b081c4b96a31e215700d17b869afb59a9638340e9f35
-- based-on: context._follow_to_the_copy() 7635204a69e42b4d198355c0b8a9b806f97c85dd9b142847f5a52d30b62b17e3
-- based-on: custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) f4a1deb79f89d90788df1d4550fa3c981f5c519034250a137afc8bc249b309e2
-- based-on: history.ensure_row_version_partitions(integer) a9fc7df9346036477526f8abf422ec2323eb0486a42f97de458d59e5bf8123bf
-- based-on: hr._wf_grant_step(uuid) 9994e49e81b3323abe8c3620b4c75a4013e4c495f6228bd5f4cac24da7475108
-- based-on: hr.heal_grant_drift() 5d76c81d64a9d6f91038f6e53c48e93e856c70641d6dac303abf24a5a131c639
-- based-on: hr.raise_compliance_exception(uuid, text, uuid, integer, text, text, text, jsonb) a8b8963032917519639ad5991c53c2c5bcff9973154b0296f84a47dd4c7a5bc3
-- based-on: iam._share_with_audience(text, uuid, permission_level, uuid, text[], text) f2e541cfb2cd8b010a8968c321ca1eb9dcef613e19c2fdbbcddfc1d06a510928
-- based-on: platform._comments_announce_delete() 7ec940d15da4a1cb458501a9cb03e27df884f7348b21220201652859bffac61f
-- based-on: platform._context_tag_follow_to_the_copy() 54a58f704c13241fcdf79dc0cd882cfe624d9e4a563179718415df7946f2b48a
-- based-on: platform._kernel_answers_after_a_registry_change() d2f6d6b7eaa46f1044db207da7c36f70986fc6155c42daaaa783f15f02cb6162
-- based-on: platform.audit_carrying_cycles() a0e7b83f7d59c3cd3b83101453fca1289a4187e0b3436f14767e707f2110c40a
-- based-on: platform.heal_reachability_drift() 56212879014b7c1c6ca16de4f6f1fb9782bd0bfd079abda76139261e350e28d5
--
-- Owner ruling (access-ladder coordinator, 2026-09-28): every writer of ops.system_error goes through ONE
-- door, ops.record_system_error (T-35f), which names the system organization as the row's owner and keeps
-- where the error happened in occurred_in_organization_id. T-35f moved the three writers that ran as the
-- signed-in person and public.log_client_error; this moves the remaining 17 database functions. Each
-- body is its live body with only its `insert into ops.system_error (...) values (...)` statement(s)
-- replaced by the door call carrying the same columns and values.
set local lock_timeout = '2s';

-- ===== history.ensure_row_version_partitions(integer)
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
        perform ops.record_system_error(jsonb_build_object(
      'organization_id', '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
      'kind', 'row_versions_default_partition_used',
      'error_type', 'PartitionProvisioningGap',
      'error_text', format('history.row_versions_default holds %s row(s): the monthly partition provisioner did not run in time. User writes were saved, but version history landed in the catch-all. Run history.ensure_row_version_partitions().',default_rows),
      'context', jsonb_build_object('default_rows',default_rows,'first_seen_at',now()),
      'source_app', 'database',
      'source_feature', 'row_history'));
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
END $function$;

-- ===== platform._kernel_answers_after_a_registry_change()
CREATE OR REPLACE FUNCTION platform._kernel_answers_after_a_registry_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_cols text[] := array['token', 'schema_name', 'table_name', 'rls_variant', 'is_active', 'data_class', 'client_anonymous_public_read'];
  v_pre text := current_setting('platform.kernel_registry_pre', true);
  v_prej jsonb;
  v_before jsonb; v_after jsonb; v_exp jsonb; v_new_exp jsonb;
  v_moved jsonb; v_moved_keys text[];
  v_changes text[];
  v_ruling text; v_target text; v_msg text;
  v_fp text := iam.entity_read_kernel_expected();
  v_org uuid := (select so.organization_id from iam.system_orgs so where so.key = 'system');
  v_uid uuid := auth.uid();
  v_rid uuid; v_eid uuid;
begin
  if coalesce(v_pre, '') = '' then return null; end if;
  v_prej := v_pre::jsonb;
  if (v_prej->>'depth')::int is distinct from pg_trigger_depth() then return null; end if;
  perform set_config('platform.kernel_registry_pre', '', true);

  -- What this statement changed, in words.
  if tg_table_name = 'entity_types' then
    if tg_op = 'UPDATE' then
      select array_agg(x.line order by x.line) into v_changes from (
        select format('platform.entity_types.%s %s', n.token,
                 (select string_agg(case when c = 'data_class' then coalesce(oj->>c, '(none)') || ' → ' || coalesce(nj->>c, '(none)')
                                         else c || ' ' || coalesce(oj->>c, '(none)') || ' → ' || coalesce(nj->>c, '(none)') end,
                                    '; ' order by ord)
                    from unnest(c_cols) with ordinality u(c, ord) where (oj->c) is distinct from (nj->c))) as line
          from kernel_old o join kernel_new n on n.id = o.id
          cross join lateral (select to_jsonb(o) oj, to_jsonb(n) nj) j
         where exists (select 1 from unnest(c_cols) c where (j.oj->c) is distinct from (j.nj->c))) x;
    elsif tg_op = 'INSERT' then
      select array_agg(format('platform.entity_types.%s (none) → %s', n.token, coalesce(n.data_class::text, '(no class)')) order by n.token)
        into v_changes from kernel_new n;
    else
      select array_agg(format('platform.entity_types.%s %s → (removed)', o.token, coalesce(o.data_class::text, '(no class)')) order by o.token)
        into v_changes from kernel_old o;
    end if;
  else
    if tg_op in ('UPDATE', 'DELETE') then
      select array_agg(format('platform.entity_relationships.%s→%s via %s (%s) removed', o.child_type, o.parent_type, o.fk_column, o.kind))
        into v_changes from kernel_old o
       where tg_op = 'DELETE' or not exists (select 1 from kernel_new n where (n.child_type, n.parent_type, n.fk_column, n.kind)
                                                                            = (o.child_type, o.parent_type, o.fk_column, o.kind));
    end if;
    if tg_op in ('UPDATE', 'INSERT') then
      v_changes := coalesce(v_changes, '{}') || coalesce((
        select array_agg(format('platform.entity_relationships.%s→%s via %s (%s) added', n.child_type, n.parent_type, n.fk_column, n.kind))
          from kernel_new n
         where tg_op = 'INSERT' or not exists (select 1 from kernel_old o where (o.child_type, o.parent_type, o.fk_column, o.kind)
                                                                              = (n.child_type, n.parent_type, n.fk_column, n.kind))), '{}');
    end if;
  end if;
  v_changes := coalesce(v_changes, '{}');
  v_target := 'platform.' || tg_table_name;

  v_before := v_prej->'live';
  v_after  := platform.kernel_equivalence_answers();

  if v_before->>'error' is not null or v_after->>'error' is not null then
    v_msg := format('A registry change (%s: %s) touched a token the access-kernel equivalence fixture reaches, and the fixture '
                    'could not be built to compare its answers (before: %s; after: %s). Nothing was patched: if the change moved an '
                    'answer, the provisioner''s heal will refuse the next stale-kernel table request with the evidence. '
                    'Build the fixture by hand (select platform.kernel_equivalence_check()) and say what broke it.',
                    v_target, coalesce(nullif(array_to_string(v_changes, '; '), ''), '(no row named)'),
                    coalesce(v_before->>'error', 'ok'), coalesce(v_after->>'error', 'ok'));
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'kernel_answers_moved_by_registry',
      'error_type', 'registry.not_compared',
      'error_text', v_msg,
      'source_app', 'database',
      'source_feature', 'access-kernel',
      'route', v_target,
      'organization_id', v_org,
      'user_id', v_uid,
      'created_by', v_uid,
      'context', jsonb_build_object('table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes),
                               'before_error', v_before->>'error', 'after_error', v_after->>'error', 'session_role', current_user)));
    raise warning '%', v_msg;
    return null;
  end if;

  select jsonb_object_agg(k, jsonb_build_object('from', v_before->'answers'->k, 'to', v_after->'answers'->k) order by k),
         array_agg(k order by k)
    into v_moved, v_moved_keys
    from (select jsonb_object_keys(v_before->'answers') k union select jsonb_object_keys(v_after->'answers')) keys
   where (v_before->'answers'->k) is distinct from (v_after->'answers'->k);
  if v_moved_keys is null then return null; end if;   -- identical: nothing to record

  -- Patch ONLY the moved keys; every other recorded answer keeps its value (never launder).
  v_exp := platform.kernel_equivalence_expected();
  v_new_exp := jsonb_set(v_exp, '{answers}',
                 (coalesce(v_exp->'answers', '{}'::jsonb) - v_moved_keys)
                 || coalesce((select jsonb_object_agg(k, v_after->'answers'->k) from unnest(v_moved_keys) k
                               where v_after->'answers' ? k), '{}'::jsonb));
  execute format('CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE AS %L',
                 E'\n  SELECT ' || quote_literal(v_new_exp::text) || E'::jsonb\n');

  v_ruling := 'registry change: ' || coalesce(nullif(array_to_string(v_changes, '; '), ''), v_target || ' (row not named)');
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_fp, coalesce(v_fp, iam.entity_read_kernel_fingerprint()), '{}'::text[], v_ruling, v_after->>'version',
          jsonb_build_object('kind', 'registry_change', 'table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes),
                             'moved', v_moved, 'moved_count', cardinality(v_moved_keys),
                             'answers', (select count(*) from jsonb_object_keys(v_after->'answers')),
                             'ms_after', v_after->'ms'),
          'registry change / ' || v_target || ' / ' || current_user, v_target)
  returning id into v_rid;

  v_msg := format('A registry change moved %s access-kernel equivalence answer(s) with no kernel body change: %s. '
                  'Moved: %s. The recording (platform.kernel_equivalence_expected, fixture %s) was patched in the same '
                  'transaction for exactly those answers (platform.kernel_fingerprint_record %s), so the provisioner''s heal '
                  'will not refuse on them. Review: a level move is the access ladder''s to make (common-docs/policies/access-ladder.md); '
                  'if this change was not meant to move who can reach what, revert it.',
                  cardinality(v_moved_keys), v_ruling,
                  (select string_agg(k || ' ' || coalesce(v_moved->k->>'from', 'absent') || ' → ' || coalesce(v_moved->k->>'to', 'absent'), ', ')
                     from (select k from unnest(v_moved_keys) k limit 12) s),
                  v_after->>'version', v_rid);
  v_eid := ops.record_system_error(jsonb_build_object(
      'kind', 'kernel_answers_moved_by_registry',
      'error_type', 'registry.level_moved',
      'error_text', v_msg,
      'source_app', 'database',
      'source_feature', 'access-kernel',
      'route', v_target,
      'organization_id', v_org,
      'user_id', v_uid,
      'created_by', v_uid,
      'context', jsonb_build_object('table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes), 'ruling', v_ruling,
                             'moved', v_moved, 'record_id', v_rid, 'fixture_version', v_after->>'version',
                             'kernel_fingerprint', v_fp, 'session_role', current_user)));
  update platform.kernel_fingerprint_record set system_error_id = v_eid where id = v_rid;
  raise warning '%', v_msg;
  return null;
end
$function$;

-- ===== hr.heal_grant_drift()
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
      perform ops.record_system_error(jsonb_build_object(
        'kind', 'hr_grant_drift_detected',
        'error_text', format('HR derived-grant drift: %s rows', v_count),
        'context', jsonb_build_object('before', coalesce(v_before,'{}'::jsonb),
                                      'after', coalesce(v_after,'{}'::jsonb),
                                      'sample', v_sample),
        'organization_id', v_org,
        'source_app', 'database', 'source_feature', 'hr'));
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
$function$;

-- ===== hr.raise_compliance_exception(uuid,text,uuid,integer,text,text,text,jsonb)
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
  v_id := ops.record_system_error(jsonb_build_object(
      'organization_id', p_organization_id,
      'kind', 'hr_compliance_exception_pending',
      'error_type', p_code,
      'error_text', p_message,
      'context', jsonb_build_object('jurisdiction_key', p_jurisdiction_key, 'rule_id', p_rule_id,
                             'rule_version', p_rule_version, 'class', p_class,
                             'org_config_ref', p_org_config_ref,
                             'owed_to', 'SPEC-DOMAIN-WIDE / L9 hr.compliance_exception'),
      'source_app', 'database',
      'source_feature', 'hr'));
  return v_id;
end
$function$;

-- ===== platform.audit_carrying_cycles()
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
    -- organization_id: ops.system_error rows filed here are PLATFORM-GENERATED
    -- (a database self-audit job, no acting user, no org context). Belongs to
    -- the ratified platform tenant via public.system_org_id('system'). Never
    -- defaulted or resolver-chosen (Data Doctrine, 2026-09-19).
    v_error_id := ops.record_system_error(jsonb_build_object(
      'kind', 'carrying_cycle_detected',
      'error_type', 'CarryingCycle',
      'source_app', 'database',
      'source_feature', 'reachability',
      'route', 'db:platform.audit_carrying_cycles',
      'error_text', format('%s undeclared carrying cycle(s) exist in platform.reachability: two or more records '
             'each contain the other through a carrying relation. Since DD-263 the access kernel '
             'answers false and warns instead of crashing, so nobody is locked out by a stack '
             'overflow — but a record inside a cycle can be DENIED access that a container would '
             'otherwise convey. THIS IS A DEFECT: break the '
             'loop (soft-delete one platform.associations row, or clear the parent_id that closes '
             'it), or declare the relation type allows_loops = true if the loop is deliberate. '
             'Evidence in context.sample.', v_n),
      'context', jsonb_build_object('cycles', v_n, 'declared', v_declared, 'sample', v_sample, 'first_seen_at', now(),
                         'occurrences', 1, 'guard', 'carrying_cycle', 'severity', 'high'),
      'organization_id', public.system_org_id('system')));
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
END $function$;

-- ===== platform.heal_reachability_drift()
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
    -- organization_id: ops.system_error rows filed here are PLATFORM-GENERATED
    -- (a database self-audit job, no acting user, no org context). Belongs to
    -- the ratified platform tenant via public.system_org_id('system'). Never
    -- defaulted or resolver-chosen (Data Doctrine, 2026-09-19).
    v_error_id := ops.record_system_error(jsonb_build_object(
      'kind', 'reachability_drift_detected',
      'error_type', 'ReachabilityCacheDrift',
      'source_app', 'database',
      'source_feature', 'reachability',
      'route', 'cron:reachability-drift-selfheal',
      'error_text', format(
        'platform.reachability disagreed with a fresh derivation on %s row(s) %s '
        'across %s of %s containers. Repair not yet attempted — this row was filed FIRST. '
        'THIS IS A DEFECT: a trigger-maintained cache that needs healing means an '
        'association write path or trg_associations_reachability stopped working. '
        'Find the write path before resolving. Evidence sample in context.drift_sample.',
        v_before, v_by_kind, v_hit_containers, v_containers
      ),
      'context', jsonb_build_object(
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
      ),
      'organization_id', public.system_org_id('system')));
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
END $function$;

-- ===== communication.report_dropped_sms_part(text,uuid,uuid,text,integer,integer,text,text,jsonb)
CREATE OR REPLACE FUNCTION communication.report_dropped_sms_part(p_producer text, p_organization_id uuid, p_user_id uuid, p_idempotency_key text, p_part_index integer, p_part_count integer, p_intended_body text, p_existing_body text, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_text text;
begin
  v_text :=
    'AN SMS REPLY PART WAS DROPPED. Part ' || p_part_index || ' of ' ||
    coalesce(p_part_count, p_part_index) || ' could not be queued because the '
    'idempotency key ' || p_idempotency_key || ' is already held by a message '
    'that says something DIFFERENT, so the person receives an answer with a '
    'hole in it and nothing else would have said so. Intended: "' ||
    pg_catalog.left(coalesce(p_intended_body, ''), 160) || '". Already there: "' ||
    coalesce(pg_catalog.left(p_existing_body, 160), '<no row — the conflicting '
    'message is not readable from here>') || '". Remedy: read the thread, decide '
    'whether the person still needs the missing words, and send them through the '
    'staff door (communication.enqueue_sms_staff_message, reason ''resume'') — '
    'this path will not re-queue it under a fresh key, because minting keys on a '
    'mismatch is how a re-drive double-texts a real person.';

  raise warning '%', v_text;

  if p_organization_id is not null then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'sms_reply_part_dropped',
      'user_id', p_user_id,
      'error_type', 'sms_reply_part_dropped',
      'error_text', v_text,
      'source_app', 'aidream',
      'source_feature', p_producer,
      'organization_id', p_organization_id,
      'occurred_at', pg_catalog.now(),
      'context', coalesce(p_context, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
             'producer', p_producer,
             'idempotency_key', p_idempotency_key,
             'part_index', p_part_index,
             'part_count', p_part_count
           )));
  end if;
exception
  when others then
    raise warning
      'communication.report_dropped_sms_part could not file the dropped part % (%); '
      'the warning above is the record.', p_idempotency_key, sqlerrm;
end;
$function$;

-- ===== communication.sms_notification_gate(uuid,timestamp with time zone)
CREATE OR REPLACE FUNCTION communication.sms_notification_gate(p_notification_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(decision text, refusal text, defer_until timestamp with time zone, resolved_timezone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n         communication.notification%rowtype;
  v_number    text;
  v_tz        text;
  v_tz_src    text;
  v_windows   jsonb;
  v_w         record;
  v_config    jsonb;
  v_exempt    boolean;
  v_mandatory boolean;
  v_sup       timestamptz;
  v_uns       timestamptz;
  v_dnc       text;
  v_qh_start  time;
  v_qh_end    time;
  v_local_now timestamp;
  v_probe     timestamp;
  v_probe_t   time;
  v_end_at    timestamp;
  v_moved     boolean;
  v_i         integer;
  v_max_hour  integer;
  v_max_day   integer;
  v_count     integer;
  v_day_start timestamptz;
  v_day_end   timestamptz;
begin
  select * into v_n from communication.notification where id = p_notification_id;
  if not found then
    return query select 'skip'::text, 'unknown_notification'::text, null::timestamptz, null::text;
    return;
  end if;

  v_number := nullif(btrim(coalesce(v_n.to_address, '')), '');
  if v_number is null then
    return query select 'skip'::text, 'no_address'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- SUPPRESSION (terminal)
  -- crm.contact_medium is THE ONE suppression store. See the header.
  select cm.suppressed_at, cm.unsubscribed_at, cm.dnc_state
    into v_sup, v_uns, v_dnc
    from crm.contact_medium cm
   where cm.organization_id = v_n.organization_id
     and cm.channel = 'phone'
     and cm.value_key = v_number
     and cm.deleted_at is null
   order by cm.updated_at desc
   limit 1;
  if v_uns is not null then
    return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
    return;
  elsif v_sup is not null then
    return query select 'skip'::text, 'suppressed'::text, null::timestamptz, null::text;
    return;
  elsif v_dnc = 'listed' then
    return query select 'skip'::text, 'dnc'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- CONSENT (terminal)
  -- Keyed (phone_number, consent_type) GLOBALLY — §3.5: consent is per number, not per org.
  -- Personal Staff is its own program with its own consent row (consent_type 'ai_agent').
  -- A number with no ai_agent row at all enrolled before the split and keeps its legacy
  -- notifications consent; an ai_agent row, once present, is the only answer.
  if v_n.event_key like 'personal_staff.%' then
    if exists (
      select 1 from communication.sms_consent c
       where c.phone_number = v_number
         and c.consent_type in ('all', 'ai_agent')
         and c.status = 'opted_out'
         and c.deleted_at is null
    ) then
      return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
      return;
    end if;
    if not exists (
      select 1 from communication.sms_consent c
       where c.phone_number = v_number
         and c.consent_type = 'ai_agent'
         and c.status = 'opted_in'
         and c.deleted_at is null
    ) and (
      exists (
        select 1 from communication.sms_consent c
         where c.phone_number = v_number
           and c.consent_type = 'ai_agent'
           and c.deleted_at is null
      ) or not exists (
        select 1 from communication.sms_consent c
         where c.phone_number = v_number
           and c.consent_type in ('all', 'notifications')
           and c.status = 'opted_in'
           and c.deleted_at is null
      )
    ) then
      return query select 'skip'::text, 'not_consented'::text, null::timestamptz, null::text;
      return;
    end if;
  elsif exists (
    select 1 from communication.sms_consent c
     where c.phone_number = v_number
       and c.consent_type in ('all', 'notifications')
       and c.status = 'opted_out'
       and c.deleted_at is null
  ) then
    return query select 'skip'::text, 'opted_out'::text, null::timestamptz, null::text;
    return;
  elsif not exists (
    select 1 from communication.sms_consent c
     where c.phone_number = v_number
       and c.consent_type in ('all', 'notifications')
       and c.status = 'opted_in'
       and c.deleted_at is null
  ) then
    -- "Employment is not consent." Absent or pending is a terminal skip with a reason.
    return query select 'skip'::text, 'not_consented'::text, null::timestamptz, null::text;
    return;
  end if;

  ---------------------------------------------------------------- the event's own flags
  select t.config into v_config
    from communication.notification_event_type t
   where t.event_key = v_n.event_key;
  v_exempt    := coalesce((v_config ->> 'quiet_hours_exempt')::boolean, false);
  v_mandatory := coalesce((v_config ->> 'mandatory')::boolean, false);

  ---------------------------------------------------------------- THE PERSON'S WINDOW
  -- 0998: the quiet window and the clock it is read on come from the PERSON, through
  -- the one ladder. What used to be inlined here could only see the org-scoped row.
  select w.timezone, w.timezone_source, w.quiet_windows
    into v_tz, v_tz_src, v_windows
    from communication.person_notification_window(
           v_n.recipient_user_id, v_n.organization_id, 'sms') w;

  if v_tz is null then
    -- The LOUD last resort. UTC is a guess about somebody's night, so it says so.
    v_tz := 'UTC';
    if not exists (
      select 1 from ops.system_error e
       where e.kind = 'notification_timezone_unknown'
         and e.organization_id = v_n.organization_id
         and e.user_id is not distinct from v_n.recipient_user_id
         and e.occurred_at > p_now - interval '24 hours'
    ) then
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'notification_timezone_unknown',
      'user_id', v_n.recipient_user_id,
      'error_type', 'quiet_hours_timezone_fallback',
      'error_text', 'No timezone is known for this recipient, so their quiet hours were judged in UTC — '
        'a text can be held back in the middle of their afternoon, or land in the middle of '
        'their night. Remedy: ask the person for their timezone once (it belongs on '
        'communication.sms_notification_preferences.timezone at enrollment), or set the '
        'organization default (knob communication.notifications / default_timezone).',
      'source_app', 'aidream',
      'source_feature', 'communication.sms_notification_gate',
      'organization_id', v_n.organization_id,
      'occurred_at', p_now,
      'context', jsonb_build_object('notification_id', v_n.id, 'event_key', v_n.event_key,
                           'channel', 'sms', 'timezone_source', v_tz_src)));
    end if;
  end if;

  begin
    v_local_now := p_now at time zone v_tz;
  exception when others then
    v_tz := 'UTC';
    v_local_now := p_now at time zone v_tz;
  end;

  ---------------------------------------------------------------- QUIET HOURS (defer)
  -- The UNION of every window this person is owed, walked forward until no window
  -- contains the probe any more: an organization can only ever ADD quiet time.
  v_probe := v_local_now;
  if not v_exempt and jsonb_array_length(coalesce(v_windows, '[]'::jsonb)) > 0 then
    for v_i in 1..4 loop
      v_moved := false;
      for v_w in select value from jsonb_array_elements(v_windows) loop
        v_qh_start := (v_w.value ->> 'start')::time;
        v_qh_end   := (v_w.value ->> 'end')::time;
        if v_qh_start = v_qh_end then
          continue;
        end if;
        v_probe_t := v_probe::time;
        if (case
              when v_qh_start > v_qh_end then v_probe_t >= v_qh_start or v_probe_t < v_qh_end
              else v_probe_t >= v_qh_start and v_probe_t < v_qh_end
            end) then
          if v_qh_start > v_qh_end and v_probe_t >= v_qh_start then
            v_end_at := date_trunc('day', v_probe) + interval '1 day' + v_qh_end;
          else
            v_end_at := date_trunc('day', v_probe) + v_qh_end;
          end if;
          if v_end_at > v_probe then
            v_probe := v_end_at;
            v_moved := true;
          end if;
        end if;
      end loop;
      exit when not v_moved;
    end loop;
  end if;

  if v_probe > v_local_now then
    -- Jitter, so a whole shift is not texted in the same second (§3.4).
    return query select 'defer'::text, 'quiet_hours'::text,
                        (v_probe at time zone v_tz)
                          + make_interval(secs => floor(random() * 900)::integer),
                        v_tz;
    return;
  end if;

  ---------------------------------------------------------------- VOLUME CAPS (defer)
  -- 1016: how much we may say to this person comes from the PERSON, through the one
  -- ladder, exactly as the night does. What used to be inlined here could only see the
  -- org-scoped row, so the 10/50 on somebody's own enrollment was never read.
  select c.max_per_hour, c.max_per_day
    into v_max_hour, v_max_day
    from communication.person_notification_caps(
           v_n.recipient_user_id, v_n.organization_id, 'sms') c;

  if not v_mandatory and not v_exempt then
    select count(*) into v_count
      from communication.sms_messages m
     where m.organization_id = v_n.organization_id
       and m.to_number = v_number
       and m.direction = 'outbound'
       and m.created_at >= p_now - interval '1 hour'
       and m.deleted_at is null;
    if v_count >= v_max_hour then
      return query select 'defer'::text, 'hourly_rate_limit'::text,
                          date_trunc('hour', p_now) + interval '1 hour'
                            + make_interval(secs => floor(random() * 300)::integer),
                          v_tz;
      return;
    end if;

    v_day_start := date_trunc('day', v_local_now) at time zone v_tz;
    v_day_end   := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_tz;
    select count(*) into v_count
      from communication.sms_messages m
     where m.organization_id = v_n.organization_id
       and m.to_number = v_number
       and m.direction = 'outbound'
       and m.created_at >= v_day_start
       and m.created_at <  v_day_end
       and m.deleted_at is null;
    if v_count >= v_max_day then
      return query select 'defer'::text, 'daily_rate_limit'::text,
                          v_day_end + make_interval(secs => floor(random() * 900)::integer),
                          v_tz;
      return;
    end if;
  end if;

  return query select 'send'::text, null::text, null::timestamptz, v_tz;
end
$function$;

-- ===== billing.seed_prelaunch_complimentary()
CREATE OR REPLACE FUNCTION billing.seed_prelaunch_complimentary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
  v_org_id uuid;
  v_org_note text;
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

begin
  perform billing.repair_prelaunch_complimentary_grant(new.id);
  EXIT provisioning_body;
exception when others then
  -- Loud but never signup-blocking: a missed grant is recoverable, a failed
  -- signup is not.
  select o.id into v_org_id from iam.organizations o where o.created_by = new.id limit 1;
  if v_org_id is null then
    v_org_note := 'no organization had resolved for this user at grant time';
  else
    v_org_note := 'organization ' || v_org_id::text;
  end if;

  perform ops.record_system_error(jsonb_build_object(
      'organization_id', coalesce(v_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid),
      'user_id', new.id,
      'kind', 'prelaunch_complimentary_grant_failed',
      'error_type', sqlstate,
      'error_text', format(
      'billing.seed_prelaunch_complimentary failed for user %s (%s): %s (%s). Signup succeeded '
      || 'without the pre-launch complimentary Pro grant. Remedy: run '
      || 'select billing.repair_prelaunch_complimentary_grant(%L); to grant it — the function is '
      || 'idempotent and safe to re-run.',
      new.id, v_org_note, sqlerrm, sqlstate, new.id
    ),
      'context', jsonb_build_object(
      'user_id', new.id,
      'organization_id', v_org_id,
      'sqlstate', sqlstate,
      'remedy_function', 'billing.repair_prelaunch_complimentary_grant',
      'remedy_call', format('select billing.repair_prelaunch_complimentary_grant(%L);', new.id)
    ),
      'source_app', 'database',
      'source_feature', 'billing'));

  raise warning 'seed_prelaunch_complimentary failed for user %: % (%) — recorded in ops.system_error, remedy: billing.repair_prelaunch_complimentary_grant(%)',
    new.id, sqlerrm, sqlstate, new.id;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;

-- ===== platform._comments_announce_delete()
CREATE OR REPLACE FUNCTION platform._comments_announce_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op    text := case when new.deleted_at is not null then 'deleted' else 'restored' end;
  v_topic text := 'comments:' || new.entity_type || ':' || new.entity_id::text;
begin
  -- RC-A2g: ids and the op, never text — the topic already names the record, and whoever joined it
  -- may view that record; the thread itself is re-read through its door.
  perform realtime.send(
    jsonb_build_object(
      'id',          gen_random_uuid(),
      'comment_id',  new.id,
      'entity_type', new.entity_type,
      'entity_id',   new.entity_id,
      'op',          v_op,
      'at',          to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'comment.' || v_op,
    v_topic,
    true);
  return null;
exception when others then
  -- A person's delete or restore never fails because its announcement did; the miss is recorded.
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'realtime_notice_failed',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'source_feature', 'platform.comments',
      'route', v_topic,
      'organization_id', new.organization_id,
      'payload', jsonb_build_object('topic', v_topic, 'comment_id', new.id, 'op', v_op)));
  exception when others then
    raise warning 'platform._comments_announce_delete could not record its own failure on %: %', v_topic, sqlerrm;
  end;
  return null;
end;
$function$;

-- ===== custom._realtime_notice(uuid,uuid,text,text,jsonb,boolean)
CREATE OR REPLACE FUNCTION custom._realtime_notice(p_organization_id uuid, p_table_id uuid, p_kind text, p_op text, p_record_ids jsonb, p_fields_changed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid := gen_random_uuid();
  v_topic text := 'custom:table:' || p_table_id::text;
  v_op    uuid := nullif(current_setting('custom.op_id', true), '')::uuid;
  v_land  boolean;
begin
  perform realtime.send(
    jsonb_build_object(
      'id',             v_id,
      'table_id',       p_table_id,
      'kind',           p_kind,
      'op',             p_op,
      'op_id',          v_op,              -- null unless the writer sent `_op_id`
      'record_ids',     p_record_ids,      -- null MEANS "re-read the page"
      'fields_changed', p_fields_changed,
      'at',             to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'records.changed',
    v_topic,
    true);

  -- THE READ-BACK. `realtime.send` returns void whether it worked or not, and it swallows
  -- every failure into a `raise warning` — so a store could go quietly un-live for a day and
  -- every screen would look healthy. `realtime.messages` is RANGE-partitioned on inserted_at
  -- and `realtime.send` mints its OWN row id, so the notice is found by topic, today's
  -- partition and the payload's own id.
  select exists (
    select 1 from realtime.messages m
     where m.topic = v_topic
       and m.inserted_at >= date_trunc('day', now())
       and m.payload ->> 'id' = v_id::text
  ) into v_land;
  if not v_land then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'realtime_notice_not_delivered',
      'error_type', 'realtime.send',
      'error_text', 'The record store announced a change and the message did not land in realtime.messages, so screens watching this table will not update until they are reloaded.',
      'source_feature', 'custom.realtime',
      'route', v_topic,
      'organization_id', p_organization_id,
      'payload', jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op,
                               'message_id', v_id)));
  end if;
exception when others then
  -- A person's write must never fail because the announcement of it did.
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'realtime_notice_failed',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'source_feature', 'custom.realtime',
      'route', v_topic,
      'organization_id', p_organization_id,
      'payload', jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op)));
  exception when others then
    raise warning 'custom._realtime_notice could not record its own failure on %: %', v_topic, sqlerrm;
  end;
end;
$function$;

-- ===== communication._meet_audience_after_end()
CREATE OR REPLACE FUNCTION communication._meet_audience_after_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mode  text;
  v_level text;
  v_plan  jsonb;
  v_n     int;
begin
  if new.host_user_id is null then
    return new;
  end if;
  begin
    v_mode := coalesce(platform.knob_resolve('meet', 'share_with_attendees_after_meeting',
                                             new.organization_id, new.host_user_id) #>> '{}', 'offer');
    v_level := coalesce(platform.knob_resolve('meet', 'share_with_attendees_permission',
                                              new.organization_id, new.host_user_id) #>> '{}', 'viewer');
    if v_mode = 'share' then
      perform iam._share_with_audience('meeting', new.id, v_level::public.permission_level,
                                       new.host_user_id, '{}', 'automatic');
    elsif v_mode = 'offer' then
      v_plan := iam._audience_plan('meeting', new.id, v_level::public.permission_level, new.host_user_id, '{}');
      v_n := (v_plan -> 'counts' ->> 'will_share')::int + (v_plan -> 'counts' ->> 'invite_by_email')::int;
      if v_n > 0 then
        perform communication.notify_from_sql(
          new.organization_id,
          'meet.share_offer',
          new.host_user_id,
          null,
          null,
          jsonb_build_object(
            'meeting', jsonb_build_object('id', new.id),
            'notice', jsonb_build_object(
              'line', format('Share "%s" with the %s %s who were in it — one click.',
                             v_plan ->> 'title', v_n, case when v_n = 1 then 'person' else 'people' end))),
          '/meetings/' || new.id::text || '?tab=record&share=1',
          'meet_meeting',
          new.id,
          'meetshareoffer:' || new.id::text);
      end if;
    end if;
  exception when others then
    -- Ending a meeting never fails because of this; the failure is loud and names the remedy.
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'audience_share_after_meeting_failed',
      'error_text', format('After the meeting ended, "%s" could not run: %s', coalesce(v_mode, 'offer'), sqlerrm),
      'organization_id', new.organization_id,
      'user_id', new.host_user_id,
      'source_app', 'database',
      'source_feature', 'sharing',
      'context', jsonb_build_object('meeting_id', new.id, 'mode', v_mode,
              'remedy', 'The meeting ended normally. Open its Record tab and click "Share with everyone in the meeting".')));
  end;
  return new;
end;
$function$;

-- ===== communication._meet_audience_after_recording()
CREATE OR REPLACE FUNCTION communication._meet_audience_after_recording()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m     communication.meet_meetings;
  v_mode  text;
  v_level text;
begin
  select * into v_m from communication.meet_meetings where id = new.meeting_id;
  if not found or v_m.ended_at is null or v_m.host_user_id is null or v_m.deleted_at is not null then
    return new;
  end if;
  begin
    v_mode := coalesce(platform.knob_resolve('meet', 'share_with_attendees_after_meeting',
                                             v_m.organization_id, v_m.host_user_id) #>> '{}', 'offer');
    if v_mode = 'share' then
      v_level := coalesce(platform.knob_resolve('meet', 'share_with_attendees_permission',
                                                v_m.organization_id, v_m.host_user_id) #>> '{}', 'viewer');
      perform iam._share_with_audience('meeting', v_m.id, v_level::public.permission_level,
                                       v_m.host_user_id, '{}', 'automatic');
    end if;
  exception when others then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'audience_share_after_recording_failed',
      'error_text', format('A recording landed but could not be shared with the meeting: %s', sqlerrm),
      'organization_id', v_m.organization_id,
      'user_id', v_m.host_user_id,
      'source_app', 'database',
      'source_feature', 'sharing',
      'context', jsonb_build_object('meeting_id', v_m.id, 'recording_id', new.id,
              'remedy', 'Open the meeting''s Record tab and click "Share with everyone in the meeting".')));
  end;
  return new;
end;
$function$;

-- ===== iam._share_with_audience(text,uuid,permission_level,uuid,text[],text)
CREATE OR REPLACE FUNCTION iam._share_with_audience(p_kind text, p_source_id uuid, p_level permission_level, p_actor uuid, p_exclude text[] DEFAULT '{}'::text[], p_via text DEFAULT 'person'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan    jsonb := iam._audience_plan(p_kind, p_source_id, p_level, p_actor, p_exclude);
  p         jsonb;
  a         jsonb;
  v_org     uuid := (v_plan ->> 'organization_id')::uuid;
  v_sharer  text := coalesce(iam._person_name(p_actor), 'Someone');
  v_shared  text[] := '{}';
  v_invited text[] := '{}';
  v_refused text[] := '{}';
  v_told    int := 0;
  v_inv     jsonb;
  v_ans     jsonb;
  v_res     jsonb;
  v_got     jsonb;
  v_what    text;
  v_say     text;
  v_removed text[];
begin
  for p in select * from jsonb_array_elements(v_plan -> 'people') loop
    if p ->> 'state' = 'will_share' then
      v_got := '[]'::jsonb;
      for a in select * from jsonb_array_elements(p -> 'missing') loop
        v_res := iam.share_with_person(a ->> 'resource_type', (a ->> 'resource_id')::uuid,
                                       (p ->> 'user_id')::uuid, p_level, p_actor, false);
        if coalesce((v_res ->> 'success')::boolean, false) then
          v_got := v_got || a;
        else
          v_refused := v_refused || format('%s for %s: %s', a ->> 'label',
                                           coalesce(p ->> 'name', p ->> 'email'), v_res ->> 'error');
        end if;
      end loop;
      if jsonb_array_length(v_got) = 0 then
        continue;
      end if;
      v_shared := v_shared || coalesce(p ->> 'name', p ->> 'email');
      select string_agg(x ->> 'label', ', ') into v_what from jsonb_array_elements(v_got) x;
      -- Tell them. A notice that cannot be queued never undoes the share; it is said out loud.
      begin
        v_ans := communication.notify_from_sql(
          v_org,
          'share.audience_shared',
          (p ->> 'user_id')::uuid,
          p ->> 'email',
          p ->> 'name',
          jsonb_build_object('grant', jsonb_build_object(
            'sharer', v_sharer,
            'title', v_plan ->> 'title',
            'what', v_what,
            'audience', v_plan ->> 'label',
            'means', iam.permission_means(p_level))),
          v_plan ->> 'href',
          v_plan ->> 'source_token',
          p_source_id,
          format('audience:%s:%s:%s:%s', p_kind, p_source_id, p ->> 'user_id', p_level));
        if jsonb_array_length(coalesce(v_ans -> 'queued', '[]'::jsonb)) > 0 then
          v_told := v_told + 1;
        end if;
      exception when others then
        perform ops.record_system_error(jsonb_build_object(
      'kind', 'audience_share_notice_failed',
      'error_text', format('The share landed but its notice could not be queued: %s', sqlerrm),
      'organization_id', v_org,
      'user_id', p_actor,
      'source_app', 'database',
      'source_feature', 'sharing',
      'context', jsonb_build_object('kind', p_kind, 'source_id', p_source_id, 'recipient', p ->> 'user_id',
                                   'remedy', 'The person already has access; tell them yourself or re-run once notifications are healthy.')));
      end;
    elsif p ->> 'state' = 'invite_by_email' then
      v_inv := iam._record_share_invite(v_plan, p ->> 'email', p_level, p_actor);
      v_invited := v_invited || (p ->> 'email');
    end if;
  end loop;

  -- REVOCATION RULE (T-32e): whoever had their access removed is skipped, and the answer says who.
  select coalesce(array_agg(coalesce(x ->> 'name', x ->> 'email')), '{}') into v_removed
    from jsonb_array_elements(coalesce(v_plan -> 'people', '[]'::jsonb)) x
   where x ->> 'state' = 'removed';

  v_say := case
    when cardinality(v_shared) = 0 and cardinality(v_invited) = 0 and cardinality(v_refused) = 0
         and cardinality(v_removed) > 0 then
      format('Nobody new to add.')
    when cardinality(v_shared) = 0 and cardinality(v_invited) = 0 and cardinality(v_refused) = 0 then
      format('Nobody new to add — everyone in the %s who can be reached already has it or has an open email link.', v_plan ->> 'source_noun')
    else concat_ws(' ',
      case when cardinality(v_shared) > 0 then
        format('Shared with %s %s as %s.', cardinality(v_shared),
               case when cardinality(v_shared) = 1 then 'person' else 'people' end, p_level::text) end,
      case when cardinality(v_invited) > 0 then
        format('Invited %s by email — they get it when they open the link.', cardinality(v_invited)) end,
      case when cardinality(v_refused) > 0 then
        format('Not shared: %s.', array_to_string(v_refused, '; ')) end)
  end;
  if cardinality(v_removed) > 0 then
    v_say := v_say || format(' Not given back to %s: their access was removed earlier. Share with them directly to give it back.',
                             array_to_string(v_removed, ', '));
  end if;
  if (v_plan -> 'counts' ->> 'unreachable')::int > 0 then
    v_say := v_say || format(' %s joined as a guest with no account or email address, so there is no way to reach them.',
                             v_plan -> 'counts' ->> 'unreachable');
  end if;

  return v_plan || jsonb_build_object(
    'via', p_via,
    'shared_with', to_jsonb(v_shared),
    'invited', to_jsonb(v_invited),
    'not_shared', to_jsonb(v_refused),
    'removed_skipped', to_jsonb(v_removed),
    'told', v_told,
    'say', v_say);
end;
$function$;

-- ===== context._follow_to_the_copy()
CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the record store is written
  -- in this same statement and its rules govern — a store refusal refuses the write. OUTSIDE the
  -- exception handler below on purpose: swallowing a refusal here would commit the old row and leave
  -- the store behind, silently. A scope door has already written the store for its own rows (marked).
  if custom.context_writer(v_org) = 'store' then
    if not custom._ctx_marked() then
      perform custom._ctx_bridge(tg_table_name, tg_op, v_row, v_org, v_type);
    end if;
    return null;
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
    if not v_on then
      return null;
    end if;

    insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
    values ('context.follow', v_id, v_type,
            case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
            'context.follow:' || tg_table_name || ':' || v_id::text,
            v_org,
            jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
    on conflict (organization_id, dedupe_key) where deleted_at is null
    do update set consumed_at = null,
                  consumer    = null,
                  operation   = excluded.operation,
                  actor       = excluded.actor;
    -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
    -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
    -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
    -- first insert costs nothing.
    perform pg_notify('records_changed',
                      jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                         'operation', 'updated', 'event_key', 'context.follow')::text);
  exception when others then
    -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
    -- an edit there must land whether or not the copy could be told. The miss is recorded with its
    -- remedy, and the next change to the same organization (or any follow drain run for it)
    -- re-plans the whole organization, so nothing is lost for good.
    begin
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'context._follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                                 'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
    exception when others then
      raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
        'context', tg_table_name, v_id, sqlerrm;
    end;
  end;
  return null;
end;
$function$;

-- ===== platform._context_tag_follow_to_the_copy()
CREATE OR REPLACE FUNCTION platform._context_tag_follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  platform.associations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself), and
  -- neither is the write-through's (SCOPES-WRITE-THROUGH, marked for its transaction).
  if v_row.target_type = 'record' and custom._ctx_marked() then
    return null;
  end if;
  if v_row.target_type = 'record'
     and pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return null;
  end if;

  select s.organization_id, s.scope_type_id into v_org, v_type
    from context.scopes s where s.id = v_row.target_id;
  if v_org is null and tg_op = 'UPDATE' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = old.target_id;
  end if;
  if v_org is null then
    return null;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, this tag's copy is brought
  -- current in the same statement (outside the handler below, so a store refusal refuses the tag).
  if custom.context_writer(v_org) = 'store' then
    declare
      v_was text := custom._ctx_mark('bridge');
    begin
      if coalesce(current_setting('app.actor_system', true), '') = '' then
        perform set_config('app.actor_system', 'custom.context_write_through', true);
      end if;
      perform custom._ctx_store_tag(v_org, v_row.source_type, v_row.source_id, v_row.target_id);
      if tg_op = 'UPDATE' and old.target_id is distinct from new.target_id and old.target_type = 'scope' then
        perform custom._ctx_store_tag(v_org, old.source_type, old.source_id, old.target_id);
      end if;
      perform custom._ctx_mark(v_was);
    end;
    return null;
  end if;
  begin
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_row.id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:associations:' || v_row.id::text,
          v_org,
          jsonb_build_object('declared', 'platform.associations', 'user_id', auth.uid(),
                             'source_type', v_row.source_type, 'target_type', v_row.target_type))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
  exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'platform._context_tag_follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
  end;
end;
$function$;

-- ===== hr._wf_grant_step(uuid)
CREATE OR REPLACE FUNCTION hr._wf_grant_step(p_step uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0; v_res jsonb;
begin
  select * into st from hr.workflow_step where id = p_step;
  foreach u in array st.resolved_user_ids loop
    -- through the one writer (T-32e); a person whose access was removed is skipped and said so.
    v_res := iam.share_with_person('hr_workflow_instance', st.workflow_instance_id, u, 'editor'::permission_level,
                                   null, false, 'hr_workflow_step', null, true, 'auto:wf_step:' || p_step::text);
    if coalesce((v_res ->> 'success')::boolean, false) then
      update iam.permissions set review_note = 'auto:wf_step:' || p_step::text
       where id = (v_res ->> 'permission_id')::uuid and review_note is distinct from 'auto:wf_step:' || p_step::text;
      v_n := v_n + 1;
    else
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'removed_access_not_restored',
      'error_text', format('A workflow step did not give access back to a person whose access was removed: %s', v_res ->> 'error'),
      'user_id', u,
      'source_app', 'database',
      'source_feature', 'hr_workflow',
      'context', jsonb_build_object('step_id', p_step, 'workflow_instance_id', st.workflow_instance_id,
                                 'remedy', 'Share the workflow with them directly to give it back, or reassign the step.')));
    end if;
  end loop;
  return v_n;
end $function$;
