-- hr_l1_63 — A DERIVATION THAT READS A STALE ENUM IS A STORED STATUS (D4A / D4B)
--
-- hr_l1_60 deleted `hr.employee.directory_status` because it was a status with
-- no writer, and replaced it with the derivation
-- `hr.employee_directory_status(employee_id, on_date)` — on the argument that
-- this status is a function of TODAY, and only a derivation can be right
-- tomorrow morning. The derivation then short-circuited on
-- `hr.employment.status`:
--
--     when em.hire_date > p_on or em.status = 'pending' then 'prehire'
--
-- with the comment "`pending` and a future hire date are the same fact said
-- twice; either one is enough." They are the same fact for exactly as long as
-- the hire date is in the future. THE MORNING THE HIRE DATE ARRIVES THEY STOP
-- BEING THE SAME FACT, and NOTHING IN THIS DATABASE EVER CHANGES `pending` TO
-- `active`:
--
--   · no trigger on `hr.employment` (the only one is `_zzz_derive_grants`,
--     which derives GRANTS)
--   · no `cron.job` — the table is empty of any such sweep
--   · `hr.refresh_current_positions_due` touches
--     `current_position_assignment_id`, `current_manager_employment_id` and the
--     other `current_*` columns, and never `status`
--   · `public.hr_employee_create` stamps it once, at hire
--     (`case when v_hire > current_date then 'pending' else 'active' end`),
--     and never returns to it
--
-- So the derivation inherited the very dependency it was built to eliminate,
-- and inherited it in a WORSE form: the deleted column was wrong from the
-- morning after each hire date, one person at a time; this was wrong FOREVER,
-- with no column left to patch. Measured before this migration, all SEVEN
-- pending employments across three organizations read `prehire` on their hire
-- date, the day after, and ninety days later. One employer's headcount was
-- frozen at 14 against a truth-from-dates of 14 / 15 / 16 / 17 on
-- 2026-08-29 / 09-01 / 09-10 / 09-16 — and `Zzz Linkprobe` starts 2026-09-01,
-- three days after this was found, to a directory chip reading
-- "Not started yet".
--
-- D4B, the same function, the other direction: `em.status = 'terminated'` was
-- tested with NO reference to `p_on` at all, so the answer for somebody who has
-- left was "terminated" at EVERY as-of date, including dates they were working
-- here. That is not a hypothetical — `hr_employee_profile(p_employee_id,
-- p_as_of)` takes its date from the `?as_of=` query string
-- (app/(core)/hr/people/[employeeId]/[tab]/page.tsx:27,39), so a URL a user can
-- type returned `terminated` for `G2offb Offboardme` (hired 2026-03-01,
-- separated 2026-08-20) on `as_of=2026-05-01`. SPEC-EMPLOYEES route 10 promises
-- the filter "states the as-of semantics (terminated on or before today)"; a
-- word with no date in it cannot state as-of semantics.
--
-- THE RULE THIS MIGRATION SETTLES: the directory status is derived from the
-- DATES on the spell, compared against the as-of date. `hr.employment.status`
-- contributes only what no date can express — a separation with no date on it,
-- and leave — and it can never override a date.
--
-- Lane L1 (Employees) · SPEC-EMPLOYEES §1.2 / §1.3 route 1 / route 10 · D4A/D4B.


