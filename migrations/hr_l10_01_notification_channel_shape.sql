-- Notification registry — `default_channels` has ONE shape (register item HRB-022, lane l10-inbox).
--
-- 🚨 THE DEFECT, FOUND 2026-08-26 BY BUILDING THE HR CATALOG AND LOOKING AT THE ROWS.
-- `communication.notification_event_type.default_channels` is read in exactly one place:
-- `aidream/services/notifications/service.py::notify()`, as `dict(event.default_channels or {})`.
-- That requires the `{channel: bool}` OBJECT shape, which is what the Python declaration lane
-- writes. But **21 rows carried a JSON ARRAY of channel names** — the workflow engine's 11
-- (HRB-008 `hr_c4_06_flow_roster`) and e-sign's 10 (HRB-011) — because those lanes seeded their
-- registry rows straight from SQL and picked the other shape.
--
-- `dict(["email", "in_app"])` does not degrade gracefully. It raises
-- `ValueError: dictionary update sequence element #0 has length 5; 2 is required`.
-- **The first real send on any of those 21 events would have died inside notify().**
--
-- Nobody caught it because both lanes' proofs write `communication.notification` rows through SQL
-- (`hr._wf_notice`, `esign`'s own emitter) and never call the Python resolver. Two writers, one
-- reader, and only one of the writers had ever met the reader.
--
-- HR Time's 26 `hr.time.*` rows (HRB-015, `hr_l3_22_notification_events`) are ALREADY objects and
-- are not touched — that lane got the shape right.
--
-- Fixed in three places, because one is not enough:
--   1. HERE — the 21 rows are normalized, losslessly: every channel that was in the array is
--      `true` in the object, and no channel gains or loses a default.
--   2. HERE — a CHECK constraint, so the next lane that seeds a row from SQL cannot reintroduce
--      it. A convention enforced in review is not enforced.
--   3. Python — `_normalize_default_channels()` coerces an array rather than raising, and LOGS AN
--      ERROR while doing it. That is the belt; this file is the trousers. A coercion nobody is
--      told about is exactly how a wrong shape survives.
--
-- Owner note: `communication.*` belongs to the Notification System program, not to HR. This change
-- is a data normalization plus a constraint that encodes what the program's own code already
-- requires — it takes nothing away and it is a one-line drop if that program rules otherwise.
--
-- Authority: SPEC-NOTIFICATIONS §2.1 (the per-channel platform default), §7.1 (the P rung).
-- Applied live as `hr_l10_01_notification_channel_shape`. Idempotent.

-- ============================================================ 1. normalize, losslessly
update communication.notification_event_type
   set default_channels = (
         select coalesce(jsonb_object_agg(channel, true), '{}'::jsonb)
           from jsonb_array_elements_text(default_channels) as channel)
 where jsonb_typeof(default_channels) = 'array';

-- An override row carries the same column and the same reader.
update communication.notification_event_override
   set default_channels = (
         select coalesce(jsonb_object_agg(channel, true), '{}'::jsonb)
           from jsonb_array_elements_text(default_channels) as channel)
 where default_channels is not null and jsonb_typeof(default_channels) = 'array';

-- ============================================================ 2. it cannot come back
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'notification_event_type_default_channels_is_object') then
    alter table communication.notification_event_type
      add constraint notification_event_type_default_channels_is_object
      check (default_channels is null or jsonb_typeof(default_channels) = 'object')
      not valid;
    alter table communication.notification_event_type
      validate constraint notification_event_type_default_channels_is_object;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'notification_event_override_default_channels_is_object') then
    alter table communication.notification_event_override
      add constraint notification_event_override_default_channels_is_object
      check (default_channels is null or jsonb_typeof(default_channels) = 'object')
      not valid;
    alter table communication.notification_event_override
      validate constraint notification_event_override_default_channels_is_object;
  end if;
end $$;

-- ============================================================ 3. assertions
do $$
declare v_n integer; v_row jsonb;
begin
  select count(*) into v_n from communication.notification_event_type
   where jsonb_typeof(default_channels) <> 'object';
  if v_n > 0 then
    raise exception 'hr_l10_01: % event rows still carry a non-object default_channels', v_n;
  end if;

  -- lossless: the workflow engine's step_assigned kept exactly the two channels §6.1 gives it
  select default_channels into v_row from communication.notification_event_type
   where event_key = 'hr.workflow.step_assigned';
  if v_row is not null
     and not (v_row = jsonb_build_object('email', true, 'in_app', true)) then
    raise exception 'hr_l10_01: hr.workflow.step_assigned normalized to %, not {email,in_app}', v_row;
  end if;

  -- HR Time's rows were already right and must be untouched
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.time.%' and jsonb_typeof(default_channels) = 'object';
  if v_n <> 26 then
    raise exception 'hr_l10_01: expected 26 object-shaped hr.time.* rows, found %', v_n;
  end if;

  -- the constraint is the part that stops the next lane, so prove it exists AND is validated
  if not exists (select 1 from pg_constraint
                  where conname = 'notification_event_type_default_channels_is_object'
                    and convalidated) then
    raise exception 'hr_l10_01: the default_channels shape constraint is missing or not validated';
  end if;
end $$;
