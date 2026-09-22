-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.form_public(uuid) 44f021cb12481b159ec34b16b644cb30ba5306b981f37b86af366f81d15f0627
-- based-on: custom.booking_public(uuid, integer) a7d11452cb5a651fe3148ce360fe1ba32bee4e9fba5c838bf3575979837742e1
-- based-on: custom.booking_manage(text, integer) 16d5516babfb2d4a14ab1045f6d71342d37a585efecdd07ba45a7604844bb396
-- based-on: custom.capture_open(uuid, uuid) 23bdbaa08a449b2fdd1febcb05493978f7153fbb58854046e646c64f80577868
-- based-on: custom.portal_public(text) 701556a96f645999b4b42c11468f064f3627e01a87556beda27be4cb1348f433
-- based-on: custom.sign_request_public(text, text) 4b9f6b56b63c0caea7b4adc65760927ce15d4b00286902d0c6f985d82bc16f62
-- based-on: custom.store_is_open(uuid) feaf62af3f55200436468b414ef8b116bb8382f5edc0ec8d7d40f13a006af13b
--
-- STORE-OFF — A PUBLISHED LINK IN A STORE-OFF ORGANIZATION SAYS SO, INSTEAD OF ANSWERING 404.
--
-- FIX-10A wrote the defect down rather than fixing it, and its own census is the evidence:
-- of the 17 published forms on the main database, three answered 404 and all three belonged
-- to ONE organization whose record store is switched off. Nothing was broken about those
-- links. Their owner published them, was handed a URL, sent it to her customers, and every
-- one of those customers met a dead end that said the page did not exist.
--
-- 🚨 WHAT WAS ACTUALLY WRONG, AND IT WAS NOT THE 404 ITSELF. Every one of these readers
-- answers NOTHING for four different questions at once — never existed, never published,
-- switched off, and (for a booking) never given a calendar — and each carries a comment
-- saying the silence is deliberate so that a link cannot be used to learn that something is
-- there. That reasoning is right for THREE of the four and wrong for the fourth, and the
-- difference is who is holding the link:
--
--   · never existed / never published  — the holder is guessing at an address. Silence.
--   · SWITCHED OFF                     — the holder was GIVEN this address, by the
--                                        organization that owns it, through our own publish
--                                        button. There is nothing to learn: they already
--                                        know the form is there, because they were sent it.
--
-- So the store-off arm leaks nothing that the link itself did not already carry, and the
-- silence buys no privacy at all — it only makes an organization's own switch look like our
-- product losing their customer's page. A screen never lies (law 4).
--
-- THE CLASS IS FIXED AT THE STORE, NOT AT THE PAGE. One sentence lives in
-- `custom.store_off_sentence`, and every public reader answers it in its own `state`/`message`
-- pair — the shape those readers already have for "closed" and "full", so no route has to
-- learn a new one and the page and the door can never say different things. Six readers, one
-- word: `unavailable`.
--
-- WHY THE ORGANIZATION IS NAMED IN THE SENTENCE. The person holding the link is that
-- organization's customer or patient. "This is not available" with no subject reads as our
-- outage; "Rincon Plumbing Co has turned this off" reads as what it is, and tells them who to
-- call. It is the same name `custom.portal_public` already hands a signed-out stranger.
--
-- WHAT IS NOT TOUCHED: the publish doors. `custom.anon_publish` and `custom.capture_publish`
-- ALREADY refuse while the store is off — `assert_store_door` is the first line of both — and
-- so do `form_declare`, `booking_declare`, `portal_declare` and `subscription_declare`. The
-- half that was missing there is the SCREEN, which is the app's and the builders'.

-- ── ONE SENTENCE, IN ONE PLACE ────────────────────────────────────────────────────────────
-- SECURITY INVOKER ON PURPOSE. Every caller below is already SECURITY DEFINER, so this runs
-- with the definer's own reach into `iam.organizations` and adds no new door of its own to
-- the store. An organization we cannot name still gets a true sentence.
create function custom.store_off_sentence(p_organization_id uuid)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_name text;
begin
  select o.name into v_name from iam.organizations o where o.id = p_organization_id;
  return format(
    '%s has turned its record store off, so this link is not open right now. '
    || 'An owner or an administrator of %s turns it back on under Database settings, '
    || 'on the unified data screen, and this link works again the moment they do.',
    coalesce(nullif(btrim(v_name), ''), 'This organization'),
    coalesce(nullif(btrim(v_name), ''), 'it'));
end;
$$;

comment on function custom.store_off_sentence(uuid) is
  'STORE-OFF: the one sentence every public link answers while its organization has the record store switched off. Named here so six readers and the builders cannot drift apart.';

