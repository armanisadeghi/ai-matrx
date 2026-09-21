-- W3-DOC — REC-68 · VAL-10 · C-43, ON THE MAIN DATABASE, FROM THE SEAT `authenticated`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_doc_c43.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK. Everything it makes — one
-- disposable organization, its memberships, its Home, its Tables, its Fields, its templates,
-- its documents, its seals and one knob override — disappears with it.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19). Two things were wrong with this
-- file and they hid each other:
--   · IT RAN ON THE REHEARSAL BRANCH — a copy carrying 226 functions in schema `custom`
--     against main's 332 and granting a client 29 of them against main's 103. The owner's
--     2026-09-18 ruling is that there is no production: everything is the main database. It
--     now runs there, on a DISPOSABLE organization of its own rather than inside the Matrx
--     System organization, so it cannot collide with anybody's live data.
--   · IT RAN EVERY CLAUSE AS THE ROLE THAT OWNS `custom.record`. In that seat
--     `custom.assert_client_may_reach` returns TRUE on its first line, EXECUTE grants are
--     free, SECURITY INVOKER and SECURITY DEFINER are the same thing, and `custom.record`,
--     `custom.doc_template`, `custom.doc_render` and `custom.doc_signature` are all directly
--     readable and writable. So the document surface's whole subject — "what a signed-in
--     person can render, sign and be told about a seal" — was never asked. It now builds its
--     fixtures as the connected role, takes the seat in PART 0, ASSERTS that it holds it, and
--     runs every asserted product clause through the six doors a signed-in person reaches:
--     `custom.doc_template_save`, `custom.doc_template_read`, `custom.doc_render_document`,
--     `custom.doc_render_read`, `custom.doc_sign` and `custom.doc_signature_read` — plus
--     `custom.table_declare`, `custom.field_declare`, `custom.record_write`,
--     `custom.record_update`, `custom.value_read` and `custom.share_grant`.
--
-- WHAT STEPS OUT OF THE SEAT, AND WHY. Exactly two things, each saying so where it happens
-- and asserting no product clause while out:
--   · THE FIXTURES a person's browser never makes — the organization, the two memberships,
--     the store switch and the Home record (a Home is made by the onboarding path).
--   · PART G's SECOND WALL. `custom.doc_signature` and `custom.doc_render` hold no grant of
--     any kind for `authenticated`, so from the seat an UPDATE of a seal is refused for
--     having no privilege — and that IS asserted from the seat, first. The store's own
--     immutability trigger stands BEHIND that grant wall, where no client door can reach it,
--     so the three clauses that read the trigger's own sentences step out and say so.
--
-- C-43, WORD FOR WORD: "A document template renders one record into a document whose text
-- contains the record's own field values; a signature block is signed, and the signed
-- document's stored hash changes when one character of the record changes, proving the block
-- binds to content."
--
-- 🚨 HOW PART H READS THAT CLAUSE, AND WHY IT PROVES MORE THAN THE LITERAL WORDS.
-- A stored hash that CHANGED would violate VAL-10's "immutable once signed" — the seal would
-- be following the record around, which is the opposite of a seal. So part H proves BOTH
-- halves and says so: the SEALED hash is unchanged after the edit, while the hash the SAME
-- template now produces over the SAME record is DIFFERENT, and the verdict
-- `custom.doc_signature_read` carries flips from intact to `broken:` naming the signer and
-- the date. That is DocuSign's own semantic — a later edit invalidates the seal — and it is
-- what "the block binds to content" has to mean for the binding to be worth anything.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3):
--   · `custom.doc_template_save` loses its `v_bad` branch            → B
--   · `custom.doc_unresolved_tokens` compares `f.key` not `f.id`     → A and B
--   · `custom.doc_token_pattern()` widened to accept any word        → A
--   · `custom.doc_format_value` loses its currency or unit arm       → D
--   · `custom.doc_render_body` substitutes the key not the format    → C and D
--   · `custom.doc_signature_field_ok` loses the format check         → E
--   · `custom.doc_sign` loses its prior-seal SELECT                  → F
--   · `custom._doc_signature_immutable` returns new on UPDATE        → G
--   · `custom.doc_signature_intact` compares signed_at not the hash  → H
--   · `custom.assert_client_may_change` stops asking about editor    → I
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): part
-- B refuses two DIFFERENT bad tokens with two DIFFERENT messages (one naming no Field at
-- all, one naming a Field of ANOTHER table) and saves one good one; part D asks four
-- formats for four different renderings; part E refuses a text field WITHOUT the signature
-- format and accepts the one with it; part F refuses a second seal on one document version
-- and ACCEPTS a seal on a second version; part H asserts one hash is unchanged and another
-- IS changed in the same breath; part I refuses `test@test.com` the signature and lets her
-- read the very same document. `return expected` survives none of them.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same act successfully
-- (rule 14). Its RED twin is `w3_doc_red.sql`.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
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
  v_tpl_pl  uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_doc     uuid;
  v_doc2    uuid;
  v_docpl   uuid;
  v_sig     uuid;
  v_sig2    uuid;
  v_body    text;
  v_msg     text;
  v_hash1   text;
  v_hash2   text;
  v_sealed  text;
  v_n       integer;
  v_j       jsonb;
  v_src     jsonb;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w3_doc_c43.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURES NO CLIENT DOOR COVERS, as the connected role. Nothing is
  -- asserted here: a person's browser makes none of these.
  -- ════════════════════════════════════════════════════════════════════════════
  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and the store reaches that table on every containment write.
  perform set_config('app.actor_system', 'campaign-test/w3_doc_c43', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Fairhaven Steelworks — Drafting Room', 'fairhaven-steelworks-drafting-' || substr(v_org::text, 1, 8), 'FHS', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_doc_c43');

  -- A Home record has no client door of its own (a Home is made by the onboarding path, not
  -- by a person's browser), so it is built here, before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  -- AND THE DOCUMENT SURFACE'S OWN THREE TABLES ARE REACHED ONLY THROUGH ITS DOORS. This is
  -- what makes every clause below a statement about `custom.doc_*` rather than about SQL.
  begin
    perform 1 from custom.doc_template limit 1;
    raise exception '0: this seat can read custom.doc_template directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from custom.doc_render limit 1;
    raise exception '0: this seat can read custom.doc_render directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from custom.doc_signature limit 1;
    raise exception '0: this seat can read custom.doc_signature directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record and all three doc tables refuse a direct read.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE, THROUGH THE DOORS — a Job table with six fields carrying four
  -- different units and formats, and a SECOND table with a field of its own, so
  -- "a Field of another table" is a real second input rather than a hypothetical.
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
    'parent_id', v_home::text));

  v_other := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-DOC Supplier', 'slug', 'w3_doc_supplier', 'type', 'entity',
    'label_singular', 'Supplier', 'label_plural', 'Suppliers', 'title_field', 'supplier_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','supplier_name')),
    'parent_id', v_home::text));

  v_f_name := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  -- FLD-N-1: the UNIT is the currency and the FORMAT is currency, both on the Field. Asked
  -- for the way a person asks — `type: currency` — so the document's rendering is proof
  -- about a Field a person could actually have made.
  v_f_amt := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','amount','label','Amount','type','currency','unit','USD','sort',20));

  v_f_rate := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','margin','label','Margin','type','percent','sort',30));

  v_f_due := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','due','label','Due','type','datetime','kind','date','sort',40));

  -- VAL-10: the signature Field — behaviour `text`, one of FLD-1's five, and format
  -- `signature`. Nothing about the closed behaviour set is widened to hold it.
  v_f_sig := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','signature','label','Client signature','plain','text','format','signature','sort',50));

  -- The SECOND input for part E: a text field that is NOT a signature field.
  v_f_notes := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','notes','label','Notes','plain','text','sort',60));

  -- A Field of ANOTHER table — part B's second input.
  v_o_name := custom.field_declare(v_org, v_other, jsonb_build_object(
    'key','supplier_name','label','Supplier name','plain','text','sort',10));

  -- THE FIELDS ARE THE TABLE'S OWN COLUMNS, as the person's screen is told them.
  select count(*) into v_n from custom.applicable_fields(v_org, v_job, null);
  if v_n <> 6 then
    raise exception 'the Job table answers % column(s) through custom.applicable_fields, and six were declared', v_n;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. REC-68 — THE TEMPLATE IS A RECORD, AND ITS TOKENS ARE FIELD IDS.
  --    The POSITIVE CONTROL: a template whose every token resolves SAVES.
  -- ══════════════════════════════════════════════════════════════════════════
  v_tpl := custom.doc_template_save(v_org, v_job, 'Proposal', format(
    E'PROPOSAL for {{field:%s}}\n\nTotal: {{field:%s}}\nMargin: {{field:%s}}\nDue: {{field:%s}}\n\nSigned: {{field:%s}}\n',
    v_f_name, v_f_amt, v_f_rate, v_f_due, v_f_sig));

  -- REC-68: a document template IS a Record, and the person reads it back as one.
  if (custom.record_resolve(v_org, v_tpl) ->> 'live')::boolean is not true then
    raise exception 'REC-68: a document template IS a Record, and the store does not answer for % as one', v_tpl;
  end if;
  v_j := custom.doc_template_read(v_org, v_tpl);
  if (v_j ->> 'token_count')::integer <> 5 then
    raise exception 'REC-68: the template names five Fields and the door reports % token(s)', v_j ->> 'token_count';
  end if;
  if (v_j ->> 'renders_table_id')::uuid <> v_job then
    raise exception 'REC-68: a template renders the records of ONE Table, and this one says %', v_j ->> 'renders_table_id';
  end if;

  -- A NAME-KEYED TOKEN IS NOT A TOKEN. This is the whole difference between PandaDoc's
  -- mechanism and Google Docs' merge, and it is asserted rather than assumed — through the
  -- door, because `custom.doc_tokens` holds no client grant: a body whose only "tokens" are
  -- a field KEY and a field NAME saves with zero tokens rather than five, and a rename would
  -- therefore have nothing to break.
  -- (The save and the read are two statements on purpose: `custom.doc_template_read` is
  -- STABLE, so inside one statement it would read the snapshot taken before the VOLATILE
  -- save and answer "there is no document template" about the row just written.)
  -- 🚨 RE-PINNED, AND THE PROMISE GOT BETTER (lane RED-SUITES-3, 2026-09-21). This clause used
  -- to save a name-keyed body and require the door to count ZERO tokens. Saving it at all was
  -- the defect: `custom.doc_token_pattern()` matches `{{field:<uuid>}}` and nothing else, so
  -- `{{field:client_name}}` was not a token, passed the save untouched, was absent from
  -- `custom.doc_unresolved_tokens` — and RENDERED INTO THE DOCUMENT AS ITSELF. A proposal
  -- handed to a customer with `{{field:salary}}` printed in it is the merge lying about what
  -- it merged. `docgen_a_template_is_the_tables_wording.sql` refuses it AT SAVE now, in the
  -- same sentence and the same place as a wrong id, with the table's real columns listed.
  -- So the clause asserts the refusal, by the door's own words, with the positive control
  -- immediately after it: the SAME body with the SAME text written as a real id saves and
  -- counts one token.
  begin
    perform custom.doc_template_save(v_org, v_job, 'Name-keyed',
              'Hello {{field:client_name}} and {{Client name}}');
    raise exception 'REC-68: a template whose token names a column by WORD was saved, and it would render "{{field:client_name}}" into a document somebody is about to sign';
  exception when sqlstate '23503' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%names no column of this table%' then
      raise exception 'REC-68: the name-keyed token was refused for another reason: "%"', v_msg;
    end if;
  end;
  -- the positive control: the same sentence with the token written as the Field's ID lands.
  v_tpl_pl := custom.doc_template_save(v_org, v_job, 'Name-keyed',
                'Hello {{field:' || v_f_name || '}} and {{Client name}}');
  v_j := custom.doc_template_read(v_org, v_tpl_pl);
  if (v_j ->> 'token_count')::integer <> 1 then
    raise exception 'REC-68: the id-keyed control counted % token(s), expected 1', v_j ->> 'token_count';
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

  v_doc := custom.doc_render_document(v_org, v_tpl, v_rec);
  v_j   := custom.doc_render_read(v_org, v_doc);
  v_body  := v_j ->> 'body';
  v_hash1 := v_j ->> 'content_hash';
  if (v_j ->> 'document_version')::integer <> 1 then
    raise exception 'C-43: the first render of a template is document version 1, and the door says %', v_j ->> 'document_version';
  end if;

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
  if v_body not like '%3 November 2026%' then
    raise exception 'REC-68: the due Field carries format date, and the document says: %', v_body;
  end if;
  -- THE FOURTH: a Field with NO unit and NO format prints its plain value, so the three
  -- above cannot be a formatter that decorates everything it touches. Asked through the
  -- SAME door — `custom.doc_format_value` holds no client grant — by rendering a template
  -- whose one token is the plain Field.
  v_tpl_pl := custom.doc_template_save(v_org, v_job, 'Plain', 'NOTE[{{field:' || v_f_notes || '}}]');
  v_docpl  := custom.doc_render_document(v_org, v_tpl_pl, v_rec);
  if (custom.doc_render_read(v_org, v_docpl) ->> 'body') <> 'NOTE[first draft]' then
    raise exception 'REC-68: a Field with no unit and no format must print its value unchanged, and the document says: %',
                    custom.doc_render_read(v_org, v_docpl) ->> 'body';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. VAL-10 — A SIGNATURE IS A VALUE ON A TEXT FIELD WHOSE FORMAT IS SIGNATURE.
  --    The closed behaviour set, unwidened: refused on the plain text Field,
  --    accepted on the signature one. `custom.doc_signature_field_ok` holds no
  --    client grant, so both halves are asked of `custom.doc_sign` itself — which
  --    is the only place the answer can reach a person anyway.
  -- ══════════════════════════════════════════════════════════════════════════
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

  v_j := custom.doc_signature_read(v_org, v_sig);
  if (v_j ->> 'signer_name') <> 'Dana Okafor' then
    raise exception 'VAL-10: the seal has to carry its SIGNER, and it says %', v_j ->> 'signer_name';
  end if;
  if nullif(v_j ->> 'signed_at', '') is null then
    raise exception 'VAL-10: the seal has to carry its TIME.';
  end if;
  if (v_j ->> 'document_hash') <> v_hash1 then
    raise exception 'VAL-10: the seal has to carry the document''s HASH. It says % and the document is %',
                    v_j ->> 'document_hash', v_hash1;
  end if;
  if (v_j ->> 'document_version')::integer <> 1 then
    raise exception 'VAL-10: the seal has to carry the DOCUMENT VERSION it signed, and it says %', v_j ->> 'document_version';
  end if;

  -- And the signature IS A VALUE on the record, with the store's own envelope — read the way
  -- a person's screen reads one value.
  select vr.value, vr.value_version, vr.source into v_j, v_n, v_src
    from custom.value_read(v_org, v_rec, 'signature') vr;
  if v_j #>> '{}' <> 'Dana Okafor' then
    raise exception 'VAL-10: a signature is a VALUE. The record''s signature value says %', v_j;
  end if;
  if coalesce(v_src ->> 'document_hash', '') <> v_hash1
     or coalesce(v_src ->> 'document_version', '') <> '1'
     or coalesce(v_src ->> 'kind', '') <> 'signed_document' then
    raise exception 'VAL-10: the signature Value''s provenance has to name the document version it sealed and its hash, and it says %', v_src;
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
  v_rec2 := custom.record_write(v_org, v_job, jsonb_build_object(
    '_actor', 'user', 'client_name', 'Kettleby Freight', 'amount', 900, 'margin', 8,
    'due', '2026-12-01'));
  v_doc2 := custom.doc_render_document(v_org, v_tpl, v_rec2);
  v_sig2 := custom.doc_sign(v_org, v_doc2, 'signature', 'Priya Raman');
  if v_sig2 is null then
    raise exception 'VAL-10: a signature on a new document version must succeed.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. VAL-10 — IMMUTABLE ONCE SIGNED. TWO WALLS, and the person meets the first
  --    one. From the seat the seal and the rendered document are not writable at
  --    all: `custom.doc_signature` and `custom.doc_render` hold no grant for
  --    `authenticated`, and there is no client door that edits either. That is
  --    the wall a person actually stands at, and it is asserted here, seated.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update custom.doc_signature set signer_name = 'Someone Else'
     where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a signed-in person UPDATED a seal.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from custom.doc_signature where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a signed-in person DELETED a seal.';
  exception when insufficient_privilege then null;
  end;
  begin
    update custom.doc_render set body = body || ' (amended)'
     where organization_id = v_org and id = v_doc;
    raise exception 'REC-68 / VAL-10: a signed-in person EDITED a sealed document version.';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART G (the first wall) — from the seat `authenticated` a seal cannot be updated or deleted and a rendered document cannot be edited: there is no privilege and no door.';

  -- ── THE SECOND WALL, WHICH NO CLIENT DOOR CAN REACH ──────────────────────────
  -- The store's own immutability trigger stands BEHIND that grant wall. Nobody seated can
  -- get far enough to be refused by it, so the three clauses that read its own sentences
  -- step OUT of the seat, say so, and assert nothing about what a person may do. This is
  -- the half that keeps an OPERATOR — a migration, a support script, a future server lane —
  -- from rewriting evidence.
  perform set_config('role', v_boss, true);
  begin
    update custom.doc_signature set signer_name = 'Someone Else'
     where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a seal was UPDATED by the role that owns the store.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be changed%' then
      raise exception 'VAL-10: the refusal has to say a seal cannot be changed, and it said: %', v_msg;
    end if;
  end;
  begin
    delete from custom.doc_signature where organization_id = v_org and id = v_sig;
    raise exception 'VAL-10: a seal was DELETED by the role that owns the store.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be removed%' then
      raise exception 'VAL-10: the refusal has to say a seal cannot be removed, and it said: %', v_msg;
    end if;
  end;
  begin
    update custom.doc_render set body = body || ' (amended)'
     where organization_id = v_org and id = v_doc;
    raise exception 'REC-68 / VAL-10: a sealed document version was EDITED by the role that owns the store.';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%cannot be edited after the fact%' then
      raise exception 'the refusal has to say a rendered document cannot be edited, and it said: %', v_msg;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  -- ─────────────────────────────────────────────────────────────────────────────

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. C-43 — THE BLOCK BINDS TO CONTENT. One character of the record changes;
  --    the SEALED hash does not move (VAL-10) and the hash the same template now
  --    produces DOES, and the seal reads BROKEN by name.
  -- ══════════════════════════════════════════════════════════════════════════
  v_j := custom.doc_signature_read(v_org, v_sig);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the seal must be intact before anything is edited, and it says %', v_j ->> 'verdict';
  end if;

  -- ONE CHARACTER. "Harborline" becomes "Harborlino".
  perform custom.record_update(v_org, v_rec,
    jsonb_build_object('_actor', 'user', 'client_name', 'Harborlino Logistics'));

  if (custom.doc_render_read(v_org, v_doc) ->> 'content_hash') <> v_hash1 then
    raise exception 'VAL-10: the SEALED document version''s hash moved when the record changed. A seal that follows the record around seals nothing.';
  end if;

  v_j := custom.doc_signature_read(v_org, v_sig);
  if (v_j ->> 'document_hash') <> v_hash1 then
    raise exception 'VAL-10: the SEAL''s hash moved when the record changed.';
  end if;
  v_hash2 := v_j ->> 'document_hash_now';
  if v_hash2 = v_hash1 then
    raise exception 'C-43: one character of the record changed and the document hashes the same. The block does not bind to content.';
  end if;
  if (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the record changed and the seal still reads intact: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'verdict') not like 'broken:%' then
    raise exception 'C-43: the verdict has to say the seal is broken, in words, and it says: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'verdict') not like '%Dana Okafor%' then
    raise exception 'C-43: the verdict has to name who signed it, and it says: %', v_j ->> 'verdict';
  end if;
  if (v_j ->> 'sealed_hash') <> v_hash1 then
    raise exception 'C-43: the verdict has to report BOTH hashes - the one that was sealed and the one the document produces now. It reports % and %',
                    v_j ->> 'sealed_hash', v_hash2;
  end if;

  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: the OTHER seal, whose record nobody
  -- touched, is still intact in the same breath. A verdict function stuck on "broken"
  -- fails here.
  v_j := custom.doc_signature_read(v_org, v_sig2);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'C-43: the untouched record''s seal must still be intact, and it says %', v_j ->> 'verdict';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- I. THE ACCESS WALL, FROM A SECOND PERSON'S SEAT. `test@test.com` is a plain
  --    member of this organization who was shared nothing of her own. Still
  --    seated, the claims move to her.
  --    WHAT SHE HOLDS, MEASURED rather than assumed: `custom.my_level` answers
  --    `viewer` on the record — the Job lives under the organization's Home and
  --    a member of the organization can see what is in it — and NOTHING on the
  --    Table. So the wall here is not "can she see it" but "what may she DO":
  --    she reads the document and the seal (the CONTROL — one door saying yes),
  --    and she is refused the SIGNATURE, which is an EDITOR act on the record,
  --    and refused SAVING A TEMPLATE, which is an EDITOR act on the Table she is
  --    no admin of. One person, one organization, three doors, two answers.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  if custom.my_level(v_org, v_rec2, 'record') is distinct from 'viewer'::public.permission_level then
    raise exception 'I: this clause is about what a VIEWER may do, and the store says she holds % on the record',
                    coalesce(custom.my_level(v_org, v_rec2, 'record')::text, 'nothing at all');
  end if;
  -- 🚨 RE-PINNED (lane RED-SUITES-3, 2026-09-21). This asked for NOTHING on the Table, and the
  -- platform default moved: `custom/member_default_level` ships as "viewer", and a Table IS a
  -- record (REC-25), so a plain member of the organization now holds `viewer` on it — the
  -- same answer she gets on the Job two lines above, for the same reason. The clause's point
  -- is unchanged and is now stated as itself: she is no ADMIN of the Table. Asserting the
  -- exact level rather than "not null" keeps it from passing if membership ever started
  -- conferring editor or admin, which is the thing this block is actually about.
  if custom.my_level(v_org, v_job, 'table') is distinct from 'viewer'::public.permission_level then
    raise exception 'I: membership alone confers viewer on a Table (custom/member_default_level) and she was made no admin of it, and the store says she holds % on it',
                    custom.my_level(v_org, v_job, 'table')::text;
  end if;

  -- THE CONTROL: the doors answer her about what she does hold.
  if (custom.doc_render_read(v_org, v_doc2) ->> 'content_hash') is null then
    raise exception 'I: a viewer of the record cannot read the document rendered from it.';
  end if;
  if (custom.doc_signature_read(v_org, v_sig2) ->> 'signer_name') <> 'Priya Raman' then
    raise exception 'I: a viewer of the record cannot read its seal.';
  end if;
  if custom.doc_render_document(v_org, v_tpl, v_rec2) is null then
    raise exception 'I: a viewer of the record cannot render the template over it.';
  end if;

  -- THE TWO REFUSALS.
  begin
    perform custom.doc_sign(v_org, v_doc2, 'signature', 'Dana Not-Allowed');
    raise exception 'I: a VIEWER signed a document. VAL-10: signing is an EDITOR act on the record.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.doc_template_save(v_org, v_job, 'Dana''s own', 'Hi {{field:' || v_f_name || '}}');
    raise exception 'I: a member who is no admin of the Table saved a document template against it.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART I PASSED — test@test.com holds viewer on the record and viewer — never admin — on the Table: she reads the document and the seal and renders the template, and she is refused the SIGNATURE and the TEMPLATE SAVE.';

  raise notice '';
  raise notice '=== W3-DOC — A..I ALL GREEN, every clause from the seat `authenticated` through the doors a signed-in person reaches. REC-68, VAL-10 and C-43 hold on the MAIN database. ===';
end;
$t$;

rollback;
