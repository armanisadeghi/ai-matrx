-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- L5-A8: SPEC-CONTRACTS E-05/E-06 freeze two operations whose `subject.type` is
-- `hr_leave_enrollment`, and `hr.resolve_rules` refuses it with `subject_carries_no_jurisdiction`.
-- Both sides were right, which is why it deadlocked: `hr.leave_enrollment` genuinely carries no
-- stamp, and the helper genuinely must not invent one.
--
-- SPEC-DATA-MODEL §9.2 breaks the tie: `hr_leave_enrollment` is a **COMP of
-- `hr_employment:employment_id`** — it is a component of an employment, not a record with a life
-- of its own. So the employment's jurisdiction IS the enrollment's jurisdiction, derived rather
-- than invented. No subject-kind table in any spec says otherwise (checked before building).
--
-- 🚨 THE EMPLOYMENT DOES NOT CARRY IT EITHER, so the chain is longer than "join the employment".
-- Measured: `hr.employment` has neither `jurisdiction_key` nor `jurisdiction_id` nor `location_id`.
-- The jurisdiction lives where the person actually works — `hr.position_assignment.location_id` →
-- `hr.location.jurisdiction_id` — and the position assignment is EFFECTIVE-DATED. That is why this
-- derivation needs the evaluation date and why the helper gains one: picking the assignment that
-- was in force on the work date is the whole difference between deriving and guessing.
--
-- Authority: SPEC-CONTRACTS E-05/E-06 (frozen); SPEC-DATA-MODEL §9.2 (COMP of employment);
-- SPEC-JURISDICTION §2.0/§2.2/§7.5 and AR 1.4 (as_of is the WORK date, never now()).
--
-- Applied live as `hr_l3_71_leave_enrollment_derives_its_jurisdiction`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 THE 2-ARG FORM SURVIVES, AND MEASUREMENT IS WHY. The plan was to drop it and repoint its
--    "one" caller. The migration's own assertion refused: there are THREE —
--    `hr.resolve_rules`, `hr.leave_ledger_post` and `hr._leave_jurisdiction_key_or_federal`, the
--    last two the Leave lane's and actively being edited. Dropping it would have broken a lane
--    mid-flight for no gain. So the 2-arg form stays and becomes a DELEGATE: it calls the 3-arg
--    with a null date, which is stamped-only mode. One body, two entry points — the
--    `_punch_open_chain` / `_punch_open_chain_as_of` pattern this lane already uses — and every
--    existing caller keeps its exact behaviour, including the raise its callers catch.
--    No ambiguity is created: the two forms differ in arity and neither takes a default, so a
--    2-arg call can only match the 2-arg form.
-- 1b. A NULL DATE DISABLES DERIVATION RATHER THAN DEFAULTING IT. You cannot pick the assignment in
--    force on a date you were not given, and `current_date` here would be exactly the now()-for-
--    as_of substitution AR 1.4 forbids. So a null date resolves stamps and refuses to derive,
--    saying so — never silently answering from today.
-- 1c. 🚨 THE DERIVATION ALREADY EXISTED ONCE, IN ANOTHER LANE'S FUNCTION.
--    `hr._leave_jurisdiction_key_or_federal` walks position_assignment → location → jurisdiction
--    itself, inside a `when others then null` handler, because the helper raised on
--    `hr_employment`. That is a second body of this rule — the class hr_l3_66 just closed for
--    display names. It is NOT rewritten here (their lane, their in-flight edits) but it is
--    reported, and the helper now offers the same answer so the copy can be deleted rather than
--    maintained.
-- 2. THE STAMPED COLUMN STILL WINS, AND IS STILL CHECKED FIRST. Derivation is a fallback for
--    subjects that provably cannot carry a stamp — never a second opinion about one that can. A
--    record with `jurisdiction_key` resolves exactly as before; this migration cannot change any
--    existing answer, only supply one where the helper previously raised.
-- 3. 🚨 DERIVED SUBJECTS ARE ENUMERATED, NEVER INFERRED. The branch fires only for subject types
--    named in `v_derives_through_employment`. The tempting generalisation — "any table with an
--    `employment_id` derives through it" — would silently switch a dozen tokens from an honest
--    refusal to a derived answer, including ones whose lane may WANT the refusal, and would do it
--    without anyone deciding. Adding the next token is one array entry and a deliberate act.
-- 4. THE REFUSAL STILL NAMES WHAT WAS MISSING, AT EACH LINK. An enrollment with no employment, an
--    employment with no assignment in force on the date, an assignment whose location carries no
--    jurisdiction — three different failures, three different messages. "Could not resolve" would
--    send the reader to re-derive the chain by hand, which is the denial-shaped defect this lane
--    keeps finding.
-- 5. `hr_employment` HAS THE IDENTICAL GAP AND IS DELIBERATELY NOT FIXED HERE. It carries no
--    jurisdiction column either, so it refuses the same way. It is not in E-05/E-06's scope and
--    switching it is a decision for whoever owns employment-level rule resolution — reported, not
--    smuggled in.

