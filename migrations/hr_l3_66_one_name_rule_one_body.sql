-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE SEVENTH CALLER EXISTED ALREADY, AND IT WAS LEAKING THE SAME NAME THE SIXTH ONE DID.
--
-- Round 19 reported that "the one name rule" had become two verbatim bodies —
-- `hr._employee_display_name` and `hr._subject_display_name` as parallel copies. Measured live,
-- that pair is NOT duplicated: `_subject_display_name` is a null guard, one lookup and a delegate
-- call, and contains no arm logic at all (no `directory_opt_out` read, no self test, no capability
-- call). hr_l3_64 shipped the delegation it described.
--
-- But the finding was right about the CLASS and wrong only about which pair. A token census over
-- `hr` for the rule's own fingerprint — reads `directory_opt_out` AND checks `identity.write` AND
-- calls `hr._punch_capability` — returns TWO functions, and the second is `hr.employee_by_party`:
--
--   v_is_hr := hr._punch_capability(v_uid,'identity.write',…) or hr._punch_capability(…);
--   … if r.id is null or (coalesce(r.directory_opt_out,false) and not v_is_hr
--                         and r.login_user_id is distinct from v_uid) then
--
-- a second, hand-written copy of the same four arms. And because it was written by hand, it
-- carries the SAME defect hr_l3_64 just fixed one door over: `mgr.display_name as manager_name`,
-- joined raw off `hr.employee`, with **no opt-out check on the manager at all**. So an opted-out
-- manager's full name reached any peer through the CRM party lookup. The seventh caller was not a
-- hypothetical a future edit might create — it was already live, and already leaking.
--
-- That is the whole argument for the structural assertion round 19 asked for: a second body does
-- not drift eventually, it drifts on the day it is written.
--
-- Authority: coordinator ruling (round 19, one body + a structural delegation assertion);
-- SPEC-ACCESS §4.2; hr_l3_41/63/64's helper lineage.
--
-- Applied live as `hr_l3_66_one_name_rule_one_body`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE SUBJECT ARM BECOMES A NULL TEST, NOT A REWRITTEN PREDICATE. `hr.employee_by_party`
--    suppresses the row when `hr._employee_display_name(r.id, v_uid) is null`, which is the helper
--    ANSWERING rather than this door re-deciding. Exactly equivalent today —
--    `hr.employee.display_name` is NOT NULL, so the helper returns null on precisely the
--    opted-out-and-not-self-and-not-HR case the hand-written predicate tested — and it stays
--    equivalent when the arms change, which the hand-written copy would not have.
-- 2. `v_is_hr` AND `v_today` ARE DELETED, NOT LEFT DANGLING. Once the helper decides, this door
--    computes no HR-ness of its own, and both variables become unused. Leaving an assigned-unused
--    variable behind would put a fresh plpgsql_check finding into `audit.broken_functions`, which
--    `iam.canonical_certify` reads — a green certification is worth more than a small diff.
-- 3. 🚨 THE STRUCTURAL ASSERTION IS A FINGERPRINT COUNT, NOT A CALLER COUNT. A caller count is
--    brittle (it forbids a legitimate eighth door) and asserts nothing about correctness. What
--    must be true is that the ARMS exist once: exactly one function in `hr` may read
--    `directory_opt_out` AND check `identity.write` AND call `hr._punch_capability`. That forbids
--    the duplication itself rather than the symptom, and it is what would have caught
--    `employee_by_party` on the day it was written.
-- 4. THE SHELL IS ASSERTED BY WHAT IT DOES, NOT BY WHAT IT LACKS. `_subject_display_name` must
--    CALL `_employee_display_name` (positive) — the absence of arm tokens alone would also pass an
--    empty function that returns null and silently blanks six doors.
-- 5. THE CLAUSES MOVE INTO `hr.name_rule_violations()`. Check 27 was six inline clauses inside the
--    conformance body; every future edit meant regex surgery on a function definition. It now
--    reads from a named function, the way checks 26 and 28 already read from theirs.

begin;