-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE DERIVATION, NOW READING THE FACTS.
--
-- 🚨 THE LADDER IS ORDERED SO THAT A DATE ALWAYS BEATS THE ENUM. Read it as
-- three questions asked of the spell, in this order and no other:
--
--   1. HAD THEY STARTED, as of `p_on`? `hire_date > p_on` and nothing else.
--      `em.status = 'pending'` is deliberately ABSENT from this branch and is
--      pinned absent by the contract row at the foot of this file. It is the
--      value that never gets written a second time, so consulting it is
--      consulting a stored status — the defect hr_l1_60 existed to remove.
--      With the enum gone from here, the hire date arriving is all it takes:
--      the row does not change, and the next morning the answer does.
--
--   2. HAD THEY LEFT, as of `p_on`? The date decides — `termination_date <
--      p_on`, so the last day worked still reads `active`, which is the
--      behaviour hr_l1_60 shipped and this migration does not move. The WORD
--      `terminated` is believed ONLY when there is no date to believe instead
--      (`termination_date is null`), because then it is the sole evidence we
--      have. That single guard is the whole of the D4B fix: it is what stops a
--      separation recorded today from rewriting somebody's history at every
--      earlier as-of date. `hr_separation_record` leaves `status` alone for a
--      FUTURE-dated separation, so branch 2 still catches the word-only case,
--      and branch 1 still runs first so a spell that had not begun cannot read
--      `terminated`.
--
--   3. WERE THEY AWAY? `on_leave` / `suspended` carry no date of their own, so
--      the enum is the only source — but it is asked LAST, after both dates
--      have had their say, and therefore can no longer overrule them.
--
-- The resolution order below is unchanged from hr_l1_60 on purpose: it answers
-- "which spell describes this person on this date", preferring one that is live
-- or still to come over one that has ended, so a rehire reads from the new
-- spell and a leaver from the old.
create or replace function hr.employee_directory_status(p_employee_id uuid, p_on date)
returns text
language sql
stable
as $fn$
  select case
    when p_employee_id is null then null
    else coalesce((
      select case
        -- 1. NOT YET STARTED. The hire date, alone, against the as-of date.
        when em.hire_date > p_on then 'prehire'
        -- 2. GONE. By date; or by word ONLY when the spell carries no date.
        when em.termination_date is not null and em.termination_date < p_on then 'terminated'
        when em.termination_date is null and em.status = 'terminated'        then 'terminated'
        -- 3. AWAY. Dateless facts, asked after the dates have decided.
        when em.status in ('on_leave','suspended')                           then 'on_leave'
        else 'active'
      end
      from (
        select em2.*
          from hr.employment em2
         where em2.employee_id = p_employee_id
           and em2.deleted_at is null
         order by (em2.status <> 'terminated'
                   and (em2.termination_date is null or em2.termination_date >= p_on)) desc,
                  em2.hire_date desc,
                  em2.spell_number desc
         limit 1
      ) em),
      -- On the roster with no spell at all. They have not started, which is what
      -- `prehire` says; `active` would claim they are working here today.
      'prehire')
  end
$fn$;

comment on function hr.employee_directory_status(uuid, date) is
  'SPEC-EMPLOYEES route 10 / D4, D4A, D4B. The ONE derivation of a person''s directory status, from the DATES on their employment spells as of a date. hr.employment.status contributes only what no date can express (a separation with no date, and leave) and can never override a date — hr_l1_63.';

