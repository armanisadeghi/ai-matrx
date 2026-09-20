-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) 84500733a5459e563449268c8ee39804cf0cef7a9ffb07128ed6f070e99d7668
--
-- LANE BOOKING — DEFECT 1, FOUND BY RUNNING IT.
--
-- `custom.booking_declare` could not put a booking page over a Table that did not already
-- have a `slot` column, which is EVERY Table anybody would put one over. The three lines
-- that add the store's own columns to the caller's field list read
--
--     v_keys := v_keys || 'slot';
--
-- and an untyped literal on the right of `||` against a `text[]` is read by Postgres as an
-- ARRAY literal, not as one element: `malformed array literal: "slot"`, raised at the first
-- of the three, every time. The door declared the Field correctly and then died on the next
-- statement — so the failure was not "a booking page could not be made", it was "a booking
-- page could not be made and a half-built Table was left behind".
--
-- THE CLASS. An untyped literal appended to an array is the same defect wherever it appears,
-- and it is invisible until the branch runs, because the other arm (`v_keys` already
-- containing the key) skips the line entirely. This file casts all three.

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
    v_keys := v_keys || 'slot'::text;
  end if;
  if not ('status' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'status', 'label', 'Status', 'type', 'text', 'required', false, 'sort', 910));
    v_keys := v_keys || 'status'::text;
  end if;
  if not ('booked_with' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'booked_with', 'label', 'With', 'type', 'text', 'required', false, 'sort', 920));
    v_keys := v_keys || 'booked_with'::text;
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
