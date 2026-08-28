-- hr_l3_96 — the punch register carries `subject_name`, through the one display-name rule.
--
-- PURPOSE
--   Route 30's new scope picker can say "Showing the punches of ..." and had nothing to put there:
--   `hr.punch_register` returns `employment_id` and no name, so the surface rendered "one person".
--   That is the same defect hr_l3_88 closed on `hr.pay_period_get` — *"the panel reports on PEOPLE;
--   a uuid prefix is not a person"* — one door further along. A manager who scoped the evidence lane
--   to somebody should see who, without opening a second surface to find out.
--
--   The register ALREADY calls the rule for the ACTOR (`actor_name`), so the row could tell you who
--   recorded a punch but not whose punch it was. When an employee clocks themselves in those are the
--   same person and the gap is invisible; on a manager entry — which is exactly the row a correction
--   produces — they differ, and the only name on screen was the manager's.
--
-- AUTHORITY
--   hr_l3_88's ruling, extended to this door by the round-39 brief. One rule, one body: the name
--   comes from `hr._subject_display_name(employment_id, auth.uid())` and NOT from a join, so the
--   suppression opt-out that rule owns is honoured here automatically — this is its eighth caller.
--
-- Applied live as `hr_l3_96_the_register_names_the_person`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · THE VIEWER IS PASSED, NOT ASSUMED. `hr._subject_display_name` takes the viewer so it can apply
--     that person's suppression rules; passing `auth.uid()` is what makes a name a *permitted* name.
--     A join on hr.employee would return a display_name to everyone who can see the punch, which is
--     the raw-name leak hr_l3_66 removed from two other bodies.
--   · `jsonb_strip_nulls` WRAPS THIS OBJECT, so a suppressed or unresolvable name drops the key
--     entirely rather than shipping `null`. The client already treats an absent name as "no name"
--     and renders the id as a bare reference, which is the hr_l3_88 behaviour.
--   · SURGICAL `replace()` WITH A `position()` GUARD, not a body re-emit — a shared read door under
--     concurrent edit, same reasoning as hr_l3_94/95.

do $mig$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_register';
  if v_src is null then
    raise exception 'hr_l3_96: hr.punch_register(jsonb,jsonb) not found';
  end if;
  v_new := v_src;

  if position('''subject_name''' in v_new) = 0 then
    v_new := replace(v_new,
      $q$               'employment_id', f.employment_id,$q$,
      $q$               'employment_id', f.employment_id,
               -- hr_l3_96: the person this punch is ABOUT, through the one suppression-aware rule
               -- (hr_l3_88's ruling; eighth caller). Never a join -- a join returns a name the
               -- viewer may not be permitted to read.
               'subject_name', hr._subject_display_name(f.employment_id, v_uid),$q$);
  end if;

  execute v_new;
end
$mig$;

-- ── STRUCTURAL SELF-CHECK ────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_register';
  if position('''subject_name''' in v_src) = 0 then
    raise exception 'hr_l3_96: subject_name did not land on hr.punch_register';
  end if;
  -- It must come from the RULE, not a join: a join is how the raw-name leak comes back.
  if position('''subject_name'', hr._subject_display_name(' in v_src) = 0 then
    raise exception 'hr_l3_96: subject_name is not sourced from hr._subject_display_name';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'punch_register') <> 1 then
    raise exception 'hr_l3_96: hr.punch_register no longer resolves to one signature';
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'punch_register', 'hr_l3_96_the_register_names_the_person',
   array['''subject_name'', hr._subject_display_name('],
   array[]::text[],
   'The register reports on PEOPLE, and returned only employment_id — so route 30 could say no more '
   || 'than "one person" (hr_l3_88''s ruling, eighth caller). The name MUST come from '
   || 'hr._subject_display_name with the viewer passed, never from a join on hr.employee: a join '
   || 'returns a display name to everyone who can read the punch, which is the raw-name leak '
   || 'hr_l3_66 removed from two other bodies. A re-emit that swaps the rule for a join restores it.',
   true, true, false)
on conflict do nothing;
