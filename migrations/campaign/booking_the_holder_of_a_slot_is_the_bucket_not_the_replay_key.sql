-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.booking_hold(uuid, text, text, text, text) 66356f8fba18637e58ae2394a48f12ea8c5f65b58db51043c79a1ed904d513cc
-- based-on: custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text) 6741db1ca8a4ca7c08f89d216e813080ee0332d3ba69e33941856b786318159f
--
-- LANE BOOKING — DEFECT 2, FOUND BY WALKING IT: NOBODY COULD EVER CONFIRM THEIR OWN HOLD.
--
-- `custom.booking_hold` wrote the holder as `coalesce(client_key, bucket, 'visitor')` and
-- `custom.booking_confirm` compared the same expression. That looks symmetrical and is not,
-- because THE CLIENT KEY IS NOT AN IDENTITY: it is the per-submission replay key that
-- `custom.form_submit` uses to make a resend idempotent, and a browser that reused the same
-- one across the hold and the confirm would be asking the form door to treat its booking as
-- a duplicate of itself. So a real visitor sends one string when holding and a different one
-- when confirming, and every single confirm was refused with *"That time is being held by
-- somebody else"* — by the person who was holding it. Measured on the main database, 2026-09-20.
--
-- WHAT THE HOLDER IS INSTEAD: THE BUCKET, and the bucket is the SERVER'S. It is the coarse
-- client identifier the route handler chooses — the same one `custom.anon_rate_take` is
-- already budgeted against — so it is stable across the two requests and a browser cannot
-- choose it for itself. A browser choosing its own holder is a browser holding anybody's slot.
--
-- IT IS STILL TWO SECRETS, NOT ONE. The hold id is 122 unguessable bits and has to be
-- presented as well, so knowing a bucket is not enough and neither is knowing a hold id.
-- Cal.com treats its reservation uid alone as the capability; this is that plus the bucket.
--
-- THE CLASS: a value that changes per request can never be an identity, however symmetrical
-- the two expressions look. The census is the other doors that compare a caller to a stored
-- string — `custom.form_submit`'s own `client_key` use is IDEMPOTENCY and is correct, and it
-- is the only other one in the booking path.

create or replace function custom.booking_hold(p_form_id uuid, p_slot_key text, p_origin text,
                                    p_bucket text, p_client_key text default null)
returns table(hold_id uuid, slot_key text, expires_at timestamptz,
              member_user_id uuid, state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_who   uuid;
  v_found boolean := false;
  v_held  text;
  v_stood boolean := false;
  v_out   jsonb;
  v_ttl   interval;
begin
  if p_form_id is null then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This booking page is not available.'
      using errcode = '23503',
            hint = 'The link names no booking page. It may have been mistyped, or it may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.booking_hold');
  if v_f.published_at is null then
    raise exception 'This booking page is not taking appointments.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be booked, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'closed';
    message := 'This booking page is closed, so it is not taking any more appointments.';
    return next; return;
  end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'This link is a form, not a booking page, so there is no time to hold.'
      using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;
  v_ttl := make_interval(mins => coalesce((v_b ->> 'hold_minutes')::integer, 15));

  -- THE SLOT HAS TO BE ONE THIS PAGE ACTUALLY OFFERS. The same generator the picker was
  -- drawn from, asked again here — so a key typed into a console, a time inside the lead
  -- time, and a time past the daily cap are all refused in exactly the same sentence.
  select true, s.member_user_id into v_found, v_who
    from custom._booking_slots(v_b, null) s
   where s.slot_key = p_slot_key
   limit 1;
  if not coalesce(v_found, false) then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'not_offered';
    message := 'That time is not one this page offers. Pick one of the times shown — the list is the offer, and it moves as appointments are taken.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose. Holding is a write, and a hold is
  -- what takes a slot away from everybody else, so it is budgeted like a submission.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := null;
    state := 'too_many';
    message := 'That is more times than this page holds in one go. Try again in a little while.';
    return next; return;
  end;

  -- ── AGT-N-5: the principal of an unattended run is the person who set it up ───────
  -- custom.work_slot_hold asks custom.assert_client_may_change, which reads auth.uid().
  -- A stranger has no principal, so this door stands in as the publisher — whom
  -- custom.anon_publish already required to hold ADMIN on the Table — for that one call,
  -- and puts the session back on every path including the exception one.
  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;

  begin
    -- THE HOLDER IS THE BUCKET, AND THE BUCKET IS THE SERVER'S. See this file's header.
    v_out := custom.work_slot_hold(v_f.organization_id, v_slots, p_slot_key,
                                   coalesce(nullif(btrim(p_bucket), ''), 'visitor'),
                                   v_ttl);
  exception
    when unique_violation then
      -- THE LOSING HALF OF A RACE, AND THE DATABASE DECIDED IT. REC-71's unique index
      -- refused the second hold; this is that refusal translated into a sentence a person
      -- can act on. It is NOT a spinner, NOT the next slot chosen for them, and NOT a
      -- booking they believe they have.
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      hold_id := null; slot_key := p_slot_key; expires_at := null; member_user_id := v_who;
      state := 'taken';
      message := 'Somebody took that time a moment before you did, so it is no longer free. Nothing was booked — pick another time and the rest of your details are still here.';
      return next; return;
    when others then
      if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
      raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  hold_id := (v_out ->> 'hold_id')::uuid;
  slot_key := p_slot_key;
  expires_at := (v_out ->> 'expires_at')::timestamptz;
  member_user_id := v_who;
  state := 'held';
  message := null;
  return next;
end;
$fn$;

