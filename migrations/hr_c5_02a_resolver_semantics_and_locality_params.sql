-- HR domain, C5 / register item HRB-009, file 02a -- two corrections, both caught by probing.
--
-- CORRECTION 1 (DATA). The eleven Fair Workweek locality rows landed carrying two keys that
-- SPEC-JURISDICTION 5.5's literal parameter block does not contain: "applies": true and
-- "mode": "local_regime". They are not legal values -- they are structure -- but section 5.5
-- gives that block verbatim and the seed file on disk does not contain them, so live and the
-- authored file disagree. Live is corrected to the file. Nothing reads either key: coverage is
-- signalled by the ROW EXISTING (section 2.7), and the preemption pass reads `mode` only on
-- STATE rows, which keep theirs.
--
-- CORRECTION 2 (SEMANTICS), two defects in hr.resolve_rules, both found by running section 6.2's
-- own fixtures against it:
--
--   (a) `parameters.applies = false` MUST produce outcome `not_applicable` with reason
--       `parameters.applies=false`. Section 2.6's worked trace shows exactly that line, and
--       fixture MB-FED-01 asserts it ("no premium, no violation; trace records the federal rule
--       as not_applicable"). The first cut marked those rows `applied`, which made "there is no
--       federal meal break" look like an applied federal meal-break rule.
--
--   (b) 🚨 THE SECTION 2.7 DATA-DEFECT RAISE FIRED ON THE WRONG CONDITION, and it would have
--       broken real payroll. Section 2.7 says a zero result for overtime / double-time /
--       i9-section2-deadline is "impossible -- a federal row always exists", meaning the SEED IS
--       MISSING. The first cut raised whenever zero rules were APPLIED, which is a completely
--       different situation: an EXEMPT employee (fixture OT-CA-03) correctly has every overtime
--       candidate excluded by applicability, and a Texas double-time call correctly has the one
--       federal candidate return applies=false. Both are right answers, and both raised. The
--       raise now fires only when the candidate set was EMPTY -- nothing was even considered --
--       which is the only shape that actually means the seed is gone.
--
-- Idempotent. Applied live as migration `hr_c5_02a_resolver_semantics_and_locality_params`.

set local lock_timeout = '20s';

select set_config('hr.privileged_write', 'on', false);

-- ============================================================================
-- 1. The eleven locality rows match section 5.5 exactly.
-- ============================================================================
update hr.jurisdiction_rule r
   set parameters = r.parameters - 'applies' - 'mode'
  from hr.jurisdiction_rule_class rc, hr.jurisdiction j
 where rc.id = r.rule_class_id and j.key = r.jurisdiction_key
   and rc.slug = 'fair-workweek'
   and j.level in ('city','county')
   and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and r.deleted_at is null
   and (r.parameters ? 'applies' or r.parameters ? 'mode');

-- Oregon is section 5.5's one STATEWIDE covered locality, so it is a state-level row that is a
-- local-regime row in substance. It gets the same treatment as the ten cities/counties.
update hr.jurisdiction_rule r
   set parameters = r.parameters - 'applies' - 'mode'
  from hr.jurisdiction_rule_class rc
 where rc.id = r.rule_class_id
   and rc.slug = 'fair-workweek'
   and r.jurisdiction_key = 'US-OR'
   and r.status = 'advisory'
   and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and r.deleted_at is null
   and (r.parameters ? 'applies' or r.parameters ? 'mode');

-- ============================================================================
-- 2. hr.resolve_rules, corrected. Full body: this is the one live definition.
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

    -- 🚨 section 2.7, CORRECTED: the data-defect raise fires on an EMPTY CANDIDATE SET, which is
    -- the only shape that means "the federal row that must always exist is gone". Candidates that
    -- were considered and lost -- an exempt worker's overtime, a federal applies=false row -- are
    -- CORRECT ANSWERS and must never raise.
    if v_n = 0 and v_cls.slug in ('overtime','double-time','i9-section2-deadline') then
      raise exception 'rule_data_defect: class % has NO candidate rule at all for % as of % -- a federal row must always exist',
        v_cls.slug, v_key, p_as_of
        using errcode = 'P0001', hint = 'SPEC-JURISDICTION 2.7';
    end if;

    -- ------------------------------------------------------------ step 3 (section 2.3)
    for v_i in 1 .. v_n loop
      if a_org[v_i] = v_sys and exists (
           select 1 from generate_subscripts(a_id, 1) k
            where a_org[k] = p_organization_id and a_org[k] <> v_sys and a_jk[k] = a_jk[v_i]) then
        a_out[v_i] := 'overridden_by_org';
      end if;
    end loop;

    -- ------------------------------------------------------------ step 4 (section 2.4)
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
            raise exception 'missing_applicability_fact: class % needs fact % (rule %)',
              v_cls.slug, v_v->>'fact', a_id[v_i]
              using errcode = 'P0001',
                    hint = 'SPEC-JURISDICTION 1.4: supply the fact, or set hr.jurisdiction_rules.missing_fact_behavior to flag.';
          end if;
        -- section 2.6's worked trace: a rule that says "this jurisdiction imposes no such
        -- obligation" was CONSIDERED and does NOT APPLY. It is not an applied rule.
        elsif (a_params[v_i]->>'applies') = 'false' then
          a_out[v_i] := 'not_applicable'; a_reason[v_i] := 'parameters.applies=false';
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
-- 3. ASSERTIONS -- both corrections proven, not asserted.
-- ============================================================================
do $$
declare v_n integer; v_res jsonb;
begin
  select count(*) into v_n from hr.jurisdiction_rule r
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
   where rc.slug = 'fair-workweek' and r.status = 'advisory' and r.deleted_at is null
     and (r.parameters ? 'applies' or r.parameters ? 'mode');
  if v_n <> 0 then
    raise exception 'hr_c5_02a: % Fair Workweek locality row(s) still carry the invented keys', v_n;
  end if;

  -- the eleven preemption states KEEP their mode -- the preemption pass reads it
  select count(*) into v_n from hr.jurisdiction_rule r
    join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
   where rc.slug = 'fair-workweek' and r.parameters->>'mode' = 'preempt_local' and r.deleted_at is null;
  if v_n <> 11 then
    raise exception 'hr_c5_02a: expected 11 preemption-state rows, found %', v_n;
  end if;

  -- (a) MB-FED-01's assertion: US-TX meal-break records the federal rule as NOT APPLICABLE
  v_res := hr.resolve_rules(null, null, date '2026-03-17', array['meal-break'], '{}'::jsonb,
             '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'US-TX');
  if (v_res#>>'{trace,0,outcome}') <> 'not_applicable'
     or (v_res#>>'{trace,0,reason}') <> 'parameters.applies=false' then
    raise exception 'hr_c5_02a: US-TX meal-break must trace not_applicable/parameters.applies=false, got %',
      v_res->'trace';
  end if;
  if not (v_res->'no_rule' @> '["meal-break"]'::jsonb) then
    raise exception 'hr_c5_02a: US-TX meal-break must land in no_rule, got %', v_res->'no_rule';
  end if;

  -- (b) OT-CA-03's assertion: an EXEMPT worker resolves no overtime and DOES NOT RAISE
  v_res := hr.resolve_rules(null, null, date '2026-03-17', array['overtime','double-time'],
             '{"flsa_status":"exempt","worker_class":"employee"}'::jsonb,
             '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'US-CA');
  if not (v_res->'no_rule' @> '["overtime"]'::jsonb) then
    raise exception 'hr_c5_02a: an exempt worker must resolve no overtime rule, got %', v_res->'no_rule';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_res->'trace') t
                  where t->>'class' = 'overtime' and t->>'outcome' = 'not_applicable') then
    raise exception 'hr_c5_02a: the exempt exclusion must be visible in the trace, got %', v_res->'trace';
  end if;

  -- and the raise still fires when the seed really is gone: no candidate at all
  begin
    v_res := hr.resolve_rules(null, null, date '1899-01-01', array['overtime'],
               '{"flsa_status":"non_exempt","worker_class":"employee"}'::jsonb,
               '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'US-TX');
    raise exception 'hr_c5_02a: an empty overtime candidate set must raise a data defect';
  exception when others then
    if sqlerrm not like 'rule_data_defect%' then raise; end if;
  end;
end $$;

select set_config('hr.privileged_write', 'off', false);
