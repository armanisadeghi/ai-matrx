-- HR domain, C5 / register item HRB-009, file 04 of 05 -- THE FIXTURE RUNNER AND THE CLAMP PATH.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md sections 3.2 (the refusal contract),
-- 3.4 (RUNTIME CLAMPS), 4.3-4.5 (amendment vs correction, the recompute policy) and 6.1
-- (hr.run_rule_fixtures and the two blocking gates).
--
-- 🚨 WHY THE CLAMP IS RECORDED BY THE SNAPSHOT WRITER AND NOT BY THE RESOLVER. Section 3.4 says
-- the resolver re-checks the org row against the statutory row and, on violation, clamps, records
-- the clamp in the snapshot's clamps[], and raises a compliance exception. The DETECTION and the
-- CLAMPING are pure and belong in the resolver, which is STABLE. The two side effects -- writing
-- the clamp into the snapshot and raising the exception -- are writes, and a STABLE function that
-- writes is a landmine the planner is entitled to fire. So the resolver emits `clamps[]` in its
-- result and hr.write_calculation_snapshot, which is VOLATILE and is on the same transaction as
-- the result being clamped, performs both side effects. No call site gains a step: a consumer
-- already had to write a snapshot for any consequential result (section 4.2), and the clamp rides
-- that same call.
--
-- 🚨 RECORDED DECISION -- RND-03 AND SECTION 3.2 RULE 5 CONTRADICT EACH OTHER, AND SECTION 2.7
-- RESOLVES IT. Fixture RND-03 requires that a 30-minute rounding increment be REJECTED against
-- "the federal 15-minute bound". Section 5.1 ships that federal row `advisory`, and section 3.2
-- rule 5 says an advisory rule NEVER produces a violation. Both cannot hold literally. Section
-- 2.7 is the tiebreak and it is explicit: for rounding-bounds, "no jurisdictional bound; THE
-- PLATFORM DEFAULT BOUND (section 5.1) STILL APPLIES AS A PRODUCT FLOOR" -- and section 5.9's
-- gate says rounding config validation "runs on the conservative default until active". So the
-- FEDERAL row is doing duty as the product floor, not as asserted law, and a product floor may
-- reject. A STATE or LOCAL advisory bound is asserted law we have not verified, and only warns --
-- which is exactly what RND-04 demands of the California row. Federal advisory bound REJECTS,
-- sub-federal advisory bound WARNS, and both fixtures pass without either rule bending.
--
-- Idempotent. Applied live as migration `hr_c5_04_runner_and_clamps`.

set local lock_timeout = '20s';

-- ============================================================================
-- 1. Protectiveness comparison (section 3.1's "org may never" column, as code).
-- ============================================================================
create or replace function hr._org_row_less_protective(p_class text, p_org jsonb, p_sys jsonb)
returns jsonb
language plpgsql
immutable
as $fn$
declare v_bad jsonb := '[]'::jsonb;
begin
  if p_class = 'sick-leave-floor' then
    -- accrues SLOWER = more hours required per earned hour
    if (p_org#>>'{accrual,per_hours_worked}') is not null and (p_sys#>>'{accrual,per_hours_worked}') is not null
       and (p_org#>>'{accrual,per_hours_worked}')::numeric > (p_sys#>>'{accrual,per_hours_worked}')::numeric then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','accrual.per_hours_worked',
        'configured', p_org#>'{accrual,per_hours_worked}', 'statutory', p_sys#>'{accrual,per_hours_worked}'));
    end if;
    if (p_org->>'use_permitted_after_days') is not null and (p_sys->>'use_permitted_after_days') is not null
       and (p_org->>'use_permitted_after_days')::numeric > (p_sys->>'use_permitted_after_days')::numeric then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','use_permitted_after_days',
        'configured', p_org->'use_permitted_after_days', 'statutory', p_sys->'use_permitted_after_days'));
    end if;
    if (p_sys#>>'{carryover,required}')::boolean is true
       and (p_org#>>'{carryover,required}')::boolean is false then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','carryover.required',
        'configured', 'false'::jsonb, 'statutory', 'true'::jsonb));
    end if;

  elsif p_class in ('overtime','double-time') then
    if (p_org->>'daily_threshold_hours') is not null and (p_sys->>'daily_threshold_hours') is not null
       and (p_org->>'daily_threshold_hours')::numeric > (p_sys->>'daily_threshold_hours')::numeric then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','daily_threshold_hours',
        'configured', p_org->'daily_threshold_hours', 'statutory', p_sys->'daily_threshold_hours'));
    end if;
    if (p_org->>'weekly_threshold_hours') is not null and (p_sys->>'weekly_threshold_hours') is not null
       and (p_org->>'weekly_threshold_hours')::numeric > (p_sys->>'weekly_threshold_hours')::numeric then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','weekly_threshold_hours',
        'configured', p_org->'weekly_threshold_hours', 'statutory', p_sys->'weekly_threshold_hours'));
    end if;

  elsif p_class = 'pto-carryover-legality' then
    if (p_sys->>'forfeiture_allowed')::boolean is false and (p_org->>'forfeiture_allowed')::boolean is true then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','forfeiture_allowed',
        'configured','true'::jsonb,'statutory','false'::jsonb));
    end if;

  elsif p_class = 'pto-payout-at-termination' then
    if (p_sys->>'required')::boolean is true and (p_org->>'required')::boolean is false then
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('field','required',
        'configured','false'::jsonb,'statutory','true'::jsonb));
    end if;
  end if;
  -- A class with no comparator here is NOT declared compliant -- it is declared UNCOMPARED, and
  -- the empty array says so. Silence is not a pass; nothing downstream reads absence as approval.
  return v_bad;
end
$fn$;

