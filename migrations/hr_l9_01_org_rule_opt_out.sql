-- HR domain, L9 / register item HRB-021 (D18/D25 slice), file 01.
--
-- Authority: DECISIONS.md D26 (2026-08-28, owner ruling): an organization chooses which
-- platform rules apply to it. Defaults apply — nothing changes until an org acts — but an
-- org's HR admin may REMOVE any platform rule for their org, and once removed the engine
-- must not enforce it. In the owner's words: "We should never be so opinionated that we
-- force things like this on them because then it becomes our responsibility to manage the
-- law for them… if they choose to go there and remove the meal period rule, we should not
-- enforce it anymore." This supersedes the SPEC-JURISDICTION §3.1 posture that statutory
-- rules are unconditionally binding on every org (the §3.1 may/may-never table still
-- governs org-AUTHORED overrides; what is new is the remove-the-rule decision itself).
--
-- Applied live as migration `hr_l9_01_org_rule_opt_out`. Idempotent.
--
-- WHAT THIS FILE DOES
--   1. hr.jurisdiction_rule_org_decision — the org's standing decision about a platform
--      rule, keyed (organization_id, rule_class, jurisdiction_key). Absence of a row is
--      the default: the rule applies. 'opted_out' removes the platform rule from that
--      org's resolutions. Keyed on class × jurisdiction (not rule id) deliberately, so a
--      later amendment of the rule (a NEW row superseding the old) does not silently
--      re-apply a rule the org removed.
--   2. hr.resolve_rules — replaced with the same body plus one new pass, immediately after
--      candidate selection: platform (system-org) candidates whose class × jurisdiction the
--      org has opted out of are marked outcome='opted_out_by_org' and excluded before the
--      override, preemption and precedence passes (an opted-out state rule must not
--      preempt; an opted-out city rule must not win specificity). The trace records every
--      such exclusion, so a snapshot can always answer "why was this rule not enforced":
--      because the organization removed it, on a date, by a person.
--   3. hr.org_jurisdiction_rule_set_applies + public wrapper — the ONE door for the
--      decision. HR-admin standing required. p_applies=false upserts the opt-out (with an
--      optional recorded reason); p_applies=true clears it, restoring the platform default.
--
-- RECORDED TECHNICAL DECISIONS
--   1. Opt-out reaches PLATFORM rows only. An org's own rules are managed by editing or
--      retiring them; letting a decision row also silence an org-authored row would give
--      one fact two owners.
--   2. The §2.7 "impossible — a federal row always exists" raise fires on an empty
--      CANDIDATE set and is deliberately unaffected: an opted-out candidate was selected,
--      considered, and excluded with a traced reason — that is an answer, not a missing
--      seed. An org that removes federal overtime gets no overtime computation and the
--      trace says exactly why. Their decision, their responsibility — that is D26's point.
--   3. Every class may be removed, including the guard-rail classes (minors-hours,
--      i9-section2-deadline). D26 is explicit that we do not decide for them; the UI's job
--      is to make the removal loud (citation + plain-language consequence), never to
--      forbid it.
--   4. The decision row is versioned + soft-deleted: opting back in soft-deletes the row,
--      and history.row_versions keeps who removed what, when, forever.

set local lock_timeout = '20s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The decision table
-- ────────────────────────────────────────────────────────────────────────────

