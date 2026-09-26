-- based-on: platform.provision_validate(jsonb, text, uuid) d9139f454ab53bec698ad407d5650df9123006ec57565e635af666b9a62f77a8
-- chair-step: replaces one whole function body (platform.provision_validate) and edits three rows of the provisioner's refusal-message table (one added, one reworded, the two only the removed branches could raise deleted); the REVOKE / GRANT / DELETE the judge sees inside the body are string literals the validator lints for, not statements. No table, policy or grant is changed. Lane B-BILLING.
-- provision_validate_owner_is_created_by.sql  (lane B-BILLING, 2026-09-25)
--
-- The provisioning validator is brought in line with the RLS generator and the grader, which
-- the tool-schema pilot moved onto created_by (personal_variant_owner_is_created_by.sql).
-- It still read access.key_column = 'user_id' as "the personal shape": it demanded a user_id
-- field, answered data_class 'private' for it, and handed platform.provision rls_variant
-- 'personal' keyed on a column the kernel never reads -- so a table provisioned that way would
-- be born with its RLS lane and iam.has_access disagreeing on every row.
--
-- After this file: key_column's only legal value is created_by; 'user_id' is refused BY NAME
-- (rule access.key_column.user_id_retired) with the remedy; the three user_id-only branches are
-- gone and nothing here produces the personal variant (DD-062 folds it into entity; a person's
-- own rows are data_class 'private' on created_by). No table, policy or grant is touched.
-- Guard: aidream tests/test_provision_personal_shape_keys_on_created_by.py (red before, green after).

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
  v_part       jsonb;
  v_pkey       text[];
  v_pcount     integer;
  v_icols      text[];
  v_tgt_rel    text;
  v_tgt_org    boolean;
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

  -- === a batch: several tables in ONE declaration (next-build item 2) ===
  -- `tables[]` is the whole spec; every element is judged by this same function with
  -- the batch's tokens and types visible, so a forward reference resolves and a tree can
  -- be declared. One document, one transaction, all-or-nothing.
  if p_spec ? 'tables' then
    return platform.provision_validate_batch(p_spec, v_lane, p_org_id);
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
      if v_item ? 'expression' then
        f := f || platform.provision_finding('lane.expression_refused', 'indexes[].expression', null,
                    v_item->>'expression');
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
    -- PLAN §4.0's line, for the two declarations that are not SQL text but are still the
    -- operator's: `partition` multiplies the relation count of one table by up to 64, and
    -- `write_door` decides who may write a tenant's own rows. The platform's answer for
    -- lane B is the unpartitioned table with the variant's ordinary grants.
    if p_spec ? 'partition' then
      f := f || platform.provision_finding('lane.expression_refused', 'partition', null,
                  'partitioning is a physical storage decision — lane A only');
    end if;
    if p_spec ? 'write_door' then
      f := f || platform.provision_finding('lane.expression_refused', 'write_door', null,
                  'the write-door posture decides who may write these rows — lane A only');
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
      else
        f := f || platform.provision_finding('access.data_class.missing');
      end if;
    else
      if v_type = 'ledger' and v_class = 'private' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', 'private');
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
      -- PERSONAL-OWNER (2026-09-25, lane B-BILLING; Arman 2026-09-23: the retired owner column
      -- gave way to created_by). The owner column is created_by on every entity -- the column the
      -- kernel (platform.entity_row_access_attrs), the set lane and the RLS generator read. This
      -- validator used to read key_column = 'user_id' as "the personal shape", demand a field of
      -- that name and hand back rls_variant 'personal' keyed on a column nothing else reads. That
      -- value is refused by name now, with the remedy: a person's own rows are data_class
      -- 'private' on created_by (DD-062 folds the personal variant into entity), and nothing here
      -- produces the personal variant any more.
      -- Guard: aidream tests/test_provision_personal_shape_keys_on_created_by.py.
      if v_key is null then
        f := f || platform.provision_finding('access.key_column.missing');
      elsif v_key <> 'created_by' then
        f := f || platform.provision_finding(
               case when v_key = 'user_id' then 'access.key_column.user_id_retired'
                    else 'access.key_column.missing' end,
               'access.key_column', 'created_by', v_key);
      end if;
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
    elsif to_regtype(v_item->>'type') is null
          and not platform.provision_type_declared(p_spec, v_item->>'type') then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i),
             null, format('%L is not a type this database has, and neither this declaration''s types[] nor this batch declares it', v_item->>'type'));
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
            and (position('.' in v_txt) = 0 or to_regclass(v_txt) is null)
            and platform.provision_batch_token_rel(v_txt) is null
            and v_txt is distinct from v_token then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, v_txt);
      elsif v_restricted and p_org_id is not null
            and exists (select 1 from platform.entity_types e
                         where e.token = v_txt and e.rls_variant not in ('system','reference')
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

      -- A nullable FK into a tenant-scoped table can point at another organization's row
      -- and RLS on the child never notices. The shape guard settles that debt at COMMIT
      -- (`nullable_tenant_fk`), which a rolled-back rehearsal never reaches — so the
      -- declaration answers it here, by name, before anything is built.
      v_txt := v_item->'references'->>'target';
      if v_txt is not null
         and not coalesce((v_item->>'not_null')::boolean, false)
         and not coalesce((v_item->>'tenancy_check')::boolean, false) then
        v_tgt_rel := coalesce(
          (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_txt),
          platform.provision_batch_token_rel(v_txt),
          case when v_txt = v_token then '(this table)' end,
          case when position('.' in v_txt) > 0 then to_regclass(v_txt)::text end);
        v_tgt_org := case
          when v_tgt_rel = '(this table)' or platform.provision_batch_token_rel(v_txt) is not null then true
          when v_tgt_rel is not null then exists (select 1 from pg_attribute a
                                                    where a.attrelid = to_regclass(v_tgt_rel)
                                                      and a.attname = 'organization_id' and not a.attisdropped)
          else false end;
        if v_tgt_org then
          f := f || platform.provision_finding('fields.tenancy_check.missing',
                 format('fields[%s].tenancy_check', v_i), 'true', format('%s is nullable and references %s, which carries organization_id', v_name, v_txt));
        end if;
      end if;
    end if;

    if v_item ? 'generated'
       and coalesce((v_item->'generated'->>'stored')::boolean, false) is not true then
      f := f || platform.provision_finding('fields.generated.stored',
             format('fields[%s].generated.stored', v_i), 'true', v_item->'generated'->>'stored');
    end if;
  end loop;

  v_all_cols := v_names || platform.provision_base_columns();


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
    if not exists (select 1 from platform.entity_types e where e.token = v_name)
       and platform.provision_batch_token_rel(v_name) is null then
      f := f || platform.provision_finding('parents.unknown_token', format('parents[%s]', v_i), null, v_name);
    elsif v_restricted and p_org_id is not null
          and exists (select 1 from platform.entity_types e
                       where e.token = v_name and e.rls_variant not in ('system','reference')
                         and not exists (select 1 from platform.provision_grant g
                                          where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
      f := f || platform.provision_finding('parents.cross_tenant', format('parents[%s]', v_i), null, v_name);
    end if;
    if btrim(split_part(v_txt, ':', 2)) <> all (v_names) then
      f := f || platform.provision_finding('parents.unknown_column', format('parents[%s]', v_i), null,
             btrim(split_part(v_txt, ':', 2)));
    end if;
  end loop;

  -- === types[] (G2: the block was unreachable — now it is judged and reachable) ===
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'types','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := v_item->>'name';
    if not platform.provision_identifier_ok(v_name) then
      f := f || platform.provision_finding('types.shape', format('types[%s].name', v_i), null, coalesce(v_name, '(not set)'));
      continue;
    end if;
    if coalesce(v_item->>'kind', 'enum') <> 'enum' then
      f := f || platform.provision_finding('types.shape', format('types[%s].kind', v_i), 'enum', v_item->>'kind');
    end if;
    if jsonb_typeof(v_item->'labels') <> 'array' or jsonb_array_length(v_item->'labels') = 0 then
      f := f || platform.provision_finding('types.shape', format('types[%s].labels', v_i), 'a non-empty list of labels', coalesce(v_item->'labels'::text, '(not set)'));
    end if;
    if v_schema is not null
       and to_regtype(format('%I.%I', v_schema, v_name)) is not null
       and not coalesce((platform.provision_batch_context()->'types') ? format('%s.%s', v_schema, v_name), false) then
      f := f || platform.provision_finding('types.name.taken', format('types[%s].name', v_i), null,
             format('%s.%s already exists', v_schema, v_name));
    end if;
  end loop;

  -- === content_kinds[] (G10): there is no store that binds a table to a kind yet ===
  if jsonb_array_length(coalesce(p_spec->'content_kinds','[]'::jsonb)) > 0 then
    f := f || platform.provision_finding('content_kinds.unbuilt', 'content_kinds', '[] (the platform''s answer)',
           (select string_agg(x, ', ') from jsonb_array_elements_text(p_spec->'content_kinds') x));
  end if;

  -- === realtime (G10): true adds the table to the supabase_realtime publication ===
  if coalesce((p_spec->>'realtime')::boolean, false)
     and not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    f := f || platform.provision_finding('realtime.publication_missing', 'realtime', 'false', 'true');
  end if;

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
    -- G4: an expression index is declared as the parenthesised index expression text,
    -- INSTEAD of a column list — never both, never neither.
    if v_item ? 'expression' and jsonb_array_length(coalesce(v_item->'columns','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('indexes.shape', format('indexes[%s]', v_i),
             'columns[] OR expression', 'both columns[] and expression');
    elsif btrim(coalesce(v_item->>'expression','')) = ''
          and jsonb_array_length(coalesce(v_item->'columns','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('indexes.shape', format('indexes[%s]', v_i),
             'columns[] OR expression', 'neither columns[] nor expression');
    end if;
  end loop;

  -- === partition ==========================================================
  -- PARTITIONING IS A PLATFORM PRIMITIVE, NOT ONE STORE'S SPECIAL CASE. A table that will
  -- hold every organization's rows is partitioned on the tenant key so a list read touches
  -- one child and a cross-organization maintenance read never scans the whole table.
  --
  -- 🚨 THE PRIMARY KEY IS A CONSEQUENCE, NOT A SECOND CHOICE. PostgreSQL requires every
  -- unique constraint on a partitioned table to CONTAIN the partition key, so the base
  -- contract's `id` alone cannot be the key and the builder emits `(<key columns>, id)`.
  -- Every unique index the spec asks for is held to the same rule HERE, by name, so the
  -- refusal names the index instead of arriving as a 0A000 out of the middle of the DDL.
  v_part := p_spec->'partition';
  if v_part is not null and jsonb_typeof(v_part) = 'object' then
    if coalesce(v_part->>'strategy', '') <> 'hash' then
      f := f || platform.provision_finding('partition.strategy.unsupported', 'partition.strategy',
             'hash', coalesce(nullif(v_part->>'strategy', ''), '(not set)'));
    end if;

    v_pkey := coalesce(array(select jsonb_array_elements_text(v_part->'key')), '{}'::text[]);
    if cardinality(v_pkey) = 0 then
      f := f || platform.provision_finding('partition.key.missing', 'partition.key',
             array_to_string(platform.provision_partition_key_candidates(p_spec), ' | '));
    else
      foreach v_txt in array v_pkey loop
        if v_txt <> all (platform.provision_partition_key_candidates(p_spec)) then
          f := f || platform.provision_finding('partition.key.not_a_candidate', 'partition.key',
                 array_to_string(platform.provision_partition_key_candidates(p_spec), ' | '), v_txt);
        end if;
      end loop;
    end if;

    begin
      v_pcount := (v_part->>'count')::integer;
    exception when others then
      v_pcount := null;
    end;
    if v_pcount is null or v_pcount < 1 or v_pcount > 64 then
      f := f || platform.provision_finding('partition.count.out_of_range', 'partition.count',
             '1 … 64', coalesce(nullif(v_part->>'count', ''), '(not set)'));
    end if;

    if cardinality(v_pkey) > 0 then
      v_i := 0;
      for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
        v_i := v_i + 1;
        if coalesce((v_item->>'unique')::boolean, false) then
          v_icols := coalesce(array(select jsonb_array_elements_text(v_item->'columns')), '{}'::text[]);
          foreach v_txt in array v_pkey loop
            if v_txt <> all (v_icols) then
              f := f || platform.provision_finding('partition.unique_index.missing_key',
                     format('indexes[%s].columns', v_i), array_to_string(v_pkey, ' | '),
                     format('[%s] — %L is not in it', array_to_string(v_icols, ', '), v_txt));
            end if;
          end loop;
        end if;
      end loop;
      for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
        if coalesce((v_item->>'unique')::boolean, false) then
          f := f || platform.provision_finding('partition.unique_index.missing_key',
                 format('fields[%s].unique', coalesce(v_item->>'name','?')),
                 array_to_string(v_pkey, ' | '),
                 format('a single-column unique index on %L', coalesce(v_item->>'name','?')));
        end if;
      end loop;
    end if;
  elsif v_part is not null then
    f := f || platform.provision_finding('partition.strategy.unsupported', 'partition',
           'an object, e.g. {"strategy":"hash","key":["organization_id"],"count":16}',
           format('a JSON %s', jsonb_typeof(v_part)));
  end if;

  -- === write door =========================================================
  -- DOOR-N-1's law, as a spec answer: `single` means `authenticated` holds no direct
  -- INSERT, UPDATE or DELETE on this table and every write goes through a declared door.
  v_txt := coalesce(p_spec->>'write_door', 'none');
  if v_txt not in ('none', 'single') then
    f := f || platform.provision_finding('write_door.unknown', 'write_door', 'none | single', v_txt);
  elsif v_txt = 'single'
        and jsonb_array_length(coalesce(p_spec->'functions','[]'::jsonb)) = 0 then
    f := f || platform.provision_finding('write_door.no_door_declared', 'write_door', null,
           'single, with functions[] empty');
  end if;

  -- === association types ==================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'association_types','[]'::jsonb)) loop
    v_i := v_i + 1;
    foreach v_txt in array array['source_type','target_type'] loop
      v_name := v_item->>v_txt;
      if v_name is not null and v_name <> coalesce(v_token,'')
         and not exists (select 1 from platform.entity_types e where e.token = v_name)
         and platform.provision_batch_token_rel(v_name) is null then
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
    -- G9: a registered projection is a platform.entity_types row (relation_kind =
    -- 'projection', audit_class = 'machinery'), so it needs a token, a label and the
    -- written reason that row's CHECK demands.
    if coalesce((v_item->>'registered_as_projection')::boolean, false) then
      if not platform.provision_identifier_ok(v_item->>'token') then
        f := f || platform.provision_finding('views.projection.token.missing', format('views[%s].token', v_name), null,
               coalesce(v_item->>'token', '(not set)'));
      elsif exists (select 1 from platform.entity_types e where e.token = v_item->>'token')
            or platform.provision_batch_token_rel(v_item->>'token') is not null
            or v_item->>'token' = coalesce(v_token, '') then
        f := f || platform.provision_finding('views.projection.token.taken', format('views[%s].token', v_name), null,
               v_item->>'token');
      end if;
      if btrim(coalesce(v_item->>'label','')) = '' then
        f := f || platform.provision_finding('views.projection.token.missing', format('views[%s].label', v_name), null,
               'the projection has no label');
      end if;
      if length(btrim(coalesce(v_item->>'reason',''))) < 20 then
        f := f || platform.provision_finding('views.projection.token.missing', format('views[%s].reason', v_name),
               'at least 20 characters', coalesce(v_item->>'reason', '(not set)'));
      end if;
      if v_item ? 'projects_token'
         and v_item->>'projects_token' is distinct from v_token
         and not exists (select 1 from platform.entity_types e where e.token = v_item->>'projects_token')
         and platform.provision_batch_token_rel(v_item->>'projects_token') is null then
        f := f || platform.provision_finding('views.projection.token.missing', format('views[%s].projects_token', v_name),
               'this table''s token, or a registered token', v_item->>'projects_token');
      end if;
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
  if jsonb_typeof(p_spec->'partition') = 'object' then
    plan := plan || jsonb_build_object('step','partition',
              'detail', format('PARTITION BY HASH (%s) into %s child table(s), and the primary key is (%s, id) because PostgreSQL requires the partition key in every unique constraint',
                               array_to_string(coalesce(array(select jsonb_array_elements_text(p_spec->'partition'->'key')), '{}'::text[]), ', '),
                               coalesce(p_spec->'partition'->>'count', '(not set)'),
                               array_to_string(coalesce(array(select jsonb_array_elements_text(p_spec->'partition'->'key')), '{}'::text[]), ', ')));
  end if;
  plan := plan || jsonb_build_object('step','revoke default ACL',
            'detail','REVOKE ALL FROM PUBLIC, anon, authenticated, service_role immediately after CREATE TABLE — 20 schemas carry ALTER DEFAULT PRIVILEGES rows that grant every NEW relation automatically, so today the default ACL, not the spec, is the source of a new table''s grants');
  plan := plan || jsonb_build_object('step','indexes',
            'detail','every FK gets a covering index, base columns organization_id and created_by included — never updated_by (P3-05: 0 of 4,917 statements filter on it); a declared index that LEADS with the FK column replaces the automatic one, so a partial FK index is declarable (G5); an expression index is declared with indexes[].expression (G4)');
  plan := plan || jsonb_build_object('step','triggers','detail','_stamp_actor, _stamp_actor_tier, _touch_row, _metadata_guard, and platform.assert_same_org for every declared tenancy check (the ONE shared validation-only function, never a per-table clone)');
  plan := plan || jsonb_build_object('step','iam.apply_rls','detail', format('variant %s', coalesce(v_variant,'?')));
  if coalesce(p_spec->>'write_door','none') = 'single' then
    plan := plan || jsonb_build_object('step','write door',
              'detail','platform.stamped_write_table is written BEFORE iam.apply_rls, so iam.apply_table_grants itself issues the read-only client grant and every later regeneration keeps it — a REVOKE after apply_rls would last exactly until the next one');
  end if;
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
$function$
;

insert into platform.provision_rule_message (rule_id, field_path, why, legal_values, otherwise)
values ('access.key_column.user_id_retired', 'access.key_column',
        'user_id was retired as an owner column (2026-09-23): the owner of every entity row is created_by, the column the access kernel, the list lane and the RLS generator all read. A table keyed on user_id is born with its policies and iam.has_access disagreeing on every row',
        'created_by',
        'Set access.key_column = ''created_by''. If each row is one person''s own, also set access.data_class = ''private'' (owner only, no organization lane). If the column you meant is a person the row is ABOUT (a grantee, the billed person, an audited subject), declare it as an ordinary field with its own name.')
on conflict (rule_id) do update
  set field_path = excluded.field_path, why = excluded.why,
      legal_values = excluded.legal_values, otherwise = excluded.otherwise;

update platform.provision_rule_message
   set why = 'an entity is keyed on created_by, its owner column -- the one the access kernel reads',
       legal_values = 'created_by',
       otherwise = 'Set access.key_column = ''created_by''.'
 where rule_id = 'access.key_column.missing';

-- The two rules only the removed user_id branches could raise.
delete from platform.provision_rule_message
 where rule_id in ('access.key_column.user_id_missing', 'access.data_class.personal_not_private');
