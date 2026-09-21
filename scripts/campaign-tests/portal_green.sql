-- PORTAL — THE GREEN SUITE. PRODUCTS row 2: "Let each client sign in and see only their
-- own jobs and invoices."
--
-- It builds its OWN throwaway organization — three Tables, three clients, thirty jobs, nine
-- invoices, one portal, three invitations — and then asks every question from the CLIENT'S
-- OWN SEAT: `authenticated`, carrying her claims, through the doors a signed-in person
-- reaches. It ends in ROLLBACK and leaves nothing.
--
-- The three principals are synthesized identities created once for this lane's proof; they
-- belong to nobody and are members of no organization, which is what makes them external
-- principals (VIS-31).
set local lock_timeout = '10s';
set local statement_timeout = '60s';
do $suite$
declare
  v_boss     text := current_user;
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ada    constant uuid := '6ce17b70-0792-44a1-8dca-52ec42fc76dc';
  c_bruno  constant uuid := '3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9';
  c_cleo   constant uuid := '96bf237b-d268-45cf-8d82-2525e34ae8e3';
  v_org    uuid := gen_random_uuid();
  j_ada      constant text := '{"sub":"6ce17b70-0792-44a1-8dca-52ec42fc76dc","role":"authenticated"}';
  j_bru      constant text := '{"sub":"3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9","role":"authenticated"}';
  j_admin    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_home   uuid;
  v_clients uuid; v_jobs uuid; v_invoices uuid;
  v_f_client_job uuid; v_f_client_inv uuid;
  v_ada uuid; v_bru uuid; v_cle uuid;
  v_portal uuid;
  v_p_ada uuid; v_p_bru uuid; v_p_cle uuid;
  v_i integer; v_n integer; v_m bigint; v_doc jsonb; v_txt text;
  v_who uuid; v_name text;
  v_id       uuid;
