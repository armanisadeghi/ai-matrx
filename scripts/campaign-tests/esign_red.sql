-- scripts/campaign-tests/esign_red.sql — lane ESIGN's RED TWIN.
--
-- Four blocks. Each one PLANTS the real pre-fix bytes inside a transaction that is rolled
-- back, then proves the thing the green suite asserts goes RED against them. A guard nobody
-- has seen fail is not a guard, and planting the bytes also proves those bytes executed —
-- so this is not a test of a hypothetical.
--
-- Every block runs from the SEAT the green suite runs from, and its own fixtures are built
-- through the same doors, so a block that goes green here would mean the green suite's
-- corresponding clause is satisfied by something other than the law it names.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'esign_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
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
  v_pub     jsonb;
  v_out     jsonb;
  v_row     record;
  v_red     integer := 0;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Signal & Scale Podcast Red ' || left(v_org::text, 8), 'signal-scale-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'esign_red.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/esign_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'the red twin''s table',
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
              jsonb_build_object('client', 'Northwind Coffee Roasters', 'fee', '1200', '_actor', 'user'));
  v_rec2 := custom.record_write(v_org, v_table,
              jsonb_build_object('client', 'Lakeview Outdoor Gear', 'fee', '900', '_actor', 'user'));
  v_tmpl := custom.doc_template_save(v_org, v_table, 'Proposal',
              'Dear {{field:' || v_f_name || '}}, our fee is {{field:' || v_f_fee || '}}.', null);
  v_render  := custom.doc_render_document(v_org, v_tmpl, v_rec);
  v_render2 := custom.doc_render_document(v_org, v_tmpl, v_rec2);

  -- ══ RED 1 — THE LINK KEPT IN THE CLEAR ═══════════════════════════════════════
  -- The shape a first draft reaches for: store the token, compare it directly. It works, and
  -- it means every operator who can read a row can sign on that client's behalf. Green PART 3
  -- is what refuses it.
  perform set_config('role', v_boss, true);
  create or replace function custom.sign_request_write_the_link_in_the_clear(
    p_organization_id uuid, p_request_id uuid, p_token text)
  returns void language plpgsql security definer set search_path to 'pg_catalog' as $red1$
  begin
    update custom.record r set data = r.data || jsonb_build_object('token_hash', p_token)
     where r.organization_id = p_organization_id and r.id = p_request_id;
  end;
  $red1$;
  perform set_config('role', 'authenticated', true);

  v_made := custom.sign_request_create(v_org, v_render, 'client_signature',
              'dana@example.test', 'Dana Okonkwo', interval '14 days');
  perform set_config('role', v_boss, true);
  perform custom.sign_request_write_the_link_in_the_clear(v_org, (v_made ->> 'request_id')::uuid,
                                                          v_made ->> 'token');
  select r.data into v_out from custom.record r
   where r.organization_id = v_org and r.id = (v_made ->> 'request_id')::uuid;
  perform set_config('role', 'authenticated', true);

  if v_out::text like '%' || (v_made ->> 'token') || '%' then
    v_red := v_red + 1;
    raise notice 'RED 1 IS RED — with the pre-fix bytes the link itself is on the row, so anybody who can read this database can sign. Green PART 3 refuses exactly this.';
  else
    raise exception 'RED 1 WENT GREEN — the planted bytes did not put the link on the row, so PART 3 proves nothing';
  end if;

  -- ══ RED 2 — NO FRESHNESS CHECK ═══════════════════════════════════════════════
  -- The version without decision 4: the request is answerable whatever the record now says,
  -- so a client signs a proposal quoting a fee nobody is offering any more. Green PART 8.
  perform set_config('role', v_boss, true);
  create or replace function custom.sign_request_public_without_the_hash_check(p_token text)
  returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $red2$
  declare v_r record;
  begin
    select * into v_r from custom._sign_request_resolve(p_token) limit 1;
    if v_r.ok is not true then return jsonb_build_object('found', false); end if;
    -- and NOTHING ELSE. No re-render, no comparison.
    return jsonb_build_object('found', true, 'state', custom.sign_request_state(v_r.data),
                              'signable', custom.sign_request_state(v_r.data) in ('sent','viewed'));
  end;
  $red2$;
  perform set_config('role', 'authenticated', true);

  declare
    v_made2 jsonb;
  begin
    v_made2 := custom.sign_request_create(v_org, v_render2, 'client_signature',
                 'bruno@example.test', 'Bruno Vieira', interval '14 days');
    perform custom.record_update(v_org, v_rec2, jsonb_build_object('_actor', 'user', 'fee', '1975'));

    perform set_config('role', v_boss, true);
    v_pub := custom.sign_request_public_without_the_hash_check(v_made2 ->> 'token');
    perform set_config('role', 'authenticated', true);

    if (v_pub ->> 'signable')::boolean then
      v_red := v_red + 1;
      raise notice 'RED 2 IS RED — with the pre-fix bytes the link is still signable after the record changed, state %. Green PART 8 refuses exactly this.', v_pub ->> 'state';
    else
      raise exception 'RED 2 WENT GREEN — the planted bytes refused anyway, so PART 8 proves nothing';
    end if;
  end;

  -- ══ RED 3 — THE VALUE WITHOUT ITS PROVENANCE ═════════════════════════════════
  -- `custom.doc_sign` alone writes the render, the template, the version and the hash — and
  -- nothing about WHO signed from WHERE on WHAT, which is half of what a certificate means.
  -- This is what the Value looks like without this lane's completion. Green PART 7d.
  declare
    v_env record;
  begin
    perform custom.doc_sign(v_org, v_render2, 'client_signature', 'Bruno Vieira', null);
    select * into v_env from custom.value_read(v_org, v_rec2, 'client_signature') limit 1;
    if (v_env.source ->> 'ip') is null
       and (v_env.source ->> 'user_agent') is null
       and (v_env.source ->> 'mark') is null
       and (v_env.source ->> 'signer_email') is null
       and (v_env.source ->> 'kind') = 'signed_document' then
      v_red := v_red + 1;
      raise notice 'RED 3 IS RED — the Value written by custom.doc_sign alone carries no signer address, no browser, no mark and no email, and its source reads "signed_document". Green PART 7d refuses exactly this.';
    else
      raise exception 'RED 3 WENT GREEN — doc_sign alone already carried the certificate facts (%), so PART 7d proves nothing', v_env.source;
    end if;
  end;

  -- ══ RED 4 — A SIGNED-IN BROWSER REACHING THE SIGNING DOORS ═══════════════════
  -- The one-line version of this lane: grant the three server-lane doors to `authenticated`
  -- and let the browser call them. It works, and it means the address and the browser on
  -- every certificate are whatever the client typed. Green PART 0b refuses it.
  perform set_config('role', v_boss, true);
  create or replace function custom.sign_request_public_red_twin(p_token text)
  returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $red4$
  declare v_r record;
  begin
    select * into v_r from custom._sign_request_resolve(p_token) limit 1;
    if v_r.ok is not true then return jsonb_build_object('found', false); end if;
    return jsonb_build_object('found', true, 'state', custom.sign_request_state(v_r.data));
  end;
  $red4$;
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     non_client_lane, signed_in_callers, anonymous_callers)
  values ('custom', 'sign_request_public_red_twin', 'p_token text',
          array['text'::regtype]::oid[],
          'RED TWIN ONLY. Declared because the DDL guard revokes an undeclared SECURITY DEFINER function''s client EXECUTE inside the GRANT that issues it, which would make this block measure the guard rather than the wall it is about. The whole transaction rolls back, so neither this row nor the grant outlives the run.',
          'esign_red.sql', null, true, false)
  on conflict do nothing;
  grant execute on function custom.sign_request_public_red_twin(text) to authenticated;
  perform set_config('role', 'authenticated', true);

  -- A FRESH REQUEST, because RED 1 deliberately overwrote the first one's `token_hash` with
  -- the raw link and that request can no longer be resolved by anything. Measured: reusing it
  -- made this block read GREEN for a reason that had nothing to do with the wall it is about.
  declare
    v_made4 jsonb;
  begin
    perform set_config('role', 'authenticated', true);
    v_made4 := custom.sign_request_create(v_org, v_render, 'client_signature',
                 'ines@example.test', 'Ines Marlowe', interval '14 days');
    v_pub := custom.sign_request_public_red_twin(v_made4 ->> 'token');
  end;
  if (v_pub ->> 'found')::boolean then
    v_red := v_red + 1;
    raise notice 'RED 4 IS RED — a signed-in browser reached a signing door and read the request (state %). Green PART 0b refuses exactly this.', v_pub ->> 'state';
  else
    raise exception 'RED 4 WENT GREEN — the granted door refused a signed-in seat anyway, so PART 0b proves nothing';
  end if;

  perform set_config('role', v_boss, true);
  if v_red <> 4 then
    raise exception 'only % of 4 blocks went red', v_red;
  end if;
  raise notice 'ALL 4 BLOCKS ARE RED';
end
$red$;

rollback;
