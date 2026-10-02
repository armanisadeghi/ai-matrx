-- additive: yes
--   It ADDS two internal functions — custom._form_look_judge(uuid, jsonb) and
--   custom._form_look(uuid, jsonb), EXECUTE to postgres only (no client grant) — and REPLACES three
--   bodies, each declared below with the body it was written against. No table, column, trigger,
--   policy, grant or row of anybody's data is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/makehome_w5_a_public_form_wears_its_look_down.sql
-- lock: custom
-- lane: MAKE-HOME
-- based-on: custom._portal_style(uuid, jsonb) b07aaad1c4088be17300a63430bda2a50cdcb25024371cdc6f4edf36793e425b
-- based-on: custom.form_public(uuid) 034c0df8a7c2d66da1967ea200e6c13c2e64d385d91592cae5590864a5f67d12
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) 66ebe3f2452c51575c2cacd3aaf5c1ee667b1eb6234e8f1ec012605e19370615
--
-- LANE 2 MAKE-HOME, WAVE 5 — THE PUBLIC FORM WEARS ITS ORGANIZATION'S LOOK (E1).
--
-- THE DEFECT (live walk 2026-10-02, /f/c605f46f… at 390 px): a public form carried no logo, no
-- colour and no cover — a stranger could not tell whose form it was. The organization already
-- has ONE look primitive, custom._portal_style (name, logo, colour, footer links, judged and
-- resolved in the store); a form never read it.
--
-- THE FIX, reusing that primitive and nothing else:
--   · custom._portal_style also resolves `cover_file_id` → `cover_url` (same rule as the logo:
--     one of the organization's own PUBLIC pictures, or nothing). Additive keys only.
--   · custom._form_look resolves the look a form shows: the organization's portal look under the
--     form's own `presentation.look` {accent, logo_file_id, cover_file_id}.
--   · custom.form_public hands `presentation.look` (resolved addresses, never ids) to the page.
--   · custom.form_declare judges `presentation.look` by name (custom._form_look_judge): a colour
--     the app does not have, or a picture that is not the organization's public one, is refused.

CREATE OR REPLACE FUNCTION custom._portal_style(p_organization_id uuid, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org    record;
  v_style  jsonb := coalesce(p_config -> 'style', '{}'::jsonb);
  v_logo   uuid  := nullif(v_style ->> 'logo_file_id', '')::uuid;
  v_url    text;
  v_from   text[] := '{}';
  v_logoid uuid;
  v_cover  uuid;
  v_cover_url text;
begin
  select o.name, o.logo_file_id, o.logo_url into v_org
    from iam.organizations o where o.id = p_organization_id;

  if v_logo is not null then
    v_url := custom._portal_picture_url(p_organization_id, v_logo, true);
    v_logoid := v_logo;
  end if;
  if v_url is null and v_org.logo_file_id is not null then
    v_url := custom._portal_picture_url(p_organization_id, v_org.logo_file_id, false);
    if v_url is not null then v_logoid := v_org.logo_file_id; v_from := array_append(v_from, 'logo'); end if;
  end if;
  if v_url is null and coalesce(v_org.logo_url, '') ~ '^https://' then
    v_url := v_org.logo_url; v_logoid := null; v_from := array_append(v_from, 'logo');
  end if;
  -- MAKE-HOME W5: A COVER PICTURE, held to the logo's own rule — one of this organization's
  -- PUBLIC pictures, or nothing. A form's look carries one (custom._form_look); a portal's may.
  if coalesce(v_style ->> 'cover_file_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    v_cover := (v_style ->> 'cover_file_id')::uuid;
    v_cover_url := custom._portal_picture_url(p_organization_id, v_cover, true);
    if v_cover_url is null then v_cover := null; end if;
  end if;
  if coalesce(v_style ->> 'display_name', '') = '' then
    v_from := array_append(v_from, 'display_name');
  end if;

  return jsonb_build_object(
    'display_name', coalesce(nullif(v_style ->> 'display_name', ''), v_org.name, 'Client portal'),
    'welcome',      nullif(v_style ->> 'welcome', ''),
    'logo_file_id', v_logoid,
    'logo_url',     v_url,
    'accent',       nullif(v_style ->> 'accent', ''),
    'footer_links', coalesce(v_style -> 'footer_links', '[]'::jsonb),
    'cover_file_id', v_cover,
    'cover_url',    v_cover_url,
    'from_organization', to_jsonb(v_from));
end $function$;


-- ── NEW: the form's look, judged when it is saved ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._form_look_judge(p_organization_id uuid, p_presentation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_look jsonb := p_presentation -> 'look';
  v_out  jsonb := '{}'::jsonb;
  v_key  text;
  v_txt  text;
  v_id   uuid;
begin
  -- `look` is {accent, logo_file_id, cover_file_id}: the portal's look words, so a form and a
  -- portal of one organization are styled by one primitive (custom._portal_style).
  if v_look is null or jsonb_typeof(v_look) = 'null' then
    return p_presentation - 'look';
  end if;
  if jsonb_typeof(v_look) <> 'object' then
    raise exception 'A form''s look is a colour, a logo and a cover picture, not %.', jsonb_typeof(v_look)
      using errcode = '22023',
            hint = 'presentation.look is {"accent": "blue", "logo_file_id": "<file id>", "cover_file_id": "<file id>"}; every part may be left out.';
  end if;
  for v_key in select jsonb_object_keys(v_look) loop
    if v_key not in ('accent', 'logo_file_id', 'cover_file_id') then
      raise exception 'A form''s look has a colour, a logo and a cover picture, and "%" is none of them.', v_key
        using errcode = '22023', hint = 'The keys are accent, logo_file_id and cover_file_id. Nothing was written.';
    end if;
  end loop;

  v_txt := nullif(btrim(coalesce(v_look ->> 'accent', '')), '');
  if v_txt is not null then
    if not (v_txt = any (custom.portal_accents())) then
      raise exception 'A form''s colour is one of the colours the rest of the app uses (%), and "%" is not one of them.',
        array_to_string(custom.portal_accents(), ', '), v_txt
        using errcode = '22023', hint = 'Leave it out and the organization''s colour is used. Nothing was written.';
    end if;
    v_out := v_out || jsonb_build_object('accent', v_txt);
  end if;

  foreach v_key in array array['logo_file_id', 'cover_file_id'] loop
    v_txt := nullif(btrim(coalesce(v_look ->> v_key, '')), '');
    continue when v_txt is null;
    if v_txt !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'A form''s % is a picture from this organization''s Files, named by its id, and "%" is not an id.',
        case v_key when 'logo_file_id' then 'logo' else 'cover' end, v_txt
        using errcode = '22023', hint = 'Pick a picture from Files. Nothing was written.';
    end if;
    v_id := v_txt::uuid;
    if custom._portal_picture_url(p_organization_id, v_id, true) is null then
      raise exception 'That picture is not one of this organization''s public pictures, so the people answering this form could not see it.'
        using errcode = '22023',
              hint = 'Share the picture publicly in Files, or pick another one. Nothing was written.';
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_id);
  end loop;

  if v_out = '{}'::jsonb then
    return p_presentation - 'look';
  end if;
  return jsonb_set(p_presentation, '{look}', v_out);
end $function$;

-- ── NEW: the look a stranger sees on a form ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._form_look(p_organization_id uuid, p_presentation jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The organization's look is the one it set for its clients (its newest open portal's look,
  -- less the portal's welcome line), and custom._portal_style falls back to the organization's
  -- own name and logo under it. The form's own colour, logo and cover sit on top.
  select custom._portal_style(
           p_organization_id,
           jsonb_build_object('style',
             (coalesce((select p.config -> 'style'
                          from custom.portal p
                         where p.organization_id = p_organization_id
                           and p.is_active
                           and p.archived_at is null
                           and p.closed_at is null
                           and jsonb_typeof(p.config -> 'style') = 'object'
                         order by p.opened_at desc nulls last, p.created_at desc
                         limit 1), '{}'::jsonb) - 'welcome')
             || case when jsonb_typeof(p_presentation -> 'look') = 'object'
                     then jsonb_strip_nulls(p_presentation -> 'look') else '{}'::jsonb end));
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
  -- MAKE-HOME W5: THE LOOK A STRANGER SEES, RESOLVED HERE — the organization's look (its portal
  -- look, then its own name and logo) under the form's own colour, logo and cover. Addresses
  -- only, never the file ids: `look` is the answer of custom._portal_style, the one look primitive.
  presentation := coalesce(presentation, '{}'::jsonb)
                  || jsonb_build_object('look', custom._form_look(v_f.organization_id, v_f.presentation));
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
         -- A FIELD NAMES ITS TABLE AS entity_definition_id (lane HANDOVER, 2026-09-29): read as
         -- data.table_id this found no Field, so every form's accept Rule took every answer.
         and coalesce(nullif(r.data ->> 'entity_definition_id', ''), nullif(r.data ->> 'table_id', ''))::uuid = p_table_id
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

  -- MAKE-HOME W5: THE FORM'S OWN LOOK, JUDGED HERE, ONCE (custom._form_look_judge).
  v_present := custom._form_look_judge(p_organization_id, v_present);

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
