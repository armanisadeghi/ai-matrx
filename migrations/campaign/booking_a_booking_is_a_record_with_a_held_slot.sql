-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE BOOKING — PRODUCTS row 14, *"Let clients book a 30-minute consult."*
-- The primitive is P9: a SLOT HOLD WITH ATOMIC REFUSAL. Champions: Calendly and Cal.com.
--
-- WHAT WAS ALREADY THERE, AND WHY THIS FILE COMPOSES RATHER THAN BUILDS
-- --------------------------------------------------------------------
-- REC-71 (`custom.work_slots_declare`, `work_slot_hold`, `work_slot_holds`,
-- `work_slot_release`, `work_slot_expire`) is the slot hold, and it is already decided
-- by a UNIQUE INDEX on a promoted `slot_key` field — the database refuses the second
-- hold and NAMES the index that did it. DOOR-17 (`custom.anon_form`, `form_declare`,
-- `form_public`, `form_submit`, `anon_clear`, `anon_rate_take`, the honeypot, the
-- submission cap, the quarantine and `form_notify`) is the public link, the stranger's
-- write and the notification. DOOR-18 (`custom.agg_subscriptions` / `custom.agg_deliver`)
-- is the subscription. NONE of that is rebuilt here.
--
-- SEVEN DECISIONS, EACH WITH ITS REASON
-- -------------------------------------
-- 1. A BOOKING PAGE IS A FORM, NOT A SECOND PUBLISHED SURFACE. It is a row of
--    `custom.anon_form` whose `presentation -> 'booking'` carries the availability and
--    the id of the slots Table. Every property a booking link needs — closed by default,
--    an unguessable 122-bit id, a honeypot, a rate limit, a submission cap, an accept
--    Rule, a notify Rule, a versioned presentation — already exists there and is already
--    proven. A parallel `custom.booking_page` table would be a second form store that
--    starts the day it lands one bug-fix behind the first one.
--
-- 2. A BOOKING IS A RECORD IN THE ORGANIZATION'S OWN TABLE. Not a row in a bookings
--    silo: the visitor's answers land through `custom.form_submit` exactly as any other
--    form answer does, with `_source.via = 'form'`, the form id and the moment in their
--    provenance. That is what lets the agent reschedule, chase and report on a booking
--    with the same eight verbs it uses for everything else — which is the whole of
--    PRODUCTS row 14's "AI-first version" column.
--
-- 3. THE CALENDAR HOLD IS THE SLOT HOLD. There is no second calendar. A confirmed
--    booking is a `custom.work_slot_hold` row whose expiry is the END OF THE
--    APPOINTMENT rather than fifteen minutes away, so "is that hour free" has ONE
--    answer, given by one unique index, to the picker and to the owner alike. A
--    separate calendar object would be the first thing to disagree with the bookings
--    table, and a booking system whose calendar disagrees with its bookings is worse
--    than no booking system.
--
-- 4. THE ORDER IS HOLD FIRST, DETAILS SECOND, and the doors enforce it:
--    `custom.booking_hold` is a separate act from `custom.booking_confirm`, and confirm
--    REFUSES a hold that is not live and is not the caller's. Taking the details first
--    and holding after is how two people fill in a form and one of them finds out at
--    the end. Calendly and Cal.com both hold first.
--
-- 5. THE SLOTS ARE COMPUTED BY THE STORE, NEVER BY THE BROWSER. A picker that built its
--    own grid would let a visitor with a wrong clock — or a visitor with a console —
--    ask for a time outside the offered hours, inside the lead time, or past the daily
--    cap. `custom._booking_slots` is the one generator, `custom.booking_public` offers
--    what it produces and `custom.booking_hold` checks the asked-for key against the
--    SAME function before it holds anything. The visitor's timezone is a display
--    concern; the offer is the organization's.
--
-- 6. AVAILABILITY IS A KNOB WITH A DEFAULT, NEVER A QUESTION. Start hour, end hour,
--    slot length, buffer, lead time, appointments per day, timezone, how far ahead, and
--    which member each window belongs to are the organization's opinion, and an
--    organization that says nothing gets weekdays 09:00–17:00 in UTC, 30-minute slots,
--    no buffer, two hours' notice, eight a day, fourteen days out.
--
-- 7. THE VISITOR'S OWN LINK IS A SECOND CAPABILITY. `custom.anon_submission.booking_ref`
--    is 128 unguessable bits minted at confirm and handed back once. It is what
--    reschedule and cancel are reached by, and it is NOT the record id: a person who was
--    sent a confirmation must be able to move their own appointment without an account
--    and without being able to name anybody else's. Cal.com does exactly this.
--
-- WHAT `slot`, `status` AND `booked_with` ARE, AND WHY THEY ARE HIDDEN QUESTIONS
-- -----------------------------------------------------------------------------
-- The three are real Fields of the bookings Table and real questions of the form, marked
-- `"hidden": true` in the presentation. They are questions so that `custom.form_submit`'s
-- own scope check admits them — that door refuses by name any key a form does not ask
-- for, and rightly. They are hidden so the visitor never sees them. And
-- `custom.booking_confirm` REFUSES a payload that names any of the three itself, so the
-- values come from the HOLD and from the store, never from the browser. The alternative
-- — writing the record through the form and patching the slot onto it a moment later —
-- puts a booking in the table with no time on it and fires the owner's notification
-- about it, which is a booking that lost its slot.

