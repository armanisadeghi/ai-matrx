-- chair-step: it REPLACES the bodies of custom.record_platform_keys() and custom.template_upgrade(uuid, uuid, uuid) (signatures, volatility, SECURITY DEFINER, search_path, statement_timeout and grants unchanged). record_platform_keys gains `icon`: the record's own icon, which custom.relation_words_with_icons_many already reads from data->>'icon', becomes a key the platform writes into a document (like parent_id), so custom._undeclared_key_guard no longer refuses it on a `fields` Table. template_upgrade gains PASS 5: a seed row the install already has takes the new version's row icon only where it has none. No table, column, policy or grant is touched.
-- lane: CHAIR-TEMPLATE-UPGRADE
-- based-on: custom.record_platform_keys() 31f4ec12f340e135dba53cecebd20f0aff129e39724876b77dafda34d8795335
-- based-on: custom.template_upgrade(uuid, uuid, uuid) eb63b8df91f45017b6c70c0785134c881297a919261b390cedddf92f355d945c
-- lock: custom
--
-- Template seed rows carry a row icon (UseCaseRow.icon in @ai-matrx/records): the install plan writes it
-- as the record's `icon`, and an upgrade fills it in on rows an older version seeded.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.record_platform_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- `parent_id` is containment (REC-7/REC-8) and is read by custom.containment_parent on
  -- every record in the store. `icon` is the record's own icon (a @ai-matrx/icons name), read by
  -- custom.relation_words_with_icons_many for the chip a link to the record draws; a template's seed
  -- rows carry one (CHAIR-TEMPLATE-UPGRADE, 2026-10-06). Everything else the platform writes into a
  -- document is `_`-prefixed and is recognised by that prefix, not by this list.
  select array['parent_id', 'icon']::text[];
$function$;