revoke all on function hr.employee_directory_status(uuid, date) from public;
grant execute on function hr.employee_directory_status(uuid, date) to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- THE PROFILE HEADER SPEAKS THE DERIVED VOCABULARY, ALWAYS (D4B).
--
-- 🚨 A DOOR THAT SOMETIMES RETURNS A RAW ENUM HAS TWO VOCABULARIES. hr_l1_60
-- left this header reading
--
--     coalesce(v_em.status, hr.employee_directory_status(p_employee_id, v_on))
--
-- so the derivation was only ever the FALLBACK, reached for the two populations
-- `hr.employment_as_of` answers nothing for. Everyone else got `v_em.status`
-- verbatim — a value from the RAW spell enum
-- (`pending|active|on_leave|suspended|terminated`), which is not the derived
-- vocabulary (`prehire|active|on_leave|terminated`) the directory speaks.
-- Proven at the door: `Mari36 Okonkwo` (hire 2026-09-15) returned the raw
-- string `pending` at `as_of=2026-09-16`, and `HrStatusChip` captions `pending`
-- "Not started yet" — the D4A lie surfacing on the record as well as the list,
-- for somebody who started yesterday.
--
-- The coalesce is deleted rather than reordered. There is no date at which the
-- raw enum is the better answer: `hr.employment_as_of` already selects the
-- spell BY DATE, and the derivation reads that same spell's dates. Sending both
-- surfaces through the one function is the D4 rule, and this was the last place
-- in the read path that did not.
--
-- The other `v_em.*` fields stay exactly as they were — `spell_number` and
-- `hire_date` are facts of the resolved spell, not a status with no writer.
CREATE OR REPLACE FUNCTION public.hr_employee_profile(p_employee_id uuid, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_on date := coalesce(p_as_of, current_date);
  v_v jsonb; v_kind text; v_org uuid; v_emp uuid; v_e hr.employee%rowtype;
  v_em hr.employment%rowtype; v_pa hr.position_assignment%rowtype;
  v_tabs text[] := '{}'; v_header jsonb; v_personal jsonb; v_worker_class text;
  v_comp_mgr text; v_pending int; v_priv jsonb; v_priv_id uuid;
begin
  if v_uid is null then
    raise exception 'hr_employee_profile: no authenticated caller' using errcode = '42501';
  end if;

  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  v_org  := (v_v ->> 'organization_id')::uuid;
  v_emp  := nullif(v_v ->> 'subject_employment_id','')::uuid;

  if v_kind = 'none' then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee',
      p_purpose => 'profile', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_row_count => 0,
      p_sensitivity_tier => 'internal', p_subject_employment_id => v_emp,
      p_denial_reason => 'no_lane');
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  select * into v_e from hr.employee where id = p_employee_id;
  select * into v_em from hr.employment_as_of(p_employee_id, v_on);
  if v_em.id is not null then
    select * into v_pa from hr.primary_position_as_of(v_em.id, v_on);
  end if;
  v_worker_class := v_pa.worker_class;

  -- A DEFAULT THAT DECIDES A RULE IS NOT A DEFAULT. coalesce(v_worker_class,'employee')
  -- gates the Time Off tab (4.7), and for a prehire BOTH employment_as_of and
  -- primary_position_as_of are null - so the guard answered 'employee' for exactly the
  -- population it exists to catch, and a contractor got a Time Off tab (UPW-77421).
  -- Resolved the way hr_directory_list already resolves it (RECORDED DECISION 3b).
  if v_worker_class is null then
    select pa2.worker_class into v_worker_class
      from hr.employment em2
      join hr.position_assignment pa2 on pa2.employment_id = em2.id
       and pa2.is_primary and pa2.deleted_at is null
     where em2.employee_id = p_employee_id and em2.deleted_at is null
     order by pa2.effective_from asc
     limit 1;
  end if;

  -- An engagement is itself the answer when no position exists yet: 4.7's branch is
  -- ABOUT engagements.
  if v_worker_class is null and exists (
       select 1 from hr.engagement en
        join hr.employment em3 on em3.id = en.employment_id
       where em3.employee_id = p_employee_id
         and em3.deleted_at is null and en.deleted_at is null) then
    v_worker_class := 'contractor';
  end if;

  v_tabs := array_append(v_tabs, 'personal');
  -- 🚨 THE JOB TAB IS NOT A PEER'S. `hr_employment_history` refuses `peer` outright, so
  -- offering the tab would render an empty panel — the exact thing §1.3 forbids ("a tab
  -- whose every field is inaccessible is not in the tab bar"), and a disclosure besides:
  -- an empty Job tab tells a colleague a job record exists and that somebody else can
  -- read it. Personal stays, because what a peer gets there is the directory tier they
  -- can already read on route 10.
  if v_kind <> 'peer' then
    v_tabs := array_append(v_tabs, 'job');
  end if;

  if v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on, v_org) then
    v_tabs := array_append(v_tabs, 'compensation');
  elsif v_kind = 'manager' then
    v_comp_mgr := hr._knob('hr.access','comp_visibility_for_managers') #>> '{}';
    if v_comp_mgr = 'band_only' then v_tabs := array_append(v_tabs, 'compensation'); end if;
  end if;

  if v_kind in ('self','manager','hr_admin','org_admin') then
    if coalesce(v_worker_class,'employee') <> 'contractor' then
      v_tabs := array_append(v_tabs, 'time-off');
    end if;
    v_tabs := array_append(v_tabs, 'time');
    v_tabs := array_append(v_tabs, 'training');
  end if;
  if v_kind in ('self','manager','hr_admin') then
    v_tabs := array_append(v_tabs, 'performance');
  end if;

  if v_kind in ('self','hr_admin') then
    v_tabs := array_append(v_tabs, 'emergency');
    v_tabs := array_append(v_tabs, 'documents');
  end if;
  if v_kind in ('manager','hr_admin') then
    v_tabs := array_append(v_tabs, 'notes');
  end if;
  if hr.capability(v_uid, 'incident.read', v_emp, v_on, v_org)
     or hr.capability(v_uid, 'corrective_action.issue', v_emp, v_on, v_org) then
    v_tabs := array_append(v_tabs, 'relations');
  end if;

  select count(*) into v_pending from (
    select 1 from hr.position_assignment pa where pa.employment_id = v_em.id
       and pa.deleted_at is null and pa.effective_from > v_on
    union all
    select 1 from hr.compensation c where c.employment_id = v_em.id
       and c.deleted_at is null and c.effective_from > v_on
       and (v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on, v_org))
    union all
    select 1 from hr.reporting_line rl where rl.employment_id = v_em.id
       and rl.deleted_at is null and rl.effective_from > v_on) p;

  v_header := jsonb_build_object(
    'employee_id', v_e.id, 'employment_id', v_em.id,
    'display_name', v_e.display_name,

    'pronouns', v_e.pronouns,
    'photo_file_id', v_e.photo_file_id,
    'employee_number', v_e.employee_number,
    'party_id', v_e.party_id,

    -- 🚨 ONE VOCABULARY, ONE DERIVATION, EVERY VIEWER (D4 / D4B, hr_l1_63).
    -- This used to coalesce the raw `v_em.status` over the derivation, which
    -- made the derivation a mere fallback for the terminated and the not-yet-
    -- started, and handed everybody else the RAW `hr.employment.status` enum.
    -- (That coalesce is named in full in this migration's contract row, and
    -- deliberately NOT written out here: the contract bans the token from
    -- `prosrc`, and a comment quoting it would re-break the very rule it
    -- explains.)
    -- Live, that returned the string `pending` through `?as_of=` for a person
    -- whose hire date had already arrived. The header now answers with the same
    -- function the directory answers with, as of the same date, so the list and
    -- the record cannot disagree about who is here — and no raw enum value can
    -- reach the client.
    'status', hr.employee_directory_status(p_employee_id, v_on),
    'spell_number', v_em.spell_number,
    'hire_date', v_em.hire_date,
    'worker_class', v_worker_class,
    'job_title_id', v_pa.job_title_id,
    'job_title', (select title from hr.job_title where id = v_pa.job_title_id),
    'department_id', v_pa.department_id,
    'department', (select name from hr.department where id = v_pa.department_id),
    'location_id', v_pa.location_id,
    'location', (select name from hr.location where id = v_pa.location_id),
    'manager_employment_id', v_pa.manager_employment_id,
    'manager_employee_id', (select em2.employee_id from hr.employment em2
                             where em2.id = v_pa.manager_employment_id),
    'manager_name', (select e2.display_name from hr.employment em2
                       join hr.employee e2 on e2.id = em2.employee_id
                      where em2.id = v_pa.manager_employment_id),
    'direct_report_count', (select count(*) from hr.position_assignment pa2
                             where pa2.manager_employment_id = v_em.id and pa2.is_primary
                               and pa2.deleted_at is null and pa2.effective_from <= v_on
                               and (pa2.effective_to is null or pa2.effective_to >= v_on)),
    'pending_change_count', v_pending)
    -- 🚨 ABSENT, NOT NULL (§1.3). These two keys are permission-gated, so they are MERGED IN for a
    -- permitted viewer rather than emitted with a null value — `jsonb_build_object` keeps a NULL
    -- key, and a present-but-null `legal_name` renders as "Not provided", which tells a colleague
    -- the person HAS no legal name. Every other null in this payload means "empty" and is left
    -- exactly as it is; the distinction is permission, never null-ness.
    || case when v_kind in ('self','hr_admin') then jsonb_build_object(
         'legal_name', trim(concat_ws(' ', v_e.legal_first_name, v_e.legal_middle_name,
                                            v_e.legal_last_name, v_e.legal_name_suffix)),
         'login_user_id', v_e.login_user_id)
       else '{}'::jsonb end;

  v_personal := jsonb_build_object(
    'preferred_first_name', v_e.preferred_first_name,
    'preferred_last_name', v_e.preferred_last_name,
    'pronouns', v_e.pronouns,
    'work_email', v_e.work_email,
    'work_phone', v_e.work_phone,
    'directory_opt_out', v_e.directory_opt_out,
    'photo_file_id', v_e.photo_file_id,
    'custom', case when v_kind in ('self','hr_admin') then v_e.custom else null end);

  if v_kind in ('self','hr_admin') then
    v_personal := v_personal || jsonb_build_object(
      'legal_first_name', v_e.legal_first_name,
      'legal_middle_name', v_e.legal_middle_name,
      'legal_last_name', v_e.legal_last_name,
      'legal_name_suffix', v_e.legal_name_suffix,
      'former_names', v_e.former_names);

    select ep.id into v_priv_id
      from hr.employee_private ep
     where ep.employee_id = p_employee_id and ep.deleted_at is null
     limit 1;

    if v_priv_id is null then
      v_personal := v_personal || jsonb_build_object(
        'private', null,
        'private_state', 'not_collected');
    else
      select hr._door_get('hr_employee_private', v_priv_id,
                          'profile', null, false, 'confidential')
        into v_priv;
      if coalesce((v_priv ->> 'granted')::boolean, false) then
        v_personal := v_personal || jsonb_build_object(
          'private', (v_priv -> 'row') - 'ssn_ciphertext' - 'ssn_key_id' - 'ssn_hmac'
                                       - 'national_id_ciphertext',
          'private_audit_id', v_priv ->> 'audit_id');
      else
        v_personal := v_personal || jsonb_build_object(
          'private', null,
          'private_state', 'not_reachable');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'granted', true,
    'as_of', v_on,
    'viewer', v_kind,
    'capabilities', v_v -> 'caps',
    'organization_id', v_org,
    'tabs', to_jsonb(v_tabs),
    'header', v_header,
    'personal', v_personal,
    'comp_visibility', coalesce(v_comp_mgr,
      case when v_kind = 'self' or hr.capability(v_uid,'comp.read', v_emp, v_on, v_org)
           then 'full' else 'none' end),
    'worker_class_machinery', jsonb_build_object(
      'i9',        coalesce(v_worker_class,'employee') <> 'contractor',
      'w4',        coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'pto',       coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'overtime',  coalesce(v_worker_class,'employee') not in ('contractor','volunteer')
                   and coalesce(v_pa.flsa_status,'nonexempt') = 'nonexempt',
      'payroll',   coalesce(v_worker_class,'employee') not in ('contractor','volunteer')));
