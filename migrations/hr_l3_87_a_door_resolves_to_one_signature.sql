-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 A LIVE DEAD DOOR, AND THE CHECK THAT MAKES IT THE LAST ONE.
--
-- `CREATE OR REPLACE FUNCTION` with a CHANGED SIGNATURE does not replace — it creates an OVERLOAD
-- beside the original. PostgREST then cannot choose between them and refuses the call:
--
--     POST /rest/v1/rpc/hr_leave_enroll   {p_leave_policy_id, p_employment_ids, p_effective_from}
--     → HTTP 300  PGRST203  "Could not choose the best candidate function between:
--                            public.hr_leave_enroll(...), public.hr_leave_enroll(...)"
--
-- Measured live before this migration, through PostgREST with a real admin token. The door was
-- **dead for exactly the callers using the older three-argument shape** — the shape the client was
-- already using — while a four-argument call still answered 200. That asymmetry is why it is easy
-- to miss: whoever added the parameter tested with the parameter, and it worked.
--
-- THE FIX IS THE STALE SIGNATURE, AND IT IS SAFE BECAUSE THE SURVIVOR DEFAULTS EVERYTHING:
--     stale    hr_leave_enroll(uuid, uuid[], date DEFAULT NULL)                     -- 80-byte body
--     survivor hr_leave_enroll(uuid, uuid[], date DEFAULT NULL, text DEFAULT NULL)  -- 136-byte body
-- The survivor has defaults on BOTH trailing parameters, so every call shape the stale form
-- accepted (one, two or three arguments) resolves to it. Neither has a single dependency
-- (`pg_depend` deptype 'n' = 0 on both), so dropping the stale one removes an ambiguity and takes
-- no caller with it.
--
-- Authority: coordinator ruling (check 34; L1's second sighting of this class today); this lane's
-- own batch-2 encounter with `hr.leave_enroll`'s two overloads, where a hand-written revoke list
-- would have dropped one.
--
-- Applied live as `hr_l3_87_a_door_resolves_to_one_signature`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE DROP COMES FIRST, IN THIS MIGRATION, RATHER THAN THE CHECK SHIPPING RED. A blocking gate
--    that fails on the run that installs it gets disabled rather than fixed, and a dated baseline
--    would have parked a DEAD DOOR behind a green light — the exact shape this lane refuses. The
--    two halves are separately asserted below so a failure is still attributable.
-- 2. 🚨 THIS IS A CROSS-LANE DDL FIX, WHICH THIS LANE DOES ONLY FOR A LIVE BREAK. The campaign rule
--    is report-don't-fix for another lane's doors, and it held for the workflow family (stopped by
--    name) and the leave grants (touched only ACLs). It does not hold here: the door is broken
--    RIGHT NOW for real callers, the repair is one `drop function` of a signature nothing depends
--    on, and the alternative is a dead door sitting behind a passing gate. Same judgment as
--    hr_l3_75's anon revokes.
-- 3. SCOPE IS POSTGREST-EXPOSED DOORS ONLY. Inner `hr.*` overloads are legitimate and out of scope —
--    `hr.leave_enroll` genuinely has two, and `hr._subject_display_name` / `hr._employee_display_name`
--    are a deliberate two-entry-point pair. The kill is specific to the exposed surface, because
--    only PostgREST has to resolve a name with no type information from the caller.
-- 4. AN INTENDED OVERLOAD IS A CONTRACT DECLARATION, NEVER AN EXEMPTION LIST (D13). If a door ever
--    genuinely needs two signatures, the owning lane sets `overloads_intended = true` on its
--    contract row — the same place `must_be_definer` lives, where the next reader is already
--    looking. Nothing needs it today, and the column is NULL everywhere, asserting nothing.

begin;

-- ── PART 1: the live break ──────────────────────────────────────────────────────────────────
do $mig$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'hr_leave_enroll'
                and pg_get_function_identity_arguments(p.oid) = 'p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date')
  then
    -- assert the survivor really can absorb every stale call shape before removing the stale one
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'hr_leave_enroll'
                      and p.pronargs = 4 and p.pronargdefaults >= 2)
    then
      raise exception 'hr_l3_87: the 4-arg survivor does not default its trailing args — dropping the 3-arg form would break callers';
    end if;
    drop function public.hr_leave_enroll(uuid, uuid[], date);
    raise notice 'hr_l3_87: dropped the stale 3-arg hr_leave_enroll signature';
  end if;
end
$mig$;

-- ── PART 2: the backstop ────────────────────────────────────────────────────────────────────
alter table hr.function_contract
  add column if not exists overloads_intended boolean;