-- ── 1. the seventh caller stops re-implementing the rule, and stops leaking ─────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.employee_by_party(uuid,uuid)'::regprocedure);
begin
  if position('_employee_display_name(mgr.id, v_uid)' in v_def) > 0 then
    return;                                    -- already migrated; replay is a no-op
  end if;

  -- each source string is asserted present before it is replaced: a silent no-op replace is how a
  -- migration reports success while changing nothing.
  if position('mgr.display_name as manager_name' in v_def) = 0
     or position('v_is_hr boolean;' in v_def) = 0
     or position('coalesce(r.directory_opt_out, false)' in v_def) = 0 then
    raise exception 'hr_l3_66: hr.employee_by_party does not have the expected shape — refusing to guess';
  end if;

  v_def := replace(v_def,
    'v_uid uuid := auth.uid(); v_today date := current_date;',
    'v_uid uuid := auth.uid();');
  v_def := replace(v_def,
    'v_shows_hire boolean; v_shows_mgr boolean; v_is_hr boolean;',
    'v_shows_hire boolean; v_shows_mgr boolean; v_name text;');
  v_def := replace(v_def,
    E'  v_is_hr := hr._punch_capability(v_uid, ''identity.write'',         null, v_today, p_organization_id)\n'
 || E'          or hr._punch_capability(v_uid, ''working_record.write'',   null, v_today, p_organization_id);\n\n',
    '');
  -- THE LEAK: the manager's name now answers to the same rule as everybody else's.
  v_def := replace(v_def,
    'mgr.display_name as manager_name',
    'hr._employee_display_name(mgr.id, v_uid) as manager_name');
  -- THE SECOND BODY: the helper decides, this door asks.
  v_def := replace(v_def,
    E'  if r.id is null\n'
 || E'     or (coalesce(r.directory_opt_out, false) and not v_is_hr and r.login_user_id is distinct from v_uid) then',
    E'  v_name := hr._employee_display_name(r.id, v_uid);\n'
 || E'  if r.id is null or v_name is null then');
  v_def := replace(v_def,
    E'''display_name'',        r.display_name,',
    E'''display_name'',        v_name,');

  execute v_def;
end
$mig$;

-- ── 2. the clauses, in a function instead of inline in the gate ─────────────────────────────
-- Every token is CONCATENATED. A literal 'directory_opt_out' here would make this function match
-- its own fingerprint test and report itself as a second body — the self-matching-assertion trap
-- this lane has now hit four times.
create or replace function hr.name_rule_violations()
returns table(door text, problem text)
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare
  t_optout text := 'directory_opt' || '_out';
  t_cap    text := 'identity' || '.write';
  t_capfn  text := '_punch' || '_capability';
  t_body   text := '_employee_display' || '_name';
  t_shell  text := '_subject_display' || '_name';
  t_rawmgr text := 'mgr.' || 'display_name';
begin
  return query
  -- the two directory-grade doors must not project a raw person name …
  select 'public.hr_directory_list'::text, 'projects the raw manager name'::text
   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'hr_directory_list'
                    and position(t_rawmgr in p.prosrc) > 0)
  union all
  select 'hr.employee_by_party', 'projects the raw manager name'
   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'employee_by_party'
                    and position(t_rawmgr in p.prosrc) > 0)
  -- … and each must reach the name through the one body.
  union all
  select 'public.hr_directory_list', 'does not call the one body'
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'hr_directory_list'
                        and position(t_body in p.prosrc) > 0)
  union all
  select 'hr.employee_by_party', 'does not call the one body'
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'hr' and p.proname = 'employee_by_party'
                        and position(t_body in p.prosrc) > 0)
  union all
  select 'public.hr_org_chart', 'does not call a suppression helper'
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'hr_org_chart'
                        and position(t_shell in p.prosrc) > 0)
  -- 🚨 THE ANTI-DUPLICATION CLAUSE. The arms may exist in exactly one function.
  union all
  select 'hr.' || p.proname, 'is a SECOND body of the name rule (the arms live in one function)'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and position(t_optout in p.prosrc) > 0
     and position(t_cap    in p.prosrc) > 0
     and position(t_capfn  in p.prosrc) > 0
     and p.proname <> '_employee_display_name'
  -- the shell is asserted by what it DOES …
  union all
  select 'hr._subject_display_name', 'does not delegate to the one body'
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'hr' and p.proname = '_subject_display_name'
                        and position(t_body in p.prosrc) > 0)
  -- … and must hold no arm logic of its own.
  union all
  select 'hr._subject_display_name', 'holds arm logic instead of delegating'
   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_subject_display_name'
                    and (position(t_optout in p.prosrc) > 0
                      or position(t_capfn  in p.prosrc) > 0));
