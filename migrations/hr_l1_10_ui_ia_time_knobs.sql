-- HR domain L1 — migration 10 (register item HRB-013, lane l1-employees).
--
-- THE FOUR SPEC-UI-IA §10 TIME KNOBS THAT HAD NO LIVE HOME (L3-B7).
-- Applied live as `hr_l1_10_ui_ia_time_knobs`. Idempotent.
--
-- Authority: SPEC-UI-IA §10 (this lane owns the UI-IA rows); SPEC-TIME §13; SPEC-DATA-MODEL
-- §19.1; R-CORE B1 (snake_case).
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 29 — THE TWO FEATURES DO NOT NEED CREATING, BECAUSE THE OWNING
-- SPEC ALREADY PUTS THESE KEYS ON AN ON-LIST SLUG.
--
-- L3-B7 reports four knobs with no live home and names them `hr.clock.web_punch_enabled`,
-- `hr.clock.kiosk_enabled`, `hr.timesheet.attestation_required` and
-- `hr.timesheet.bulk_approve_enabled` — which is how **SPEC-TIME §13** writes them, and §13 is
-- explicit that they are not its rows: *"Four rows are not ours to register … they are
-- SPEC-UI-IA §10 rows and stay in their owner's namespace."*
--
-- Read the owner's namespace. **SPEC-UI-IA §10 lines 871–874 already write all four under
-- `hr.time_and_attendance`:**
--
--     hr.time_and_attendance.web_punch_enabled                  org   true
--     hr.time_and_attendance.kiosk_enabled                      org   false
--     hr.time_and_attendance.timesheet_attestation_required     org   true
--     hr.time_and_attendance.timesheet_bulk_approve_enabled     org   true
--
-- So `hr.clock` and `hr.timesheet` are SPEC-TIME's rendering of the names, not the owner's, and
-- creating them as feature slugs would be actively wrong in three ways at once:
--
--   1. **SPEC-DATA-MODEL §19.1 rules that a knob whose feature does not resolve to a real
--      taxonomy node is REJECTED BY THE SEEDER**, and neither `clock` nor `timesheet` is a node.
--      (Verified live: `platform.taxonomy_node` returns nothing for either — nor, for that
--      matter, for `time_and_attendance`, so that table is not the live allowlist for anything
--      today. The **effective** allowlist is the 15 slugs the 128 live `hr.*` knobs already use.)
--   2. `hr_l1_02a` ships an assertion that fails on any `hr.*` knob whose slug is off that list —
--      so adding these two would break a guard **this same lane** wrote, on its next re-apply.
--   3. It would contradict the spec named as the owner, and leave four keys in a namespace no
--      resolver reads.
--
-- **This lane's call: register them exactly as SPEC-UI-IA §10 writes them.** That is the settled
-- snake_case `hr.<slug>` grammar, on the slug that already carries 25 live T&A knobs, and it is
-- the owning spec's own text — so nothing is being invented here, only landed. The defaults are
-- §10's, which are also L3's documented defaults.
-- **→ coordinator: SPEC-TIME §13's `hr.clock.*` / `hr.timesheet.*` spellings are the stale ones
-- and owe a correction to `hr.time_and_attendance.*`; L3 should read the four keys under that
-- slug. No live reader exists yet (grepped `features/hr/time/`: zero references to any of the
-- four), so nothing breaks either way — which is exactly why it is worth fixing now rather than
-- after somebody wires one.**
--
-- 🚨 RECORDED TECHNICAL DECISION 30 — `timesheet_attestation_required` IS NOT
-- `employee_attestation_required`, AND BOTH SURVIVE.
-- `hr.time_and_attendance.employee_attestation_required` is already live (L3's, default true) and
-- governs **whether the attestation STEP EXISTS** in the timecard flow. §10's
-- `timesheet_attestation_required` is the **UI gate** on `/hr/me/timesheet`. They look like
-- duplicates and are not: an org can run the workflow step while the self-service surface is off
-- (kiosk-only staff attest at the kiosk), and collapsing them would silently remove one of those
-- two controls. Both are seeded; each `basis` says which is which so the next reader does not
-- "clean up" the pair.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare r record; v_added int := 0;
begin
  for r in
    select * from (values
      ('web_punch_enabled', 'boolean', 'true'::jsonb,
       'Whether the web punch surface at /hr/me/clock exists at all. TRUE because a salaried-plus-hourly org that turns HR on expects its people to be able to clock in from the app on day one; an org that clocks only at a wall device turns it off and the route goes ABSENT, not disabled. SPEC-UI-IA §10 row; SPEC-TIME §13 reads it and must never treat an absent row as false.'),
      ('kiosk_enabled', 'boolean', 'false'::jsonb,
       'Whether the shared-device kiosk lane is available. FALSE on purpose — a kiosk mints a device secret and admits punches with no auth.uid(), so it is the one time surface that must be switched on deliberately by somebody who has read what it does, never inherited by an org that never asked for it. SPEC-UI-IA §10 row.'),
      ('timesheet_attestation_required', 'boolean', 'true'::jsonb,
       'The UI gate on /hr/me/timesheet: whether the employee is asked to attest. DISTINCT from employee_attestation_required, which decides whether the attestation STEP EXISTS in the timecard flow (RECORDED DECISION 30) — an org can run the step while this surface is off, because kiosk-only staff attest at the kiosk. SPEC-UI-IA §10 row.'),
      ('timesheet_bulk_approve_enabled', 'boolean', 'true'::jsonb,
       'Whether /hr/time/timesheets offers bulk approval. TRUE because a manager approving forty identical weeks one at a time will stop reading them, which is the failure this control exists to prevent; the workflow engine still refuses bulk on any flow whose definition forbids it, so this switch can widen nothing the engine has closed. SPEC-UI-IA §10 row.')
    ) as t(key, value_type, default_value, basis)
  loop
    insert into platform.feature_knob (feature, key, value_type, value, default_value, basis,
                                       set_by, review_due, label, description)
    values ('hr.time_and_attendance', r.key, r.value_type, r.default_value, r.default_value,
            r.basis, 'agent', (current_date + 90),
            initcap(replace(r.key, '_', ' ')), r.basis)
    on conflict (feature, key) do update
      set value_type    = excluded.value_type,
          default_value = excluded.default_value,
          basis         = excluded.basis,
          label         = excluded.label,
          description   = excluded.description,
          review_due    = excluded.review_due,
          updated_at    = now();
    if found then v_added := v_added + 1; end if;
  end loop;
  raise notice 'hr_l1_10: seeded % SPEC-UI-IA §10 time knob(s)', v_added;
end $$;

-- ============================================================ assertions

do $$
declare v_missing text; v_bad int; v_slug text;
begin
  select string_agg(k, ', ' order by k) into v_missing from (
    select k from unnest(ARRAY['web_punch_enabled','kiosk_enabled',
                               'timesheet_attestation_required',
                               'timesheet_bulk_approve_enabled']) as k
     where not exists (select 1 from platform.feature_knob fk
                        where fk.feature = 'hr.time_and_attendance' and fk.key = k)) s;
  if v_missing is not null then
    raise exception 'hr_l1_10: knob(s) not seeded: %', v_missing;
  end if;

  -- D13: each must actually RESOLVE, or the surface reading it raises at runtime.
  perform hr._knob('hr.time_and_attendance','web_punch_enabled');
  perform hr._knob('hr.time_and_attendance','kiosk_enabled');
  perform hr._knob('hr.time_and_attendance','timesheet_attestation_required');
  perform hr._knob('hr.time_and_attendance','timesheet_bulk_approve_enabled');

  -- RECORDED DECISION 30: the pair is deliberate. Collapsing it removes a real control.
  if not exists (select 1 from platform.feature_knob
                  where feature = 'hr.time_and_attendance'
                    and key = 'employee_attestation_required') then
    raise exception 'hr_l1_10: employee_attestation_required has gone — it is the workflow-step '
                    'knob and is NOT the same control as timesheet_attestation_required';
  end if;

  -- RECORDED DECISION 29: no new phantom slugs. This is the guard hr_l1_02a ships, re-asserted
  -- here because this file is exactly where somebody would have added two.
  select count(*), string_agg(distinct feature, ', ') into v_bad, v_slug
    from platform.feature_knob
   where feature like 'hr.%'
     and split_part(feature,'.',2) not in (
       'access','approvals','contracts','domain_wide','employees','hiring','jurisdiction_rules',
       'leave','onboarding','records','relations','scheduling','time_and_attendance','training',
       'workflow');
  if v_bad > 0 then
    raise exception 'hr_l1_10: knobs on off-list slug(s): % — SPEC-DATA-MODEL §19.1 rejects a '
                    'feature that resolves to no node', v_slug;
  end if;
end $$;
