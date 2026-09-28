-- chair-step: lane SCOPES-SIDE-EFFECTS (SCOPES-CUTOVER-PLAN step 0.3, the validation twins). Three refusals that live today only in triggers on the old scope tables move into the record store's own scope halves, so they hold when the old tables are no longer written: a scope filed under a parent of another type (public.ctx_validate_scope_parent) is refused by custom._ctx_store_scope, a value for a field of another type (public.ctx_validate_value_scope_type) by custom._ctx_store_value, and a field bound to a dataset template that is not a one-table reference or names a template the organization may not use (context.enforce_context_item_reference_source) by custom._ctx_store_item — each through one new helper, one added line per half, with the old sentence and no ids. An archive is never refused. While the old tables are written their BEFORE triggers refuse first, so nothing a person meets changes. Writes no data.
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) 08b5825e5e7eabe5066972620b5206ad6df24c6f0240f76c0021be6cc7c47025
-- based-on: custom._ctx_store_item(uuid, uuid, uuid, jsonb) 4fbd5b0c5c2988af733315d0dac1ea393037e89d681d682d408019bdb81aa94d
-- based-on: custom._ctx_store_value(uuid, jsonb) 51722ed5e7d50c4c6a45eb95f1e5ce412968fbbf1e1492c464cffe9a7ce5f828
-- lane: SCOPES-SIDE-EFFECTS
-- INVERSE: migrations/inverse/scopessidefx_the_store_halves_refuse_what_the_old_triggers_refused_down.sql
-- window-class: three new functions and three replaced function bodies; no relation lock. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. Brightwater Software Studio files "Portal accessibility audit" (a Client project)
-- under "Carrier billing ledger" (a Workstream). The old tables refuse it — cross-type nesting — but
-- only through a trigger on context.scopes; with only the store written the Record would take the
-- wrong parent without a word. The same for writing a Workstream's "Stream owner" into a Client
-- project, and for binding a plain text field to the "Known defects" template.
-- Proof: scripts/campaign-tests/scopessidefx_the_side_effects_hold_with_the_image_off_red_green.sql X5–X7.
--
-- NOTE FOR LANE SCOPES-STORE-HOMES (which rewrites these three halves next): keep the one added
-- `perform custom._ctx_*_holds(...)` / `_ctx_value_fits_its_scope(...)` line in each.

-- ── A SCOPE'S PARENT IS OF ITS OWN TYPE (or of the type's declared parent type) ──────────────────
create or replace function custom._ctx_scope_parent_holds(p_org uuid, p_type uuid, p_parent uuid)
 returns void
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_required    uuid;
  v_parent_type uuid;
begin
  -- A type's parent type has no home in the store: no live scope type declares one (0 of 83 on
  -- production, 2026-09-28), so the rule is "a parent of the scope's own type". A Table that ever
  -- declares parent_type_id is honoured as the old rule did.
  select nullif(t.data ->> 'parent_type_id', '')::uuid into v_required
    from custom.record t where t.organization_id = p_org and t.id = p_type;
  if p_parent is not null then
    select r.table_id into v_parent_type
      from custom.record r where r.organization_id = p_org and r.id = p_parent and r.data_class = 'record';
  end if;
  if v_required is not null then
    if p_parent is null then
      raise exception 'Scopes of this type require a parent scope (type-level rule)'
        using errcode = '23514', hint = 'File it under a scope of the type this one belongs under. Nothing was written.';
    end if;
    if v_parent_type is distinct from v_required then
      raise exception 'Parent scope must be of the required parent type'
        using errcode = '23514', hint = 'File it under a scope of the type this one belongs under. Nothing was written.';
    end if;
  elsif p_parent is not null and v_parent_type is distinct from p_type then
    raise exception 'Cross-type nesting is not allowed for this type'
      using errcode = '23514', hint = 'A scope is filed under another scope of its own type. Nothing was written.';
  end if;
end
$function$;

-- ── A VALUE BELONGS TO A FIELD OF ITS OWN SCOPE'S TYPE ───────────────────────────────────────────
create or replace function custom._ctx_value_fits_its_scope(p_field custom.record, p_rec custom.record)
 returns void
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
begin
  if (p_field.data ->> 'entity_definition_id') is distinct from p_rec.table_id::text then
    raise exception 'Scope/item type mismatch: the context field "%" is not defined on the type "%" belongs to',
                    coalesce(p_field.data ->> 'label', p_field.data ->> 'key'), coalesce(p_rec.data ->> 'name', 'this scope')
      using errcode = '23514', hint = 'Write the value into a scope of the field''s own type. Nothing was written.';
  end if;
