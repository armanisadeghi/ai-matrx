-- HR domain L5 — migration 22 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 A BANNER THAT PROMISED NOTHING WOULD BE CHECKED, ON AN ORG WHERE THREE JURISDICTIONS ARE.
--
-- `/hr/settings/leave-policies` rendered: *"This employer has no active establishments yet, so no
-- legal minimums are resolved and nothing on a policy will be checked against one."*
--
-- It is false, and it is the §2.6 failure mode inverted. `hr.leave_policy_list` derived
-- `operating_jurisdictions` from **establishments alone**, while `hr.validate_org_config` and
-- `hr.leave_policy_floors` both derive from **establishments UNION the position chain** — an
-- employment can sit in a state no establishment does. On the org this was found in, the list said
-- *nothing will be checked* and the validator checks `US`, `US-CA` and `US-CO`. An admin reading
-- that banner would configure a use-it-or-lose-it vacation policy believing no floor applied, and
-- meet California as a blocking dialog at save — *told one thing while the system does another*,
-- which §2.6 names as the worst of the three outcomes.
--
-- Two derivations of one fact, again. There is now one: `hr.leave_operating_jurisdictions(org)`,
-- and the three callers ask it.
--
-- Found by opening the page after the validator started firing — not by reading the door, which
-- looked right on its own.
--
-- Authority: SPEC-LEAVE §2.2, §2.5, §2.6. Applied live as
-- `hr_l5_22_one_operating_jurisdiction_derivation`. Idempotent.

create or replace function hr.leave_operating_jurisdictions(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  -- THE union the validator uses: where the employer is established, AND where its people
  -- actually work. Either one brings a legal floor with it.
  select coalesce(array_agg(distinct k order by k), '{}'::text[]) from (
    select j.key as k
      from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
     where e.organization_id = p_organization_id and e.deleted_at is null
    union
    select j.key
      from hr.employment em
      join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
           and pa.deleted_at is null and pa.effective_from <= current_date
           and (pa.effective_to is null or pa.effective_to > current_date)
      join hr.location loc on loc.id = pa.location_id
      join hr.jurisdiction j on j.id = loc.jurisdiction_id
     where em.organization_id = p_organization_id and em.status = 'active'
       and em.deleted_at is null) q;
$function$;

comment on function hr.leave_operating_jurisdictions(uuid) is
  'The jurisdictions a leave policy is checked against: establishments UNION the work locations of '
  'active employments. ONE derivation — the policy list previously used establishments alone and '
  'told admins nothing would be checked on orgs where three jurisdictions were.';

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_list';

  v_new := replace(v_def,
    E'  select coalesce(jsonb_agg(jsonb_build_object(''key'', j.key, ''name'', j.name) order by j.key), ''[]''::jsonb)\n    into v_juris\n    from (select distinct e.jurisdiction_id from hr.establishment e\n           where e.organization_id = p_organization_id and e.deleted_at is null) x\n    join hr.jurisdiction j on j.id = x.jurisdiction_id;',
    E'  -- hr_l5_22: the SAME union the validator and the floor cards use. Establishments alone\n'
 || E'  -- made this list promise that nothing would be checked on orgs where three jurisdictions\n'
 || E'  -- were, which is §2.6''s worst outcome — told one thing while the system does another.\n'
 || E'  select coalesce(jsonb_agg(jsonb_build_object(''key'', j.key, ''name'', j.name) order by j.key), ''[]''::jsonb)\n'
 || E'    into v_juris\n'
 || E'    from unnest(hr.leave_operating_jurisdictions(p_organization_id)) k\n'
 || E'    join hr.jurisdiction j on j.key = k;');
  if v_new = v_def then
    raise exception 'hr_l5_22: the policy list jurisdiction block did not match — re-derive it';
  end if;
  execute v_new;
end $$;

-- the floor-card reader stops carrying its own copy of the union
do $$
declare v_def text; v_new text; v_start int; v_end int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_floors';
  v_start := position('  -- §2.2: the operating jurisdictions are the org' in v_def);
  v_end   := position('       and em.deleted_at is null) q;' in v_def)
             + length('       and em.deleted_at is null) q;');
  if v_start = 0 or v_end <= v_start then
    raise exception 'hr_l5_22: the floors jurisdiction block did not match — re-derive it';
  end if;
  v_new := substring(v_def from 1 for v_start - 1)
    || E'  -- ONE derivation (hr_l5_22), shared with the policy list and the validator.\n'
    || E'  v_keys := hr.leave_operating_jurisdictions(p_organization_id);\n'
    || substring(v_def from v_end + 1);
  execute v_new;
end $$;

do $$
declare v_def text;
begin
  foreach v_def in array array['leave_policy_list','leave_policy_floors'] loop
    if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'hr' and p.proname = v_def) not like '%leave_operating_jurisdictions%' then
      raise exception 'hr_l5_22: hr.% still derives operating jurisdictions itself', v_def;
    end if;
  end loop;
  -- and neither may still join establishment directly for that purpose
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'leave_policy_list') like '%from hr.establishment%' then
    raise exception 'hr_l5_22: the policy list still walks hr.establishment itself';
  end if;
end $$;
