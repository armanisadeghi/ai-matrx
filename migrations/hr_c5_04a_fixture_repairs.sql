-- HR domain, C5 / register item HRB-009, corrective migration between the runtime probes and
-- their fixture suite. The first live fixture run exposed three contract defects: an empty
-- minors rule set was treated as present, the accrual display precision knob was not seeded,
-- and the snapshot-correction probe cited a placeholder rule id that cannot satisfy its FK.
--
-- This migration repairs the already-applied functions additively; generated/applied migration
-- history is never rewritten. Idempotent. Applied live as `hr_c5_04a_fixture_repairs`.

set local lock_timeout = '20s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
values
  ('hr.leave','accrual_precision_decimals','4'::jsonb,'4'::jsonb,'integer','decimals',0,8,null,
   'Leave accrual display precision',
   'Decimal places retained when leave accrual amounts are presented by the jurisdiction evaluator.',
   'agent',
   'Four decimal places preserves the fixture contract for fractional statutory accrual without changing the underlying ledger precision.',
   current_date + 90)
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type = excluded.value_type,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis;

do $repair$
declare
  v_proc regprocedure := to_regprocedure('hr.jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)');
  v_def text;
  v_old text := $old$if jsonb_typeof(v_res#>'{resolved,minors-hours,rules}') <> 'array' then$old$;
  v_new text := $new$if jsonb_typeof(v_res#>'{resolved,minors-hours,rules}') <> 'array'
       or jsonb_array_length(coalesce(v_res#>'{resolved,minors-hours,rules}', '[]'::jsonb)) = 0 then$new$;
begin
  if v_proc is null then
    raise exception 'hr_c5_04a: jurisdiction evaluator is missing';
  end if;
  v_def := pg_get_functiondef(v_proc);
  if position(v_new in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c5_04a: minors-rule guard no longer matches the reviewed evaluator';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end
$repair$;

do $repair$
declare
  v_proc regprocedure := to_regprocedure('hr._run_fixture_probe(text,jsonb)');
  v_def text;
  v_marker text := $old$elsif p_probe = 'snapshot_correction' then
      -- SNAP-01$old$;
  v_branch text := $new$elsif p_probe = 'snapshot_correction' then
      select r.id into v_rule
        from hr.jurisdiction_rule r
        join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
       where c.slug = 'overtime'
         and r.jurisdiction_key = 'US-CA'
         and r.status = 'active'
         and r.effective_from <= date '2026-03-16'
         and (r.effective_to is null or r.effective_to > date '2026-03-16')
         and r.deleted_at is null
       order by r.effective_from desc, r.version desc, r.id
       limit 1;
      if v_rule is null then
        raise exception 'snapshot_correction_probe_missing_rule';
      end if;
      -- SNAP-01$new$;
  v_old_resolution text := $old$jsonb_build_array(jsonb_build_object('rule_id','11111111-1111-1111-1111-111111111111','rule_version',1)))))$old$;
  v_new_resolution text := $new$jsonb_build_array(jsonb_build_object('rule_id',v_rule::text,'rule_version',1)))))$new$;
  v_old_match text := $old$where resolution @> '{"resolved":{"overtime":{"rules":[{"rule_id":"11111111-1111-1111-1111-111111111111"}]}}}'::jsonb;$old$;
  v_new_match text := $new$where resolution @> jsonb_build_object(
         'resolved', jsonb_build_object('overtime', jsonb_build_object('rules',
           jsonb_build_array(jsonb_build_object('rule_id', v_rule::text)))));$new$;
  v_old_fk text := $old$'11111111-1111-1111-1111-111111111111'::uuid, 1,$old$;
  v_new_fk text := $new$v_rule, 1,$new$;
begin
  if v_proc is null then
    raise exception 'hr_c5_04a: fixture probe function is missing';
  end if;
  v_def := pg_get_functiondef(v_proc);
  if position('snapshot_correction_probe_missing_rule' in v_def) = 0 then
    if position(v_marker in v_def) = 0
       or position(v_old_resolution in v_def) = 0
       or position(v_old_match in v_def) = 0
       or position(v_old_fk in v_def) = 0 then
      raise exception 'hr_c5_04a: snapshot probe no longer matches the reviewed function';
    end if;
    v_def := replace(v_def, v_marker, v_branch);
    v_def := replace(v_def, v_old_resolution, v_new_resolution);
    v_def := replace(v_def, v_old_match, v_new_match);
    v_def := replace(v_def, v_old_fk, v_new_fk);
    execute v_def;
  end if;
end
$repair$;

do $assert$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'hr.leave' and key = 'accrual_precision_decimals'
  ) then
    raise exception 'hr_c5_04a: accrual precision knob is not seeded';
  end if;
  if position(
       'jsonb_array_length(coalesce(v_res#>''{resolved,minors-hours,rules}'', ''[]''::jsonb)) = 0'
       in pg_get_functiondef('hr.jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)'::regprocedure)
     ) = 0 then
    raise exception 'hr_c5_04a: empty minors rule guard is not installed';
  end if;
  if position(
       'snapshot_correction_probe_missing_rule'
       in pg_get_functiondef('hr._run_fixture_probe(text,jsonb)'::regprocedure)
     ) = 0 then
    raise exception 'hr_c5_04a: snapshot correction probe repair is not installed';
  end if;
end
$assert$;
