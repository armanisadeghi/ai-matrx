-- Inverse of handover_a_field_is_found_on_its_own_table.sql: the two bodies it replaced, byte for byte.
-- based-on: custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) c13f8eb9c1e2f254dfce5f1a0b416ada1a98237b455edd95c4d88321fb88533e
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) 66ebe3f2452c51575c2cacd3aaf5c1ee667b1eb6234e8f1ec012605e19370615
-- chair-step: restores custom.booking_declare and custom.form_declare (handover_a_field_is_found_on_its_own_table.sql)

CREATE OR REPLACE FUNCTION custom.booking_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_availability jsonb DEFAULT '{}'::jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    raise exception 'There is no such table in this organization to take bookings into.' using errcode = '23503',
            hint = 'A booking page is a view on a real Table (SCR-29). Make the Table first — every question is one of its Fields and every booking is one of its records.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  -- THE THREE THE STORE FILLS IN. Declared on the Table if they are not there yet, so a
  -- booking page can be put over a Table that was made for something else.
  --
  -- 🚨 RED-SUITES 2026-09-21 — `::text`, AND WITHOUT IT THIS DOOR COULD NOT DECLARE A BOOKING
  -- PAGE AT ALL OVER ANY TABLE MISSING ONE OF THE THREE — which is every Table "made for
  -- something else", the case the comment above is about. `v_keys` is `text[]`, and for
  -- `anyarray || <untyped literal>` Postgres resolves the ARRAY || ARRAY operator and casts
  -- the literal to `text[]`, so the statement dies:
  --     ERROR:  malformed array literal: "slot"
  --     CONTEXT: PL/pgSQL function custom.booking_declare(…) line 46 at assignment
  -- VERIFIER-8 recorded it against `booking_green` AND `booking_red` — both twins died on the
  -- same line, which is the tell that it was the door and not the suites. The cast names the
  -- element type and the append means what it reads as.
  if not ('slot' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'slot', 'label', 'Appointment', 'type', 'text', 'required', true, 'sort', 900));
    v_keys := v_keys || 'slot'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
  end if;
  if not ('status' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'status', 'label', 'Status', 'type', 'text', 'required', false, 'sort', 910));
    v_keys := v_keys || 'status'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
  end if;
  if not ('booked_with' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'booked_with', 'label', 'With', 'type', 'text', 'required', false, 'sort', 920));
    v_keys := v_keys || 'booked_with'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
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
        v_missing := v_missing || 'booked'::text;
      end if;
      if not ('cancelled' = any (v_words)) then
        v_missing := v_missing || 'cancelled'::text;
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
$function$;

