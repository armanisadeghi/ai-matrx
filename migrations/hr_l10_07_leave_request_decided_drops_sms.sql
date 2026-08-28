-- HR domain L10 — a leave denial does not arrive by text (register item HRB-022).
--
-- THE RULING. `check_hr_notification_catalog` has been printing, every run:
--
--     RULING OWED: SPEC-LEAVE §13 rule 2 says SMS is never a default channel for leave, but §3.6
--     defaults it ON for: hr.leave.request_decided.
--
-- Both were ratified sentences in ratified specs and a build lane will not move a platform default
-- to settle a disagreement between two of them, so it was reported rather than resolved. It is now
-- ruled: **the pillar rule beats its own row.** §3.6's entry was an over-inclusion when the SMS
-- lists were drawn, and the product reasoning is the ruling's core — D10's SMS-on argument is the
-- hourly operational loop, *"come to work at this time"*, to somebody who is not at a desk. A
-- decision on a time-off request is neither operational nor time-critical in that sense, and the
-- version of it that matters most to get right is the **denial**.
--
-- 🚨 WHY THIS NEEDS A MIGRATION AT ALL. `default_channels` is a KNOB: the registry row is the
-- admin's once it is born, and `reconcile_notification_event_types` never rewrites it (that rule
-- is what stops a deploy stamping over an organization's choices). So regenerating the catalog
-- moved the SPEC and the CODE to 43 and left the LIVE row at 44 — the one place a notice is
-- actually addressed from. A ruling that only reaches the declaration is a ruling that has not
-- happened.
--
-- NOT LOCKED. The five protected leave-CASE events are 🔒 because case subject matter is not
-- lock-screen material at any rung. This is not case material: a user who wants their leave
-- decision by text may say so through `communication.notification_preference` — the D13 **user
-- rung**, which is the right home for a personal choice that is wrong as a platform default.
--
-- Authority: SPEC-LEAVE §13 rule 2; SPEC-NOTIFICATIONS §2.4, §3.6 (both amended on the same day),
-- §7.1 (the P → O → U ladder). Applied live as `hr_l10_07_leave_request_decided_drops_sms`.
-- Idempotent.

update communication.notification_event_type
   set default_channels = default_channels - 'sms'
 where event_key = 'hr.leave.request_decided'
   and deleted_at is null
   and (default_channels ->> 'sms') is not null;

-- ── assertions ──────────────────────────────────────────────────────────────────────────────
do $$
declare v_row jsonb; v_locked boolean; v_leave_on integer; v_total_on integer;
begin
  select default_channels, (config ->> 'sms_locked')::boolean
    into v_row, v_locked
    from communication.notification_event_type
   where event_key = 'hr.leave.request_decided' and deleted_at is null;

  if v_row is null then
    raise exception 'hr_l10_07: hr.leave.request_decided has no live row to rule on';
  end if;
  if v_row ? 'sms' then
    raise exception 'hr_l10_07: the row still defaults SMS ON: %', v_row;
  end if;
  -- the demotion must not have taken the other two channels with it
  if not (coalesce((v_row ->> 'email')::boolean, false)
          and coalesce((v_row ->> 'in_app')::boolean, false)) then
    raise exception 'hr_l10_07: the row lost email or in_app as well: %', v_row;
  end if;
  -- and it is a DEFAULT that moved, not a lock: the user rung stays available
  if coalesce(v_locked, false) then
    raise exception 'hr_l10_07: request_decided was locked, not demoted — the user rung is gone';
  end if;

  select count(*) into v_leave_on from communication.notification_event_type
   where event_key like 'hr.leave.%' and deleted_at is null and (default_channels ->> 'sms')::boolean;
  if v_leave_on <> 0 then
    raise exception 'hr_l10_07: % leave event(s) still default SMS ON', v_leave_on;
  end if;

  select count(*) into v_total_on from communication.notification_event_type
   where event_key like 'hr.%' and event_key not like 'hr.workflow.%'
     and deleted_at is null and (default_channels ->> 'sms')::boolean;
  if v_total_on <> 43 then
    raise exception 'hr_l10_07: §3.6 states 43 SMS-default-ON HR events, live count is %', v_total_on;
  end if;

  -- 🚨 THE COUNTER MUST STILL BE ABLE TO FIRE. A check that can only report "clean" reports
  -- nothing, and this one has just gone quiet — which is exactly when it stops being trusted. So
  -- prove the predicate answers TRUE on a planted violation before we accept its silence.
  if not exists (
    select 1 from (values ('hr.leave.__planted__'::text, '{"sms": true}'::jsonb)) v(k, ch)
     where v.k like 'hr.leave.%' and (v.ch ->> 'sms')::boolean)
  then
    raise exception 'hr_l10_07: the leave-SMS predicate cannot answer true — its silence proves nothing';
  end if;

  raise notice 'hr_l10_07: no leave event defaults to SMS; 43 HR events do; the predicate still fires on a planted row';
end $$;
