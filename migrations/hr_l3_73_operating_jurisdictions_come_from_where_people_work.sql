-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 `hr.validate_org_config` COULD NOT PRODUCE A VIOLATION IN ANY ORGANIZATION, EVER.
--
-- Measured: `hr.establishment` holds ZERO rows platform-wide against 8 live locations. The
-- validator derives the org's operating jurisdictions like this:
--
--     select array_agg(distinct j.key) into v_keys
--       from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
--      where e.organization_id = p_organization_id and e.deleted_at is null;
--     v_keys := coalesce(v_keys, '{}'::text[]);
--
-- so `v_keys` is `{}` in every org, the `foreach` body never runs, and the function returns "no
-- violations" for every configuration including an unlawful one. SPEC-LEAVE §2.6's rejection
-- dialog is unexercisable everywhere, and §2.6's whole point is that an unlawful PTO configuration
-- is refused before it can strand somebody's balance. A validator that always passes is worse than
-- no validator, because the form reports that it checked.
--
-- 🚨 AND THE FIX IS NOT TO BACKFILL ESTABLISHMENTS. SPEC-DATA-MODEL §6.2 makes `hr.establishment`
-- a **COMP of `hr_employer_profile`** carrying `eeo1_establishment_id` and `osha_establishment_name`
-- — an EEO-1/OSHA-300A REPORTING identity per worksite, which `hr.location` merely references. It
-- is not the register of where an employer operates, and it is legitimately empty until somebody
-- files those reports. Auto-creating one per location would fabricate regulatory identifiers that
-- nobody authored, on a table whose entire content is identifiers that must be authored. A live
-- writer already exists for the deliberate act (`public.hr_establishment_upsert`); nothing has
-- called it, which is a fact about EEO reporting, not a defect in leave validation.
--
-- The operating jurisdiction of an employer is where its PEOPLE WORK, and the validator already
-- knows it: two statements below this one it counts affected employees through
-- `hr.position_assignment` → `hr.location`. It was asking the wrong table for the list and the
-- right one for the count.
--
-- Authority: SPEC-LEAVE §2.6 (the rejection UX) and §2.x "full hr.validate_org_config across every
-- operating jurisdiction"; SPEC-DATA-MODEL §6.2 (establishment is an EEO/OSHA COMP of the employer
-- profile); AR2 LOCK 4 (a location is what stamps jurisdiction).
--
-- Applied live as `hr_l3_73_operating_jurisdictions_come_from_where_people_work`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE LIST IS A UNION, SO NOTHING REGRESSES. Establishments stay a source — an org that does
--    maintain them keeps every jurisdiction they contribute — and locations are added beside them.
--    A replacement would have been a smaller diff and a worse change: it would silently drop an
--    establishment-only jurisdiction from validation for the first org that files EEO-1.
-- 2. LOCATIONS ARE NOT FILTERED BY OCCUPANCY, ON PURPOSE. The tempting narrowing — only locations
--    with someone assigned on `p_as_of` — would stop validating a site the day before its first
--    hire, which is exactly when a policy is being configured. An employer that has opened a
--    California location is operating in California whether or not payroll has caught up.
-- 3. `coalesce(v_keys,'{}')` STAYS, AND THE EMPTY CASE IS STILL POSSIBLE. An org with no locations
--    and no establishments still validates nothing — correctly, because it operates nowhere yet.
--    The defect was never the empty guard; it was asking a table that is empty by design.
-- 4. AN EXPLICIT `p_jurisdiction_keys` STILL WINS. The caller-supplied list is untouched: the
--    client twin (§2.6) passes the form's own jurisdictions on blur, and this only changes what
--    happens when it passes nothing.

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.validate_org_config(uuid,text,jsonb,text[],date)'::regprocedure);
  v_from text :=
    E'    select array_agg(distinct j.key) into v_keys\n'
 || E'      from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id\n'
 || E'     where e.organization_id = p_organization_id and e.deleted_at is null;';
  v_to text :=
    E'    -- hr_l3_73: where the employer OPERATES -- its locations -- unioned with the EEO/OSHA\n'
 || E'    -- establishments (SPEC-DATA-MODEL 6.2), which are a reporting overlay and are empty by\n'
 || E'    -- design until somebody files. Establishment-only was {} in every org, so this function\n'
 || E'    -- could never produce a violation and SPEC-LEAVE 2.6 was unexercisable everywhere.\n'
 || E'    select array_agg(distinct k) into v_keys from (\n'
 || E'      select j.key as k\n'
 || E'        from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id\n'
 || E'       where e.organization_id = p_organization_id and e.deleted_at is null\n'
 || E'      union\n'
 || E'      select j.key\n'
 || E'        from hr.location l join hr.jurisdiction j on j.id = l.jurisdiction_id\n'
 || E'       where l.organization_id = p_organization_id and l.deleted_at is null\n'
 || E'    ) s;';
begin
  if position('hr_l3_73' in v_def) > 0 then
    return;                                    -- already migrated; replay is a no-op
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_73: validate_org_config''s jurisdiction-list block is not in the expected shape';
  end if;
  execute replace(v_def, v_from, v_to);
end
$mig$;

do $chk$
declare v_src text; v_n integer;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='hr' and p.proname='validate_org_config';
  if position('hr.location l join hr.jurisdiction' in v_src) = 0 then
    raise exception 'hr_l3_73: the location source did not land';
  end if;
  if position('hr.establishment e join hr.jurisdiction' in v_src) = 0 then
    raise exception 'hr_l3_73: the establishment source was dropped — decision 1 says union, not replace';
  end if;
  -- the validator must now see a non-empty list for an org that has locations
  select count(*) into v_n from hr.location where deleted_at is null and jurisdiction_id is not null;
  if v_n = 0 then
    raise exception 'hr_l3_73: no live location carries a jurisdiction — the fix would be inert';
  end if;
end
$chk$;

commit;