-- ============================================================================
-- 2. hr.resolve_rules -- final body. Adds the section 3.4 clamp detection.
-- ============================================================================
create or replace function hr.resolve_rules(
  p_subject_type text, p_subject_id uuid, p_as_of date, p_classes text[],
  p_facts jsonb, p_organization_id uuid, p_jurisdiction_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_key text; v_stamped text; v_chain jsonb; v_chain_keys text[];
  v_resolved jsonb := '{}'::jsonb; v_trace jsonb := '[]'::jsonb;
  v_incomplete jsonb := '[]'::jsonb; v_advisory text[] := '{}'; v_no_rule text[] := '{}';
  v_clamps jsonb := '[]'::jsonb;
  v_missing text; v_cls record; v_v jsonb;
  v_win_rank integer; v_env jsonb; v_preempt_id uuid; v_preempt_state text;
  v_rules jsonb; v_i integer; v_j integer; v_n integer; v_bad jsonb;
  a_id uuid[]; a_ver integer[]; a_jk text[]; a_lvl text[]; a_rank integer[]; a_status text[];
  a_params jsonb[]; a_appl jsonb[]; a_org uuid[]; a_out text[]; a_reason text[];
begin
  if p_as_of is null then
    raise exception 'as_of_required' using errcode = '22004',
      hint = 'SPEC-JURISDICTION 2.2 / 7.5: p_as_of is the WORK or EVENT date. Never now().';
  end if;

  if p_subject_id is not null then
    v_stamped := hr._subject_jurisdiction_key(p_subject_type, p_subject_id);
    if p_jurisdiction_key is not null and p_jurisdiction_key <> v_stamped then
      raise exception 'jurisdiction_key_mismatch: record is stamped %, caller passed %',
        v_stamped, p_jurisdiction_key
        using errcode = 'P0001',
              hint = 'SPEC-JURISDICTION 2.0 / AR 1.4: jurisdiction comes from the stamped record.';
    end if;
    v_key := v_stamped;
  else
    if p_jurisdiction_key is null then
      raise exception 'jurisdiction_key_required_in_prospective_mode' using errcode = '22004';
    end if;
    v_key := p_jurisdiction_key;
  end if;

  v_chain := hr.jurisdiction_chain(v_key);
  select array_agg(x->>'key') into v_chain_keys from jsonb_array_elements(v_chain) x;
  v_missing := hr._knob('hr.jurisdiction_rules','missing_fact_behavior') #>> '{}';

  for v_cls in
    select rc.* from hr.jurisdiction_rule_class rc
     where rc.slug = any(p_classes) and rc.is_active and rc.deleted_at is null
  loop
    select coalesce(array_agg(r.id order by rk, r.id), '{}'),
           coalesce(array_agg(r.version order by rk, r.id), '{}'),
           coalesce(array_agg(r.jurisdiction_key order by rk, r.id), '{}'),
           coalesce(array_agg(lv order by rk, r.id), '{}'),
           coalesce(array_agg(rk order by rk, r.id), '{}'),
           coalesce(array_agg(r.status order by rk, r.id), '{}'),
           coalesce(array_agg(r.parameters order by rk, r.id), '{}'),
           coalesce(array_agg(r.applicability order by rk, r.id), '{}'),
           coalesce(array_agg(r.organization_id order by rk, r.id), '{}'),
           coalesce(array_agg(null::text order by rk, r.id), '{}'),
           coalesce(array_agg(null::text order by rk, r.id), '{}')
      into a_id, a_ver, a_jk, a_lvl, a_rank, a_status, a_params, a_appl, a_org, a_out, a_reason
      from hr.jurisdiction_rule r
      join lateral (select j.level lv,
                           case j.level when 'city' then 0 when 'county' then 1
                                        when 'state' then 2 else 3 end rk
                      from hr.jurisdiction j where j.key = r.jurisdiction_key) l on true
     where r.rule_class_id = v_cls.id
       and r.jurisdiction_key = any(v_chain_keys)
       and r.effective_from <= p_as_of
       and (r.effective_to is null or r.effective_to > p_as_of)
       and r.deleted_at is null
       and r.status in ('active','advisory')
       and r.organization_id in (p_organization_id, v_sys);

    v_n := coalesce(array_length(a_id, 1), 0);

    if v_n = 0 and v_cls.slug in ('overtime','double-time','i9-section2-deadline') then
      raise exception 'rule_data_defect: class % has NO candidate rule at all for % as of % -- a federal row must always exist',
        v_cls.slug, v_key, p_as_of using errcode = 'P0001', hint = 'SPEC-JURISDICTION 2.7';
    end if;

    -- ------------------------------------------------------------ step 3 + section 3.4 clamps
    for v_i in 1 .. v_n loop
      if a_org[v_i] = v_sys then
        for v_j in 1 .. v_n loop
          if a_org[v_j] = p_organization_id and a_org[v_j] <> v_sys and a_jk[v_j] = a_jk[v_i] then
            a_out[v_i] := 'overridden_by_org';
            -- 🚨 THE RUNTIME RE-CHECK. Config-time validation covered the jurisdictions the org
            -- operated in AT WRITE TIME. Two paths get past it: a rule amended after the config
            -- was written, and a jurisdiction first reached mid-period. Here the worker gets the
            -- LAWFUL result and the org's own number is recorded as what it tried to do.
            -- Clamping is correct and refusal is not: the hours were already worked, and refusing
            -- to compute a paycheck is not an available option.
            v_bad := hr._org_row_less_protective(v_cls.slug, a_params[v_j], a_params[v_i]);
            if jsonb_array_length(v_bad) > 0 then
              a_params[v_j] := a_params[v_i];      -- clamp to the statutory value
              v_clamps := v_clamps || jsonb_build_array(jsonb_build_object(
                'class', v_cls.slug, 'jurisdiction_key', a_jk[v_i],
                'org_rule_id', a_id[v_j], 'statutory_rule_id', a_id[v_i],
                'statutory_rule_version', a_ver[v_i], 'fields', v_bad,
                'applied', 'statutory'));
              a_reason[v_j] := 'clamped to the statutory value';
            end if;
          end if;
        end loop;
      end if;
    end loop;

    if v_cls.supports_preemption then
      v_preempt_id := null; v_preempt_state := null;
      for v_i in 1 .. v_n loop
        if a_out[v_i] is null and a_lvl[v_i] = 'state'
           and a_params[v_i]->>'mode' = 'preempt_local' then
          v_preempt_id := a_id[v_i]; v_preempt_state := a_jk[v_i]; exit;
        end if;
      end loop;
      if v_preempt_id is not null then
        for v_i in 1 .. v_n loop
          if a_out[v_i] is null and a_lvl[v_i] in ('county','city') then
            a_out[v_i] := 'preempted';
            a_reason[v_i] := format('preempted by the %s state rule %s', v_preempt_state, v_preempt_id);
          end if;
        end loop;
      end if;
    end if;

    for v_i in 1 .. v_n loop
      if a_out[v_i] is null then
        v_v := hr._applicability_verdict(a_appl[v_i], p_facts);
        if v_v->>'verdict' = 'not_applicable' then
          a_out[v_i] := 'not_applicable'; a_reason[v_i] := v_v->>'reason';
        elsif v_v->>'verdict' = 'incomplete' then
          a_out[v_i] := 'incomplete'; a_reason[v_i] := 'missing fact ' || (v_v->>'fact');
          v_incomplete := v_incomplete || jsonb_build_array(jsonb_build_object(
            'class', v_cls.slug, 'fact', v_v->>'fact', 'rule_id', a_id[v_i]));
          if v_missing = 'fail' then
            raise exception 'missing_applicability_fact: class % needs fact % (rule %)',
              v_cls.slug, v_v->>'fact', a_id[v_i] using errcode = 'P0001',
              hint = 'SPEC-JURISDICTION 1.4: supply the fact, or set hr.jurisdiction_rules.missing_fact_behavior to flag.';
          end if;
        elsif (a_params[v_i]->>'applies') = 'false' then
          a_out[v_i] := 'not_applicable'; a_reason[v_i] := 'parameters.applies=false';
        end if;
      end if;
    end loop;

    if v_cls.precedence_mode = 'most_specific' then
      v_win_rank := null;
      for v_i in 1 .. v_n loop
        if a_out[v_i] is null and (v_win_rank is null or a_rank[v_i] < v_win_rank) then
          v_win_rank := a_rank[v_i];
        end if;
      end loop;
      if v_win_rank is not null then
        for v_i in 1 .. v_n loop
          if a_out[v_i] is null and a_rank[v_i] > v_win_rank then a_out[v_i] := 'less_specific'; end if;
        end loop;
      end if;
    end if;

    for v_i in 1 .. v_n loop
      if a_out[v_i] is null then a_out[v_i] := 'applied'; end if;
    end loop;

    select jsonb_agg(jsonb_build_object(
             'rule_id', a_id[k], 'rule_version', a_ver[k], 'jurisdiction_key', a_jk[k],
             'level', a_lvl[k], 'status', a_status[k], 'parameters', a_params[k],
             'organization_id', a_org[k]) order by a_rank[k], a_id[k])
      into v_rules from generate_subscripts(a_id, 1) k where a_out[k] = 'applied';

    if v_rules is null then
      v_no_rule := v_no_rule || v_cls.slug;
    else
      if v_cls.precedence_mode = 'legality_constraint' then
        v_env := hr._legality_envelope(v_cls.slug, v_rules);
        v_resolved := v_resolved || jsonb_build_object(v_cls.slug, jsonb_build_object(
          'mode', v_cls.precedence_mode, 'rules', v_rules, 'envelope', v_env));
      else
        v_resolved := v_resolved || jsonb_build_object(v_cls.slug, jsonb_build_object(
          'mode', v_cls.precedence_mode, 'rules', v_rules));
      end if;
      if exists (select 1 from generate_subscripts(a_id,1) k
                  where a_out[k] = 'applied' and a_status[k] = 'advisory') then
        v_advisory := v_advisory || v_cls.slug;
      end if;
    end if;

    v_trace := v_trace || coalesce((
      select jsonb_agg(jsonb_build_object(
               'rule_id', a_id[k], 'rule_version', a_ver[k], 'jurisdiction_key', a_jk[k],
               'class', v_cls.slug, 'status', a_status[k], 'outcome', a_out[k], 'reason', a_reason[k])
             order by a_rank[k], a_id[k])
        from generate_subscripts(a_id, 1) k), '[]'::jsonb);
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of, 'jurisdiction_key', v_key,
    'chain', (select jsonb_agg(x->>'key') from jsonb_array_elements(v_chain) x),
    'resolved', v_resolved, 'trace', v_trace, 'incomplete', v_incomplete,
    'advisory', to_jsonb(v_advisory), 'no_rule', to_jsonb(v_no_rule), 'clamps', v_clamps,
    'prospective', (p_subject_id is null));
