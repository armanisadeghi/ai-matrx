-- hr_l1_30_forbidden_target_names_the_fields.sql
--
-- T-L1-9 clause 3: a refused pay edit must NAME the field. It could not.
--
-- `hr.field_policy` seeds `hr_compensation.amount` as `hr_only`, so "HR holds your
-- pay" is a real, seeded answer. But `hr_self_update` guarded its target token with a
-- RAISE — `22023, '% is not a self-service target'` — so an attempt to change pay came
-- back as a database error string about a "target", a word nobody outside this schema
-- knows, through the transport's generic failure lane. The one thing §7.1 promises the
-- person will see, the NAME of the field HR holds, was the one thing missing.
--
-- Refusal is DATA on this door for every individually rejected field. A whole
-- forbidden table is not the exception to that rule.
--
-- Proven live after the fix:
--   hr_self_update('hr_compensation', <employee>, {"amount": 250000})
--   → {"ok":false, "reason":"fields_not_self_writable", "target":"hr_compensation",
--      "rejected":[{"field":"amount","policy":"hr_only"}],
--      "detail":"These fields are held by HR and cannot be changed here."}
-- which `useSelfUpdate` renders as "Amount can only be changed by HR."
--
-- Applied live 2026-08-27 and ledgered. Run after hr_l1_29.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_self_update(text,uuid,jsonb)'::regprocedure);
  if position('A FORBIDDEN TARGET IS A REFUSAL' in v_def) > 0 then
    raise notice 'hr_l1_30: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  if p_token not in ('hr_employee','hr_employee_private','hr_emergency_contact') then
    raise exception 'hr_self_update: % is not a self-service target', p_token
      using errcode = '22023';
  end if;$a1$,
$r1$  -- 🚨 A FORBIDDEN TARGET IS A REFUSAL, NOT AN EXCEPTION — AND IT NAMES THE FIELDS.
  -- Asking to change your own pay is a legitimate thing for a person to try; `amount`
  -- on `hr_compensation` is seeded `hr_only` precisely so the answer is "HR holds this".
  -- Raising 22023 made that answer arrive as a database error string about a "target",
  -- a word nobody outside this schema knows, through the transport's generic failure
  -- lane — so the one thing §7.1 promises the person would SEE, the NAME of the field
  -- HR holds, was the one thing missing. Refusal is DATA on this door for every other
  -- rejected field; a whole forbidden table is not the exception to that.
  if p_token not in ('hr_employee','hr_employee_private','hr_emergency_contact') then
    return jsonb_build_object('ok', false, 'reason', 'fields_not_self_writable',
      'rejected', (select coalesce(jsonb_agg(jsonb_build_object('field', k, 'policy', 'hr_only')), '[]'::jsonb)
                     from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k),
      'unknown', '[]'::jsonb,
      'target', p_token,
      'detail', 'These fields are held by HR and cannot be changed here.');
  end if;$r1$);

  if v_new = v_def then raise exception 'hr_l1_30: target-check anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_self_update';
  if v_src !~ 'A FORBIDDEN TARGET IS A REFUSAL' then raise exception 'hr_l1_30: did not land'; end if;
  if v_src ~ 'is not a self-service target' then raise exception 'hr_l1_30: the raise survived'; end if;
  if v_src !~ 'A REQUEST NOBODY OPENED' then raise exception 'hr_l1_30: hr_l1_29 guard lost'; end if;
end $verify$;