-- ── 1/6 THE PUBLIC FORM ───────────────────────────────────────────────────────────────────
create or replace function custom.form_public(p_form_id uuid)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb,
              fields jsonb, honeypot_key text, state text, message text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_f      custom.anon_form;
  v_count  bigint;
  v_state  text;
  v_msg    text;
  v_fields jsonb;
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  -- A form that was never published is still silence: nobody was handed this address.
  if v_f.published_at is null then return; end if;

  -- ── STORE-OFF: PUBLISHED, AND THE SWITCH IS DOWN. ───────────────────────────────────────
  -- The holder of this link was given it by this organization. Answering nothing told them
  -- our product had lost their page. Their questions are NOT returned with it: `presentation`
  -- and `fields` are emptied, so the link says only that it is switched off and by whom.
  if not custom.store_is_open(v_f.organization_id) then
    form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
    title := coalesce(v_f.title, 'Form'); presentation := '{}'::jsonb;
    fields := '[]'::jsonb; honeypot_key := null;
    state := 'unavailable'; message := custom.store_off_sentence(v_f.organization_id);
    return next;
    return;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';

  if v_f.closed_at is not null then
    v_state := 'closed';
    v_msg := 'This form is closed, so it is not taking any more answers.';
  elsif v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    v_state := 'full';
    v_msg := 'This form has all the answers it was set up to take.';
  else
    v_state := 'open';
    v_msg := null;
  end if;

  -- EXACTLY the exposed Fields, as the store holds them, each carrying its own id —
  -- the same `{id, ...data}` shape every other reader of a Field builds.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data order by ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$$;

-- ── 2/6 THE PUBLIC BOOKING PAGE ───────────────────────────────────────────────────────────
create or replace function custom.booking_public(p_form_id uuid, p_days integer default null)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb,
              fields jsonb, honeypot_key text, availability jsonb, slots jsonb,
              state text, message text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
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
  if v_f.published_at is null then return; end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then return; end if;

  -- ── STORE-OFF, exactly as the form says it. ────────────────────────────────────────────
  if not custom.store_is_open(v_f.organization_id) then
    form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
    title := coalesce(v_f.title, 'Book a time'); presentation := '{}'::jsonb;
    fields := '[]'::jsonb; honeypot_key := null;
    availability := '{}'::jsonb; slots := '[]'::jsonb;
    state := 'unavailable'; message := custom.store_off_sentence(v_f.organization_id);
    return next;
    return;
  end if;

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
$$;

