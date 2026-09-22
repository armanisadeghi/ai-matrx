-- HR domain L3 — migration 118. A FUNCTION CONTRACT FOLLOWS ITS INVARIANT WHEN THE BODY MOVES.
--
-- 🚨 THE REGRESSION (measured live on db.matrxserver.com, 2026-09-22, lane GATES-2)
-- ════════════════════════════════════════════════════════════════════════════════
-- `check:hr-punch-write-path:strict` failed on `function_contracts_hold` with EIGHT
-- broken `must_contain` clauses across three functions:
--
--   crm.ensure_user_party      — 'signup' 'promotion' 'backfill' 'reconcile' 'hr.employee_create'
--   hr._wf_notify              — '?org='  'inst.organization_id::text'
--   hr._punch_notify_edited    — 'p_organization_id::text'
--
-- WHAT ACTUALLY HAPPENED, read out of the ledger and the live bodies rather than assumed:
--
--   `migrations/a_verified_phone_is_reachable_by_text_and_voice.sql` (ledgered
--   2026-09-22 05:35:20 UTC) re-created `crm.ensure_user_party` as a thin wrapper that
--   delegates to `crm.ensure_user_party_in_org(p_user_id, v_ai_matrx_org, p_source, false)`.
--   THE WHITELIST DID NOT DISAPPEAR — it MOVED: `crm.ensure_user_party_in_org` carries
--   `if p_source not in ('signup', 'promotion', 'backfill', 'reconcile', 'hr.employee_create')`.
--
--   `migrations/campaign/links2_an_hr_link_names_its_employer.sql` (ledgered
--   2026-09-21 21:54:38 UTC) re-created `hr._wf_notify` and `hr._punch_notify_edited` so
--   that neither hand-builds `?org=` any more. Both now call the ONE builder,
--   `hr.link_names_its_employer(p_link, p_organization_id)`, which calls
--   `platform.link_carries_its_organization` and — if that rule ever declines for an
--   `/hr` path — raises a warning and appends `'org=' || p_organization_id::text` ITSELF.
--   The employer is therefore carried MORE strongly than before, not less.
--
-- So this is not a lost fix. It is a lost DECLARATION: a `must_contain` substring is a
-- statement about WHERE an invariant is spelled, and when the invariant is correctly
-- hoisted into a shared body the old spelling stops existing while the invariant holds.
-- D13 says protection for this class is a ROW in `hr.function_contract`, never a change
-- to the check — and the same sentence governs the repair: the contract is re-pointed at
-- the body that now holds the invariant, and the shared body gains a contract of its own
-- so the hoist cannot be undone quietly.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTHING IS WEAKENED. Count the demands before and after.
-- ═══════════════════════════════════════════════════════════════════════════════
--   BEFORE: 3 functions under 3 contracts, 8 tokens, all 8 broken and the gate RED.
--   AFTER:  5 functions under 5 contracts, 12 tokens, all 12 held and the gate GREEN.
-- Every invariant that was declared is still declared; two of them are now declared on
-- the body that actually enforces them, and the wrappers are contracted to KEEP
-- delegating (`crm.ensure_user_party` must call `crm.ensure_user_party_in_org`;
-- `hr._wf_notify` and `hr._punch_notify_edited` must call `hr.link_names_its_employer`
-- with the employer in hand). A re-emit that inlines a link without the builder, or
-- drops the delegation, breaks a clause exactly as before. No row is deactivated, no
-- baseline moves, no allowlist grows.
--
-- NO `-- based-on:` LINE, DELIBERATELY: this file replaces NO function body. It writes
-- rows in hr.function_contract, which is what D13 says protection is made of.
-- Rows written: 5. Rows deleted: 0. Rows deactivated: 0.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. crm.ensure_user_party — the provenance whitelist moved to the delegate.
-- ─────────────────────────────────────────────────────────────────────────────
update hr.function_contract
   set must_contain = array['crm.ensure_user_party_in_org'],
       reason = reason
         || ' || hr_l3_121 (2026-09-22): the five provenance values MOVED to '
         || 'crm.ensure_user_party_in_org when a_verified_phone_is_reachable_by_text_and_voice.sql '
         || 'made this function a thin wrapper. They are declared there now, under this same '
         || 'contract table. What THIS function still owes is the delegation itself: a re-emit '
         || 'that stops calling crm.ensure_user_party_in_org has taken the whitelist, the '
         || 'membership rule and the AI Matrx tenant binding out of the path in one move.'
 where schema_name = 'crm'
   and function_name = 'ensure_user_party'
   and home_migration = 'hr_l1_42_register_the_hr_source.sql';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. hr._wf_notify / hr._punch_notify_edited — the ?org= builder is now shared.
