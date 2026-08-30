-- hr_c3_14 — AN UNREGISTERED TOKEN MAKES BREAK-GLASS A CEREMONY.
--
-- RECORD of a live change applied on 2026-08-29 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Slot: hr_c3 #0014.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WAS WRONG: HR BREAK-GLASS HAS NEVER GRANTED ANYTHING, DOMAIN-WIDE, EVER.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `hr.role_assignment.break_glass_allowed` is true on real assignments. `public.hr_break_glass`
-- exists, is granted, and is walked. Every gate inside it is correct: the role check, the
-- justification floor, the controlled purpose, the §5 veto, the per-note-kind medical wall. And
-- then, at the very last step — the one that makes the whole feature mean something — it does
--
--     insert into iam.permissions (resource_type, ...) values (p_token, ...)
--
-- and `public.permissions_validate_resource_type`, a BEFORE INSERT trigger on iam.permissions,
-- raises **23514 check_violation** because *"permissions.resource_type=hr_compensation is not a
-- registered sharing TOKEN"*. Not ONE of the sixteen tokens `hr._door_spec` marks break-glass-
-- permitted is in `platform.shareable_resource_registry`. Measured before this migration:
-- `hr.derived_grant where reason='break_glass'` — **0 rows, ever**.
--
-- 🚨 AND THE REASON IT WENT UNSEEN FOR THREE DAYS OF ADVERSARIAL WALKING IS THE FINDING, NOT THE
-- BUG. The only break-glass call anybody ever exercised was on `hr_incident`, against a subject-
-- excluded caller — where the correct answer is REFUSE. The one test case the feature had was the
-- single case in which success and failure are indistinguishable from outside. A refusal proved
-- the veto and proved nothing about the grant, and the audit row it wrote looked exactly like a
-- healthy system. **A feature exercised only where it must say no has not been exercised.**
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART A — REGISTER THE SIXTEEN. THE TRIGGER IS THE GUARD; IT IS NOT THE BUG.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- There are exactly two ways to make the 23514 stop, and only one of them is right.
--
--   ✗ Loosen `public.permissions_validate_resource_type` — carve out `hr_%`, or drop the check.
--     That guard exists because a resource_type that is a TABLE NAME rather than an entity TOKEN
--     inserts cleanly and is then silently ignored by `iam.has_access` (db-rules §6c). Widening
--     it to let HR through would re-open that hole for every future HR token AND for anything
--     else that guessed a name. The trigger has been doing its job perfectly for three days.
--
--   ✓ Register the tokens. `shareable_resource_registry` answers *"how is a grant on type T
--     addressed"*; `entity_types` answers *"what is T"*. All sixteen are already in
--     `entity_types` — the sharing half was simply never written, because nothing in HR shares
--     these records and nobody noticed that break-glass grants through the same table.
--
-- 🚨 THE ROWS ARE HONEST ABOUT WHAT THEY ARE, AND TWO COLUMNS CARRY THE WHOLE MEANING:
--
--   `rls_uses_has_permission = false` — SPEC-ACCESS §4.3, corrected as built: *"that grant is
--     read by the DOOR, not by RLS. An iam.permissions row on a restricted token confers nothing
--     through RLS — the restricted policy has no iam.has_access lane at all."* `hr._break_glass_
--     active` is the reader. Stamping `true` here (as the eleven pre-existing hr rows do, because
--     for THEM it is true) would be a false claim about how these tables are protected. Seventeen
--     live rows already carry `false`, so this is a supported value and not a novelty.
--
--   `is_link_shareable = false` — a public link to an I-9 is not a feature with a bug in it, it
--     is a category error. `public.create_share_link` refuses on this column, first thing.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART B — 🚨 REGISTRATION OPENS A DOOR THAT MUST BE SHUT IN THE SAME MIGRATION.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- This is the part that must not be skipped, and it was found by asking what ELSE a registry row
-- turns on rather than by reading what it was needed for.
--
-- `public.share_resource_with_user` and `public.share_resource_with_org` are ordinary
-- PostgREST-reachable RPCs. Both resolve the token through `resolve_shareable_resource` — which
-- answers for any active registry row — and then admit the caller on ONE test: are you the row's
-- owner. Owner means `public.shareable_owner_column(...)`, which **falls back to `created_by`
-- whenever the column exists**, so the registry's own `owner_column` cannot be used to neutralise
-- it.
--
-- SPEC-ACCESS §3 says these rows carry `created_by` NULL always. **Live, that is FALSE**, and it
-- was measured, not assumed:
--
--     employee_private 37/37 · compensation 18/18 · separation 9/9 · corrective_action 6/6
--     employer_profile 7/7 · verification_letter_request 8/8 · restricted_note 4/4
--
-- So the moment these tokens become registered, the HR admin who created a compensation row can
-- call one public RPC and hand that record to any user on the platform — no capability check, no
-- population check, no justification, no §5 veto, and **no `hr.access_audit` row**. Part A alone
-- would have fixed break-glass by opening a silent, unaudited side entrance to every confidential
-- record in the domain. That is a worse defect than the one being repaired.
--
-- `hr._guard_audited_tier_grant` closes it, in the shape this schema already uses for exactly
-- this problem: **an `iam.permissions` row on a token `hr._door_spec` knows is written only from
-- inside an armed HR write path.** It is `platform._custom_record_grant_guard`'s shape (a
-- domain-owned BEFORE trigger on iam.permissions, guarding one resource family) carrying
-- `hr._guard_hr_write`'s acceptance test verbatim — the tight statement-scoped token from
-- `hr.arm_write()`, plus the legacy literal lane, which must be honoured because `hr.arm_write()`
-- deliberately RETURNS EARLY when a transaction-scoped legacy arm is already set (hr_c3_11), and
-- refusing it here would break break-glass whenever it is called inside one.
--
-- `hr_break_glass` calls `perform hr.arm_write()` immediately before its insert, in the same
-- top-level statement, so `statement_timestamp()` is identical and the token matches. Nothing
-- else in the system writes a permission on these sixteen tokens — `hr._reconcile_grants` and
-- `hr._wf_grant_step` write `hr_employment` / `hr_employee` / `hr_requisition` / `hr_candidate` /
-- `hr_interview` / `hr_workflow_instance`, none of which is an audited-tier token, and all of
-- which take the early return untouched.
--
-- The guard is deliberately keyed on `hr._door_spec` and not on a list of sixteen strings: the
-- five tokens that are audited-tier but break-glass-FORBIDDEN (`hr_incident`, `hr_incident_party`,
-- `hr_accommodation_request`, `hr_leave_case`, and the note kinds) stay unregistered and so stay
-- refused by the 23514 trigger — but if a later lane ever registers one, the guard is already
-- standing over it rather than needing to be remembered.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART C — WHAT REGISTRATION DOES CONVEY, STATED OUT LOUD RATHER THAN DISCOVERED LATER.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Four of the sixteen are composition PARENTS of `component`-variant children:
--
--     hr_employer_profile → hr_establishment, hr_tax_registration
--     hr_i9               → hr_i9_document
--     hr_legal_hold       → hr_legal_hold_item
--
-- Those children's `std_select` policies read
-- `iam.accessible_entity_ids('<parent token>','viewer')`, which reads `iam.permissions` directly.
-- So a break-glass grant on `hr_i9` DOES reach that I-9's documents through RLS. §4.3's sentence
-- *"the grant would be inert if the door did not consult it"* is therefore not literally true for
-- these four parents, and this migration records that rather than leaving it to be re-found.
--
-- It is left in place, and the reasoning is not "it is small": the component model is that a
-- component child is reached through its parent's access, everywhere on this platform. An I-9
-- without its documents is not the record. The conveyance is scoped to the ONE record that was
-- broken into, lasts the grant's TTL, and reaches only a caller who already passed every gate in
-- `hr_break_glass`. Suppressing it would mean rewriting four `std_select` policies that also
-- serve the ordinary derived-grant reach, which is a different lane's table and a different
-- change. **What it costs is that those child reads are not in `hr.access_audit`** — filed as the
-- honest residue of this fix, not as something it silently accepted.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART D — AND A MISSING ROW MUST NEVER AGAIN BE INVISIBLE.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The whole defect was one absent row in one registry, with no reader anywhere that would notice.
-- `hr.break_glass_registration_drift()` is that reader: every token `hr._door_spec` says
-- break-glass may open, that is not actively registered. Empty means break-glass can grant. A row
-- means it cannot, and names which token — including the case that started this, a token whose
-- registry row is later flipped `is_active = false` by an admin panel.

begin;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART A — the registry rows.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_active, is_scopeable, is_link_shareable, notes)
-- url_path_template is NOT NULL and none of these sixteen has a per-RECORD route: they are read
-- inside the person, hiring or governance surfaces, never opened on their own. It is set to the
-- HR root and it is never resolved for these tokens, because the two things that read it —
-- create_share_link and the share dialog's resolve — are both refused for every one of them.
select d.token, e.schema_name, e.table_name, 'id', 'created_by', d.label,
       '/hr', false, true, false, false,
       'SPEC-ACCESS §4.3 break-glass target. Registered ONLY so hr_break_glass can write its '
       || 'time-boxed iam.permissions grant — without this row that insert dies on 23514 and '
       || 'break-glass grants nothing (hr_c3_14). rls_uses_has_permission is FALSE on purpose: '
       || 'the restricted/confidential policies have no iam.has_access lane, and hr._break_glass_'
       || 'active — inside the audited door — is what reads the grant. Never link-shareable. '
       || 'Manual sharing through share_resource_with_user/org is refused by '
       || 'hr._guard_audited_tier_grant, which is what keeps this registration from becoming an '
       || 'unaudited side entrance.'
  from (values
    ('hr_employee_private',            'Employee private details'),
    ('hr_compensation',                'Compensation'),
    ('hr_emergency_contact',           'Emergency contact'),
    ('hr_separation',                  'Separation'),
    ('hr_corrective_action',           'Corrective action'),
    ('hr_background_check',            'Background check'),
    ('hr_employer_profile',            'Employer profile'),
    ('hr_tax_withholding',             'Tax withholding'),
    ('hr_i9',                          'Form I-9'),
    ('hr_offer',                       'Offer'),
    ('hr_reference_check',             'Reference check'),
    ('hr_records_request',             'Records request'),
    ('hr_verification_letter_request', 'Verification letter request'),
    ('hr_ai_evidence',                 'AI evidence'),
    ('hr_legal_hold',                  'Legal hold'),
    ('hr_restricted_note',             'Restricted note')
  ) as d(token, label)
  join platform.entity_types e on e.token = d.token
on conflict (resource_type) do update
   set is_active               = true,
       is_link_shareable       = false,
       rls_uses_has_permission = false,
       notes                   = excluded.notes;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART B — the guard that makes Part A safe.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._guard_audited_tier_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_flag text;
begin
  -- Not an audited-tier HR token: this trigger has nothing to say. hr._reconcile_grants and
  -- hr._wf_grant_step leave through here untouched, as does every non-HR grant on the platform.
  if not exists (select 1 from hr._door_spec(new.resource_type)) then
    return new;
  end if;

  v_flag := coalesce(current_setting('hr.privileged_write', true), '');

  -- THE TIGHT LANE — the statement-scoped, unforgeable token from hr.arm_write(), which
  -- hr_break_glass raises immediately before its insert. Byte-identical to hr._guard_hr_write.
  if v_flag <> '' and v_flag = md5(statement_timestamp()::text || pg_backend_pid()::text ||
                                   (select k.key from hr._write_guard_key k limit 1)) then
    return new;
  end if;

  -- THE LEGACY LANE, kept for the same reason hr._guard_hr_write keeps it, and load-bearing here
  -- specifically: hr.arm_write() RETURNS EARLY when a transaction-scoped legacy arm is already
  -- set (hr_c3_11 — a callee must never degrade its caller's arm), so a break-glass call made
  -- inside a legacy-armed transaction arrives carrying the literal and nothing else.
  if v_flag in ('on', 'true', '1', 'yes') then
    return new;
  end if;

  raise exception
    'hr_grant_forbidden: % is an audited-tier HR token. An iam.permissions row on it is written by hr_break_glass and by nothing else.',
    new.resource_type
    using errcode = '42501',
          hint = 'SPEC-ACCESS §4.3: reach into a confidential or restricted HR record is granted only by an audited break-glass call, which writes hr.derived_grant(reason=''break_glass''), an expiry, an hr.access_audit row and an immediate alert. share_resource_with_user, share_resource_with_org and create_share_link do none of those things, which is why they are refused here rather than allowed to become a quiet second grant path.';
end
$fn$;

revoke all on function hr._guard_audited_tier_grant() from public;

drop trigger if exists _hr_audited_tier_grant_guard_ins on iam.permissions;
create trigger _hr_audited_tier_grant_guard_ins
  before insert on iam.permissions
  for each row execute function hr._guard_audited_tier_grant();

drop trigger if exists _hr_audited_tier_grant_guard_upd on iam.permissions;
create trigger _hr_audited_tier_grant_guard_upd
  before update of resource_type, resource_id, granted_to_user_id, permission_level, expires_at
  on iam.permissions
  for each row execute function hr._guard_audited_tier_grant();

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART D — the reader that would have caught this on day one.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr.break_glass_registration_drift()
returns table (token text, reason text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select d.token,
         case when s.resource_type is null
              then 'not in platform.shareable_resource_registry — hr_break_glass will die on 23514 and grant nothing'
              else 'registry row is is_active = false — hr_break_glass will die on 23514 and grant nothing'
         end
    from (values
      ('hr_employee_private'),('hr_compensation'),('hr_emergency_contact'),('hr_separation'),
      ('hr_corrective_action'),('hr_background_check'),('hr_employer_profile'),
      ('hr_tax_withholding'),('hr_i9'),('hr_offer'),('hr_reference_check'),
      ('hr_records_request'),('hr_verification_letter_request'),('hr_ai_evidence'),
      ('hr_legal_hold'),('hr_restricted_note')
    ) as d(token)
    left join platform.shareable_resource_registry s on s.resource_type = d.token
   where s.resource_type is null or not s.is_active;
$fn$;

comment on function hr.break_glass_registration_drift() is
  'hr_c3_14. Empty means HR break-glass can actually grant. A row means it cannot, and names the token. This defect lived because one absent registry row had no reader anywhere, and the only break-glass call ever exercised was one where refusing is correct.';

revoke all on function hr.break_glass_registration_drift() from public;
grant execute on function hr.break_glass_registration_drift() to service_role;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART E — contract pins. The wrong fix is now a contract break.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active,
   must_be_definer)
values
  ('public', 'permissions_validate_resource_type', 'hr_c3_14',
   array['platform.shareable_resource_registry', 'r.is_active', 'check_violation'],
   array[$$like 'hr%'$$, $$'hr_'$$, $$not like 'hr$$],
   'hr_c3_14: this guard is the reason HR break-glass could not grant, and it is NOT the bug. '
   || 'The right repair was to register the sixteen tokens; the tempting one was to carve HR out '
   || 'of this trigger. A resource_type that is a table name rather than an entity token inserts '
   || 'cleanly and is then silently ignored by iam.has_access (db-rules §6c) — an exemption for '
   || 'hr_% would re-open that for every future HR token. Pinned so the wrong fix is loud.',
   true, null),
  ('hr', '_guard_audited_tier_grant', 'hr_c3_14',
   array['hr._door_spec(new.resource_type)', 'hr._write_guard_key', 'hr_grant_forbidden',
         'statement_timestamp()::text || pg_backend_pid()::text'],
   array[]::text[],
   'hr_c3_14: this is the only thing standing between a registered audited-tier token and '
   || 'share_resource_with_user. created_by is populated on seven of these tables (measured live: '
   || 'employee_private 37/37, compensation 18/18), and shareable_owner_column falls back to it, '
   || 'so the row creator could otherwise hand a confidential record to anybody with one public '
   || 'RPC and no hr.access_audit row. Neutering this to `return new` restores that hole '
   || 'silently. must_be_definer is pinned: an INVOKER trigger function here could not read '
   || 'hr._write_guard_key as the calling role and would refuse every legitimate break-glass.',
   true, true),
  ('public', 'hr_break_glass', 'hr_c3_14',
   array['insert into iam.permissions', 'reason', 'break_glass', 'perform hr.arm_write()',
         'SPEC-ACCESS §5: the subject-exclusion veto overrides break-glass, absolutely'],
   array[]::text[],
   'hr_c3_14: break-glass is a GRANT, not a refusal ceremony. The arm_write call is what gets its '
   || 'insert past hr._guard_audited_tier_grant, and the §5 denial reason is asserted verbatim '
   || 'because the veto refusal is the half of this feature that was already correct and must '
   || 'survive the half that was not.',
   true, true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       must_be_definer  = excluded.must_be_definer,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART F — FALSIFICATION. Structural only; the behavioural three-way proof runs separately in
--          scripts/hr/hr_c3_14_break_glass_grants_falsification.py, against real personas.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_n int; v_broken int; v_tok text;
begin
  select count(*) into v_n from hr.break_glass_registration_drift();
  if v_n > 0 then
    select string_agg(token, ', ') into v_tok from hr.break_glass_registration_drift();
    raise exception 'hr_c3_14: % break-glass token(s) still unregistered: %', v_n, v_tok;
  end if;

  -- Every one of the sixteen must be honest about the door reading the grant, and must not be
  -- link-shareable. A `true` here would be a claim that RLS protects these tables the way it
  -- protects hr_employee, which it does not.
  select count(*) into v_n from platform.shareable_resource_registry s
    join lateral hr._door_spec(s.resource_type) d on true
   where d.allows_break_glass
     and (s.rls_uses_has_permission or coalesce(s.is_link_shareable, false));
  if v_n > 0 then
    raise exception 'hr_c3_14: % break-glass registry row(s) claim RLS reach or link sharing', v_n;
  end if;

  -- The guard is BOUND. Its source on disk proves nothing; only the catalog does.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'iam.permissions'::regclass
                    and tgname = '_hr_audited_tier_grant_guard_ins' and not tgisinternal) then
    raise exception 'hr_c3_14: the audited-tier grant guard is not bound to iam.permissions';
  end if;

  -- The 23514 guard this migration deliberately did NOT touch is still standing.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'iam.permissions'::regclass
                    and tgname = 'permissions_validate_resource_type_ins' and not tgisinternal) then
    raise exception 'hr_c3_14: permissions_validate_resource_type is gone. It is the guard, not the bug.';
  end if;

  -- This migration grants NOTHING. It makes granting possible; the first real grant is a
  -- break-glass call by a person with a justification.
  if exists (select 1 from hr.derived_grant where reason = 'break_glass') then
    raise exception 'hr_c3_14: a break_glass derived_grant exists already. This migration grants nothing.';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_c3_14: % contract(s) broken', v_broken;
  end if;

  raise notice 'hr_c3_14: sixteen break-glass tokens registered, the grant guard is bound, and nothing is granted yet.';
end $$;

commit;