end
$function$;

-- The definer guard (platform.enforce_definer_client_grants) revokes client
-- EXECUTE on any undeclared SECURITY DEFINER function it sees created. This one
-- is in platform.definer_client_grant_grandfather (argtypes '2950 1082'), so the
-- guard skips it and the existing grants survive the replace. Re-asserted anyway,
-- because a door that 404s for every user is not a subtle failure.
grant execute on function public.hr_employee_profile(uuid, date) to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- THE CONTRACT MOVES WITH THE FIX. `hr.function_contracts_broken()` runs these
-- against `prosrc` on every later migration.
--
-- The hr_l1_60 row pinned `em.status = 'terminated'` — a token that pinned the
-- D4B defect in place, since it was satisfied by the very dateless test that
-- rewrote people's history. It is superseded here, not merely added to. The
-- hr_l1_60 rows for hr_directory_list, hr_org_summary and hr_employee_create are
-- untouched and still enforced.
delete from hr.function_contract
 where home_migration = 'hr_l1_63_the_derivation_reads_dates_not_a_stale_enum.sql'
    or (schema_name = 'hr' and function_name = 'employee_directory_status'
        and home_migration = 'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain,
   must_be_definer, reason)
values
  ('hr', 'employee_directory_status',
   'hr_l1_63_the_derivation_reads_dates_not_a_stale_enum.sql',
   array[
     'when em.hire_date > p_on then ''prehire''',
     'em.termination_date is not null and em.termination_date < p_on',
     'em.termination_date is null and em.status = ''terminated''',
     'order by (em2.status <> ''terminated'''],
   array['em.status = ''pending'''],
   false,
   'D4A/D4B: the ONE derivation reads DATES against the as-of date. Whether somebody has started is the hire date alone — em.status = ''pending'' is banned here, because nothing in the database ever writes that column a second time, so consulting it froze all 7 pending employments at prehire forever. Whether somebody has left is the termination date; the WORD terminated is believed only when the spell carries no date, or a separation recorded today rewrites their status at every earlier as-of date. The resolution order must still prefer a live/future spell over an ended one, or a rehire reads as terminated.'),
  ('public', 'hr_employee_profile',
   'hr_l1_63_the_derivation_reads_dates_not_a_stale_enum.sql',
   array['''status'', hr.employee_directory_status(p_employee_id, v_on)'],
   array['coalesce(v_em.status,'],
   true,
   'D4B: the profile header speaks the DERIVED vocabulary (prehire|active|on_leave|terminated) through the same function the directory speaks, as of the same date. coalesce(v_em.status, ...) made the derivation a fallback and handed every other viewer the RAW hr.employment.status enum — which returned the string ''pending'' through ?as_of= for a person whose hire date had already arrived.');
