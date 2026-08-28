-- HR domain L1 — migration 24 (register item HRB-013, lane l1-employees).
--
-- The CRM party card's missing identifier: `employee_number`.
--
-- Applied live as `hr_l1_24_party_card_employee_number`. Idempotent.
-- Authority: SPEC-EMPLOYEES §4.5 (doors out of HR), SPEC-UI-IA §6.
--
-- ===================================================================================
-- `hr.employee_by_party` returns the name, status, title, department, manager and hire
-- date — everything the party card draws except the one field a person actually reads
-- back to somebody on the phone. Round 22 asks the card to show the employee number,
-- and the honest way to get it is for the door to send it, not for the client to go
-- and look it up: this door exists precisely so a CRM surface never queries HR itself.
--
-- 🚨 IT IS DIRECTORY TIER, WHICH IS WHY IT MAY GO HERE AT ALL. `employee_number` is
-- already on `hr_directory_list`'s rows and on the profile header for every viewer who
-- can see the person; it is an internal reference, not a confidential fact. The door's
-- decision 4 — "directory tier only, nothing confidential may reach a CRM surface" —
-- is respected rather than widened.
--
-- 🚨 AND IT IS ADDED TO **BOTH** RETURN BRANCHES. The not-an-employee branch returns a
-- fully-shaped envelope with every key present and null, which is what lets the client
-- read `row.employee_id` without guarding each field. Adding a key to one branch only
-- would make the two shapes differ exactly when a caller is least likely to notice.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.employee_by_party(uuid,uuid)'::regprocedure);

  if position('employee_number' in v_def) > 0 then
    raise notice 'hr_l1_24: already applied';
    return;
  end if;

  -- 1. select it
  v_new := replace(v_def,
    'select e.id, e.display_name, e.directory_status,',
    'select e.id, e.employee_number, e.display_name, e.directory_status,');

  -- 2. the not-an-employee branch keeps every key present
  v_new := replace(v_new,
    '      ''employee_id'', null, ''display_name'', null, ''directory_status'', null,',
    '      ''employee_id'', null, ''employee_number'', null, ''display_name'', null,' || chr(10) ||
    '      ''directory_status'', null,');

  -- 3. the granted branch
  v_new := replace(v_new,
    '    ''employee_id'',         r.id,',
    '    ''employee_id'',         r.id,' || chr(10) ||
    '    -- directory tier: the same identifier the directory card and the profile' || chr(10) ||
    '    -- header already show to anyone who can see this person at all.' || chr(10) ||
    '    ''employee_number'',      r.employee_number,');

  if v_new = v_def then
    raise exception 'hr_l1_24: no replacement landed';
  end if;
  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text; v_hits int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'employee_by_party';

  select count(*) into v_hits from regexp_matches(v_src, 'employee_number', 'g');
  -- the select list, the null branch, and the granted branch
  if v_hits < 3 then
    raise exception 'hr_l1_24: employee_number appears % time(s), expected at least 3', v_hits;
  end if;

  -- decision 4 must survive: nothing confidential may reach a CRM surface
  if v_src ~ 'ssn|date_of_birth|home_address|personal_email|compensation' then
    raise exception 'hr_l1_24: a confidential field reached the CRM door';
  end if;

  -- the standing test and the opt-out posture stay exactly as they were
  if v_src !~ 'no_standing' or v_src !~ '_employee_display_name' then
    raise exception 'hr_l1_24: the standing test or the opt-out suppression has gone missing';
  end if;
end $$;
