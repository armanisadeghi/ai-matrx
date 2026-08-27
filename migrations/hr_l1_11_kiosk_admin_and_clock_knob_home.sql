-- HR domain L1 — migration 11 (register item HRB-013, lane l1-employees).
--
-- THE TWO `hr.clock` KNOB READERS REPOINTED at the home SPEC-UI-IA §10 actually names.
--
-- Authority: SPEC-UI-IA §3.11 route 75a, §10; SPEC-TIME §3.3; EXECUTION §3 (settings shells are
-- L1's). Applied live as `hr_l1_11_kiosk_admin_and_clock_knob_home`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 31 — `hr.clock` HAD READERS AFTER ALL, AND THEY RESOLVED TO
-- NOTHING.
--
-- `hr_l1_10` registered §10's four UI knobs under `hr.time_and_attendance`, which is where
-- SPEC-UI-IA §10 lines 871–874 write them and the only slug of the two spellings that is on the
-- live 15-slug list. A frontend grep found no reader — **and the readers are in SQL:**
--
--   · `hr._clock_knob(p_key, p_default)` hardcodes `where k.feature = 'hr.clock'`
--   · `hr.punch_knobs_missing()` reports `web_punch_enabled` / `kiosk_enabled` as owed **under
--     `hr.clock`**, annotated *"SPEC-UI-IA §10 owner (this lane reads, never registers — U-01)"*
--
-- Both are L3's and both were correct to read rather than register. Neither resolved: **no
-- `hr.clock` row has ever existed**, so `hr._clock_knob` always fell through to its caller's
-- literal default and `hr_kiosk_claim_pairing`'s org gate has never once consulted a knob.
-- (Six other hits on `hr.clock` / `hr.timesheet` are FUNCTION names — `hr.clock_state`,
-- `hr.timesheet_get` — not knob features. Checked, not assumed.)
--
-- Repointing both to `hr.time_and_attendance` is what makes the keys real: ONE home, the owning
-- spec's, on an allowlisted slug, read by everything that reads them. The alternative — creating
-- `hr.clock` and `hr.timesheet` as feature slugs — would put two phantom slugs in a register
-- SPEC-DATA-MODEL §19.1 says the seeder rejects, break the guard `hr_l1_02a` ships, and leave the
-- owning spec's own text pointing somewhere else.
--
-- 🚨 `hr._clock_knob`'s FALL-THROUGH IS KEPT, DELIBERATELY. It ends `coalesce(v, p_default)`
-- rather than raising the way `hr._knob` does, and SPEC-TIME §13 states why in a sentence worth
-- preserving: *"An absent knob row is not an opt-out and never means false."* An administrator
-- issuing a pairing code IS the org's opt-in; a kiosk that refuses every device because nobody
-- seeded a platform default would be unfixable from inside the product. Now that the rows exist
-- the fall-through should never fire — but it stays, because the reason it exists has not changed.
--
-- 🚨 RECORDED TECHNICAL DECISION 32 — THE FOUR KIOSK ADMIN RPCs AND THE FOUR PAIRING COLUMNS
-- ALL EXIST ALREADY, SO THIS FILE SHIPS NEITHER.
--
-- This migration was drafted to add `hr_kiosk_device_list`, `hr_kiosk_pairing_code_create`,
-- `hr_kiosk_device_set_trust` and `hr_kiosk_device_set_capture` — the four L3's
-- `deviceAdminSource.ts` records as *"DEBT, owed to the SQL lane"*. Read live before writing:
-- **all four are already there**, authenticated-only (`anon` has EXECUTE on none of them), and
-- with richer signatures than this draft's — `hr_kiosk_pairing_code_create` takes an optional
-- `p_device_id` so a code can be re-issued for a device that already exists, which the draft did
-- not handle at all. The kiosk builder landed them while this lane was working.
--
-- **So they are not re-created here.** Replacing a working, better implementation with a draft
-- because a note somewhere said it was owed is how a lane destroys another lane's work while
-- believing it is closing a gap. The only thing missing was the knob home, below.
--
-- The pairing columns are the same story: R-L3 U-09 records `pairing_code_hash`,
-- `pairing_code_expires_at`, `pairing_claimed_at` and `device_fingerprint` as owed DDL. Read live:
-- **all four are on `hr.kiosk_device`**, and `hr_kiosk_claim_pairing` reads three of them. That
-- note is stale too. `hr.kiosk_device` is `iam.canonical_certify_ok = true` and this file adds no
-- columns, so certification is untouched.
--
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ (a) repoint the two readers

create or replace function hr._clock_knob(p_key text, p_default jsonb default 'null'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v jsonb;
begin
  -- RECORDED DECISION 31: `hr.time_and_attendance`, not `hr.clock`. SPEC-UI-IA §10 — the spec
  -- SPEC-TIME §13 itself names as the owner of these rows — writes them under this slug, and it
  -- is the only one of the two on the live allowlist.
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k
   where k.feature = 'hr.time_and_attendance' and k.key = p_key;

  -- The fall-through is deliberate and is NOT `hr._knob`'s raise. SPEC-TIME §13: "an absent knob
  -- row is not an opt-out and never means false." An administrator issuing a pairing code is the
  -- org's opt-in; refusing every device because a platform default is unseeded would be a state
  -- nobody could fix from inside the product.
  return coalesce(v, p_default);
end
$fn$;

create or replace function hr.punch_knobs_missing()
returns table(feature text, key text, spec_default jsonb, owner text)
language sql stable security definer set search_path = hr, public
as $fn$
  with owed(key, spec_default, owner) as (
    values
      ('near_duplicate_punch_window_seconds', '120'::jsonb,                        'seed lane (SPEC-TIME §13)'),
      ('punch_enabled_worker_classes',        '["employee","intern","seasonal"]',  'seed lane (SPEC-TIME §13, §8)'),
      ('geo_required_web_punch',              'false',                             'seed lane (SPEC-TIME §13, §4.9)'),
      ('max_geo_accuracy_m',                  '200',                               'seed lane (SPEC-TIME §13)'),
      ('web_punch_ip_verification',           '"off"',                             'seed lane (SPEC-TIME §13, §4.7)'),
      ('web_punch_ip_allowlist',              '[]',                                'seed lane (SPEC-TIME §13, §4.7)'),
      ('remote_worker_validation',            '"attest"',                          'seed lane (SPEC-TIME §13, §4.7)'),
      ('kiosk_cross_location_punch',          '"allow_with_flag"',                 'seed lane (SPEC-TIME §13, §3.3)'),
      ('kiosk_time_authority',                '"server"',                          'seed lane (SPEC-TIME §13, §3.3)'),
      ('kiosk_heartbeat_seconds',             '60',                                'seed lane (SPEC-TIME §13)'),
      ('kiosk_confirm_dismiss_seconds',       '5',                                 'seed lane (SPEC-TIME §13)'),
      ('workday_start_local',                 '"00:00"',                           'seed lane (SPEC-TIME §13, §9.5)'),
      ('workweek_start_day',                  '"sunday"',                          'seed lane (SPEC-TIME §13)'),
      ('variance_warn_minutes',               '15',                                'seed lane (SPEC-TIME §13)'),
      ('pairing_code_ttl_minutes',            '15',                                'seed lane (SPEC-TIME §13)'),
      -- RECORDED DECISION 31: the two §10 rows now live on THIS slug, so the gate asks for them
      -- here. They are still not the Time lane's to register — HRB-013 seeded them in hr_l1_10 —
      -- and the gate keeps saying so, because the owner is the useful half of a missing-knob report.
      ('web_punch_enabled',                   'true',                              'SPEC-UI-IA §10 owner / HRB-013 (this lane reads, never registers — U-01)'),
      ('kiosk_enabled',                       'false',                             'SPEC-UI-IA §10 owner / HRB-013 (this lane reads, never registers — U-01)')
  )
  select 'hr.time_and_attendance'::text, o.key, o.spec_default, o.owner
    from owed o
   where not exists (select 1 from platform.feature_knob k
                      where k.feature = 'hr.time_and_attendance' and k.key = o.key)
   order by 1, 2;
$fn$;

-- ============================================================ assertions

do $$
declare v_bad int; v_names text;
begin
  -- RECORDED DECISION 31: no reader may be left pointing at the empty slug.
  select count(*), string_agg(n.nspname||'.'||p.proname, ', ') into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.prosrc like '%feature = ''hr.clock''%';
  if v_bad > 0 then
    raise exception 'hr_l1_11: % function(s) still read the empty hr.clock slug: %', v_bad, v_names;
  end if;

  -- the four §10 keys must now resolve through the Time lane's own helper
  if (hr._clock_knob('web_punch_enabled', 'null'::jsonb) #>> '{}') is null then
    raise exception 'hr_l1_11: hr._clock_knob still cannot resolve web_punch_enabled';
  end if;
  if (hr._clock_knob('kiosk_enabled', 'null'::jsonb) #>> '{}') is null then
    raise exception 'hr_l1_11: hr._clock_knob still cannot resolve kiosk_enabled';
  end if;

  -- the gate must now report the two §10 rows as satisfied
  if exists (select 1 from hr.punch_knobs_missing()
              where key in ('web_punch_enabled','kiosk_enabled')) then
    raise exception 'hr_l1_11: punch_knobs_missing still reports the §10 rows as owed';
  end if;

  -- RECORDED DECISION 32: the four admin RPCs are ANOTHER LANE'S and must still be here, intact
  -- and authenticated-only. If this file ever grows a second copy, this is what catches it.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_kiosk_device_list','hr_kiosk_pairing_code_create',
                       'hr_kiosk_device_set_trust','hr_kiosk_device_set_capture');
  if v_bad <> 4 then
    raise exception 'hr_l1_11: expected the kiosk builder''s 4 admin RPCs, found % — this lane '
                    'does not own them and must not re-create them', v_bad;
  end if;
  select count(*), string_agg(p.proname, ', ') into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_kiosk_device_list','hr_kiosk_pairing_code_create',
                       'hr_kiosk_device_set_trust','hr_kiosk_device_set_capture')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_11: % kiosk ADMIN rpc(s) executable by anon: %', v_bad, v_names;
  end if;
end $$;
