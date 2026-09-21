-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) d697a256983e81e0be96a0f672569249b11580b56e3aa063d3747d7066dc4092
--
-- A BOOKING PAGE THAT COULD NEVER WRITE AN APPOINTMENT, PUBLISHED ANYWAY.
--
-- WHAT THE SECOND BROWSER WALK FOUND (lane BUILDERS, 2026-09-21). Ironclad
-- Mobile Mechanic built a 30-minute on-site diagnostic page over his own
-- `Service Calls` table — 38 real calls in it — and published it. A customer
-- opened the link, was offered 176 free times, picked one, and her slot was
-- held. Then `custom.booking_confirm` refused her:
--
--     Status does not have a choice called "booked".
--
-- His `status` column is a CHOICE LIST (Scheduled · Completed · Cancelled),
-- which is what a real table that was made for something else looks like, and
-- the store writes the literal words `booked` and `cancelled` onto an
-- appointment. So the page could never have written one. She lost the booking,
-- the slot stayed held, and nobody was told.
--
-- THE REFUSAL WAS RIGHT AND IT ARRIVED IN THE WRONG PLACE. Whether this Table
-- can hold a booking at all is knowable when the page is DECLARED. From today
-- `custom.booking_declare` decides it there — once, for the person building the
-- page, with the remedy named and the choices that DO exist listed — instead of
-- once per visitor, after a hold, at the last step.
--
-- It only fires on a `status` that is a choice list. A plain text status, and
-- the one this door declares itself when a Table has none, are untouched.
--
-- THE INVERSE: `migrations/inverse/builders_a_booking_page_that_can_never_write_down_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- A STATUS THAT CANNOT HOLD THE WORDS THIS PAGE WILL WRITE (walk 2, 2026-09-21).
  --
  -- The three columns above are declared as plain text when the Table has none.
  -- But a Table made for something else usually ALREADY has a `status`, and on
  -- a real one it is a CHOICE LIST — Ironclad Mobile Mechanic's Service Calls
  -- offers Scheduled, Completed, Cancelled and nothing else. This door reused
  -- it happily, the page published, a customer picked a time, her slot was
  -- HELD, and `custom.booking_confirm` was then refused at the last step with
  -- "Status does not have a choice called \"booked\"." She lost the booking and
  -- the owner never heard about it.
  --
  -- The refusal was right and it arrived in the wrong PLACE. Whether this Table
  -- can hold a booking is knowable when the page is DECLARED, so it is decided
  -- here — once, with the remedy named and the choices that do exist listed —
  -- rather than once per visitor, after a hold, at the end.
  -- ─────────────────────────────────────────────────────────────────────────
  declare
    v_opts   uuid;
    v_words  text[];
    v_missing text[] := array[]::text[];
  begin
    select nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid into v_opts
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'key' = 'status'
       and nullif(f.data ->> 'table_id', '')::uuid = p_table_id
     limit 1;

    if v_opts is not null then
      -- A CHOICE ROW IS AN ORDINARY RECORD AND ITS WORD LIVES IN `title` —
      -- reading `name`/`label` first found nothing on every real choices Table
      -- and would have refused a Table that CAN hold the words. Caught before
      -- it ever refused anybody (lane BUILDERS, 2026-09-21).
      select array_agg(lower(btrim(coalesce(c.data ->> 'title', c.data ->> 'name', c.data ->> 'label', ''))))
        into v_words
        from custom.record c
       where c.organization_id = p_organization_id
         and c.table_id = v_opts
         and c.deleted_at is null;
      v_words := coalesce(v_words, array[]::text[]);

      if not ('booked' = any (v_words)) then
        v_missing := v_missing || 'booked';
      end if;
      if not ('cancelled' = any (v_words)) then
        v_missing := v_missing || 'cancelled';
      end if;

      if array_length(v_missing, 1) is not null then
        raise exception 'This table''s Status is a list of choices, and it has no choice called %.',
                        array_to_string(v_missing, ' or ')
          using errcode = '23514',
                hint = format(
                  'A booking page writes "booked" onto an appointment when somebody takes a time and "cancelled" when they give it back, so Status has to be able to hold both words. Its choices today are: %s. Add the missing ones to that list and make the page again — otherwise a visitor would pick a time, hold it, and be refused at the last step.',
                  case when array_length(v_words, 1) is null then '(none)'
                       else array_to_string(v_words, ', ') end);
      end if;
    end if;
  end;

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
