-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1), cross-lane repair
-- under find-it-own-it.
--
-- 🚨 THE HR CERTIFICATION GATE WAS RED ON 13 TOKENS. TEN OF THEM WERE NOT BROKEN.
--
-- `iam.canonical_certify` reports `broken_dependent_fn` from `audit.table_impact`, which reads
-- `audit.broken_functions` — and that is a TABLE, not a view: a cached snapshot rebuilt only when
-- someone runs `audit.refresh_static()`. The last run was 2026-08-27 05:15 UTC. Several repairs
-- landed after it, so the gate was still reporting defects that had already been fixed.
--
-- Re-scanning first, before changing a single line, took HR from 116/129 to 126/129:
--
--   * `public.hr_compensation_upsert` — ALREADY FIXED by hr_l1_21 (`pp.deleted_at` removed);
--     the live body has no such reference. Stale entry.
--   * `hr.timesheet_period_grid` — 11 of the 13 tokens, and NOT broken either: it was reported for
--     "CREATE TABLE is not allowed in a non volatile function", and the function is now VOLATILE,
--     which legalises its `create temporary table _l3_grid_scratch`. Stale entry.
--
-- Repairing those would have meant editing two working functions to satisfy a stale cache. The
-- first move on a red gate is to ask when it last looked.
--
-- TWO WERE REAL, and this migration fixes exactly those two. Both are the hr_l1_21 disease
-- verbatim: a reference that no longer matches the live schema, sitting where nothing evaluates it
-- until it runs.
--
-- Authority: coordinator dispatch (round-5 certification gate); the bodies' semantics belong to
-- their own lanes and are not touched — these are reference repairs.
--
-- Applied live as `hr_l3_47_certification_broken_references`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. `hr.time_rounding_config_check` — `j.jurisdiction_key` DOES NOT EXIST; THE COLUMN IS `j.key`.
--    `hr.jurisdiction` carries `key` ('US-NV', 'US-CA', …) and never had a `jurisdiction_key`. The
--    reference sits inside the fallback branch that runs ONLY when the caller passes no explicit
--    jurisdiction set — which is why every fixture that named its jurisdictions passed and the
--    default path was never exercised. One character of intent, one column of truth, no behaviour
--    change: the value fed to `hr.validate_org_config` is the same jurisdiction key it always
--    meant to send. Confirmed against live data before editing.
-- 2. `hr.heal_grant_drift` — `ops.system_error.message` DOES NOT EXIST; THE COLUMN IS `error_text`.
--    Same shape as hr_l1_21: a `to_regclass('ops.system_error') is not null` guard proves the
--    TABLE exists and cannot prove its SHAPE, and the insert is dynamic SQL, so nothing evaluated
--    it until it ran.
-- 3. 🚨 THE INCIDENT NAMES ITS ORGANIZATION EXPLICITLY, BECAUSE THE DEFAULT MIS-ATTRIBUTES IT.
--    An earlier draft of this migration claimed the rename alone would still fail on
--    `organization_id` (NOT NULL, no column default). Probing it falsified that: the insert
--    SUCCEEDS, because `_stamp_org_default` fills the column on BEFORE INSERT. Reading that
--    trigger is what makes the real argument, and it is a stronger one:
--
--      * It stamps `public.ensure_personal_organization(actor)` — the actor's PERSONAL workspace.
--        A platform-wide grant-drift incident would be filed into whichever admin happened to run
--        the heal, in their own personal org, where nobody looking for platform incidents will
--        ever see it.
--      * When there is no actor at all — an automated sweep with no `auth.uid()` — the trigger
--        deliberately leaves the column NULL "so the not-null constraint screams". It screams
--        into `exception when others then null`, and the incident is discarded in silence. That
--        is the case this lane actually runs in.
--
--    So the org is named at the insert: taken from the drift rows themselves when they agree on
--    one, and otherwise the Matrx System org, because drift spanning employers is a platform
--    incident. Captured BEFORE the heal, because `hr.grant_drift()` is empty once it has run.
-- 4. THE SWALLOWED FAILURE IS NOW VISIBLE — the one change beyond a pure reference fix, and the
--    owning lane should say if it disagrees. `exception when others then null` is kept exactly as
--    written, because "the incident lane must never be able to fail the heal" is that lane's
--    deliberate choice and this migration does not overrule it. But it is why a broken insert
--    survived unnoticed: the heal reported success while filing nothing, every time. The handler
--    now records the error onto the ANSWER instead of discarding it. Control flow is unchanged and
--    nothing new can throw. This upholds the function's own first comment — "a heal that cannot
--    say what it healed is a heal nobody can audit" — rather than importing an outside rule.
-- 5. NEITHER FUNCTION HAS A CONSUMER IN EITHER REPO. Greped `matrx-frontend` and `aidream`: no
--    caller of either. They are DB-internal maintenance and validation surfaces, so the added
--    answer keys in decision 4 cannot break a client contract.

