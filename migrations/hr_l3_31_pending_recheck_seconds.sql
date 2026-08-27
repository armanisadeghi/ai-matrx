-- HR domain L3 — migration 31 (register item HRB-015, lane L3 punch + kiosk).
--
-- The `device_pending_approval` refusal now carries `recheck_seconds`, so the kiosk client can drop
-- its hardcoded `PENDING_RECHECK_SECONDS = 10`. The builder was right to flag its own constant: a
-- polling interval is a ceiling, and "limits are knobs, and agents set them" - a tablet that
-- rechecks every 10 seconds is a per-organization decision (a depot with 40 tablets and a slow link
-- wants 60), and a constant compiled into the client can never be that.
--
-- Sourced from the same ladder as `heartbeat_seconds`: `hr._punch_knob` -> `hr._hr_knob`, so the
-- organization's override in `iam.organizations.settings->'hr'->'time_and_attendance'` wins over
-- `platform.feature_knob`, which wins over the caller's documented default of 10. That is the same
-- resolver hr_l3_22 built and hr_l3_24 pointed at the registered feature, so this key cannot repeat
-- the N1 shape of resolving against a namespace nothing writes to.
--
-- Both doors carry it, because both can answer `device_pending_approval`:
--   * `hr_kiosk_authenticate` - the tablet in the approval gap, which is the whole point.
--   * `hr_kiosk_session_heartbeat` - a device set back to pending mid-session.
-- On the revoked/suspended branch it is deliberately NULL: a revoked tablet bricks and must not be
-- told to come back in ten seconds. Rechecking is only meaningful while approval is still pending.
--
-- 🚨 `kiosk_pending_recheck_seconds` IS NOT SEEDED IN `platform.feature_knob`, so it resolves to the
-- caller default today. That is a real debt, not a silent fallback: it is added to
-- `hr.punch_knobs_missing()` alongside the SPEC-TIME §13 rows, marked as ruled by the coordinator
-- rather than pretending §13 already carries it. Until it is seeded, no organization can override it.
--
-- Applied live as `hr_l3_31_pending_recheck_seconds`. Idempotent.

-- 1. authenticate: the approval-gap answer carries the interval
do $outer$
declare v_def text; v_from text; v_to text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'public.hr_kiosk_authenticate(uuid,text)'::regprocedure;
  if position('recheck_seconds' in v_def) > 0 then
    raise notice 'hr_l3_31: authenticate already carries recheck_seconds'; return;
  end if;

  v_from := '      ''trust_state'', d.trust_state,' || chr(10) ||
            '      ''server_time'', now(),';
  v_to   := '      ''trust_state'', d.trust_state,' || chr(10) ||
            '      ''server_time'', now(),' || chr(10) ||
            '      -- hr_l3_31: how long to wait before asking again. NULL once the answer is no' || chr(10) ||
            '      -- longer "wait" - a revoked tablet bricks and must not be told to come back.' || chr(10) ||
            '      ''recheck_seconds'', case when d.trust_state = ''pending'' then' || chr(10) ||
            '        (hr._punch_knob(''kiosk_pending_recheck_seconds'', ''10''::jsonb,' || chr(10) ||
            '                        d.organization_id) #>> ''{}'')::integer end,';

  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_31: the authenticate pending envelope was not in its expected shape';
  end if;
  execute replace(v_def, v_from, v_to);
end $outer$;

-- 2. heartbeat: a device set back to pending mid-session gets the same answer
do $outer$
declare v_def text; v_from text; v_to text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'public.hr_kiosk_session_heartbeat(text)'::regprocedure;
  if position('recheck_seconds' in v_def) > 0 then
    raise notice 'hr_l3_31: heartbeat already carries recheck_seconds'; return;
  end if;

  v_from := '                              ''trust_state'', coalesce(d.trust_state, ''revoked''),' || chr(10) ||
            '                              ''server_time'', now());';
  v_to   := '                              ''trust_state'', coalesce(d.trust_state, ''revoked''),' || chr(10) ||
            '                              ''server_time'', now(),' || chr(10) ||
            '                              ''recheck_seconds'', case when d.trust_state = ''pending'' then' || chr(10) ||
            '                                (hr._punch_knob(''kiosk_pending_recheck_seconds'', ''10''::jsonb,' || chr(10) ||
            '                                                d.organization_id) #>> ''{}'')::integer end);';

  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_31: the heartbeat refusal envelope was not in its expected shape';
  end if;
  execute replace(v_def, v_from, v_to);
