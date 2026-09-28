-- additive: yes
-- based-on: custom.form_public(uuid) 8691dbce9f486c0929a60600208f5ba1efda3698ec6da459356247516a11d013
-- based-on: custom.booking_public(uuid, integer) d0612f1b74706954bfe3eda24ba5a0d88eb2c7c9e0b3342809bd50f42cb93ce5
--
-- HANDOVER (2026-09-28) — A PUBLIC CHOICE QUESTION CARRIES ITS CHOICES.
--
-- Adds ONE helper (custom._public_choices_of, SECURITY INVOKER, reads through
-- custom.choice_options) and replaces two live door bodies, same signatures; nothing dropped,
-- granted or revoked; no row touched.
--
-- What a person met: a stranger on Cedar Ridge Physical Therapy's booking page was asked the Visit
-- type (Initial Evaluation, Follow-up, Re-evaluation, Discharge Visit) in a free-text box. The
-- choices live in the organization's own choice list, which a page answered without an account may
-- not read, and custom.booking_public / custom.form_public handed back only the list's id. Now each
-- choice question carries `public_choices` — its live choices' keys and labels, in the owner's order
-- (labels only, never the list's rows) — and the public picker draws them (records-ui 97246471eb).
-- Guard: matrx-frontend/scripts/campaign-tests/handover_a_public_choice_question_carries_its_choices.sql
-- Inverse: migrations/inverse/handover_a_public_choice_question_carries_its_choices_down.sql

CREATE OR REPLACE FUNCTION custom._public_choices_of(p_organization_id uuid, p_field jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The labels (and keys) of a choice field's live choices, in the owner's order, as
  -- {"public_choices": [{"key", "label"}]} — or {} for a field that takes no choices. Called only
  -- by the public form and booking doors, which already hold the organization's authority.
  select case
           when nullif(p_field #>> '{config,options_table_id}', '') is null then '{}'::jsonb
           else jsonb_build_object('public_choices', coalesce((
             select jsonb_agg(jsonb_build_object('key', o.key, 'label', o.value ->> 'label')
                              order by coalesce((o.value ->> 'position')::numeric, 0), o.key)
               from jsonb_each(custom.choice_options(p_organization_id,
                                                     (p_field #>> '{config,options_table_id}')::uuid)) o
              where not coalesce((o.value ->> 'retired')::boolean, false)), '[]'::jsonb))
         end
$function$;

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
  -- A CHOICE QUESTION CARRIES ITS CHOICES (lane HANDOVER, 2026-09-28). A stranger could not
  -- pick a Visit type: the choices live in the organization's own choice list, which a page
  -- answered without an account may not read, so the question fell back to a free-text box.
  -- The organization published this page to ask this question, so the labels of the choices it
  -- asks for travel with the question — the labels only, never the list's own rows.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data
           || custom._public_choices_of(v_f.organization_id, f.data) order by ord), '[]'::jsonb)
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
  -- S7': A REDIRECT IS ONLY HANDED OUT WHILE IT IS STILL ONE OF THE ORGANIZATION'S OWN SITES.
  -- custom.form_declare refuses a foreign address when the form is saved; this is the other
  -- half, for a site the organization has since taken off its list. The stranger is then shown
  -- the thank-you message instead of being sent somewhere the organization no longer vouches for.
  if nullif(btrim(coalesce(presentation #>> '{thank_you,redirect_url}', '')), '') is not null
     and custom.form_redirect_refusal(v_f.organization_id, presentation #>> '{thank_you,redirect_url}') is not null then
    presentation := presentation #- '{thank_you,redirect_url}';
  end if;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$function$;

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

  -- A CHOICE QUESTION CARRIES ITS CHOICES (lane HANDOVER, 2026-09-28). A stranger could not
  -- pick a Visit type: the choices live in the organization's own choice list, which a page
  -- answered without an account may not read, so the question fell back to a free-text box.
  -- The organization published this page to ask this question, so the labels of the choices it
  -- asks for travel with the question — the labels only, never the list's own rows.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data
           || custom._public_choices_of(v_f.organization_id, f.data) order by ord), '[]'::jsonb)
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
$function$;