-- ── 3/6 THE VISITOR'S OWN APPOINTMENT ─────────────────────────────────────────────────────
create or replace function custom.booking_manage(p_booking_ref text, p_days integer default null)
returns table(booking_ref text, form_id uuid, title text, slot_key text,
              slot_at timestamptz, status text, slots jsonb, availability jsonb,
              state text, message text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
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
  select * into v_f from custom.anon_form
   where organization_id = v_s.organization_id and id = v_s.form_id and deleted_at is null;
  if not found then return; end if;
  v_b := v_f.presentation -> 'booking';
  if v_b is null then return; end if;

  -- ── STORE-OFF. This is the person's OWN appointment, minted at confirm and mailed to
  -- them. Answering 404 told somebody who has an appointment that they have not got one.
  if not custom.store_is_open(v_s.organization_id) then
    booking_ref := p_booking_ref; form_id := v_f.id;
    title := coalesce(v_f.title, 'Your appointment');
    slot_key := null; slot_at := null; status := null;
    slots := '[]'::jsonb; availability := '{}'::jsonb;
    state := 'unavailable'; message := custom.store_off_sentence(v_s.organization_id);
    return next;
    return;
  end if;

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
$$;

-- ── 4/6 THE CREW'S CAPTURE SHEET ──────────────────────────────────────────────────────────
-- Not a stranger's link — a member of the organization, on a phone. The silence was worse
-- here than anywhere: the sheet vanished from a screen the person reached from inside the
-- product, with nothing at all to read.
create or replace function custom.capture_open(p_organization_id uuid, p_sheet_id uuid)
returns table(sheet_id uuid, organization_id uuid, table_id uuid, title text,
              presentation jsonb, fields jsonb, state text, may_capture boolean, message text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_f      custom.anon_form;
  v_me     uuid := custom.query_principal();
  v_fields jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.capture_open');

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;
  if not found then return; end if;

  -- The sheet itself is visible to anyone who can open the Table; below viewer it is not
  -- there at all, which is the same answer they get for the Table.
  if not custom.has_visibility(v_me, 'record', v_f.table_id, 'viewer'::public.permission_level) then
    return;
  end if;

  if not custom.store_is_open(p_organization_id) then
    sheet_id := v_f.id; organization_id := p_organization_id; table_id := v_f.table_id;
    title := coalesce(v_f.title, 'Capture'); presentation := '{}'::jsonb; fields := '[]'::jsonb;
    state := 'unavailable'; may_capture := false;
    message := custom.store_off_sentence(p_organization_id);
    return next;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id)
                            || r.data
                            || jsonb_build_object(
                                 'required', (k.key = any (array(select jsonb_array_elements_text(v_f.required_field_keys)))),
                                 'parity_type', custom.parity_type(r.data))
                            order by k.ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record r
      on r.organization_id = v_f.organization_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null
     and (r.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and r.data ->> 'key' = k.key;

  sheet_id := v_f.id;
  organization_id := v_f.organization_id;
  table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Capture');
  presentation := v_f.presentation;
  fields := v_fields;

  if v_f.closed_at is not null then
    state := 'closed'; may_capture := false;
    message := 'This capture sheet is closed, so it is not taking anything new.';
  elsif v_f.capture_opened_at is null then
    state := 'not open yet'; may_capture := false;
    message := 'Whoever set this sheet up has not opened it to the crew yet.';
  elsif not custom.has_visibility(v_me, 'record', v_f.table_id, 'editor'::public.permission_level) then
    state := 'read only'; may_capture := false;
    message := 'You can see this table but not add to it, so you cannot capture here. Ask an owner of this organization to give you editor on it.';
  else
    state := 'open'; may_capture := true; message := null;
  end if;
  return next;
end;
$$;

-- ── 5/6 THE CLIENT PORTAL ─────────────────────────────────────────────────────────────────
-- This reader is the one sibling that never asked the store's switch at all — it asks
-- `external_principal_enabled`, which is the lane, not the store. So a portal in a store-off
-- organization drew its sign-in panel, took the client through a real magic link, and THEN
-- met `assert_store_door` on the first read: a 42501 written for the owner ("this store is
-- not taking writes"), shown to somebody else's customer. Asked here, once, before the panel.
create or replace function custom.portal_public(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_p custom.portal;
  v_o text;
begin
  -- THE SIGN-IN PAGE, AND NOTHING ELSE. A slug that does not exist, one that is closed, one
  -- that is ARCHIVED, and one whose organization has not opened the external lane all answer
  -- the same NULL, which is the 404: the address cannot be used to learn that anything is
  -- there.
  select * into v_p from custom.portal
   where slug = lower(btrim(coalesce(p_slug, ''))) and is_active and archived_at is null;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;

  if not custom.store_is_open(v_p.organization_id) then
    return jsonb_build_object(
      'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
      'sign_in_method', v_p.sign_in_method, 'state', 'unavailable',
      'message', custom.store_off_sentence(v_p.organization_id));
  end if;

  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $$;

-- ── 6/6 THE SIGNING LINK ──────────────────────────────────────────────────────────────────
-- The worst of the six, and NOT a 404: it resolved the token, then called
-- `assert_store_door`, which RAISES. The app's service turns a refusal into a thrown Error,
-- so a signer following a link from their own email met an HTTP 500. Asked as a question
-- rather than an assertion, in the answer shape this door already has.
create or replace function custom.sign_request_public(p_token text, p_origin text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r      record;
  v_state  text;
  v_body   text;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    -- ONE ANSWER FOR THREE QUESTIONS, ON PURPOSE: a link that was never ours, one whose
    -- request is gone, and one whose secret is wrong. Telling them apart would make the link
    -- a way to learn that something is there. The fourth — a store that is switched off —
    -- left this sentence below, because the signer was SENT this address.
    return jsonb_build_object('found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;

  if not custom.store_is_open(v_r.organization_id) then
    return jsonb_build_object(
      'found', true, 'state', 'unavailable', 'signable', false,
      'message', custom.store_off_sentence(v_r.organization_id));
  end if;

  v_state := custom.sign_request_state(v_r.data);

  -- DECISION 4, ON EVERY OPEN: has the record moved since the ask?
  if v_state in ('sent', 'viewed') then
    if not custom.sign_request_unchanged(v_r.organization_id, v_r.request_id) then
      update custom.record r
         set data = r.data || jsonb_build_object(
               'invalidated_at', now(),
               'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
       where r.organization_id = v_r.organization_id and r.id = v_r.request_id
      returning r.data into v_r.data;
      v_state := 'invalidated';
    end if;
  end if;

  -- VIEWED IS WRITTEN ONCE. "They have seen it" is the fact; "they looked again" is not.
  if v_state = 'sent' then
    update custom.record r
       set data = r.data || jsonb_build_object('viewed_at', now())
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
       and not (r.data ? 'viewed_at')
    returning r.data into v_r.data;
    v_state := 'viewed';
  end if;

  -- THE DOCUMENT IS THE FROZEN ONE. What the signer reads is the text that was rendered when
  -- the ask was made and whose hash they will be sealing - never a fresh render, which is the
  -- whole difference between a signature and a screenshot.
  select d.body into v_body
    from custom.doc_render d
   where d.organization_id = v_r.organization_id
     and d.id = (v_r.data ->> 'render_id')::uuid;

  return jsonb_build_object(
    'found',            true,
    'state',            v_state,
    'signable',         v_state in ('sent', 'viewed'),
    'message',          case when v_state in ('sent','viewed') then null
                             else custom.sign_request_sentence(v_r.data) end,
    'document_title',   v_r.data ->> 'document_title',
    'document_version', (v_r.data ->> 'document_version')::integer,
    'document_hash',    v_r.data ->> 'document_hash',
    'body',             coalesce(v_body, ''),
    'signer_name',      v_r.data ->> 'signer_name',
    'signer_email',     v_r.data ->> 'signer_email',
    'expires_at',       v_r.data ->> 'expires_at',
    'signed_name',      v_r.data ->> 'signed_name',
    'signed_at',        v_r.data ->> 'signed_at');
end;
$$;
