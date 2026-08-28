-- hr_l1_51_the_subject_sees_their_own_change.sql
--
-- 🚨 THE ENTITLEMENT DERIVATION EXCLUDED THE PERSON THE CHANGE IS ABOUT.
-- `_wf_display` gated the change digest on "assigned approver, or holder of
-- workflow.view_queue". The SUBJECT is neither, so a decider read
-- "Legal last name  Okonkwo → Okonkwo-R37" while the person whose name it is opened her
-- own request and saw nothing.
--
-- That was never a disclosure decision. It is her data; no tier of the sensitivity model
-- was ever protecting her from herself, and the surface that exists to tell somebody what
-- is happening to their record was the one place it did not say.
--
-- Applied live 2026-08-28 and ledgered. Falsified both ways on a live request:
--   as the SUBJECT      → change = [{legal_last_name, Okonkwo-R36 → Okonkwo-R37}]
--   as an UNRELATED user → change = []   (the contentless/entitlement guard still holds)

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._wf_display(uuid,boolean)'::regprocedure);
  if position('THE SUBJECT IS ENTITLED TO THEIR OWN CHANGE' in v_def) > 0 then
    raise notice 'hr_l1_51: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  v_entitled := (v_uid is not null and v_uid = any(coalesce(st.resolved_user_ids, '{}'::uuid[])))$a1$,
$r1$  -- 🚨 THE SUBJECT IS ENTITLED TO THEIR OWN CHANGE.
  v_entitled := (v_uid is not null
                 and v_uid = hr._wf_login_of(inst.subject_employment_id))
             or (v_uid is not null and v_uid = any(coalesce(st.resolved_user_ids, '{}'::uuid[])))$r1$);
  if v_new = v_def then raise exception 'hr_l1_51: entitlement anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_display';
  if v_src !~ 'THE SUBJECT IS ENTITLED TO THEIR OWN CHANGE' then
    raise exception 'hr_l1_51: did not land'; end if;
  if v_src !~ 'p_contentless or not v_entitled' then
    raise exception 'hr_l1_51: the contentless guard was lost'; end if;
  if v_src !~ '_wf_pay_change_digest' then
    raise exception 'hr_l1_51: hr_l1_41 lost'; end if;
  if v_src ~ '_wf_call_digest' then
    raise exception 'hr_l1_51: the integrity hash came back'; end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = '_wf_display'
   and home_migration = 'hr_l1_41_a_pay_change_carries_its_proposal_flat.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', '_wf_display', 'hr_l1_51_the_subject_sees_their_own_change.sql',
        array['''change''', '''digest''', '''subject_label''', 'p_contentless or not v_entitled',
              '_wf_row_summary', '_wf_pay_change_digest', '_wf_login_of'],
        array['_wf_call_digest'],
        'Entitlement must include the SUBJECT. Without _wf_login_of on subject_employment_id the '
        || 'derivation excludes the one person the change is about.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_51_the_subject_sees_their_own_change.sql',
        md5('hr_l1_51_the_subject_sees_their_own_change'), now(), 0)
on conflict do nothing;
