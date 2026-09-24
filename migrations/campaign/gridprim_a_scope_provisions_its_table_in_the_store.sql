-- target: branch,production
-- additive: yes
--   It ADDS `custom.scope_table_provision`, its `platform.client_callable_door` row, and
--   `custom.organization_home_id` (not a client door). Nothing
--   is dropped or revoked; no table, column, trigger, policy or grant is touched;
--   `context.provision_scope_dataset` (the older store's twin) is left exactly as it is.
--   It REPLACES `context.provision_scope_datasets_trigger` (declared below with the body it was
--   written against) so the trigger that provisions a scope's tables on every new scope and every
--   new template-bound item picks the store an organization lives in: the record store once its
--   `data_tables/older_tables_moved` is on and its Home exists, the older store otherwise —
--   exactly what it did before for every organization that has not moved.
--   The inverse is `migrations/inverse/gridprim_a_scope_provisions_its_table_in_the_store_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform,context
-- based-on: context.provision_scope_datasets_trigger() 0062b1b356fa3e6215a96dc9812f9098886d783811d4873851608691bd6060f2
--
-- LANE GRID-PRIMITIVES, G11 (CUTOVER-PLAN.md rows F11 and D5) — A SCOPE PROVISIONS ITS TABLE IN
-- THE STORE.
--
-- A context item whose value is a template-backed table (`reference_source.container_type =
-- 'dataset_template'`) is provisioned per scope by `context.provision_scope_dataset(item, scope)`:
-- one table built from the template's fields, recorded once per (item, scope), and written as the
-- item's value for that scope — a `directive_v1_reference_table` fence naming the table. It builds
-- an OLDER-store dataset, so every organization moved into the record store would keep minting
-- older tables through its scopes. `context.scope_dataset_instances.dataset_id` is a foreign key
-- to `workbench.udt_datasets`, so the instance of a record-store Table cannot be written there.
--
-- `custom.scope_table_provision(org, home, item, scope)` is the store's twin: the same checks (the
-- scope's organization, the item's scope type, the template binding, the platform template
-- library), the same idempotency (one Table per item and scope — the binding is kept ON the Table
-- as `scope_binding`, so a second call answers the first Table), the template's fields as the
-- Table's columns (string → text, number / integer → number, boolean → tick box, date / datetime
-- → date / date-and-time, json / array → long text; required and the field descriptions carried),
-- and the same context value, with the fence naming the record-store Table and saying which store
-- it lives in (`"store": "records"`).
--
-- TWO ANSWERS INTEG-CLIENTS ASKED FOR (PROGRESS-INTEG-CLIENTS, "Missing primitives" 3):
--   · A PRE-MOVE INSTANCE ANSWERS FIRST. A scope provisioned before its organization moved has a
--     row in `context.scope_dataset_instances` naming an older dataset; the mover carries that
--     dataset into the store with the SAME id. When the store holds a live Table by that id, it
--     is this scope's Table: it is answered (and given its `scope_binding`), never a second one.
--   · THE HOME IS OPTIONAL. `p_home_id` comes last and defaults to the organization's Home the
--     trigger uses — `custom.organization_home_id(org)`, the organization kernel's oldest live
--     record (the one the mover writes). No Home at all is refused by name.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The organization's Home in the record store: the organization kernel's oldest live record,
-- which is the one the mover writes. ONE definition, read by the door and by the trigger.
create function custom.organization_home_id(p_organization_id uuid)
returns uuid
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select h.id from custom.record h
   where h.organization_id = p_organization_id
     and h.table_id = custom.organization_kernel_id()
     and h.deleted_at is null
   order by h.created_at, h.id
   limit 1;
$fn$;

comment on function custom.organization_home_id(uuid) is
  'GRID-PRIMITIVES G11: an organization''s Home in the record store — the organization kernel''s oldest live record (the mover''s). Read by custom.scope_table_provision and context.provision_scope_datasets_trigger. Not a client door.';

create function custom.scope_table_provision(p_organization_id uuid, p_item_id uuid,
                                             p_scope_id uuid, p_home_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_item     record;
  v_scope    record;
  v_tpl      record;
  v_f        record;
  v_table    uuid;
  v_label    text;
  v_fence    text;
  v_title    text;
  v_n        integer := 0;
  v_home     uuid;
  v_prior    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.scope_table_provision');
  -- The service-role key is refused here ON PURPOSE: the server writes as the store owner or as the person (ruled 2026-09-24).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.scope_table_provision');

  select * into v_scope from context.scopes where id = p_scope_id and deleted_at is null;
  if v_scope.id is null or v_scope.organization_id is distinct from p_organization_id then
    raise exception 'That scope is not in this organization, so nothing was provisioned.'
      using errcode = '42501', hint = 'A context scope belongs to one organization. Open the organization it lives in.';
  end if;
  select * into v_item from context.context_items where id = p_item_id and is_active and deleted_at is null;
  if v_item.id is null or v_item.scope_type_id is distinct from v_scope.scope_type_id
     or v_item.reference_source ->> 'container_type' is distinct from 'dataset_template' then
    raise exception 'That context item is not a table this kind of scope provisions from a template.'
      using errcode = '22023', hint = 'The item must be active, of the scope''s own type, and bound to a dataset template. Nothing was provisioned.';
  end if;
  select * into v_tpl from workbench.udt_dataset_templates
   where id = (v_item.reference_source ->> 'template_id')::uuid and is_active;
  if v_tpl.id is null or v_tpl.organization_id not in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'The template this item is bound to is not this organization''s or the platform''s.'
      using errcode = '22023', hint = 'Nothing was provisioned.';
  end if;

  -- A PRE-MOVE INSTANCE ANSWERS FIRST: the moved Table carries the older dataset's own id.
  select i.dataset_id into v_prior from context.scope_dataset_instances i
   where i.context_item_id = p_item_id and i.scope_id = p_scope_id
   limit 1;
  if v_prior is not null and exists (
       select 1 from custom.record t
        where t.organization_id = p_organization_id and t.id = v_prior
          and t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null) then
    update custom.record
       set data = jsonb_set(data, '{scope_binding}', jsonb_build_object(
                    'context_item_id', p_item_id, 'scope_id', p_scope_id,
                    'template_id', v_tpl.id, 'template_version', v_tpl.version, 'carried_from', 'older'), true)
     where organization_id = p_organization_id and id = v_prior and table_id = custom.table_kernel_id()
       and data -> 'scope_binding' is null;
    return v_prior;
  end if;

  -- ONE Table per item and scope: the binding is on the Table itself.
  select t.id into v_table from custom.record t
   where t.organization_id = p_organization_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null
     and t.data -> 'scope_binding' ->> 'context_item_id' = p_item_id::text
     and t.data -> 'scope_binding' ->> 'scope_id' = p_scope_id::text
   limit 1;
  if v_table is not null then
    return v_table;
  end if;

  v_home := coalesce(p_home_id, custom.organization_home_id(p_organization_id));
  if v_home is null then
    raise exception 'This organization has no Home in the record store yet, so its scope table has nowhere to live.'
      using errcode = '22023',
            hint = 'The organization''s move into the record store makes its Home; until then its scopes keep their older tables. Nothing was provisioned.';
  end if;

  v_label := v_scope.name || ' — ' || v_item.display_name;
  select f.field_name into v_title from workbench.udt_dataset_template_fields f
   where f.template_id = v_tpl.id order by f.field_order limit 1;
  v_table := custom.table_declare(p_organization_id, jsonb_build_object(
    'name', v_label, 'slug', 'scope_' || left(md5(p_item_id::text || p_scope_id::text), 12),
    'type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'label_singular', coalesce(v_item.display_name, 'Row'), 'label_plural', coalesce(v_item.display_name, 'Rows'),
    'title_field', v_title, 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', v_title, 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', v_title))));
  for v_f in select * from workbench.udt_dataset_template_fields f where f.template_id = v_tpl.id order by f.field_order loop
    v_n := v_n + 1;
    perform custom.field_declare(p_organization_id, v_table, jsonb_strip_nulls(jsonb_build_object(
      'key', v_f.field_name, 'label', coalesce(nullif(v_f.display_name, ''), v_f.field_name),
      'type', case v_f.data_type::text when 'number' then 'number' when 'integer' then 'number'
                                      when 'boolean' then 'checkbox' when 'date' then 'datetime'
                                      when 'datetime' then 'datetime' when 'json' then 'long_text'
                                      when 'array' then 'long_text' else 'text' end,
      'kind', case when v_f.data_type::text = 'datetime' then 'datetime' end,
      'required', coalesce(v_f.is_required, false),
      'sort', v_n * 10,
      'config', case when nullif(v_f.validation_rules ->> 'description', '') is not null
                     then jsonb_build_object('help', v_f.validation_rules ->> 'description') end)));
  end loop;
  update custom.record
     set data = jsonb_set(data, '{scope_binding}', jsonb_build_object(
                  'context_item_id', p_item_id, 'scope_id', p_scope_id,
                  'template_id', v_tpl.id, 'template_version', v_tpl.version), true)
   where organization_id = p_organization_id and id = v_table and table_id = custom.table_kernel_id();

  v_fence := '```matrx' || chr(10)
    || '{"__kind":"directive_v1_reference_table","items":'
    || jsonb_build_array(jsonb_build_object('table_id', v_table, 'table_name', v_label, 'label', v_label,
                                            'store', 'records'))::text
    || '}' || chr(10) || '```';
  perform context.write_context_value(
    p_item_id => p_item_id, p_scope_id => p_scope_id, p_value_text => v_fence,
    p_change_summary => 'Provisioned template-backed table in the record store',
    p_source_type => 'system', p_actor => custom.query_principal());
  return v_table;
end
$fn$;

comment on function custom.scope_table_provision(uuid, uuid, uuid, uuid) is
  'GRID-PRIMITIVES G11 (org, item, scope, home default the organization''s Home): a scope instance made before the move is answered with its moved Table (same id). the record store''s twin of context.provision_scope_dataset — one Table per (context item, scope) built from the item''s dataset template (fields, required, help), the binding kept on the Table as scope_binding, and the item''s value for that scope written as a directive_v1_reference_table naming the Table with store "records". A second call answers the first Table. The service-role key is refused ON PURPOSE (42501, the organization wall): the store''s standing rule is that the server writes as the store owner (aidream''s ORM) or as the person, never as a row-security-bypassing role with no subject — ruled 2026-09-24.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'scope_table_provision', 'p_organization_id uuid, p_item_id uuid, p_scope_id uuid, p_home_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach first. p_scope_id must be a live scope OF THIS ORGANIZATION (else 42501, as for an invented one); p_item_id must be an active item of that scope''s type bound to a template of this organization or the platform library. The Table is made through custom.table_declare (which judges p_home_id) and its columns through custom.field_declare; the context value through context.write_context_value.',
        'gridprim_a_scope_provisions_its_table_in_the_store.sql', null, true, false,
        jsonb_build_object('version', 1, 'declared_by', 'gridprim_a_scope_provisions_its_table_in_the_store.sql',
          'declared_at', '2026-09-23 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'),
            'p_home_id', jsonb_build_object('type', 'uuid', 'position', 4, 'entity', 'custom_record',
              'check', 'optional; defaults to custom.organization_home_id(arg1). Passed only to custom.table_declare as parent_id, which decides whether the caller may place a table there.',
              'foreign', jsonb_build_object('sqlstate', '23514', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'),
            'p_scope_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'context_scope',
              'check', 'read only as a live scope whose organization_id = arg1, after arg1 is decided; any other raises 42501 exactly as an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'),
            'p_item_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'context_item',
              'check', 'read only as an active item of the scope''s own type bound to a template of arg1 or the platform; any other raises 22023 exactly as an invented id does.',
              'foreign', jsonb_build_object('sqlstate', '22023', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The trigger that provisions on every new scope and every new template-bound item: ONE
-- decision, where does this organization's data live. Unmoved organizations get exactly the
-- older call they got before; a moved organization gets its table in the store.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION context.provision_scope_datasets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_org uuid; v_home uuid; v_moved boolean;
begin
  -- An item carries no organization of its own; its scope type does (a scope's is the same).
  select st.organization_id into v_org from context.scope_types st where st.id = new.scope_type_id;
  -- GRID-PRIMITIVES G11: the record store once the organization has moved and its store is on.
  v_moved := coalesce((platform.knob_resolve('data_tables', 'older_tables_moved', v_org) #>> '{}')::boolean, false)
             and platform.knob_resolve('custom', 'system_enabled', v_org) is distinct from 'false'::jsonb;
  if v_moved then
    v_home := custom.organization_home_id(v_org);
    v_moved := v_home is not null;
  end if;
  if tg_table_name='scopes' then
    for r in select id from context.context_items
      where scope_type_id=new.scope_type_id and is_active and deleted_at is null
        and reference_source->>'container_type'='dataset_template'
    loop
      if v_moved then perform custom.scope_table_provision(v_org, r.id, new.id, v_home);
      else perform context.provision_scope_dataset(r.id,new.id); end if;
    end loop;
  else
    if new.is_active and new.deleted_at is null and new.reference_source->>'container_type'='dataset_template' then
      for r in select id from context.scopes
        where scope_type_id=new.scope_type_id and deleted_at is null
      loop
        if v_moved then perform custom.scope_table_provision(v_org, new.id, r.id, v_home);
        else perform context.provision_scope_dataset(new.id,r.id); end if;
      end loop;
    end if;
  end if;
  return new;
end; $function$;