end $outer$;

-- 3. the debt is visible, and honestly attributed
create or replace function hr.punch_knobs_missing()
returns table (feature text, key text, spec_default jsonb, owner text)
language sql
stable
as $$
  with owed(key, spec_default, owner) as (
    values
      ('near_duplicate_punch_window_seconds', '120'::jsonb,                        'seed lane (SPEC-TIME 13)'),
      ('punch_enabled_worker_classes',        '["employee","intern","seasonal"]',  'seed lane (SPEC-TIME 13, 8)'),
      ('geo_required_web_punch',              'false',                             'seed lane (SPEC-TIME 13, 4.9)'),
      ('max_geo_accuracy_m',                  '200',                               'seed lane (SPEC-TIME 13)'),
      ('web_punch_ip_verification',           '"off"',                             'seed lane (SPEC-TIME 13, 4.7)'),
      ('web_punch_ip_allowlist',              '[]',                                'seed lane (SPEC-TIME 13, 4.7)'),
      ('remote_worker_validation',            '"attest"',                          'seed lane (SPEC-TIME 13, 4.7)'),
      ('kiosk_cross_location_punch',          '"allow_with_flag"',                 'seed lane (SPEC-TIME 13, 3.3)'),
      ('kiosk_time_authority',                '"server"',                          'seed lane (SPEC-TIME 13, 3.3)'),
      ('kiosk_heartbeat_seconds',             '60',                                'seed lane (SPEC-TIME 13)'),
      ('kiosk_confirm_dismiss_seconds',       '5',                                 'seed lane (SPEC-TIME 13)'),
      ('workday_start_local',                 '"00:00"',                           'seed lane (SPEC-TIME 13, 9.5)'),
      ('workweek_start_day',                  '"sunday"',                          'seed lane (SPEC-TIME 13)'),
      ('variance_warn_minutes',               '15',                                'seed lane (SPEC-TIME 13)'),
      ('pairing_code_ttl_minutes',            '15',                                'seed lane (SPEC-TIME 13)'),
      -- not a SPEC-TIME 13 row: ruled by the coordinator 2026-08-27 so the kiosk client could drop
      -- a hardcoded PENDING_RECHECK_SECONDS constant. Owed a register row like any other ceiling.
      ('kiosk_pending_recheck_seconds',       '10',                                'seed lane (coordinator ruling 2026-08-27, owed a SPEC-TIME 13 row)')
  )
  select 'hr.time_and_attendance'::text, o.key, o.spec_default, o.owner
    from owed o
   where not exists (select 1 from platform.feature_knob k
                      where k.feature = 'hr.time_and_attendance' and k.key = o.key)
  order by 1, 2;
$$;

comment on function hr.punch_knobs_missing() is
  'L3 debt ledger: every knob the punch/kiosk lane READS that is not seeded in platform.feature_knob. Non-empty means hr._punch_knob is standing on a documented default and NO organization can override that key.';

do $$
declare v_a text; v_h text;
begin
  v_a := pg_get_functiondef('public.hr_kiosk_authenticate(uuid,text)'::regprocedure);
  v_h := pg_get_functiondef('public.hr_kiosk_session_heartbeat(text)'::regprocedure);
  if v_a not like '%recheck_seconds%' then
    raise exception 'hr_l3_31: authenticate does not carry recheck_seconds';
  end if;
  if v_h not like '%recheck_seconds%' then
    raise exception 'hr_l3_31: heartbeat does not carry recheck_seconds';
  end if;
  -- it must go through the org-aware ladder, not a literal
  if v_a not like '%hr._punch_knob(''kiosk_pending_recheck_seconds''%' then
    raise exception 'hr_l3_31: authenticate does not resolve recheck_seconds through the knob ladder';
  end if;
  -- the uniform refusal must be untouched (R1's anti-enumeration property)
  if v_a not like '%device_not_authenticated%' then
    raise exception 'hr_l3_31: the uniform refusal was lost';
  end if;
  if not exists (select 1 from hr.punch_knobs_missing() where key = 'kiosk_pending_recheck_seconds') then
    raise exception 'hr_l3_31: the new knob is not on the debt ledger';
  end if;
  if (select count(*) from hr.stable_doors_that_write()) > 0 then
    raise exception 'hr_l3_31: the F1 class gate went RED';
  end if;
end $$;
