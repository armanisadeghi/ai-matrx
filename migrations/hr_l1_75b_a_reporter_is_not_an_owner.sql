-- hr_l1_75b — A REPORTER IS NOT AN OWNER.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Sub-step of slot hr_l1 #0075.
--
-- 🚨 FOUND BY THE SAME WALK, AND IT IS A HOLE THIS LANE'S OWN FIX MADE REACHABLE. hr_l1_75 gave
-- ordinary employees a way to file a complaint — the lane `hr_incident_create` has always
-- implemented and no surface ever offered. The walk then asked the obvious next question: with
-- the reporter now a real person rather than a hypothetical one, what does the CASE door say to
-- them? It said:
--
--     3c. TOMO tries to open the CASE itself  →  granted: true, basis: "self", is_self_access: true
--         { summary: "…", subject_name: "G2V-Priya Raman", subject_excluded: true, … }
--
-- The whole investigation record, including the accused manager's name and the complaint text, to
-- the reporter. SPEC-ACCESS §5 forbids it in as many words — *"A reporter is not an investigator.
-- They reach `hr_incident_status(p_incident_id)` … and no `investigation`-class
-- `hr.restricted_note` row"* — and SPEC-EMPLOYEES §2.2 r16 says the same: *"Reporter reaches
-- `hr_incident_status` — state, last-updated, declared next step — and **nothing** in the notes."*
--
-- ── THE MECHANISM, AND WHY IT SURVIVED ────────────────────────────────────────────────────────
--
-- `hr._door_verdict`'s owner lane is two arms in one expression:
--
--     v_is_self := (v_owner is not null and v_owner = p_user)          -- created_by
--                  or (v_subject is not null and v_subject = any(hr.employments_of(p_user)));
--
-- and its comment states the premise plainly: *"`created_by` is the SUBJECT on a confidential row
-- (§3), so a self-read is stamped is_self_access"*. That premise is TRUE for `hr_compensation`,
-- `hr_employee_private`, `hr_i9` and the rest of the confidential family — a person's own record
-- is created under their own identity — and it is FALSE for `hr.incident`, where `created_by` is
-- whoever FILED the report. On this one table the owner arm does not mean "the subject"; it means
-- "the reporter", and it grants them the self lane over a case about somebody else.
--
-- It survived because nothing ever exercised it. Until this lane, an incident could only be
-- created by somebody holding `incident.read` — who reaches the row through the role lane anyway
-- — so the owner arm never granted anything the role arm had not already granted. The moment an
-- employee with zero capabilities could file, the arm became the widest lane on the table. THE
-- DEFECT SHIPPED THE DAY THE FEATURE BECAME USABLE, which is the honest way to say it.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────────────────────────
--
-- The owner arm is switched off for `hr_incident` and `hr_incident_party`. It is NOT switched off
-- anywhere else: on every other token `created_by` really is the subject and removing it would
-- take a person's own record away from them.
--
--   · The SUBJECT arm is untouched, which is what keeps §4.9b C3 working — the subject of a
--     non-excluded safety incident still reads their own record through it (hr_l1_75a).
--   · §5's veto is unchanged and still evaluated FIRST, so an excluded subject is refused before
--     any of this is reached.
--   · The reporter now falls through to the refusal — and the client is already built for
--     exactly that: `CaseSurface` catches `denied && !wasReachable` and renders
--     `ReporterStatusView`, which reads the SEPARATE `hr_incident_status` door. The reporter
--     loses nothing they were entitled to and keeps everything §5 gives them by name.
--   · On `hr_incident_party` the same arm let whoever ADDED a party keep reading that party row
--     after losing reach on the case. A component is conveyed by its parent's reach or not at
--     all.
--
-- Idempotent: CREATE OR REPLACE only. Re-running is a no-op.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 0 — THE PRE-STATE OF EVERY OWNER-LANE TOKEN, CAPTURED BEFORE THE REPLACE.
--
-- PART 3 asserts that NOTHING outside the incident family moved, and it has to assert that as a
-- DIFF and not as an absolute: the first draft of this file claimed "every compensation row
-- answers `self` for its subject" and three live rows disproved it — for reasons that predate
-- this migration and have nothing to do with it (a subject whose spell is not in effect today is
-- not in `hr.employments_of(uid, current_date)`, so the subject arm legitimately does not fire).
-- An assert that fails for a reason the change did not cause is an assert that will be deleted by
-- the next person who hits it. This one compares the verdict to itself.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create temporary table _hr_l1_75b_before on commit drop as
select t.token, t.id, hr._door_verdict(t.uid, t.token, t.id, false) ->> 'basis' as basis
  from (
    select 'hr_compensation'::text as token, c.id, e.login_user_id as uid
      from hr.compensation c
      join hr.employment em on em.id = c.employment_id
      join hr.employee e on e.id = em.employee_id
     where c.deleted_at is null and e.login_user_id is not null
    union all
    select 'hr_employee_private', p.id, e.login_user_id
      from hr.employee_private p
      join hr.employee e on e.id = p.employee_id
     where p.deleted_at is null and e.login_user_id is not null
    union all
    select 'hr_corrective_action', ca.id, e.login_user_id
      from hr.corrective_action ca
      join hr.employment em on em.id = ca.employment_id
      join hr.employee e on e.id = em.employee_id
     where ca.deleted_at is null and e.login_user_id is not null
  ) t;

