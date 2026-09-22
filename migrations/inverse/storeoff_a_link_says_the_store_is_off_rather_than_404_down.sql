-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- STORE-OFF inverse — the six public readers restored to the bodies that were live on the
-- main database at 2026-09-22, captured from pg_get_functiondef before the up ran, and the
-- one new sentence function dropped. Rule 27.

-- form_public
CREATE OR REPLACE FUNCTION custom.form_public(p_form_id uuid)
 RETURNS TABLE(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb, fields jsonb, honeypot_key text, state text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- The store's own switch, asked silently: an organization that does not keep its data
  -- here has no form to show, and saying WHICH of the three reasons it is would be the
  -- leak this function exists to avoid.
  if not custom.store_is_open(v_f.organization_id) then return; end if;
  if v_f.published_at is null then return; end if;

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
$function$
;

-- booking_public
CREATE OR REPLACE FUNCTION custom.booking_public(p_form_id uuid, p_days integer DEFAULT NULL::integer)
 RETURNS TABLE(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb, fields jsonb, honeypot_key text, availability jsonb, slots jsonb, state text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;

-- booking_manage
CREATE OR REPLACE FUNCTION custom.booking_manage(p_booking_ref text, p_days integer DEFAULT NULL::integer)
 RETURNS TABLE(booking_ref text, form_id uuid, title text, slot_key text, slot_at timestamp with time zone, status text, slots jsonb, availability jsonb, state text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;

-- capture_open
CREATE OR REPLACE FUNCTION custom.capture_open(p_organization_id uuid, p_sheet_id uuid)
 RETURNS TABLE(sheet_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb, fields jsonb, state text, may_capture boolean, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.anon_form;
  v_me     uuid := custom.query_principal();
  v_fields jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.capture_open');
  if not custom.store_is_open(p_organization_id) then return; end if;

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
$function$
;

-- portal_public
CREATE OR REPLACE FUNCTION custom.portal_public(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $function$
;

-- sign_request_public
CREATE OR REPLACE FUNCTION custom.sign_request_public(p_token text, p_origin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r      record;
  v_state  text;
  v_body   text;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    -- ONE ANSWER FOR FOUR QUESTIONS, ON PURPOSE: a link that was never ours, one whose request
    -- is gone, one whose secret is wrong, and one in an organization whose store is switched
    -- off. Telling them apart would make the link a way to learn that something is there.
    return jsonb_build_object('found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_public');

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
$function$
;

drop function if exists custom.store_off_sentence(uuid);
