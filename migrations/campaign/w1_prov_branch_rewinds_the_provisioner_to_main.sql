-- target: branch
-- based-on: platform.provision(jsonb, text, uuid, text) 41f621d707f78a90e2105a9950084cbd3ddb423c6c544e54ce3ec9ea7c685ee9
-- based-on: platform.provision_validate(jsonb, text, uuid) c02982a46d5b88354432a6efd85fd5d046108066b3f8edbeb8cda350fc26d2e7
-- based-on: platform.provision_base_columns() 2d82ec741d70b2611562572cb26da7d60d3cf8c657e17d601a28c7b3bc2bb74a
-- based-on: iam.entity_read_kernel_fingerprint() a2c8ddb0bb87e50b67fe806928fa4e31e1941fd293e4cc477df7437be265c0ea
-- based-on: iam.apply_table_grants(text, text, text) c3c392ea3348847200c760b8bfce36f977840882fcaabb115728323e8a8d4462
-- based-on: iam._apply_rls_unchecked(text, text, text, text) fb1680547f8a619d7bb9e7c075360d1bd73c73d269de2c51cd8cd1085d7363d7
--
-- LAND — THE REHEARSAL COPY REWINDS ITS PROVISIONER TO THE MAIN DATABASE'S BODIES.
--
-- WHY THIS FILE EXISTS. The campaign's two provisioner-door files
-- (`w1_prov_provisioner_speaks_partitions.sql`, `w1_prov_schema_exposure_is_declared.sql`)
-- declare `-- based-on: platform.provision(...) 411b3f4f…` and `… 21d50d62…`. The MAIN
-- database's live body is `ec762f6a…`: it carries migration 0796, which stores
-- `argument_rules` and `contract_probe` on every door row through
-- `platform.door_rules_normalize(...)`. The campaign body was written before 0796 landed and
-- does not have it, so applying those bytes to the main database would silently delete a live
-- feature — which is exactly what the `-- based-on:` check refused (measured 2026-09-18 19:1x
-- UTC, one finding, nothing applied).
--
-- The honest remedy is a superseding file that re-bases the merge on the main database's
-- CURRENT body (`w1_prov_the_provisioner_door_on_main.sql`). That file must rehearse here
-- first, and its `-- based-on:` lines name the MAIN database's hashes — so this copy has to be
-- standing on the same bodies when it rehearses. That is all this file does: it puts the main
-- database's six live provisioner bodies back on the copy and removes the three functions the
-- campaign invented here, so the next file can roll them ALL forward again, merged, on both.
--
-- NOTHING IS LOST. Every object this removes is re-created, with the campaign's changes, by
-- `w1_prov_the_provisioner_door_on_main.sql` in the same working session. It is `-- target:
-- branch` and can never reach the main database.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- The three functions the campaign invented on this copy. They do not exist on the main
-- database, so the superseding file creates them fresh there; here they must be absent or
-- that same file would be replacing a body it never declared.
drop function if exists platform.provision_partition_key_candidates(jsonb);
drop function if exists platform.schema_is_client_exposed(text);
drop function if exists platform.schema_exposure_violations(text);

CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  r          record;
begin
  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    select * into v_cur from platform.v_provision_spec_current c where c.token = v_token;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  v_cols := 'id uuid primary key default gen_random_uuid()';
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      v_frag := v_frag || format(' references %s(id) on delete %s', v_target,
        case lower(v_item->'references'->>'on_delete')
          when 'cascade' then 'cascade' when 'restrict' then 'restrict'
          when 'set_null' then 'set null' else 'no action' end);
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid references auth.users(id)';
  v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  execute format('create table %s (%s)', v_rel, v_cols);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, BASE COLUMNS INCLUDED: updated_by, organization_id
  -- and created_by are 1,174 of the 2,029 live unindexed FKs, and they are columns the
  -- BUILDER emits, so the rule lives here and not in the declaration.
  foreach v_txt in array array['organization_id','created_by','updated_by'] loop
    execute format('create index on %s (%I)', v_rel, v_txt);
  end loop;
  if v_cat then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason');
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- RLS -------------------------------------------------------------
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- ---- association types -----------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::public.permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
  end loop;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create or replace view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create or replace function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at,
           pg_get_function_arguments(p.oid) fa
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    -- 0796: the per-argument rules are STORED, not validated and thrown away (G15).
    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      argument_rules, contract_probe,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            platform.door_rules_normalize(r.fa, v_item->'arg_checks'),
            case when jsonb_typeof(v_item->'contract_probe') = 'object' then v_item->'contract_probe' end,
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE block. Each GRANT fires a
    -- DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8).
    if (v_item->>'client_access') = 'signed_in' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to authenticated',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to anon, authenticated',
                                     v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s; observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access',
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     and l.rule = 'definer_client_grant_revoked'
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the
  -- CHECK NAME is the prefix of `detail`. Refuse on every FAIL and every WARN except
  -- the three legacy-column WARNs (§3.1); INFO (the snapshot row) is ignored.
  for r in select * from iam.canonical_certify(v_schema, v_table, v_token) loop
    v_certify := v_certify || jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail);
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,''));
    end if;
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user));

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    'canonical_certify_ok', iam.canonical_certify_ok(v_schema, v_table, v_token),
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.');
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_validate(p_spec jsonb, p_lane text DEFAULT 'full'::text, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f            jsonb[] := '{}'::jsonb[];
  n            jsonb;
  answered     text[]  := '{}'::text[];
  plan         jsonb[] := '{}'::jsonb[];
  v_lane       text    := lower(coalesce(p_lane, 'full'));
  v_restricted boolean;
  v_schema     text;
  v_table      text;
  v_token      text;
  v_type       text;
  v_variant    text;
  v_origin     text;
  v_access     jsonb;
  v_class      text;
  v_scope      text;
  v_vis        text;
  v_key        text;
  v_soft       boolean;
  v_err        text;
  v_item       jsonb;
  v_sub        jsonb;
  v_name       text;
  v_txt        text;
  v_names      text[] := '{}'::text[];
  v_fk_cols    text[] := '{}'::text[];
  v_all_cols   text[];
  v_i          int;
  v_uuid       uuid;
  v_defaults   jsonb;
begin
  v_restricted := (v_lane = 'restricted');
  if v_lane not in ('full','restricted') then
    raise exception 'platform.provision_validate: p_lane must be ''full'' or ''restricted'' (got %)', p_lane;
  end if;

  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return jsonb_build_object(
      'ok', false, 'lane', v_lane,
      'findings', jsonb_build_array(platform.provision_finding(
        'shape.invalid', '(the whole spec)', null,
        format('the spec is %s, not a JSON object', coalesce(jsonb_typeof(p_spec), 'null')))),
      'normalized_spec', null, 'spec_hash', null, 'plan', '[]'::jsonb);
  end if;

  n := p_spec;

  -- W0-7 / PLAN §3.1: the preflight's refusals are findings here too, so the dry run
  -- says what provision() would refuse before anybody takes a lock.
  f := f || array(select x from jsonb_array_elements((platform.provision_preflight())->'findings') x);

  -- === shape ==============================================================
  for v_err in
    select e from unnest(extensions.jsonschema_validation_errors(
      (select s.schema from platform.provision_schema s where s.name = 'full')::json,
      p_spec::json)) e
  loop
    f := f || platform.provision_finding('shape.invalid', '(see below)', null, v_err);
  end loop;

  -- === lane B: the closed subset (PLAN §4.0) ==============================
  -- The GRANT on platform.provision_restricted is the boundary; these checks are
  -- what that entry point refuses with, so the refusal names the field.
  if v_restricted then
    if p_org_id is null then
      f := f || platform.provision_finding('lane.org_missing', 'p_org_id', null,
                  'no organization was passed with this call');
    end if;
    if p_spec ? 'checks' and jsonb_array_length(coalesce(p_spec->'checks','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'checks[]', null,
                  'table-level CHECK expressions are raw SQL');
    end if;
    if p_spec ? 'types' and jsonb_array_length(coalesce(p_spec->'types','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'types[]', null,
                  'creating a type is lane A only — pick from the existing types listed by provision_options(''vocabularies'')');
    end if;
    if coalesce(p_spec->>'audit_class','entity') = 'machinery' then
      f := f || platform.provision_finding('lane.expression_refused', 'audit_class', null,
                  'audit_class = machinery');
    end if;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
      if v_item ? 'check' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].check', coalesce(v_item->>'name','?')), null, v_item->>'check');
      end if;
      if v_item ? 'generated' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].generated', coalesce(v_item->>'name','?')), null,
               'a generated column is a stored SQL expression');
      end if;
      if v_item ? 'default'
         and not platform.provision_default_menu_ok(v_item->'default', v_item->>'type') then
        f := f || platform.provision_finding('lane.default_menu',
               format('fields[%s].default', coalesce(v_item->>'name','?')), null,
               v_item->>'default');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
      if v_item ? 'where' then
        f := f || platform.provision_finding('lane.expression_refused', 'indexes[].where', null,
                    v_item->>'where');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
      if v_item ? 'body' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].body', coalesce(v_item->>'name','?')), null,
               'a function body is SQL executed by a SECURITY DEFINER owned by postgres');
      end if;
      if lower(coalesce(v_item->>'security','invoker')) = 'definer' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].security', coalesce(v_item->>'name','?')), null, 'definer');
      end if;
    end loop;
    if jsonb_array_length(coalesce(p_spec->'views','[]'::jsonb)) > 0 then
      for v_item in select value from jsonb_array_elements(p_spec->'views') loop
        if v_item ? 'definition' then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].definition', coalesce(v_item->>'name','?')), null,
                 'a view definition is raw SQL read by a postgres-owned relation');
        end if;
        if coalesce((v_item->>'security_invoker')::boolean, true) is false then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].security_invoker', coalesce(v_item->>'name','?')), null, 'false');
        end if;
      end loop;
    end if;
  end if;

  -- === identity ===========================================================
  v_schema := p_spec->>'schema';
  v_table  := p_spec->>'table';
  v_token  := p_spec->>'token';

  if v_schema is null then
    f := f || platform.provision_finding('identity.schema.missing');
  elsif v_schema in ('public','graveyard','information_schema')
        or v_schema like 'pg\_%'
        or v_schema in ('auth','storage','realtime','vault','extensions','supabase_functions',
                        'supabase_migrations','cron','net','pgsodium','pgsodium_masks',
                        'graphql','graphql_public','_analytics','_realtime') then
    f := f || platform.provision_finding('identity.schema.forbidden', 'schema', null, v_schema);
  elsif not exists (select 1 from pg_namespace where nspname = v_schema) then
    f := f || platform.provision_finding('identity.schema.unknown', 'schema', null, v_schema);
  elsif not exists (select 1 from platform.provision_generate_target t
                     where t.schema_name = v_schema
                       and t.orm_target and t.types_target) then
    -- THE PARITY RULE: provisionable only if the repository can generate for it.
    -- Checked on BOTH lanes and before the grant check, because a schema the repo
    -- cannot represent is illegal for everyone, not merely ungranted to someone.
    f := f || platform.provision_finding('identity.schema.not_generable', 'schema',
           coalesce((select string_agg(t.schema_name, ' | ' order by t.schema_name)
                       from platform.provision_generate_target t
                      where t.orm_target and t.types_target),
                    '(the repo has published no generate targets at all — run scripts/check_provision_generate_targets.py --fix)'),
           format('%s (ORM model target: %s; frontend type target: %s)', v_schema,
                  coalesce((select t.orm_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all'),
                  coalesce((select t.types_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all')));
  elsif v_restricted and p_org_id is not null
        and not exists (select 1 from platform.provision_grant g
                         where g.organization_id = p_org_id and g.schema_name = v_schema) then
    f := f || platform.provision_finding('lane.schema_not_granted', 'schema',
           coalesce((select string_agg(g.schema_name, ' | ' order by g.schema_name)
                       from platform.provision_grant g where g.organization_id = p_org_id),
                    '(this organization holds no schema yet)'),
           v_schema);
  end if;

  if v_table is null then
    f := f || platform.provision_finding('identity.table.missing');
  elsif not platform.provision_identifier_ok(v_table) then
    f := f || platform.provision_finding('identity.table.name', 'table', null, v_table);
  else
    if v_schema is not null and to_regclass(format('%I.%I', v_schema, v_table)) is not null then
      f := f || platform.provision_finding('identity.token.taken', 'table', null,
             format('%s.%s already exists', v_schema, v_table));
    end if;
    -- §1a: a repeated table name must mean the same ROLE.
    if exists (select 1 from platform.entity_types e
                where e.table_name = v_table and e.schema_name is distinct from v_schema) then
      if p_spec->'same_role_as'->>'token' is null
         or btrim(coalesce(p_spec->'same_role_as'->>'reason','')) = '' then
        f := f || platform.provision_finding('identity.table.collision', 'table',
               null,
               format('%s already names %s', v_table,
                 (select string_agg(e.schema_name||'.'||e.table_name||' ('||e.token||')', ', ' order by e.token)
                    from platform.entity_types e where e.table_name = v_table)));
      elsif not exists (select 1 from platform.entity_types e
                         where e.token = p_spec->'same_role_as'->>'token') then
        f := f || platform.provision_finding('identity.same_role_as.unknown', 'same_role_as.token',
               null, p_spec->'same_role_as'->>'token');
      end if;
    end if;
  end if;

  if v_token is null then
    f := f || platform.provision_finding('identity.token.missing');
  elsif not platform.provision_identifier_ok(v_token) then
    f := f || platform.provision_finding('identity.table.name', 'token', null, v_token);
  elsif exists (select 1 from platform.entity_types e where e.token = v_token) then
    f := f || platform.provision_finding('identity.token.taken', 'token', null, v_token);
  end if;

  if btrim(coalesce(p_spec->>'label','')) = '' then
    f := f || platform.provision_finding('identity.label.missing');
  end if;
  if btrim(coalesce(p_spec->>'description','')) = '' then
    f := f || platform.provision_finding('identity.description.missing');
  end if;

  -- === type and origin ====================================================
  v_type := p_spec->>'type';
  if v_type is null then
    f := f || platform.provision_finding('type.missing', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated');
  elsif v_type not in ('entity','detail','reference','ledger','restricted','system','deprecated') then
    f := f || platform.provision_finding('type.unknown', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated', v_type);
  elsif v_type = 'deprecated' then
    f := f || platform.provision_finding('type.not_provisionable', 'type', null, v_type);
  elsif v_type = 'system' then
    f := f || platform.provision_finding('type.self_declared_machinery', 'type',
           'entity | detail | reference | ledger | restricted', v_type);
  end if;

  v_variant := case v_type
                 when 'entity'     then 'entity'
                 when 'detail'     then 'component'
                 when 'reference'  then 'system'
                 when 'ledger'     then 'ledger'
                 when 'restricted' then 'restricted'
                 else null end;

  v_origin := p_spec->>'origin';
  if v_origin is null then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom');
  elsif v_origin = 'custom' then
    f := f || platform.provision_finding('origin.custom_unbuilt', 'origin', 'standard', 'custom');
  elsif v_origin <> 'standard' then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom', v_origin);
  end if;

  -- === the access block — no silent defaults ==============================
  v_access := p_spec->'access';
  if v_access is null or jsonb_typeof(v_access) <> 'object' then
    f := f || platform.provision_finding('access.missing');
    v_access := '{}'::jsonb;
  end if;
  v_class := v_access->>'data_class';
  v_scope := v_access->>'default_list_scope';
  v_vis   := v_access->>'visibility';
  v_key   := v_access->>'key_column';

  if v_class is not null
     and v_class not in ('private','confidential','organization','public') then
    f := f || platform.provision_finding('access.data_class.missing', 'access.data_class',
           'private | confidential | organization | public', v_class);
    v_class := null;
  end if;

  if v_type = 'detail' then
    if v_class is not null then
      f := f || platform.provision_finding('access.data_class.forbidden_for_detail',
             'access.data_class', null, v_class);
    end if;
    if v_scope is not null then
      f := f || platform.provision_finding('access.default_list_scope.forbidden',
             'access.default_list_scope', null, v_scope);
    end if;
    if v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    end if;
    if p_spec->'component_anon_read_via_public_parent' is null then
      f := f || platform.provision_finding('registration.component_anon_read.missing');
    end if;
  elsif v_type in ('entity','reference','ledger','restricted') then
    if v_class is null then
      if v_type = 'ledger' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', '(not set), and type = ''ledger''');
      elsif v_key = 'user_id' then
        -- The personal shape: the live CHECK admits NULL or private, so NULL is a
        -- legal answer here and there is nothing to refuse.
        null;
      else
        f := f || platform.provision_finding('access.data_class.missing');
      end if;
    else
      if v_type = 'ledger' and v_class = 'private' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', 'private');
      end if;
      if v_key = 'user_id' and v_class <> 'private' then
        f := f || platform.provision_finding('access.data_class.personal_not_private',
               'access.data_class', 'private (or omit it)', v_class);
      end if;
      if btrim(coalesce(v_access->>'data_class_reason','')) = '' then
        f := f || platform.provision_finding('access.data_class_reason.missing');
      end if;
    end if;

    if v_type = 'ledger' then
      if v_scope is not null then
        f := f || platform.provision_finding('access.default_list_scope.forbidden',
               'access.default_list_scope', null, v_scope);
      end if;
    elsif v_scope is null then
      f := f || platform.provision_finding('access.default_list_scope.missing');
    elsif v_scope not in ('mine','organization') then
      f := f || platform.provision_finding('access.default_list_scope.missing',
             'access.default_list_scope', 'mine | organization', v_scope);
    end if;

    if v_type = 'restricted' and v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    elsif v_type = 'reference' and v_vis is null then
      f := f || platform.provision_finding('access.visibility.required');
    elsif v_vis is not null and v_vis not in ('personal','internal','link','public') then
      f := f || platform.provision_finding('access.visibility.required', 'access.visibility',
             'personal | internal | link | public', v_vis);
    elsif v_vis = 'personal' and btrim(coalesce(v_access->>'visibility_reason','')) = '' then
      f := f || platform.provision_finding('access.visibility.reason_missing');
    end if;

    if v_type = 'entity' then
      if v_key is null then
        f := f || platform.provision_finding('access.key_column.missing');
      elsif v_key not in ('created_by','user_id') then
        f := f || platform.provision_finding('access.key_column.missing', 'access.key_column',
               'created_by | user_id', v_key);
      end if;
      if v_key = 'user_id' then v_variant := 'personal'; end if;
    end if;
  end if;

  -- === parents ============================================================
  if v_type = 'detail' then
    if jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('parents.missing');
    end if;
  elsif jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) > 0 then
    f := f || platform.provision_finding('parents.forbidden', 'parents', null, v_type);
  end if;

  -- === fields =============================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := v_item->>'name';
    if not platform.provision_identifier_ok(v_name) then
      f := f || platform.provision_finding('fields.name.invalid', format('fields[%s].name', v_i), null, v_name);
      continue;
    end if;
    if v_name = any (platform.provision_base_columns()) then
      f := f || platform.provision_finding('fields.name.base_collision',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    if v_name = any (v_names) then
      f := f || platform.provision_finding('fields.name.duplicate',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    v_names := v_names || v_name;

    if btrim(coalesce(v_item->>'type','')) = '' then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i));
    elsif to_regtype(v_item->>'type') is null then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i),
             null, format('%L is not a type this database has', v_item->>'type'));
    end if;

    if v_item ? 'references' then
      v_fk_cols := v_fk_cols || v_name;
      v_txt := v_item->'references'->>'on_delete';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i));
      elsif lower(v_txt) not in ('cascade','restrict','set_null','no_action') then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i),
               'cascade | restrict | set_null | no_action', v_txt);
      end if;
      v_txt := v_item->'references'->>'target';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, '(not set)');
      elsif not exists (select 1 from platform.entity_types e where e.token = v_txt)
            and (position('.' in v_txt) = 0 or to_regclass(v_txt) is null) then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, v_txt);
      elsif v_restricted and p_org_id is not null
            and exists (select 1 from platform.entity_types e
                         where e.token = v_txt and e.rls_variant <> 'system'
                           and not exists (select 1 from platform.provision_grant g
                                            where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
        f := f || platform.provision_finding('parents.cross_tenant',
               format('fields[%s].references.target', v_i), null, v_txt);
      end if;

      v_txt := v_item->>'relationship_kind';
      if v_txt is null then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i));
      elsif v_txt not in ('composition','reference','lookup') then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i), 'composition | reference | lookup', v_txt);
      elsif btrim(coalesce(v_item->>'relationship_note','')) = '' then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_note', v_i), null,
               'the kind is declared but the one-line note is empty');
      end if;
    end if;

    if v_item ? 'generated'
       and coalesce((v_item->'generated'->>'stored')::boolean, false) is not true then
      f := f || platform.provision_finding('fields.generated.stored',
             format('fields[%s].generated.stored', v_i), 'true', v_item->'generated'->>'stored');
    end if;
  end loop;

  v_all_cols := v_names || platform.provision_base_columns();

  -- The personal shape keys every row on user_id; iam.verify_canonical FAILs
  -- `legacy_owner_col` ("personal variant requires user_id") without the column.
  if v_type = 'entity' and v_key = 'user_id' and not ('user_id' = any (v_names)) then
    f := f || platform.provision_finding('access.key_column.user_id_missing', 'fields', null,
           'access.key_column = ''user_id'' but no field is named user_id');
  end if;

  -- parent FK columns must be columns this spec declares
  v_i := 0;
  for v_txt in select value #>> '{}' from jsonb_array_elements(coalesce(p_spec->'parents','[]'::jsonb)) loop
    v_i := v_i + 1;
    if position(':' in v_txt) = 0
       or btrim(split_part(v_txt, ':', 1)) = '' or btrim(split_part(v_txt, ':', 2)) = '' then
      f := f || platform.provision_finding('parents.shape', format('parents[%s]', v_i), null, v_txt);
      continue;
    end if;
    v_name := btrim(split_part(v_txt, ':', 1));
    if not exists (select 1 from platform.entity_types e where e.token = v_name) then
      f := f || platform.provision_finding('parents.unknown_token', format('parents[%s]', v_i), null, v_name);
    elsif v_restricted and p_org_id is not null
          and exists (select 1 from platform.entity_types e
                       where e.token = v_name and e.rls_variant <> 'system'
                         and not exists (select 1 from platform.provision_grant g
                                          where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
      f := f || platform.provision_finding('parents.cross_tenant', format('parents[%s]', v_i), null, v_name);
    end if;
    if btrim(split_part(v_txt, ':', 2)) <> all (v_names) then
      f := f || platform.provision_finding('parents.unknown_column', format('parents[%s]', v_i), null,
             btrim(split_part(v_txt, ':', 2)));
    end if;
  end loop;

  -- === registration =======================================================
  v_txt := p_spec->>'taxonomy_node_id';
  if v_txt is null then
    f := f || platform.provision_finding('registration.taxonomy_node_id.missing');
  else
    begin
      v_uuid := v_txt::uuid;
      if not exists (select 1 from platform.taxonomy_node t where t.id = v_uuid) then
        f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
      end if;
    exception when others then
      f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
    end;
  end if;

  if btrim(coalesce(p_spec->>'category_label','')) = '' then
    f := f || platform.provision_finding('registration.category_label.missing');
  end if;

  if coalesce((p_spec->>'is_listed')::boolean, false) then
    v_txt := p_spec->>'title_column';
    if v_txt is null then
      f := f || platform.provision_finding('registration.title_column.missing');
    elsif v_txt <> all (v_all_cols) then
      f := f || platform.provision_finding('registration.title_column.unknown', 'title_column',
             array_to_string(v_all_cols, ' | '), v_txt);
    end if;
  end if;

  if p_spec ? 'content_role'
     and p_spec->>'content_role' <> all (platform.provision_live_vocabulary('content_role')) then
    f := f || platform.provision_finding('registration.content_role.unknown', 'content_role',
           array_to_string(platform.provision_live_vocabulary('content_role'), ' | '), p_spec->>'content_role');
  end if;

  if coalesce(p_spec->>'relation_kind','table') = 'projection'
     and (p_spec->>'projects_token' is null or coalesce(p_spec->>'audit_class','entity') <> 'machinery') then
    f := f || platform.provision_finding('registration.relation_kind.projection');
  end if;

  if coalesce(p_spec->>'audit_class','entity') = 'machinery'
     and btrim(coalesce(p_spec->>'audit_class_reason','')) = '' then
    f := f || platform.provision_finding('registration.audit_class.reason_missing');
  end if;

  -- === sharing ============================================================
  if not (p_spec ? 'sharing') then
    f := f || platform.provision_finding('sharing.missing');
  elsif jsonb_typeof(p_spec->'sharing') = 'object' then
    if btrim(coalesce(p_spec->'sharing'->>'display_label','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.display_label', null,
             'the sharing object carries no display_label');
    end if;
    if btrim(coalesce(p_spec->'sharing'->>'url_path_template','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.url_path_template', null,
             'the sharing object carries no url_path_template');
    end if;
    -- ATTACK #20: strip-client-excluded-columns.ts removes an excluded column from
    -- database.types.ts, so the share renderer would reference a field the types
    -- say does not exist.
    for v_txt in
      select x from unnest(coalesce(
        array(select jsonb_array_elements_text(p_spec->'sharing'->'public_columns')), '{}'::text[])) x
      where x = any (coalesce(array(select jsonb_array_elements_text(p_spec->'client_excluded_columns')), '{}'::text[]))
    loop
      f := f || platform.provision_finding('sharing.excluded_and_public', 'sharing.public_columns', null, v_txt);
    end loop;
  end if;

  -- === indexes ============================================================
  v_soft := coalesce((p_spec->>'soft_delete')::boolean, v_type is distinct from 'ledger');
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
    v_i := v_i + 1;
    if v_item ? 'method'
       and lower(v_item->>'method') <> all (platform.provision_live_vocabulary('index_method')) then
      f := f || platform.provision_finding('indexes.method.unknown', format('indexes[%s].method', v_i),
             array_to_string(platform.provision_live_vocabulary('index_method'), ' | '), v_item->>'method');
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'columns','[]'::jsonb)) loop
      if v_txt <> all (v_all_cols) then
        f := f || platform.provision_finding('registration.title_column.unknown',
               format('indexes[%s].columns', v_i), array_to_string(v_all_cols, ' | '), v_txt);
      end if;
    end loop;
  end loop;

  -- === association types ==================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'association_types','[]'::jsonb)) loop
    v_i := v_i + 1;
    foreach v_txt in array array['source_type','target_type'] loop
      v_name := v_item->>v_txt;
      if v_name is not null and v_name <> coalesce(v_token,'')
         and not exists (select 1 from platform.entity_types e where e.token = v_name) then
        f := f || platform.provision_finding('association_types.unknown_token',
               format('association_types[%s].%s', v_i, v_txt), null, v_name);
      end if;
    end loop;
    if (v_item->'label') is null or jsonb_typeof(v_item->'label') = 'null' then
      if btrim(coalesce(v_item->>'notes','')) = '' then
        f := f || platform.provision_finding('association_types.wildcard_reason',
               format('association_types[%s].label', v_i), null, 'null (a wildcard for the whole pair)');
      end if;
    end if;
  end loop;

  -- === functions ==========================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := coalesce(v_item->>'name', format('#%s', v_i));
    if not v_restricted and btrim(coalesce(v_item->>'body','')) = '' then
      f := f || platform.provision_finding('functions.body.missing', format('functions[%s].body', v_name));
    end if;
    v_txt := v_item->>'client_access';
    if v_txt is null then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name));
    elsif v_txt not in ('anonymous','signed_in','server_only') then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name),
             'anonymous | signed_in | server_only', v_txt);
    elsif v_txt = 'server_only' then
      if length(btrim(coalesce(v_item->>'non_client_lane',''))) < 40 then
        f := f || platform.provision_finding('functions.non_client_lane.missing',
               format('functions[%s].non_client_lane', v_name),
               'at least 40 characters (the live CHECK door_non_client_lane_is_declared)',
               coalesce(v_item->>'non_client_lane','(not set)'));
      end if;
    elsif v_txt = 'anonymous' and length(btrim(coalesce(v_item->>'anonymous_purpose',''))) < 40 then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].anonymous_purpose', v_name),
             'at least 40 characters (the live CHECK door_anonymous_purpose_is_declared)',
             coalesce(v_item->>'anonymous_purpose','(not set)'));
    end if;
    if btrim(coalesce(v_item->>'reason','')) = '' then
      f := f || platform.provision_finding('functions.reason.missing', format('functions[%s].reason', v_name));
    end if;
    -- lessons ledger 23 + 27: a door is declared per ARGUMENT, and NULL is an argument.
    -- An entry with no body declares a door for a function that ALREADY exists (the
    -- only kind lane B may declare), so its arguments are read from the catalogue,
    -- never from text the caller wrote.
    v_txt := v_item->>'args';
    if not (v_item ? 'body') then
      select pg_get_function_arguments(p.oid) into v_txt
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = v_schema and p.proname = v_item->>'name'
       order by p.oid desc limit 1;
      if not found then
        if v_restricted then
          f := f || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', coalesce(v_item->>'name','?')), null,
                 format('%s.%s does not exist', coalesce(v_schema,'?'), coalesce(v_item->>'name','?')));
        end if;
        v_txt := v_item->>'args';
      end if;
    end if;
    f := f || platform.provision_arg_check_findings(coalesce(v_item->>'name','?'), v_txt, v_item->'arg_checks');
  end loop;

  -- === views ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'views','[]'::jsonb)) loop
    v_name := coalesce(v_item->>'name','?');
    if not v_restricted and btrim(coalesce(v_item->>'definition','')) = '' then
      f := f || platform.provision_finding('views.definition.missing', format('views[%s].definition', v_name));
    end if;
    if coalesce((v_item->>'security_invoker')::boolean, true) is false
       and btrim(coalesce(v_item->>'security_invoker_reason','')) = '' then
      f := f || platform.provision_finding('views.security_invoker.exemption',
             format('views[%s].security_invoker', v_name), 'true', 'false');
    end if;
    if coalesce((v_item->>'registered_as_projection')::boolean, false)
       and jsonb_array_length(coalesce(v_item->'primary_key','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('views.projection.primary_key', format('views[%s].primary_key', v_name));
    end if;
  end loop;

  -- === knobs ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'knobs','[]'::jsonb)) loop
    v_name := format('%s/%s', coalesce(v_item->>'feature','?'), coalesce(v_item->>'key','?'));
    v_txt := v_item->>'value_type';
    if v_txt is null or v_txt <> all (platform.provision_live_vocabulary('knob_value_type')) then
      f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].value_type', v_name),
             array_to_string(platform.provision_live_vocabulary('knob_value_type'), ' | '),
             coalesce(v_txt,'(not set)'));
    elsif v_txt = 'secret' and (jsonb_typeof(coalesce(v_item->'value','null'::jsonb)) <> 'object'
                                or not (v_item->'value' ? 'vault_key')) then
      f := f || platform.provision_finding('knobs.secret_shape', format('knobs[%s].value', v_name));
    elsif v_txt = 'json' and (v_item ? 'min_value' or v_item ? 'max_value' or v_item ? 'allowed_values') then
      f := f || platform.provision_finding('knobs.json_range', format('knobs[%s].min_value', v_name));
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'overridable_by','[]'::jsonb)) loop
      if v_txt <> all (platform.provision_live_vocabulary('knob_scope_kind')) then
        f := f || platform.provision_finding('knobs.overridable_by.unknown',
               format('knobs[%s].overridable_by', v_name),
               array_to_string(platform.provision_live_vocabulary('knob_scope_kind'), ' | '), v_txt);
      end if;
    end loop;
    foreach v_txt in array array['override_direction','propagation','set_by'] loop
      if v_item ? v_txt
         and v_item->>v_txt <> all (platform.provision_live_vocabulary('knob_'||v_txt)) then
        f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].%s', v_name, v_txt),
               array_to_string(platform.provision_live_vocabulary('knob_'||v_txt), ' | '), v_item->>v_txt);
      end if;
    end loop;
  end loop;

  -- === the platform's answers, STATED BACK (§4, the 15 silent columns) =====
  v_defaults := jsonb_build_object(
    'versioned', false,
    'soft_delete', (v_type is distinct from 'ledger'),
    'category', false,
    'gin_jsonb', exists (select 1 from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) x
                          where lower(coalesce(x.value->>'type','')) = 'jsonb'),
    'realtime', false,
    'content_kinds', '[]'::jsonb,
    'custom_fields', false,
    'is_listed', false,
    'relation_kind', 'table',
    'audit_class', 'entity',
    'version_store', 'history',
    'client_read_only', false,
    'reference_pickable', false,
    'agent_writable', false,
    'confirmation_enabled', false,
    'indexes', '[]'::jsonb,
    'fields', '[]'::jsonb,
    'checks', '[]'::jsonb,
    'types', '[]'::jsonb,
    'functions', '[]'::jsonb,
    'views', '[]'::jsonb,
    'knobs', '[]'::jsonb,
    'association_types', '[]'::jsonb,
    'parents', '[]'::jsonb,
    'client_excluded_columns', '[]'::jsonb)
  -- lesson 19: the 15 columns nobody was told about. Each value below IS the live
  -- column default, so nothing changes behaviourally -- only the silence ends.
  || jsonb_build_object(
    'base_tier', 1,
    'is_module', false,
    'default_members_can_add', true,
    'default_needs_approval', false,
    'default_scopeable', true,
    'default_auto_ingest', false,
    'allow_preview', true,
    'reference_candidate_predicates', '{}'::jsonb,
    'governed_columns', null,
    'retention_owner_column', null,
    'user_artifact_kind', null,
    'reference_category', null,
    'agent_write_notes', null,
    'lifecycle', '{"enlisted": false, "hot_days": null}'::jsonb);

  for v_name, v_sub in select key, value from jsonb_each(v_defaults) loop
    if not (n ? v_name) then
      n := n || jsonb_build_object(v_name, v_sub);
      answered := answered || v_name;
    end if;
  end loop;

  -- A unique index on a soft-deletable table is made PARTIAL on deleted_at IS NULL
  -- (DD-121). Stated back rather than assumed; omit it only with a written reason.
  if v_soft then
    n := jsonb_set(n, '{indexes}', coalesce((
      select jsonb_agg(
        case when coalesce((ix.value->>'unique')::boolean, false)
                  and not (ix.value ? 'where')
                  and not (ix.value ? 'where_omitted_reason')
             then ix.value || jsonb_build_object('where', 'deleted_at IS NULL')
             else ix.value end)
        from jsonb_array_elements(n->'indexes') ix), '[]'::jsonb));
  end if;

  -- The personal shape with no class: the live CHECK admits NULL, but iam.apply_rls
  -- refuses an unset class (DD-137b) and iam.verify_canonical FAILs a personal token
  -- that is not `private` (§3.1 derivation one). There is exactly one legal value, so
  -- it is the platform's answer, stated back — never a 23502 from inside apply_rls.
  if v_type = 'entity' and v_key = 'user_id' and v_class is null then
    n := jsonb_set(n, '{access}', coalesce(n->'access', '{}'::jsonb) || jsonb_build_object(
           'data_class', 'private',
           'data_class_reason', coalesce(nullif(btrim(v_access->>'data_class_reason'), ''),
             'personal shape: every row belongs to the one person in user_id, and rls_variant personal admits only the private class')));
    answered := answered || 'access.data_class'::text;
  end if;

  n := n || jsonb_build_object(
    'rls_variant', v_variant,
    'platform_answers', to_jsonb(answered));

  -- === the plan ===========================================================
  plan := array[
    jsonb_build_object('step','preflight','detail','7 event triggers bound+enabled, session_replication_role=origin, lock_timeout bounded, entity read kernel fingerprint matches, no provisioning already in flight'),
    jsonb_build_object('step','revalidate','detail','platform.provision_validate is re-run inside provision()''s own transaction — that is where a race with concurrent DDL resolves (no plan fingerprint, PLAN §3.2)')];
  if jsonb_array_length(n->'types') > 0 then
    plan := plan || jsonb_build_object('step','create types','detail', format('%s enum type(s) in %s', jsonb_array_length(n->'types'), coalesce(quote_ident(v_schema), '(schema not set)')));
  end if;
  plan := plan || jsonb_build_object('step','create table',
            -- quote_ident(NULL) is NULL, where %I on NULL RAISES: an empty spec must come
            -- back as findings, never as "null values cannot be formatted as an SQL identifier".
            'detail', format('%s.%s with %s declared column(s) plus the base contract',
                             coalesce(quote_ident(v_schema), '(schema not set)'),
                             coalesce(quote_ident(v_table), '(table not set)'),
                             jsonb_array_length(coalesce(n->'fields', '[]'::jsonb))));
  plan := plan || jsonb_build_object('step','revoke default ACL',
            'detail','REVOKE ALL FROM PUBLIC, anon, authenticated, service_role immediately after CREATE TABLE — 20 schemas carry ALTER DEFAULT PRIVILEGES rows that grant every NEW relation automatically, so today the default ACL, not the spec, is the source of a new table''s grants');
  plan := plan || jsonb_build_object('step','indexes',
            'detail','every FK gets a covering index, BASE COLUMNS INCLUDED (organization_id, created_by, updated_by) — that trio is 1,174 of the 2,029 live unindexed FKs');
  plan := plan || jsonb_build_object('step','triggers','detail','_stamp_actor, _stamp_actor_tier, _touch_row, _metadata_guard, and platform.assert_same_org for every declared tenancy check (the ONE shared validation-only function, never a per-table clone)');
  plan := plan || jsonb_build_object('step','iam.apply_rls','detail', format('variant %s', coalesce(v_variant,'?')));
  plan := plan || jsonb_build_object('step','register','detail','platform.entity_types, including every one of the 15 columns that used to be left to the column default with nobody told');
  if jsonb_array_length(n->'association_types') > 0 then
    plan := plan || jsonb_build_object('step','association types','detail', format('%s edge type(s)', jsonb_array_length(n->'association_types')));
  end if;
  if jsonb_array_length(n->'knobs') > 0 then
    plan := plan || jsonb_build_object('step','knobs','detail','seeded in the SAME transaction — platform.knob_resolve raises on a missing knob rather than falling back (lessons ledger 11)');
  end if;
  if jsonb_array_length(n->'views') > 0 then
    plan := plan || jsonb_build_object('step','views','detail','security_invoker = true unless an exemption reason is given');
  end if;
  if jsonb_array_length(n->'functions') > 0 then
    plan := plan || jsonb_build_object('step','functions','detail', format('%s function(s)', jsonb_array_length(n->'functions')));
  end if;
  plan := plan || jsonb_build_object('step','doors','detail','every client_callable_door row written BEFORE any grant (lessons ledger 1 and 24: a guard-log revoke row means the grant preceded the door, 51 times out of 86)');
  plan := plan || jsonb_build_object('step','grants','detail','every GRANT last, as ONE block — each GRANT fires a DB-wide re-sweep of ~2,000 DEFINER functions');
  plan := plan || jsonb_build_object('step','certify','detail','iam.canonical_certify; provision() refuses on any FAIL and on the WARNs that describe the table it just built');
  plan := plan || jsonb_build_object('step','capture','detail','the platform.provision_spec row, inside this same transaction, so capture cannot be skipped');

  return jsonb_build_object(
    'ok', cardinality(f) = 0,
    'lane', v_lane,
    'findings', coalesce(to_jsonb(f), '[]'::jsonb),
    'normalized_spec', n,
    'spec_hash', md5(n::text),
    'plan', coalesce(to_jsonb(plan), '[]'::jsonb),
    'locks', 'ACCESS SHARE on what it reads, and never ACCESS EXCLUSIVE, because it emits no DDL. This is not "no locks".');
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_base_columns()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ select array['id','organization_id','created_by','updated_by','created_at','updated_at',
                  'deleted_at','version','metadata','visibility','category_id']::text[] $function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_fingerprint()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  -- Ordered by identity, so the hash is stable across catalog reordering.
  select md5(string_agg(p.prosrc, '|' order by n.nspname, p.proname, p.oid::text))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','accessible_entity_ids'), ('iam','has_org_access_for'),
    ('files','has_access_for'), ('files','is_crawl_artifact'),
    ('files','crawl_site_conveys'),
    ('platform','entity_row_access_attrs'),
    ('public','user_can_read_via_library_grant'), ('public','library_is_open'),
    ('public','is_rulebook_curator'), ('public','is_pack_curator'),
    ('public','_edu_can_read_via_assignment'), ('public','has_permission_for'),
    ('public','is_org_admin_for'), ('public','user_can_read_data_store_via_grant')
  );
$function$;

CREATE OR REPLACE FUNCTION iam.apply_table_grants(p_schema text, p_table text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_declared text[];
  v_missing text;
  v_excluded_now text;
  v_kept text;
  v_override text;
  v_column text;
  v_stamped boolean;
begin
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if v_n_pol = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.',
      p_schema, p_table;
  end if;
  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.
  -- A table in `platform.stamped_write_table` carries a column that says who produced
  -- the row (`context.context_item_values.authored_by`). That is worth nothing unless
  -- exactly ONE code path can set it, and a client DML grant is a second path with no
  -- code in it at all. Such a table gets the read-only client grant whatever variant it
  -- is called with, so this generator can never be the thing that re-opens it: B-139
  -- found the cell table declared `component`, which grants insert/update/delete, and
  -- correcting that by hand would have lasted exactly until the next regeneration.
  -- The variant still decides everything else about the table (its access-lane shape as
  -- a component, its policies) — only the write privilege is withheld here.
  select exists (
    select 1 from platform.stamped_write_table s
     where s.schema_name = p_schema and s.table_name = p_table
  ) into v_stamped;

  if p_variant = 'restricted' and not exists (
    select 1 from information_schema.columns where table_schema=p_schema and table_name=p_table and column_name='visibility'
  ) then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
    end loop;
    execute format('grant all on %s to service_role', v_tbl);
    return;
  end if;

  -- ── THE COLUMN-EXCLUSION DESIGN (db-rules §6d-2) ─────────────────────────
  -- Declared in the registry, never inferred from the catalog. `ADD COLUMN`
  -- leaves attacl NULL, so a new column and a deliberately-excluded one are
  -- indistinguishable in the ACLs; inferring the set would silently hide every
  -- future column from clients (proven live, 2026-08-21). The declaration is
  -- the intent; the ACLs are only its artifact.
  select et.client_excluded_columns into v_declared
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;

  if v_declared is not null and cardinality(v_declared) = 0 then
    v_declared := null;
  end if;

  -- A declared name that is not a live column is a stale declaration, and a
  -- stale declaration is how an exclusion quietly stops excluding anything.
  if v_declared is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_declared) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x
                         and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_excluded_columns that do not exist: % — fix or clear the declaration (db-rules §6d-2).',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- The override means, and has always meant, DELIBERATELY RETIRE this design.
  begin
    v_override := current_setting('iam.allow_column_grant_override', true);
  exception when others then
    v_override := null;
  end;

  if v_declared is not null
     and coalesce(v_override, '') in ('on', 'true', '1', 'yes') then
    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being RETIRED for this call; table-level grants replace it. Clear entity_types.client_excluded_columns to make that permanent.',
      p_schema, p_table, array_to_string(v_declared, ', ');
    v_declared := null;
  end if;

  -- An UNDECLARED design still refuses, exactly as the rail did before — that
  -- is the lane protecting every table not yet migrated to a declaration.
  if v_declared is null then
    select count(*),
           count(*) filter (where a.attacl::text like '%authenticated=%')
      into v_live_cols, v_granted_cols
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

    if v_granted_cols > 0 and v_granted_cols < v_live_cols
       and coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      select string_agg(a.attname, ', ' order by a.attnum) into v_excluded_now
      from pg_attribute a
      where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
        and (a.attacl is null or a.attacl::text not like '%authenticated=%');
      raise exception
        'apply_table_grants: %.% runs an UNDECLARED column-level grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. Declare it: UPDATE platform.entity_types SET client_excluded_columns = ARRAY[...] WHERE schema_name=%L AND table_name=%L; then re-run. To retire the design instead: set local iam.allow_column_grant_override = ''on''; (db-rules §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded_now, p_schema, p_table;
    end if;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  if p_variant = 'ledger' or v_stamped then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    if v_stamped and p_variant <> 'ledger' then
      raise notice
        'apply_table_grants: %.% is a STAMPED-WRITE table (platform.stamped_write_table) — issuing the READ-ONLY client grant instead of the % variant''s write grants. Its writes belong to its declared SECURITY DEFINER doors, which stamp the author from the caller (DD-248).',
        p_schema, p_table, p_variant;
    end if;
    if v_declared is null then
      execute format('grant select on %s to authenticated', v_tbl);
    else
      execute format('grant select (%s) on %s to authenticated',
                     iam._client_grant_column_list(v_rel, v_declared), v_tbl);
    end if;
  else
    if v_declared is null then
      execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
    else
      v_kept := iam._client_grant_column_list(v_rel, v_declared);
      -- DELETE has no column form and needs none: removing a row you are
      -- already permitted to remove reveals nothing about an excluded column.
      execute format('grant select (%1$s), insert (%1$s), update (%1$s) on %2$s to authenticated',
                     v_kept, v_tbl);
      execute format('grant delete on %s to authenticated', v_tbl);
    end if;
  end if;

  if v_declared is not null then
    raise notice
      'apply_table_grants: %.% column-exclusion design PRESERVED (withheld from authenticated: %).',
      p_schema, p_table, array_to_string(v_declared, ', ');
  end if;

  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
end;
$function$;

CREATE OR REPLACE FUNCTION iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$

declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_user boolean;
  v_has_created boolean;
  v_has_org boolean;
  v_has_del boolean;
  v_has_vis boolean;
  v_delpfx text := '';
  v_parent_expr_edit text := '';
  v_parent_expr_view text := '';
  v_parent_count integer := 0;
  -- THE ADMIN LANE. Leading arm of every generated policy; see the migration
  -- header for the 22s -> 40ms measurement that dictates the position.
  v_admin text := '(select public.is_platform_admin()) or ';
  -- THE PRIVACY WALL (HR D14.1 / D19, SPEC-ACCESS §3.5). When a token declares
  -- suppress_platform_admin_lane, AI Matrx staff get NO read arm on it: the
  -- v_admin prefix is emptied, the platform_admin_all policy is not created,
  -- and the is_super_admin() arms are removed from the restricted lane and from
  -- the entity system-org INSERT lane. Every other token is untouched — the
  -- column defaults false and these three strings keep their exact current text,
  -- so the emitted policy bytes for an unflagged token do not move.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). Opt-in per token via
  -- platform.entity_types.component_anon_read_via_public_parent: a component
  -- has no visibility of its own — its access IS the parent's, INCLUDING the
  -- parent's public-ness. The authenticated composition arm already walks
  -- accessible_entity_ids(..., include_public => true), so without this lane
  -- the anon role saw strictly less than any signed-up stranger.
  v_anon_component boolean := false;
  v_anon_expr text := '';
  v_pdel boolean;
  v_excluded text[];
  v_su_sel text := ' or public.is_super_admin()';
  v_su_ins text := 'public.is_super_admin() or ';
  v_sysorg_ins text := ' or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())';
  -- 🚨 DD-165 (2026-09-12) — A PERSONAL ROW STAYS PERSONAL INSIDE AN ORGANIZATION TABLE.
  -- The CLASS sets the DEFAULT lane set; a row's `visibility` only ever NARROWS it. So on a
  -- classed table that carries a real `platform.visibility` column, the platform-staff arms are
  -- emitted in their WALLED form: they admit a row only when `visibility >= 'internal'`, i.e.
  -- never a row the person marked `personal`. The owner arm, the sharing/grant lanes and
  -- `iam.has_access` are untouched, so the owner and everyone they shared with keep reading.
  -- These two strings are the READ (USING) forms; `v_admin`/`v_su_sel` keep their exact previous
  -- text and are still used in every WITH CHECK, because DD-165 is a rule about who may READ a
  -- person's private row, not about what an admin may write.
  v_vis_enum boolean := false;
  v_admin_read text;
  v_su_sel_read text;
  rec record;
  pol record;
  -- DD-147: the catalog of names THIS function authors, and the bespoke names it kept.
  v_authored text[];
  v_kept text[];
  -- DD-174: the ledger variant's lanes are read off the CLASS, not hardcoded.
  v_ledger_lanes platform.lane_set;
  v_sysorg_read text;
  -- DD-249: the anon lane is the CLASS's to grant, and this is where it is asked.
  v_pub_lanes platform.lane_set;
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

  if v_suppress_admin then
    v_admin := '';
    v_su_sel := '';
    v_su_ins := '';
    v_sysorg_ins := '';
  end if;

  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='user_id') into v_has_user;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='created_by') into v_has_created;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='organization_id') into v_has_org;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='deleted_at') into v_has_del;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility') into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  -- DD-165. The wall is keyed on the TYPED column only. A free-text `visibility` would make
  -- `visibility >= 'internal'` a TEXT comparison, and 'personal' > 'internal' alphabetically —
  -- the wall would silently admit exactly the rows it exists to exclude. iam.verify_canonical
  -- already FAILs a free-text visibility ('free-text kill'); this refuses to build a wall on one.
  -- `visibility` is NOT NULL on every table in the live cast but the predicate is written so an
  -- unset value denies rather than admits: `NULL >= 'internal'` is NULL, and a USING clause
  -- treats NULL as deny. Undeclared is the private end, the same direction chair R3 takes.
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility'
      and udt_schema='platform' and udt_name='visibility') into v_vis_enum;
  v_admin_read := v_admin;
  v_su_sel_read := v_su_sel;
  if v_vis_enum then
    if v_admin <> '' then
      v_admin_read := '((visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())) or ';
    end if;
    if v_su_sel <> '' then
      v_su_sel_read := ' or (visibility >= ''internal''::platform.visibility and public.is_super_admin())';
    end if;
  end if;

  execute format('alter table %s enable row level security', v_tbl);
  -- 🚨 DD-147 (2026-09-12) — THIS GENERATOR DROPS ONLY WHAT IT AUTHORED.
  -- The loop that used to live here read `for pol in select polname from pg_policy where polrelid
  -- = v_tbl::regclass loop drop policy ...` — EVERY policy, with no idea which of them it had
  -- written. In the B-30 rehearsal that removed the signed-out invitation-request lanes on
  -- `iam.invitations` / `iam.access_requests`, and two migrations restored them by hand. A
  -- generator that deletes work it did not do is not a generator, it is a hazard sitting behind
  -- an `apply` verb.
  -- `iam.generated_policy_names()` is the catalog of the names emitted below, and nothing else is
  -- touched. A bespoke policy is KEPT and NAMED out loud — never dropped, never silent. To remove
  -- one, say so on purpose: `iam.supersede_bespoke_policies(schema, table, names, reason)`.
  v_authored := iam.generated_policy_names();
  v_kept := '{}'::text[];
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass order by polname loop
    if pol.polname = any (v_authored) then
      execute format('drop policy %I on %s', pol.polname, v_tbl);
    else
      v_kept := array_append(v_kept, pol.polname);
    end if;
  end loop;
  if cardinality(v_kept) > 0 then
    raise notice
      'apply_rls: %.% (token %) — % BESPOKE POLICY/POLICIES KEPT because this generator did not author them: %. They are live doors beside the generated set, and iam.verify_canonical reports them as bespoke_policy_present on every run. To remove one, name it: iam.supersede_bespoke_policies(''%'', ''%'', ARRAY[...], <reason>).',
      p_schema, p_table, p_token, cardinality(v_kept), array_to_string(v_kept, ', '), p_schema, p_table;
  end if;
  execute format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)', v_tbl);
  -- Server-only restricted records stop before every client/staff policy.
  if p_variant = 'restricted' and not v_has_vis then
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= PERSONAL =======================
  -- A personal row's user_id is the complete access boundary. Referenced
  -- organizations and platform-admin status do not widen it.
  if p_variant = 'personal' then
    if not v_has_user then
      raise exception
        'apply_rls: personal variant on %.% requires user_id',
        p_schema, p_table;
    end if;
    execute format(
      'create policy std_select on %s for select to authenticated using (%suser_id = (select auth.uid()))',
      v_tbl, v_delpfx);
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))',
      v_tbl);
    execute format(
      'create policy std_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      v_tbl);
    execute format(
      'create policy std_delete on %s for delete to authenticated using (user_id = (select auth.uid()))',
      v_tbl);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- Covers the commands a variant emits no policy for at all. Permissive, so it
  -- can only ever ADD rows, and only for the accounts is_platform_admin() knows.
  -- THE PRIVACY WALL: a token that declares suppress_platform_admin_lane does
  -- not get this policy at all. Dropping it AFTER apply_rls was the rejected
  -- alternative (SPEC-ACCESS §3.5) — it breaks iam.verify_canonical and the next
  -- regeneration silently puts it back.
  if not v_suppress_admin then
    -- DD-165: the USING half is the READ/act boundary (SELECT, and the old row of UPDATE and
    -- DELETE), so it carries the wall. The WITH CHECK half is unchanged: this is not a rule about
    -- what an admin may write. `svc_all` is a separate policy, so every server-side job that runs
    -- as `service_role` is untouched by this.
    execute format(
      'create policy platform_admin_all on %s for all to authenticated '
      || 'using (%s) with check ((select public.is_platform_admin()))',
      v_tbl,
      case when v_vis_enum
           then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
           else '(select public.is_platform_admin())' end);
  end if;

  if p_variant = 'ledger' then
    -- SET-WISE ORG LANE (D146). `organization_id in (select iam.my_orgs())` is
    -- the identical predicate to `iam.has_org_access(organization_id)` (both
    -- read iam.organization_member for auth.uid()), but it is uncorrelated, so
    -- it is evaluated ONCE per query instead of once per candidate row. A
    -- ledger is by definition the biggest table in its feature — this is the
    -- variant where the per-row definer call is guaranteed to bite.
    -- THE GLOBAL-READABLE SYSTEM-ORG LANE (db-rules §6e, added 2026-08-21).
    -- Global content is owned by a `global_readable` system org and is readable
    -- by every authenticated user. The `entity` family implements that through
    -- iam.has_access; the ledger lane did not, so the SAME row was readable on
    -- an entity table and invisible on a ledger table. `iam.organizations`
    -- 39c38960-… (Matrx System) has ZERO members, so before this every
    -- system-org ledger row was unreadable by literally everyone —
    -- including the user who created it. Found on batch.work_item: 18 of 20
    -- rows, 16 of them created by the user who could not see them.
    -- Set-wise on purpose: both arms are uncorrelated subqueries, so each is
    -- one hashed SubPlan per query, never a per-row call (D146).
    -- 🚨 DD-174 (2026-09-12) — THE LEDGER'S LANES ARE ITS CLASS'S LANES.
    -- Until this edit the two paragraphs above were unconditional: EVERY ledger got an
    -- organization-member lane and the global-readable system-org lane, whatever its class said.
    -- `iam.class_lanes` and this variant therefore disagreed on 27 live tokens, and the variant won
    -- in silence. Measured on this database, 2026-09-12, in rolled-back rehearsals:
    --   billing.usage_ledger   class `private`  — an org admin would have read 1,520 rows of OTHER
    --                          people's spend, a non-member 313. `private` has no org lane at all.
    --   platform.knob_override_audit  class `confidential` — 27 of its 88 rows belong to a
    --                          global_readable system org, so the system-org arm handed a
    --                          CONFIDENTIAL audit to every signed-in account, non-members included
    --                          (measured: three principals 0 -> 27, a non-member 17 -> 44).
    -- So: the organization lane is emitted only when the class grants one, and the system-org arm
    -- only for the two classes whose lane set is wider than one organization (`organization` and
    -- `public`). For every `organization`-class ledger — all 12 of them — the emitted bytes are
    -- IDENTICAL to what this function emitted before, which the forcing test asserts character for
    -- character rather than trusting the reading.
    v_ledger_lanes := iam.class_lanes(p_token);
    if not v_ledger_lanes.org_member_lane then
      raise exception
        'apply_rls: %.% (token %) resolves to class %, whose lane set has NO organization-member lane — and the ledger variant emits an organization read lane and nothing else. Generating it here would hand every member of a row''s organization a table whose class says only its owner may read it (measured on billing.usage_ledger: an organization admin 0 -> 1,520 rows of other people''s spend). Nothing was generated. If the table carries user_id, its variant is `personal` — a personal row''s user_id is the complete access boundary; otherwise correct data_class on platform.entity_types with a stored reason.',
        p_schema, p_table, p_token, v_ledger_lanes.resolved_class;
    end if;
    v_sysorg_read := case
      when v_ledger_lanes.resolved_class in ('organization','public')
        then ' or organization_id in (select organization_id from iam.system_orgs where global_readable)'
      else '' end;
    execute format(
      'create policy std_select on %s for select to authenticated using (%s('
      || 'organization_id is not null and ('
      || 'organization_id in (select iam.my_orgs())%s)))',
      v_tbl, v_admin_read, v_sysorg_read);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= COMPONENT =======================
  -- Access IS the parent's. No created_by clause is emitted here, ever.
  if v_is_component or p_variant = 'component' then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_token and er.kind = 'composition'
      order by er.parent_type, er.fk_column
    loop
      v_parent_count := v_parent_count + 1;
      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
      v_parent_expr_view := v_parent_expr_view
        || case when v_parent_expr_view = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
    end loop;

    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    end if;

    -- Reads resolve the SMALL parent id sets, then the caller's row predicate
    -- uses the child's indexed foreign keys. Never resolve the CHILD token as a
    -- set — that materializes every accessible child id (D183).
    -- D254: the trailing arm was an UNBOUNDED per-row iam.has_access — the same
    -- D146 shape D249 removed from `entity`, and the reason a user could not read
    -- the version history of their own files (files.file_versions, 50,423 rows,
    -- ~7ms/row = ~350s). It now comes from the SAME builder the entity lane uses:
    -- iam.entity_read_expr already reads this token's parents out of
    -- entity_relationships, gates its org/visibility arms on those columns
    -- existing, and bounds the definer call by the id-producing lanes. A second
    -- component-shaped copy of that logic is how the two would drift.
    execute format(
      'create policy std_select on %s for select to authenticated using (%s(%s))',
      v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));

    -- THE PUBLIC-PARENT ANON LANE (0580). Emitted only for a flagged token.
    -- The policy admits a row when a composition parent is public and live;
    -- the arm's parent subquery ALSO passes through the parent's own RLS for
    -- the anon role (pub_read: public + not deleted), so the two agree by
    -- construction. Per the soft-delete doctrine, the anon lane — and only the
    -- anon lane — filters the child's own deleted_at (v_delpfx).
    if v_anon_component then
      if v_excluded is not null and cardinality(v_excluded) > 0 then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent AND client_excluded_columns — a table-level anon grant would expose to anon what is withheld from authenticated. Resolve the contradiction first.',
          p_token;
      end if;
      v_anon_expr := '';
      for rec in
        select er.fk_column, et.schema_name as pschema, et.table_name as ptable
        from platform.entity_relationships er
        join platform.entity_types et on et.token = er.parent_type
        where er.child_type = p_token and er.kind = 'composition'
        order by er.parent_type, er.fk_column
      loop
        if exists (select 1 from information_schema.columns
                    where table_schema = rec.pschema and table_name = rec.ptable
                      and column_name = 'visibility') then
          -- A policy subquery runs with the QUERYING role's privileges: if anon
          -- cannot SELECT the parent, every anon query on the child errors with
          -- 42501 instead of filtering. Refuse the misconfiguration loudly.
          if not has_table_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'SELECT') then
            raise exception
              'apply_rls: % declares component_anon_read_via_public_parent but parent %.% has no anon SELECT grant — the policy subquery would 42501 for every anon query. Apply the parent''s canonical RLS (its pub_read lane grants anon) first.',
              p_token, rec.pschema, rec.ptable;
          end if;
          select exists (select 1 from information_schema.columns
                          where table_schema = rec.pschema and table_name = rec.ptable
                            and column_name = 'deleted_at') into v_pdel;
          v_anon_expr := v_anon_expr
            || case when v_anon_expr = '' then '' else ' or ' end
            || format('(%1$I is not null and %1$I in (select p.id from %2$I.%3$I p where %4$sp.visibility = ''public''))',
                      rec.fk_column, rec.pschema, rec.ptable,
                      case when v_pdel then 'p.deleted_at is null and ' else '' end);
        end if;
      end loop;
      if v_anon_expr = '' then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent but no composition parent carries a visibility column — nothing can be public here; clear the flag',
          p_token;
      end if;
      execute format('create policy pub_read on %s for select to anon using (%s(%s))',
        v_tbl, v_delpfx, v_anon_expr);
      execute format('grant select on %s to anon', v_tbl);
    else
      -- Symmetry: clearing the flag and re-running apply_rls removes the lane
      -- completely (the policy died in the drop loop above; the grant dies here).
      execute format('revoke select on %s from anon', v_tbl);
    end if;

    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through a structural parent. No orphan/created_by lane: a component with
    -- no parent is not a component.
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s(%s))',
      v_tbl, v_admin, v_parent_expr_edit);

    execute format(
      'create policy std_update on %s for update to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor'')) '
      || 'with check (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token, v_admin, v_parent_expr_edit, p_token);

    execute format(
      'create policy std_delete on %s for delete to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token);

    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= ENTITY FAMILY =======================
  -- Here `created_by` IS the owner, and that is exactly why it is an access key.
  if not v_has_created then
    raise exception
      'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  if not v_has_org then
    raise exception
      'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;

  if p_variant = 'restricted' then
    execute format(
      'create policy std_select on %s for select to authenticated using (%s%s(created_by = (select auth.uid())%s))',
      v_tbl, v_admin_read, v_delpfx, v_su_sel_read);
      -- 🚨 DD-249 (2026-09-15) — THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S.
      -- Until this edit `pub_read` was emitted on the presence of a `visibility` COLUMN and
      -- nothing else, so the variant granted an anonymous read lane that `iam.class_lanes`
      -- never issued. Exactly the DD-174 shape, one variant over: the generator out-voted the
      -- class in silence, and `iam.verify_canonical` has been WARNing `class_lanes_match_policy`
      -- on 233 live tokens ever since. Measured on this database, 2026-09-15: of those 233,
      -- 223 had NO anon privilege of any kind (`iam.apply_table_grants` never grants anon on
      -- the entity/restricted path) — a door with no key, which is worse than no door because
      -- it reads as an anonymous lane to everyone auditing the table. The other 10 carried
      -- hand-written anon column grants and the lane was LIVE: 5 of them held public rows
      -- (app.definition 81, platform.categories 355, education.learn_doc 11,
      -- agent.message_template 8, workbench.notes 2) on a class that says no stranger may read.
      -- So the lane is now asked of the class, once, in the one place that decides it.
    if v_has_vis then
      v_pub_lanes := iam.class_lanes(p_token);
      if v_pub_lanes.anon_lane then
        execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
          v_tbl, v_delpfx);
      end if;
    end if;
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (%sorganization_id is null or iam.has_org_access(organization_id))))',
      v_tbl, v_admin, v_su_ins);
    execute format(
      'create policy std_update on %s for update to authenticated using (%s created_by = (select auth.uid())%s) with check (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read, v_admin, v_su_sel);
    execute format(
      'create policy std_delete on %s for delete to authenticated using (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- `restricted` is already owner-or-super-admin on UPDATE — the whole row is
    -- governed, so a per-column tier would be redundant.
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  if p_variant = 'system' and not v_has_vis then
    raise exception 'apply_rls: system variant on %.% requires a visibility column', p_schema, p_table;
  end if;
  -- D249: the read lane is a disjunction of INDEXABLE predicates, not a per-row
  -- SECURITY DEFINER call. `iam.entity_read_expr` inlines the SUFFICIENT
  -- attribute lanes of has_access_for_base (owner / public / org / system-org /
  -- org-admin / parent-fk) and keeps `iam.has_access` for everything else,
  -- reached only for ids the remaining id-producing lanes could admit. Same
  -- move the `ledger` (0439) and `component` lanes already made; `entity` was
  -- the last variant still asking the question one row at a time.
  execute format(
    'create policy std_select on %s for select to authenticated using (%s(%s))',
    v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));

  -- DD-249, the entity/system tail. `system` keeps its unconditional anon lane: a system
  -- table IS the platform's own published catalogue (63 of its 134 tokens already resolve
  -- `public`), and `iam.verify_canonical.class_lanes_match_policy` exempts that variant by
  -- name. Every other token here asks its class.
  if v_has_vis then
    v_pub_lanes := iam.class_lanes(p_token);
    if p_variant = 'system' or v_pub_lanes.anon_lane then
      execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    end if;
  end if;
  -- NOTE (D146): the INSERT lanes below keep `iam.has_org_access(...)`. A WITH
  -- CHECK is evaluated once per INSERTED row, never across a scan, so the
  -- per-row-definer timeout class does not reach them.
  execute format(
    'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id)%s)))',
    v_tbl, v_admin, v_sysorg_ins);
  execute format(
    'create policy std_update on %s for update to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor'')))',
    v_tbl, v_admin_read, p_token, v_admin, p_token);
  execute format(
    'create policy std_delete on %s for delete to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin'')))',
    v_tbl, v_admin_read, p_token);

  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  perform iam.apply_governance_guard(p_schema, p_table, p_token);
end;

$function$;