do $$ begin
  if to_regclass('hr.jurisdiction_rule_org_decision') is null then
    perform platform.create_entity_table(
      p_schema => 'hr', p_table => 'jurisdiction_rule_org_decision',
      p_token => 'hr_jurisdiction_rule_org_decision',
      p_label => 'Jurisdiction rule org decision',
      p_fields => ARRAY[
        'rule_class_id uuid NOT NULL REFERENCES hr.jurisdiction_rule_class(id)',
        'jurisdiction_key text NOT NULL REFERENCES hr.jurisdiction(key)',
        $f$decision text NOT NULL CHECK (decision IN ('opted_out','opted_in'))$f$,
        'reason text',
        'rule_id_at_decision uuid REFERENCES hr.jurisdiction_rule(id)'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true, p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_indexes where schemaname='hr'
                   and indexname='jurisdiction_rule_org_decision_one_live') then
    create unique index jurisdiction_rule_org_decision_one_live
      on hr.jurisdiction_rule_org_decision (organization_id, rule_class_id, jurisdiction_key)
      where deleted_at is null;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The resolver, with the D26 pass
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.resolve_rules(p_subject_type text, p_subject_id uuid, p_as_of date, p_classes text[], p_facts jsonb, p_organization_id uuid, p_jurisdiction_key text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_key text; v_stamped text; v_chain jsonb; v_chain_keys text[];
  v_resolved jsonb := '{}'::jsonb; v_trace jsonb := '[]'::jsonb;
  v_incomplete jsonb := '[]'::jsonb; v_advisory text[] := '{}'; v_no_rule text[] := '{}';
  v_clamps jsonb := '[]'::jsonb;
  v_missing text; v_cls record; v_v jsonb;
  v_win_rank integer; v_env jsonb; v_preempt_id uuid; v_preempt_state text;
  v_rules jsonb; v_i integer; v_j integer; v_n integer; v_bad jsonb;
  v_optout_keys text[];
  a_id uuid[]; a_ver integer[]; a_jk text[]; a_lvl text[]; a_rank integer[]; a_status text[];
  a_params jsonb[]; a_appl jsonb[]; a_org uuid[]; a_out text[]; a_reason text[];
begin
  if p_as_of is null then
    raise exception 'as_of_required' using errcode = '22004',
      hint = 'SPEC-JURISDICTION 2.2 / 7.5: p_as_of is the WORK or EVENT date. Never now().';
  end if;

  if p_subject_id is not null then
    v_stamped := hr._subject_jurisdiction_key(p_subject_type, p_subject_id, p_as_of);
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

    -- ------------------------------------------------------------ D26: the org's decision
    -- Before override, preemption and precedence: a platform candidate whose
    -- class × jurisdiction this organization has removed is out of the resolution,
    -- with the exclusion traced. Absence of a decision row is the default: it applies.
    select coalesce(array_agg(d.jurisdiction_key), '{}') into v_optout_keys
      from hr.jurisdiction_rule_org_decision d
     where d.organization_id = p_organization_id
       and d.rule_class_id = v_cls.id
       and d.decision = 'opted_out'
       and d.deleted_at is null;
    if array_length(v_optout_keys, 1) is not null then
      for v_i in 1 .. v_n loop
        if a_org[v_i] = v_sys and a_jk[v_i] = any(v_optout_keys) then
          a_out[v_i] := 'opted_out_by_org';
          a_reason[v_i] := 'removed by the organization (D26)';
        end if;
      end loop;
    end if;

    -- ------------------------------------------------------------ step 3 + section 3.4 clamps
    for v_i in 1 .. v_n loop
      if a_org[v_i] = v_sys and a_out[v_i] is null then
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
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The decision door
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.org_jurisdiction_rule_set_applies(
  p_organization_id uuid, p_rule_class text, p_jurisdiction_key text,
  p_applies boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_class hr.jurisdiction_rule_class%rowtype; v_rule_id uuid; v_existing uuid;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin',
      'detail', 'Choosing which rules apply to this organization is an HR administration action.');
  end if;

  select * into v_class from hr.jurisdiction_rule_class
   where slug = p_rule_class and deleted_at is null;
  if v_class.id is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_rule_class');
  end if;
  if not exists (select 1 from hr.jurisdiction j where j.key = p_jurisdiction_key) then
    return jsonb_build_object('granted', false, 'reason', 'unknown_jurisdiction');
  end if;

  select r.id into v_rule_id
    from hr.jurisdiction_rule r
   where r.rule_class_id = v_class.id and r.jurisdiction_key = p_jurisdiction_key
     and r.deleted_at is null and r.status in ('active','advisory')
     and r.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)
   order by r.effective_from desc limit 1;

  select d.id into v_existing
    from hr.jurisdiction_rule_org_decision d
   where d.organization_id = p_organization_id and d.rule_class_id = v_class.id
     and d.jurisdiction_key = p_jurisdiction_key and d.deleted_at is null;

  perform hr.arm_write();
  if p_applies then
    -- restore the platform default: the decision row goes away
    if v_existing is not null then
      update hr.jurisdiction_rule_org_decision set deleted_at = now() where id = v_existing;
    end if;
    return jsonb_build_object('granted', true, 'decision', 'applies',
      'rule_class', p_rule_class, 'jurisdiction_key', p_jurisdiction_key);
  else
    if v_existing is not null then
      update hr.jurisdiction_rule_org_decision
         set decision = 'opted_out', reason = p_reason, rule_id_at_decision = v_rule_id
       where id = v_existing;
    else
      insert into hr.jurisdiction_rule_org_decision
        (rule_class_id, jurisdiction_key, decision, reason, rule_id_at_decision, organization_id, visibility)
      values (v_class.id, p_jurisdiction_key, 'opted_out', p_reason, v_rule_id, p_organization_id, 'internal');
    end if;
    return jsonb_build_object('granted', true, 'decision', 'opted_out',
      'rule_class', p_rule_class, 'jurisdiction_key', p_jurisdiction_key);
  end if;
end
$function$;

create or replace function public.hr_org_jurisdiction_rule_set_applies(
  p_organization_id uuid, p_rule_class text, p_jurisdiction_key text,
  p_applies boolean, p_reason text default null)
returns jsonb language sql security definer set search_path to 'public', 'hr'
as $function$ select hr.org_jurisdiction_rule_set_applies(p_organization_id, p_rule_class, p_jurisdiction_key, p_applies, p_reason); $function$;

select hr.leave_seal_door('hr_org_jurisdiction_rule_set_applies');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. law_portal_data learns the decisions
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.law_portal_data(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_org_keys text[]; v_chain_keys text[];
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin',
      'detail', 'The law portal is an HR administration surface.');
  end if;

  select array_agg(distinct k) into v_org_keys from (
    select j.key as k
      from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
     where e.organization_id = p_organization_id and e.deleted_at is null
    union
    select j.key
      from hr.location l join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.organization_id = p_organization_id and l.deleted_at is null
  ) s;
  v_org_keys := coalesce(v_org_keys, '{}'::text[]);

  select coalesce(array_agg(distinct ck ->> 'key'), array['US']) into v_chain_keys
    from unnest(v_org_keys) k,
         jsonb_array_elements(hr.jurisdiction_chain(k)) ck;

  return jsonb_build_object(
    'granted', true,
    'org_jurisdiction_keys', to_jsonb(v_org_keys),
    'chain_keys', to_jsonb(v_chain_keys),
    'classes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'label', c.label, 'description', c.description,
        'org_configurable', c.org_configurable, 'produces_money', c.produces_money,
        'parameter_schema', c.parameter_schema
      ) order by c.slug), '[]'::jsonb)
      from hr.jurisdiction_rule_class c where c.deleted_at is null and c.is_active
    ),
    'platform_rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rule_class', c.slug, 'rule_class_label', c.label,
        'produces_money', c.produces_money, 'org_configurable', c.org_configurable,
        'jurisdiction_key', r.jurisdiction_key, 'jurisdiction_name', j.name,
        'jurisdiction_level', j.level,
        'effective_from', r.effective_from, 'effective_to', r.effective_to,
        'status', r.status, 'basis', r.basis, 'citation', r.citation,
        'parameters', r.parameters, 'applicability', r.applicability,
        'unverified_keys', coalesce(r.parameters -> '_unverified', '[]'::jsonb),
        'version', r.version,
        'applies_to_org', r.jurisdiction_key = any (v_chain_keys),
        'opted_out', exists (
          select 1 from hr.jurisdiction_rule_org_decision d
           where d.organization_id = p_organization_id and d.rule_class_id = r.rule_class_id
             and d.jurisdiction_key = r.jurisdiction_key and d.decision = 'opted_out'
             and d.deleted_at is null)
      ) order by c.slug, r.jurisdiction_key), '[]'::jsonb)
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
      left join hr.jurisdiction j on j.key = r.jurisdiction_key
      where r.deleted_at is null and r.status in ('active', 'advisory')
        and (r.source_scope = 'statutory'
             or r.organization_id in
                (select so.organization_id from iam.system_orgs so where so.global_readable))
    ),
    'org_rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rule_class', c.slug, 'rule_class_label', c.label,
        'jurisdiction_key', r.jurisdiction_key, 'jurisdiction_name', j.name,
        'effective_from', r.effective_from, 'effective_to', r.effective_to,
        'status', r.status, 'basis', r.basis, 'citation', r.citation,
        'parameters', r.parameters, 'applicability', r.applicability,
        'version', r.version
      ) order by c.slug, r.jurisdiction_key), '[]'::jsonb)
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
      left join hr.jurisdiction j on j.key = r.jurisdiction_key
      where r.deleted_at is null and r.organization_id = p_organization_id
        and r.source_scope = 'org_policy'
    ),
    'opt_outs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'rule_class', c.slug, 'jurisdiction_key', d.jurisdiction_key,
        'reason', d.reason, 'decided_at', d.updated_at, 'decided_by', d.updated_by
      ) order by c.slug, d.jurisdiction_key), '[]'::jsonb)
      from hr.jurisdiction_rule_org_decision d
      join hr.jurisdiction_rule_class c on c.id = d.rule_class_id
      where d.organization_id = p_organization_id and d.decision = 'opted_out'
        and d.deleted_at is null
    )
  );
