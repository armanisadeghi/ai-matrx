-- scripts/campaign-tests/esign_green.sql — lane ESIGN, from the seat.
--
-- PRODUCTS row 16: *"Have the client sign this before we start."*
--
-- Every asserted clause below PART 0 runs as `authenticated` — the role PostgREST serves a
-- signed-in person — through the four client doors this lane declared. The three SERVER-LANE
-- doors are stepped out for BY DECLARATION, and the suite says so at each line: they are
-- granted to `service_role` alone because a signer's address and browser must be read off the
-- request rather than asserted by a browser, so it takes that role rather than the owner's.
--
-- The two seats: `admin@admin.com` owns the organization and asks for the signature;
-- `test@test.com` is an ordinary member who was shared nothing, in an organization whose
-- `custom/member_default_visibility` is `shared_only` — without that the organization shows
-- every member every record and PART 8's wall would prove nothing.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '150s';
set local statement_timeout = '600s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f_name  uuid;
  v_f_fee   uuid;
  v_f_sig   uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_tmpl    uuid;
  v_render  uuid;
  v_render2 uuid;
  v_made    jsonb;
  v_made2   jsonb;
  v_pub     jsonb;
  v_out     jsonb;
  v_env     record;
  v_row     record;
  v_n       bigint;
  v_txt     text;
  v_frozen  text;
  v_fhash   text;
  v_frozen2 text;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'ZZZ ESIGN suite ' || left(v_org::text, 8), 'zzz-esign-s-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'esign_green.sql', c_admin),
         ('custom', 'member_default_visibility', 'organization', v_org, v_org,
          '"shared_only"'::jsonb, 'esign_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/esign_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
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
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 0b — THE SIGNING DOORS ARE NOT REACHABLE FROM A SIGNED-IN SEAT ═══════
  -- This is the whole reason they are server-lane rather than three more client grants. A
  -- browser that could call them would be asserting its own address on a certificate.
  begin
    perform custom.sign_request_public('x', null);
    raise exception '0b: a signed-in seat can call custom.sign_request_public, so the server lane is decoration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.sign_request_sign('x', 'y', 'typed', null, null, null, null);
    raise exception '0b: a signed-in seat can call custom.sign_request_sign';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.sign_request_decline('x', null, null, null);
    raise exception '0b: a signed-in seat can call custom.sign_request_decline';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom._sign_request_resolve('x');
    raise exception '0b: a signed-in seat can call custom._sign_request_resolve, which would hand it a whole request row';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0b PASSED — all three server-lane doors and the resolver are refused to a signed-in seat';

  -- ══ PART 1 — a Table with a SIGNATURE field, a record, a template, a document ══
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'client', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Job', 'label_plural', 'Jobs',
      'title_field', 'client',
      'fields', jsonb_build_array(jsonb_build_object('name', 'client')),
      'parent_id', v_home));
  v_f_name := custom.field_declare(v_org, v_table,
      jsonb_build_object('label', 'client', 'key', 'client', 'type', 'text', 'required', true));
  v_f_fee  := custom.field_declare(v_org, v_table,
      jsonb_build_object('label', 'fee', 'key', 'fee', 'type', 'text'));
  v_f_sig  := custom.field_declare(v_org, v_table,
      jsonb_build_object('label', 'client signature', 'key', 'client_signature',
                         'type', 'text', 'format', 'signature'));
  v_rec  := custom.record_write(v_org, v_table,
              jsonb_build_object('client', 'Acme Recycling', 'fee', '1200', '_actor', 'user'));
  v_rec2 := custom.record_write(v_org, v_table,
              jsonb_build_object('client', 'Beta Holdings', 'fee', '900', '_actor', 'user'));
  v_tmpl := custom.doc_template_save(v_org, v_table, 'Proposal',
              'Dear {{field:' || v_f_name || '}}, our fee is {{field:' || v_f_fee || '}}.', null);
  v_render  := custom.doc_render_document(v_org, v_tmpl, v_rec);
  v_render2 := custom.doc_render_document(v_org, v_tmpl, v_rec2);
  -- THE DOOR'S ANSWER IS THE PRODUCT TRUTH. custom.doc_render_body and
  -- custom.doc_content_hash hold no client grant and this seat may not call them, which is
  -- correct; custom.doc_renders is the door a person reaches, so the frozen bytes and the
  -- frozen hash are read from THERE and compared against later.
  select d.body, d.content_hash into v_frozen, v_fhash
    from custom.doc_renders(v_org, v_rec) d where d.render_id = v_render;
  select d.body into v_frozen2
    from custom.doc_renders(v_org, v_rec2) d where d.render_id = v_render2;
  raise notice 'PART 1 PASSED — table %, record %, template %, document %', v_table, v_rec, v_tmpl, v_render;

  -- ══ PART 2 — THE ASK, and the three things it refuses ════════════════════════
  begin
    perform custom.sign_request_create(v_org, v_render, 'fee', 'x@y.zz', 'X', interval '1 day');
    raise exception '2a: a signature was asked for on a field that is not a signature field';
  exception when sqlstate '23514' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%signature%' then
      raise exception '2a: refused, but not in words about a signature: %', v_txt;
    end if;
  end;
  begin
    perform custom.sign_request_create(v_org, v_render, 'client_signature', 'not-an-address', 'X', interval '1 day');
    raise exception '2b: a request was addressed to something that is not an email address';
  exception when sqlstate '23514' then null;
  end;
  begin
    perform custom.sign_request_create(v_org, v_render, 'client_signature', 'x@y.zz', '  ', interval '1 day');
    raise exception '2c: a request was made naming nobody';
  exception when sqlstate '23514' then null;
  end;

  v_made := custom.sign_request_create(v_org, v_render, 'client_signature',
              'Dana.Okonkwo@Example.Test', 'Dana Okonkwo', interval '14 days');
  if (v_made ->> 'token') !~ '^[A-Za-z0-9_-]{86}$' then
    raise exception '2d: the link is not 86 base64url characters: %', v_made ->> 'token';
  end if;
  if (v_made ->> 'signer_email') <> 'dana.okonkwo@example.test' then
    raise exception '2e: the address was not lower-cased and trimmed: %', v_made ->> 'signer_email';
  end if;
  if (v_made ->> 'document_hash') <> v_fhash then
    raise exception '2f: the frozen hash is not the hash the document door reports';
  end if;
  raise notice 'PART 2 PASSED — the ask, its link, and three refusals by name';

  -- ══ PART 3 — THE SECRET IS NOT IN THE STORE ══════════════════════════════════
  -- The whole posture in one clause: an operator reading every row still cannot sign.
  perform set_config('role', v_boss, true);        -- STEPPING OUT: no client door reads a
                                                   -- raw request row, and that is the point.
  select r.data into v_out
    from custom.record r
   where r.organization_id = v_org and r.id = (v_made ->> 'request_id')::uuid;
  perform set_config('role', 'authenticated', true);
  if v_out::text like '%' || (v_made ->> 'token') || '%' then
    raise exception '3: the link''s secret is stored on the request row, so anybody who can read this database can sign';
  end if;
  if (v_out ->> 'token_hash') <> encode(sha256(convert_to(v_made ->> 'token', 'UTF8')), 'hex') then
    raise exception '3: what is stored is not the SHA-256 of the link';
  end if;
  raise notice 'PART 3 PASSED — only the SHA-256 of the link is stored';

  -- ══ PART 4 — THE OWNER'S LIST, from the seat ═════════════════════════════════
  select count(*) into v_n from custom.sign_requests(v_org, v_rec);
  if v_n <> 1 then
    raise exception '4a: custom.sign_requests answered % requests, not the 1 that was made', v_n;
  end if;
  select * into v_row from custom.sign_requests(v_org, v_rec) limit 1;
  if v_row.state <> 'sent' or v_row.sentence <> 'Sent, not opened yet.' then
    raise exception '4b: a brand-new request reads % / %', v_row.state, v_row.sentence;
  end if;
  if v_row.document_hash <> (v_made ->> 'document_hash') then
    raise exception '4c: the list disagrees with the ask about the frozen hash';
  end if;
  -- The list never carries the link. It cannot: only the hash is stored.
  if to_jsonb(v_row)::text like '%' || (v_made ->> 'token') || '%' then
    raise exception '4d: the owner''s list hands back the signing link';
  end if;
  raise notice 'PART 4 PASSED — the list, its state and its one sentence';

  -- ══ PART 5 — THE SIGNER OPENS IT ═════════════════════════════════════════════
  -- STEPPING OUT, BY DECLARATION: custom.sign_request_public is granted to service_role and
  -- to nobody else, because the origin and the address of the caller are things the server
  -- knows and a browser can only assert. PART 0b already proved a signed-in seat is refused.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);

  v_pub := custom.sign_request_public('not-a-link-of-ours', 'http://example.test');
  if (v_pub ->> 'found')::boolean then
    raise exception '5a: a link that is not one of ours was found';
  end if;
  v_pub := custom.sign_request_public(v_made ->> 'token', 'http://example.test');
  if not (v_pub ->> 'found')::boolean or not (v_pub ->> 'signable')::boolean then
    raise exception '5b: the real link did not open: %', v_pub;
  end if;
  if (v_pub ->> 'body') <> v_frozen then
    raise exception '5c: the signer is not shown the frozen document';
  end if;
  if (v_pub ->> 'state') <> 'viewed' then
    raise exception '5d: opening the link did not mark it viewed: %', v_pub ->> 'state';
  end if;
  raise notice 'PART 5 PASSED — the link opens, shows the frozen document, and is marked viewed';

  -- ══ PART 6 — THE SIGNATURE, AND WHAT IT WRITES ═══════════════════════════════
  begin
    perform custom.sign_request_sign(v_made ->> 'token', '  ', 'typed', null, null, null, null);
    raise exception '6a: a signature with no name was accepted';
  exception when sqlstate '22004' then null;
  end;
  begin
    perform custom.sign_request_sign(v_made ->> 'token', 'Dana', 'stamped', null, null, null, null);
    raise exception '6b: a third way of signing was accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    perform custom.sign_request_sign(v_made ->> 'token', 'Dana', 'drawn', 'not-a-data-url', null, null, null);
    raise exception '6c: a drawn signature with no drawing was accepted';
  exception when sqlstate '22023' then null;
  end;

  v_out := custom.sign_request_sign(v_made ->> 'token', 'Dana Okonkwo', 'typed', null,
             '203.0.113.9', 'Mozilla/5.0 (suite)', 'http://example.test');
  if not (v_out ->> 'signed')::boolean then
    raise exception '6d: the signature did not land: %', v_out;
  end if;

  -- A SECOND SIGNATURE IS REFUSED, and by the request rather than by a constraint.
  v_out := custom.sign_request_sign(v_made ->> 'token', 'Dana Okonkwo', 'typed', null, null, null, null);
  if (v_out ->> 'signed')::boolean then
    raise exception '6e: the same request was signed twice';
  end if;
  if (v_out ->> 'message') <> 'Signed by Dana Okonkwo.' then
    raise exception '6f: the second attempt did not say what had already happened: %', v_out ->> 'message';
  end if;
  raise notice 'PART 6 PASSED — the signature, three refusals by name, and no second signature';

  -- ══ PART 7 — THE VALUE ON THE RECORD, ITS PROVENANCE, AND THE SEAL ═══════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  if (custom.read_record(v_org, v_rec, true) ->> 'client_signature') <> 'Dana Okonkwo' then
    raise exception '7a: the signature is not a Value on the record';
  end if;
  select * into v_env from custom.value_read(v_org, v_rec, 'client_signature') limit 1;
  if (v_env.source ->> 'kind') <> 'signature' then
    raise exception '7b: the Value''s source is not a signature: %', v_env.source;
  end if;
  if (v_env.source ->> 'document_hash') <> (v_made ->> 'document_hash') then
    raise exception '7c: the Value''s hash is not the document that was frozen';
  end if;
  if (v_env.source ->> 'signer_email') <> 'dana.okonkwo@example.test'
     or (v_env.source ->> 'ip') <> '203.0.113.9'
     or (v_env.source ->> 'user_agent') <> 'Mozilla/5.0 (suite)'
     or (v_env.source ->> 'mark') <> 'typed' then
    raise exception '7d: the Value does not carry who, from where and on what: %', v_env.source;
  end if;

  select count(*) into v_n from custom.doc_signatures(v_org, v_rec);
  if v_n <> 1 then
    raise exception '7e: % seals on a record signed once', v_n;
  end if;
  select * into v_row from custom.doc_signatures(v_org, v_rec) limit 1;
  if v_row.document_hash <> (v_made ->> 'document_hash') or v_row.signer_name <> 'Dana Okonkwo' then
    raise exception '7f: the seal and the request disagree';
  end if;
  select * into v_row from custom.sign_requests(v_org, v_rec) limit 1;
  if v_row.state <> 'signed' or v_row.sentence <> 'Signed by Dana Okonkwo.' then
    raise exception '7g: the request does not read signed: % / %', v_row.state, v_row.sentence;
  end if;
  raise notice 'PART 7 PASSED — the Value, its full provenance, the seal, and the request all agree';

  -- ══ PART 8 — A CHANGE TO THE RECORD INVALIDATES AN OUTSTANDING ASK ═══════════
  v_made2 := custom.sign_request_create(v_org, v_render2, 'client_signature',
               'bruno@example.test', 'Bruno Vieira', interval '14 days');
  perform custom.record_update(v_org, v_rec2, jsonb_build_object('_actor', 'user', 'fee', '1975'));

  perform set_config('role', 'service_role', true);   -- STEPPING OUT, BY DECLARATION, as PART 5
  perform set_config('request.jwt.claims', '', true);
  v_pub := custom.sign_request_public(v_made2 ->> 'token', 'http://example.test');
  if (v_pub ->> 'state') <> 'invalidated' then
    raise exception '8a: the link still works after the record changed: %', v_pub ->> 'state';
  end if;
  if (v_pub ->> 'message') not like 'This document changed after it was sent for signature%' then
    raise exception '8b: it stopped working but did not say why: %', v_pub ->> 'message';
  end if;
  v_out := custom.sign_request_sign(v_made2 ->> 'token', 'Bruno Vieira', 'typed', null, null, null, null);
  if (v_out ->> 'signed')::boolean then
    raise exception '8c: an invalidated request was signed anyway';
  end if;
  raise notice 'PART 8 PASSED — %', v_pub ->> 'message';

  -- ══ PART 9 — THE WALL, as test@test.com, still seated ════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);

  -- ONE CONTROL SHE CAN DO, so the clause is not satisfied by a door that refuses her
  -- everything: her own level on a record shared with her reads back.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec2, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.sign_requests(v_org, v_rec2);
  if v_n <> 1 then
    raise exception '9a: a record shared with her at viewer does not list its request: %', v_n;
  end if;

  -- AND THE WALL: the record nobody shared with her is refused.
  begin
    perform 1 from custom.sign_requests(v_org, v_rec);
    raise exception '9b: she listed the signature requests on a record nobody shared with her';
  exception when sqlstate '42501' then null;
  end;
  -- And viewer is not enough to ASK for a signature on the one she can see.
  begin
    perform custom.sign_request_create(v_org, v_render2, 'client_signature',
                                       'z@example.test', 'Z', interval '1 day');
    raise exception '9c: a viewer asked the world to sign a document about somebody''s record';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PART 9 PASSED — one control she can do, two walls she cannot';

  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED';
end
$suite$;

rollback;
