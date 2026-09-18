-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W3-DOC — THE RENDER PATH (REC-68) AND THE SIGNATURE VALUE (VAL-10).
--
-- THE CHAMPIONS, NAMED. The merge is **PandaDoc's**: a token names a Field's id and resolves
-- through the Field, so the units and formats live in one place and a rename breaks nothing.
-- The seal is **DocuSign's**: a completed envelope is sealed with a certificate naming
-- signer, timestamp and a document hash, so a later edit invalidates the seal — and it is
-- invalidated VISIBLY, which is the half that matters. `custom.doc_signature_intact` is that
-- half: it re-renders the same template over the record as it stands now and says, in a
-- sentence, whether the record still says what the signed document says.
--
-- WHAT THE LAWS SAY, WORD FOR WORD
-- --------------------------------
--   REC-68  "A document template is a Record whose tokens are Field ids, and it renders with
--            the units and formats the Field carries, so a merge cannot print a number the
--            record does not hold."
--   VAL-10  "A signature is a Value that is immutable once signed and carries its signer,
--            its time, its hash and the document version it signed."
--
-- A SIGNATURE IS A VALUE, THROUGH THE CLOSED BEHAVIOUR SET — NEVER A NEW BEHAVIOUR
-- -------------------------------------------------------------------------------
-- FLD-1's set is closed: list · range · text · relation · formula. A signature is a **text**
-- Field whose **format** is `signature` — a format is what a value MEANS (FLD-N-1), and it
-- is already an open string on the Field, so nothing is widened to hold one. The VALUE is
-- what the signer typed. Its signer, its time and its version come from the store's own
-- value envelope (`actor`, `at`, `ver`), and its HASH and DOCUMENT VERSION come from the
-- store's own INTERNED PROVENANCE — `_sources`, which is a free-shaped object describing
-- where a value came from, and a signature came from a document.
--
-- 🚨 THAT IS A DELIBERATE REFUSAL TO WIDEN THE ENVELOPE, not a workaround. The envelope's
-- key set is CLOSED (`custom.value_envelope_keys()` — ver, src, actor, on_behalf_of, at,
-- absent, alternates) and `custom.value_envelope_refusal` refuses anything else by name.
-- Adding a `hash` key would be this lane quietly editing another lane's law to fit its own
-- feature, which is exactly what "think in platform primitives" forbids in the other
-- direction. Provenance is the primitive that already answers "where did this value come
-- from", and the answer here is "from document version N, whose SHA-256 is X".
--
-- 🚨 WHAT THIS LANE CANNOT ENFORCE, SAID OUT LOUD RATHER THAN IMPLIED (law 4).
-- "Immutable once signed" is enforced in three places and NOT in a fourth:
--   ① the SEAL ROW is immutable — `custom._doc_signature_immutable` refuses every UPDATE and
--     every DELETE on `custom.doc_signature`, by name;
--   ② a SECOND seal against the same document version is impossible — a unique index on
--     (organization_id, render_id), with `custom.doc_signature_write`'s named refusal saying
--     who signed it and when;
--   ③ the DOOR refuses to overwrite a signed Value — `custom.doc_sign` reads the record's
--     current value for that Field and refuses when a seal already stands behind it;
--   ④ a direct `custom.record_update` on a signed Field is NOT refused, because refusing it
--     needs a trigger on `custom.record`, and `custom.record` is covered by `LOCK:custom`,
--     which is another lane's (§4.1, §4.7). This lane holds no lock and does not touch
--     another lane's object to get its own feature finished.
-- ④ FAILS LOUDLY INSTEAD OF SILENTLY: `custom.doc_signature_intact` compares the seal
-- against BOTH a fresh render AND the record's current signature Value, and reports
-- `value_tampered` by name when the Value under a seal has moved. The missing trigger is
-- named here, with its lock, so the lane that holds `LOCK:custom` can add it in one line —
-- it is a gap with an owner, not a gap nobody wrote down.
--
-- WHAT MAKES THE TESTS FAIL — THE PRODUCTION CHANGES, NAMED (rule 3)
-- ------------------------------------------------------------------
--   · Make `custom.doc_render_body` substitute `f.key` rather than `custom.doc_format_value`
--     → part D fails: the unit and format the Field carries stop reaching the document.
--   · Delete the prior-seal SELECT in `custom.doc_signature_write` → part F fails: a second
--     signature against one document version lands.
--   · Make `custom._doc_signature_immutable` `return new` on UPDATE → part G fails.
--   · Make `custom.doc_signature_intact` compare `signed_at` instead of the hash → part H
--     fails: editing the record no longer breaks the seal.
--   · Delete the `format = 'signature'` check from `custom.doc_signature_field_ok` → part E
--     fails: any field at all becomes a signature field.
--
-- THE INVERSE: `migrations/inverse/w3_doc_the_render_path_and_the_signature_value_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE HASH. One definition, so the render, the seal and the check cannot disagree.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_content_hash(p_body text)
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  select encode(sha256(convert_to(coalesce(p_body, ''), 'UTF8')), 'hex');
$$;

comment on function custom.doc_content_hash(text) is
  'VAL-10: the SHA-256 a signature seals. One definition, so a render and a seal cannot hash the same text differently. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. THE MERGE. REC-68, both halves: tokens are Field IDS, and every value is rendered
--    with the unit and format ITS FIELD carries.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_render_body(
  p_organization_id uuid, p_template_id uuid, p_record_id uuid)
returns text
language plpgsql stable set search_path = pg_catalog as $$
declare
  v_tpl    record;
  v_rec    record;
  v_values jsonb;
  v_out    text;
  v_tok    record;
  v_field  jsonb;
begin
  select t.data ->> 'body' as body,
         (t.data ->> 'renders_table_id')::uuid as renders_table_id
    into v_tpl
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_template_id
     and t.data_class = 'doc_template' and t.deleted_at is null;
  if v_tpl.renders_table_id is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  select r.table_id into v_rec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id
     and r.deleted_at is null;
  if v_rec.table_id is null then
    raise exception 'there is no record % in this organization', p_record_id
      using errcode = '02000';
  end if;
  if v_rec.table_id is distinct from v_tpl.renders_table_id then
    raise exception 'this template renders a different kind of record than %', p_record_id
      using errcode = '22023',
            hint = 'REC-68: a template''s tokens are the Fields of ONE Table, so it renders the records of that Table and of no other. Pick the template that belongs to this record''s table.';
  end if;

  -- The record's own values, through the store's own read — which folds in computed and
  -- derived Values, so a formula Field merges as the answer a reader sees.
  v_values := coalesce(custom.record_values(p_organization_id, p_record_id), '{}'::jsonb);

  v_out := v_tpl.body;
  for v_tok in
    select distinct t.raw, t.field_id from custom.doc_tokens(v_tpl.body) t
  loop
    select f.data into v_field
      from custom.field f
     where f.organization_id = p_organization_id and f.id = v_tok.field_id;
    -- A token that reaches here and resolves to nothing cannot happen through
    -- custom.doc_template_save, which refuses it at save (REC-68). It can happen when the
    -- FIELD was deleted after the template was saved, and then the honest render is an
    -- empty space: a document that prints {{field:...}} to a client is the merge lying
    -- about what the record holds.
    v_out := replace(v_out, v_tok.raw,
                     case when v_field is null then ''
                          else custom.doc_format_value(v_field, v_values -> (v_field ->> 'key'))
                     end);
  end loop;
  return v_out;
end;
$$;

comment on function custom.doc_render_body(uuid, uuid, uuid) is
  'REC-68: the merge. Every token resolved through its Field and formatted with the unit and format that Field carries. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. THE RENDER PATH — one record, one document version.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_render_document(
  p_organization_id uuid, p_template_id uuid, p_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_body text;
  v_ver  integer;
  v_tbl  uuid;
begin
  -- THE DOOR. One call to the ONE predicate, which resolves this file's guard
  -- (custom/system_enabled) through platform.knob_resolve and judges custom.caller_role().
  perform custom.assert_store_door(p_organization_id, 'custom.doc_render_document');

  select coalesce((t.data ->> 'template_version')::integer, 1),
         (t.data ->> 'renders_table_id')::uuid
    into v_ver, v_tbl
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_template_id
     and t.data_class = 'doc_template' and t.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  v_body := custom.doc_render_body(p_organization_id, p_template_id, p_record_id);

  return custom.doc_render_write(p_organization_id, p_template_id, p_record_id, v_tbl,
                                 v_ver, v_body, custom.doc_content_hash(v_body));
end;
$$;

comment on function custom.doc_render_document(uuid, uuid, uuid) is
  'REC-68: renders one record through one document template into one document version, stored with its SHA-256. W3-DOC.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'doc_render_document', 'p_organization_id uuid, p_template_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'REC-68. p_organization_id is the tenant and is the leading key of every read and of the row written — the template read, the record read, the Field reads behind the merge and the custom.doc_render insert are all keyed on it, so a caller cannot render one organization''s record through another''s template or under another''s key; null is refused with 22004 by the write door. p_template_id must be a doc_template Record of that organization, refused with 02000 when it is not. p_record_id must be a Record of that organization AND of the Table the template renders, refused with 02000 when absent and 22023 when it belongs to another Table — a template''s tokens are the Fields of ONE Table.',
   'migrations/campaign/w3_doc_the_render_path_and_the_signature_value.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The document surface is W6-DOCS''s and calls this door server-side; the client grant is switch-checklist work, never a lane''s.',
   false, false,
   jsonb_build_object(
     'p_organization_id', 'the tenant; the leading key of every read and of the row written. null refused 22004.',
     'p_template_id',     'a doc_template Record of that organization. absent refused 02000.',
     'p_record_id',       'a Record of that organization AND of the Table the template renders. absent refused 02000, wrong table refused 22023.'))
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. WHICH FIELDS CAN HOLD A SIGNATURE — the closed behaviour set, unwidened.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_signature_field_ok(p_field_data jsonb)
returns boolean language sql immutable parallel safe set search_path = pg_catalog as $$
  -- VAL-10 through FLD-1's CLOSED set: behaviour `text` — one of the five, nothing added —
  -- and format `signature`, which is what the value MEANS (FLD-N-1). `custom.parity_type`
  -- is deliberately NOT extended: its thirteen types are the Airtable/Notion PARITY floor
  -- and belong to W1-FIELD-TYPES, and a signature is not one of them.
  select coalesce(p_field_data ->> 'type', '') = 'text'
     and coalesce(p_field_data ->> 'format', '') = 'signature';
$$;

comment on function custom.doc_signature_field_ok(jsonb) is
  'VAL-10: a signature Value lives on a text Field whose format is signature - the closed behaviour set, never a new behaviour. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. THE SEAL IS IMMUTABLE. A RETURNS trigger, reading the ONE predicate.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom._doc_signature_immutable()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare
  v_row record := coalesce(new, old);   -- `new` is unassigned on DELETE; reading it raises
begin
  -- THE DOOR. One call to the ONE predicate, exactly as every other RETURNS trigger in this
  -- schema. The switch decides WHO may write and never which check runs: everything below
  -- runs whether it is on or off, because "immutable once signed" is not a product option.
  perform custom.assert_store_door(v_row.organization_id, 'custom.doc_signature');

  if tg_op = 'INSERT' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'this signature was made on % and cannot be changed', to_char(old.signed_at, 'FMDD Month YYYY "at" HH24:MI')
      using errcode = '42501',
            hint = 'VAL-10: a signature is immutable once signed - that is the whole of what a signature is worth. Nothing changes a seal, and the store''s own switch custom/system_enabled does not open this either. If the document needs signing again, render it again: custom.doc_render_document gives a new document version, and a signature on THAT version is a new seal standing beside this one.';
  end if;

  raise exception 'this signature was made on % and cannot be removed', to_char(old.signed_at, 'FMDD Month YYYY "at" HH24:MI')
    using errcode = '42501',
          hint = 'VAL-10: a seal is the evidence that somebody agreed to something, and evidence that can be deleted by whoever it inconveniences is not evidence. It names its signer, its time, its hash and the document version it signed, and it keeps naming them.';
end;
$$;

create trigger doc_signature_immutable
  before update or delete on custom.doc_signature
  for each row execute function custom._doc_signature_immutable();

-- A RENDERED DOCUMENT IS AN ARTEFACT, AND A SEALED ONE IS EVIDENCE. Letting `body`,
-- `content_hash` or `template_version` be edited would break a seal from behind, which is
-- the one way ② and ③ above could be walked around without touching `custom.doc_signature`
-- at all.
create function custom._doc_render_immutable()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  -- THE DOOR. The ONE predicate, same as everywhere.
  perform custom.assert_store_door(new.organization_id, 'custom.doc_render');

  if new.body is distinct from old.body
     or new.content_hash is distinct from old.content_hash
     or new.template_version is distinct from old.template_version
     or new.template_id is distinct from old.template_id
     or new.record_id is distinct from old.record_id then
    raise exception 'a rendered document cannot be edited after the fact'
      using errcode = '42501',
            hint = 'REC-68 / VAL-10: a document VERSION is a fixed thing - it is what a signature seals, and a version that can be rewritten seals nothing. Render the document again with custom.doc_render_document; that gives a new version, and this one stays exactly as it was read and signed.';
  end if;
  return new;
end;
$$;

create trigger doc_render_immutable
  before update on custom.doc_render
  for each row execute function custom._doc_render_immutable();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. SIGNING — the Value on the record AND the seal, in one transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_sign(
  p_organization_id uuid,
  p_render_id       uuid,
  p_field_key       text,
  p_signer_name     text,
  p_signer_user_id  uuid default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_doc    record;
  v_field  jsonb;
  v_have   jsonb;
  v_prior  uuid;
begin
  -- THE DOOR. One call to the ONE predicate.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_sign');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.doc_sign: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.content_hash, d.template_version, d.template_id
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature seals a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  -- VAL-10: the Value a signature IS. It lives on a Field of the record's own Table, and
  -- that Field is a text Field whose format is signature — FLD-1's closed behaviour set,
  -- unwidened. A Field that is not one is refused BY NAME, naming the ones that are.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('VAL-10 through FLD-1''s closed set: one of list, range, text, relation, formula, and a signature is text. The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ③ THE DOOR REFUSES TO OVERWRITE A SIGNED VALUE. A seal already standing behind this
  -- Field's value on this record is what makes it immutable through every door this lane
  -- owns; ④ in this file's header names the one path that is not covered and who owns it.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, and a signature is immutable once signed',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10. Every seal on this record stays exactly as it was made. A further agreement is a further Field with its own signature, or a further document version with its own seal - never a rewriting of this one.';
  end if;

  -- THE VALUE. Written through the store's OWN door, so the envelope law stamps its version,
  -- its author and its time exactly as it does for every other Value, and the interned
  -- provenance carries the two facts the CLOSED envelope has no key for: the document
  -- version this signature sealed, and its hash.
  perform custom.record_update(p_organization_id, v_doc.record_id,
    jsonb_build_object(
      '_actor', 'user',
      p_field_key, to_jsonb(btrim(p_signer_name)),
      '_values', jsonb_build_object(
        p_field_key, jsonb_build_object(
          'src', jsonb_build_object(
            'kind',             'signed_document',
            'render_id',        p_render_id,
            'template_id',      v_doc.template_id,
            'document_version', v_doc.template_version,
            'document_hash',    v_doc.content_hash)))));

  -- THE SEAL, through this table's one write door.
  return custom.doc_signature_write(p_organization_id, p_render_id, v_doc.record_id,
                                    p_field_key, p_signer_name, p_signer_user_id,
                                    v_doc.content_hash, v_doc.template_version);
end;
$$;

comment on function custom.doc_sign(uuid, uuid, text, text, uuid) is
  'VAL-10: signs one rendered document version - the Value on the record through the store''s own door, and the seal that names signer, time, hash and document version. Written once; a second write against the same document version is refused by name. W3-DOC.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'doc_sign', 'p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'VAL-10. p_organization_id is the tenant and is the leading key of the document read, the Field read, the prior-seal read, the record write and the seal write, so a caller cannot sign another organization''s document or write a seal under another organization''s key; null is refused with 22004. p_render_id must be a custom.doc_render row of that organization, refused with 02000 when absent; the record and the table it names come FROM that row rather than from the caller, so a caller cannot point a seal at a record the document was not rendered from. p_field_key must name a Field of that record''s own Table (refused 23503) that is a text Field whose format is signature (refused 23514, naming the fields that are). p_signer_name is required and blank is refused with 23514 by the write door. p_signer_user_id is null for an outside signer with no account of ours, which is legal. A Field of this record that already carries a seal is refused with 23505.',
   'migrations/campaign/w3_doc_the_render_path_and_the_signature_value.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The signing surface is W6-DOCS''s and calls this door server-side; the client grant is switch-checklist work, never a lane''s.',
   false, false,
   jsonb_build_object(
     'p_organization_id', 'the tenant; the leading key of every read and both writes. null refused 22004.',
     'p_render_id',       'a custom.doc_render row of that organization; the record and table come from IT, never from the caller. absent refused 02000.',
     'p_field_key',       'a Field of that record''s Table, text with format signature. unknown refused 23503, wrong shape refused 23514, already sealed refused 23505.',
     'p_signer_name',     'who signed, as they signed it. blank refused 23514.',
     'p_signer_user_id',  'the account that signed; null means an outside signer with no account of ours.'))
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. IS THE SEAL STILL GOOD? DocuSign's half that matters: an edit invalidates the seal,
--    VISIBLY. Nothing here can change a seal; it only says what the seal now means.
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.doc_signature_intact(p_organization_id uuid, p_signature_id uuid)
returns jsonb
language plpgsql stable set search_path = pg_catalog as $$
declare
  v_sig   record;
  v_doc   record;
  v_now   text;
  v_hash  text;
  v_value jsonb;
  v_ver   integer;
begin
  select s.render_id, s.record_id, s.field_key, s.signer_name, s.signed_at,
         s.document_hash, s.document_version
    into v_sig
    from custom.doc_signature s
   where s.organization_id = p_organization_id and s.id = p_signature_id;
  if v_sig.render_id is null then
    raise exception 'there is no signature % in this organization', p_signature_id
      using errcode = '02000';
  end if;

  select d.template_id, d.body, d.content_hash, d.template_version into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = v_sig.render_id;

  -- What the same template says about this record NOW.
  v_now  := custom.doc_render_body(p_organization_id, v_doc.template_id, v_sig.record_id);
  v_hash := custom.doc_content_hash(v_now);

  -- And what the record now says the signature Value is — ④'s loud half.
  select vr.value, vr.value_version into v_value, v_ver
    from custom.value_read(p_organization_id, v_sig.record_id, v_sig.field_key) vr;

  return jsonb_build_object(
    'signature_id',      p_signature_id,
    'signer',            v_sig.signer_name,
    'signed_at',         v_sig.signed_at,
    'document_version',  v_sig.document_version,
    'sealed_hash',       v_sig.document_hash,
    'document_hash_now', v_hash,
    'document_unchanged', v_hash = v_sig.document_hash,
    'value_unchanged',   coalesce(v_value #>> '{}', '') = v_sig.signer_name,
    'value_now',         v_value,
    'intact',            v_hash = v_sig.document_hash
                         and coalesce(v_value #>> '{}', '') = v_sig.signer_name,
    'verdict',
      case
        when v_hash <> v_sig.document_hash
             and coalesce(v_value #>> '{}', '') <> v_sig.signer_name
          then format('broken: the record has changed since %s signed this on %s, and the signature value on the record no longer says "%s" either.',
                      v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'), v_sig.signer_name)
        when v_hash <> v_sig.document_hash
          then format('broken: the record has changed since %s signed this on %s, so the document no longer says what was signed. The seal itself is untouched - render the document again and have it signed again.',
                      v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'))
        when coalesce(v_value #>> '{}', '') <> v_sig.signer_name
          then format('value_tampered: the document still says exactly what %s signed, but the signature value on the record has been changed to %s. The seal is what stands.',
                      v_sig.signer_name, coalesce(v_value::text, 'nothing'))
        else format('intact: the record still says exactly what %s signed on %s.',
                    v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'))
      end);
end;
$$;

comment on function custom.doc_signature_intact(uuid, uuid) is
  'VAL-10 / DocuSign: re-renders the sealed template over the record as it stands now and says, in a sentence, whether the record still says what the signed document says. It changes nothing. W3-DOC.';
