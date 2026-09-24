-- LANE SC-1' P13 — THE WRITE FENCE ON THE CONTEXT COPY, measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Titanium's scopes are about to be copied into the record store (lane SC-2'): its
-- Clients scope type lands as a Table the context system keeps (`kept_for: "context"`), and
-- "Data Destruction, Inc" becomes one of its Records. Until the switch, the current scope screens
-- are the writer and the copy FOLLOWS them. An agent that writes Data Destruction's Brand Voice
-- through the `records` tool — which opens an RLS session as `authenticated` and calls
-- custom.record_write / custom.record_update, exactly as below — must be refused with the
-- sentence naming the scope page, or the follow would silently overwrite it.
--
-- The organization, the client and the brand voice here are synthesized (a clone-only fixture
-- organization, rolled back). Nothing of the owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before sc1p_a_context_copy_is_written_only_by_its_follow.sql, GREEN after):
--   F1  a person's (the agent tool's) record_write into the kept context Table is refused, 42501,
--       with "This is the new system's copy of Clients; it follows the current screens until the
--       switch. Edit it on /scopes/…"
--   F2  the same for record_update of an existing copied Record (matrx-local's sync path)
--   F3  a column added to the copy by a person is refused
--   F4  the follow (the store owner's connection) writes the copy
--   F5  an organization that turned custom/context_copy_following off for itself (the validation
--       organization, where the store is the writer) writes it
--   F6  an ordinary Table of the same organization is untouched by the fence

\set ON_ERROR_STOP on
\timing off
\set suite 'sc1p_the_context_copy_fence_red_green.sql'
\set requires ''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table cf (k text primary key, v uuid) on commit drop;
grant select on cf to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org uuid := gen_random_uuid();
  v_val uuid := gen_random_uuid();
  v_home uuid; v_vhome uuid; v_clients uuid; v_vclients uuid; v_notes uuid; v_row uuid; v_vrow uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/sc1p-fence', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Titanium Growth Partners ' || substr(v_org::text, 1, 6), 'titanium-growth-' || substr(v_org::text, 1, 8), 'TGP', c_admin),
    (v_val, 'Titanium Validation ' || substr(v_val::text, 1, 6), 'titanium-validation-' || substr(v_val::text, 1, 8), 'TVA', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_val, 'organization', v_val, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'sc1p fence suite'),
    ('custom', 'system_enabled', 'organization', v_val, v_val, 'true'::jsonb, 'sc1p fence suite');
  insert into custom.record (organization_id, table_id, data) values
    (v_org, custom.organization_kernel_id(), jsonb_build_object('name', 'Titanium Growth Partners')) returning id into v_home;
  insert into custom.record (organization_id, table_id, data) values
    (v_val, custom.organization_kernel_id(), jsonb_build_object('name', 'Titanium Validation')) returning id into v_vhome;

  -- THE FOLLOW (this fixture runs as the store's owner, as the mover and the follow worker do)
  -- lands Clients as the context system's copy, with one client.
  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Clients', 'slug', 'clients', 'type', 'entity', 'label_singular', 'Client', 'label_plural', 'Clients',
    'title_field', 'name', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650, 'kept_by_the_app', true, 'kept_for', 'context',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'name'))));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('key', 'name', 'label', 'Name', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('key', 'brand_voice', 'label', 'Brand Voice', 'type', 'long_text', 'sort', 20));
  v_row := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Data Destruction, Inc',
             'brand_voice', 'Plain-spoken and certain: chain of custody first, never jargon.'));

  -- The validation organization, where the store IS the writer.
  v_vclients := custom.table_declare(v_val, jsonb_build_object(
    'name', 'Clients', 'slug', 'clients', 'type', 'entity', 'label_singular', 'Client', 'label_plural', 'Clients',
    'title_field', 'name', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650, 'kept_by_the_app', true, 'kept_for', 'context',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
    'parent_id', v_vhome::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'name'))));
  perform custom.field_declare(v_val, v_vclients, jsonb_build_object('key', 'name', 'label', 'Name', 'type', 'text', 'sort', 10, 'required', true));
  -- (The knob is the fence file's own; before it exists there is nothing to turn off.)
  if exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'context_copy_following') then
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
      ('custom', 'context_copy_following', 'organization', v_val, v_val, 'false'::jsonb, 'sc1p fence suite: the store is the writer here')
    on conflict do nothing;
  end if;

  -- An ordinary table of the same organization.
  v_notes := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Meeting notes', 'slug', 'meeting_notes', 'type', 'entity', 'label_singular', 'Meeting note', 'label_plural', 'Meeting notes',
    'title_field', 'topic', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'topic', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'topic'))));
  perform custom.field_declare(v_org, v_notes, jsonb_build_object('key', 'topic', 'label', 'Topic', 'type', 'text', 'sort', 10, 'required', true));

  insert into cf values ('org', v_org), ('val', v_val), ('clients', v_clients), ('vclients', v_vclients),
                        ('notes', v_notes), ('row', v_row);
end
$fixture$;

do $t$
declare
  v_org uuid; v_val uuid; v_clients uuid; v_vclients uuid; v_notes uuid; v_row uuid;
  v_msg text; v_id uuid;
begin
  select v into v_org from cf where k = 'org';          select v into v_val from cf where k = 'val';
  select v into v_clients from cf where k = 'clients';  select v into v_vclients from cf where k = 'vclients';
  select v into v_notes from cf where k = 'notes';      select v into v_row from cf where k = 'row';

  -- ══ the agent tool's seat: an RLS session as `authenticated`, the person's claims ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Kestrel Logistics'));
    raise exception 'F1 RED: a person''s record_write into the context copy went through';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'This is the new system''s copy of Clients; it follows the current screens until the switch. Edit it on /scopes/%' then
      raise exception 'F1: refused with the wrong sentence: %', v_msg;
    end if;
  end;

  begin
    perform custom.record_update(v_org, v_row, jsonb_build_object('brand_voice', 'Bold and playful.'));
    raise exception 'F2 RED: a person''s record_update of Data Destruction''s Brand Voice in the copy went through';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'This is the new system''s copy of Clients;%Edit it on /scopes/s/' || v_row::text || '.' then
      raise exception 'F2: refused with the wrong sentence: %', v_msg;
    end if;
  end;

  begin
    perform custom.field_declare(v_org, v_clients, jsonb_build_object('key', 'tier', 'label', 'Tier', 'type', 'text', 'sort', 30));
    raise exception 'F3 RED: a person added a column to the context copy';
  exception when insufficient_privilege then null;
  end;

  -- F5: the validation organization writes its own.
  v_id := custom.record_write(v_val, v_vclients, jsonb_build_object('name', 'Kestrel Logistics'));
  if v_id is null then raise exception 'F5: the validation organization could not write its own Clients'; end if;

  -- F6: an ordinary table is untouched.
  v_id := custom.record_write(v_org, v_notes, jsonb_build_object('topic', 'Q4 retention review'));
  if v_id is null then raise exception 'F6: an ordinary table was fenced'; end if;

  -- F4: the follow (the store owner's connection) writes the copy.
  perform set_config('role', 'postgres', true);
  perform custom.record_update(v_org, v_row, jsonb_build_object('brand_voice', 'Plain-spoken, certain, and warm.'));
  raise notice 'sc1p fence suite: F1 F2 F3 F4 F5 F6 GREEN';
end
$t$;

rollback;