begin
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ridgeline Physical Therapy - safe to delete',
          'ridgeline-pt-' || left(v_org::text, 8), 'RPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'PORTAL lane proof', c_admin)
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  perform set_config('app.actor_system', 'campaign/PORTAL/fixture', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Ridgeline Physical Therapy', 'description', 'the proof''s home', '_actor', 'user'));

  -- ── the three Tables ────────────────────────────────────────────────────────────
  v_clients := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Clients', 'slug', 'clients', 'description', 'the people the portal is for',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'name', 'default_sort', jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('label', 'Name', 'key', 'name', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('label', 'Contact email', 'key', 'contact_email', 'type', 'text'));

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'collections we run for a client',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'title', 'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Job', 'key', 'title', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Stage', 'key', 'stage', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Scheduled for', 'key', 'scheduled_for', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Notes for us', 'key', 'client_notes', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Internal margin', 'key', 'internal_margin', 'type', 'text'));
  v_f_client_job := custom.field_declare(v_org, v_jobs, jsonb_build_object(
      'label', 'Client', 'key', 'client', 'type', 'relation',
      'relation_target', v_clients));

  v_invoices := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Invoices', 'slug', 'invoices', 'description', 'what a client owes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'number', 'default_sort', jsonb_build_array(jsonb_build_object('field','number','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'number')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Invoice', 'key', 'number', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Total', 'key', 'total', 'type', 'text'));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Status', 'key', 'status', 'type', 'text'));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Internal cost', 'key', 'internal_cost', 'type', 'text'));
  v_f_client_inv := custom.field_declare(v_org, v_invoices, jsonb_build_object(
      'label', 'Client', 'key', 'client', 'type', 'relation',
      'relation_target', v_clients));

  -- ── three clients ───────────────────────────────────────────────────────────────
  v_ada := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Ada Brook Cafes', 'contact_email', 'ada.client@ridgelinept.test', '_actor', 'user'));
  v_bru := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Bruno Vance Builders', 'contact_email', 'bruno.client@ridgelinept.test', '_actor', 'user'));
  v_cle := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Cleo Marsh Clinics', 'contact_email', 'cleo.client@ridgelinept.test', '_actor', 'user'));

  -- ── 30 jobs, ten each; 9 invoices, three each ───────────────────────────────────
  for v_i in 1..30 loop
    if v_i <= 10 then v_who := v_ada; v_name := 'Ada';
    elsif v_i <= 20 then v_who := v_bru; v_name := 'Bruno';
    else v_who := v_cle; v_name := 'Cleo'; end if;
    perform custom.record_write(v_org, v_jobs, jsonb_build_object(
      'title', format('%s collection #%s', v_name, v_i),
      'stage', (array['Scheduled','On site','Weighed','Invoiced'])[1 + (v_i % 4)],
      'scheduled_for', to_char(now() + (v_i || ' days')::interval, 'Mon DD'),
      'client_notes', '',
      'internal_margin', format('%s%%', 18 + (v_i % 7)),
      'client', v_who::text, '_actor', 'user'));
  end loop;
  for v_i in 1..9 loop
    if v_i <= 3 then v_who := v_ada; v_name := 'ADA';
    elsif v_i <= 6 then v_who := v_bru; v_name := 'BRU';
    else v_who := v_cle; v_name := 'CLE'; end if;
    perform custom.record_write(v_org, v_invoices, jsonb_build_object(
      'number', format('%s-2026-%s', v_name, lpad(v_i::text, 4, '0')),
      'total', format('$%s.00', 400 + v_i * 37),
      'status', (array['Sent','Paid','Overdue'])[1 + (v_i % 3)],
      'internal_cost', format('$%s.00', 200 + v_i * 11),
      'client', v_who::text, '_actor', 'user'));
  end loop;

  -- ── the portal ──────────────────────────────────────────────────────────────────
  v_portal := custom.portal_declare(v_org, 'Ridgeline Physical Therapy client portal', v_clients,
    jsonb_build_array(
      jsonb_build_object('table_id', v_jobs, 'names_via', 'client',
        'visible_fields', jsonb_build_array('title','stage','scheduled_for','client_notes'),
        'editable_fields', jsonb_build_array('client_notes'),
        'comments', true),
      jsonb_build_object('table_id', v_invoices, 'names_via', 'client',
        'visible_fields', jsonb_build_array('number','total','status'),
        'editable_fields', '[]'::jsonb, 'comments', false)));

  v_p_ada := (custom.portal_invite(v_org, v_portal, v_ada, 'ada.client@ridgelinept.test', c_ada) ->> 'principal_id')::uuid;
  v_p_bru := (custom.portal_invite(v_org, v_portal, v_bru, 'bruno.client@ridgelinept.test', c_bruno) ->> 'principal_id')::uuid;
  v_p_cle := (custom.portal_invite(v_org, v_portal, v_cle, 'cleo.client@ridgelinept.test', c_cleo) ->> 'principal_id')::uuid;

  
  perform set_config('app.actor_system', 'campaign/PORTAL/seatproof', true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ══════════════════════════════════════════
  perform set_config('request.jwt.claims', j_ada, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this proof did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    raise exception '0: this seat owns the store, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, cannot read custom.record directly', current_user;

  -- ══ PART 1 — SHE IS AN OUTSIDER, AND THE PLATFORM SAYS SO ════════════════════════
  v_doc := custom.portal_me();
  -- `iam.is_external_principal` holds no client grant (a finding of this run, written up),
  -- so the seat asks it the way a screen must: through the door that carries its answer.
  if not coalesce((v_doc ->> 'external')::boolean, false) then
    raise exception '1a: Ada belongs to a real organization, so she is not an external principal';
  end if;
  -- Scoped to THIS suite's own portal: a synthesized principal may be named by another
  -- run's standing fixture too, and a suite that counted every portal she holds would go
  -- red on somebody else's evidence.
  select p into v_doc from jsonb_array_elements(v_doc -> 'portals') p
   where (p ->> 'portal_id')::uuid = v_portal;
  if v_doc is null then
    raise exception '1b: portal_me never named the portal this suite just declared';
  end if;
  if (v_doc ->> 'client') <> 'Ada Brook Cafes' then
    raise exception '1c: portal_me says she is "%"', v_doc ->> 'client';
  end if;
  if jsonb_array_length(v_doc -> 'tables') <> 2 then
    raise exception '1d: portal_me named % Tables, expected Jobs and Invoices', jsonb_array_length(v_doc -> 'tables');
  end if;
  raise notice 'PART 1 PASSED — external principal; the portal (%) names her % and two Tables',
    v_doc ->> 'title', v_doc ->> 'client';

  -- ══ PART 2 — EVERY LIST DOOR, AS HER ═════════════════════════════════════════════
  select count(*) into v_n from custom.read_records(v_org, v_jobs, true, 200, 0);
  if v_n <> 10 then raise exception '2a: custom.read_records handed Ada % jobs, expected 10', v_n; end if;
  select count(*) into v_n from custom.read_records(v_org, v_invoices, true, 200, 0);
  if v_n <> 3 then raise exception '2b: custom.read_records handed Ada % invoices, expected 3', v_n; end if;
  select count(*) into v_n from custom.query_visible_ids(v_org, v_jobs, 'viewer');
  if v_n <> 10 then raise exception '2c: custom.query_visible_ids answered % jobs, expected 10', v_n; end if;
  select count(*) into v_n from custom.query_visible_ids(v_org, v_invoices, 'viewer');
  if v_n <> 3 then raise exception '2d: custom.query_visible_ids answered % invoices, expected 3', v_n; end if;
  select count(*) into v_n from custom.query_across_homes(v_org, v_jobs, 500, 0, 'viewer');
  if v_n <> 10 then raise exception '2e: custom.query_across_homes answered % jobs, expected 10', v_n; end if;
  v_doc := custom.io_export(v_org, v_jobs, null::text[], 500, 'viewer');
  select coalesce(jsonb_array_length(v_doc -> 'rows'), jsonb_array_length(v_doc -> 'records'),
                  jsonb_array_length(v_doc -> 'data'), -1) into v_n;
  if v_n <> 10 then raise exception '2f: custom.io_export exported % jobs, expected 10 — keys %', v_n, (select string_agg(k, ',') from jsonb_object_keys(v_doc) k); end if;
  select coalesce(sum((a.measures ->> 'count')::bigint), 0) into v_n
    from custom.record_aggregate(v_org, v_jobs, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('op','count')), null, null, 100, 'viewer') a;
  if v_n <> 10 then raise exception '2h: custom.record_aggregate counted % jobs, expected 10', v_n; end if;
  select count(*) into v_n from custom.query_by_coordinates(v_org, v_jobs, '[]'::jsonb, 500, 0, 'viewer');
  if v_n <> 10 then raise exception '2i: custom.query_by_coordinates answered % jobs, expected 10', v_n; end if;
  select count(*) into v_n from custom.read_records(v_org, v_clients, true, 200, 0);
  if v_n <> 1 then raise exception '2g: custom.read_records handed Ada % client records, expected 1 (her own)', v_n; end if;
  raise notice 'PART 2 PASSED — read_records 10 jobs / 3 invoices, query_visible_ids 10/3, query_across_homes 10, io_export 10, record_aggregate 10, query_by_coordinates 10, one client record (her own)';

  -- ══ PART 3 — AND NOTHING ELSE. THE RECORD DOOR AGREES WITH THE LISTS ═════════════
  select id into v_id from custom.read_records(v_org, v_jobs, true, 1, 0);
  v_doc := custom.read_record(v_org, v_id, true);
  if v_doc is null then raise exception '3a: a job the list handed her would not open'; end if;
  -- `custom.read_record` answers the DOCUMENT itself, with what it would not show under
  -- `_hidden` and the reason. Assert what the door says, not what the row holds.
  if v_doc ? 'internal_margin' then
    raise exception '3b: the record door handed Ada "internal_margin", which the portal does not show: %', v_doc;
  end if;
  if not (v_doc -> '_hidden' ? 'internal_margin') then
    raise exception '3b2: "internal_margin" is absent but the door never SAID it was withheld: %', v_doc;
  end if;
  if not (v_doc ? 'title') or not (v_doc ? 'stage') or not (v_doc ? 'client_notes') then
    raise exception '3c: the record door did not hand Ada a field the portal DOES show: %', v_doc;
  end if;
  -- Bruno's client record: the list never named it, and the record door must refuse it too.
  begin
    perform custom.read_record(v_org, v_bru, true);
    raise exception '3d: Ada opened Bruno''s client record';
  exception when insufficient_privilege or no_data_found then null;
  end;
  -- `custom.has_visibility` holds no client grant; `custom.my_level` is the door a screen
  -- asks the same question through, and it answers about the caller.
  begin
    v_txt := custom.my_level(v_org, v_bru, 'record');
    raise exception '3e: custom.my_level says Ada holds "%" on Bruno''s client record', coalesce(v_txt, 'nothing, but it answered instead of refusing');
  exception when insufficient_privilege then null;
  end;
  if custom.my_level(v_org, v_id, 'record') is null then
    raise exception '3f: custom.my_level says Ada holds nothing on her own job, which the lists just handed her';
  end if;
  raise notice 'PART 3 PASSED — her own job opens with title and WITHOUT internal_margin; Bruno''s client record is refused';

  -- ══ PART 4 — SHE CAN WRITE WHAT THE PORTAL OPENED, AND ONLY THAT ═════════════════
  perform custom.record_update(v_org, v_id, jsonb_build_object('client_notes', 'Gate code is 4417, please use the side entrance.'), null);
  v_doc := custom.read_record(v_org, v_id, true);
  if (v_doc ->> 'client_notes') is distinct from 'Gate code is 4417, please use the side entrance.' then
    raise exception '4a: her note did not land — %', v_doc ->> 'client_notes';
  end if;
  begin
    perform custom.record_update(v_org, v_id, jsonb_build_object('internal_margin', '99%%'), null);
    v_doc := custom.read_record(v_org, v_id, true);
    raise exception '4b: Ada''s write to internal_margin was not refused (the door answered, and the field now reads %)',
      coalesce(v_doc ->> 'internal_margin', '<still hidden from her>');
  exception when insufficient_privilege or check_violation or undefined_column or invalid_parameter_value then null;
  end;
  raise notice 'PART 4 PASSED — client_notes landed; internal_margin refused';

  -- ══ PART 5 — BRUNO, THE SAME DOORS, HIS OWN TEN ══════════════════════════════════
  perform set_config('request.jwt.claims', j_bru, true);
  select count(*) into v_n from custom.read_records(v_org, v_jobs, true, 200, 0);
  select count(*) into v_m from custom.read_records(v_org, v_invoices, true, 200, 0);
  if v_n <> 10 or v_m <> 3 then raise exception '5a: Bruno got % jobs and % invoices, expected 10 and 3', v_n, v_m; end if;
  if exists (select 1 from custom.read_records(v_org, v_jobs, true, 200, 0) r where (r.document ->> 'title') like 'Ada%') then
    raise exception '5b: Bruno can see one of Ada''s jobs';
  end if;
  begin
    perform custom.read_record(v_org, v_ada, true);
    raise exception '5c: Bruno opened Ada''s client record';
  exception when insufficient_privilege or no_data_found then null;
  end;
  raise notice 'PART 5 PASSED — Bruno gets his own 10 jobs and 3 invoices, none of Ada''s, and Ada''s client record is refused';

  -- ══ PART 6 — REVOKE ADA, AND SHE SEES NOTHING (rolled back; the real one is later) ═
  perform set_config('role', v_boss, true);            -- the owner's act, not the client's
  perform set_config('request.jwt.claims', j_admin, true);
  perform custom.portal_revoke(v_org, v_portal, v_p_ada);
  perform set_config('request.jwt.claims', j_ada, true);
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into v_n from custom.read_records(v_org, v_jobs, true, 200, 0);
  exception when insufficient_privilege then v_n := 0;
  end;
  if v_n <> 0 then raise exception '6a: after revoke, Ada still sees % jobs', v_n; end if;
  begin
    perform custom.read_record(v_org, v_id, true);
    raise exception '6b: after revoke, Ada still opened a job';
  exception when insufficient_privilege or no_data_found then null;
  end;
  if exists (select 1 from jsonb_array_elements(custom.portal_me() -> 'portals') p
              where (p ->> 'portal_id')::uuid = v_portal) then
    raise exception '6c: after revoke, portal_me still names the portal she was removed from';
  end if;
  raise notice 'PART 6 PASSED — revoked: 0 jobs, the record door refuses, portal_me lists no portal';

  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED (0 seat, 1 an outsider with one portal, 2 every list door, 3 the record door agrees and the fields are the portal''s, 4 she writes only what was opened, 5 Bruno the same and nothing of hers, 6 revoke)';
  raise exception 'TEARDOWN — this suite rolls back and leaves nothing';
end $suite$;
