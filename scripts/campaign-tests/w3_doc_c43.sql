-- W3-DOC — REC-68 · VAL-10 · C-43, EXECUTED against the rehearsal branch.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_doc_c43.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it.
--
-- C-43, WORD FOR WORD: "A document template renders one record into a document whose text
-- contains the record's own field values; a signature block is signed, and the signed
-- document's stored hash changes when one character of the record changes, proving the block
-- binds to content."
--
-- 🚨 HOW PART H READS THAT CLAUSE, AND WHY IT PROVES MORE THAN THE LITERAL WORDS.
-- A stored hash that CHANGED would violate VAL-10's "immutable once signed" — the seal would
-- be following the record around, which is the opposite of a seal. So part H proves BOTH
-- halves and says so: the SEALED hash is unchanged after the edit (and an UPDATE of it is
-- refused by name), while the hash the SAME template now produces over the SAME record is
-- DIFFERENT, and `custom.doc_signature_intact` flips from `intact` to `broken` naming the
-- signer and the date. That is DocuSign's own semantic — a later edit invalidates the seal —
-- and it is what "the block binds to content" has to mean for the binding to be worth
-- anything.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3). Each is listed against its
-- part in the two migrations' own headers:
--   · `custom.doc_template_save` loses its `v_bad` branch            → B
--   · `custom.doc_unresolved_tokens` compares `f.key` not `f.id`     → A and B
--   · `custom.doc_token_pattern()` widened to accept any word        → B
--   · `custom.doc_format_value` loses its currency or unit arm       → D
--   · `custom.doc_render_body` substitutes the key not the format    → C and D
--   · `custom.doc_signature_field_ok` loses the format check         → E
--   · `custom.doc_signature_write` loses its prior-seal SELECT       → F
--   · `custom._doc_signature_immutable` returns new on UPDATE        → G
--   · `custom.doc_signature_intact` compares signed_at not the hash  → H
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): part
-- B refuses two DIFFERENT bad tokens with two DIFFERENT messages (one naming no Field at
-- all, one naming a Field of ANOTHER table) and saves one good one; part D asks four
-- formats for four different renderings; part E refuses a text field WITHOUT the signature
-- format and accepts the one with it; part F refuses a second seal on one document version
-- and ACCEPTS a seal on a second version; part H asserts one hash is unchanged and another
-- IS changed in the same breath. `return expected` survives none of them.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same act successfully
-- (rule 14). Its RED twin is `w3_doc_red.sql`, which removes this lane's refusals inside a
-- rolled-back transaction and proves the same writes then LAND.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_job     uuid;
  v_other   uuid;
  v_f_name  uuid;
  v_f_amt   uuid;
  v_f_rate  uuid;
  v_f_due   uuid;
  v_f_sig   uuid;
  v_f_notes uuid;
  v_o_name  uuid;
  v_tpl     uuid;
  v_rec     uuid;
  v_doc     uuid;
  v_doc2    uuid;
  v_sig     uuid;
  v_sig2    uuid;
  v_body    text;
  v_msg     text;
  v_hash1   text;
  v_hash2   text;
  v_sealed  text;
  v_n       integer;
  v_j       jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_doc_c43.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE — a Job table with six fields carrying four different units and
  -- formats, and a SECOND table with a field of its own, so "a Field of another
  -- table" is a real second input rather than a hypothetical.
  -- ══════════════════════════════════════════════════════════════════════════
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-DOC Job', 'slug', 'w3_doc_job', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(
      jsonb_build_object('name','client_name'), jsonb_build_object('name','amount'),
      jsonb_build_object('name','margin'),      jsonb_build_object('name','due'),
      jsonb_build_object('name','signature'),   jsonb_build_object('name','notes')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  v_other := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-DOC Supplier', 'slug', 'w3_doc_supplier', 'type', 'entity',
    'label_singular', 'Supplier', 'label_plural', 'Suppliers', 'title_field', 'supplier_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','supplier_name')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job))
  returning id into v_f_name;

  -- FLD-N-1: the UNIT is the currency and the FORMAT is currency, both on the Field.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount','label','Amount','type','range','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job,
    'unit','USD','format','currency'))
  returning id into v_f_amt;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','margin','label','Margin','type','range','sort',30,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,
    'rules', jsonb_build_array(jsonb_build_object('kind','min','spec',jsonb_build_object('value',0)),
                               jsonb_build_object('kind','max','spec',jsonb_build_object('value',100))),
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job,
    'unit','%','format','percent'))
  returning id into v_f_rate;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','due','label','Due','type','range','sort',40,'required',false,
    'multi',false,'dated',false,'source','manual','config',jsonb_build_object('kind','date'),
    'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_job,'format','date'))
  returning id into v_f_due;

  -- VAL-10: the signature Field — behaviour `text`, one of FLD-1's five, and format
  -- `signature`. Nothing about the closed behaviour set is widened to hold it.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','signature','label','Client signature','type','text','sort',50,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job,
    'format','signature'))
  returning id into v_f_sig;

  -- The SECOND input for part E: a text field that is NOT a signature field.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','notes','label','Notes','type','text','sort',60,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job))
  returning id into v_f_notes;

  -- A Field of ANOTHER table — part B's second input.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','supplier_name','label','Supplier name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_other))
  returning id into v_o_name;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. REC-68 — THE TEMPLATE IS A RECORD, AND ITS TOKENS ARE FIELD IDS.
  --    The POSITIVE CONTROL: a template whose every token resolves SAVES.
  -- ══════════════════════════════════════════════════════════════════════════
  v_tpl := custom.doc_template_save(v_org, v_job, 'Proposal', format(
    E'PROPOSAL for {{field:%s}}\n\nTotal: {{field:%s}}\nMargin: {{field:%s}}\nDue: {{field:%s}}\n\nSigned: {{field:%s}}\n',
    v_f_name, v_f_amt, v_f_rate, v_f_due, v_f_sig));

  if not exists (select 1 from custom.record r
                  where r.organization_id = v_org and r.id = v_tpl
                    and r.data_class = 'doc_template') then
    raise exception 'REC-68: a document template IS a Record, and % is not a row of custom.record', v_tpl;
  end if;
  select token_count into v_n from custom.doc_template where organization_id = v_org and id = v_tpl;
  if v_n <> 5 then
    raise exception 'REC-68: the template names five Fields and % tokens were found', v_n;
  end if;

  -- A NAME-KEYED TOKEN IS NOT A TOKEN. This is the whole difference between PandaDoc's
  -- mechanism and Google Docs' merge, and it is asserted rather than assumed.
  if (select count(*) from custom.doc_tokens('Hello {{field:client_name}} and {{Client name}}')) <> 0 then
    raise exception 'REC-68: a token names a Field by its ID. A name-keyed token was accepted, which is the merge that silently empties when somebody renames a column.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. REC-68 — A TOKEN NAMING NO FIELD IS REFUSED AT SAVE, BY NAME. Twice, for
  --    two different reasons, with two different messages.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    perform custom.doc_template_save(v_org, v_job, 'Broken',
      'Dear {{field:00000000-0000-4000-8000-000000000999}},');
    raise exception 'REC-68: a template naming a Field that does not exist was SAVED.';
  exception when sqlstate '23503' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%{{field:00000000-0000-4000-8000-000000000999}}%' then
      raise exception 'REC-68: the refusal has to name the token it refused, and it said: %', v_msg;
    end if;
    if v_msg not like '%there is no Field with that id%' then
      raise exception 'REC-68: the refusal has to say WHY, and it said: %', v_msg;
    end if;
  end;

  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: a real Field, of another table.
  begin
    perform custom.doc_template_save(v_org, v_job, 'Borrowed',
      'Supplier: {{field:' || v_o_name || '}}');
    raise exception 'REC-68: a template naming another table''s Field was SAVED.';
  exception when sqlstate '23503' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%belongs to another table%' then
      raise exception 'REC-68: a Field of another table is a DIFFERENT refusal, and it said: %', v_msg;
    end if;
  end;

  -- POSITIVE CONTROL, again and deliberately: the same call with a token that DOES resolve
  -- succeeds, so neither refusal above can have been a typo in the door.
  perform custom.doc_template_save(v_org, v_job, 'Receipt', 'Thank you, {{field:' || v_f_name || '}}.');

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. C-43 — THE DOCUMENT'S TEXT CONTAINS THE RECORD'S OWN FIELD VALUES.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_job, jsonb_build_object(
    '_actor', 'user',
    'client_name', 'Harborline Logistics',
    'amount',      1234.5,
    'margin',      12.5,
    'due',         '2026-11-03',
    'notes',       'first draft'));

  v_doc  := custom.doc_render_document(v_org, v_tpl, v_rec);
  select body, content_hash into v_body, v_hash1
    from custom.doc_render where organization_id = v_org and id = v_doc;

  if v_body not like '%Harborline Logistics%' then
    raise exception 'C-43: the rendered document does not contain the record''s own client name. It says: %', v_body;
  end if;
  if v_body like '%{{field:%' then
    raise exception 'C-43: the rendered document still carries an unresolved token, which is a merge printing its own plumbing to a client: %', v_body;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. REC-68 — WITH THE UNITS AND FORMATS THE FIELD CARRIES. Four formats, four
  --    different expected renderings; a merge cannot print a number the record
  --    does not hold.
  -- ══════════════════════════════════════════════════════════════════════════
  if v_body not like '%USD 1,234.50%' then
    raise exception 'REC-68: the amount Field carries unit USD and format currency, and the document says: %', v_body;
  end if;
  if v_body like '%1234.5%' and v_body not like '%USD 1,234.50%' then
    raise exception 'REC-68: the amount was printed raw, so the Field''s unit and format never reached the document: %', v_body;
  end if;
  if v_body not like '%12.5%%' then
    raise exception 'REC-68: the margin Field carries format percent, and the document says: %', v_body;
  end if;
  if v_body not like '%03 November 2026%' then
    raise exception 'REC-68: the due Field carries format date, and the document says: %', v_body;
  end if;
  -- The fourth: a Field with NO unit and NO format prints its plain value, so the three
  -- above cannot be a formatter that decorates everything it touches.
  if custom.doc_format_value(
       (select data from custom.record where organization_id = v_org and id = v_f_notes),
       to_jsonb('first draft'::text)) <> 'first draft' then
    raise exception 'REC-68: a Field with no unit and no format must print its value unchanged.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. VAL-10 — A SIGNATURE IS A VALUE ON A TEXT FIELD WHOSE FORMAT IS SIGNATURE.
  --    The closed behaviour set, unwidened: refused on the plain text Field,
  --    accepted on the signature one.
  -- ══════════════════════════════════════════════════════════════════════════
  if custom.doc_signature_field_ok(
       (select data from custom.record where organization_id = v_org and id = v_f_notes)) then
    raise exception 'VAL-10: a plain text Field was accepted as a signature field.';
  end if;
  if not custom.doc_signature_field_ok(
       (select data from custom.record where organization_id = v_org and id = v_f_sig)) then
    raise exception 'VAL-10: the text Field whose format is signature was NOT accepted as a signature field.';
  end if;
  begin
    perform custom.doc_sign(v_org, v_doc, 'notes', 'Someone');
    raise exception 'VAL-10: a signature was written on a Field that is not a signature field.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%signature is written on a text field whose format is signature%' then
      raise exception 'VAL-10: the refusal has to say what a signature field IS, and it said: %', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. VAL-10 — WRITTEN ONCE. The seal carries signer, time, hash and document
  --    version; a second write against the SAME document version is refused by
  --    name; a signature on a NEW document version SUCCEEDS.
  -- ══════════════════════════════════════════════════════════════════════════
  v_sig := custom.doc_sign(v_org, v_doc, 'signature', 'Dana Okafor');

  select signer_name, signed_at, document_hash, document_version
    into v_msg, v_j, v_sealed, v_n
    from (select signer_name, to_jsonb(signed_at) as signed_at, document_hash, document_version
            from custom.doc_signature where organization_id = v_org and id = v_sig) s;
  if v_msg <> 'Dana Okafor' then
    raise exception 'VAL-10: the seal has to carry its SIGNER, and it says %', v_msg;
  end if;
  if v_j is null then
    raise exception 'VAL-10: the seal has to carry its TIME.';
  end if;
  if v_sealed <> v_hash1 then
    raise exception 'VAL-10: the seal has to carry the document''s HASH. It says % and the document is %', v_sealed, v_hash1;
  end if;
  if v_n <> 1 then
    raise exception 'VAL-10: the seal has to carry the DOCUMENT VERSION it signed, and it says %', v_n;
  end if;

  -- And the signature IS A VALUE on the record, with the store's own envelope.
  select value, value_version into v_j, v_n
    from custom.value_read(v_org, v_rec, 'signature');
  if v_j #>> '{}' <> 'Dana Okafor' then
    raise exception 'VAL-10: a signature is a VALUE. The record''s signature value says %', v_j;
  end if;
  select (r.data -> '_sources' -> (r.data -> '_values' -> 'signature' ->> 'src')) into v_j
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if coalesce(v_j ->> 'document_hash', '') <> v_hash1
     or coalesce(v_j ->> 'document_version', '') <> '1' then
    raise exception 'VAL-10: the signature Value''s provenance has to name the document version it sealed and its hash, and it says %', v_j;
  end if;

  -- THE REFUSAL: the same document version, again.
  begin
    perform custom.doc_sign(v_org, v_doc, 'signature', 'Dana Okafor');
    raise exception 'VAL-10: the same document version was signed TWICE.';
  exception when sqlstate '23505' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%immutable once signed%' then
      raise exception 'VAL-10: the refusal has to say why, and it said: %', v_msg;
    end if;
  end;

  -- THE POSITIVE CONTROL, and it is the second input with a different expected value: a
  -- signature against a DIFFERENT document version of the same template on a DIFFERENT
  -- record succeeds, so the refusal above cannot be "signing is broken".
  declare
    v_rec2 uuid;
  begin
    v_rec2 := custom.record_write(v_org, v_job, jsonb_build_object(
      '_actor', 'user', 'client_name', 'Kettleby Freight', 'amount', 900, 'margin', 8,
      'due', '2026-12-01'));
    v_doc2 := custom.doc_render_document(v_org, v_tpl, v_rec2);
    v_sig2 := custom.doc_sign(v_org, v_doc2, 'signature', 'Priya Raman');
    if v_sig2 is null then
      raise exception 'VAL-10: a signature on a new document version must succeed.';
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. VAL-10 — IMMUTABLE ONCE SIGNED. Both halves, each refused BY NAME, each
  --    paired with the INSERT above that succeeded.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update custom.doc_signature set signer_name = 'Someone Else'
     where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a seal was UPDATED.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be changed%' then
      raise exception 'VAL-10: the refusal has to say a seal cannot be changed, and it said: %', v_msg;
    end if;
  end;
  begin
    delete from custom.doc_signature where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a seal was DELETED.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be removed%' then
      raise exception 'VAL-10: the refusal has to say a seal cannot be removed, and it said: %', v_msg;
    end if;
  end;
  -- And the DOCUMENT VERSION a seal points at cannot be rewritten from behind.
  begin
    update custom.doc_render set body = body || ' (amended)'
     where organization_id = v_org and id = v_doc;
    raise exception 'REC-68 / VAL-10: a sealed document version was EDITED.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be edited after the fact%' then
      raise exception 'the refusal has to say a rendered document cannot be edited, and it said: %', v_msg;
    end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. C-43 — THE BLOCK BINDS TO CONTENT. One character of the record changes;
  --    the SEALED hash does not move (VAL-10) and the hash the same template now
  --    produces DOES, and the seal reads BROKEN by name.
  -- ══════════════════════════════════════════════════════════════════════════
  v_j := custom.doc_signature_intact(v_org, v_sig);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the seal must be intact before anything is edited, and it says %', v_j ->> 'verdict';
  end if;

  -- ONE CHARACTER. "Harborline" becomes "Harborlino".
  perform custom.record_update(v_org, v_rec,
    jsonb_build_object('_actor', 'user', 'client_name', 'Harborlino Logistics'));

  select content_hash into v_sealed from custom.doc_render where organization_id = v_org and id = v_doc;
  if v_sealed <> v_hash1 then
    raise exception 'VAL-10: the SEALED document version''s hash moved when the record changed. A seal that follows the record around seals nothing.';
  end if;
  select document_hash into v_sealed from custom.doc_signature where organization_id = v_org and id = v_sig;
  if v_sealed <> v_hash1 then
    raise exception 'VAL-10: the SEAL''s hash moved when the record changed.';
  end if;

  v_hash2 := custom.doc_content_hash(custom.doc_render_body(v_org, v_tpl, v_rec));
  if v_hash2 = v_hash1 then
    raise exception 'C-43: one character of the record changed and the document hashes the same. The block does not bind to content.';
  end if;

  v_j := custom.doc_signature_intact(v_org, v_sig);
  if (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the record changed and the seal still reads intact: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'verdict') not like 'broken:%' then
    raise exception 'C-43: the verdict has to say the seal is broken, in words, and it says: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'verdict') not like '%Dana Okafor%' then
    raise exception 'C-43: the verdict has to name who signed it, and it says: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'sealed_hash') <> v_hash1 or (v_j ->> 'document_hash_now') <> v_hash2 then
    raise exception 'C-43: the verdict has to report BOTH hashes - the one that was sealed and the one the document produces now. It reports % and %',
                    v_j ->> 'sealed_hash', v_j ->> 'document_hash_now';
  end if;

  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: the OTHER seal, whose record nobody
  -- touched, is still intact in the same breath. A verdict function stuck on "broken"
  -- fails here.
  v_j := custom.doc_signature_intact(v_org, v_sig2);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the untouched record''s seal must still be intact, and it says %', v_j ->> 'verdict';
  end if;

  raise notice 'W3-DOC — A..H ALL GREEN. REC-68 and VAL-10 and C-43 hold on the rehearsal branch.';
end;
$t$;

rollback;