-- ─────────────────────────────────────────────────────────────────────────────
update hr.function_contract
   set must_contain = array['hr.link_names_its_employer', 'inst.organization_id'],
       reason = reason
         || ' || hr_l3_121 (2026-09-22): LINKS-2 '
         || '(migrations/campaign/links2_an_hr_link_names_its_employer.sql) replaced the '
         || 'hand-built ?org= with THE ONE builder hr.link_names_its_employer, which appends '
         || 'the employer itself when platform.link_carries_its_organization declines. The '
         || 'invariant is unchanged and stronger; what this body owes is that it reaches the '
         || 'builder AND hands it the instance employer. The ?org= spelling is declared on '
         || 'hr.link_names_its_employer.'
 where schema_name = 'hr'
   and function_name = '_wf_notify'
   and home_migration = 'hr_l3_111';

update hr.function_contract
   set must_contain = array['hr.link_names_its_employer', 'p_organization_id'],
       reason = reason
         || ' || hr_l3_121 (2026-09-22): same move as hr._wf_notify — the punch-edited deep '
         || 'link is built by hr.link_names_its_employer from p_organization_id rather than '
         || 'concatenated here. The ?org= spelling is declared on that builder.'
 where schema_name = 'hr'
   and function_name = '_punch_notify_edited'
   and home_migration = 'hr_l3_111';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The two shared bodies the invariants moved INTO now carry their own contracts.
--    This is the half that makes the hoist safe: whoever re-emits the shared body
--    next meets the same wall the wrappers used to have.
-- ─────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('crm', 'ensure_user_party_in_org', 'hr_l3_121',
   array['''signup''', '''promotion''', '''backfill''', '''reconcile''', '''hr.employee_create'''],
   '{}', true,
   'hr_l3_121: p_source is PROVENANCE -- it is stored as source_detail, as '
   || 'metadata.provisioning_source and in the activity log. public.hr_employee_create passes '
   || '''hr.employee_create''; removing it from the accepted set returns that path to raising '
   || '100% of the time, and passing ''backfill'' instead would write a false provenance to make '
   || 'the call succeed. This row is HR''s declaration on a crm-owned function: crm owns the '
   || 'shape, HR owns these values. It was declared on crm.ensure_user_party by '
   || 'hr_l1_42_register_the_hr_source.sql and follows the whitelist here, where '
   || 'a_verified_phone_is_reachable_by_text_and_voice.sql moved it on 2026-09-22.'),
  ('hr', 'link_names_its_employer', 'hr_l3_121',
   array['platform.link_carries_its_organization', '''org='' || p_organization_id::text', '^/hr(/|\?|#|$)'],
   '{}', false,
   'hr_l3_121: THE ONE builder every HR deep link goes through since LINKS-2. HR is strictly '
   || 'single-employer and SPEC-UI-IA section 1 resolves the active employer from ?org= FIRST, so '
   || 'an employer-free /hr link opens whichever employer the picker happens to hold. This body '
   || 'is what hr._wf_notify, hr._punch_notify_edited and every other notice producer now rely '
   || 'on, and it is the last place in the product that may drop the param -- the link a person '
   || 'follows out of an email or an SMS with no HR page open to inherit an employer from. Three '
   || 'clauses: it must defer to the platform rule, it must carry its own ?org= fallback for when '
   || 'that rule declines (the knob being off is a presentation decision, never a decision that HR '
   || 'may open the wrong employer''s data), and it must keep the /hr route test that decides '
   || 'which paths have the floor. SECURITY INVOKER by design: it reads nothing.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_not_contain = excluded.must_not_contain,
      must_be_definer = excluded.must_be_definer,
      reason = excluded.reason,
      is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE FILE PROVES ITSELF. Not "should be green" -- green, or it does not commit.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bad     integer;
  v_detail  text;
  v_link    text;
  v_org     uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
begin
  select count(*), string_agg(qname || '/' || clause || '/' || missing_or_present, ', ')
    into v_bad, v_detail
    from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_l3_121: % function contract(s) still broken: %', v_bad, v_detail;
  end if;

  -- The punch deep link, built the way hr._punch_notify_edited builds it, must carry ?org=.
  v_link := hr.link_names_its_employer(
              '/hr/me/timesheet?punch=00000000-0000-0000-0000-000000000001', v_org);
  if v_link !~ '[?&]org=' then
    raise exception 'hr_l3_121: the punch deep link came back with no employer: %', v_link;
  end if;

  raise notice 'hr_l3_121: 0 broken contracts; a punch deep link builds as %', v_link;
end $$;