end
$fn$;

revoke all on function hr.name_rule_violations() from public;
revoke all on function hr.name_rule_violations() from anon;

-- ── 3. check 27 now reads from it ───────────────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  -- remove-all-then-insert-one, bounded to block 27 (block 28 follows and must survive)
  v_def := regexp_replace(v_def, E'\\n  -{10,} 27\\. .*?(?=\\n  -{10,} 28\\.)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 27. one name rule, one body\n'
  || E'  check_key := ''directory_names_use_the_one_rule'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(''door'', d.door, ''problem'', d.problem)\n'
  || E'           order by d.door, d.problem), ''[]''::jsonb)\n'
  || E'    into v_bad from hr.name_rule_violations() d;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''why'', ''Two doors suppressed an opted-out person''''s own row and then printed that same ''\n'
  || E'      || ''person''''s full name one column over as manager_name -- a raw hr.employee.display_name ''\n'
  || E'      || ''read with no viewer in it. hr_directory_list did it (fixed hr_l3_64) and ''\n'
  || E'      || ''hr.employee_by_party did it too (fixed hr_l3_66), because it had been written with a ''\n'
  || E'      || ''SECOND hand-copied set of the arms. A second body does not drift eventually -- it ''\n'
  || E'      || ''drifts on the day it is written. So the load-bearing clause here is a FINGERPRINT ''\n'
  || E'      || ''COUNT, not a caller count: exactly one function in hr may read the opt-out flag AND ''\n'
  || E'      || ''check identity.write AND call hr._punch_capability. A caller count would forbid a ''\n'
  || E'      || ''legitimate eighth door while permitting the duplication that actually leaks. The ''\n'
  || E'      || ''shell is asserted by what it DOES (it must call the one body), because asserting only ''\n'
  || E'      || ''the absence of arm logic would also pass an empty function that blanks six doors.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\n  -{10,} 28\\.)', v_new, '');
  execute v_def;
end
$mig$;

-- ── 4. prove it in the same transaction that changed it ─────────────────────────────────────
do $chk$
declare v_n integer; v_27 boolean; v_28 boolean; v_bodies integer;
begin
  select count(*) into v_n    from hr.punch_write_path_conformance();
  select ok into v_27         from hr.punch_write_path_conformance()
   where check_key = 'directory_names_use_the_one_rule';
  select ok into v_28         from hr.punch_write_path_conformance()
   where check_key = 'every_pay_change_has_an_approver';

  select count(*) into v_bodies
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and position(('directory_opt' || '_out') in p.prosrc) > 0
     and position(('identity' || '.write')    in p.prosrc) > 0
     and position(('_punch' || '_capability') in p.prosrc) > 0;

  if v_n <> 28 then
    raise exception 'hr_l3_66: expected 28 checks, found %', v_n;
  end if;
  if v_27 is null or v_28 is null then
    raise exception 'hr_l3_66: check 27/28 missing after the rewrite (27=%, 28=%)', v_27, v_28;
  end if;
  if not v_27 then
    raise exception 'hr_l3_66: check 27 is failing after the fix';
  end if;
  if not v_28 then
    raise exception 'hr_l3_66: check 28 regressed — block 28 did not survive the block-27 rewrite';
  end if;
  if v_bodies <> 1 then
    raise exception 'hr_l3_66: the name rule has % bodies, expected exactly 1', v_bodies;
  end if;
end
$chk$;

commit;