CREATE OR REPLACE FUNCTION custom.form_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user     uuid := custom.query_principal();
  v_keys     text[];
  v_q        jsonb;
  v_key      text;
  v_exposed  text[] := array[]::text[];
  v_required text[] := array[]::text[];
  v_slug     text;
  v_id       uuid;
  v_hp       text;
  v_present  jsonb;
  -- The accept Rule this door makes when the caller brought none.
  v_accept   uuid := p_quarantine_rule_id;
  v_ids      uuid[] := array[]::uuid[];
  v_fid      uuid;
  v_expr     jsonb;
  v_args     jsonb := '[]'::jsonb;
  v_aname    text;
  v_redirect text;
  v_said     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_declare');

  -- A FORM DECIDES WHAT STRANGERS MAY WRITE INTO A TABLE, so declaring one is an admin
  -- act on that Table — the same rung custom.anon_publish already asks for. Asking less
  -- here and more at publish would let anyone assemble the loaded gun and only check who
  -- pulls the trigger.
  if v_user is null then
    raise exception 'Nobody is signed in, so no form can be made.'
      using errcode = '42501',
            hint = 'custom.form_declare is the owner''s side of a form. The public side — custom.form_public and custom.form_submit — is the one that has no principal.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.form_declare',
                                          'admin'::public.permission_level, 'table');

  -- The subject has to be a TABLE of this organization, and the fields it declares are
  -- the only things a question may ask for.
  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no such table in this organization to make a form for.' using errcode = '23503',
            hint = 'A form is a view on a real Table (SCR-13). Make the Table first — every question is one of its Fields and every answer is one of its records.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A form has to ask something.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "help": "…", "required": true|false}. The field key is the address; ask and help are this form''s own words for it.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    if v_key is null then
      raise exception 'One of this form''s questions does not say which field it asks for.'
        using errcode = '22004',
              hint = 'Every question names a Field of the subject table by key. The table''s fields are: ' || array_to_string(v_keys, ', ') || '.';
    end if;
    if not (v_key = any (v_keys)) then
      raise exception 'This table has no field called "%", so the form cannot ask for it.', v_key
        using errcode = '23503',
              hint = format('Its fields are: %s. Add the Field first, or ask for one that is there — a question with nowhere to land is an answer nobody can read.',
                            array_to_string(v_keys, ', '));
    end if;
    if not (v_key = any (v_exposed)) then
      v_exposed := v_exposed || v_key;
    end if;
    if coalesce((v_q ->> 'required')::boolean, false) and not (v_key = any (v_required)) then
      v_required := v_required || v_key;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- THE ACCEPT RULE, WHEN NOBODY BROUGHT ONE.
  --
  -- Without it `custom.form_submit` holds every answer for a person and the
  -- form is a drawer. The Rule is REC-15's own shape, referencing Fields BY ID
  -- (REC-17) — a Rule naming a field by its KEY is refused, and it is right to.
  -- With nothing required the test is honestly a constant, and it says so in
  -- its own name rather than pretending to check something.
  -- ─────────────────────────────────────────────────────────────────────────
  if v_accept is null then
    foreach v_key in array v_required loop
      select r.id into v_fid
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.deleted_at is null
         and r.data ->> 'key' = v_key
         and nullif(r.data ->> 'table_id', '')::uuid = p_table_id
       limit 1;
      if v_fid is not null then
        v_ids := v_ids || v_fid;
      end if;
    end loop;

    if array_length(v_ids, 1) is null then
      v_expr := jsonb_build_object('const', true);
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form') || ': take every answer';
    else
      foreach v_fid in array v_ids loop
        v_args := v_args || jsonb_build_array(
          jsonb_build_object('op', 'present',
                             'args', jsonb_build_array(jsonb_build_object('field', v_fid))));
      end loop;
      if jsonb_array_length(v_args) = 1 then
        v_expr := v_args -> 0;
      else
        v_expr := jsonb_build_object('op', 'and', 'args', v_args);
      end if;
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form')
                 || ': every answer it asks for is there';
    end if;

    v_accept := custom.rule_declare(p_organization_id, jsonb_build_object(
      'name', v_aname,
      'kind', 'predicate',
      -- V11-C (2026-09-22): `membership`, NOT `validate`. See this file's header.
      'uses', jsonb_build_array('membership'),
      'scope_table_id', p_table_id,
      'applies_to_types', '[]'::jsonb,
      'expr', v_expr,
      'description',
        'DOOR-17: an anonymous answer lands quarantined and becomes a record only when '
        || 'this Rule admits it. It is the form''s validation and its release in one '
        || 'object, so the two cannot disagree. Made by custom.form_declare because the '
        || 'caller brought none — without it every answer is held for a person forever. '
        || 'V11-C: its use is `membership` — it says which SUBMISSIONS this form admits, '
        || 'which is what custom.anon_clear asks it through custom.rule_run. A `validate` '
        || 'use would enlist it in the table''s write-time checks and make the form''s '
        || 'questions compulsory for every record anybody writes by any route.'
    ), null);
  end if;

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

  -- ─────────────────────────────────────────────────────────────────────────
  -- S7': WHAT THE STRANGER SEES AFTER SENDING, JUDGED HERE, ONCE.
  --
  -- `thank_you` is {title, body, redirect_url}. The message is the form's own words. The
  -- redirect is optional and it is an ADDRESS a stranger's browser is sent to, so it is held
  -- to one rule: a secure page on one of this organization's own sites — its website, and the
  -- list it keeps in `custom/form_redirect_domains`. Anything else is refused by name with the
  -- list it may use, never quietly dropped: the owner typed it and expects it to work.
  -- ─────────────────────────────────────────────────────────────────────────
  if jsonb_typeof(v_present -> 'thank_you') is not null
     and jsonb_typeof(v_present -> 'thank_you') not in ('object', 'null') then
    raise exception 'The thank-you screen has to be a title, a message and an optional address, not %.',
                    jsonb_typeof(v_present -> 'thank_you')
      using errcode = '22023',
            hint = 'presentation.thank_you is {"title": "…", "body": "…", "redirect_url": "https://…"}; every part may be left out.';
  end if;
  if jsonb_typeof(v_present -> 'thank_you') = 'object' then
    v_redirect := nullif(btrim(coalesce(v_present #>> '{thank_you,redirect_url}', '')), '');
    if v_redirect is null then
      v_present := v_present #- '{thank_you,redirect_url}';
    else
      v_said := custom.form_redirect_refusal(p_organization_id, v_redirect);
      if v_said is not null then
        raise exception '%', v_said
          using errcode = '22023',
                hint = 'Leave the address empty and the thank-you message is shown instead. An organization''s own sites are its website and the list in its forms settings (custom/form_redirect_domains).';
      end if;
      v_present := jsonb_set(v_present, '{thank_you,redirect_url}', to_jsonb(v_redirect));
    end if;
  end if;

  if p_form_id is not null then
    select honeypot_key into v_hp from custom.anon_form
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
    if v_hp is null and not found then
      raise exception 'There is no such form in this organization.' using errcode = '23503',
            detail = jsonb_build_object('form_id', p_form_id)::text;
    end if;
  end if;
  -- ONE decoy per form, minted once and kept, so a bot cannot learn the name by watching
  -- two forms. `extensions.` is written out because search_path is pg_catalog here.
  v_hp := coalesce(v_hp, 'confirm_' || encode(extensions.gen_random_bytes(5), 'hex'));
  v_slug := coalesce(nullif(btrim(p_slug), ''), custom.form_slug(p_organization_id, p_title, p_form_id));

  if p_form_id is null then
    insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                                  required_field_keys, presentation, submission_cap,
                                  quarantine_rule_id, notify_rule_id, honeypot_key)
    values (p_organization_id, p_table_id, v_slug, nullif(btrim(p_title), ''),
            to_jsonb(v_exposed), to_jsonb(v_required), v_present, p_submission_cap,
            v_accept, p_notify_rule_id, v_hp)
    returning id into v_id;
  else
    update custom.anon_form
       set table_id = p_table_id,
           slug = v_slug,
           title = nullif(btrim(p_title), ''),
           exposed_field_keys = to_jsonb(v_exposed),
           required_field_keys = to_jsonb(v_required),
           presentation = v_present,
           submission_cap = p_submission_cap,
           quarantine_rule_id = v_accept,
           notify_rule_id = p_notify_rule_id,
           honeypot_key = v_hp
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'There is no such form in this organization.' using errcode = '23503',
            detail = jsonb_build_object('form_id', p_form_id)::text;
    end if;
  end if;

  return v_id;
end;
$function$;