begin;

-- ── the helper gains the evaluation date and one enumerated derivation ──────────────────────
do $mig$
declare v_callers text;
begin
  select coalesce(string_agg(n.nspname||'.'||p.proname, ', ' order by p.proname), '')
    into v_callers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ ('_subject_jurisdiction' || '_key')
     and p.proname <> '_subject_jurisdiction_key';
  raise notice 'hr_l3_71: 2-arg callers preserved by delegation: [%]', v_callers;
end
$mig$;

create or replace function hr._subject_jurisdiction_key(p_subject_type text, p_subject_id uuid,
                                                        p_as_of date)
returns text
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare
  v_schema text; v_table text; v_key text; v_has_key boolean; v_has_id boolean;
  v_employment uuid; v_pa uuid; v_loc uuid;
  -- SPEC-DATA-MODEL COMP-of-employment subjects that resolve through the employment.
  -- ENUMERATED ON PURPOSE (decision 3). Adding one is a deliberate act, not an inference.
  v_derives_through_employment text[] := array['hr_leave_enrollment'];
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_subject_type;
  if v_schema is null then
    raise exception 'unknown_subject_type: % is not a registered entity token', p_subject_type
      using errcode = 'P0001';
  end if;

  select exists (select 1 from information_schema.columns c
                  where c.table_schema = v_schema and c.table_name = v_table
                    and c.column_name = 'jurisdiction_key'),
         exists (select 1 from information_schema.columns c
                  where c.table_schema = v_schema and c.table_name = v_table
                    and c.column_name = 'jurisdiction_id')
    into v_has_key, v_has_id;

  -- ---- 1. THE STAMP ALWAYS WINS (decision 2)
  if v_has_key then
    execute format('select t.jurisdiction_key from %I.%I t where t.id = $1', v_schema, v_table)
      into v_key using p_subject_id;
  elsif v_has_id then
    execute format(
      'select j.key from %I.%I t join hr.jurisdiction j on j.id = t.jurisdiction_id where t.id = $1',
      v_schema, v_table) into v_key using p_subject_id;

  -- ---- 2. DERIVED: a component of an employment inherits the employment's place of work
  elsif p_subject_type = any(v_derives_through_employment) then
    -- decision 1b: no date, no derivation. current_date here would be the now()-for-as_of
    -- substitution AR 1.4 forbids, so this refuses instead of answering from today.
    if p_as_of is null then
      raise exception 'as_of_required: % derives its jurisdiction and cannot do so without the evaluation date',
        p_subject_type using errcode = '22004',
        hint = 'SPEC-JURISDICTION 2.2 / 7.5: p_as_of is the WORK or EVENT date. Never now(). Call the 3-argument form.';
    end if;
    execute format('select t.employment_id from %I.%I t where t.id = $1', v_schema, v_table)
      into v_employment using p_subject_id;
    if v_employment is null then
      raise exception 'subject_not_found_or_unstamped: % % has no employment to derive from',
        p_subject_type, p_subject_id using errcode = 'P0001';
    end if;

    -- the assignment IN FORCE on the evaluation date — never the newest, never today's
    select pa.id, pa.location_id into v_pa, v_loc
      from hr.position_assignment pa
     where pa.employment_id = v_employment
       and pa.deleted_at is null
       and pa.effective_from <= p_as_of
       and (pa.effective_to is null or pa.effective_to >= p_as_of)
     order by pa.effective_from desc
     limit 1;

    if v_pa is null then
      raise exception 'subject_not_found_or_unstamped: employment % held no position assignment on %',
        v_employment, p_as_of using errcode = 'P0001',
        hint = 'The jurisdiction of a leave enrollment is derived from where the person worked on the evaluation date (SPEC-DATA-MODEL 9.2 COMP-of-employment). No assignment in force means no place of work to derive from.';
    end if;
    if v_loc is null then
      raise exception 'subject_not_found_or_unstamped: position assignment % carries no location on %',
        v_pa, p_as_of using errcode = 'P0001',
        hint = 'AR2 LOCK 4: a location is what stamps jurisdiction. An assignment without one cannot derive it.';
    end if;

    select j.key into v_key
      from hr.location l join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.id = v_loc;

    if v_key is null then
      raise exception 'subject_not_found_or_unstamped: location % carries no jurisdiction', v_loc
        using errcode = 'P0001';
    end if;
    return v_key;

  -- ---- 3. otherwise refuse, exactly as before
  else
    raise exception 'subject_carries_no_jurisdiction: %.% has neither jurisdiction_key nor jurisdiction_id',
      v_schema, v_table using errcode = 'P0001',
      hint = 'SPEC-JURISDICTION 2.0 / AR 1.4: jurisdiction is STAMPED on the record. A subject that does not carry it cannot be resolved for, unless it is a COMP of employment listed in hr._subject_jurisdiction_key''s derivation set.';
  end if;

  if v_key is null then
    raise exception 'subject_not_found_or_unstamped: % %', p_subject_type, p_subject_id
      using errcode = 'P0001';
  end if;
  return v_key;
