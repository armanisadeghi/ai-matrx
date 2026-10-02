-- chair-step: body replacement of custom.form_submit (same signature, same SECURITY DEFINER, same grants): a drawn signature answered on a form is kept as a File record and the Value's envelope names it (signature_file_id), the way custom.sign_request_sign keeps one. No table, grant, policy or other function is touched.
-- lane: CHAIR-DOORS-1 (asked by v6 lane 10 VIEWS-AND-FIELDS)
-- based-on: custom.form_submit(uuid, text, jsonb, text, text, text) 253d349556696ea3bf6b0d76b6e5860c5fbf4f006d21b7b7ba60afa01c29538b
--
-- A FORM KEEPS A DRAWN SIGNATURE AS A FILE. Before this file a form stored the drawing (a PNG data: URL,
-- ~21 kB) as the text Value; the sign-link path stored a File and the signer's name. One shape now:
--   record.data.<key>                          = 'Signed'
--   record.data._values.<key>.src (interned)   = {kind: signature, mark: drawn, signature_file_id, signed_at, via: form, form_id}
--   the File (custom.file_kernel_id())         = {name, mime_type, content: the data: URL, byte_size, kind: signature}
-- The public form still works signed out: the File is written on behalf of the form's publisher, the
-- stand-in custom.anon_clear already takes for the record itself.

