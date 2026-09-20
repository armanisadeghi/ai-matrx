-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.booking_manage(text, integer) 6fe4c7fe474c9f6049bdb0ab75f6dc89524a7c613d0a7748393406f12bfcfc08
-- based-on: custom.booking_reschedule(text, text, text, text) c5f89d30a5e8eed9868e8db68f94377c8146be35bcd75abe1479e8e9b4966161
-- based-on: custom.booking_cancel(text, text) 63916135143c35b85e2eaa957ecde72e3f631c49b3861a13bb8b41a9a2881bfa
--
-- LANE BOOKING — DEFECT 3: THE VISITOR'S OWN LINK REACHED NOTHING AT ALL.
--
-- All three doors a person uses on their own appointment — open it, move it, cancel it —
-- opened with
--
--     select * into v_s from custom.anon_submission where booking_ref = p_booking_ref;
--
-- and every one of them raised `42702: column reference "booking_ref" is ambiguous` on its
-- first statement. `booking_ref` is ALSO the name of each function's first OUT parameter,
-- which is an ordinary PL/pgSQL variable in scope, so the planner could not tell the column
-- from the variable and refused rather than guessing.
--
-- It is a naming collision and it is exactly the collision a door of this shape invites: the
-- thing a visitor is given is called a booking ref, the column that stores it is called
-- `booking_ref`, and the value the door hands back is called `booking_ref` too — three
-- correct names, one scope. The fix is to say which one is meant, by giving the table an
-- alias; renaming the OUT parameter would have made the door answer a different column name
-- than the one the store holds, which is worse.
--
-- THE CLASS: a `returns table(...)` column that shares a name with a column of a table the
-- body reads. Census over the booking doors: these three; `custom.booking_public` and
-- `custom.booking_hold` return `form_id` and `slot_key`, and both already alias every table
-- they read.

create or replace function custom.booking_manage(p_booking_ref text, p_days integer default null)
returns table(booking_ref text, form_id uuid, title text, slot_key text, slot_at timestamptz,
              status text, slots jsonb, availability jsonb, state text, message text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_s     custom.anon_submission;
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_doc   jsonb;
  v_taken jsonb;
  v_list  jsonb;
  v_key   text;
begin
  if p_booking_ref is null or btrim(p_booking_ref) = '' then return; end if;
  select * into v_s from custom.anon_submission sub where sub.booking_ref = p_booking_ref;
  if not found then return; end if;
  if not custom.store_is_open(v_s.organization_id) then return; end if;
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  if not found then return; end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then return; end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select r.data into v_doc from custom.record r
   where r.organization_id = v_s.organization_id and r.id = v_s.record_id and r.deleted_at is null;
  v_key := coalesce(v_doc ->> 'slot', v_s.payload ->> 'slot');

  select coalesce(jsonb_object_agg(r.data ->> 'slot_key', true), '{}'::jsonb) into v_taken
    from custom.record r
   where r.organization_id = v_s.organization_id
     and r.table_id = v_slots
     and r.deleted_at is null
     and coalesce((r.data ->> 'expires_at')::timestamptz, now()) > now();

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.slot_key,
           'at', to_char(s.slot_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           -- THE PERSON'S OWN TIME IS NOT "TAKEN" TO THEM. Showing their own appointment
           -- greyed out beside a Reschedule button is a screen that says no to itself.
           'taken', coalesce((v_taken ->> s.slot_key)::boolean, false) and s.slot_key <> coalesce(v_key, ''),
           'mine', s.slot_key = coalesce(v_key, ''),
           'member_user_id', s.member_user_id) order by s.slot_key), '[]'::jsonb)
    into v_list
    from custom._booking_slots(v_b, p_days) s;

  booking_ref := p_booking_ref; form_id := v_f.id; title := coalesce(v_f.title, 'Your appointment');
  slot_key := v_key; slot_at := nullif(v_key, '')::timestamptz;
  status := coalesce(v_doc ->> 'status', 'booked');
  slots := v_list; availability := v_b - 'slot_table_id';
  state := case when coalesce(v_doc ->> 'status', 'booked') = 'cancelled' then 'cancelled'
                when v_doc is null then 'held'
                else 'booked' end;
  message := case when coalesce(v_doc ->> 'status', 'booked') = 'cancelled'
                  then 'This appointment was cancelled, so the time is free again.'
                  when v_doc is null
                  then 'Your details are still waiting for someone to confirm them, so there is nothing to move yet.'
                  else null end;
  return next;