create or replace function custom.booking_confirm(p_form_id uuid, p_hold_id uuid, p_origin text,
                                       p_payload jsonb, p_bucket text,
                                       p_honeypot text default null,
                                       p_client_key text default null)
returns table(booking_ref text, record_id uuid, submission_id uuid, slot_key text,
              slot_at timestamptz, state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f     custom.anon_form;
  v_b     jsonb;
  v_slots uuid;
  v_hold  custom.record;
  v_key   text;
  v_who   uuid;
  v_ref   text;
  v_sub   record;
  v_held  text;
  v_stood boolean := false;
  v_end   timestamptz;
  v_at    timestamptz;
  v_dup   text;
begin
  if p_form_id is null then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This booking page is not available.' using errcode = '23503';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.booking_confirm');
  v_b := v_f.presentation -> 'booking';
  if v_b is null then
    raise exception 'This link is a form, not a booking page.' using errcode = '23503';
  end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  -- THE THREE THE STORE FILLS IN ARE REFUSED FROM THE BROWSER, by name. Otherwise the
  -- time on the record and the time that was held could be two different times.
  for v_dup in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if v_dup in ('slot', 'status', 'booked_with') then
      raise exception 'A booking never sends "%": it comes from the time that was held.', v_dup
        using errcode = '42501',
              hint = 'slot, status and booked_with are the store''s. Send only the answers to the questions the page asked.';
    end if;
  end loop;

  -- THE HOLD IS THE RIGHT TO THIS SLOT, and it has to be live and it has to be this
  -- caller's. A confirm with somebody else's hold id would book their slot in your name.
  select * into v_hold from custom.record r
   where r.organization_id = v_f.organization_id
     and r.table_id = v_slots
     and r.id = p_hold_id
     and r.deleted_at is null;
  if not found then
    booking_ref := null; record_id := null; submission_id := null; slot_key := null;
    slot_at := null; state := 'hold_lost';
    message := 'The time you were holding was let go before you sent your details, so nothing was booked. Pick a time again — it takes a moment and your answers are still here.';
    return next; return;
  end if;
  if coalesce((v_hold.data ->> 'expires_at')::timestamptz, now()) <= now() then
    booking_ref := null; record_id := null; submission_id := null;
    slot_key := v_hold.data ->> 'slot_key'; slot_at := null; state := 'hold_expired';
    message := 'The time you were holding ran out before you sent your details, so nothing was booked. Pick a time again.';
    return next; return;
  end if;
  -- THE BUCKET, NOT THE CLIENT KEY. See this file's header: the client key is a
  -- per-submission replay key and is a DIFFERENT string on the confirm than it was on the
  -- hold, so comparing it refused every real browser its own hold.
  if coalesce(v_hold.data ->> 'holder', '') <> coalesce(nullif(btrim(p_bucket), ''), 'visitor') then
    raise exception 'That time is being held by somebody else, so it cannot be booked from here.'
      using errcode = '42501',
            hint = 'A hold belongs to whoever took it. Pick a time on this page and it will be held for you.';
  end if;

  v_key := v_hold.data ->> 'slot_key';
  v_at := v_key::timestamptz;
  select s.member_user_id into v_who from custom._booking_slots(v_b, null) s
   where s.slot_key = v_key limit 1;

  -- THE ANSWERS GO THROUGH THE FORM DOOR — the honeypot, the idempotency, the cap, the
  -- rate limit, the scope check, the required check, the quarantine, the accept Rule and
  -- the notify Rule are DOOR-17's and are not rebuilt here. The slot travels WITH the
  -- answers, so the record is complete the first time anybody sees it.
  select * into v_sub from custom.form_submit(
    p_form_id, p_origin,
    coalesce(p_payload, '{}'::jsonb)
      || jsonb_build_object('slot', v_key, 'status', 'booked',
                            'booked_with', coalesce(v_who::text, '')),
    p_bucket, p_honeypot, p_client_key);

  if v_sub.record_id is null then
    -- HELD, REJECTED, CLOSED OR FULL — the store's own sentence, and the slot is let go
    -- rather than kept by somebody who does not have a booking.
    if v_sub.state in ('closed', 'full', 'too_many') then
      perform custom._booking_release(v_f.organization_id, v_f.published_by, p_hold_id);
    end if;
    booking_ref := null; record_id := null; submission_id := v_sub.submission_id;
    slot_key := v_key; slot_at := v_at; state := v_sub.state;
    message := coalesce(v_sub.message,
      'Your details were sent and are waiting for someone to confirm them, so this time is not yours yet. Whoever owns this page will be in touch.');
    return next; return;
  end if;

  -- ── THE CALENDAR HOLD. The same hold, kept until the appointment is OVER ───────────
  -- REC-71's sweep frees a hold when its expiry passes, so a booking's hold simply
  -- expires at the end of its own appointment. There is no second calendar to disagree
  -- with the bookings table.
  v_end := v_at + make_interval(mins => (v_b ->> 'slot_minutes')::integer);
  v_ref := encode(extensions.gen_random_bytes(16), 'hex');

  if custom.query_principal() is null and v_f.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;
  begin
    perform custom.record_update(v_f.organization_id, p_hold_id, jsonb_build_object(
      'expires_at', to_char(v_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      '_actor', 'system'));
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  update custom.anon_submission
     set booking_ref = v_ref
   where organization_id = v_f.organization_id and id = v_sub.submission_id;

  booking_ref := v_ref; record_id := v_sub.record_id; submission_id := v_sub.submission_id;
  slot_key := v_key; slot_at := v_at; state := 'booked'; message := null;
  return next;
end;
$fn$;