-- ─────────────────────────────────────────────────────────────────────────────
-- The visitor's own link. Additive, and unique per organization.
-- ─────────────────────────────────────────────────────────────────────────────

alter table custom.anon_submission add column if not exists booking_ref text;

create unique index if not exists anon_submission_booking_ref_key
  on custom.anon_submission (organization_id, booking_ref)
  where booking_ref is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom._booking_availability — the organization's opinion, normalised and checked
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom._booking_availability(p_organization_id uuid, p_raw jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_in    jsonb := coalesce(p_raw, '{}'::jsonb);
  v_tz    text  := coalesce(nullif(btrim(v_in ->> 'timezone'), ''), 'UTC');
  v_len   integer := coalesce((v_in ->> 'slot_minutes')::integer, 30);
  v_buf   integer := coalesce((v_in ->> 'buffer_minutes')::integer, 0);
  v_lead  integer := coalesce((v_in ->> 'lead_minutes')::integer, 120);
  v_cap   integer := coalesce((v_in ->> 'max_per_day')::integer, 8);
  v_days  integer := coalesce((v_in ->> 'days')::integer, 14);
  v_wins  jsonb := v_in -> 'windows';
  v_out   jsonb := '[]'::jsonb;
  w       jsonb;
  v_wd    integer;
  v_from  time;
  v_to    time;
  v_who   uuid;
begin
  -- THE TIMEZONE IS ASKED OF POSTGRES, not matched against a list we would have to keep.
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'There is no timezone called "%", so no hours could be offered in it.', v_tz
      using errcode = '22023',
            hint = 'Use an IANA name such as America/Chicago, Europe/London or UTC. This is the organization''s own timezone — the visitor''s browser shows the same moment in theirs.';
  end;

  if v_len < 5 or v_len > 480 then
    raise exception 'A % minute appointment is not a length this offers.', v_len
      using errcode = '22023', hint = 'Slot length is between 5 minutes and 8 hours.';
  end if;
  if v_buf < 0 or v_buf > 480 then
    raise exception 'A gap of % minutes between appointments is not a gap.', v_buf
      using errcode = '22023', hint = 'The buffer is between 0 and 480 minutes.';
  end if;
  if v_lead < 0 or v_lead > 43200 then
    raise exception 'Asking for % minutes of notice is not notice.', v_lead
      using errcode = '22023', hint = 'Lead time is between 0 minutes and 30 days.';
  end if;
  if v_cap < 1 or v_cap > 100 then
    raise exception '% appointments a day is not a limit anybody meant.', v_cap
      using errcode = '22023', hint = 'Between 1 and 100 a day.';
  end if;
  if v_days < 1 or v_days > 90 then
    raise exception 'Offering % days ahead is not a window.', v_days
      using errcode = '22023', hint = 'Between 1 and 90 days ahead.';
  end if;

  -- NO WINDOWS MEANS THE DEFAULT, not an empty calendar. An organization that said
  -- nothing about its hours is offering its working week, and a booking page that
  -- offered nothing would look broken rather than unconfigured.
  if jsonb_typeof(v_wins) is distinct from 'array' or jsonb_array_length(v_wins) = 0 then
    v_wins := jsonb_build_array(
      jsonb_build_object('weekday', 1, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 2, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 3, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 4, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 5, 'from', '09:00', 'to', '17:00'));
  end if;

  for w in select value from jsonb_array_elements(v_wins) loop
    v_wd := (w ->> 'weekday')::integer;
    if v_wd is null or v_wd < 0 or v_wd > 6 then
      raise exception 'A window has to name a day of the week, and this one says %.',
                      coalesce(w ->> 'weekday', 'nothing')
        using errcode = '22023',
              hint = '0 is Sunday and 6 is Saturday, the same numbering the database uses.';
    end if;
    begin
      v_from := (w ->> 'from')::time;
      v_to   := (w ->> 'to')::time;
    exception when others then
      raise exception 'A window on day % does not give an hour it starts and an hour it ends.', v_wd
        using errcode = '22023', hint = 'Each window is {"weekday": 1, "from": "09:00", "to": "17:00"}.';
    end;
    if v_to <= v_from then
      raise exception 'A window on day % ends at % and starts at %, so nothing fits in it.',
                      v_wd, v_to, v_from
        using errcode = '22023', hint = 'The end has to be later in the day than the start.';
    end if;

    -- A WINDOW MAY BELONG TO ONE MEMBER — that is the "with whom" of a booking. Somebody
    -- who is not in this organization cannot be booked in its name.
    v_who := nullif(btrim(coalesce(w ->> 'member_user_id', '')), '')::uuid;
    if v_who is not null and not exists (
         select 1 from iam.memberships m
          where m.organization_id = p_organization_id and m.user_id = v_who
            and m.deleted_at is null and coalesce(m.status, 'active') = 'active') then
      raise exception 'Nobody with the id % is a member of this organization, so their hours cannot be offered.', v_who
        using errcode = '23503',
              hint = 'A window either names a member of this organization or names nobody, in which case the booking is with the organization.';
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'weekday', v_wd,
      'from', to_char(v_from, 'HH24:MI'),
      'to', to_char(v_to, 'HH24:MI'),
      'member_user_id', v_who));
  end loop;

  return jsonb_build_object(
    'timezone', v_tz, 'slot_minutes', v_len, 'buffer_minutes', v_buf,
    'lead_minutes', v_lead, 'max_per_day', v_cap, 'days', v_days, 'windows', v_out);