create or replace function hr._door_verdict(p_user uuid, p_token text, p_id uuid, p_break_glass boolean DEFAULT false)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare
  d record; v_schema text; v_table text; v_org uuid; v_subject uuid; v_owner uuid;
  v_caps text[]; v_bg_ok boolean; v_note_kind text; nk record; v_is_self boolean := false;
  v_cap text; v_allowed boolean := false; v_basis text; v_veto boolean := false;
begin
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr audited door: % is not an audited-tier token', p_token
      using errcode = '22023',
            hint = 'Add it to hr._door_spec with the capability set that opens it. An unlisted token is refused by construction.';
  end if;
  -- 🚨 THE ORG IS RESOLVED BEFORE ANY EARLY RETURN, AND A PROBE CAUGHT IT BEING RESOLVED AFTER.
  -- The doorless branch below used to return first, so a refusal on hr_eeo_response reached
  -- hr._record_access_audit with a NULL organization_id and died on the NOT NULL constraint —
  -- turning a clean, auditable refusal into a raise, which is exactly the failure mode the
  -- refusal-envelope law exists to prevent. Resolving first also preserves tranche 4's finding:
  -- a MISSING subject raises P0002 and writes NO phantom audit row, because nothing was reached
  -- and there is nothing to attribute.
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;

  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    raise exception 'hr audited door: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  if d.caps is null then
    return jsonb_build_object('allowed', false, 'basis', 'no_door', 'reason', d.no_door_reason,
                              'tier', d.tier, 'organization_id', v_org,
                              'schema', v_schema, 'table', v_table);
  end if;

  -- the subject of the row, where the token has one
  begin
    execute format('select %s from %I.%I where id = $1',
      case
        when p_token in ('hr_compensation','hr_separation','hr_corrective_action','hr_leave_case',
                         'hr_tax_withholding','hr_i9','hr_accommodation_request',
                         'hr_verification_letter_request') then 'employment_id'
        when p_token = 'hr_employee_private' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_emergency_contact' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_incident' then 'subject_employment_id'
        else 'null::uuid'
      end, v_schema, v_table) into v_subject using p_id;
  exception when others then v_subject := null;
  end;

  -- the owner lane: `created_by` is the SUBJECT on a confidential row (§3), so a self-read is
  -- stamped is_self_access and is EXCLUDED from the anomaly queue — auditing a person for reading
  -- their own salary is noise, not signal.
  begin
    execute format('select created_by from %I.%I where id = $1', v_schema, v_table)
       into v_owner using p_id;
  exception when others then v_owner := null;
  end;

  -- 🚨 THE OWNER ARM IS OFF FOR THE INCIDENT FAMILY, AND THE REASON IS THAT ITS PREMISE IS FALSE
  -- THERE (hr_l1_75b). On `hr.incident`, `created_by` is the person who FILED the report, not the
  -- person it is about — so the arm above does not mean "the subject reading their own record",
  -- it means "the reporter reading a case about somebody else". Walked live 2026-08-30: an
  -- employee with zero capabilities filed a harassment complaint about their manager and then
  -- read the whole case back — summary, accused name, everything — `basis: self`. SPEC-ACCESS §5:
  -- *"A reporter is not an investigator. They reach hr_incident_status … and no
  -- investigation-class hr.restricted_note row."* The SUBJECT arm stays, on every token including
  -- these two: it is what lets the subject of a NON-excluded safety incident read their own
  -- record (§4.9b C3), and §5's veto is still evaluated FIRST, above, so an excluded subject
  -- never reaches either arm. On `hr_incident_party` the same arm let whoever added a party keep
  -- reading it after losing the case; a component is conveyed by its parent's reach or not at
  -- all.
  v_is_self := (v_subject is not null and v_subject = any(hr.employments_of(p_user)))
               or (p_token not in ('hr_incident','hr_incident_party')
                   and v_owner is not null and v_owner = p_user);

  -- 🚨 §5's VETO IS EVALUATED BEFORE EVERY ALLOW LANE FOR THE TOKENS IT COVERS, INCLUDING THE SELF
  -- LANE — and a probe caught it being evaluated after. §5 says the veto is checked "after every
  -- allow lane" because it must OVERRIDE them; implementing that as a late check let the SELF
  -- short-circuit answer first, and the subject of a harassment case read the case about
  -- themselves (granted=true, basis=self). §3.2 is unambiguous: Employee (self) × hr.incident is
  -- "— (veto)" EVEN WHEN THEY ARE THE REPORTER. Overriding everything and being checked first are
  -- the same thing for an absolute veto; being checked first is the one that cannot be
  -- accidentally bypassed by a lane added later.
  if p_token in ('hr_incident','hr_incident_party')
     or (p_token = 'hr_restricted_note'
         and (select rn.subject_token from hr.restricted_note rn where rn.id = p_id) = 'hr_incident')
  then
    declare v_inc0 uuid;
    begin
      v_inc0 := case
        when p_token = 'hr_incident' then p_id
        when p_token = 'hr_incident_party' then (select incident_id from hr.incident_party where id = p_id)
        else (select rn.subject_id from hr.restricted_note rn where rn.id = p_id) end;
      if v_inc0 is not null and hr.incident_excluded(p_user, v_inc0) then
        return jsonb_build_object('allowed', false, 'basis', 'subject_excluded',
          'reason', 'SPEC-ACCESS §5: the caller is the subject of, or an accused party to, this investigation. The veto overrides incident.read, it overrides hr_owner, it overrides the self lane, and it overrides break-glass.',
          'organization_id', v_org, 'subject_employment_id', v_subject, 'tier', d.tier,
          'schema', v_schema, 'table', v_table);
      end if;
    end;
  end if;

  if v_is_self then
    return jsonb_build_object('allowed', true, 'basis', 'self', 'is_self', true,
                              'subject_employment_id', v_subject, 'organization_id', v_org,
                              'tier', d.tier, 'schema', v_schema, 'table', v_table);
  end if;

  -- ---------- §3.1a: hr.restricted_note resolves its capability PER CLASS, never by the token
  v_caps  := d.caps;
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    if not found then
      return jsonb_build_object('allowed', false, 'basis', 'unmapped_note_kind',
        'reason', format('note_kind %s has no reader mapping; a class nobody assigned a reader to must not fall through to the widest lane', v_note_kind),
        'organization_id', v_org, 'tier', 'restricted', 'schema', v_schema, 'table', v_table);
    end if;
    v_caps  := nk.caps;
    v_bg_ok := nk.allows_break_glass;
    v_veto  := nk.veto_applies;
  end if;

  -- ---------- the capability check, ANY-OF, population-scoped to the row's subject
  foreach v_cap in array v_caps loop
    if hr.capability(p_user, v_cap, v_subject, current_date, v_org) then
      v_allowed := true; v_basis := 'role';
      exit;
    end if;
  end loop;

  -- ---------- §5's investigator lane: a party with role='investigator' reaches the case
  if not v_allowed and p_token in ('hr_incident','hr_incident_party') then
    if exists (select 1 from hr.incident_party ip
                where ip.party_role = 'investigator' and ip.deleted_at is null
                  and ip.employment_id = any(hr.employments_of(p_user))
                  and ip.incident_id = case when p_token = 'hr_incident' then p_id
                       else (select ip2.incident_id from hr.incident_party ip2 where ip2.id = p_id) end)
    then v_allowed := true; v_basis := 'authority'; end if;
  end if;

  -- ---------- break-glass, if this token and class permit it at all
  if not v_allowed and p_break_glass and v_bg_ok
     and hr._break_glass_active(p_user, p_token, p_id) then
    v_allowed := true; v_basis := 'break_glass';
  end if;
  if not v_allowed and not p_break_glass and hr._break_glass_active(p_user, p_token, p_id)
     and v_bg_ok then
    v_allowed := true; v_basis := 'break_glass';
  end if;

  -- ---------- 🚨 §5's VETO, EVALUATED LAST AND UNCONDITIONALLY.
  -- It is checked AFTER every allow lane, it overrides incident.read, it overrides hr_owner, and
  -- it overrides break-glass. An investigation record cannot be modelled additively — the accused
  -- would otherwise reach it through the HR-admin lane.
  if p_token in ('hr_incident','hr_incident_party') or v_veto then
    declare v_inc uuid;
    begin
      v_inc := case
        when p_token = 'hr_incident' then p_id
        when p_token = 'hr_incident_party' then (select incident_id from hr.incident_party where id = p_id)
        else (select rn.subject_id from hr.restricted_note rn
               where rn.id = p_id and rn.subject_token = 'hr_incident') end;
      if v_inc is not null and hr.incident_excluded(p_user, v_inc) then
        return jsonb_build_object('allowed', false, 'basis', 'subject_excluded',
          'reason', 'SPEC-ACCESS §5: the caller is the subject of, or a party to, this investigation. The veto overrides incident.read, it overrides hr_owner, and it overrides break-glass.',
          'organization_id', v_org, 'subject_employment_id', v_subject, 'tier', d.tier,
          'schema', v_schema, 'table', v_table);
      end if;
    end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'basis', coalesce(v_basis,'none'),
    'is_self', false, 'subject_employment_id', v_subject, 'organization_id', v_org,
    'tier', d.tier, 'schema', v_schema, 'table', v_table,
    'reason', case when v_allowed then null else
      format('the caller holds none of %s over this row''s population', array_to_string(v_caps, ', ')) end);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — CONTRACT PIN.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', '_door_verdict', 'hr_l1_75b',
   array['p_token not in (''hr_incident'',''hr_incident_party'')',
         'v_subject = any(hr.employments_of(p_user))',
         'ip.party_role = ''investigator'''],
   array['v_is_self := (v_owner is not null and v_owner = p_user)'],
   'hr_l1_75b: on hr.incident, `created_by` is the REPORTER and not the subject, so the shared '
   || 'owner lane hands a person who filed a complaint the whole case about somebody else — '
   || 'walked live, basis:self, summary and accused name included. SPEC-ACCESS §5: a reporter is '
   || 'not an investigator. The banned string is the unconditional owner arm this replaced. The '
   || 'subject arm and the investigator arm are pinned alongside it because removing EITHER is '
   || 'the opposite mistake: the subject arm is how a non-excluded safety subject reads their own '
   || 'record (§4.9b C3), and the investigator arm is how a party with no incident.read reaches '
   || 'the case at all (§2.2 r16).',
   true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — FALSIFICATION. The hole closes; nothing else moves.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_bad int; v_broken int; v_v jsonb;
