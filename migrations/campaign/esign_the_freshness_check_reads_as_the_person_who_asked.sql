-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.sign_request_public(text, text) a855a7be30b9d8e3001acb23bfb9c0739ffa98d2b3fede236eac44ab5495cf68
-- based-on: custom.sign_request_sign(text, text, text, text, text, text, text) fa5fc470054fd0226b958d77fdfff960abc0301894f74fcf2638150422e502a8
--
-- LANE ESIGN — THE FRESHNESS CHECK READS AS THE PERSON WHO ASKED.
--
-- THE DEFECT, FOUND BY OPENING A REAL SIGNING LINK IN A REAL BROWSER (2026-09-20).
-- The page answered 500 and the server log carried the store's own sentence:
--
--     custom.sign_request_public refused: You are not a member of that organization,
--     so custom.table_type_field has nothing to do there.
--
-- WHY. Decision 4 of `esign_asking_somebody_to_sign_is_a_door.sql` re-renders the record and
-- compares hashes on every open and every signature, which is what makes "the document was
-- frozen" a fact rather than a promise. The re-render goes through
-- `custom.doc_render_body` → `custom.record_values` → `custom.table_type_field`, and that
-- last one asks `custom.assert_client_may_reach` — a MEMBERSHIP question. The signing doors
-- are server-lane: their caller is `service_role` holding no claims at all, so the answer is
-- "you are not a member", correctly, of every organization on the platform.
--
-- It passed every psql check because psql connects as the role that OWNS the store, for whom
-- `pg_has_role` answers true on the predicate's first line. That is precisely the fake the
-- seat recipe exists to catch, and the browser caught it.
--
-- THE FIX, AND WHY IT IS NOT A HOLE. The re-render is not a read on the SIGNER's behalf —
-- the signer never sees it, and what they are shown is still the frozen body of
-- `custom.doc_render`. It is an integrity check on the ASKER's own record, run to decide
-- whether the ask still stands. So it runs as the asker, for exactly that one call, by the
-- same borrow-and-restore `custom.anon_clear` uses for a stranger's form answer (AGT-N-5):
-- `custom.sign_request_unchanged` assumes the request Record's `created_by` — the person who
-- had `editor` on that record when they asked — takes the hash, and gives the session back,
-- exception path included. It returns a BOOLEAN and nothing else, so no borrowed row, no
-- rendered text and no field value can escape through it.
--
-- Everything else about both doors is byte-identical to what they already did.

create or replace function custom.sign_request_unchanged(p_organization_id uuid, p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_data  jsonb;
  v_asker uuid;
  v_held  text;
  v_hash  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_unchanged');

  select r.data, r.created_by into v_data, v_asker
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_data is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;

  -- THE BORROW, AND ONLY FOR THIS. The merge asks a membership question
  -- (custom.table_type_field -> custom.assert_client_may_reach) and the signing doors are
  -- server-lane, so the session carries no principal. The person who ASKED had editor on
  -- this record when they asked; re-rendering their own record to decide whether their own
  -- ask still stands is their authority, not the signer''s. AGT-N-5, and the same shape
  -- custom.anon_clear uses for a stranger''s form answer.
  v_held := current_setting('request.jwt.claims', true);
  begin
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;
    v_hash := custom.doc_content_hash(
                custom.doc_render_body(p_organization_id,
                                       (v_data ->> 'template_id')::uuid,
                                       (v_data ->> 'record_id')::uuid));
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    raise;
  end;

  -- A BOOLEAN AND NOTHING ELSE. No borrowed row, no rendered text and no field value
  -- leaves this function, so the borrow cannot become a read.
  return v_hash is not distinct from (v_data ->> 'document_hash');
end;
$fn$;

comment on function custom.sign_request_unchanged(uuid, uuid) is
  'ESIGN: does the record still say what the frozen document says? Re-renders as the person who asked, compares hashes, answers yes or no and nothing else.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_unchanged',
        'p_organization_id uuid, p_request_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'ESIGN. Answers ONE boolean: does a fresh render of the record still hash to what the signature request froze. It assumes the request Record''s own created_by for exactly the merge call and restores the session afterwards, exception path included, because the merge asks a membership question and the signing doors are server-lane. Nothing but the boolean leaves it, so the borrow cannot become a read of a row the caller may not see.',
        'esign_the_freshness_check_reads_as_the_person_who_asked.sql',
        'server_only: called only from custom.sign_request_public and custom.sign_request_sign, inside the same transaction, and granted to nobody.', false, false)
on conflict do nothing;

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
$$;

