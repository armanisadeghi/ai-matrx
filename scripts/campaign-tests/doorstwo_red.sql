-- scripts/campaign-tests/doorstwo_red.sql — lane DOORS-TWO, THE RED TWIN.
--
-- `doorstwo_green.sql` proves the five doors refuse. A refusal proves nothing unless the
-- thing it refuses would otherwise LAND — a clause satisfied by a door that is simply
-- broken is green for the wrong reason. So each block below takes ONE refusal out of ONE
-- door, inside a savepoint, re-runs the exact clause the green suite asserts, and proves
-- it now succeeds. Then the savepoint rolls back and the real door is untouched.
--
-- FIVE BLOCKS, FIVE REFUSALS:
--   RED 1  custom.doc_templates without its subject wall      → a stranger lists them
--   RED 2  custom.doc_renders without its subject wall        → a stranger reads the document
--   RED 3  custom.doc_template_delete without its editor wall → a member retires the wording
--   RED 4  custom.doc_template_delete without its soft arm    → retiring takes the render
--   RED 5  custom.subscription_cadences typed rather than
--          delegated                                          → the picker drifts silently
--
-- The whole file ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
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
  v_rec     uuid;
  v_tmpl    uuid;
  v_render  uuid;
  v_n       bigint;
  v_reds    int := 0;
  v_cad     text[];
  v_row     record;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'The Alvarado-Chen Kitchen red ' || left(v_org::text, 8), 'alvarado-chen-kitchen-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'doorstwo_red.sql', c_admin),
         ('custom', 'member_default_visibility', 'organization', v_org, v_org,
          '"shared_only"'::jsonb, 'doorstwo_red.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/doorstwo_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', 'description', 'the red twin''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'the red twin''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'client', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Job', 'label_plural', 'Jobs',
      'title_field', 'client',
      'fields', jsonb_build_array(jsonb_build_object('name', 'client')),
      'parent_id', v_home));
  v_f_name := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'client', 'key', 'client', 'type', 'text', 'required', true));
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('client', 'Marchetti Events Group', '_actor', 'user'));
  v_tmpl := custom.doc_template_save(v_org, v_table, 'Proposal',
              'Dear {{field:' || v_f_name || '}}.', null);
  v_render := custom.doc_render_document(v_org, v_tmpl, v_rec);
  raise notice 'fixtures: table %, record %, template %, document %', v_table, v_rec, v_tmpl, v_render;

  -- ══ RED 1 — custom.doc_templates without its subject wall ════════════════════
  perform set_config('role', v_boss, true);
  create or replace function custom.zz_red_doc_templates(p_organization_id uuid, p_table_id uuid)
  returns bigint language plpgsql stable security definer set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_templates');
    -- THE LINE THAT IS GONE:
    --   perform custom.assert_client_may_open(p_organization_id, p_table_id, …, 'viewer', 'record');
    return (select count(*) from custom.doc_template t
             where t.organization_id = p_organization_id and t.renders_table_id = p_table_id);
  end; $red$;
  -- THE RED HELPER MUST BE REACHABLE FROM THE SEAT, or the block would measure the DDL
  -- guard rather than the wall it removed: a SECURITY DEFINER function with no
  -- platform.client_callable_door row has its client EXECUTE revoked inside the GRANT
  -- (measured, first run). Declared and granted here exactly as the guard's own HINT says,
  -- and the whole file rolls back, so neither the row nor the grant outlives this run.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     non_client_lane, signed_in_callers, anonymous_callers)
  values ('custom', 'zz_red_doc_templates', 'p_organization_id uuid, p_table_id uuid', array['uuid'::regtype,'uuid'::regtype]::oid[],
          'A red-twin helper inside a transaction that always rolls back. It exists for the length of one campaign test to prove which line of the real door does the refusing, and it is never reachable outside it.',
          'scripts/campaign-tests/doorstwo_red.sql', null, true, false);
  grant execute on function custom.zz_red_doc_templates(uuid, uuid) to authenticated;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);

  begin
    perform 1 from custom.doc_templates(v_org, v_table);
    raise exception 'RED 1 did not reproduce: the real door let a stranger list the templates';
  exception when insufficient_privilege or no_data_found then null;
  end;
  select custom.zz_red_doc_templates(v_org, v_table) into v_n;
  if v_n <> 1 then
    raise exception 'RED 1 is not a proof: without the wall the count is %, so the wall was not what refused her', v_n;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 — the real door refuses her; the SAME body without assert_client_may_open hands her % template. The wall is what refuses.', v_n;

  -- ══ RED 2 — custom.doc_renders without its subject wall ══════════════════════
  perform set_config('role', v_boss, true);
  create or replace function custom.zz_red_doc_renders(p_organization_id uuid, p_record_id uuid)
  returns text language plpgsql stable security definer set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_renders');
    -- THE LINE THAT IS GONE: assert_client_may_open on the record.
    return (select d.body from custom.doc_render d
             where d.organization_id = p_organization_id and d.record_id = p_record_id
             order by d.rendered_at desc limit 1);
  end; $red$;
  -- THE RED HELPER MUST BE REACHABLE FROM THE SEAT, or the block would measure the DDL
  -- guard rather than the wall it removed: a SECURITY DEFINER function with no
  -- platform.client_callable_door row has its client EXECUTE revoked inside the GRANT
  -- (measured, first run). Declared and granted here exactly as the guard's own HINT says,
  -- and the whole file rolls back, so neither the row nor the grant outlives this run.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     non_client_lane, signed_in_callers, anonymous_callers)
  values ('custom', 'zz_red_doc_renders', 'p_organization_id uuid, p_record_id uuid', array['uuid'::regtype,'uuid'::regtype]::oid[],
          'A red-twin helper inside a transaction that always rolls back. It exists for the length of one campaign test to prove which line of the real door does the refusing, and it is never reachable outside it.',
          'scripts/campaign-tests/doorstwo_red.sql', null, true, false);
  grant execute on function custom.zz_red_doc_renders(uuid, uuid) to authenticated;
  perform set_config('role', 'authenticated', true);

  begin
    perform 1 from custom.doc_renders(v_org, v_rec);
    raise exception 'RED 2 did not reproduce: the real door let a stranger read the document';
  exception when insufficient_privilege or no_data_found then null;
  end;
  if custom.zz_red_doc_renders(v_org, v_rec) not like '%Marchetti Events Group%' then
    raise exception 'RED 2 is not a proof: without the wall she still got nothing, so something else was refusing';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 2 — the real door refuses her; the SAME body without the wall hands her the whole document body, customer name and all.';

  -- ══ RED 3 — custom.doc_template_delete without its editor wall ═══════════════
  perform set_config('role', v_boss, true);
  create or replace function custom.zz_red_template_delete(p_organization_id uuid, p_template_id uuid)
  returns boolean language plpgsql security definer set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_delete');
    -- THE LINE THAT IS GONE: assert_client_may_change on the Table at editor.
    update custom.record r set deleted_at = now(), version = r.version + 1
     where r.organization_id = p_organization_id and r.id = p_template_id;
    return true;
  end; $red$;
  -- THE RED HELPER MUST BE REACHABLE FROM THE SEAT, or the block would measure the DDL
  -- guard rather than the wall it removed: a SECURITY DEFINER function with no
  -- platform.client_callable_door row has its client EXECUTE revoked inside the GRANT
  -- (measured, first run). Declared and granted here exactly as the guard's own HINT says,
  -- and the whole file rolls back, so neither the row nor the grant outlives this run.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     non_client_lane, signed_in_callers, anonymous_callers)
  values ('custom', 'zz_red_template_delete', 'p_organization_id uuid, p_template_id uuid', array['uuid'::regtype,'uuid'::regtype]::oid[],
          'A red-twin helper inside a transaction that always rolls back. It exists for the length of one campaign test to prove which line of the real door does the refusing, and it is never reachable outside it.',
          'scripts/campaign-tests/doorstwo_red.sql', null, true, false);
  grant execute on function custom.zz_red_template_delete(uuid, uuid) to authenticated;
  perform set_config('role', 'authenticated', true);

  begin
    perform custom.doc_template_delete(v_org, v_tmpl);
    raise exception 'RED 3 did not reproduce: the real door let a plain member retire the table''s wording';
  exception when insufficient_privilege or no_data_found or sqlstate '02000' then null;
  end;

  -- PL/pgSQL has no SAVEPOINT; a BEGIN/EXCEPTION block IS the subtransaction, and a
  -- sentinel raised at its end rolls the destructive write back while the variables
  -- assigned inside it survive — which is how the measurement escapes.
  begin
    perform set_config('role', 'authenticated', true);
    perform custom.zz_red_template_delete(v_org, v_tmpl);
    perform set_config('request.jwt.claims', c_admin_j, true);
    select count(*) into v_n from custom.doc_templates(v_org, v_table);
    raise exception 'ZZ_RED_UNDO';
  exception when others then
    if sqlerrm <> 'ZZ_RED_UNDO' then raise; end if;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_n <> 0 then
    raise exception 'RED 3 is not a proof: without the editor wall the template survived anyway';
  end if;
  select count(*) into v_n from custom.doc_templates(v_org, v_table);
  if v_n <> 1 then
    raise exception 'RED 3 did not roll back: the template is gone for real — % left', v_n;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 — the real door refuses her; the SAME body without assert_client_may_change lets a plain member delete the table''s wording. Rolled back, template still there.';

  -- ══ RED 4 — a template delete that is NOT soft takes the document with it ════
  -- VAL-10 lives or dies here: a signature is over frozen bytes, so a hard delete that
  -- cascaded to the render would let somebody tidying up invalidate a seal.
  perform set_config('role', v_boss, true);
  create or replace function custom.zz_red_hard_delete(p_organization_id uuid, p_template_id uuid)
  returns boolean language plpgsql security definer set search_path to 'pg_catalog' as $red$
  begin
    -- THE ARM THAT IS GONE: `set deleted_at = now()`. This is what "retire" would mean if
    -- it removed the row instead of marking it.
    delete from custom.doc_render d
     where d.organization_id = p_organization_id and d.template_id = p_template_id;
    update custom.record r set deleted_at = now(), version = r.version + 1
     where r.organization_id = p_organization_id and r.id = p_template_id;
    return true;
  end; $red$;
  begin
    perform set_config('role', 'authenticated', true);
    perform custom.doc_template_delete(v_org, v_tmpl);
    select count(*) into v_n from custom.doc_renders(v_org, v_rec);
    if v_n <> 1 then
      raise exception 'RED 4 did not reproduce: the real door already lost the document — % left', v_n;
    end if;
    perform set_config('role', v_boss, true);
    perform custom.zz_red_hard_delete(v_org, v_tmpl);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from custom.doc_renders(v_org, v_rec);
    raise exception 'ZZ_RED_UNDO';
  exception when others then
    if sqlerrm <> 'ZZ_RED_UNDO' then raise; end if;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_n <> 0 then
    raise exception 'RED 4 is not a proof: the hard variant left the document alone too';
  end if;
  select count(*) into v_n from custom.doc_renders(v_org, v_rec);
  if v_n <> 1 then
    raise exception 'RED 4 did not roll back: the document is destroyed for real';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 — the real door leaves the rendered document standing; the hard variant destroys it and takes any seal over it. Rolled back, document still there.';

  -- ══ RED 5 — a cadence list typed rather than delegated ═══════════════════════
  perform set_config('role', v_boss, true);
  create or replace function custom.zz_red_cadences(p_organization_id uuid)
  returns text[] language plpgsql stable security definer set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_cadences');
    -- THE DELEGATION THAT IS GONE. This is the screen's old fallback, written out: a list
    -- that LOOKS right today and drifts the moment the digest runner learns a new word.
    return array['immediate']::text[];
  end; $red$;
  -- THE RED HELPER MUST BE REACHABLE FROM THE SEAT, or the block would measure the DDL
  -- guard rather than the wall it removed: a SECURITY DEFINER function with no
  -- platform.client_callable_door row has its client EXECUTE revoked inside the GRANT
  -- (measured, first run). Declared and granted here exactly as the guard's own HINT says,
  -- and the whole file rolls back, so neither the row nor the grant outlives this run.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     non_client_lane, signed_in_callers, anonymous_callers)
  values ('custom', 'zz_red_cadences', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
          'A red-twin helper inside a transaction that always rolls back. It exists for the length of one campaign test to prove which line of the real door does the refusing, and it is never reachable outside it.',
          'scripts/campaign-tests/doorstwo_red.sql', null, true, false);
  grant execute on function custom.zz_red_cadences(uuid) to authenticated;
  perform set_config('role', 'authenticated', true);

  v_cad := custom.subscription_cadences(v_org);
  perform set_config('role', v_boss, true);
  if v_cad is distinct from custom.agg_subscription_cadences() then
    raise exception 'RED 5 did not reproduce: the real door already disagrees with the runner';
  end if;
  if custom.zz_red_cadences(v_org) is not distinct from custom.agg_subscription_cadences() then
    raise exception 'RED 5 is not a proof: the typed list happens to equal the runner''s today, so it proves nothing';
  end if;
  perform set_config('role', 'authenticated', true);
  v_reds := v_reds + 1;
  raise notice 'RED 5 — the real door answers %, the same as the runner; the typed fallback answers {immediate} and would offer a picker the runner does not honour.', v_cad;

  perform set_config('role', v_boss, true);
  if v_reds <> 5 then
    raise exception 'only % of 5 blocks went red', v_reds;
  end if;
  raise notice 'ALL 5 BLOCKS RED — doorstwo_red.sql';
end;
$suite$;

rollback;