end;
$fn$;

comment on function custom._booking_availability(uuid, jsonb) is
  'BOOKING / P9: the organization''s availability, normalised and refused BY NAME when it is impossible. Internal — it is the one place the defaults live, so the picker, the hold door and the agent cannot hold three different ideas of what is on offer.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_booking_availability',
        'p_organization_id uuid, p_raw jsonb',
        array['uuid'::regtype, 'jsonb'::regtype]::oid[],
        'Internal. It reads iam.memberships to refuse a window naming somebody who is not a member, and writes nothing. Its callers have already decided the organization.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'internal: not a door. It normalises one JSON object and is called by custom.booking_declare, custom.booking_public and custom.booking_hold so all three agree.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom._booking_slots — the OFFER. The one generator, in the organization's timezone.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom._booking_slots(p_avail jsonb, p_days integer default null)
returns table(slot_key text, slot_at timestamptz, member_user_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_tz    text    := p_avail ->> 'timezone';
  v_len   integer := (p_avail ->> 'slot_minutes')::integer;
  v_buf   integer := (p_avail ->> 'buffer_minutes')::integer;
  v_lead  integer := (p_avail ->> 'lead_minutes')::integer;
  v_cap   integer := (p_avail ->> 'max_per_day')::integer;
  v_days  integer := least(coalesce(p_days, (p_avail ->> 'days')::integer),
                           (p_avail ->> 'days')::integer);
  v_today date    := (now() at time zone v_tz)::date;
  v_floor timestamptz := now() + make_interval(mins => v_lead);
  d       integer;
  v_date  date;
  w       jsonb;
  v_m     integer;
  v_end   integer;
  v_at    timestamptz;
  v_n     integer;
begin
  for d in 0 .. greatest(coalesce(v_days, 1), 1) - 1 loop
    v_date := v_today + d;
    v_n := 0;
    for w in select value from jsonb_array_elements(p_avail -> 'windows')
              where (value ->> 'weekday')::integer = extract(dow from v_date)::integer
              order by value ->> 'from', value ->> 'to' loop
      -- MINUTES, NOT `time + interval`. Adding an interval to a `time` wraps round
      -- midnight, so a window ending at 23:30 with a 60-minute slot would silently
      -- offer tomorrow morning as today.
      v_m   := extract(hour from (w ->> 'from')::time)::integer * 60
             + extract(minute from (w ->> 'from')::time)::integer;
      v_end := extract(hour from (w ->> 'to')::time)::integer * 60
             + extract(minute from (w ->> 'to')::time)::integer;
      while v_m + v_len <= v_end loop
        exit when v_n >= v_cap;
        v_at := (v_date + make_interval(mins => v_m)) at time zone v_tz;
        -- THE LEAD TIME IS A FLOOR ON THE OFFER, so a slot inside it is never shown and
        -- never held — the hold door asks this same function, so the two cannot differ.
        if v_at >= v_floor then
          slot_key := to_char(v_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
          slot_at := v_at;
          member_user_id := nullif(w ->> 'member_user_id', '')::uuid;
          v_n := v_n + 1;
          return next;
        end if;
        v_m := v_m + v_len + v_buf;
      end loop;
    end loop;
  end loop;
end;
$fn$;

comment on function custom._booking_slots(jsonb, integer) is
  'BOOKING / P9: every slot this availability offers, in the organization''s timezone, past its lead time, inside its daily cap. The ONE generator — custom.booking_public offers what it produces and custom.booking_hold checks against it, so a browser cannot ask for a time that was never offered.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_booking_slots',
        'p_avail jsonb, p_days integer',
        array['jsonb'::regtype, 'int4'::regtype]::oid[],
        'Internal and pure: it reads no table, takes no organization and no principal, and only expands one already-validated availability object into the times it offers.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'internal: not a door. Called by custom.booking_public and custom.booking_hold so the offer and the check are the same computation.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_declare — the owner's side: a Booking page over a Table
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.booking_declare(p_organization_id uuid, p_table_id uuid,
                                       p_title text, p_questions jsonb,
                                       p_availability jsonb default '{}'::jsonb,
                                       p_presentation jsonb default '{}'::jsonb,
                                       p_submission_cap integer default null,
                                       p_quarantine_rule_id uuid default null,
                                       p_notify_rule_id uuid default null,
                                       p_form_id uuid default null,
                                       p_slug text default null,
                                       p_home_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user   uuid := custom.query_principal();
  v_avail  jsonb;
  v_slug   text;
  v_slots  uuid;
  v_made   jsonb;
  v_keys   text[];
  v_q      jsonb;
  v_all    jsonb;
  v_home   uuid;
  v_form   uuid;
  v_t0     timestamptz := clock_timestamp();
  v_hidden integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.booking_declare');
  if v_user is null then
    raise exception 'Nobody is signed in, so no booking page can be made.'
      using errcode = '42501',
            hint = 'custom.booking_declare is the owner''s side. The public side — custom.booking_public, custom.booking_hold and custom.booking_confirm — is the one that has no principal.';
  end if;
  -- A BOOKING PAGE DECIDES WHAT A STRANGER MAY WRITE INTO A TABLE and what hours of an
  -- organization's week are on offer, so it is the same ADMIN act custom.form_declare is.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.booking_declare',
                                          'admin'::public.permission_level, 'table');

  v_avail := custom._booking_availability(p_organization_id, p_availability);

  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no table % in this organization to take bookings into.', p_table_id
      using errcode = '23503',
            hint = 'A booking page is a view on a real Table (SCR-29). Make the Table first — every question is one of its Fields and every booking is one of its records.';
  end if;

  -- THE THREE THE STORE FILLS IN. Declared on the Table if they are not there yet, so a
  -- booking page can be put over a Table that was made for something else.
  if not ('slot' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'slot', 'label', 'Appointment', 'type', 'text', 'required', true, 'sort', 900));
    v_keys := v_keys || 'slot';
  end if;
  if not ('status' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'status', 'label', 'Status', 'type', 'text', 'required', false, 'sort', 910));
    v_keys := v_keys || 'status';
  end if;
  if not ('booked_with' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'booked_with', 'label', 'With', 'type', 'text', 'required', false, 'sort', 920));
    v_keys := v_keys || 'booked_with';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A booking page has to ask the person something — at least who they are.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "required": true}. Name and email are what Calendly and Cal.com ask, and they are the minimum for being able to confirm an appointment with somebody.';
  end if;

  -- The visitor's questions first, in their order, then the three the store fills in.
  v_all := '[]'::jsonb;
  for v_q in select value from jsonb_array_elements(p_questions) loop
    if coalesce(v_q ->> 'field', v_q ->> 'key', '') in ('slot', 'status', 'booked_with') then
      -- Asking a visitor for the time they already picked is how a booking ends up with
      -- two different times on it.
      raise exception 'A booking page never asks for "%": the store fills it in from the slot that was held.',
                      coalesce(v_q ->> 'field', v_q ->> 'key')
        using errcode = '22023',
              hint = 'slot, status and booked_with are set by custom.booking_confirm, custom.booking_reschedule and custom.booking_cancel. Ask for the things only the person knows.';
    end if;
    v_all := v_all || jsonb_build_array(v_q);
  end loop;
  v_all := v_all
    || jsonb_build_array(
         jsonb_build_object('field', 'slot', 'ask', 'The time you picked',
                            'hidden', true, 'required', true),
         jsonb_build_object('field', 'status', 'ask', 'Status', 'hidden', true, 'required', false),
         jsonb_build_object('field', 'booked_with', 'ask', 'With', 'hidden', true, 'required', false));
  v_hidden := 3;

  -- ── the slots Table: ONE per bookings Table, found before it is made ───────────────
  -- Two booking pages over one Table must hold against the SAME slots Table, or each has
  -- its own private idea of what is free and the unique index protects nothing.
  v_slug := 'booking_slots_' || replace(p_table_id::text, '-', '');
  select r.id into v_slots from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug;
  if v_slots is null then
    -- The slots Table lives wherever the bookings Table lives, so the two are found in
    -- one place rather than one of them landing in the default home on its own.
    v_home := p_home_id;
    if v_home is null then
      select nullif(r.data ->> 'parent_id', '')::uuid into v_home from custom.record r
       where r.organization_id = p_organization_id and r.id = p_table_id
         and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
    end if;
    v_made := custom.work_slots_declare(p_organization_id,
                                        'Slots for ' || coalesce(nullif(btrim(p_title), ''), 'bookings'),
                                        v_slug, v_home);
    v_slots := (v_made ->> 'table_id')::uuid;
  end if;

  v_form := custom.form_declare(
    p_organization_id, p_table_id, p_title, v_all,
    coalesce(p_presentation, '{}'::jsonb)
      || jsonb_build_object('booking', v_avail || jsonb_build_object('slot_table_id', v_slots)),
    p_submission_cap, p_quarantine_rule_id, p_notify_rule_id, p_form_id, p_slug);

  return jsonb_build_object(
    'form_id', v_form,
    'slot_table_id', v_slots,
    'availability', v_avail,
    'questions_asked', jsonb_array_length(v_all) - v_hidden,
    'questions_filled_in', v_hidden,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end;
$fn$;

comment on function custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) is
  'BOOKING / SCR-29: create or re-state ONE booking page over one Table — its availability, its slots Table (REC-71''s unique index) and its published surface (DOOR-17''s anon_form). Needs `admin` on the Table. It does NOT publish; custom.anon_publish is still the one act that opens the link.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_declare',
        'p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_availability jsonb, p_presentation jsonb, p_submission_cap integer, p_quarantine_rule_id uuid, p_notify_rule_id uuid, p_form_id uuid, p_slug text, p_home_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype,
              'jsonb'::regtype, 'int4'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype,
              'text'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry. A NULL principal is refused by name, so this door never runs on the server lane. p_table_id is checked by custom.assert_client_may_change at the ADMIN rung against THIS organization, so a table id from another tenant reads as absent. Every question key is matched against that table''s own fields by custom.form_declare and an unknown one is refused by name; a question naming slot, status or booked_with is refused here. p_availability is normalised and refused by custom._booking_availability, which also refuses a window naming a non-member.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_public — the visitor's page: the questions AND what is free
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.booking_public(p_form_id uuid, p_days integer default null)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text,
              presentation jsonb, fields jsonb, honeypot_key text,
              availability jsonb, slots jsonb, state text, message text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f      custom.anon_form;
  v_b      jsonb;
  v_slots  uuid;
  v_count  bigint;
  v_state  text;
  v_msg    text;
  v_fields jsonb;
  v_taken  jsonb;
  v_list   jsonb;
  v_visible text[];
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  -- The same silence custom.form_public keeps, for the same reason: saying WHICH of the
  -- three reasons it is would let a link be used to learn that something is there.
  if not custom.store_is_open(v_f.organization_id) then return; end if;
  if v_f.published_at is null then return; end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then return; end if;
  v_slots := (v_b ->> 'slot_table_id')::uuid;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';

  if v_f.closed_at is not null then
    v_state := 'closed';
    v_msg := 'This booking page is closed, so it is not taking any more appointments.';
  elsif v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    v_state := 'full';
    v_msg := 'This booking page has all the appointments it was set up to take.';
  else
    v_state := 'open';
    v_msg := null;
  end if;

  -- ONLY THE QUESTIONS A PERSON ANSWERS. slot, status and booked_with are the store's.
  select coalesce(array_agg(q ->> 'field'), array[]::text[]) into v_visible
    from jsonb_array_elements(coalesce(v_f.presentation -> 'questions', '[]'::jsonb)) q
   where not coalesce((q ->> 'hidden')::boolean, false);

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data order by ord), '[]'::jsonb)
    into v_fields
    from unnest(v_visible) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  -- WHAT IS TAKEN IS THE STORE'S ANSWER, and a LAPSED hold is not a taken slot: the slot
  -- comes back on its own and nobody has to guess from a clock.
  select coalesce(jsonb_object_agg(r.data ->> 'slot_key', true), '{}'::jsonb) into v_taken
    from custom.record r
   where r.organization_id = v_f.organization_id
     and r.table_id = v_slots
     and r.deleted_at is null
     and coalesce((r.data ->> 'expires_at')::timestamptz, now()) > now();

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.slot_key,
           'at', to_char(s.slot_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'taken', coalesce((v_taken ->> s.slot_key)::boolean, false),
           'member_user_id', s.member_user_id) order by s.slot_key), '[]'::jsonb)
    into v_list
    from custom._booking_slots(v_b, p_days) s;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Book a time'); presentation := v_f.presentation;
  fields := v_fields; honeypot_key := v_f.honeypot_key;
  availability := v_b - 'slot_table_id'; slots := v_list;
  state := v_state; message := v_msg;
  return next;