do $mig$
declare v_def text; v_n int;
begin
  ------------------------------------------------------------------ 1. the jurisdiction key
  v_def := pg_get_functiondef(
    'hr.time_rounding_config_check(uuid,integer,text,text[],date)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, 'j.jurisdiction_key', ''))) / 18;
  if v_n not in (0, 1) then
    raise exception 'hr_l3_47: expected 0 or 1 j.jurisdiction_key site, found %', v_n;
  end if;
  if v_n = 1 then
    -- `p_jurisdiction_keys` (the parameter) also contains the substring "jurisdiction_key"; the
    -- qualified form `j.jurisdiction_key` is what makes this replacement unambiguous.
    v_def := replace(v_def, 'j.jurisdiction_key', 'j.key');
    execute v_def;
  end if;

  ------------------------------------------------------------------ 2. the incident column
  v_def := pg_get_functiondef('hr.heal_grant_drift()'::regprocedure);

  if position('ops.system_error (kind, message, context)' in v_def) > 0 then
    -- the locals the repair needs
    v_def := replace(v_def,
      '  v_before jsonb; v_after jsonb; v_count int; v_sample jsonb; v_emps uuid[];',
      '  v_before jsonb; v_after jsonb; v_count int; v_sample jsonb; v_emps uuid[];' || E'\n' ||
      '  v_org uuid; v_incident_filed boolean := false; v_incident_error text;');

    -- decision 3: capture the organization BEFORE the heal, while the drift rows still exist
    v_def := replace(v_def,
      '    from (select * from hr.grant_drift() limit 25) x;',
      '    from (select * from hr.grant_drift() limit 25) x;' || E'\n\n' ||
      '  -- hr_l3_47 decision 3: ops.system_error.organization_id is NOT NULL with no default.' || E'\n' ||
      '  -- Read it from the drift itself where the rows agree, else the Matrx System org, since' || E'\n' ||
      '  -- drift spanning employers is a platform incident. Captured here because grant_drift()' || E'\n' ||
      '  -- is empty once the heal below has run.' || E'\n' ||
      '  select case when count(distinct d.grantee_organization_id) = 1' || E'\n' ||
      '              then (array_agg(distinct d.grantee_organization_id))[1] end' || E'\n' ||
      '    into v_org' || E'\n' ||
      '    from hr.grant_drift() d where d.grantee_organization_id is not null;' || E'\n' ||
      '  v_org := coalesce(v_org, ''39c38960-d30c-4840-b0c1-c9960de95582''::uuid);');

    -- decisions 2 + 3: the right column, and the column without which it still could not run
    v_def := replace(v_def,
      'execute $q$insert into ops.system_error (kind, message, context)' || E'\n' ||
      '                 values (''hr_grant_drift_detected'', $1, $2)$q$',
      'execute $q$insert into ops.system_error (kind, error_text, context, organization_id)' || E'\n' ||
      '                 values (''hr_grant_drift_detected'', $1, $2, $3)$q$');

    v_def := replace(v_def,
      '              jsonb_build_object(''before'', coalesce(v_before,''{}''::jsonb),' || E'\n' ||
      '                                 ''after'', coalesce(v_after,''{}''::jsonb),' || E'\n' ||
      '                                 ''sample'', v_sample);',
      '              jsonb_build_object(''before'', coalesce(v_before,''{}''::jsonb),' || E'\n' ||
      '                                 ''after'', coalesce(v_after,''{}''::jsonb),' || E'\n' ||
      '                                 ''sample'', v_sample),' || E'\n' ||
      '              v_org;' || E'\n' ||
      '      v_incident_filed := true;');

    -- decision 4: the handler still cannot fail the heal, but it no longer eats the evidence
    v_def := replace(v_def,
      '    exception when others then' || E'\n' ||
      '      -- the incident lane must never be able to fail the heal' || E'\n' ||
      '      null;',
      '    exception when others then' || E'\n' ||
      '      -- the incident lane must never be able to fail the heal (unchanged) -- but the' || E'\n' ||
      '      -- failure is no longer invisible: for as long as this said `null`, the heal' || E'\n' ||
      '      -- reported success while filing nothing, every single time (hr_l3_47 decision 4).' || E'\n' ||
      '      v_incident_error := sqlstate || '': '' || sqlerrm;');

    v_def := replace(v_def,
      '                            ''after'', coalesce(v_after,''{}''::jsonb), ''sample'', v_sample);',
      '                            ''after'', coalesce(v_after,''{}''::jsonb), ''sample'', v_sample,' || E'\n' ||
      '                            ''incident_filed'', v_incident_filed,' || E'\n' ||
      '                            ''incident_error'', v_incident_error);');

    execute v_def;
  end if;

  ------------------------------------------------------------------ 3. min(uuid) does not exist
  -- Caught by EXECUTING the repair rather than reading it: Postgres has no min() for uuid, so the
  -- first form of decision 3 above compiled and then died at runtime -- inside the very
  -- `exception when others` handler this migration was making honest, which would have reported
  -- itself as `incident_error` instead of vanishing. Repaired here so a database that already took
  -- the earlier form converges with a fresh one.
  v_def := pg_get_functiondef('hr.heal_grant_drift()'::regprocedure);
  if position('min(d.grantee_organization_id)' in v_def) > 0 then
    v_def := replace(v_def, 'min(d.grantee_organization_id)',
                            '(array_agg(distinct d.grantee_organization_id))[1]');
    execute v_def;
  end if;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'hr.time_rounding_config_check(uuid,integer,text,text[],date)'::regprocedure;
  if position('j.jurisdiction_key' in v_src) > 0 then
    raise exception 'hr_l3_47: the non-existent jurisdiction column survives';
  end if;
  if position('array_agg(distinct j.key)' in v_src) = 0 then
    raise exception 'hr_l3_47: the jurisdiction key is not read from hr.jurisdiction.key';
  end if;

  select prosrc into v_src from pg_proc where oid = 'hr.heal_grant_drift()'::regprocedure;
  if position('kind, message, context' in v_src) > 0 then
    raise exception 'hr_l3_47: the non-existent ops.system_error.message column survives';
  end if;
  if position('kind, error_text, context, organization_id' in v_src) = 0 then
    raise exception 'hr_l3_47: the incident insert does not name the live columns';
  end if;
  if position('v_incident_error := sqlstate' in v_src) = 0 then
    raise exception 'hr_l3_47: the incident failure is still discarded';
  end if;
  -- decision 4: control flow is unchanged -- the handler still cannot fail the heal
  if position('exception when others then' in v_src) = 0 then
    raise exception 'hr_l3_47: the incident lane can now fail the heal; that was not the repair';
  end if;

  -- every column these two functions name must exist on the live table
  if not exists (select 1 from information_schema.columns
                  where table_schema='ops' and table_name='system_error' and column_name='error_text')
     or not exists (select 1 from information_schema.columns
                  where table_schema='hr' and table_name='jurisdiction' and column_name='key') then
    raise exception 'hr_l3_47: the repair targets a column that does not exist';
  end if;
end
$chk$;