end;
$fn$;

create or replace function custom.booking_reschedule(p_booking_ref text, p_slot_key text,
                                          p_origin text, p_bucket text default null)
returns table(booking_ref text, record_id uuid, slot_key text, slot_at timestamptz,
              state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_s      custom.anon_submission;
  v_f      custom.anon_form;
  v_b      jsonb;
  v_slots  uuid;
  v_doc    jsonb;
  v_old    text;
  v_oldrow custom.record;
  v_found  boolean := false;
  v_who    uuid;
  v_new    uuid;
  v_end    timestamptz;
  v_at     timestamptz;
  v_held   text;
  v_stood  boolean := false;
begin
  if p_booking_ref is null then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  select * into v_s from custom.anon_submission sub where sub.booking_ref = p_booking_ref;
  if not found then
    raise exception 'That link does not name an appointment.'
      using errcode = '23503',
            hint = 'It may have been mistyped, or the appointment may have been removed.';
  end if;
  perform custom.assert_store_door(v_s.organization_id, 'custom.booking_reschedule');
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'That link is a form response, not an appointment.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select r.data into v_doc from custom.record r
   where r.organization_id = v_s.organization_id and r.id = v_s.record_id and r.deleted_at is null;
  if v_doc is null then
    booking_ref := p_booking_ref; record_id := null; slot_key := null; slot_at := null;
    state := 'held';
    message := 'Your details are still waiting for someone to confirm them, so there is nothing to move yet.';
    return next; return;
  end if;
  if coalesce(v_doc ->> 'status', 'booked') = 'cancelled' then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := null; slot_at := null;
    state := 'cancelled';
    message := 'This appointment was cancelled, so there is nothing to move. Book a new time on the booking page.';
    return next; return;
  end if;
  v_old := v_doc ->> 'slot';

  if p_slot_key = v_old then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
    slot_at := v_old::timestamptz; state := 'unchanged';
    message := 'That is the time you already have, so nothing was moved.';
    return next; return;
  end if;

  select true, s.member_user_id into v_found, v_who
    from custom._booking_slots(v_b, null) s where s.slot_key = p_slot_key limit 1;
  if not coalesce(v_found, false) then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
    slot_at := v_old::timestamptz; state := 'not_offered';
    message := 'That time is not one this page offers, so your appointment was not moved. Pick one of the times shown.';
    return next; return;
  end if;

  v_at := p_slot_key::timestamptz;
  v_end := v_at + make_interval(mins => (v_b ->> 'slot_minutes')::integer);

  -- THE NEW HOLD IS TAKEN BEFORE THE OLD ONE IS LET GO. The other order frees a slot,
  -- loses the race for the new one, and leaves a booking with no time at all.
  select * into v_oldrow from custom.record r
   where r.organization_id = v_s.organization_id and r.table_id = v_slots
     and r.deleted_at is null and r.data ->> 'slot_key' = coalesce(v_old, '')
   limit 1;

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;

  begin
    begin
      v_new := (custom.work_slot_hold(v_s.organization_id, v_slots, p_slot_key,
                                      coalesce(v_oldrow.data ->> 'holder', 'visitor'),
                                      make_interval(mins => 15)) ->> 'hold_id')::uuid;
    exception when unique_violation then
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
      slot_at := v_old::timestamptz; state := 'taken';
      message := 'Somebody took that time a moment before you did, so your appointment was not moved and you still have the time you had. Pick another.';
      return next; return;
    end;

    -- BOTH HALVES, IN ONE TRANSACTION. The record's time and the calendar hold are the
    -- same fact said twice, and a move that changed one of them would be a booking the
    -- calendar disagrees with.
    perform custom.record_update(v_s.organization_id, v_new, jsonb_build_object(
      'expires_at', to_char(v_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      '_actor', 'system'));
    if v_oldrow.id is not null then
      perform custom.work_slot_release(v_s.organization_id, v_oldrow.id);
    end if;
    perform custom.record_update(v_s.organization_id, v_s.record_id, jsonb_build_object(
      'slot', p_slot_key, 'status', 'booked',
      'booked_with', coalesce(v_who::text, ''), '_actor', 'system'));
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  perform custom.booking_notify(v_s.organization_id, v_f.id, v_s.record_id, v_s.id,
                                'moved', to_char(v_at at time zone (v_b ->> 'timezone'),
                                                 'FMDay FMDD FMMonth at FMHH12:MIam'));

  booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := p_slot_key;
  slot_at := v_at; state := 'moved'; message := null;
  return next;
end;
$fn$;

create or replace function custom.booking_cancel(p_booking_ref text, p_origin text default null)
returns table(booking_ref text, record_id uuid, slot_key text, state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_s     custom.anon_submission;
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_doc   jsonb;
  v_old   text;
  v_row   custom.record;
  v_held  text;
  v_stood boolean := false;
begin
  if p_booking_ref is null then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  select * into v_s from custom.anon_submission sub where sub.booking_ref = p_booking_ref;
  if not found then
    raise exception 'That link does not name an appointment.' using errcode = '23503';
  end if;
  perform custom.assert_store_door(v_s.organization_id, 'custom.booking_cancel');
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'That link is a form response, not an appointment.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select r.data into v_doc from custom.record r
   where r.organization_id = v_s.organization_id and r.id = v_s.record_id and r.deleted_at is null;
  if v_doc is null then
    booking_ref := p_booking_ref; record_id := null; slot_key := null; state := 'held';
    message := 'Your details are still waiting for someone to confirm them, so there is no appointment to cancel.';
    return next; return;
  end if;
  if coalesce(v_doc ->> 'status', 'booked') = 'cancelled' then
    booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_doc ->> 'slot';
    state := 'cancelled';
    message := 'This appointment was already cancelled, so nothing changed.';
    return next; return;
  end if;
  v_old := v_doc ->> 'slot';

  select * into v_row from custom.record r
   where r.organization_id = v_s.organization_id and r.table_id = v_slots
     and r.deleted_at is null and r.data ->> 'slot_key' = coalesce(v_old, '')
   limit 1;

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;
  begin
    -- THE BOOKING IS KEPT AND MARKED, NEVER DELETED. A cancelled appointment is something
    -- the owner has to be able to see, count and chase; deleting it would make an hour
    -- that was lost look like an hour nobody asked for.
    perform custom.record_update(v_s.organization_id, v_s.record_id,
                                 jsonb_build_object('status', 'cancelled', '_actor', 'system'));
    if v_row.id is not null then
      perform custom.work_slot_release(v_s.organization_id, v_row.id);
    end if;
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  perform custom.booking_notify(
    v_s.organization_id, v_f.id, v_s.record_id, v_s.id, 'cancelled',
    coalesce(to_char(v_old::timestamptz at time zone (v_b ->> 'timezone'),
                     'FMDay FMDD FMMonth at FMHH12:MIam'), 'an unknown time'));

  booking_ref := p_booking_ref; record_id := v_s.record_id; slot_key := v_old;
  state := 'cancelled'; message := 'This appointment is cancelled and that time is free again.';
  return next;
end;
$fn$;