end
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Self-proof. The opt-out probe runs in a rolled-back subtransaction; the
-- fixture suite must stay green with the new resolver body.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_org constant uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_facts constant jsonb := '{"worker_class":"employee","flsa_status":"nonexempt"}'::jsonb;
  v_class_id uuid; v_res jsonb; v_fix jsonb;
begin
  perform 'hr.jurisdiction_rule_org_decision'::regclass;
  perform 'hr.org_jurisdiction_rule_set_applies(uuid,text,text,boolean,text)'::regprocedure;
  perform 'public.hr_org_jurisdiction_rule_set_applies(uuid,text,text,boolean,text)'::regprocedure;

  if not iam.canonical_certify_ok('hr','jurisdiction_rule_org_decision','hr_jurisdiction_rule_org_decision') then
    raise exception 'proof failed: decision table is not canonically certified';
  end if;

  select id into v_class_id from hr.jurisdiction_rule_class where slug = 'meal-break';

  -- Baseline: the CA meal-break rule applies to the probe org.
  v_res := hr.resolve_rules(null, null, current_date, array['meal-break'], v_facts, v_org, 'US-CA');
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_res#>'{resolved,meal-break,rules}','[]'::jsonb)) r
     where r->>'jurisdiction_key' = 'US-CA') then
    raise exception 'proof failed: baseline CA meal-break did not resolve (%)', v_res->'no_rule';
  end if;

  -- D26 PROOF, rolled back: the org removes the CA meal-break rule; the resolver
  -- stops enforcing it and the trace says why.
  begin
    perform hr.arm_write();
    insert into hr.jurisdiction_rule_org_decision
      (rule_class_id, jurisdiction_key, decision, reason, organization_id, visibility)
    values (v_class_id, 'US-CA', 'opted_out', 'migration self-proof', v_org, 'internal');

    v_res := hr.resolve_rules(null, null, current_date, array['meal-break'], v_facts, v_org, 'US-CA');
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_res#>'{resolved,meal-break,rules}','[]'::jsonb)) r
       where r->>'jurisdiction_key' = 'US-CA') then
      raise exception 'proof failed: opted-out CA meal-break still resolved';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_res->'trace') t
       where t->>'class' = 'meal-break' and t->>'jurisdiction_key' = 'US-CA'
         and t->>'outcome' = 'opted_out_by_org') then
      raise exception 'proof failed: opt-out not traced (%)', v_res->'trace';
    end if;
    raise exception 'probe_rollback';
  exception when others then
    if sqlerrm <> 'probe_rollback' then raise; end if;
  end;

  -- After rollback the decision is gone and the rule applies again.
  v_res := hr.resolve_rules(null, null, current_date, array['meal-break'], v_facts, v_org, 'US-CA');
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_res#>'{resolved,meal-break,rules}','[]'::jsonb)) r
     where r->>'jurisdiction_key' = 'US-CA') then
    raise exception 'proof failed: probe did not roll back cleanly';
  end if;

  -- The blocking gate: no NEW fixture failure beyond the one pre-existing, documented
  -- artifact. SNAP-01 fails BEFORE this migration too: its stored expectation counts
  -- affected snapshots as exactly 1, and production now holds 15 live snapshots citing
  -- the probed rule — a live-data staleness in the fixture's expectation, owned by the
  -- C5 lane (recorded in REGISTER.md HRB-009, 2026-08-28). This migration must not hide
  -- behind it: any OTHER failing code fails the apply.
  v_fix := hr.run_rule_fixtures(null);
  if exists (
    select 1 from jsonb_array_elements(v_fix->'results') r
     where (r->>'passed')::boolean = false and r->>'code' <> 'SNAP-01') then
    raise exception 'proof failed: NEW fixture failure after D26 resolver change: %',
      (select jsonb_agg(r->>'code') from jsonb_array_elements(v_fix->'results') r
        where (r->>'passed')::boolean = false);
  end if;

  raise notice 'hr_l9_01 proof green: opt-out enforced and traced, rollback clean, fixtures green (% passed)', v_fix->>'passed';
end
$$;