end
$function$;

-- ── A FIELD BOUND TO A DATASET TEMPLATE IS A ONE-TABLE REFERENCE TO A TEMPLATE IT MAY USE ────────
create or replace function custom._ctx_dataset_field_holds(p_org uuid, p_spec jsonb)
 returns void
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_src jsonb := p_spec -> 'reference_source';
  v_tpl uuid;
begin
  if v_src ->> 'container_type' is distinct from 'dataset_template' or nullif(p_spec ->> 'deleted_at', '') is not null then
    return;
  end if;
  if coalesce(v_src ->> 'dimension', 'whole') <> 'whole' or coalesce(v_src ->> 'provision', 'per_scope') <> 'per_scope' then
    raise exception 'dataset_template references require dimension=whole and provision=per_scope' using errcode = '22023';
  end if;
  begin
    v_tpl := (v_src ->> 'template_id')::uuid;
  exception when others then
    raise exception 'dataset_template reference requires a valid template_id' using errcode = '22023';
  end;
  -- The organization's own template, or a PLATFORM one (the system organization). Nothing else.
  if v_tpl is null or not exists (
       select 1 from workbench.udt_dataset_templates t
        where t.id = v_tpl and t.is_active
          and t.organization_id in (p_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)) then
    raise exception 'The dataset template this field is bound to is neither this organization''s nor a platform template'
      using errcode = '22023', hint = 'Choose one of this organization''s templates or a platform template. Nothing was written.';
  end if;
  if coalesce(p_spec ->> 'value_type', 'string') <> 'reference'
     or coalesce(p_spec -> 'allowed_reference_types', 'null'::jsonb) <> '["table"]'::jsonb
     or coalesce(nullif(p_spec ->> 'max_items', '')::int, 1) <> 1 then
    raise exception 'dataset-template context items require value_type=reference, allowed_reference_types=[table], and max_items=1'
      using errcode = '23514';
  end if;
end
$function$;