end;
$fn$;

comment on function custom.booking_public(uuid, integer) is
  'BOOKING / SCR-29: the public face of one published booking page — its own words, the Field definitions of exactly the questions a person answers, and every slot it offers with whether it is taken RIGHT NOW. It reads no booking. Missing, unpublished, not a booking page, and store-switched-off all answer zero rows, which is the 404.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_public',
        'p_form_id uuid, p_days integer',
        array['uuid'::regtype, 'int4'::regtype]::oid[],
        'It takes NO organization id: the form id supplies it, so a caller cannot name a tenant. The form id IS the capability (122 bits of UUIDv4), as in custom.form_public. It reads custom.anon_form, the Field records of exactly the non-hidden questions, and the slots Table''s live holds — never a booking record, and never who holds a slot.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the public booking page is server-rendered and the server is what holds the request. Schema custom is revoked from anon and this door is granted to the server lane alone.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_hold — THE ATOMIC ONE. Two people, one slot, one refusal by name.
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_out := custom.work_slot_hold(v_f.organization_id, v_slots, p_slot_key,
                                   coalesce(nullif(btrim(p_client_key), ''),
                                            nullif(btrim(p_bucket), ''), 'visitor'),
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

comment on function custom.booking_hold(uuid, text, text, text, text) is
  'BOOKING / P9: hold one slot BEFORE the details are taken. The slot is checked against the same generator the picker was drawn from, the hold is REC-71''s custom.work_slot_hold under its unique index, and the loser of a race is told in plain words which is the whole primitive.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_hold',
        'p_form_id uuid, p_slot_key text, p_origin text, p_bucket text, p_client_key text',
        array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id and NO table id: the form id supplies both. In order — the page exists, custom.assert_store_door, published_at is not null, not closed, it is a booking page, the slot is one custom._booking_slots offers, then custom.anon_rate_take on the bucket the SERVER chose. Only then does it stand in as published_by (AGT-N-5) for the single custom.work_slot_hold call and restore the session on every path. It writes nothing but the hold.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the server is what knows the request''s real origin and the client''s address, and a browser handing a door its own rate-limit bucket would be counting itself. Schema custom stays revoked from anon.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_confirm — the details, and the booking becomes a record
-- ─────────────────────────────────────────────────────────────────────────────

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
  if coalesce(v_hold.data ->> 'holder', '') <> coalesce(nullif(btrim(p_client_key), ''),
                                                        nullif(btrim(p_bucket), ''), 'visitor') then
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

comment on function custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text) is
  'BOOKING / SCR-29: the details, once a slot is held. The hold has to be live and the caller''s; the answers go through custom.form_submit so DOOR-17''s honeypot, cap, rate limit, scope, quarantine and notify Rule all apply; the slot travels with them so the record is never seen without its time; and the hold''s expiry is moved to the END of the appointment, which is the calendar hold. Returns the visitor''s own unguessable link.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_confirm',
        'p_form_id uuid, p_hold_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text, p_client_key text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'text'::regtype,
              'text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id and NO table id: the form id supplies both. A payload naming slot, status or booked_with is refused by name. The hold must exist in THIS page''s slots Table, be unexpired, and carry this caller''s own holder key. Everything the answers touch is custom.form_submit''s, whose own row states its checks. The only write outside that door is the hold''s new expiry, made as published_by (AGT-N-5) with the session restored on every path.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the server knows the request''s real origin and the client''s address; a browser handing a door its own rate-limit bucket would be counting itself.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom._booking_release — letting a slot go, as the person who published the page
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom._booking_release(p_organization_id uuid, p_published_by uuid, p_hold_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_held  text;
  v_stood boolean := false;
  v_ok    boolean;
begin
  if p_hold_id is null then return false; end if;
  if custom.query_principal() is null and p_published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', p_published_by, 'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;
  begin
    v_ok := custom.work_slot_release(p_organization_id, p_hold_id);
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    raise;
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
  return v_ok;
end;
$fn$;

comment on function custom._booking_release(uuid, uuid, uuid) is
  'BOOKING: REC-71''s custom.work_slot_release, reached from the public lane by standing in as the page''s publisher (AGT-N-5) and putting the session back on every path, including the exception one.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_booking_release',
        'p_organization_id uuid, p_published_by uuid, p_hold_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'Internal. Its callers have already established the organization from a form id and read published_by from that form''s own row; it forwards one hold id to custom.work_slot_release, which asks the editor rung itself.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'internal: not a door. Called by custom.booking_confirm, custom.booking_reschedule and custom.booking_cancel.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_notify — the page's OWN notify Rule, with the words for a move
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.booking_notify(p_organization_id uuid, p_form_id uuid, p_record_id uuid,
                                      p_submission_id uuid, p_event text, p_when text)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
  s   record;
  v_subject text;
  v_body    text;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found or v_f.notify_rule_id is null then
    return null;
  end if;
  if p_event = 'cancelled' then
    v_subject := format('Cancelled: %s', coalesce(v_f.title, 'an appointment'));
    v_body := format('An appointment booked through %s was cancelled. It was %s, and that time is free again.',
                     coalesce(v_f.title, 'your booking page'), p_when);
  else
    v_subject := format('Moved: %s', coalesce(v_f.title, 'an appointment'));
    v_body := format('An appointment booked through %s was moved. It is now %s, and the old time is free again.',
                     coalesce(v_f.title, 'your booking page'), p_when);
  end if;

  -- THE SAME READER custom.form_notify and custom.agg_subscription_fire use, so a booking
  -- page's notify Rule is an ordinary subscription: the person can see it and switch it
  -- off in the same place as every other one.
  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where rule_id = v_f.notify_rule_id loop
    if s.recipient_user_id is null then
      continue;
    end if;
    return custom.agg_deliver(
      p_organization_id, s.rule_id, p_record_id, s.channel, s.recipient_user_id, s.event_key,
      v_subject, v_body,
      jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug, 'table_id', v_f.table_id,
                         'submission_id', p_submission_id, 'source', 'booking',
                         'event', p_event));
  end loop;
  return null;
