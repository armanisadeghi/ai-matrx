-- HR domain L3 — corrective to migration 3 (register item HRB-015, lane L3 punch + kiosk, SQL-1).
--
-- 🚨 `hr.punch_correct` AND `hr.punch_void` WERE RAISING INSTEAD OF RETURNING, AND THE FILE THAT
-- BROKE THEM WAS THIS LANE'S OWN. Repaired here, and in `hr_l3_03_punch_correct_void.sql` itself so
-- that re-applying that file can never re-break the lane again.
--
-- Authority: SPEC-TIME §4.1, §12; SPEC-NOTIFICATIONS §2.1, §7.1; R-L3-READINESS L3-08, L3-09.
-- Applied live as `hr_l3_03a_punch_notify_uses_shared_resolver`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE DEFECT, PROVEN LIVE BEFORE ANYTHING WAS TOUCHED.
--    `communication.notification_event_type.default_channels` is an OBJECT — `{"sms":false,
--    "email":true,"in_app":true}` — under the CHECK `notification_event_type_default_channels_is_object`
--    that `hr_l10_01_notification_channel_shape.sql` added, and `hr_l3_22_notification_events.sql`
--    has since seeded all 26 `hr.time.*` rows. `hr._punch_notify_edited` read it with
--    `jsonb_array_elements_text`, which on an object raises `22023 cannot extract elements from an
--    object` — reproduced directly:
--        select jsonb_array_elements_text('{"in_app":true}'::jsonb);  -- ERROR 22023
--    `hr.punch_correct` calls that notifier once per corrected punch and `hr.punch_void` once, both
--    inside their own write, so from the moment the event was seeded **every correction and every
--    void failed**, and the failure looked like a database fault rather than a refusal. Nothing in
--    the lane's own assertions caught it, because they never invoked the notifier.
--
-- 2. 🚨 ONE RESOLVER, AND THIS LANE DOES NOT OWN IT.
--    `hr._notify_channels(p_event_key, p_organization_id) → text[]` already exists — shipped by
--    `hr_l10_02_notify_channel_readers.sql` (HRB-022) as the ONE reader of the shape, applying the
--    platform default overlaid by the organization rung, returning `ARRAY['in_app']` for an
--    unregistered event and `'{}'` when every channel is explicitly off. This lane briefly created a
--    second resolver of its own; **that is the duplication the maintenance laws exist to prevent**
--    and it is dropped here. `hr_l10_02` carries two standing assertions that make the ban
--    self-checking — no `hr` function may read the shape by hand, and at least two SQL emitters must
--    call the shared resolver — and both are re-run at the foot of this file so this file cannot
--    regress them either.
--
-- 3. WHY THE FIX HAD TO LAND IN A FILE AND NOT ONLY IN THE DATABASE.
--    `hr_l10_02` repaired the LIVE body by a surgical `prosrc` rewrite, which is the right call for
--    another lane's function — but `hr_l3_03_punch_correct_void.sql` still carried the array read,
--    so the repair survived only until somebody re-applied this lane's own migration. That is a
--    silent re-break with no failing assertion anywhere. The body is now corrected in `hr_l3_03`
--    itself; this file exists so the correction is also a dated, applied migration in its own right.
--
-- 4. THE LAW STAYS UNCONDITIONAL (§4.1's ruling). `hr.time.punch_edited` is not org-overridable: a
--    silently edited timecard is a wage claim. So an empty resolved channel set does NOT mean "stay
--    silent" — it falls back to `in_app`, and `payload.channel_basis` records WHICH case produced
--    the row (`notify_channels_resolver` vs `law_overrides_empty_channel_set`) so the fallback is
--    visible rather than indistinguishable from a configured choice.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the duplicate resolver goes (RD 2)

drop function if exists hr.notify_channels(text, uuid);

-- ============================================================ 2. the repaired notifier (RD 1, RD 4)

create or replace function hr._punch_notify_edited(
  p_organization_id uuid, p_employment_id uuid,
  p_voided_punch_id uuid, p_replacement_punch_id uuid,
  p_reason text, p_actor_user uuid, p_change jsonb)
returns integer
language plpgsql
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_user uuid; v_channels text[]; v_basis text; ch text; v_n integer := 0;
  v_payload jsonb; v_link text;
begin
  select e.login_user_id into v_user
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
  if v_user is null then return 0; end if;      -- nobody to reach; the punch row still records it

  -- THE ONE RESOLVER (hr_l10_02). ARRAY['in_app'] for an unregistered event, '{}' when every
  -- channel is explicitly off.
  v_channels := hr._notify_channels('hr.time.punch_edited', p_organization_id);
  if v_channels is null or cardinality(v_channels) = 0 then
    v_channels := array['in_app']; v_basis := 'law_overrides_empty_channel_set';   -- RD 4
  else
    v_basis := 'notify_channels_resolver';
  end if;

  v_link := '/hr/me/timesheet?punch=' || coalesce(p_replacement_punch_id, p_voided_punch_id)::text;
  v_payload := jsonb_build_object(
    'voided_punch_id', p_voided_punch_id,
    'replacement_punch_id', p_replacement_punch_id,
    'reason', p_reason,
    'changed_by_user_id', p_actor_user,
    'change', p_change,
    'channel_basis', v_basis,
    'org_overridable', false,
    'deep_link', v_link);

  foreach ch in array v_channels loop
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (p_organization_id, 'hr.time.punch_edited', v_user, 'user', ch, v_payload,
            'hr_punch', coalesce(p_replacement_punch_id, p_voided_punch_id), v_link,
            'hrpunchedit:' || p_voided_punch_id::text || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

comment on function hr._punch_notify_edited(uuid, uuid, uuid, uuid, text, uuid, jsonb) is
  'SPEC-TIME 4.1 - the employee is told their punch was edited, ALWAYS. Channels come from the ONE '
  'shared resolver hr._notify_channels; an unregistered event or an all-off configuration still '
  'writes in_app, because a silently edited timecard is a wage claim.';

create or replace function hr.punch_edit_notify_debt()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'event_key', 'hr.time.punch_edited',
    'seeded', exists (select 1 from communication.notification_event_type
                       where event_key = 'hr.time.punch_edited' and deleted_at is null),
    'resolved_channels', to_jsonb(hr._notify_channels('hr.time.punch_edited', null)),
    'fallback_channels', '["in_app"]'::jsonb,
    'resolver', 'hr._notify_channels (hr_l10_02) - this lane keeps no second copy',
    'owner', 'event seeded by HRB-022 (l10-inbox); the punch emitter is HRB-015 lane L3');
$$;

-- ============================================================ assertions (RD 2)

do $$
declare v_bad text; v_n integer; v_ch text[];
begin
  if to_regprocedure('hr.notify_channels(text,uuid)') is not null then
    raise exception 'hr_l3_03a: the duplicate resolver hr.notify_channels still exists';
  end if;

  -- hr_l10_02's own two standing assertions, re-run so this file cannot regress them
  select string_agg(p.proname, ', ') into v_bad from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and p.prosrc like '%jsonb_array_elements_text(v_channels)%';
  if v_bad is not null then
    raise exception 'hr_l3_03a: these hr functions still read default_channels as an array by hand: %', v_bad;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f' and p.prosrc like '%hr._notify_channels%';
  if v_n < 2 then
    raise exception 'hr_l3_03a: expected both SQL emitters to read the shared resolver, found %', v_n;
  end if;

  v_ch := hr._notify_channels('hr.time.punch_edited', null);
  if not ('in_app' = any (v_ch)) then
    raise exception 'hr_l3_03a: hr.time.punch_edited resolved to %, expected in_app', v_ch;
  end if;
end $$;
