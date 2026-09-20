-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.sign_request_sign(text, text, text, text, text, text, text) 5d74c05540cfaf534e9f5d0822544294b94121f05155f101797378dd5754b8cb
--
-- LANE ESIGN — THE DRAWN SIGNATURE IS WRITTEN AS THE PERSON WHO ASKED, TOO.
--
-- THE SECOND HALF OF THE DEFECT THE PREVIOUS FILE CLOSED, and it was found the same way: by
-- drawing a signature on a phone-width browser and pressing the button. The page came back
-- carrying the store's own sentence,
--
--     You are not a member of that organization, so custom.table_type_field has nothing to
--     do there.
--
-- The freshness check had already been moved under the asker's claims. The FILE holding the
-- drawn mark had not: it was inserted into `custom.record` a few statements earlier, while
-- the session still carried no principal at all, and the record store's own insert path asks
-- the same membership question the merge does.
--
-- THE FIX is one move, not a new permission: the File write goes inside the borrow-and-
-- restore block that already wraps `custom.doc_sign`, so the image, the Value and the seal
-- are all written as the person who asked, in one transaction, with the same restore on the
-- exception path. Nothing about who may sign, what is checked, or what the seal contains
-- changes.

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

    -- THE DRAWN MARK IS A FILE, because that is what an image is on this platform (REC-27)
    -- and because a signature people can see has to be a thing the rest of the system can
    -- show, print and attach - never a blob wedged into one feature's own column.
    --
    -- IT IS WRITTEN INSIDE THE BORROW, AND THAT IS THE SECOND HALF OF THE SAME DEFECT THE
    -- FRESHNESS CHECK HAD. Written above this block it went in with NO principal, and the
    -- record store's own insert path asks a membership question through
    -- custom.table_type_field - so the first real signature drawn in a browser came back as
    -- *"You are not a member of that organization, so custom.table_type_field has nothing to
    -- do there."* The File belongs to the ASKER's organization and is written on their
    -- behalf, exactly as the Value below is; it carries the SIGNER's name and nothing of
    -- the asker's.
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
