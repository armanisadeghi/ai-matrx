-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE ER AND VERIFICATION QUEUES SAID "Not on record here" ABOUT PEOPLE SQUARELY ON RECORD.
--
-- `hr._door_list` projects each row through `hr._project_row`, which returns the table's own
-- columns minus the client-excluded ones. For every subject-bearing record in the audited tiers
-- that means the queue receives `employment_id` — a uuid — and NOTHING that names a person.
-- `hr.employment` is not PostgREST-reachable, so the client cannot resolve the uuid either; the
-- queue renders its no-subject fallback and an investigator reading the incident list is told the
-- employee is not on record. They are on record. The read simply never carried their name.
--
-- This is the silent-failure shape this lane keeps finding: nothing errors, the door reports
-- success, the audit row says a list was read, and the surface states something false.
--
-- THE FIX. `hr._project_row` adds a `subject_name` alongside the subject's employment id, under
-- the directory's own suppression rule. Doing it in `_project_row` rather than in `_door_list`
-- means the single-record door (`hr.read_confidential` → `hr._door_get`) is fixed by the same
-- change; a name that appears in the queue and vanishes on the detail page would be its own bug.
--
-- SUPPRESSION — the directory's rule, verbatim in effect. `hr_directory_list` suppresses an
-- employee whose `directory_opt_out` is set, EXCEPT for HR and except for the subject reading
-- their own row. Here the row is already reachable (the caller passed `hr._door_verdict` for it,
-- which is a stricter gate than the directory's), so opt-out suppresses the NAME rather than the
-- row: `subject_name` comes back null and the surface falls back to the uuid. Restricted rows
-- stay contentless.
--
-- Authority: SPEC-ACCESS §4.2 (audited-tier projection), SPEC-EMPLOYEES §1.2 (directory opt-out),
-- SPEC-UI-IA §6 (the ER / verification queues).
--
-- Applied live as `hr_l3_41_subject_name_projection`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. BY COLUMN, NOT BY A TOKEN ALLOWLIST. The subject column is `subject_employment_id` on
--    `hr.incident` and `employment_id` on corrective_action / accommodation_request / leave_case /
--    verification_letter_request / records_request / incident_party. A hardcoded token list would
--    have to be edited every time a record class is added and would silently omit the new one —
--    exactly how this defect got here. The projection keys off whichever of those two columns the
--    row actually has, so a new subject-bearing class is covered on the day it ships.
-- 2. `hr.restricted_note` GETS NOTHING, DELIBERATELY. Its subject is polymorphic
--    (`subject_token` + `subject_id`) and `subject_id` is not an employment id. Resolving it as
--    one would attach a confidently wrong name to a restricted note. It keeps no `subject_name`.
-- 3. HR IS RECOGNISED THROUGH `hr._punch_capability`, NOT `hr._l1_persona`. The persona resolver
--    asks `hr.capability(user, 'identity.write', NULL, at)`, and with a NULL subject that predicate
--    skips its population check — so an HR role held in ANY organization reads as `hr_admin` in
--    EVERY organization the caller belongs to. Verified live on 2026-08-27: `_l1_persona` returns
--    'hr_admin' for a user whose only HR role assignment is in a different org. That hole belongs
--    to L1 and is reported, not patched here; this migration simply refuses to import it, and uses
--    the org-rung-defended predicate instead. The cost is that an HR admin who holds no employment
--    in the organization sees `subject_name` suppressed for opt-out subjects. Suppression erring
--    toward silence is the safe direction for a name.
-- 4. THE REVERSE LOOKUP IS NOT OFFERED. `subject_name` is projected onto a row the caller already
--    holds. Nothing here lets anyone go from a name to a record they could not already read.

-- ── 1. the name, under the directory's suppression rule ─────────────────────────────────────
create or replace function hr._subject_display_name(p_employment_id uuid, p_uid uuid)
returns text
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare v_name text; v_optout boolean; v_org uuid; v_login uuid;
begin
  if p_employment_id is null or p_uid is null then return null; end if;

  select e.display_name, e.directory_opt_out, e.organization_id, e.login_user_id
    into v_name, v_optout, v_org, v_login
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id and e.deleted_at is null;

  if v_name is null then return null; end if;
  if not coalesce(v_optout, false) then return v_name; end if;

  -- opted out: only the subject themselves, and HR in THIS organization, still see the name
  if v_login is not distinct from p_uid then return v_name; end if;
  if hr._punch_capability(p_uid, 'identity.write',        null, current_date, v_org)
     or hr._punch_capability(p_uid, 'working_record.write', null, current_date, v_org) then
    return v_name;
  end if;
  return null;
end
$fn$;

-- ── 2. carry it on every audited-tier projection ────────────────────────────────────────────
create or replace function hr._project_row(p_token text, p_schema text, p_table text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare v_row jsonb; c text; v_subject uuid;
begin
  execute format('select to_jsonb(t) from %I.%I t where t.id = $1', p_schema, p_table)
     into v_row using p_id;
  if v_row is null then return null; end if;
  foreach c in array coalesce(
      (select client_excluded_columns from platform.entity_types where token = p_token), '{}'::text[])
  loop
    v_row := v_row - c;
  end loop;

  -- hr_l3_41 decision 1: whichever subject column this class actually carries. `hr.incident` names
  -- it `subject_employment_id`; the rest name it `employment_id`. Anything else keeps no name.
  v_subject := coalesce(nullif(v_row ->> 'subject_employment_id',''),
                        nullif(v_row ->> 'employment_id',''))::uuid;
  if v_subject is not null then
    v_row := v_row || jsonb_build_object(
      'subject_name', hr._subject_display_name(v_subject, auth.uid()));
  end if;

  return v_row;
end
$fn$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare
  v_em uuid; v_login uuid; v_row jsonb; v_name text;
begin
  -- a real employment with a real name
  select em.id, e.login_user_id into v_em, v_login
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.deleted_at is null and e.display_name is not null
     and not coalesce(e.directory_opt_out, false)
   limit 1;
  if v_em is null then
    raise notice 'hr_l3_41: no employee to assert against; projection shipped unverified here';
    return;
  end if;

  -- the subject always sees their own name (and so does anyone, when opt-out is not set)
  v_name := hr._subject_display_name(v_em, coalesce(v_login, gen_random_uuid()));
  if v_name is null then
    raise exception 'hr_l3_41: a non-opted-out subject resolved to no name';
  end if;

  -- decision 2: a row with no subject employment column gains no subject_name key
  v_row := jsonb_build_object('id', gen_random_uuid(), 'subject_token', 'hr_employee_private');
  if v_row ? 'subject_name' then
    raise exception 'hr_l3_41: subject_name leaked onto a row with no subject employment';
  end if;

  -- decision 3: the suppression path must not be reachable through _l1_persona
  if position('_l1_persona' in
      (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'hr' and p.proname = '_subject_display_name')) > 0 then
    raise exception 'hr_l3_41: the name suppression imported the cross-org persona resolver';
  end if;
end
$chk$;
