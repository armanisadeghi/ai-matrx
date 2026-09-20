-- target: branch,production
-- additive: yes
-- INVERSE of seatsuites_the_field_door_saves_promoted_and_unique.sql: the body as it stood on 2026-09-19.
--
CREATE OR REPLACE FUNCTION custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old       jsonb;
  v_table     uuid;
  v_next      jsonb;
  v_opts      uuid;
  v_word      text;
  v_spec      jsonb;
  v_was       text;
  v_now       text;
  v_behaviour boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  -- ── IS THIS A CHANGE OF BEHAVIOUR? T12. ───────────────────────────────────────────────
  -- Any of the three words a caller uses for it. The door used to refuse one of them and
  -- ignore the other two; it now carries all three out through the same function that shapes
  -- a field when it is created, so a column changed and a column created are the same shape.
  v_behaviour := coalesce(nullif(p_patch ->> 'parity_type', ''),
                          nullif(p_patch ->> 'plain', ''),
                          nullif(p_patch ->> 'type', '')) is not null;

  if v_behaviour then
    -- The spec is everything this field already is, with the patch written over it. The key
    -- and the table never move; `custom._field_document_for` decides the rest.
    v_spec := jsonb_strip_nulls(jsonb_build_object(
      'key',            v_old ->> 'key',
      'label',          coalesce(p_patch ->> 'label', v_old ->> 'label'),
      'multi',          coalesce(p_patch -> 'multi', v_old -> 'multi'),
      'dated',          coalesce(p_patch -> 'dated', v_old -> 'dated'),
      'required',       coalesce(p_patch -> 'required', v_old -> 'required'),
      'sort',           coalesce(p_patch -> 'sort', v_old -> 'sort'),
      'source',         coalesce(p_patch ->> 'source', v_old ->> 'source'),
      'source_config',  coalesce(p_patch -> 'source_config', v_old -> 'source_config'),
      'sensitivity',    coalesce(p_patch ->> 'sensitivity', v_old ->> 'sensitivity'),
      'context_policy', coalesce(p_patch ->> 'context_policy', v_old ->> 'context_policy'),
      'applies_to_types', coalesce(p_patch -> 'applies_to_types', v_old -> 'applies_to_types'),
      'depends_on',     coalesce(p_patch -> 'depends_on', v_old -> 'depends_on'),
      'unit',           coalesce(p_patch ->> 'unit', v_old ->> 'unit'),
      'expr',           coalesce(p_patch -> 'expr', v_old -> 'config' -> 'expr'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules')));
    -- The patch's own word for the behaviour, whichever of the three it used.
    if nullif(p_patch ->> 'parity_type', '') is not null then
      v_spec := v_spec || jsonb_build_object('parity_type', p_patch ->> 'parity_type');
    elsif nullif(p_patch ->> 'plain', '') is not null then
      v_spec := v_spec || jsonb_build_object('plain', p_patch ->> 'plain');
    else
      v_spec := v_spec || jsonb_build_object('type', p_patch ->> 'type');
    end if;

    v_next := custom._field_document_for(p_organization_id, v_table, v_spec);
    -- The key and the table are this field's identity and _field_document_for takes them from
    -- the spec; written again here so a spec that lost one cannot silently move a field.
    v_next := v_next || jsonb_build_object('key', v_old ->> 'key');
    if v_table is not null then
      v_next := v_next || jsonb_build_object('entity_definition_id', v_table::text);
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES, if the new behaviour is a list and the caller typed some.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and jsonb_typeof(p_patch -> 'options') = 'array'
       and jsonb_array_length(p_patch -> 'options') > 0 then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    end if;

    -- AND THE WRITE, which is what fires custom._field_type_converts_values: every value of
    -- this column is converted where it converts and kept in `_retired` with its reason where
    -- it does not, and the history.migration_log row is written by that same trigger. Nothing
    -- here duplicates any of it — this door's whole job was to let it happen.
    update custom.record
       set data = v_next, updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id();

    if v_was is not distinct from v_now then
      raise notice 'custom: "%" still behaves as %; its other settings were saved.',
        coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce(v_now, 'before');
    end if;
    return p_field_id;
  end if;

  -- ── OTHERWISE: THE SETTINGS, exactly as before. ───────────────────────────────────────
  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED (unchanged).
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  return p_field_id;
end;
$function$

;
