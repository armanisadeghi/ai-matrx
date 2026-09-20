-- The fixture `scripts/campaign-tests/w4_query_red.sql` rebuilds after each ROLLBACK, so every
-- break starts from the same GREEN state and the "it went red" claim is a change, not a
-- coincidence. Not a migration, not run on its own.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A fixture asserts nothing, so nothing here is a
-- product clause — but what it BUILDS decides what the suite that includes it can prove. Built
-- as the role that owns `custom.record`, the Tables, the Jobs and the Clients could take a
-- shape no signed-in person could ever have produced, and the suite would then be measuring a
-- store state the product cannot reach.
--
-- So it now makes a PERSON's fixture: a disposable organization, a membership for each of the
-- two test accounts, this organization's store switched on, a Home, and then the Tables
-- (`custom.table_declare`), the Jobs and Clients (`custom.record_write`) and the links between
-- them (`platform.relation_set`) all made THROUGH THE DOORS from the seat `authenticated`.
-- THREE steps have no working client door and say so where they happen: adding the two relation
-- columns to the Job Table's own document, minting the two `relation` Fields behind them
-- (`custom.field` is a view over `custom.record` and no client verb declares a relation column
-- with a target, a cardinality and an on-delete rule), and setting the links themselves —
-- `platform.relation_set` carries an EXECUTE grant for `authenticated` and STILL fails from
-- that seat, because it is SECURITY INVOKER and writes `custom.record` directly.
--
-- IT HANDS THE SEAT BACK at the end, deliberately: `w4_query_red.sql` replaces function bodies
-- between the four rebuilds, and replacing a body is DDL that belongs to the operator.

select set_config('zz.boss', current_user, true);

do $query_fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_job     uuid;
  v_client  uuid;
  v_alpha   uuid;
  v_beta    uuid;
  v_j1      uuid;
  v_j2      uuid;
  v_j3      uuid;
begin
  perform set_config('app.actor_system', 'campaign.w4_query.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ W4-QUERY Red', 'zz-w4-query-red-' || substr(v_org::text, 1, 8), 'ZQR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_query_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- THE SEAT. Everything below is what a signed-in admin of this Home can actually make.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'query fixture: the seat was not taken — current_user is %', current_user;
  end if;

  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ R Job', 'slug', 'zz_r_job', 'type', 'entity', 'display', 'list',
    'label_singular', 'ZZ R Job', 'label_plural', 'ZZ R Jobs',
    'ordered', false, 'weight', 'light', 'retention_days', 365,
    'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));
  v_client := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ R Client', 'slug', 'zz_r_client', 'type', 'entity', 'display', 'list',
    'label_singular', 'ZZ R Client', 'label_plural', 'ZZ R Clients',
    'ordered', false, 'weight', 'light', 'retention_days', 365,
    'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))));

  v_alpha := custom.record_write(v_org, v_client, '{"title":"Alpha"}'::jsonb);
  v_beta  := custom.record_write(v_org, v_client, '{"title":"Beta"}'::jsonb);
  v_j1    := custom.record_write(v_org, v_job, '{"title":"J1"}'::jsonb);
  v_j2    := custom.record_write(v_org, v_job, '{"title":"J2"}'::jsonb);
  v_j3    := custom.record_write(v_org, v_job, '{"title":"J3"}'::jsonb);

  -- THE TWO STEPS NO CLIENT DOOR COVERS. There is no client verb that declares a RELATION
  -- column — one that names a target Table, a cardinality and what happens to the link when
  -- the target goes — so the Job Table's field list and the two Field rows behind it are
  -- written as the connected role. Nothing is asserted while out.
  perform set_config('role', v_boss, true);
  update custom.record set data = jsonb_set(data, '{fields}',
           (data -> 'fields') || '[{"name":"client"},{"name":"next_job"}]'::jsonb)
   where organization_id = v_org and id = v_job;
  insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config, source,
                            source_config, sensitivity, context_policy, rules, depends_on,
                            applies_to_types, multi, dated, required, sort)
  values (v_org, v_job, 'client', 'Client', 'Client', 'relation', v_client,
          50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
          'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10),
         (v_org, v_job, 'next_job', 'Next', 'Next', 'relation', v_job,
          50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
          'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 20);

  -- AND THE LINKS. `platform.relation_set` HOLDS AN EXECUTE GRANT for `authenticated` and still
  -- cannot be called from that seat: it is SECURITY INVOKER and writes `custom.record`, a table
  -- no signed-in person may touch, so from the seat it raises `permission denied for table
  -- record` (measured 2026-09-19, lane SEAT-SUITES). A grant without the privileges the body
  -- needs is not a door, and until it is one this step stays where it actually works. The
  -- suite's own clauses about relations go through the custom.relation_* and custom.query_*
  -- doors, which are SECURITY DEFINER and do work from the seat.
  perform platform.relation_set(v_org, v_j1, 'client', jsonb_build_array(v_alpha::text));
  perform platform.relation_set(v_org, v_j2, 'client', jsonb_build_array(v_alpha::text, v_beta::text));
  perform platform.relation_set(v_org, v_j1, 'next_job', jsonb_build_array(v_j2::text));
  perform platform.relation_set(v_org, v_j2, 'next_job', jsonb_build_array(v_j3::text));
  perform platform.relation_set(v_org, v_j3, 'next_job', jsonb_build_array(v_j1::text));

  perform set_config('zz.org', v_org::text, true);
  perform set_config('zz.tjob', v_job::text, true);
  perform set_config('zz.alpha', v_alpha::text, true);
  perform set_config('zz.beta', v_beta::text, true);
  perform set_config('zz.j1', v_j1::text, true);

  -- THE SEAT GOES BACK. `w4_query_red.sql` replaces function bodies between rebuilds, and
  -- replacing a body is DDL: no client door does it and none ever will.
  perform set_config('role', v_boss, true);
end $query_fixture$;
