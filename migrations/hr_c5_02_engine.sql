-- HR domain, C5 / register item HRB-009, file 02 of 05.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md sections 2 (the exact resolution
-- algorithm, all six steps in order), 3.2/3.4 (the config-validation contract and runtime
-- clamps), 4 (calculation snapshots, the append-only rule and amendment-vs-correction), 6.1
-- (the promotion gate) and 7.2 (the SQL surface). R-CORE-READINESS B14 for the compliance-
-- exception seam: C5 must NOT create hr.compliance_exception -- it ships the raise path behind
-- ONE function which writes an ops.system_error today and is repointed by L9 later.
--
-- 🚨 RECORDED DECISION -- SECTION 2.0 SAYS jurisdiction_key, LIVE TABLES SAY jurisdiction_id.
-- Section 2.0 has the resolver read `jurisdiction_key` off the subject row. Live, only four hr
-- tables carry a `jurisdiction_key text` column (calculation_snapshot, jurisdiction_rule,
-- jurisdiction_rule_test, payroll_export_line); the sixteen OPERATIONAL subject tables the
-- consumers in 7.4 actually pass -- punch, work_interval, workweek, shift, leave_case,
-- attendance_exception, time_adjustment, new_hire_report, records_request and the rest -- carry
-- `jurisdiction_id uuid` FK instead. Reading only the text column would make step 0 fail on
-- every real subject. The resolver therefore reads EITHER, preferring the text column, and the
-- AR 1.4 enforcement is identical in both shapes: the stamped value wins and a disagreeing
-- caller-supplied key is refused. SPEC-JURISDICTION 2.0 owes one line naming both shapes.
--
-- Idempotent. Applied live as migration `hr_c5_02_engine`.

set local lock_timeout = '20s';