CREATE OR REPLACE FUNCTION custom.template_upgrade(p_organization_id uuid, p_install_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '90s'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_t        custom.template;
  v_old      custom.template;
  v_i        custom.template_install;
  v_pre      jsonb;          -- the id map before this upgrade: what the install already has
  v_ids      jsonb;
  v_made     jsonb;
  v_steps    jsonb;
  v_n        integer;
  v_k        integer := -1;
  v_step     jsonb;
  v_args     jsonb;
  v_res      jsonb;
  v_name     text;
  v_path     jsonb;
  v_each     jsonb;
  v_el       jsonb;
  v_m        jsonb;
  v_refs     text[];
  v_tref     text;
  v_table    uuid;
  v_counts   jsonb := '{}'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  v_queue    jsonb := '[]'::jsonb;   -- select → relation conversions, run after every new step
  v_q        jsonb;
  v_live     record;
  v_new_type text;
  v_spec     jsonb;
  v_key      text;
  v_new_key  text;
  v_seq      integer;
  v_old_fid  uuid;
  v_old_sort jsonb;
  v_opts     uuid;
  v_choices  jsonb;
  v_target   uuid;
  v_title    text;
  v_max      integer;
  v_new_fid  uuid;
  v_map      jsonb;            -- lower(label) -> target record id
  v_row      record;
  v_vals     jsonb;
  v_labels   text[];
  v_label    text;
  v_hit      uuid;
  v_links    jsonb;
  v_changes  jsonb;
  v_f        record;
  v_t0       timestamptz := clock_timestamp();
  v_msg      text;
  v_code     text;
  v_hint     text;
  v_detail   text;
  v_where    text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.template_upgrade');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_upgrade');
  if v_me is null then
    raise exception 'Upgrading a template is done by a signed-in person, and nobody is signed in.' using errcode = '42501';
  end if;

  select * into v_i from custom.template_install i where i.id = p_install_id and i.organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such install in this organization, so there is nothing to upgrade.' using errcode = 'P0002',
          detail = jsonb_build_object('install_id', p_install_id)::text;
  end if;
  select * into v_t from custom.template t where t.id = p_template_id and t.retired_at is null;
  if not found or (v_t.scope = 'org' and not iam.has_org_access(v_t.organization_id)) then
    raise exception 'There is no such template to upgrade to; it may have been retired.' using errcode = 'P0002',
          detail = jsonb_build_object('template_id', p_template_id)::text;
  end if;
  if v_t.catalogue_id is distinct from v_i.catalogue_id then
    raise exception 'That template is not a version of the one this install came from (% is not %).', v_t.catalogue_id, v_i.catalogue_id
      using errcode = '22023';
  end if;

  -- The same lock template_install takes: an install and an upgrade of one catalogue id wait for each other.
  perform pg_advisory_xact_lock(hashtextextended('custom.template_install:' || p_organization_id::text || ':' || v_i.catalogue_id, 0));
  select * into v_i from custom.template_install i where i.id = p_install_id for update;

  if v_i.state <> 'installed' then
    raise exception 'Only a finished install is upgraded, and this one is %.', v_i.state using errcode = '55000',
          hint = 'Finish the install (or restore it) first, then upgrade.';
  end if;
  if v_t.template_version <= v_i.template_version then
    -- Idempotent: an install already at (or past) this version changes nothing.
    return custom._template_answer(v_i, jsonb_build_object('already', true, 'upgraded', false,
             'from_version', v_i.template_version, 'to_version', v_i.template_version,
             'counts', '{}'::jsonb, 'skipped', '[]'::jsonb));
  end if;
  select * into v_old from custom.template t where t.id = v_i.template_id;

  v_pre := v_i.ids;
  v_ids := v_i.ids;
  v_made := v_i.made;
  v_steps := v_t.plan -> 'steps';
  v_n := jsonb_array_length(v_steps);

  begin
    -- ── PASS 1: every step of the new version the install does not already have ──
    for v_k in 0 .. v_n - 1 loop
      v_step := v_steps -> v_k;
      v_refs := array(select m ->> 'ref' from jsonb_array_elements(coalesce(v_step -> 'made', '[]'::jsonb)) m
                      union select k from jsonb_object_keys(coalesce(v_step -> 'save', '{}'::jsonb)) k);
      v_tref := case when v_step #>> '{args,p_table_id}' ~ '^\$\{ref:.*\}$'
                     then regexp_replace(v_step #>> '{args,p_table_id}', '^\$\{ref:(.*)\}$', '\1') end;

      if cardinality(v_refs) = 0 then
        -- A step that records nothing (seed rows, a stage rule set): it runs only on a table this
        -- upgrade made. On a table the install already has, the rows there are the organization's own.
        if v_tref is not null and v_pre ? ('ref:' || v_tref) then
          v_counts := jsonb_set(v_counts, '{kept}', to_jsonb(coalesce((v_counts ->> 'kept')::integer, 0) + 1));
          if v_step ->> 'door' not in ('record_write', 'record_write_many', 'record_change_many') then
            v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('kind', 'step', 'ref', v_step ->> 'label',
              'reason', format('custom.%s on a table the install already has is not re-run: it records nothing, so running it again could make a second copy.', v_step ->> 'door')));
          end if;
          continue;
        end if;
      elsif not exists (select 1 from unnest(v_refs) r where not (v_ids ? ('ref:' || r))) then
        v_counts := jsonb_set(v_counts, '{kept}', to_jsonb(coalesce((v_counts ->> 'kept')::integer, 0) + 1));
        continue;
      end if;

      -- A field step on a table the install already has, whose key is already a live column there.
      if v_step ->> 'door' = 'field_declare' and v_tref is not null and v_pre ? ('ref:' || v_tref) then
        v_table := (v_pre ->> ('ref:' || v_tref))::uuid;
        v_key := v_step #>> '{args,p_spec,key}';
        select f.id, f.data into v_live
          from custom.record f
         where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_table::text and f.data ->> 'key' = v_key
         limit 1;
        if found then
          v_new_type := coalesce(v_step #>> '{args,p_spec,type}', v_step #>> '{args,p_spec,parity_type}', 'text');
          if (v_live.data ->> 'type') = 'list' and v_new_type = 'relation' then
            v_queue := v_queue || jsonb_build_array(jsonb_build_object('step', v_k, 'table_ref', v_tref, 'key', v_key, 'field_id', v_live.id));
          elsif (v_live.data ->> 'type') = v_new_type then
            for v_name in select k from jsonb_object_keys(coalesce(v_step -> 'save', '{}'::jsonb)) k loop
              v_ids := v_ids || jsonb_build_object('ref:' || v_name, v_live.id);
            end loop;
            v_counts := jsonb_set(v_counts, '{kept}', to_jsonb(coalesce((v_counts ->> 'kept')::integer, 0) + 1));
          else
            v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('kind', 'field', 'ref', v_step ->> 'label',
              'reason', format('The column "%s" is a %s here and a %s in version %s; only a choice list becoming a link is converted, so it was left as it is.',
                               coalesce(v_live.data ->> 'label', v_key), v_live.data ->> 'type', v_new_type, v_t.template_version)));
          end if;
          continue;
        end if;
      end if;

      -- A new step: run exactly as custom.template_install runs it.
      for v_name in select distinct (regexp_matches((v_step -> 'args')::text, '\$\{new:([^}]+)\}', 'g'))[1] loop
        if not v_ids ? ('new:' || v_name) then
          v_ids := v_ids || jsonb_build_object('new:' || v_name, gen_random_uuid());
        end if;
      end loop;
      v_args := custom._template_bind(v_step -> 'args', v_ids, p_organization_id, v_i.install_day, v_i.timezone);
      v_res := custom._template_call(v_step ->> 'door', v_args);
      for v_name, v_path in select key, value from jsonb_each(coalesce(v_step -> 'save', '{}'::jsonb)) loop
        if v_res #> array(select jsonb_array_elements_text(v_path)) is null
           or jsonb_typeof(v_res #> array(select jsonb_array_elements_text(v_path))) = 'null' then
          raise exception 'custom.% answered without the id the template saves as "%".', v_step ->> 'door', v_name using errcode = 'P0002';
        end if;
        v_ids := v_ids || jsonb_build_object('ref:' || v_name, v_res #>> array(select jsonb_array_elements_text(v_path)));
      end loop;
      v_each := v_step -> 'saveEach';
      if v_each is not null then
        for v_el in select x from jsonb_array_elements(coalesce(v_res #> array(select jsonb_array_elements_text(coalesce(v_each -> 'array', '[]'::jsonb))), '[]'::jsonb)) x loop
          if nullif(v_el #>> array(select jsonb_array_elements_text(v_each -> 'key')), '') is not null then
            v_ids := v_ids || jsonb_build_object('ref:' || (v_each ->> 'prefix') || (v_el #>> array(select jsonb_array_elements_text(v_each -> 'key'))),
                                                 v_el #>> array(select jsonb_array_elements_text(v_each -> 'value')));
          end if;
        end loop;
      end if;
      for v_m in select x from jsonb_array_elements(coalesce(v_step -> 'made', '[]'::jsonb)) x loop
        v_made := v_made || jsonb_build_array(jsonb_build_object(
          'kind', v_m ->> 'kind', 'ref', v_m ->> 'ref', 'title', v_m ->> 'title', 'step', v_k,
          'id', v_ids ->> ('ref:' || (v_m ->> 'ref')),
          'table_id', case when v_m ? 'table' then v_ids ->> ('ref:' || (v_m ->> 'table')) end));
        v_counts := jsonb_set(v_counts, array[(v_m ->> 'kind') || 's'], to_jsonb(coalesce((v_counts ->> ((v_m ->> 'kind') || 's'))::integer, 0) + 1));
      end loop;
      if v_step ->> 'door' in ('record_write_many') then
        v_counts := jsonb_set(v_counts, '{rows}', to_jsonb(coalesce((v_counts ->> 'rows')::integer, 0) + jsonb_array_length(coalesce(v_step #> '{args,p_rows}', '[]'::jsonb))));
      elsif v_step ->> 'door' = 'record_write' and v_step -> 'made' is null then
        v_counts := jsonb_set(v_counts, '{rows}', to_jsonb(coalesce((v_counts ->> 'rows')::integer, 0) + 1));
      end if;
    end loop;
    v_k := -1;

    -- ── PASS 2: a column the new version gives a table the install already has (inline in its table step) ──
    for v_f in select n.table_ref, n.key, n.spec
                 from custom._template_plan_fields(v_t.plan) n
                where n.door = 'table_from_example' and v_pre ? ('ref:' || n.table_ref)
                  and not exists (select 1 from custom._template_plan_fields(v_old.plan) o where o.table_ref = n.table_ref and o.key = n.key)
                  and not exists (select 1 from custom._template_plan_fields(v_t.plan) d where d.door = 'field_declare' and d.table_ref = n.table_ref and d.key = n.key) loop
      v_table := (v_pre ->> ('ref:' || v_f.table_ref))::uuid;
      if exists (select 1 from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_table::text and f.data ->> 'key' = v_f.key) then
        continue;
      end if;
      begin
        perform custom.field_declare(p_organization_id, v_table, jsonb_strip_nulls(jsonb_build_object(
          'key', v_f.key, 'label', v_f.spec ->> 'label', 'parity_type', v_f.spec ->> 'parityType', 'options', v_f.spec -> 'choices',
          'sensitivity', v_f.spec ->> 'sensitivity', 'context_policy', v_f.spec ->> 'contextPolicy', 'rules', v_f.spec -> 'rules',
          'display_format', v_f.spec -> 'displayFormat')));
        v_counts := jsonb_set(v_counts, '{fields}', to_jsonb(coalesce((v_counts ->> 'fields')::integer, 0) + 1));
      exception when others then
        get stacked diagnostics v_msg = message_text;
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('kind', 'field', 'ref', v_f.table_ref || '.' || v_f.key, 'reason', v_msg));
      end;
    end loop;

    -- ── PASS 3: a choice list that became a link. New column, every value linked by title, old column retired. ──
    for v_q in select x from jsonb_array_elements(v_queue) x loop
      v_k := (v_q ->> 'step')::integer;
      v_step := v_steps -> v_k;
      v_table := (v_ids ->> ('ref:' || (v_q ->> 'table_ref')))::uuid;
      v_key := v_q ->> 'key';
      v_old_fid := (v_q ->> 'field_id')::uuid;
      select f.data -> 'sort', nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid into v_old_sort, v_opts
        from custom.record f where f.id = v_old_fid;
      v_choices := case when v_opts is null then '{}'::jsonb else custom.choice_options(p_organization_id, v_opts) end;
      v_spec := custom._template_bind(v_step #> '{args,p_spec}', v_ids, p_organization_id, v_i.install_day, v_i.timezone);
      v_target := nullif(coalesce(v_spec ->> 'relation_target', v_spec ->> 'target_table'), '')::uuid;
      select t.data ->> 'title_field' into v_title from custom.record t
       where t.organization_id = p_organization_id and t.id = v_target and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
      if v_title is null then
        raise exception 'The table "%" links to has no title column, so its values cannot be matched by title.', v_key using errcode = '23514';
      end if;
      v_max := coalesce(nullif(v_spec ->> 'relation_max', '')::integer, 1);

      -- The new column's key is one no column of this table has ever held: the old column keeps its
      -- key and its values under every record, so restoring it shows exactly what it showed.
      v_seq := 2;
      loop
        v_new_key := left(v_key, 44) || '_' || v_seq;
        exit when not exists (select 1 from custom.record f where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
                                 and f.data ->> 'entity_definition_id' = v_table::text and f.data ->> 'key' = v_new_key)
              and not exists (select 1 from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
                               where t.id = v_table and e ->> 'name' = v_new_key);
        v_seq := v_seq + 1;
      end loop;

      -- The old column is retired first (one transaction: nothing lands unless everything does), so the
      -- new column can carry the same name; field_retire archives it, it is never dropped.
      perform custom.field_retire(p_organization_id, v_old_fid);
      v_new_fid := custom.field_declare(p_organization_id, v_table,
                     v_spec || jsonb_build_object('key', v_new_key) || case when v_old_sort is not null then jsonb_build_object('sort', v_old_sort) else '{}'::jsonb end);
      v_counts := jsonb_set(v_counts, '{fields_converted}', to_jsonb(coalesce((v_counts ->> 'fields_converted')::integer, 0) + 1));
      v_counts := jsonb_set(v_counts, '{fields_retired}', to_jsonb(coalesce((v_counts ->> 'fields_retired')::integer, 0) + 1));

      -- Every live row's choice → its label → the target record with that title (case-insensitive), made when missing.
      v_map := '{}'::jsonb;
      v_changes := '[]'::jsonb;
      for v_row in select r.id, r.version, r.data -> v_key as val
                     from custom.record r
                    where r.organization_id = p_organization_id and r.table_id = v_table and r.deleted_at is null
                      and r.data ? v_key and jsonb_typeof(r.data -> v_key) <> 'null'
                    order by r.created_at, r.id loop
        v_vals := case when jsonb_typeof(v_row.val) = 'array' then v_row.val else jsonb_build_array(v_row.val) end;
        v_labels := array(select coalesce(v_choices -> (e #>> '{}') ->> 'label', e #>> '{}')
                            from jsonb_array_elements(v_vals) with ordinality a(e, o)
                           where nullif(btrim(e #>> '{}'), '') is not null order by o);
        v_links := '[]'::jsonb;
        foreach v_label in array v_labels loop
          v_hit := (v_map ->> lower(btrim(v_label)))::uuid;
          if v_hit is null then
            select t.id into v_hit from custom.record t
             where t.organization_id = p_organization_id and t.table_id = v_target and t.deleted_at is null
               and lower(btrim(t.data ->> v_title)) = lower(btrim(v_label))
             order by t.created_at, t.id limit 1;
            if v_hit is null then
              v_hit := (custom.record_write_many(p_organization_id, v_target,
                          array[jsonb_build_object(v_title, btrim(v_label), '_actor', 'user')], array[gen_random_uuid()]))[1];
              v_counts := jsonb_set(v_counts, '{targets_created}', to_jsonb(coalesce((v_counts ->> 'targets_created')::integer, 0) + 1));
            end if;
            v_map := v_map || jsonb_build_object(lower(btrim(v_label)), v_hit);
          end if;
          if not v_links @> jsonb_build_array(v_hit) then
            v_links := v_links || jsonb_build_array(v_hit);
          end if;
        end loop;
        if jsonb_array_length(v_links) = 0 then
          continue;
        end if;
        if jsonb_array_length(v_links) > v_max then
          v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('kind', 'value', 'ref', v_row.id,
            'reason', format('The row held %s choices and the link holds %s; the first %s were linked and every choice is still in the retired column.',
                             jsonb_array_length(v_links), v_max, v_max)));
          v_links := (select jsonb_agg(l) from (select l from jsonb_array_elements(v_links) with ordinality a(l, o) order by o limit v_max) z);
        end if;
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('op', 'update', 'record_id', v_row.id, 'expected_version', v_row.version,
                       'patch', jsonb_build_object(v_new_key, case when v_max = 1 then v_links -> 0 else v_links end)));
        v_counts := jsonb_set(v_counts, '{links}', to_jsonb(coalesce((v_counts ->> 'links')::integer, 0) + jsonb_array_length(v_links)));
        if jsonb_array_length(v_changes) >= 100 then
          perform custom.record_change_many(p_organization_id, v_table, v_changes);
          v_changes := '[]'::jsonb;
        end if;
      end loop;
      if jsonb_array_length(v_changes) > 0 then
        perform custom.record_change_many(p_organization_id, v_table, v_changes);
      end if;

      for v_name in select k from jsonb_object_keys(coalesce(v_step -> 'save', '{}'::jsonb)) k loop
        v_ids := v_ids || jsonb_build_object('ref:' || v_name, v_new_fid, 'retired:' || v_name, v_old_fid);
      end loop;
      for v_m in select x from jsonb_array_elements(coalesce(v_step -> 'made', '[]'::jsonb)) x loop
        v_made := v_made || jsonb_build_array(jsonb_build_object(
          'kind', v_m ->> 'kind', 'ref', v_m ->> 'ref', 'title', v_m ->> 'title', 'step', v_k,
          'id', v_new_fid, 'table_id', v_table));
      end loop;
    end loop;
    v_k := -1;

    -- ── PASS 4: a column the older version made and the new one no longer has is retired, never dropped ──
    for v_f in select o.table_ref, o.key, f.id as field_id, coalesce(f.data ->> 'label', o.key) as label
                 from (select distinct p.table_ref, p.key from custom._template_plan_fields(v_old.plan) p) o
                 join custom.record f
                   on f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                  and f.data ->> 'entity_definition_id' = v_pre ->> ('ref:' || o.table_ref) and f.data ->> 'key' = o.key
                where v_pre ? ('ref:' || o.table_ref)
                  and not exists (select 1 from custom._template_plan_fields(v_t.plan) n where n.table_ref = o.table_ref and n.key = o.key) loop
      begin
        perform custom.field_retire(p_organization_id, v_f.field_id);
        v_counts := jsonb_set(v_counts, '{fields_retired}', to_jsonb(coalesce((v_counts ->> 'fields_retired')::integer, 0) + 1));
        v_ids := v_ids || jsonb_build_object('retired:fields.' || substr(v_f.table_ref, 8) || '.' || v_f.key, v_f.field_id);
      exception when others then
        get stacked diagnostics v_msg = message_text;
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('kind', 'field', 'ref', v_f.table_ref || '.' || v_f.key,
          'reason', format('Version %s no longer has "%s", and it was kept: %s', v_t.template_version, v_f.label, v_msg)));
      end;
    end loop;

    -- ── PASS 5: a seed row the install already has takes the new version's row icon, only where it
    --           has none — an icon the person set is never overwritten. ──
    for v_f in select (v_ids ->> ('ref:' || regexp_replace(s.x #>> '{args,p_table_id}', '^\$\{ref:(.*)\}$', '\1')))::uuid as table_id,
                      jsonb_agg(jsonb_build_object('op', 'update', 'record_id', r.id, 'expected_version', r.version,
                                                   'patch', jsonb_build_object('icon', btrim(w.v ->> 'icon')))) as changes
                 from jsonb_array_elements(v_steps) with ordinality s(x, n)
                 cross join lateral jsonb_array_elements(coalesce(s.x #> '{args,p_rows}', '[]'::jsonb)) with ordinality w(v, o)
                 join custom.record r
                   on r.organization_id = p_organization_id and r.deleted_at is null
                  and r.id::text = v_ids ->> regexp_replace(s.x #>> array['args', 'p_ids', (w.o - 1)::text], '^\$\{(new:[^}]+)\}$', '\1')
                  and r.table_id::text = v_ids ->> ('ref:' || regexp_replace(s.x #>> '{args,p_table_id}', '^\$\{ref:(.*)\}$', '\1'))
                where s.x ->> 'door' = 'record_write_many'
                  and nullif(btrim(w.v ->> 'icon'), '') is not null
                  and nullif(btrim(r.data ->> 'icon'), '') is null
                group by s.n, 1 loop
      perform custom.record_change_many(p_organization_id, v_f.table_id, v_f.changes);
      v_counts := jsonb_set(v_counts, '{icons}', to_jsonb(coalesce((v_counts ->> 'icons')::integer, 0) + jsonb_array_length(v_f.changes)));
    end loop;

    update custom.template_install i
       set template_id = v_t.id, template_version = v_t.template_version, next_step = v_n,
           ids = v_ids, made = v_made, refusal = null,
           ms = i.ms + (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
           calls = i.calls + 1, updated_at = now()
     where i.id = v_i.id
    returning * into v_i;
  exception when others then
    -- Everything this call did is rolled back: the install stays exactly as it was, on its old version.
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail, v_where = pg_exception_context;
    return custom._template_answer(v_i, jsonb_build_object(
             'ok', false, 'upgraded', false, 'from_version', v_i.template_version, 'to_version', v_t.template_version,
             'counts', '{}'::jsonb, 'skipped', '[]'::jsonb,
             'refusal', jsonb_build_object('step', case when v_k >= 0 then v_k end,
                                           'label', case when v_k >= 0 then v_steps -> v_k ->> 'label' end,
                                           'door', case when v_k >= 0 then 'custom.' || (v_steps -> v_k ->> 'door') else 'custom.template_upgrade' end,
                                           'code', v_code, 'message', v_msg, 'hint', nullif(v_hint, ''), 'detail', nullif(v_detail, ''),
                                           'where', left(nullif(v_where, ''), 2000))));
  end;

  return custom._template_answer(v_i, jsonb_build_object(
           'upgraded', true, 'from_version', coalesce(v_old.template_version, 0), 'to_version', v_t.template_version,
           'counts', v_counts, 'skipped', v_skipped,
           'this_call_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
           'agent', (select jsonb_build_object('platform_agent', v_t.plan -> 'agent' -> 'platformAgent', 'name', v_t.plan -> 'agent' ->> 'name',
                       'bindings', coalesce((select jsonb_agg(b || jsonb_build_object('table_id', v_i.ids ->> ('ref:tables.' || (b ->> 'tableToken'))))
                                               from jsonb_array_elements(coalesce(v_t.plan -> 'agent' -> 'bindings', '[]'::jsonb)) b), '[]'::jsonb),
                       'copied', exists (select 1 from jsonb_array_elements(v_i.made) x where x ->> 'kind' = 'agent'))
                      where v_t.plan ? 'agent')));
end;
$function$;
