-- HR domain L5 — migration 29 (register item HRB-017, lane L5 Leave & PTO).
--
-- `raise` TAKES `%`, NOT `%s`, AND THE GATE'S REFUSAL WAS PRINTING A STRAY `s`.
--
-- `hr._leave_enrollment_worker_class_gate` refused with:
--
--     'LEAVE_ENROLLMENT_OUT_OF_WORKER_CLASS_SCOPE: this employment is %s and %s covers %s'
--
-- PL/pgSQL's `raise` uses bare `%` for substitution and treats the following `s` as a literal, so
-- an admin hitting the gate read *"this employment is contractors and ZZZ L5 PROOF — PTO banks
-- covers employees"* — three plural-looking nouns, none of them plural, in the one sentence whose
-- whole job is telling somebody precisely which class and which policy disagreed.
--
-- 🚨 **Only the `raise` is wrong.** The `format(...)` call three lines below it is CORRECT and is
-- deliberately left alone: `format()` DOES take `%s`. The two look identical at a glance and take
-- different placeholders, which is exactly why this survived a self-proof, a live refusal probe
-- and a verifier round — every one of them asserted the refusal FIRED and by what name, and none
-- read the sentence it printed.
--
-- Caught by round 32 while nobody could see it. The contract row on this function
-- (`hr_l5_25`) stays green: both `_leave_worker_class_ok` and `worker_class_override_reason`
-- survive this edit, and the self-proof re-asserts them.
--
-- Authority: SPEC-LEAVE §2.8; SPEC-UI-IA §4.1 (a refusal renders in words).
-- Applied live as `hr_l5_29_raise_takes_percent_not_percent_s`. Idempotent.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_leave_enrollment_worker_class_gate';

  if v_def not like '%this employment is %s and %s covers %s%' then
    raise notice 'hr_l5_29: the raise format is already correct — nothing to do.';
    return;
  end if;

  v_new := replace(v_def,
    'LEAVE_ENROLLMENT_OUT_OF_WORKER_CLASS_SCOPE: this employment is %s and %s covers %s',
    'LEAVE_ENROLLMENT_OUT_OF_WORKER_CLASS_SCOPE: this employment is % and % covers %');
  if v_new = v_def then
    raise exception 'hr_l5_29: the raise line did not match — re-derive it from the live body';
  end if;
  execute v_new;
end $$;

-- -----------------------------------------------------------------------------------
-- Self-proof — read the sentence, do not merely assert that it fired
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_msg text; v_pol uuid; v_emp uuid;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_leave_enrollment_worker_class_gate';

  -- the raise must no longer carry %s …
  if v_def like '%this employment is %s and %s covers %s%' then
    raise exception 'hr_l5_29: the raise still uses %%s';
  end if;
  -- … and the format() call must STILL carry it, because format() is the one that wants it
  if v_def not like '%was enrolled in a policy that covers %s, deliberately%' then
    raise exception 'hr_l5_29: the format() call lost its %%s placeholders';
  end if;
  -- the hr_l5_25 contract on this function stays green
  if v_def not like '%_leave_worker_class_ok%' or v_def not like '%worker_class_override_reason%' then
    raise exception 'hr_l5_29: the edit broke the hr_l5_25 contract on this function';
  end if;

  -- 🚨 AND ACTUALLY READ THE SENTENCE. Every earlier check asserted the refusal fired and by what
  -- name; none read what it printed, which is how a stray `s` survived three rounds.
  select p.id, e.employment_id into v_pol, v_emp
    from hr.leave_policy p
    join hr.leave_enrollment e on e.leave_policy_id = p.id and e.deleted_at is null
   where p.name like 'ZZZ L5 PROOF%' and p.deleted_at is null
     and not coalesce((hr._leave_worker_class_ok(e.employment_id, p.id) ->> 'ok')::boolean, true)
   limit 1;

  if v_pol is null then
    raise notice 'hr_l5_29: no out-of-scope fixture present to read a live sentence from.';
    return;
  end if;

  begin
    perform hr.arm_write();
    insert into hr.leave_enrollment
      (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id)
    select v_emp, v_pol, current_date + 900, date_trunc('year', current_date)::date, p.organization_id
      from hr.leave_policy p where p.id = v_pol;
    raise exception 'hr_l5_29: the gate did not refuse — it cannot be read';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
  end;

  if v_msg like '%contractors %' or v_msg like '%employees covers%' or v_msg ~ '\ms and s\M' then
    raise exception 'hr_l5_29: the refusal still prints a stray s: %', v_msg;
  end if;
  if v_msg not like '%this employment is contractor and%' then
    raise exception 'hr_l5_29: the refusal does not read as expected: %', v_msg;
  end if;
  raise notice 'hr_l5_29: live refusal now reads — %', v_msg;
end $$;