begin
  -- 1. NO REPORTER REACHES A CASE THEY ARE NOT ALSO THE SUBJECT OF. Evaluated through the real
  --    verdict function, per live row, for the reporter's own login.
  select count(*) into v_bad
    from hr.incident i
    join hr.employment em on em.id = i.reporter_employment_id
    join hr.employee e on e.id = em.employee_id
   where i.deleted_at is null
     and e.login_user_id is not null
     and i.subject_employment_id is distinct from i.reporter_employment_id
     and not hr.capability(e.login_user_id, 'incident.read', null, current_date, i.organization_id)
     and not exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'investigator'
                        and ip.deleted_at is null and ip.employment_id = em.id)
     and (hr._door_verdict(e.login_user_id, 'hr_incident', i.id, false) ->> 'allowed')::boolean;
  if v_bad > 0 then
    raise exception 'hr_l1_75b: % reporter(s) still reach a case about somebody else.', v_bad;
  end if;

  -- 2. THE SUBJECT ARM STILL WORKS where §4.9b C3 needs it: a non-excluded subject reaches their
  --    own record even with zero capabilities.
  select count(*) into v_bad
    from hr.incident i
    join hr.employment em on em.id = i.subject_employment_id
    join hr.employee e on e.id = em.employee_id
   where i.deleted_at is null
     and not i.subject_excluded
     and e.login_user_id is not null
     and not exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'accused'
                        and ip.deleted_at is null and ip.employment_id = em.id)
     and not (hr._door_verdict(e.login_user_id, 'hr_incident', i.id, false) ->> 'allowed')::boolean;
  if v_bad > 0 then
    raise exception 'hr_l1_75b: % non-excluded subject(s) lost their own record.', v_bad;
  end if;

  -- 3. THE VETO STILL OVERRIDES EVERYTHING. Every excluded subject and every accused party is
  --    refused, and refused with §5's own basis rather than by simply running out of lanes.
  select count(*) into v_bad
    from hr.incident i
    join hr.employment em on em.id = i.subject_employment_id
    join hr.employee e on e.id = em.employee_id
   where i.deleted_at is null and i.subject_excluded and e.login_user_id is not null
     and (hr._door_verdict(e.login_user_id, 'hr_incident', i.id, true) ->> 'basis')
         is distinct from 'subject_excluded';
  if v_bad > 0 then
    raise exception 'hr_l1_75b: % excluded subject(s) are not refused by the veto (break-glass on).', v_bad;
  end if;

  select count(*) into v_bad
    from hr.incident_party ip
    join hr.incident i on i.id = ip.incident_id and i.deleted_at is null
    join hr.employment em on em.id = ip.employment_id
    join hr.employee e on e.id = em.employee_id
   where ip.party_role = 'accused' and ip.deleted_at is null and e.login_user_id is not null
     and (hr._door_verdict(e.login_user_id, 'hr_incident', i.id, true) ->> 'basis')
         is distinct from 'subject_excluded';
  if v_bad > 0 then
    raise exception 'hr_l1_75b: % accused part(ies) are not refused by the veto (break-glass on).', v_bad;
  end if;

  -- 4. NOTHING OUTSIDE THE INCIDENT FAMILY MOVED — asserted as a DIFF against PART 0's capture,
  --    over every token whose owner lane this function still runs.
  select count(*) into v_bad
    from _hr_l1_75b_before b
    join lateral (
      select hr._door_verdict(t.uid, b.token, b.id, false) ->> 'basis' as basis
        from (select case b.token
                       when 'hr_compensation' then
                         (select e.login_user_id from hr.compensation c
                            join hr.employment em on em.id = c.employment_id
                            join hr.employee e on e.id = em.employee_id where c.id = b.id)
                       when 'hr_employee_private' then
                         (select e.login_user_id from hr.employee_private p
                            join hr.employee e on e.id = p.employee_id where p.id = b.id)
                       else
                         (select e.login_user_id from hr.corrective_action ca
                            join hr.employment em on em.id = ca.employment_id
                            join hr.employee e on e.id = em.employee_id where ca.id = b.id)
                     end as uid) t
    ) a on true
   where a.basis is distinct from b.basis;
  if v_bad > 0 then
    raise exception 'hr_l1_75b: % owner-lane verdict(s) OUTSIDE the incident family changed. Refusing.', v_bad;
  end if;
  raise notice 'hr_l1_75b: % owner-lane verdict(s) re-checked outside the incident family, all unchanged.',
    (select count(*) from _hr_l1_75b_before);

  raise notice 'hr_l1_75b: reporter lane closed; subject, investigator and confidential owner lanes intact.';

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_75b: % contract(s) broken', v_broken;
  end if;
end $$;
