-- hr_l1_53_consent_governs_generation.sql
--
-- 🚨 THE CONSTRAINT GOVERNED THE WRONG MOMENT.
-- `hr.verification_letter_request` carried
--     CHECK ((NOT includes_compensation) OR (employee_consent_at IS NOT NULL))
-- so a compensation letter request could not EXIST until consent was already recorded —
-- and the request row is the very thing that ASKS for consent.
--
-- The insert sets `employee_consent_at = case when v_incl and v_self then now() end`, so a
-- SELF request satisfied it trivially while every THIRD-PARTY compensation request violated
-- it. The `awaiting_consent` state was unreachable for exactly the population it exists for:
-- the door builds the row, the CHECK refuses it, and the employee is never asked. A rule
-- about what may be EMITTED was being enforced against what may be STORED.
--
-- The rule itself is right and is kept verbatim in meaning: no letter states compensation
-- without the employee's consent. It moves to `public.hr_verification_generate_apply`, the
-- moment a letter is actually produced, and refuses BY NAME (`consent_required`, field
-- `employee_consent_at`) with a sentence saying what would unblock it — a refusal envelope,
-- not an exception, per the refusal-envelope law.
--
-- Applied live 2026-08-28 and ledgered. Falsified in BOTH directions on the fixture employer:
--   raise third-party + income     -> ok, state `awaiting_consent`, includes_compensation true
--                                     (this row could not previously be created at all)
--   generate, consent NULL         -> {ok:false, reason:"consent_required",
--                                      field:"employee_consent_at", detail:"…"}
--   subject grants consent         -> ok, state `received`
--   generate again                 -> ok, state `generated`, snapshot_frozen true
-- The probe row was removed afterwards; 0 remain.
--
-- The consent sentence already on the request dialog stays exactly as it is — it was always
-- correct; it was describing a state the database refused to let exist.

alter table hr.verification_letter_request
  drop constraint if exists verification_letter_consent_for_comp;

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_verification_generate_apply(uuid,uuid,jsonb,timestamptz)'::regprocedure);
  if position('NO LETTER EMITS COMPENSATION WITHOUT CONSENT' in v_def) > 0 then
    raise notice 'hr_l1_53: already applied'; return;
  end if;

  v_new := replace(v_def, E'begin\n',
E'begin\n'
||E'  -- 🚨 NO LETTER EMITS COMPENSATION WITHOUT CONSENT.\n'
||E'  -- This was a CHECK on the request row, which stopped the row EXISTING and so stopped\n'
||E'  -- the employee ever being asked. The rule belongs here, at the moment a letter is\n'
||E'  -- actually produced: refuse BY NAME, and say what would unblock it.\n'
||E'  if exists (select 1 from hr.verification_letter_request r\n'
||E'              where r.id = p_letter_id and r.includes_compensation\n'
||E'                and r.employee_consent_at is null) then\n'
||E'    return jsonb_build_object(''ok'', false, ''reason'', ''consent_required'',\n'
||E'      ''field'', ''employee_consent_at'',\n'
||E'      ''detail'', ''This letter states compensation, and the employee has not consented ''\n'
||E'              || ''to that yet. Record their consent and generate it again.'');\n'
||E'  end if;\n');
  if v_new = v_def then raise exception 'hr_l1_53: begin anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  if exists (select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid
              join pg_namespace n on n.oid=t.relnamespace
             where n.nspname='hr' and t.relname='verification_letter_request'
               and c.conname='verification_letter_consent_for_comp') then
    raise exception 'hr_l1_53: the row constraint is still there';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_verification_generate_apply';
  if v_src !~ 'NO LETTER EMITS COMPENSATION WITHOUT CONSENT' then
    raise exception 'hr_l1_53: the generation guard is missing';
  end if;
end $verify$;

-- The rule now lives in a function body, so it needs a contract row to survive the next
-- `create or replace` by any lane.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_verification_generate_apply', 'hr_l1_53_consent_governs_generation.sql',
        array['NO LETTER EMITS COMPENSATION WITHOUT CONSENT', 'consent_required',
              'employee_consent_at is null'],
        array[]::text[],
        'The no-compensation-without-consent rule lives HERE, at generation. It was a CHECK on '
        || 'hr.verification_letter_request, which stopped the row existing and therefore stopped '
        || 'the employee ever being asked — awaiting_consent was unreachable for every '
        || 'third-party request. Removing this guard re-opens emitting pay with no consent.')
on conflict do nothing;
