-- hr_l1_52_viewer_is_subject_is_an_identity_fact.sql
--
-- 🚨 MY ROUND-37 PROOF WAS TRUE AND DID NOT GENERALISE.
-- The subject-view guard was derived CLIENT-side by comparing the instance's
-- `subject_employment_id` against `hr_my_context().active.employment_id` — which resolves
-- through `hr._l1_self_employment(uid, org, TODAY)` and is therefore DATE-SCOPED.
--
-- For a PRE-START hire it returns NULL, so the comparison was false for exactly the people
-- whose requests are filed before they start, and the never-approve-yourself guard never
-- fired: the subject saw the decider's four controls, byte-identical. I proved the render
-- on a subject who happened to hold a current employment, which is why it passed.
--
-- Measured on the verifier's fixture (Marisol Okonkwo, hire 2026-09-15):
--   hr._l1_self_employment(uid, org, today) -> NULL      (what the client was using)
--   hr._wf_login_of(subject_employment_id)  -> her uid   (the identity fact)
--
-- Whether a request is ABOUT ME does not depend on whether I am employed today
-- (hr_c4_39 / hr_l3_88), so the door answers it once, from the login on the subject's
-- employment — the same linkage hr_l1_51 already uses for entitlement.
--
-- Applied live 2026-08-28 and ledgered. Proven on that exact instance: with the door's
-- answer the four controls are ABSENT and the worded reason renders; without it they
-- render — the seam exercised, not inferred.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._wf_display(uuid,boolean)'::regprocedure);
  if position('VIEWER-IS-SUBJECT IS AN IDENTITY FACT' in v_def) > 0 then
    raise notice 'hr_l1_52: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  return jsonb_build_object(
    'title',            v_title,$a1$,
$r1$  -- 🚨 VIEWER-IS-SUBJECT IS AN IDENTITY FACT, RESOLVED BY LOGIN LINKAGE.
  v_is_subject := (v_uid is not null
                   and v_uid = hr._wf_login_of(inst.subject_employment_id));

  return jsonb_build_object(
    'title',            v_title,
    'viewer_is_subject', v_is_subject,$r1$);
  if v_new = v_def then raise exception 'hr_l1_52: return anchor not found'; end if;

  v_new := replace(v_new,
    'v_change jsonb := ''[]''::jsonb; v_digest text;',
    'v_change jsonb := ''[]''::jsonb; v_digest text; v_is_subject boolean;');
  if position('v_is_subject boolean' in v_new) = 0 then
    raise exception 'hr_l1_52: declaration anchor not found';
  end if;

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_display';
  if v_src !~ 'VIEWER-IS-SUBJECT IS AN IDENTITY FACT' then raise exception 'hr_l1_52: did not land'; end if;
  if v_src !~ '''viewer_is_subject''' then raise exception 'hr_l1_52: key missing'; end if;
  if v_src !~ 'THE SUBJECT IS ENTITLED TO THEIR OWN CHANGE' then raise exception 'hr_l1_52: hr_l1_51 lost'; end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = '_wf_display'
   and home_migration = 'hr_l1_51_the_subject_sees_their_own_change.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', '_wf_display', 'hr_l1_52_viewer_is_subject_is_an_identity_fact.sql',
        array['''change''', '''digest''', '''subject_label''', '''viewer_is_subject''',
              'p_contentless or not v_entitled', '_wf_row_summary', '_wf_pay_change_digest',
              '_wf_login_of'],
        array['_wf_call_digest'],
        'viewer_is_subject is resolved by LOGIN LINKAGE, never by date-scoped employment.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_52_viewer_is_subject_is_an_identity_fact.sql',
        md5('hr_l1_52_viewer_is_subject_is_an_identity_fact'), now(), 0)
on conflict do nothing;