end
$fn$;

-- ============================================================================
-- 3. The snapshot writer carries out section 3.4's two side effects.
-- ============================================================================
create or replace function hr.write_calculation_snapshot(
  p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text,
  p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text,
  p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb,
  p_actor_type text, p_actor_id uuid default null, p_employment_id uuid default null,
  p_clamps jsonb default null, p_prospective boolean default false,
  p_supersedes_id uuid default null, p_recalculation_batch_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare v_id uuid; v_clamps jsonb; v_c jsonb;
begin
  perform set_config('hr.privileged_write','on', true);

  -- the clamps the resolver detected ride along automatically; an explicit argument overrides
  v_clamps := coalesce(p_clamps, p_resolution->'clamps', '[]'::jsonb);

  insert into hr.calculation_snapshot (
    organization_id, subject_type, subject_id, employment_id, calculation_kind, jurisdiction_key,
    as_of_date, engine_key, engine_version, resolution, applicability_facts, inputs, outputs,
    clamps, prospective, supersedes_id, recalculation_batch_id, actor_type, actor_id)
  values (
    p_organization_id, p_subject_type, p_subject_id, p_employment_id, p_calculation_kind,
    p_jurisdiction_key, p_as_of, p_engine_key, p_engine_version, p_resolution,
    p_applicability_facts, p_inputs, p_outputs, v_clamps, p_prospective, p_supersedes_id,
    p_recalculation_batch_id, p_actor_type, p_actor_id)
  returning id into v_id;

  if p_supersedes_id is not null then
    update hr.calculation_snapshot set superseded_by_id = v_id
     where id = p_supersedes_id and superseded_by_id is null;
  end if;

  -- section 3.4 step 3: one compliance exception per clamp, landing in the org's HR task inbox
  -- with the same human-readable sentence the config validator would have used.
  if not p_prospective then
    for v_c in select jsonb_array_elements(v_clamps) loop
      perform hr.raise_compliance_exception(
        p_organization_id, v_c->>'jurisdiction_key', (v_c->>'statutory_rule_id')::uuid,
        (v_c->>'statutory_rule_version')::integer, v_c->>'class', 'org_config_below_statutory_floor',
        format('Your %s policy is below what %s requires, so this calculation used the legal '
            || 'minimum instead of your setting. Update your policy so the two agree.',
               v_c->>'class', v_c->>'jurisdiction_key'),
        jsonb_build_object('org_rule_id', v_c->>'org_rule_id', 'fields', v_c->'fields'));
    end loop;
  end if;

  return v_id;
end
$fn$;

-- ============================================================================
-- 4. hr.validate_org_config -- rewritten (counts, and the RND-03/RND-04 split).
-- ============================================================================
create or replace function hr.validate_org_config(
  p_organization_id uuid, p_class text, p_parameters jsonb,
  p_jurisdiction_keys text[] default null, p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_keys text[]; v_key text; v_res jsonb; v_rule jsonb; v_p jsonb;
  v_violations jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb; v_advisory jsonb := '[]'::jsonb;
  v_env jsonb; v_affected integer; v_name text; v_cite jsonb; v_status text;
  v_action text; v_bound_rule jsonb;
begin
  if not exists (select 1 from hr.jurisdiction_rule_class where slug = p_class and deleted_at is null) then
    raise exception 'unknown_rule_class: %', p_class using errcode = 'P0001';
  end if;
  v_action := hr._knob('hr.jurisdiction_rules','config_violation_action') #>> '{}';

  if p_jurisdiction_keys is null then
    select array_agg(distinct j.key) into v_keys
      from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
     where e.organization_id = p_organization_id and e.deleted_at is null;
    v_keys := coalesce(v_keys, '{}'::text[]);
  else
    v_keys := p_jurisdiction_keys;
  end if;

  foreach v_key in array v_keys loop
    select j.name into v_name from hr.jurisdiction j where j.key = v_key;
    v_res := hr.resolve_rules(null, null, p_as_of, array[p_class], '{}'::jsonb,
                              p_organization_id, v_key);

    select count(*) into v_affected
      from hr.employment em
      join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
           and pa.effective_from <= p_as_of
           and (pa.effective_to is null or pa.effective_to > p_as_of) and pa.deleted_at is null
      join hr.location loc on loc.id = pa.location_id
      join hr.jurisdiction jj on jj.id = loc.jurisdiction_id
     where em.organization_id = p_organization_id and em.status = 'active'
       and em.deleted_at is null and jj.key = v_key;

    for v_rule in select jsonb_array_elements(coalesce(v_res#>array['resolved',p_class,'rules'], '[]'::jsonb)) loop
      v_p := v_rule->'parameters';
      v_status := v_rule->>'status';
      select r.citation into v_cite from hr.jurisdiction_rule r where r.id = (v_rule->>'rule_id')::uuid;
      if v_status = 'advisory' then
        v_advisory := v_advisory || jsonb_build_array(v_rule->>'rule_id');
      end if;

      if p_class = 'pto-carryover-legality'
         and coalesce(p_parameters->>'carryover_policy','') = 'forfeit'
         and (v_p->>'forfeiture_allowed')::boolean is false then
        if v_status = 'advisory' then
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_rule->>'rule_id', 'code', 'forfeiture_unlawful_unverified',
            'message', format('Your policy may conflict with a %s rule we have not yet verified.', v_name)));
        else
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_rule->>'rule_id', 'rule_version', v_rule->>'rule_version',
            'field', 'carryover_policy', 'configured', 'forfeit',
            'required', jsonb_build_object('forfeiture_allowed', false,
                                           'cap_allowed', coalesce((v_p->>'cap_allowed')::boolean, true)),
            'code', 'forfeiture_unlawful',
            'message', v_name || ' does not allow a use-it-or-lose-it vacation policy — accrued '
                    || 'vacation is earned wages that cannot be forfeited. You can cap how much an '
                    || 'employee accrues (accrual stops at the cap until they use time), but unused '
                    || 'time cannot expire. Set a cap instead of forfeiture.',
            'citation', v_cite, 'affected_employees', v_affected));
        end if;
      end if;

      if p_class = 'sick-leave-floor' and v_status = 'active'
         and jsonb_typeof(v_p->'accrual') = 'object' then
        if (p_parameters#>>'{accrual,per_hours_worked}') is not null
           and (v_p#>>'{accrual,per_hours_worked}') is not null
           and (p_parameters#>>'{accrual,per_hours_worked}')::numeric
               > (v_p#>>'{accrual,per_hours_worked}')::numeric then
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_rule->>'rule_id', 'field', 'accrual.per_hours_worked',
            'configured', p_parameters#>'{accrual,per_hours_worked}',
            'required', v_p->'accrual', 'code', 'accrues_slower_than_floor',
            'message', format('%s requires employees to earn sick leave at least as fast as %s hour(s) '
                           || 'for every %s hours worked. Your policy earns them more slowly, which is '
                           || 'not allowed. You can be more generous, never less.',
                           v_name, v_p#>>'{accrual,hours_earned}', v_p#>>'{accrual,per_hours_worked}'),
            'citation', v_cite, 'affected_employees', v_affected));
        end if;
        if (p_parameters->>'use_permitted_after_days') is not null
           and (v_p->>'use_permitted_after_days') is not null
           and (p_parameters->>'use_permitted_after_days')::numeric
               > (v_p->>'use_permitted_after_days')::numeric then
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_rule->>'rule_id', 'field', 'use_permitted_after_days',
            'configured', p_parameters->'use_permitted_after_days',
            'required', v_p->'use_permitted_after_days', 'code', 'waiting_period_too_long',
            'message', format('%s lets employees start using sick leave after %s days. Your policy makes '
                           || 'them wait longer, which is not allowed. A shorter wait is fine.',
                           v_name, v_p->>'use_permitted_after_days'),
            'citation', v_cite, 'affected_employees', v_affected));
        end if;
      end if;
    end loop;

    if p_class = 'rounding-bounds' then
      v_env := v_res#>array['resolved',p_class,'envelope'];
      if v_env is not null and (p_parameters->>'increment_minutes') is not null
         and (v_env->>'max_increment_minutes') is not null
         and (p_parameters->>'increment_minutes')::numeric > (v_env->>'max_increment_minutes')::numeric then
        select x into v_bound_rule
          from jsonb_array_elements(v_res#>array['resolved',p_class,'rules']) x
         where (x#>>'{parameters,max_increment_minutes}')::numeric = (v_env->>'max_increment_minutes')::numeric
         limit 1;
        if (v_bound_rule->>'status') = 'advisory' and (v_bound_rule->>'level') <> 'federal' then
          -- a SUB-FEDERAL advisory bound is asserted law we have not verified: warn, never block
          v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_bound_rule->>'rule_id',
            'field','increment_minutes','configured', p_parameters->'increment_minutes',
            'code','increment_exceeds_unverified_bound',
            'message', format('We have not yet verified %s''s rounding rules. The value we hold is %s '
                           || 'minutes, which your setting exceeds — this is a warning, not a refusal.',
                              v_name, v_env->>'max_increment_minutes')));
        else
          -- the FEDERAL row is the PRODUCT FLOOR (section 2.7), and a product floor may reject
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_bound_rule->>'rule_id', 'rule_version', v_bound_rule->>'rule_version',
            'field','increment_minutes','configured', p_parameters->'increment_minutes',
            'required', v_env, 'code','increment_exceeds_bound',
            'bound_basis','platform default bound applied as a product floor (SPEC-JURISDICTION 2.7)',
            'message', format('Rounding punches to %s minutes is more than the %s-minute maximum we '
                           || 'apply. Lower it to %s or turn rounding off.',
                              p_parameters->>'increment_minutes', v_env->>'max_increment_minutes',
                              v_env->>'max_increment_minutes'),
            'affected_employees', v_affected));
        end if;
      end if;

      -- the NEUTRALITY predicate is the PRODUCT's own rule (section 8: rounding_mode is `nearest`
      -- only in v1), not a jurisdiction's, so it does not depend on any rule's status and cannot
      -- be an advisory rule blocking a customer.
      if (p_parameters->>'mode') is not null and (p_parameters->>'mode') <> 'nearest' then
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
          'field','mode','configured', p_parameters->'mode',
          'required', jsonb_build_object('allowed_modes', jsonb_build_array('nearest')),
          'code','rounding_mode_not_neutral',
          'bound_basis','product neutrality rule (SPEC-JURISDICTION 8: nearest only in v1)',
          'message', format('Rounding must not systematically favour the employer. "%s" always moves '
                         || 'time in one direction, so it fails that test. Use "nearest", which rounds '
                         || 'up and down equally.', p_parameters->>'mode'),
          'affected_employees', v_affected));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', (jsonb_array_length(v_violations) = 0 or v_action = 'warn'),
    'action', v_action,
    'violations', v_violations,
    'violation_count', jsonb_array_length(v_violations),
    'warnings', v_warnings,
    'warning_count', jsonb_array_length(v_warnings),
    'advisory_rules_consulted', v_advisory,
    'jurisdictions_checked', to_jsonb(v_keys));