CREATE OR REPLACE FUNCTION custom.form_submit(p_form_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text DEFAULT NULL::text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(submission_id uuid, record_id uuid, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f        custom.anon_form;
  v_count    bigint;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_id       uuid;
  v_rec      uuid;
  v_file     uuid;
  v_sigs     jsonb := '{}'::jsonb;
  v_held     text;
  v_stood    boolean := false;
begin
  if p_form_id is null then
    raise exception 'This form is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This form is not available.'
      using errcode = '23503',
            hint = 'The link names no form. It may have been mistyped, or the form may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.form_submit');

  -- CLOSED BY DEFAULT, the same three words custom.anon_write says.
  if v_f.published_at is null then
    raise exception 'This form is not accepting responses.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be submitted, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    submission_id := null; record_id := null; state := 'closed';
    message := 'This form is closed, so it is not taking any more answers.';
    return next; return;
  end if;

  -- THE DECOY, ANSWERED FIRST AND ANSWERED CHEERFULLY. See this file's header, decision 5.
  if v_f.honeypot_key is not null and coalesce(btrim(p_honeypot), '') <> '' then
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        raw_payload, client_key, state, remote_origin,
                                        rejection_reason)
    values (v_f.organization_id, v_f.id, v_f.table_id, 'form', '{}'::jsonb,
            jsonb_build_object('form_id', v_f.id, 'at', now(), 'origin', p_origin,
                               'honeypot', true),
            p_client_key, 'rejected', p_origin,
            format('The decoy field "%s" was filled in, which a person answering this form never does. Nothing was written and the sender was shown the thank-you screen.',
                   v_f.honeypot_key))
    returning id into v_id;
    submission_id := v_id; record_id := null; state := 'accepted';
    message := null; return next; return;
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key;
    if v_existing is not null then
      submission_id := v_existing; record_id := v_rec; state := 'accepted';
      message := 'This answer had already arrived, so it was not written twice.';
      return next; return;
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    submission_id := null; record_id := null; state := 'full';
    message := 'This form has all the answers it was set up to take.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose (a coarse client identifier). A
  -- browser choosing its own bucket would be counting itself.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    submission_id := null; record_id := null; state := 'too_many';
    message := 'That is more answers than this form takes in one go. Try again in a little while.';
    return next; return;
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- A DRAWN SIGNATURE IS A FILE (lane VIEWS-AND-FIELDS; CHAIR-DOORS-1, 2026-10-02), exactly as
  -- custom.sign_request_sign keeps one: a File record (REC-27) holding the drawing, in the form's
  -- organization, and the Value's envelope naming it as `signature_file_id`. The Value itself is the
  -- word "Signed" — a drawn form signature carries no typed name, and the drawing is not copied into
  -- the record. Only an answer to a Signature column (custom.doc_signature_field_ok) that is a drawing
  -- (the same data: URL shape sign_request_sign accepts) is turned into a File; every other answer
  -- passes unchanged. The File is written on behalf of the form's publisher when nobody is signed in
  -- (a stranger on the public form), the same stand-in custom.anon_clear takes, put back on every path.
  for v_key in select k from jsonb_object_keys(v_doc) k loop
    continue when jsonb_typeof(v_doc -> v_key) <> 'string'
               or (v_doc ->> v_key) !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$';
    continue when not exists (
      select 1 from custom.record fd
       where fd.organization_id = v_f.organization_id
         and fd.table_id = custom.field_kernel_id()
         and fd.deleted_at is null
         and (fd.data ->> 'entity_definition_id')::uuid = v_f.table_id
         and fd.data ->> 'key' = v_key
         and custom.doc_signature_field_ok(fd.data));
    if not v_stood and custom.query_principal() is null and v_f.published_by is not null then
      v_held := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text, true);
      v_stood := true;
    end if;
    begin
      insert into custom.record (organization_id, table_id, data_class, data)
      values (v_f.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
        'name',      format('Signature on %s', coalesce(nullif(btrim(v_f.title), ''), 'a form')),
        'mime_type', split_part(split_part(v_doc ->> v_key, ';', 1), ':', 2),
        'content',   v_doc ->> v_key,
        'byte_size', length(v_doc ->> v_key),
        'kind',      'signature'))
      returning id into v_file;
    exception when others then
      if v_stood then
        perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
      end if;
      raise;
    end;
    v_sigs := v_sigs || jsonb_build_object(v_key, jsonb_build_object('src', jsonb_build_object(
      'kind', 'signature', 'mark', 'drawn', 'signature_file_id', v_file,
      'signed_at', now(), 'via', 'form', 'form_id', v_f.id)));
    v_doc := v_doc || jsonb_build_object(v_key, 'Signed');
  end loop;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;
  if v_sigs <> '{}'::jsonb then
    v_doc := v_doc || jsonb_build_object('_values', v_sigs);
  end if;

  -- QUARANTINE. `custom.record` is not touched here, and the provenance travels with the
  -- submission so the record made from it can always say where it came from.
  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'form', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(),
                             'origin', p_origin, 'via', 'form'),
          p_client_key, 'quarantined', p_origin)
  returning id into v_id;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  -- S7': THE STRANGER'S SAVED PLACE IS USED UP BY THE ANSWER IT BECAME. When the page saved
  -- progress for this person it sends that saved place's key as the client key, so the one
  -- send that turns the answers into a submission also marks the saved place sent, in this
  -- same transaction. Its answers are emptied — they live in the submission now, and a second
  -- copy of somebody's intake answers kept for a month would be a copy nobody asked for.
  if p_client_key is not null then
    update custom.anon_form_draft d
       set submitted_at = now(), submission_id = v_id, answers = '{}'::jsonb
     where d.organization_id = v_f.organization_id
       and d.form_id = v_f.id
       and d.secret_hash = encode(extensions.digest(p_client_key, 'sha256'), 'hex')
       and d.submitted_at is null
       and d.deleted_at is null;
  end if;

  -- THE ACCEPT RULE. With one, the answer becomes a record now; with none, it waits for a
  -- person and this function SAYS SO instead of implying it landed.
  if v_f.quarantine_rule_id is not null then
    v_rec := custom.anon_clear(v_f.organization_id, v_id);
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    submission_id := v_id; record_id := v_rec; state := 'accepted'; message := null;
  elsif v_f.quarantine_rule_id is null then
    submission_id := v_id; record_id := null; state := 'held';
    message := 'Your answer arrived and is waiting for someone to look at it.';
  else
    select s.rejection_reason into message from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.id = v_id;
    submission_id := v_id; record_id := null; state := 'held';
    message := coalesce(message, 'Your answer arrived and is waiting for someone to look at it.');
  end if;
  return next;
end;
$function$;