create or replace function custom.sign_request_sign(
  p_token       text,
  p_signed_name text,
  p_mark        text,
  p_image       text default null,
  p_ip          text default null,
  p_user_agent  text default null,
  p_origin      text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r       record;
  v_state   text;
  v_name    text := btrim(coalesce(p_signed_name, ''));
  v_mark    text := lower(btrim(coalesce(p_mark, 'typed')));
  v_file    uuid;
  v_sig     uuid;
  v_held    text;
  v_asker   uuid;
  v_src     jsonb;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    return jsonb_build_object('signed', false, 'found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_sign');

  if v_mark not in ('typed', 'drawn') then
    raise exception 'a signature is typed or drawn, and "%" is neither', p_mark
      using errcode = '23514',
            hint = 'A third way of signing would be a third thing every screen that shows a signature has to know how to draw.';
  end if;
  if v_name = '' then
    raise exception 'Please type your name as you sign.'
      using errcode = '22004',
            hint = 'VAL-10: the signature IS the Value on the record, and its text is the name the signer gave.';
  end if;
  if v_mark = 'drawn' and coalesce(p_image, '') !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$' then
    raise exception 'The drawing did not arrive. Please sign again.'
      using errcode = '22023',
            hint = 'A drawn signature reaches this door as a data: URL holding a PNG or a JPEG.';
  end if;

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    return jsonb_build_object('signed', false, 'found', true, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- DECISION 4 AGAIN, AT THE MOMENT OF SIGNING. The open may have been ten minutes ago.
  if not custom.sign_request_unchanged(v_r.organization_id, v_r.request_id) then
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at', now(),
             'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
    returning r.data into v_r.data;
    return jsonb_build_object('signed', false, 'found', true, 'state', 'invalidated',
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- THE DRAWN MARK IS A FILE, because that is what an image is on this platform (REC-27) and
  -- because a signature people can see has to be a thing the rest of the system can show,
  -- print and attach - never a blob wedged into one feature's own column.
  if v_mark = 'drawn' then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_r.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
      'name',        format('Signature of %s', v_name),
      'mime_type',   split_part(split_part(p_image, ';', 1), ':', 2),
      'content',     p_image,
      'byte_size',   length(p_image),
      'kind',        'signature'))
    returning id into v_file;
  end if;

  -- DECISION 7. `custom.doc_sign` asks `editor` on the record and a signer has no principal at
  -- all, so the session takes the claims of the person who ASKED for exactly this one call and
  -- gives them back afterwards, exception path included. What gets written is the SIGNER's
  -- name and the SIGNER's provenance; the borrowed principal is only the right to write it.
  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id;
  v_held := current_setting('request.jwt.claims', true);
  begin
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;

    v_sig := custom.doc_sign(v_r.organization_id, (v_r.data ->> 'render_id')::uuid,
                             v_r.data ->> 'field_key', v_name,
                             (v_r.data ->> 'signer_user_id')::uuid);

    -- THE SIGNBLOCK, COMPLETED. `custom.doc_sign` writes the Value with the render, the
    -- template, the document version and the document hash. The rest of what a certificate
    -- means - who, by what address, from where, on what browser, drawn or typed, and the
    -- drawing itself - is written here, onto the SAME Value, in the SAME transaction, by the
    -- SAME act. It is a completion of one signature's provenance, not a later actor editing a
    -- sealed one: `custom.doc_sign` refuses any second signature on this Field from here on.
    v_src := jsonb_strip_nulls(jsonb_build_object(
      'kind',             'signature',
      'request_id',       v_r.request_id,
      'render_id',        (v_r.data ->> 'render_id')::uuid,
      'template_id',      (v_r.data ->> 'template_id')::uuid,
      'document_version', (v_r.data ->> 'document_version')::integer,
      'document_hash',    v_r.data ->> 'document_hash',
      'signature_id',     v_sig,
      'signer_name',      v_name,
      'signer_email',     v_r.data ->> 'signer_email',
      'signer_user_id',   (v_r.data ->> 'signer_user_id')::uuid,
      'signed_at',        now(),
      'mark',             v_mark,
      'signature_file_id', v_file,
      'ip',               nullif(btrim(coalesce(p_ip, '')), ''),
      'user_agent',       left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512),
      'origin',           nullif(btrim(coalesce(p_origin, '')), '')));

    perform custom.record_update(v_r.organization_id, (v_r.data ->> 'record_id')::uuid,
      jsonb_build_object(
        '_actor', 'user',
        v_r.data ->> 'field_key', to_jsonb(v_name),
        '_values', jsonb_build_object(v_r.data ->> 'field_key',
                                      jsonb_build_object('src', v_src))));

    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    raise;
  end;

  update custom.record r
     set data = jsonb_strip_nulls(r.data || jsonb_build_object(
           'signed_at',         now(),
           'signed_name',       v_name,
           'signature_id',      v_sig,
           'signature_file_id', v_file,
           'signature_mark',    v_mark,
           'signer_ip',         nullif(btrim(coalesce(p_ip, '')), ''),
           'signer_user_agent', left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512)))
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id
  returning r.data into v_r.data;

  -- THE PERSON WHO ASKED IS TOLD, through the one notification system.
  if v_asker is not null then
    perform custom.agg_deliver(
      v_r.organization_id, v_r.request_id, (v_r.data ->> 'record_id')::uuid, 'in_app', v_asker,
      'custom.signature.signed',
      format('Signed: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
      format('%s signed %s.', v_name, coalesce(v_r.data ->> 'document_title', 'the document')),
      jsonb_build_object('sign_request_id', v_r.request_id, 'signature_id', v_sig,
                         'source', 'signature'));
  end if;

  return jsonb_build_object('signed', true, 'found', true, 'state', 'signed',
                            'signature_id', v_sig, 'signature_file_id', v_file,
                            'document_hash', v_r.data ->> 'document_hash',
                            'message', custom.sign_request_sentence(v_r.data));
end;
$$;