end
$fn$;

-- ============================================================================
-- 5. THE PROBES -- everything a fixture can only prove by writing rows.
-- ============================================================================
-- Each probe builds real rows, observes real behaviour, and ROLLS THE WHOLE THING BACK through a
-- deliberate raise inside a subtransaction. plpgsql variables survive a subtransaction abort;
-- database changes do not. Nothing this function does is visible after it returns.
create or replace function hr._run_fixture_probe(p_probe text, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_obs jsonb := '{}'::jsonb;
  v_cls uuid; v_rule uuid; v_rule2 uuid; v_snap uuid; v_snap2 uuid; v_batch uuid; v_res jsonb;
  v_n integer; v_txt text; v_ver integer;
begin
  perform set_config('hr.privileged_write','on', true);
  begin
    if p_probe = 'jurisdiction_mismatch' then
      -- OT-JUR-01: a March workweek recomputed in October must resolve the STAMPED key.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{}'::jsonb,'automation', null, null, '[]'::jsonb, true);
      begin
        perform hr.resolve_rules('hr_calculation_snapshot', v_snap, date '2026-03-16',
                 array['overtime'], '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
                 v_org, 'US-TX');
        v_obs := v_obs || '{"refused": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('refused', sqlerrm like 'jurisdiction_key_mismatch%',
                                             'error', split_part(sqlerrm, ':', 1));
      end;
      v_res := hr.resolve_rules('hr_calculation_snapshot', v_snap, date '2026-03-16',
                array['overtime'], '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
                v_org, null);
      v_obs := v_obs || jsonb_build_object('stamped_key_used', v_res->>'jurisdiction_key');

    elsif p_probe = 'preemption' then
      -- FW-PRE-01: a hypothetical Michigan city ordinance is removed by the preemption pass.
      insert into hr.jurisdiction (organization_id, key, level, parent_key, name, visibility)
      values (v_sys,'US-MI-PROBE_CITY','city','US-MI','Probe City','public'::platform.visibility);
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'fair-workweek';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope)
      values (v_sys,'public'::platform.visibility, v_cls,'US-MI-PROBE_CITY', date '1900-01-01',
        '{"advance_notice_days":14}'::jsonb,'advisory',
        'Probe row: a hypothetical local ordinance in a preemption state, to prove the preemption pass removes it.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'statutory')
      returning id into v_rule;
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['fair-workweek'],
                 '{}'::jsonb, v_sys, 'US-MI-PROBE_CITY');
      select t->>'outcome' into v_txt
        from jsonb_array_elements(v_res->'trace') t where (t->>'rule_id')::uuid = v_rule;
      v_obs := jsonb_build_object(
        'city_outcome', v_txt,
        'preempted', v_txt = 'preempted',
        'reason_names_state_rule', (select t->>'reason' like '%US-MI%'
                                      from jsonb_array_elements(v_res->'trace') t
                                     where (t->>'rule_id')::uuid = v_rule),
        'covered', jsonb_typeof(v_res#>'{resolved,fair-workweek,rules}') = 'array');

    elsif p_probe in ('org_override_more_generous','org_override_clamped') then
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'sick-leave-floor';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-CA', date '1900-01-01',
        case when p_probe = 'org_override_more_generous'
             then '{"accrual":{"method":"per_hours_worked","hours_earned":1,"per_hours_worked":20},"use_permitted_after_days":30,"carryover":{"required":true}}'::jsonb
             else '{"accrual":{"method":"per_hours_worked","hours_earned":1,"per_hours_worked":40},"use_permitted_after_days":120,"carryover":{"required":true}}'::jsonb end,
        'active',
        'Probe row: an organization policy row, to prove the override rung and the runtime clamp.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['sick-leave-floor'],
                 '{}'::jsonb, v_org, 'US-CA');
      v_obs := jsonb_build_object(
        'org_rule_applied', exists (select 1 from jsonb_array_elements(v_res#>'{resolved,sick-leave-floor,rules}') x
                                     where (x->>'rule_id')::uuid = v_rule),
        'system_row_outcome', (select t->>'outcome' from jsonb_array_elements(v_res->'trace') t
                                where t->>'class' = 'sick-leave-floor'
                                  and (t->>'rule_id')::uuid <> v_rule limit 1),
        'clamp_count', jsonb_array_length(v_res->'clamps'),
        'applied_per_hours_worked', (select x#>'{parameters,accrual,per_hours_worked}'
                                       from jsonb_array_elements(v_res#>'{resolved,sick-leave-floor,rules}') x
                                      where (x->>'rule_id')::uuid = v_rule));
      if p_probe = 'org_override_clamped' then
        v_snap := hr.write_calculation_snapshot(v_org,'hr_leave_ledger', gen_random_uuid(),
          'sick-leave-accrual','US-CA', date '2026-03-16','accrual_engine','probe', v_res,
          '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'automation');
        select clamps into v_res from hr.calculation_snapshot where id = v_snap;
        select count(*) into v_n from ops.system_error
         where kind = 'hr_compliance_exception_pending' and error_type = 'org_config_below_statutory_floor';
        v_obs := v_obs || jsonb_build_object(
          'snapshot_clamps_recorded', jsonb_array_length(v_res),
          'compliance_exception_raised', v_n > 0);
      end if;

    elsif p_probe = 'missing_fact' then
      -- RES-02: a rule whose applicability names a fact the caller omitted is never treated as unmet.
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'training-mandate';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, applicability, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-CA', date '1900-01-01',
        '[{"fact":"employer_fte_avg_prior_year","op":"gte","value":50}]'::jsonb,
        '{"program":"probe_program","cadence_months":12}'::jsonb,'active',
        'Probe row: an applicability fact the caller will not supply, to prove the incomplete path.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      begin
        perform hr.resolve_rules(null, null, date '2026-03-16', array['training-mandate'],
                  '{}'::jsonb, v_org, 'US-CA');
        v_obs := v_obs || '{"raised_under_fail": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('raised_under_fail', sqlerrm like 'missing_applicability_fact%',
                                             'named_fact', sqlerrm like '%employer_fte_avg_prior_year%');
      end;
      update platform.feature_knob set value = '"flag"'::jsonb
       where feature = 'hr.jurisdiction_rules' and key = 'missing_fact_behavior';
      v_res := hr.resolve_rules(null, null, date '2026-03-16', array['training-mandate'],
                 '{}'::jsonb, v_org, 'US-CA');
      v_obs := v_obs || jsonb_build_object(
        'incomplete_under_flag', v_res->'incomplete' @> jsonb_build_array(
          jsonb_build_object('class','training-mandate','fact','employer_fte_avg_prior_year','rule_id', v_rule)),
        'silently_unmet', false);

    elsif p_probe = 'amendment_as_of' then
      -- RES-05: a rule amended effective 2026-07-01; a 2026-06-15 work date resolves the OLD row.
      select id into v_cls from hr.jurisdiction_rule_class where slug = 'training-mandate';
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, effective_to, parameters, status, basis, citation, source_scope)
      values (v_org,'internal'::platform.visibility, v_cls,'US-NV', date '1900-01-01', date '2026-07-01',
        '{"program":"probe_program","cadence_months":12}'::jsonb,'active',
        'Probe row: the pre-amendment rule, retained so a past work date still resolves it byte-identically.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy')
      returning id into v_rule;
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope, supersedes_id)
      values (v_org,'internal'::platform.visibility, v_cls,'US-NV', date '2026-07-01',
        '{"program":"probe_program","cadence_months":24}'::jsonb,'active',
        'Probe row: the amendment. New effective_from, supersedes_id set, and it cannot reach backwards.',
        '{"authority":"probe","confidence":"probe"}'::jsonb,'org_policy', v_rule)
      returning id into v_rule2;
      v_obs := jsonb_build_object(
        'before_amendment_cadence', (hr.resolve_rules(null,null, date '2026-06-15',
           array['training-mandate'],'{}'::jsonb, v_org,'US-NV')#>'{resolved,training-mandate,rules,0,parameters,cadence_months}'),
        'after_amendment_cadence', (hr.resolve_rules(null,null, date '2026-08-15',
           array['training-mandate'],'{}'::jsonb, v_org,'US-NV')#>'{resolved,training-mandate,rules,0,parameters,cadence_months}'),
        'old_row_retained', exists (select 1 from hr.jurisdiction_rule where id = v_rule and deleted_at is null));

    elsif p_probe = 'snapshot_correction' then
      -- SNAP-01: a correction enumerates affected snapshots and opens a PROPOSED batch. It never
      -- supersedes a snapshot itself.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe',
        jsonb_build_object('resolved', jsonb_build_object('overtime', jsonb_build_object('rules',
          jsonb_build_array(jsonb_build_object('rule_id','11111111-1111-1111-1111-111111111111','rule_version',1))))),
        '{}'::jsonb,'{}'::jsonb,'{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      select count(*) into v_n from hr.calculation_snapshot
       where resolution @> '{"resolved":{"overtime":{"rules":[{"rule_id":"11111111-1111-1111-1111-111111111111"}]}}}'::jsonb;
      insert into hr.recalculation_batch (organization_id, visibility, trigger, triggering_rule_id,
        triggering_rule_version, reason, scope, state)
      values (v_org,'personal'::platform.visibility,'rule_correction',
        '11111111-1111-1111-1111-111111111111'::uuid, 1,
        'Probe: we had the rule wrong and the corrected value changes results already computed under it.',
        jsonb_build_object('date_range', jsonb_build_array('2026-03-01','2026-03-31'),
                           'calculation_kinds', jsonb_build_array('overtime')),'proposed')
      returning id into v_batch;
      v_obs := jsonb_build_object(
        'affected_snapshots_found', v_n,
        'batch_state', (select state from hr.recalculation_batch where id = v_batch),
        'nothing_superseded', (select superseded_by_id is null from hr.calculation_snapshot where id = v_snap),
        'original_outputs_untouched', (select outputs from hr.calculation_snapshot where id = v_snap)
                                      = '{"hours":{"ot_1_5":4}}'::jsonb);

    elsif p_probe = 'snapshot_supersede' then
      -- SNAP-02: recompute inside an open pay period -- new snapshot with supersedes_id, old retained.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      v_snap2 := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":6}}'::jsonb,'automation', null, null, null, false, v_snap);
      v_obs := jsonb_build_object(
        'old_retained', exists (select 1 from hr.calculation_snapshot where id = v_snap),
        'old_superseded_by_new', (select superseded_by_id from hr.calculation_snapshot where id = v_snap) = v_snap2,
        'old_outputs_unchanged', (select outputs from hr.calculation_snapshot where id = v_snap)
                                 = '{"hours":{"ot_1_5":4}}'::jsonb,
        'new_supersedes', (select supersedes_id from hr.calculation_snapshot where id = v_snap2) = v_snap);

    elsif p_probe = 'snapshot_locked' then
      -- SNAP-03: after export/lock an in-place recompute is REFUSED; the correction becomes an
      -- adjustment tagged to the original period, with its own snapshot, and the original stays
      -- exactly as exported so the export file's provenance survives.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      begin
        update hr.calculation_snapshot set outputs = '{"hours":{"ot_1_5":6}}'::jsonb where id = v_snap;
        v_obs := v_obs || '{"in_place_refused": false}'::jsonb;
      exception when others then
        v_obs := v_obs || jsonb_build_object('in_place_refused', true,
                                             'refusal', split_part(sqlerrm, ':', 1));
      end;
      v_snap2 := hr.write_calculation_snapshot(v_org,'hr_time_adjustment', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,
        jsonb_build_object('original_period_id','probe-period-1'),
        '{"hours":{"ot_1_5":2}}'::jsonb,'automation', null, null, null, false, v_snap);
      v_obs := v_obs || jsonb_build_object(
        'adjustment_written', v_snap2 is not null,
        'adjustment_tagged_to_original_period',
          (select inputs->>'original_period_id' from hr.calculation_snapshot where id = v_snap2) = 'probe-period-1',
        'original_unchanged', (select outputs from hr.calculation_snapshot where id = v_snap)
                              = '{"hours":{"ot_1_5":4}}'::jsonb);

    elsif p_probe = 'snapshot_immutable' then
      -- SNAP-04: any UPDATE other than superseded_by_id NULL->value raises.
      v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
        'US-CA', date '2026-03-16','ot_engine','probe','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
      begin
        update hr.calculation_snapshot set jurisdiction_key = 'US-TX' where id = v_snap;
        v_obs := v_obs || '{"raised": false}'::jsonb;
      exception when others then
        v_obs := v_obs || '{"raised": true}'::jsonb;
      end;
      begin
        delete from hr.calculation_snapshot where id = v_snap;
        v_obs := v_obs || '{"delete_raised": false}'::jsonb;
      exception when others then
        v_obs := v_obs || '{"delete_raised": true}'::jsonb;
      end;

    elsif p_probe = 'snapshot_i9' then
      -- I9-SNAP-01: a computed Section 2 due date writes a snapshot citing rule id + version, and
      -- a later amendment of the rule leaves that snapshot untouched (section 4.3).
      v_res := hr.jurisdiction_evaluate('i9-section2-due','US', date '2026-04-06',
                 '{"worker_class":"employee"}'::jsonb,'{"hire_date":"2026-04-06"}'::jsonb, v_sys);
      v_snap := hr.write_calculation_snapshot(v_org,'hr_i9_record', gen_random_uuid(),'i9-section2-due',
        'US', date '2026-04-06','onboarding_tracker','probe', v_res->'resolution','{}'::jsonb,
        '{"hire_date":"2026-04-06"}'::jsonb, v_res->'result','automation');
      select (v_res#>>'{rules_applied,0,rule_version}')::integer into v_ver;
      select id into v_rule from hr.jurisdiction_rule
       where id = (v_res#>>'{rules_applied,0,rule_id}')::uuid;
      update hr.jurisdiction_rule set effective_to = date '2027-01-01' where id = v_rule;
      insert into hr.jurisdiction_rule (organization_id, visibility, rule_class_id, jurisdiction_key,
        effective_from, parameters, status, basis, citation, source_scope, supersedes_id)
      select v_sys,'public'::platform.visibility, rule_class_id,'US', date '2027-01-01',
        parameters,'active',
        'Probe row: an amendment to the federal I-9 rule, to prove it cannot reach a snapshot written before it.',
        citation,'statutory', v_rule
        from hr.jurisdiction_rule where id = v_rule;
      v_obs := jsonb_build_object(
        'snapshot_written', v_snap is not null,
        'cites_rule_id', (select resolution#>>'{resolved,i9-section2-deadline,rules,0,rule_id}'
                            from hr.calculation_snapshot where id = v_snap) is not null,
        'cited_version_unchanged',
          (select (resolution#>>'{resolved,i9-section2-deadline,rules,0,rule_version}')::integer
             from hr.calculation_snapshot where id = v_snap) = v_ver,
        'section2_due_unchanged',
          (select outputs->>'section2_due_date' from hr.calculation_snapshot where id = v_snap)
          = '2026-04-09');
    else
      raise exception 'unknown_probe: %', p_probe;
    end if;

    raise exception '__ROLLBACK_PROBE__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_PROBE__' then
      v_obs := v_obs || jsonb_build_object('probe_error', sqlerrm);
    end if;
  end;
  return v_obs;
end
$fn$;

-- ============================================================================
-- 6. hr.run_rule_fixtures (section 6.1).
-- ============================================================================
create or replace function hr.run_rule_fixtures(p_codes text[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_f record; v_actual jsonb; v_pass boolean; v_err text;
  v_results jsonb := '[]'::jsonb; v_pass_n integer := 0; v_fail_n integer := 0; v_pend integer := 0;
  v_ev jsonb; v_harness text;
begin
  for v_f in
    select t.*, rc.slug as class_slug
      from hr.jurisdiction_rule_test t
      join hr.jurisdiction_rule_class rc on rc.id = t.rule_class_id
     where t.deleted_at is null and (p_codes is null or t.code = any(p_codes))
     order by t.code
  loop
    v_actual := null; v_err := null; v_harness := coalesce(v_f.input->>'harness','calc');
    begin
      if v_harness = 'calc' then
        v_ev := hr.jurisdiction_evaluate(v_f.input->>'kind', v_f.jurisdiction_key, v_f.as_of_date,
                  v_f.facts, v_f.input, coalesce((v_f.input->>'organization_id')::uuid,
                  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid));
        -- the assertable surface is the RESULT plus the envelope facts a fixture may name
        v_actual := coalesce(v_ev->'result','{}'::jsonb) || jsonb_build_object(
          'flags', v_ev->'flags', 'no_rule', v_ev->'no_rule', 'advisory', v_ev->'advisory',
          'incomplete', v_ev->'incomplete', 'money_withheld', v_ev->'money_withheld',
          'rules_applied', v_ev->'rules_applied');

      elsif v_harness = 'elapsed' then
        v_actual := jsonb_build_object('elapsed_hours', hr.elapsed_hours(
          (v_f.input->>'start_local')::timestamp, (v_f.input->>'end_local')::timestamp,
          v_f.input->>'tz'));

      elsif v_harness = 'resolve' then
        v_ev := hr.resolve_rules(null, null, v_f.as_of_date,
                  (select array_agg(x) from jsonb_array_elements_text(v_f.input->'classes') x),
                  v_f.facts, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v_f.jurisdiction_key);
        v_actual := v_ev || jsonb_build_object(
          'chain_length', jsonb_array_length(v_ev->'chain'),
          'classes_accounted', (
            select count(distinct c) from (
              select jsonb_object_keys(v_ev->'resolved') c
              union all select jsonb_array_elements_text(v_ev->'no_rule')
              union all select x->>'class' from jsonb_array_elements(v_ev->'incomplete') x) s),
          'outcomes', (select jsonb_object_agg(t->>'jurisdiction_key', t->>'outcome')
                         from jsonb_array_elements(v_ev->'trace') t));

      elsif v_harness = 'config' then
        v_actual := hr.validate_org_config(
          coalesce((v_f.input->>'organization_id')::uuid,'5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid),
          v_f.class_slug, v_f.input->'parameters',
          (select array_agg(x) from jsonb_array_elements_text(v_f.input->'jurisdiction_keys') x),
          v_f.as_of_date);

      elsif v_harness = 'probe' then
        v_actual := hr._run_fixture_probe(v_f.input->>'probe', v_f.input);
      else
        raise exception 'unknown_harness: %', v_harness;
      end if;
    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is not null then
      v_pass := false;
    else
      -- jsonb containment IS the assertion: a fixture states the keys it cares about and the
      -- engine may return more. Both 'exact' and 'property' modes use it -- the difference is in
      -- what the fixture asserts, not in how it is compared.
      v_pass := v_actual @> v_f.expected;
    end if;

    if v_pass then v_pass_n := v_pass_n + 1; else v_fail_n := v_fail_n + 1; end if;
    if v_f.expected_status = 'pending_verification' then v_pend := v_pend + 1; end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'code', v_f.code, 'title', v_f.title, 'class', v_f.class_slug,
      'jurisdiction_key', v_f.jurisdiction_key, 'passed', v_pass,
      'expected_status', v_f.expected_status, 'assertion_mode', v_f.assertion_mode,
      'expected', case when v_pass then null else v_f.expected end,
      'actual', case when v_pass then null else v_actual end,
      'error', v_err));
  end loop;

  return jsonb_build_object(
    'total', v_pass_n + v_fail_n, 'passed', v_pass_n, 'failed', v_fail_n,
    'pending_verification', v_pend, 'green', v_fail_n = 0,
    'ran_at', now(), 'results', v_results);
end
$fn$;

comment on function hr.run_rule_fixtures(text[]) is
  'SPEC-JURISDICTION 6.1: executes every fixture against the live engines and returns pass/fail '
  'per code with the diff. Two blocking gates ride on it -- a rule cannot be promoted to active '
  'while a fixture for it fails or is pending_verification (enforced by the trigger on '
  'hr.jurisdiction_rule), and a red suite blocks the release.';