end;
$fn$;

comment on function custom.booking_notify(uuid, uuid, uuid, uuid, text, text) is
  'BOOKING / DOOR-18: the page''s own notify Rule, told about a move or a cancellation in those words. A new booking is told by custom.form_notify, from inside custom.form_submit, on the same Rule — so there is one subscription and never two notifications for one act.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_notify',
        'p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid, p_event text, p_when text',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'Internal step of the reschedule and cancel paths, called after the move has already happened. It delivers only to the recipient the page''s own subscription Rule names.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: it is an internal step of the booking path; nothing outside it has a reason to send a booking page''s notification.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_manage — the visitor's own booking, by their own link
-- ─────────────────────────────────────────────────────────────────────────────

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
  select * into v_s from custom.anon_submission where booking_ref = p_booking_ref;
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

comment on function custom.booking_manage(text, integer) is
  'BOOKING: one booking, by the unguessable link its own visitor was given. 128 bits, minted at confirm, and NOT the record id — a person must be able to move their own appointment without an account and without being able to name anybody else''s.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_manage',
        'p_booking_ref text, p_days integer',
        array['text'::regtype, 'int4'::regtype]::oid[],
        'It takes NO organization id, NO form id and NO record id: the 128-bit booking ref supplies all three, and it is unique across the store. It reads exactly the one submission that carries that ref, its form, its record and the slots Table''s live holds. A ref that names nothing answers zero rows.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the manage page is server-rendered and schema custom is revoked from anon.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_reschedule — the record AND the calendar hold move together