-- ============================================================================
-- 1. hr.jurisdiction_chain (section 2.1) -- most specific to least specific.
-- ============================================================================
create or replace function hr.jurisdiction_chain(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
declare v_out jsonb;
begin
  if p_key is null then
    raise exception 'hr.jurisdiction_chain: no jurisdiction key supplied'
      using errcode = '22004', hint = 'SPEC-JURISDICTION 2.1';
  end if;
  if not exists (select 1 from hr.jurisdiction j where j.key = p_key and j.deleted_at is null) then
    -- section 2.1: a key with no row is a HARD ERROR, never a silent fallback to federal.
    raise exception 'unknown_jurisdiction: %', p_key
      using errcode = 'P0001',
            hint = 'SPEC-JURISDICTION 2.1: a key with no hr.jurisdiction row is a hard error, never a silent fallback to federal.';
  end if;

  with recursive walk as (
    select j.key, j.level, j.name, j.parent_key, 0 as depth
      from hr.jurisdiction j where j.key = p_key and j.deleted_at is null
    union all
    select p.key, p.level, p.name, p.parent_key, w.depth + 1
      from hr.jurisdiction p join walk w on p.key = w.parent_key
     where p.deleted_at is null
  )
  select jsonb_agg(jsonb_build_object('key', key, 'level', level, 'name', name) order by depth)
    into v_out from walk;

  return v_out;
end
$fn$;

-- ============================================================================
-- 2. Step 0's reader (section 2.0) -- the AR 1.4 enforcement point.
-- ============================================================================
create or replace function hr._subject_jurisdiction_key(p_subject_type text, p_subject_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_schema text; v_table text; v_key text; v_has_key boolean; v_has_id boolean;
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_subject_type;
  if v_schema is null then
    raise exception 'unknown_subject_type: % is not a registered entity token', p_subject_type
      using errcode = 'P0001';
  end if;

  select exists (select 1 from information_schema.columns c
                  where c.table_schema = v_schema and c.table_name = v_table
                    and c.column_name = 'jurisdiction_key'),
         exists (select 1 from information_schema.columns c
                  where c.table_schema = v_schema and c.table_name = v_table
                    and c.column_name = 'jurisdiction_id')
    into v_has_key, v_has_id;

  if v_has_key then
    execute format('select t.jurisdiction_key from %I.%I t where t.id = $1', v_schema, v_table)
      into v_key using p_subject_id;
  elsif v_has_id then
    execute format(
      'select j.key from %I.%I t join hr.jurisdiction j on j.id = t.jurisdiction_id where t.id = $1',
      v_schema, v_table) into v_key using p_subject_id;
  else
    raise exception 'subject_carries_no_jurisdiction: %.% has neither jurisdiction_key nor jurisdiction_id',
      v_schema, v_table using errcode = 'P0001',
      hint = 'SPEC-JURISDICTION 2.0 / AR 1.4: jurisdiction is STAMPED on the record. A subject that does not carry it cannot be resolved for.';
  end if;

  if v_key is null then
    raise exception 'subject_not_found_or_unstamped: % %', p_subject_type, p_subject_id
      using errcode = 'P0001';
  end if;
  return v_key;
end
$fn$;

-- ============================================================================
-- 3. Applicability (section 1.4). A MISSING FACT IS NEVER TREATED AS FALSE.
-- ============================================================================
create or replace function hr._applicability_verdict(p_applicability jsonb, p_facts jsonb)
returns jsonb
language plpgsql
immutable
as $fn$
declare
  v_pred jsonb; v_fact text; v_op text; v_val jsonb; v_have jsonb; v_ok boolean;
begin
  if p_applicability is null or jsonb_typeof(p_applicability) <> 'array'
     or jsonb_array_length(p_applicability) = 0 then
    return jsonb_build_object('verdict','applies');
  end if;

  for v_pred in select jsonb_array_elements(p_applicability) loop
    v_fact := v_pred->>'fact';
    v_op   := coalesce(v_pred->>'op', 'eq');
    v_val  := v_pred->'value';
    v_have := coalesce(p_facts, '{}'::jsonb) -> v_fact;

    -- 🚨 section 1.4: neither applied nor discarded. The rule is INCOMPLETE with the fact named.
    if v_have is null or jsonb_typeof(v_have) = 'null' then
      return jsonb_build_object('verdict','incomplete','fact', v_fact);
    end if;

    v_ok := case v_op
      when 'eq'  then v_have = v_val
      when 'neq' then v_have <> v_val
      when 'in'  then v_val @> jsonb_build_array(v_have)
      when 'not_in' then not (v_val @> jsonb_build_array(v_have))
      when 'gte' then (v_have#>>'{}')::numeric >= (v_val#>>'{}')::numeric
      when 'gt'  then (v_have#>>'{}')::numeric >  (v_val#>>'{}')::numeric
      when 'lte' then (v_have#>>'{}')::numeric <= (v_val#>>'{}')::numeric
      when 'lt'  then (v_have#>>'{}')::numeric <  (v_val#>>'{}')::numeric
      when 'naics_prefix' then exists (
        select 1 from jsonb_array_elements_text(case when jsonb_typeof(v_val)='array' then v_val
                                                     else jsonb_build_array(v_val) end) x(p)
         where (v_have#>>'{}') like x.p || '%')
      else null
    end;

    if v_ok is null then
      raise exception 'unknown_applicability_op: %', v_op using errcode = 'P0001';
    end if;
    if not v_ok then
      return jsonb_build_object('verdict','not_applicable',
                                'reason', format('applicability %s %s %s not met', v_fact, v_op, v_val));
    end if;
  end loop;

  return jsonb_build_object('verdict','applies');
end
$fn$;

-- ============================================================================
-- 4. The compliance-exception seam (R-CORE B14). ONE function; L9 repoints its body.
-- ============================================================================
create or replace function hr.raise_compliance_exception(
  p_organization_id uuid, p_jurisdiction_key text, p_rule_id uuid, p_rule_version integer,
  p_class text, p_code text, p_message text, p_org_config_ref jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare v_id uuid;
begin
  -- hr.compliance_exception is SPEC-DATA-MODEL section 16's table and belongs to lane L9. Until
  -- it lands, the evidence is KEPT rather than dropped: one ops.system_error row per occurrence,
  -- carrying every field section 3.4 names, so L9's backfill has something to read. When L9
  -- ships the table, ONLY THIS BODY changes -- no call site moves.
  insert into ops.system_error (organization_id, kind, error_type, error_text, context, source_app)
  values (p_organization_id, 'hr_compliance_exception_pending', p_code, p_message,
          jsonb_build_object('jurisdiction_key', p_jurisdiction_key, 'rule_id', p_rule_id,
                             'rule_version', p_rule_version, 'class', p_class,
                             'org_config_ref', p_org_config_ref,
                             'owed_to', 'SPEC-DOMAIN-WIDE / L9 hr.compliance_exception'),
          'hr.jurisdiction')
  returning id into v_id;
  return v_id;
end
$fn$;

-- ============================================================================
-- 5. hr.resolve_rules -- ALL SIX STEPS IN ORDER (section 2).
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
  v_missing text; v_cls record; v_v jsonb;
  v_win_rank integer; v_env jsonb; v_preempt_id uuid; v_preempt_state text;
  v_rules jsonb; v_i integer; v_n integer;
  -- parallel candidate arrays. Deliberately NOT a temp table: hr.resolve_rules is STABLE and is
  -- called from inside queries, and DDL in that position is a landmine.
  a_id uuid[]; a_ver integer[]; a_jk text[]; a_lvl text[]; a_rank integer[]; a_status text[];
  a_params jsonb[]; a_appl jsonb[]; a_org uuid[]; a_out text[]; a_reason text[];
begin
  if p_as_of is null then
    raise exception 'as_of_required' using errcode = '22004',
      hint = 'SPEC-JURISDICTION 2.2 / 7.5: p_as_of is the WORK or EVENT date. Never now().';
  end if;

  -- ---------------------------------------------------------------- step 0 (section 2.0)
  if p_subject_id is not null then
    v_stamped := hr._subject_jurisdiction_key(p_subject_type, p_subject_id);
    if p_jurisdiction_key is not null and p_jurisdiction_key <> v_stamped then
      -- 🚨 AR 1.4 enforced, not documented: an engine cannot recompute a historical record's
      -- jurisdiction from the employee's current address even by accident.
      raise exception 'jurisdiction_key_mismatch: record is stamped %, caller passed %',
        v_stamped, p_jurisdiction_key
        using errcode = 'P0001',
              hint = 'SPEC-JURISDICTION 2.0 / AR 1.4: jurisdiction comes from the stamped record. p_jurisdiction_key is accepted only when p_subject_id is null (prospective mode).';
    end if;
    v_key := v_stamped;
  else
    if p_jurisdiction_key is null then
      raise exception 'jurisdiction_key_required_in_prospective_mode' using errcode = '22004';
    end if;
    v_key := p_jurisdiction_key;
  end if;

  -- ---------------------------------------------------------------- step 1 (section 2.1)
  v_chain := hr.jurisdiction_chain(v_key);
  select array_agg(x->>'key') into v_chain_keys from jsonb_array_elements(v_chain) x;

  v_missing := hr._knob('hr.jurisdiction_rules','missing_fact_behavior') #>> '{}';

  for v_cls in
    select rc.* from hr.jurisdiction_rule_class rc
     where rc.slug = any(p_classes) and rc.is_active and rc.deleted_at is null
  loop
    -- ------------------------------------------------------------ step 2 (section 2.2)
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

    -- ------------------------------------------------------------ step 3 (section 2.3)
    -- the org row REPLACES the system row at the same (class, jurisdiction); the replaced row
    -- is recorded in the trace with its id, never silently dropped.
    for v_i in 1 .. v_n loop
      if a_org[v_i] = v_sys and exists (
           select 1 from generate_subscripts(a_id, 1) k
            where a_org[k] = p_organization_id and a_org[k] <> v_sys and a_jk[k] = a_jk[v_i]) then
        a_out[v_i] := 'overridden_by_org';
      end if;
    end loop;

    -- ------------------------------------------------------------ step 4 (section 2.4)
    -- BEFORE precedence, so a preempted city ordinance can never win a specificity contest.
    if v_cls.supports_preemption then
      v_preempt_id := null; v_preempt_state := null;
      for v_i in 1 .. v_n loop
        if a_out[v_i] is null and a_lvl[v_i] = 'state'
           and a_params[v_i]->>'mode' = 'preempt_local' then
          v_preempt_id := a_id[v_i]; v_preempt_state := a_jk[v_i];
          exit;
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

    -- ------------------------------------------------------------ applicability (section 1.4)
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
            -- the knob's platform default. A defaulted fact is how a compliance engine ships a
            -- confident wrong answer, so by default the CALL fails rather than the rule silently
            -- disappearing from the answer.
            raise exception 'missing_applicability_fact: class % needs fact % (rule %)',
              v_cls.slug, v_v->>'fact', a_id[v_i]
              using errcode = 'P0001',
                    hint = 'SPEC-JURISDICTION 1.4: supply the fact, or set hr.jurisdiction_rules.missing_fact_behavior to flag.';
          end if;
        end if;
      end if;
    end loop;

    -- ------------------------------------------------------------ step 5 (section 2.5)
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

    -- ------------------------------------------------------------ step 6 (section 2.6)
    select jsonb_agg(jsonb_build_object(
             'rule_id', a_id[k], 'rule_version', a_ver[k], 'jurisdiction_key', a_jk[k],
             'level', a_lvl[k], 'status', a_status[k], 'parameters', a_params[k],
             'organization_id', a_org[k]) order by a_rank[k], a_id[k])
      into v_rules
      from generate_subscripts(a_id, 1) k where a_out[k] = 'applied';

    if v_rules is null then
      v_no_rule := v_no_rule || v_cls.slug;
      -- section 2.7: absence is never uniform. Two classes cannot legitimately be empty.
      if v_cls.slug in ('overtime','double-time','i9-section2-deadline') then
        raise exception 'rule_data_defect: class % resolved zero rules for % as of % -- a federal row must always exist',
          v_cls.slug, v_key, p_as_of
          using errcode = 'P0001', hint = 'SPEC-JURISDICTION 2.7';
      end if;
    else
      if v_cls.precedence_mode = 'legality_constraint' then
        -- the BINDING ENVELOPE: the intersection of every surviving candidate's constraints,
        -- most restrictive in each dimension. Consumed by the config validator, not a calc engine.
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

    -- THE TRACE CARRIES EVERY CANDIDATE CONSIDERED, INCLUDING THOSE THAT LOST. "We considered the
    -- federal meal-break rule and it does not apply" is a materially different audit answer from
    -- "we never looked", and only the trace can tell them apart.
    v_trace := v_trace || coalesce((
      select jsonb_agg(jsonb_build_object(
               'rule_id', a_id[k], 'rule_version', a_ver[k], 'jurisdiction_key', a_jk[k],
               'class', v_cls.slug, 'status', a_status[k], 'outcome', a_out[k], 'reason', a_reason[k])
             order by a_rank[k], a_id[k])
        from generate_subscripts(a_id, 1) k), '[]'::jsonb);
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of,
    'jurisdiction_key', v_key,
    'chain', (select jsonb_agg(x->>'key') from jsonb_array_elements(v_chain) x),
    'resolved', v_resolved,
    'trace', v_trace,
    'incomplete', v_incomplete,
    'advisory', to_jsonb(v_advisory),
    'no_rule', to_jsonb(v_no_rule),
    'prospective', (p_subject_id is null));
end
$fn$;

-- ============================================================================
-- 6. The legality envelope (section 2.5, legality_constraint mode).
-- ============================================================================
create or replace function hr._legality_envelope(p_class text, p_rules jsonb)
returns jsonb
language plpgsql
immutable
as $fn$
declare v_r jsonb; v_out jsonb := '{}'::jsonb; v_p jsonb;
begin
  if p_class = 'rounding-bounds' then
    v_out := jsonb_build_object('max_increment_minutes', null, 'allowed_modes', null,
                                'neutrality_required', false);
    for v_r in select jsonb_array_elements(p_rules) loop
      v_p := v_r->'parameters';
      -- tightest increment wins
      if v_p ? 'max_increment_minutes' and jsonb_typeof(v_p->'max_increment_minutes') = 'number' then
        if v_out->'max_increment_minutes' is null or jsonb_typeof(v_out->'max_increment_minutes') = 'null'
           or (v_p->>'max_increment_minutes')::numeric < (v_out->>'max_increment_minutes')::numeric then
          v_out := jsonb_set(v_out, '{max_increment_minutes}', v_p->'max_increment_minutes');
        end if;
      end if;
      -- allowed modes INTERSECT
      if jsonb_typeof(v_p->'allowed_modes') = 'array' then
        if v_out->'allowed_modes' is null or jsonb_typeof(v_out->'allowed_modes') = 'null' then
          v_out := jsonb_set(v_out, '{allowed_modes}', v_p->'allowed_modes');
        else
          v_out := jsonb_set(v_out, '{allowed_modes}', coalesce((
            select jsonb_agg(m) from jsonb_array_elements_text(v_out->'allowed_modes') m
             where v_p->'allowed_modes' @> jsonb_build_array(m.value)), '[]'::jsonb));
        end if;
      end if;
      -- strictest neutrality: any rule requiring it requires it
      if (v_p->>'neutrality_required')::boolean is true then
        v_out := jsonb_set(v_out, '{neutrality_required}', 'true'::jsonb);
      end if;
    end loop;

  elsif p_class = 'pto-carryover-legality' then
    v_out := jsonb_build_object('forfeiture_allowed', true, 'cap_allowed', true);
    for v_r in select jsonb_array_elements(p_rules) loop
      v_p := v_r->'parameters';
      -- ANY level forbidding forfeiture forbids it everywhere below (section 1.5 comparator)
      if (v_p->>'forfeiture_allowed')::boolean is false then
        v_out := jsonb_set(v_out, '{forfeiture_allowed}', 'false'::jsonb);
      end if;
      if (v_p->>'cap_allowed')::boolean is false then
        v_out := jsonb_set(v_out, '{cap_allowed}', 'false'::jsonb);
      end if;
    end loop;
  else
    raise exception 'no_envelope_for_class: % is not a legality_constraint class', p_class
      using errcode = 'P0001';
  end if;
  return v_out;
end
$fn$;

-- ============================================================================
-- 7. hr.validate_org_config (section 3.2) -- A VIOLATION IS A REFUSAL, NOT A CLAMP.
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
  v_action text;
begin
  if not exists (select 1 from hr.jurisdiction_rule_class where slug = p_class and deleted_at is null) then
    raise exception 'unknown_rule_class: %', p_class using errcode = 'P0001';
  end if;

  v_action := hr._knob('hr.jurisdiction_rules','config_violation_action') #>> '{}';

  -- section 3.2: when p_jurisdiction_keys is NULL, validate against EVERY jurisdiction the
  -- organization currently operates in, derived from active establishments.
  if p_jurisdiction_keys is null then
    select array_agg(distinct j.key) into v_keys
      from hr.establishment e
      join hr.jurisdiction j on j.id = e.jurisdiction_id
     where e.organization_id = p_organization_id and e.deleted_at is null;
    v_keys := coalesce(v_keys, '{}'::text[]);
  else
    v_keys := p_jurisdiction_keys;
  end if;

  foreach v_key in array v_keys loop
    select j.name into v_name from hr.jurisdiction j where j.key = v_key;
    v_res := hr.resolve_rules(null, null, p_as_of, array[p_class], '{}'::jsonb,
                              p_organization_id, v_key);

    for v_rule in select jsonb_array_elements(coalesce(v_res#>array['resolved',p_class,'rules'], '[]'::jsonb)) loop
      v_p := v_rule->'parameters';
      v_status := v_rule->>'status';
      select r.citation into v_cite from hr.jurisdiction_rule r where r.id = (v_rule->>'rule_id')::uuid;

      -- section 3.2 rule 5: AN ADVISORY RULE NEVER PRODUCES A VIOLATION. It may raise a warning;
      -- it may never block a customer's configuration on an unverified number.
      if v_status = 'advisory' then
        v_advisory := v_advisory || jsonb_build_array(v_rule->>'rule_id');
      end if;

      select count(*) into v_affected
        from hr.employment em
        join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
             and pa.effective_from <= p_as_of
             and (pa.effective_to is null or pa.effective_to > p_as_of)
             and pa.deleted_at is null
        join hr.location loc on loc.id = pa.location_id
        join hr.jurisdiction jj on jj.id = loc.jurisdiction_id
       where em.organization_id = p_organization_id and em.status = 'active'
         and em.deleted_at is null and jj.key = v_key;

      -- ---------------------------------------------------- pto-carryover-legality
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
            -- section 3.2 rule 2: THIS SENTENCE SHIPS VERBATIM. It is written for the HR
            -- administrator, names the jurisdiction, says plainly what is not allowed, and
            -- states the lawful alternative.
            'message', v_name || ' does not allow a use-it-or-lose-it vacation policy — accrued '
                    || 'vacation is earned wages that cannot be forfeited. You can cap how much an '
                    || 'employee accrues (accrual stops at the cap until they use time), but unused '
                    || 'time cannot expire. Set a cap instead of forfeiture.',
            'citation', v_cite, 'affected_employees', v_affected));
        end if;
      end if;

      -- ---------------------------------------------------- sick-leave-floor
      if p_class = 'sick-leave-floor' and v_status = 'active'
         and jsonb_typeof(v_p->'accrual') = 'object' then
        if (p_parameters#>>'{accrual,per_hours_worked}') is not null
           and (v_p#>>'{accrual,per_hours_worked}') is not null
           and (p_parameters#>>'{accrual,per_hours_worked}')::numeric
               > (v_p#>>'{accrual,per_hours_worked}')::numeric then
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'rule_id', v_rule->>'rule_id', 'rule_version', v_rule->>'rule_version',
            'field', 'accrual.per_hours_worked',
            'configured', p_parameters#>>'{accrual,per_hours_worked}',
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
            'rule_id', v_rule->>'rule_id', 'rule_version', v_rule->>'rule_version',
            'field', 'use_permitted_after_days',
            'configured', p_parameters->>'use_permitted_after_days',
            'required', v_p->'use_permitted_after_days', 'code', 'waiting_period_too_long',
            'message', format('%s lets employees start using sick leave after %s days. Your policy makes '
                           || 'them wait longer, which is not allowed. A shorter wait is fine.',
                           v_name, v_p->>'use_permitted_after_days'),
            'citation', v_cite, 'affected_employees', v_affected));
        end if;
      end if;
    end loop;

    -- ---------------------------------------------------- rounding-bounds (envelope class)
    if p_class = 'rounding-bounds' then
      v_env := v_res#>array['resolved',p_class,'envelope'];
      if v_env is not null then
        -- Is the tightest bound coming from an ADVISORY rule? Then it warns, never rejects.
        v_status := case when exists (
            select 1 from jsonb_array_elements(coalesce(v_res#>array['resolved',p_class,'rules'],'[]'::jsonb)) x
             where x->>'status' = 'advisory'
               and (x#>>'{parameters,max_increment_minutes}')::numeric
                   = (v_env->>'max_increment_minutes')::numeric)
          then 'advisory' else 'active' end;

        if (p_parameters->>'increment_minutes') is not null
           and (v_env->>'max_increment_minutes') is not null
           and (p_parameters->>'increment_minutes')::numeric > (v_env->>'max_increment_minutes')::numeric then
          if v_status = 'advisory' then
            v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
              'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
              'field', 'increment_minutes', 'configured', p_parameters->>'increment_minutes',
              'code', 'increment_exceeds_unverified_bound',
              'message', format('We have not yet verified %s''s rounding rules. The value we hold is %s '
                             || 'minutes, which your setting exceeds — this is a warning, not a refusal.',
                             v_name, v_env->>'max_increment_minutes')));
          else
            v_violations := v_violations || jsonb_build_array(jsonb_build_object(
              'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
              'rule_id', (select x->>'rule_id' from jsonb_array_elements(v_res#>array['resolved',p_class,'rules']) x
                           where (x#>>'{parameters,max_increment_minutes}')::numeric
                                 = (v_env->>'max_increment_minutes')::numeric limit 1),
              'field', 'increment_minutes', 'configured', p_parameters->>'increment_minutes',
              'required', v_env, 'code', 'increment_exceeds_bound',
              'message', format('%s permits rounding punches to at most %s minutes. You have set %s '
                             || 'minutes. Lower it to %s or turn rounding off.',
                             v_name, v_env->>'max_increment_minutes',
                             p_parameters->>'increment_minutes', v_env->>'max_increment_minutes'),
              'affected_employees', v_affected));
          end if;
        end if;

        if (p_parameters->>'mode') is not null and jsonb_typeof(v_env->'allowed_modes') = 'array'
           and not (v_env->'allowed_modes' @> jsonb_build_array(p_parameters->>'mode'))
           and jsonb_array_length(v_env->'allowed_modes') > 0 then
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'jurisdiction_key', v_key, 'jurisdiction_name', v_name, 'class', p_class,
            'field', 'mode', 'configured', p_parameters->>'mode', 'required', v_env,
            'code', 'rounding_mode_not_neutral',
            'message', format('Rounding must not systematically favour the employer. "%s" always moves '
                           || 'time in one direction, so it fails that test. Use "nearest", which rounds '
                           || 'up and down equally.', p_parameters->>'mode'),
            'affected_employees', v_affected));
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', (jsonb_array_length(v_violations) = 0 or v_action = 'warn'),
    'action', v_action,
    'violations', v_violations,
    'warnings', v_warnings,
    'advisory_rules_consulted', v_advisory,
    'jurisdictions_checked', to_jsonb(v_keys));
end
$fn$;

-- ============================================================================
-- 8. Calculation snapshots (section 4). Append-only, one writer, one reader.
-- ============================================================================
create or replace function hr.write_calculation_snapshot(
  p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text,
  p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text,
  p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb,
  p_actor_type text, p_actor_id uuid default null, p_employment_id uuid default null,
  p_clamps jsonb default '[]'::jsonb, p_prospective boolean default false,
  p_supersedes_id uuid default null, p_recalculation_batch_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare v_id uuid; v_prev boolean;
begin
  v_prev := coalesce(current_setting('hr.privileged_write', true), '') in ('on','true','1','yes');
  if not v_prev then perform set_config('hr.privileged_write','on', true); end if;

  insert into hr.calculation_snapshot (
    organization_id, subject_type, subject_id, employment_id, calculation_kind, jurisdiction_key,
    as_of_date, engine_key, engine_version, resolution, applicability_facts, inputs, outputs,
    clamps, prospective, supersedes_id, recalculation_batch_id, actor_type, actor_id)
  values (
    p_organization_id, p_subject_type, p_subject_id, p_employment_id, p_calculation_kind,
    p_jurisdiction_key, p_as_of, p_engine_key, p_engine_version, p_resolution,
    p_applicability_facts, p_inputs, p_outputs, p_clamps, p_prospective, p_supersedes_id,
    p_recalculation_batch_id, p_actor_type, p_actor_id)
  returning id into v_id;

  -- section 4.5: the supersession chain is set on the OLD row, once, by the recompute path.
  if p_supersedes_id is not null then
    update hr.calculation_snapshot set superseded_by_id = v_id
     where id = p_supersedes_id and superseded_by_id is null;
  end if;

  return v_id;
end
$fn$;

-- 🚨 section 4.5: THERE IS NO CODE PATH THAT MUTATES A WRITTEN SNAPSHOT. UPDATE is permitted for
-- exactly one column (superseded_by_id, NULL -> value, once) and everything else raises.
create or replace function hr._calculation_snapshot_append_only()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'hr.calculation_snapshot is evidence and is never deleted'
      using errcode = '42501', hint = 'SPEC-JURISDICTION 4.5';
  end if;
  if old.superseded_by_id is not null and new.superseded_by_id is distinct from old.superseded_by_id then
    raise exception 'hr.calculation_snapshot.superseded_by_id is set once and never changed'
      using errcode = '42501', hint = 'SPEC-JURISDICTION 4.5';
  end if;
  if to_jsonb(new) - 'superseded_by_id' - 'updated_at' - 'updated_by' - 'version'
     is distinct from to_jsonb(old) - 'superseded_by_id' - 'updated_at' - 'updated_by' - 'version' then
    raise exception 'hr.calculation_snapshot: only superseded_by_id may be updated (NULL to value, once)'
      using errcode = '42501',
            hint = 'SPEC-JURISDICTION 4.5: a recompute writes a NEW snapshot. It never edits one.';
  end if;
  return new;
end
$fn$;

drop trigger if exists _zz_calculation_snapshot_append_only on hr.calculation_snapshot;
create trigger _zz_calculation_snapshot_append_only
  before update or delete on hr.calculation_snapshot
  for each row execute function hr._calculation_snapshot_append_only();

-- section 4.1: the payload columns are client-excluded, so payloads are read ONLY here, and the
-- read is audited. This is AR 1.18's audited read path applied to the evidence table.
create or replace function hr.rpc_calculation_snapshot_get(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare v_row hr.calculation_snapshot; v_allowed boolean := false; v_uid uuid := auth.uid();
begin
  select * into v_row from hr.calculation_snapshot where id = p_snapshot_id;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- employee-self / manager-of-that-employment / HR-admin. The derived-role machinery is
  -- HRB-007's (SPEC-ACCESS); until it lands this door is FAIL-CLOSED for everyone except the
  -- subject of the employment and the service role, and it says so rather than pretending.
  if v_uid is not null and v_row.employment_id is not null then
    select exists (
      select 1 from hr.employment em join hr.employee e on e.id = em.employee_id
       where em.id = v_row.employment_id and e.login_user_id = v_uid) into v_allowed;
  end if;
  if current_user = 'service_role' then v_allowed := true; end if;

  -- 🚨 core-tranche-4's finding, honoured: AN AUDIT ROW WRITTEN BEFORE A `RAISE` IS ROLLED BACK
  -- BY THAT RAISE. A denial log holding only the denials that did not happen is worse than none,
  -- because it reads as evidence. So this door RETURNS a refusal envelope and never raises.
  perform set_config('hr.privileged_write', 'on', true);
  insert into hr.access_audit (organization_id, actor_type, actor_user_id, action, target_token,
                               target_ids, row_count, subject_employment_id, sensitivity_tier,
                               purpose, basis, is_self_access, granted, denial_reason, metadata)
  values (v_row.organization_id, 'employee', v_uid, 'read_calculation_snapshot',
          'hr_calculation_snapshot', array[p_snapshot_id], 1, v_row.employment_id, 'confidential',
          'calculation_evidence_review', 'SPEC-JURISDICTION 4.1 audited payload read (AR 1.18)',
          v_allowed, v_allowed,
          case when v_allowed then null
               else 'not the employment subject; derived HR roles are HRB-007' end,
          jsonb_build_object('calculation_kind', v_row.calculation_kind));

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
             'message', 'You do not have access to this calculation''s detail.');
  end if;

  return jsonb_build_object('ok', true, 'snapshot', to_jsonb(v_row));
end
$fn$;

-- ============================================================================
-- 9. THE PROMOTION GATE (section 6.1 gate 1).
-- ============================================================================
-- "A rule row CANNOT be promoted from advisory/draft to active while any fixture pinned to it,
-- or any fixture for its class at its jurisdiction, is failing or still pending_verification."
-- Scoped to PROMOTION, which is what 6.1 says: the section 5 seed set INSERTS rows at the status
-- section 5 assigns them, and an insert is not a promotion. Making the gate fire on insert would
-- make the spec's own seed data unloadable.
create or replace function hr._jurisdiction_rule_promotion_gate()
returns trigger language plpgsql as $fn$
declare v_blockers text;
begin
  if old.status in ('draft','advisory') and new.status = 'active' then
    select string_agg(t.code || ' (' || t.expected_status || ')', ', ' order by t.code)
      into v_blockers
      from hr.jurisdiction_rule_test t
     where t.deleted_at is null
       and (t.pinned_rule_id = new.id
            or (t.rule_class_id = new.rule_class_id and t.jurisdiction_key = new.jurisdiction_key))
       and t.expected_status = 'pending_verification';
    if v_blockers is not null then
      raise exception 'rule_promotion_blocked: fixtures still pending verification: %', v_blockers
        using errcode = 'P0001',
              hint = 'SPEC-JURISDICTION 6.1 gate 1: a fixture flips to asserted in the SAME commit that promotes its rule.';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists _zz_jurisdiction_rule_promotion_gate on hr.jurisdiction_rule;
create trigger _zz_jurisdiction_rule_promotion_gate
  before update of status on hr.jurisdiction_rule
  for each row execute function hr._jurisdiction_rule_promotion_gate();

-- ============================================================================
-- 10. ASSERTIONS
-- ============================================================================
do $$
declare v_chain jsonb; v_res jsonb;
begin
  v_chain := hr.jurisdiction_chain('US-CA-LOS_ANGELES');
  if jsonb_array_length(v_chain) <> 4 then
    raise exception 'hr_c5_02: the LA chain must be 4 deep (city, county, state, federal), got %', v_chain;
  end if;
  if (v_chain->0->>'key') <> 'US-CA-LOS_ANGELES' or (v_chain->3->>'key') <> 'US' then
    raise exception 'hr_c5_02: the chain must run most-specific to least-specific, got %', v_chain;
  end if;

  begin
    perform hr.jurisdiction_chain('US-XX-NOWHERE');
    raise exception 'hr_c5_02: an unknown jurisdiction key must be a hard error';
  exception when others then
    if sqlerrm not like 'unknown_jurisdiction%' then raise; end if;
  end;

  -- the federal overtime row must resolve for a plain federal call
  v_res := hr.resolve_rules(null, null, date '2026-03-17', array['overtime'],
             '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
             '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'US-TX');
  if jsonb_array_length(v_res#>'{resolved,overtime,rules}') <> 1 then
    raise exception 'hr_c5_02: US-TX overtime must resolve exactly the federal row, got %', v_res;
  end if;
end $$;