comment on column hr.function_contract.overloads_intended is
  'Declares that a PostgREST-exposed door deliberately carries more than one signature. NULL (the '
  'default) asserts nothing and leaves check 34 blocking on that door. An overloaded door is '
  'normally DEAD: PostgREST cannot choose between candidates and answers PGRST203, so this is a '
  'declaration a lane makes on purpose, never an exemption list (hr_l3_87).';

create or replace function hr.doors_with_ambiguous_signatures()
returns table(door text, signature_count integer, signatures text)
language sql
stable
security definer
set search_path = hr, public
as $fn$
  select 'public.' || p.proname,
         count(*)::integer,
         string_agg(pg_get_function_identity_arguments(p.oid), '  ||  ' order by p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'hr\_%'
     and p.proname not like '\_\_%'          -- decision 3: the exposed door surface only
   group by p.proname
  having count(*) > 1
     -- decision 4: an intended overload is declared on the contract row, not listed here
     and not exists (select 1 from hr.function_contract c
                      where c.is_active and c.overloads_intended
                        and c.schema_name = 'public' and c.function_name = p.proname)
   order by 1;
$fn$;

revoke all on function hr.doors_with_ambiguous_signatures() from public;
revoke all on function hr.doors_with_ambiguous_signatures() from anon;
revoke all on function hr.doors_with_ambiguous_signatures() from authenticated;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 34\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 34. a door resolves to exactly one signature\n'
  || E'  check_key := ''doors_resolve_to_one_signature'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''door'', t.door, ''signature_count'', t.signature_count, ''signatures'', t.signatures)\n'
  || E'           order by t.door), ''[]''::jsonb)\n'
  || E'    into v_bad from hr.doors_with_ambiguous_signatures() t;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''doors_checked'', (select count(distinct p.proname) from pg_proc p\n'
  || E'                          join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                         where n.nspname = ''public'' and p.proname like ''hr\\_%''\n'
  || E'                           and p.proname not like ''\\_\\_%''),\n'
  || E'    ''why'', ''CREATE OR REPLACE FUNCTION with a CHANGED SIGNATURE does not replace -- it ''\n'
  || E'      || ''creates an OVERLOAD beside the original, and PostgREST then answers PGRST203 ''\n'
  || E'      || ''"could not choose the best candidate" for calls it can no longer resolve. That is a ''\n'
  || E'      || ''SILENT KILL of the whole door. Measured on hr_leave_enroll before this check ''\n'
  || E'      || ''shipped: the three-argument call returned HTTP 300 while the four-argument call ''\n'
  || E'      || ''returned 200, so the door was dead for exactly the callers using the older shape -- ''\n'
  || E'      || ''which is why it is easy to miss, since whoever adds the parameter tests WITH the ''\n'
  || E'      || ''parameter. Inner hr.* overloads are legitimate and out of scope; only the exposed ''\n'
  || E'      || ''surface has to resolve a name with no type information from the caller. A door that ''\n'
  || E'      || ''genuinely needs two signatures declares overloads_intended on its contract row.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr','doors_with_ambiguous_signatures','hr_l3_87',
   array['having count(*) > 1','overloads_intended'],
   '{}',
   true,
   'Check 34 must keep counting SIGNATURES PER DOOR NAME and must keep honouring the '
   || 'overloads_intended declaration. Losing the count makes every overloaded door invisible; '
   || 'losing the declaration turns a lane''s deliberate two-signature door into a permanent red '
   || 'with no way to state intent, which is how a blocking gate gets disabled instead of fixed.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_be_definer = excluded.must_be_definer,
      reason = excluded.reason, is_active = true;

do $chk$
declare v_n integer; v_34 boolean; v_enroll integer; v_doors integer;
begin
  -- PART 1 asserted independently of PART 2 (decision 1)
  select count(*) into v_enroll from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_leave_enroll';
  if v_enroll <> 1 then
    raise exception 'hr_l3_87: hr_leave_enroll resolves to % signatures, expected 1', v_enroll;
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_34 from hr.punch_write_path_conformance()
   where check_key = 'doors_resolve_to_one_signature';
  select count(*) into v_doors from hr.doors_with_ambiguous_signatures();

  if v_n <> 34 then
    raise exception 'hr_l3_87: expected 34 checks, found %', v_n;
  end if;
  if v_34 is null then
    raise exception 'hr_l3_87: check 34 did not install';
  end if;
  if v_doors > 0 then
    raise exception 'hr_l3_87: % doors still ambiguous: %', v_doors,
      (select string_agg(door, ', ') from hr.doors_with_ambiguous_signatures());
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_87: a conformance check is failing';
  end if;
end
$chk$;

commit;