-- ─────────────────────────────────────────────────────────────────────────────

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
  select * into v_s from custom.anon_submission where booking_ref = p_booking_ref;
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

comment on function custom.booking_reschedule(text, text, text, text) is
  'BOOKING: move one appointment by its own visitor link. The new hold is taken BEFORE the old one is let go, so a lost race leaves the appointment exactly where it was; the record''s time and the calendar hold move in one transaction; the page''s notify Rule is told in the words of a move.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_reschedule',
        'p_booking_ref text, p_slot_key text, p_origin text, p_bucket text',
        array['text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id and NO record id: the 128-bit booking ref supplies both and reaches exactly one submission. custom.assert_store_door is asked for that organization. The new time must be one custom._booking_slots offers. The two writes are the slots Table''s holds and that one booking record, made as published_by (AGT-N-5) with the session restored on every path including a lost race.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the manage page is server-rendered and schema custom is revoked from anon.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.booking_cancel — the slot goes back on offer
-- ─────────────────────────────────────────────────────────────────────────────

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
  select * into v_s from custom.anon_submission where booking_ref = p_booking_ref;
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

comment on function custom.booking_cancel(text, text) is
  'BOOKING: cancel one appointment by its own visitor link. The record is MARKED cancelled, never deleted — a lost hour is something an owner has to be able to see and count — and the slot hold is released, so the time goes back on offer in the same transaction.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'booking_cancel',
        'p_booking_ref text, p_origin text',
        array['text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id and NO record id: the 128-bit booking ref supplies both. custom.assert_store_door is asked for that organization. It writes exactly two things — status on that one booking record, and the release of that one hold — as published_by (AGT-N-5), with the session restored on every path.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        'server_only: the manage page is server-rendered and schema custom is revoked from anon.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.bookings — the owner's list, with what makes it worth looking at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.bookings(p_organization_id uuid, p_table_id uuid default null)
returns table(form_id uuid, table_id uuid, title text, slug text,
              published_at timestamptz, closed_at timestamptz,
              slot_minutes integer, timezone text, slot_table_id uuid,
              booked bigint, cancelled bigint, upcoming bigint, held bigint,
              next_at timestamptz, state text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.bookings');
  return query
    select f.id, f.table_id, coalesce(f.title, 'Book a time'), f.slug,
           f.published_at, f.closed_at,
           (f.presentation -> 'booking' ->> 'slot_minutes')::integer,
           f.presentation -> 'booking' ->> 'timezone',
           (f.presentation -> 'booking' ->> 'slot_table_id')::uuid,
           coalesce(b.booked, 0), coalesce(b.cancelled, 0), coalesce(b.upcoming, 0),
           coalesce(h.held, 0), b.next_at,
           case when f.closed_at is not null then 'closed'
                when f.published_at is null then 'draft'
                else 'open' end
      from custom.anon_form f
      left join lateral (
        select count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled') as booked,
               count(*) filter (where r.data ->> 'status' = 'cancelled') as cancelled,
               count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                                  and (r.data ->> 'slot')::timestamptz > now()) as upcoming,
               min((r.data ->> 'slot')::timestamptz) filter (
                 where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                   and (r.data ->> 'slot')::timestamptz > now()) as next_at
          from custom.anon_submission s
          join custom.record r
            on r.organization_id = s.organization_id and r.id = s.record_id and r.deleted_at is null
         where s.organization_id = f.organization_id and s.form_id = f.id
           and s.booking_ref is not null) b on true
      left join lateral (
        select count(*) as held from custom.record hr
         where hr.organization_id = f.organization_id
           and hr.table_id = (f.presentation -> 'booking' ->> 'slot_table_id')::uuid
           and hr.deleted_at is null
           and coalesce((hr.data ->> 'expires_at')::timestamptz, now()) > now()) h on true
     where f.organization_id = p_organization_id
       and f.deleted_at is null
       and f.presentation ? 'booking'
       and (p_table_id is null or f.table_id = p_table_id)
       -- THE WALL. A booking page is only listed to somebody who may already open the
       -- Table it books into; the list can never reveal a Table.
       and custom.my_level(p_organization_id, f.table_id, 'table') is not null
     order by f.published_at desc nulls last, f.slug;
end;
$fn$;

comment on function custom.bookings(uuid, uuid) is
  'BOOKING / SCR-29: an organization''s booking pages with the counts that make the list worth opening — booked, cancelled, still to come, slots held right now, and when the next appointment is. Narrowed to Tables the caller can already open, so it never reveals a Table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'bookings',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'custom.assert_client_may_reach names the wall on entry, so somebody in the wrong organization is told THAT. Every row is then filtered by custom.my_level on the booking''s own Table, so a page over a Table the caller cannot open is not listed at all — the list cannot be used to learn that a Table exists.',
        'booking_a_booking_is_a_record_with_a_held_slot.sql',
        null, true, false)
on conflict do nothing;