end
$fn$;

revoke all on function hr._subject_jurisdiction_key(text, uuid, date) from public;
revoke all on function hr._subject_jurisdiction_key(text, uuid, date) from anon;

-- the pre-existing 2-argument entry point, preserved verbatim in BEHAVIOUR by delegating
-- (decision 1). Its three live callers keep the raise they already catch.
create or replace function hr._subject_jurisdiction_key(p_subject_type text, p_subject_id uuid)
returns text
language sql
stable
security definer
set search_path = hr, public
as $fn$ select hr._subject_jurisdiction_key(p_subject_type, p_subject_id, null::date) $fn$;

revoke all on function hr._subject_jurisdiction_key(text, uuid) from public;
revoke all on function hr._subject_jurisdiction_key(text, uuid) from anon;

-- ── its one caller passes the evaluation date it already validated ──────────────────────────
do $mig$
declare v_def text := pg_get_functiondef('hr.resolve_rules(text,uuid,date,text[],jsonb,uuid,text)'::regprocedure);
begin
  if position('hr._subject_jurisdiction_key(p_subject_type, p_subject_id, p_as_of)' in v_def) > 0 then
    return;
  end if;
  if position('hr._subject_jurisdiction_key(p_subject_type, p_subject_id)' in v_def) = 0 then
    raise exception 'hr_l3_71: resolve_rules does not call the helper in the expected shape';
  end if;
  execute replace(v_def,
    'hr._subject_jurisdiction_key(p_subject_type, p_subject_id)',
    'hr._subject_jurisdiction_key(p_subject_type, p_subject_id, p_as_of)');
end
$mig$;

-- ── prove it in the same transaction ────────────────────────────────────────────────────────
do $chk$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='hr' and p.proname='_subject_jurisdiction_key';
  if v_n <> 2 then
    raise exception 'hr_l3_71: expected exactly 2 entry points (2-arg delegate + 3-arg body), found %', v_n;
  end if;
  -- the 2-arg form must hold NO logic of its own: one body, two doors
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='hr' and p.proname='_subject_jurisdiction_key'
                    and pg_get_function_identity_arguments(p.oid) = 'p_subject_type text, p_subject_id uuid'
                    and p.prosrc ~ 'null::date') then
    raise exception 'hr_l3_71: the 2-arg form is not a pure delegate';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='hr' and p.proname='resolve_rules'
                    and p.prosrc ~ ('_subject_jurisdiction' || '_key\(p_subject_type, p_subject_id, p_as_of\)')) then
    raise exception 'hr_l3_71: resolve_rules does not pass the evaluation date';
  end if;
end
$chk$;

commit;