revoke all on function custom._ctx_scope_parent_holds(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function custom._ctx_value_fits_its_scope(custom.record, custom.record) from public, anon, authenticated;
revoke all on function custom._ctx_dataset_field_holds(uuid, jsonb) from public, anon, authenticated;

-- ── THE THREE HALVES, EACH WITH ITS ONE ADDED LINE ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._ctx_store_scope(p_org uuid, p_type uuid, p_scope uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_desc     text;
  v_data     jsonb;
  v_set      record;
  v_fid      uuid;
  v_fkey     text;
  v_shape    jsonb;
  v_taken    text[];
  v_existing custom.record;
  v_patch    jsonb := '{}'::jsonb;
  v_deleted  timestamptz := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  v_vis      text := coalesce(nullif(p_spec ->> 'visibility', ''), 'internal');
  v_k        text;
  v_v        jsonb;
  v_did      text;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    return jsonb_build_object('record', p_scope, 'did', 'table_archived');
  end if;
  -- THE OLD PARENT RULE (public.ctx_validate_scope_parent), read from the store (lane SCOPES-SIDE-EFFECTS).
  -- An archive is never refused.
  if nullif(p_spec ->> 'deleted_at', '') is null then
    perform custom._ctx_scope_parent_holds(p_org, p_type, nullif(p_spec ->> 'parent_scope_id', '')::uuid);
  end if;
  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_desc := coalesce(v_desc, 'description');

  v_data := jsonb_build_object('name', p_spec -> 'name', v_desc, p_spec -> 'description');
  if nullif(p_spec ->> 'parent_scope_id', '') is not null then
    v_data := v_data || jsonb_build_object('parent_id', p_spec ->> 'parent_scope_id');
  end if;

  -- EVERY SETTINGS KEY IS A DECLARED FIELD (SC-2', attack H2): the class checkout reads them.
  if jsonb_typeof(p_spec -> 'settings') = 'object' then
    for v_set in select e.key, e.value from jsonb_each(p_spec -> 'settings') e order by e.key loop
      continue when v_set.value is null or jsonb_typeof(v_set.value) = 'null';
      v_fid := custom._ctx_id('scope-setting-field', p_type::text, v_set.key);
      select f.data ->> 'key', jsonb_build_object('behavior', f.data ->> 'type', 'multi', coalesce((f.data ->> 'multi')::boolean, false))
        into v_fkey, v_shape
        from custom.record f where f.organization_id = p_org and f.id = v_fid;
      if v_fkey is null then
        select array_agg(f.data ->> 'key') into v_taken from custom.record f
         where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
           and f.data ->> 'entity_definition_id' = p_type::text;
        v_taken := coalesce(v_taken, '{}') || array['name', 'description'];
        v_fkey := custom._ctx_slug(v_set.key);
        if v_fkey = any (v_taken) then
          v_fkey := custom._ctx_slug('setting_' || v_set.key);
        end if;
        -- typemap.infer_shape, from the value this write carries.
        v_shape := case jsonb_typeof(v_set.value)
                     when 'boolean' then '{"behavior":"boolean","parity":"checkbox","multi":false}'
                     when 'number'  then '{"behavior":"range","config":{"kind":"number"},"multi":false}'
                     when 'array'   then '{"behavior":"text","multi":true}'
                     when 'object'  then '{"behavior":"text","format":"json","multi":false}'
                     else '{"behavior":"text","multi":false}' end::jsonb;
        update custom.record t
           set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_fkey)))
         where t.organization_id = p_org and t.id = p_type;
        perform custom._ctx_upsert_doc(p_org, v_fid, custom.field_kernel_id(), 'field',
          custom._ctx_field_doc(v_fkey,
                                coalesce(nullif(upper(left(btrim(replace(v_set.key, '_', ' ')), 1)) || lower(substr(btrim(replace(v_set.key, '_', ' ')), 2)), ''), v_fkey),
                                v_shape, p_type, false,
                                1000 + (select count(*)::int from custom.record f where f.organization_id = p_org
                                          and f.table_id = custom.field_kernel_id() and f.data ->> 'entity_definition_id' = p_type::text
                                          and f.metadata -> 'moved_from' ->> 'note' like 'the % key of this type''s scopes'' settings%'),
                                'internal', 'exclude', 'manual', null, null, false),
          jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                             'note', format('the ''%s'' key of this type''s scopes'' settings, which was never a context item', v_set.key))),
          null);
      end if;
      v_data := v_data || jsonb_build_object(v_fkey,
                  case when v_shape ->> 'behavior' = 'text' then custom._ctx_words(coalesce((v_shape ->> 'multi')::boolean, false), v_set.value)
                       else v_set.value end);
    end loop;
  end if;

  select * into v_existing from custom.record r where r.organization_id = p_org and r.id = p_scope;
  if v_existing.id is null then
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by, visibility, metadata, deleted_at)
    values (p_scope, p_org, p_type, 'record', v_data, coalesce(nullif(p_spec ->> 'created_by', '')::uuid, auth.uid()),
            v_vis::platform.visibility,
            jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_scope::text)),
            v_deleted);
    v_did := 'made';
  else
    if (v_existing.deleted_at is null) <> (v_deleted is null) or v_existing.visibility::text <> v_vis then
      update custom.record set deleted_at = v_deleted, visibility = v_vis::platform.visibility
       where organization_id = p_org and id = p_scope;
      v_did := case when v_deleted is null then 'restored' else 'archived' end;
    end if;
    for v_k, v_v in select e.key, e.value from jsonb_each(v_data) e loop
      if (v_existing.data -> v_k) is distinct from v_v then
        v_patch := v_patch || jsonb_build_object(v_k, v_v);
      end if;
    end loop;
    if v_patch <> '{}'::jsonb then
      update custom.record set data = data || v_patch where organization_id = p_org and id = p_scope;
      v_did := coalesce(v_did, 'updated');
    end if;
  end if;
  return jsonb_build_object('record', p_scope, 'did', coalesce(v_did, 'current'));
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._ctx_store_item(p_org uuid, p_type uuid, p_item uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old      custom.record;
  v_as_text  boolean;
  v_shape    jsonb;
  v_base     text := custom._ctx_slug(coalesce(nullif(p_spec ->> 'key', ''), nullif(p_spec ->> 'slug', ''), 'field'));
  v_key      text;
  v_n        int;
  v_used     text[];
  v_carried  jsonb := '{}'::jsonb;
  v_active   boolean := coalesce((p_spec ->> 'is_active')::boolean, true);
  v_archived timestamptz;
  v_doc      jsonb;
  v_did      text;
  v_col      uuid := custom._ctx_id('scope-column-field', p_type::text, 'description');
  v_colkey   text;
  v_tdoc     jsonb;
begin
  if not custom._ctx_table_live(p_org, p_type) then
    -- A Field of an archived Table is left as it was archived (context_follow._old_wins_documents).
    return jsonb_build_object('field', p_item, 'did', 'table_archived');
  end if;
  -- THE OLD DATASET-TEMPLATE RULE (context.enforce_context_item_reference_source), read from the store
  -- (lane SCOPES-SIDE-EFFECTS). An archive is never refused.
  perform custom._ctx_dataset_field_holds(p_org, p_spec);
  select * into v_old from custom.record r where r.organization_id = p_org and r.id = p_item;
  v_as_text := coalesce((v_old.metadata -> 'moved_from' -> 'carried' ->> 'as_text')::boolean, false);
  v_shape := custom._ctx_item_shape(p_spec, v_as_text);

  -- ONE KEY PER FIELD IN A TABLE (scopes._item_keys). A Field keeps the key it has — a key is how
  -- every saved value finds it — unless the item's own key changed.
  if v_old.id is not null and (v_old.data ->> 'key' = v_base or v_old.data ->> 'key' ~ ('^' || v_base || '_[0-9]+$')) then
    v_key := v_old.data ->> 'key';
  else
    select array_agg(f.data ->> 'key') into v_used
      from custom.record f
     where f.organization_id = p_org and f.table_id = custom.field_kernel_id()
       and f.data ->> 'entity_definition_id' = p_type::text and f.id <> p_item
       and f.id <> v_col;
    v_used := coalesce(v_used, '{}') || array['name'];
    v_key := v_base; v_n := 2;
    while v_key = any (v_used) loop
      v_key := v_base || '_' || v_n; v_n := v_n + 1;
    end loop;
  end if;

  -- AN ITEM CALLED "description" KEEPS ITS KEY; the scope's own column steps aside to
  -- scope_description on that Table, and every Record's value moves with it.
  select f.data ->> 'key' into v_colkey from custom.record f where f.organization_id = p_org and f.id = v_col;
  if v_key = 'description' and v_colkey = 'description' then
    select r.data into v_tdoc from custom.record r where r.organization_id = p_org and r.id = p_type;
    update custom.record set data = data || jsonb_build_object('fields',
             (data -> 'fields') || '[{"name": "scope_description"}]'::jsonb)
     where organization_id = p_org and id = p_type;
    update custom.record set data = data || '{"key": "scope_description"}'::jsonb,
                             metadata = metadata || jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                                        'note', 'the scope_description column, which was never a context item'))
     where organization_id = p_org and id = v_col;
    perform custom._ctx_rekey(p_org, p_type, 'description', 'scope_description');
  end if;

  if coalesce(p_spec ->> 'status', 'active') <> 'active' then
    v_carried := v_carried || jsonb_build_object('status', p_spec ->> 'status');
  end if;
  if not v_active then
    v_carried := v_carried || '{"is_active": false}'::jsonb;
  end if;
  -- WHAT THE ITEM SAYS ABOUT ITSELF THAT A FIELD HAS NO COLUMN FOR YET (lane SCOPES-TAILS): its
  -- category, its tags and its status note, kept whole beside the pointer (scopes.own_words).
  v_carried := v_carried || custom._ctx_own_words('item', p_spec);
  if coalesce((v_shape ->> 'as_text')::boolean, false) then
    v_carried := v_carried || jsonb_build_object('as_text', true, 'value_type', coalesce(p_spec ->> 'value_type', 'string'));
  end if;
  v_archived := nullif(p_spec ->> 'deleted_at', '')::timestamptz;
  if v_archived is null and not v_active then
    v_archived := coalesce(v_old.deleted_at, nullif(p_spec ->> 'updated_at', '')::timestamptz, now());
  end if;

  v_doc := custom._ctx_field_doc(
    v_key, coalesce(nullif(p_spec ->> 'display_name', ''), v_key), v_shape, p_type, false,
    coalesce((p_spec ->> 'sort_order')::int, 0) + 2,
    custom._ctx_word('sensitivity', p_spec ->> 'sensitivity'),
    custom._ctx_word('policy', p_spec ->> 'fetch_hint'),
    custom._ctx_word('source', p_spec ->> 'source_type'),
    nullif(p_spec ->> 'review_interval_days', '')::int,
    coalesce((select jsonb_agg(d) from jsonb_array_elements_text(coalesce(p_spec -> 'depends_on', '[]'::jsonb)) d), '[]'::jsonb),
    true);

  -- THE TABLE DECLARES THE KEY FIRST.
  update custom.record t
     set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', v_key)))
   where t.organization_id = p_org and t.id = p_type
     and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = v_key);

  v_did := custom._ctx_upsert_doc(p_org, p_item, custom.field_kernel_id(), 'field', v_doc,
             jsonb_build_object('moved_from', jsonb_build_object('table', 'context.context_items', 'id', p_item::text)
                                || case when v_carried <> '{}'::jsonb then jsonb_build_object('carried', v_carried) else '{}'::jsonb end),
             v_archived, nullif(p_spec ->> 'created_by', '')::uuid);

  -- A KEY THE ITEM STOPPED USING: its values move with it.
  if v_old.id is not null and v_old.data ->> 'key' is distinct from v_key then
    perform custom._ctx_rekey(p_org, p_type, v_old.data ->> 'key', v_key);
  end if;

  -- The field list in the mover's order, now that the Field exists.
  update custom.record t set data = t.data || jsonb_build_object('fields', custom._ctx_table_fields(p_org, p_type))
   where t.organization_id = p_org and t.id = p_type
     and t.data -> 'fields' is distinct from custom._ctx_table_fields(p_org, p_type);
  return jsonb_build_object('field', p_item, 'key', v_key, 'did', v_did);
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._ctx_store_value(p_org uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  custom.record;
  v_rec    custom.record;
  v_value  jsonb;
  v_src    jsonb;
  v_env    jsonb;
  v_actor  text := custom._ctx_word('actor', p_row ->> 'source_type');
begin
  if not coalesce((p_row ->> 'is_current')::boolean, true) then
    return jsonb_build_object('did', 'not_current');
  end if;
  select * into v_field from custom.record f
   where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  select * into v_rec from custom.record r
   where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  -- A VALUE BRINGS ITS FIELD AND ITS SCOPE (SC-2', "a declared Field is added first, never a
  -- refusal"): a value written for an item or a scope the store has not been handed yet (an old
  -- writer that inserted the three rows in one statement batch, a row written before the switch)
  -- lands them from the image first.
  if v_field.id is null then
    perform custom._ctx_store_item(p_org, i.scope_type_id, i.id, to_jsonb(i))
       from context.context_items i where i.id = (p_row ->> 'context_item_id')::uuid;
    select * into v_field from custom.record f
     where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  end if;
  if v_rec.id is null then
    perform custom._ctx_store_scope(p_org, s.scope_type_id, s.id, to_jsonb(s))
       from context.scopes s where s.id = (p_row ->> 'scope_id')::uuid;
    select * into v_rec from custom.record r
     where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  end if;
  if v_field.id is null or v_rec.id is null then
    raise exception 'The record store has no % for this value yet, so it cannot hold it.',
                    case when v_field.id is null then 'field' else 'record' end
      using errcode = '23503',
            hint = 'SCOPES-WRITE-THROUGH: a value is written after its scope and its context field. Nothing was written.';
  end if;
  -- THE OLD TYPE RULE (public.ctx_validate_value_scope_type), read from the store (lane SCOPES-SIDE-EFFECTS):
  -- a value belongs to a field of its own scope's type.
  perform custom._ctx_value_fits_its_scope(v_field, v_rec);
  if v_field.deleted_at is not null or v_rec.deleted_at is not null then
    -- An archived field or scope keeps its values as they were archived (the copy never writes them).
    return jsonb_build_object('did', 'archived');
  end if;

  v_value := custom._ctx_value_of(p_row, v_field.data);
  v_src := jsonb_build_object('kind', 'move', 'store', 'context.context_item_values',
                              'source_type', coalesce(p_row ->> 'source_type', 'manual'),
                              'feed', custom._ctx_word('source', p_row ->> 'source_type'),
                              'old_value_id', p_row ->> 'id',
                              'old_version', coalesce((p_row ->> 'version')::int, 1));
  if p_row ->> 'authored_by' is not null then
    v_src := v_src || jsonb_build_object('authored_by', p_row ->> 'authored_by');
  end if;
  if nullif(p_row ->> 'change_summary', '') is not null then
    v_src := v_src || jsonb_build_object('change_summary', p_row ->> 'change_summary');
  end if;
  v_env := jsonb_build_object('src', v_src, 'actor', v_actor,
                              'at', custom._ctx_iso(coalesce(nullif(p_row ->> 'created_at', '')::timestamptz, now())));
  if v_actor = 'agent' and p_row ->> 'authored_by' is not null then
    v_env := v_env || jsonb_build_object('on_behalf_of', p_row ->> 'authored_by');
  end if;
  if v_value is null then
    v_env := v_env || '{"absent": "none"}'::jsonb;
  end if;

  update custom.record r
     set data = (coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field.data ->> 'key', coalesce(v_value, 'null'::jsonb)))
                || jsonb_build_object('_values', coalesce(r.data -> '_values', '{}'::jsonb)
                                                 || jsonb_build_object(v_field.data ->> 'key', v_env))
   where r.organization_id = p_org and r.id = v_rec.id;
  return jsonb_build_object('did', 'written', 'key', v_field.data ->> 'key');
end;
$function$
;
