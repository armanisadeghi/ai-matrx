-- chair-step: the inverse of scopesrefusals_the_scope_doors_refuse_in_plain_words.sql restores the bodies as they stood on clone when this pair was written (custom._context_copy_fence, custom._ctx_answer, custom._ctx_dataset_field_holds, custom._ctx_store_scope, custom._ctx_tree_part, custom.assert_scope_door, custom.context_archived_types, custom.context_items, custom.context_resolve, custom.context_scope_write, custom.context_scopes, custom.context_tag_copy_batch, custom.context_tag_copy, custom.context_tags_set, custom.context_template_define, custom.context_tree_search, custom.context_tree_type_scopes, custom.context_tree_types, custom.context_tree, custom.context_type_write, custom.context_values).
-- lane: SCOPES-ON-THE-STORE

-- lock: custom

CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
  v_older  text;
  v_copyof uuid;
begin
  v_copyof := case when new.data_class = 'table' then new.id
                   when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                   else new.table_id end;

  -- THE ONE WRITER. The store owner's own connection — the scopes mover, the follow worker and
  -- the older-tables mover's rerun — may write any copy. Read from the catalogue, never a role
  -- literal, exactly as custom._store_door's operator lane is. When it rewrites a test-copy row a
  -- person had touched, what it writes is the image the switch will put back (COPY-WRITABLE).
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    if tg_op = 'UPDATE' and custom._copy_evaluation_is_open(new.organization_id, new.id) then
      perform custom._copy_evaluation_reimage(new.organization_id, new.id, to_jsonb(new));
    end if;
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH — FOR AGENTS, AUTOMATIONS AND INTEGRATIONS
  -- (WHERE-LIVES-SWITCH, amended by COPY-WRITABLE 2026-09-25). COPY mode keeps every older table
  -- live beside its same-id copy until an owner presses the organization's Data tables switch.
  -- A PERSON's own write to the copy (the new table page, the record page) is a test: allowed,
  -- and noted with the row as the mover left it, so the switch can replace it with the older
  -- table's truth. Any other writer is refused with the older table's address.
  v_older := custom._older_table_copy_refusal(v_copyof);
  if v_older is null and v_copyof is not null then
    perform custom._copy_evaluation_note(new.organization_id, v_copyof, new.id, new.data_class);   -- notes only a person's write to a test copy
  elsif v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH / COPY-WRITABLE: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off), and this write declares an agent, automation or integration (or is not a signed-in person''s own). Nothing was written. Write the older table; after the switch the copy is the table.';
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := v_copyof;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the scope doors and the
  -- write-through (both marked for this transaction) write a context Table, and nothing else does:
  -- a generic store write (the grid, the records tool, a sync client) would leave the current
  -- context tables, which every not-yet-moved reader still reads, behind.
  -- The marker is set only by the scope doors and the write-through, and only in such an
  -- organization, so a marked write passes before anything else is asked.
  if custom._ctx_marked() then
    return new;
  end if;
  if custom._ctx_answer(new.organization_id, null, null) ->> 'writer' = 'store' then
    v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;
    raise exception '% is written through the scopes screens (or an agent''s context tools), so the current context system stays exact while it is still read. Edit it on %.',
                    case when new.data_class = 'record' then 'This scope' else 'This scope type' end, v_where
      using errcode = '42501',
            hint = 'SCOPES-WRITE-THROUGH: this organization''s scopes are written in the record store first (custom.context_writer = store), through the scope doors (custom.context_*), which keep the old context tables exact in the same transaction. A write through any other door is refused until the final switch lifts this. Nothing was written.';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_answer(p_org uuid, p_id uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- WHO IS ASKING, DECIDED (VERIFIER-27): the store's one ladder, as every door into custom does. A
  -- caller who may not reach the organization learns nothing about it, not even which system writes it.
  if p_org is null then
    return jsonb_build_object('ok', true, 'writer', 'old', 'row', p_row, 'store', null);
  end if;
  perform custom.assert_client_may_reach(p_org, 'custom._ctx_answer');
  return (
  -- The store row's facts are answered only to a member of its organization (or the server).
    select jsonb_build_object(
      'ok', true,
      'writer', custom.context_writer(p_org),
      'row', p_row,
      'store', (select jsonb_build_object('id', r.id, 'table_id', r.table_id, 'data_class', r.data_class,
                                          'version', r.version, 'archived', r.deleted_at is not null)
                  from custom.record r
                 where r.organization_id = p_org and r.id = p_id
                   and (auth.uid() is null or iam.is_org_member(auth.uid(), p_org))))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_dataset_field_holds(p_org uuid, p_spec jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_own      jsonb;
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

  -- THE SCOPE'S SLUG AND SORT ORDER HAVE THEIR HOME IN THE RECORD (lane SCOPES-STORE-HOMES): two
  -- declared Fields of every scope Table (made here if this Table predates them). The slug is the old
  -- row's own (context.ensure_slug has already run), or made from the name exactly as ensure_slug makes
  -- it; it stays unique among the Table's live Records, as ctx_scopes_type_slug_uniq keeps it today.
  if not exists (select 1 from custom.record f
                  where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', p_type::text, 'slug')) then
    perform custom._ctx_scope_columns(p_org, p_type);
  end if;
  v_own := custom._ctx_own_words('scope', p_spec);
  if v_own ->> 'slug' is null then
    raise exception 'ensure_slug: could not derive slug from "%" (empty after normalization)', coalesce(p_spec ->> 'name', '<null>')
      using errcode = '22023';
  end if;
  if v_deleted is null and exists (
       select 1 from custom.record x
        where x.organization_id = p_org and x.table_id = p_type and x.deleted_at is null and x.id <> p_scope
          and x.data @> jsonb_build_object('slug', v_own ->> 'slug')) then
    raise exception 'Another % here already has the slug "%"; a slug is different on every live scope of a type.',
                    coalesce((select nullif(t.data ->> 'label_singular', '') from custom.record t where t.organization_id = p_org and t.id = p_type), 'scope'),
                    v_own ->> 'slug'
      using errcode = '23505',
            hint = 'Give this one another name or slug, or archive the one that holds it. Nothing was written.';
  end if;
  v_data := v_data || v_own;
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
        v_taken := coalesce(v_taken, '{}') || array['name', 'description', 'slug', 'sort_order'];
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
  -- A SETTINGS KEY THE OLD ROW NO LONGER CARRIES IS CLEARED ON THE RECORD TOO (lane SCOPES-READS-ACCESS).
  -- The loop above writes only the keys the row still says, so a key it removed (a class's join code
  -- disabled by edu_class_join_code, a teacher emptied in the class settings) stayed on the Record: a
  -- reader of the store would admit a person with a join code its owner had disabled. Every caller
  -- (the bridge, custom._ctx_store_value) hands this half the WHOLE old row, so a settings key absent
  -- from it is a key the row no longer has. Only the Fields this half made for settings keys are
  -- touched — each named by its note and proved by its id, the one both twins derive — never a
  -- context item's Field, never name / description / slug / sort order.
  if v_existing.id is not null and p_spec ? 'settings' then
    for v_k in
      select f.data ->> 'key'
        from custom.record f
        cross join lateral regexp_match(f.metadata -> 'moved_from' ->> 'note',
                                        '^the ''(.*)'' key of this type''s scopes'' settings') m
       where f.organization_id = p_org
         and f.table_id = custom.field_kernel_id()
         and f.data ->> 'entity_definition_id' = p_type::text
         and f.metadata -> 'moved_from' ->> 'table' = 'context.scopes'
         and f.data ? 'key'
         and f.id = custom._ctx_id('scope-setting-field', p_type::text, m[1])
         and (jsonb_typeof(p_spec -> 'settings') is distinct from 'object'
              or jsonb_typeof(coalesce(p_spec -> 'settings' -> m[1], 'null'::jsonb)) = 'null')
    loop
      if jsonb_typeof(coalesce(v_existing.data -> v_k, 'null'::jsonb)) <> 'null' then
        v_data := v_data || jsonb_build_object(v_k, null);
      end if;
    end loop;
  end if;
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
    -- WHO MADE THE SCOPE, AS THE OLD ROW SAYS (lane SCOPES-STORE-HOMES).
    if nullif(p_spec ->> 'created_by', '')::uuid is not null
       and v_existing.created_by is distinct from (p_spec ->> 'created_by')::uuid then
      update custom.record set created_by = (p_spec ->> 'created_by')::uuid where organization_id = p_org and id = p_scope;
      v_did := coalesce(v_did, 'updated');
    end if;
  end if;
  -- AN OLD ROW THAT NAMES NOBODY IS COPIED NAMING NOBODY (lane SCOPES-STORE-HOMES, chair ruling from L7,
  -- 2026-09-29): the writer's uid or the organization owner the store's fallback filled in would hand that
  -- person an owner's reach over this row that nobody has today. The stamp is the copy's own.
  if p_spec ? 'created_by' and jsonb_typeof(p_spec -> 'created_by') = 'null' then
    update custom.record set created_by = null where organization_id = p_org and id = p_scope and created_by is not null;
  end if;
  return jsonb_build_object('record', p_scope, 'did', coalesce(v_did, 'current'));
end;
$function$;

CREATE OR REPLACE FUNCTION custom._ctx_tree_part(p_me uuid, p_orgs uuid[], p_admin uuid[], p_mode text, p_type_ids uuid[] DEFAULT NULL::uuid[], p_query text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_types  jsonb := '[]'::jsonb;
  v_scopes jsonb := '[]'::jsonb;
  v_total  integer := 0;
  v_pat    text;
  -- STORE-READ-PERF-6 (custom.context_tree's own names, the same three)
  v_among  jsonb;
  v_tids   uuid[];
  v_pairs  text;
begin
  -- Called only by the three definer doors below, after they decided the caller; it has no client
  -- EXECUTE. p_me is the caller they resolved, p_orgs the organizations they decided, p_admin those of
  -- them read whole on the admin lane.
  if p_mode is null or p_mode not in ('types', 'type_list', 'scopes', 'search') then
    raise exception 'custom._ctx_tree_part: mode % is not types, type_list, scopes or search', p_mode using errcode = '22023';
  end if;
  if p_me is null or cardinality(coalesce(p_orgs, '{}'::uuid[])) = 0 then
    return case when p_mode in ('types', 'type_list') then jsonb_build_object('types', v_types)
                       else jsonb_build_object('scopes', v_scopes, 'total', 0) end;
  end if;

  -- Search asks the ladder only of the Tables holding a Record whose stored name matches: the visible
  -- name is still what decides below (a Table with no stored match can hold no visible match).
  if p_mode = 'search' then
    v_pat := '%' || replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    select coalesce(array_agg(distinct r.table_id), '{}'::uuid[]) into p_type_ids
      from custom.record r
     where r.organization_id = any (p_orgs)
       and r.deleted_at is null
       and r.table_id in (select t.id from custom.record t
                           where t.organization_id = any (p_orgs) and t.table_id = v_tables
                             and t.deleted_at is null and t.data ->> 'kept_for' = 'context')
       and (r.data ->> 'name') ilike v_pat escape '\';
    if cardinality(p_type_ids) = 0 then
      return jsonb_build_object('scopes', v_scopes, 'total', 0);
    end if;
  end if;

  -- ── STEP 1, THE TABLE STEP: custom.context_tree's STORE-READ-PERF-6 step 1, restricted to the types
  -- asked (the one addition, `and (p_type_ids is null or t.id = any (p_type_ids))`, on each scan).
  -- scripts/campaign-tests/scopestreepaged_one_body_check.mjs fails when this step, the Records step
  -- below, the two objects or the doors' wall stop being custom.context_tree's (attack H2: this helper
  -- was a hand copy taken at PERF-5 and fell behind when PERF-6 changed the original). Every non-admin
  -- organization and its asked scope Tables are named in the statement memo first, so the one
  -- ladder's Table walk is asked once for all of them (custom.query_visible_ids' among path), not once
  -- per organization; then the (organization, Table) pairs the Records step reads are named the same
  -- way. A name is only ever an answer-safe hint: its readers fall back to their own walk whenever it
  -- does not name every Table asked, names another organization, or the transaction has written.
  select coalesce(jsonb_object_agg(o.org, o.ids), '{}'::jsonb) into v_among
    from (select t.organization_id as org, jsonb_agg(t.id order by t.id) as ids
            from custom.record t
           where t.organization_id = any (p_orgs)
             and not (t.organization_id = any (p_admin))
             and t.table_id = v_tables
             and t.deleted_at is null
             and t.data ->> 'kept_for' = 'context'
             and (p_type_ids is null or t.id = any (p_type_ids))
           group by t.organization_id) o;
  perform platform.memo_k_put('custom.kernel_among_batch:' || p_me::text, v_among::text);
  with t0 as materialized (
    select t.organization_id as org, t.id
      from custom.record t
     where t.organization_id = any (p_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
       and (p_type_ids is null or t.id = any (p_type_ids))
  )
  select coalesce(array_agg(t0.id), '{}'::uuid[]),
         string_agg(case when not (t0.org = any (p_admin)) then t0.org::text || ':' || t0.id::text end, ',' order by t0.org, t0.id)
    into v_tids, v_pairs
    from t0
   where t0.org = any (p_admin)
      or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                      where not (t0.org = any (p_admin)) group by t0.org) o
                     cross join lateral custom.tables_listed_among(o.org, o.ids) v(v));
  perform platform.memo_k_drop('custom.kernel_among_batch:' || p_me::text);

  -- ── the scope types (custom.context_tree's t, restricted to the types asked) ──
  if p_mode in ('types', 'type_list') then
    -- 'type_list' (the first paint) asks no Record question at all: no pair is named, no scope_count.
    if p_mode = 'types' and v_pairs is not null then
      perform platform.memo_k_put('custom.qvi_pairs:' || p_me::text, v_pairs);
    end if;
    with t0 as materialized (
      select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
        from custom.record t
       where t.organization_id = any (p_orgs)
         and t.table_id = v_tables
         and t.deleted_at is null
         and t.data ->> 'kept_for' = 'context'
         and (p_type_ids is null or t.id = any (p_type_ids))
    ),
    t as materialized (
      select t0.* from t0 where t0.id = any (v_tids)
    ),
    vis as materialized (
      select t.org, t.id as tbl, v.v as id
        from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
       where p_mode = 'types' and not (t.org = any (p_admin))
      union all
      select t.org, t.id, r.id
        from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
       where p_mode = 'types' and t.org = any (p_admin)
    ),
    -- custom.context_tree answers a scope where a visible id is a live Record of its Table: the same join.
    cnt as materialized (
      select vis.tbl, count(*)::integer as n
        from vis
        join custom.record r
          on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id and r.deleted_at is null
       group by vis.tbl
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'organization_id', t.org,
             'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
             'name', t.data -> 'name', 'icon', t.data -> 'icon', 'color', t.data -> 'color',
             'slug', t.data -> 'slug', 'description', t.data -> 'description',
             'sort_order', t.data -> 'sort_order',
             'max_assignments_per_entity', t.data -> 'max_assignments_per_entity',
             'default_variable_keys', t.data -> 'default_variable_keys',
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           || case when p_mode = 'types' then jsonb_build_object('scope_count', coalesce(cnt.n, 0)) else '{}'::jsonb end
           order by coalesce((t.data ->> 'sort_order')::numeric, 0), t.data ->> 'label_plural', t.id), '[]'::jsonb)
      into v_types
      from t left join cnt on cnt.tbl = t.id;
    perform platform.memo_k_drop('custom.qvi_pairs:' || p_me::text);
    return jsonb_build_object('types', v_types);
  end if;

  -- ── STEP 2, THE RECORDS STEP (custom.context_tree's body from t to the scope objects, verbatim,
  -- restricted to the types asked) ──
  if v_pairs is not null then
    perform platform.memo_k_put('custom.qvi_pairs:' || p_me::text, v_pairs);
  end if;
  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (p_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
       and (p_type_ids is null or t.id = any (p_type_ids))
  ),
  t as materialized (
    select t0.* from t0 where t0.id = any (v_tids)
  ),
  flds as materialized (
    select f0.id, f0.organization_id, f0.data, f0.metadata
      from t t1
      join custom.record f0
        on f0.organization_id = t1.org
       and f0.data @> jsonb_build_object('entity_definition_id', t1.id::text)
       and f0.table_id = v_fields and f0.deleted_at is null
       and substr(f0.id::text, 15, 1) = '5'
  ),
  recs as materialized (
    select r0.id, r0.organization_id, r0.table_id, r0.data, r0.created_by, r0.created_at, r0.updated_at
      from custom.record r0
     where r0.organization_id = any ((select array_agg(distinct t2.org) from t t2)::uuid[])
       and r0.table_id = any ((select array_agg(t3.id) from t t3)::uuid[])
       and r0.deleted_at is null
  ),
  colf as materialized (
    select t.org, t.id as tbl, f.id as fid, f.data ->> 'key' as key,
           f.id = custom._ctx_id('scope-column-field', t.id::text, 'description') as is_desc,
           custom._ctx_setting_of(f.id, t.id, f.metadata -> 'moved_from' ->> 'note') as setting,
           f.data ->> 'type' as behavior,
           f.data ->> 'sensitivity' as sens,
           (exists (select 1 from iam.permissions p where p.resource_type = 'record' and p.resource_id = f.id)
            or coalesce(f.data ->> 'type', '') = 'formula'
            or exists (select 1 from custom.portal_principal pp
                        where pp.user_id = p_me and pp.organization_id = t.org)) as alone
      from t
      join flds f
        on f.organization_id = t.org
       and f.data ->> 'entity_definition_id' = t.id::text
  ),
  fgroup as materialized (
    select g.org, g.sens,
           iam.may_touch_field(p_me, g.rep, g.org, 'viewer'::public.permission_level, 'read') as viewer_reads
      from (select c.org, c.sens, min(c.fid::text)::uuid as rep
              from colf c
             where not c.alone and not (c.org = any (p_admin))
             group by c.org, c.sens) g
  ),
  shown as materialized (
    select colf.*
      from colf
      left join fgroup g on g.org = colf.org and g.sens is not distinct from colf.sens and not colf.alone
     where case when colf.org = any (p_admin) then true
                when g.viewer_reads then true
                when not colf.alone and g.viewer_reads is not null then
                  iam.may_touch_field(p_me, colf.fid, colf.org, custom.effective_level(p_me, colf.org, colf.tbl), 'read')
                when iam.may_touch_field(p_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(p_me, colf.fid, colf.org, custom.effective_level(p_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, jsonb_build_object('setting', s.setting, 'behavior', s.behavior)) from shown s
                      where s.org = t.org and s.tbl = t.id and s.setting is not null), '{}'::jsonb) as setting_keys
      from t
  ),
  vis as materialized (
    select t.org, t.id as tbl, v.v as id
      from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
     where not (t.org = any (p_admin))
    union all
    select t.org, t.id, r.id
      from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
     where t.org = any (p_admin)
  ),
  joined as materialized (
    -- custom.context_tree's own join of the scopes, first and unfiltered: a filter on the document here
    -- would let the planner push it into the Records' scan and walk them once per visible id.
    select r.id, r.organization_id, r.table_id, r.data, r.created_by, r.created_at, r.updated_at,
           c.visible, c.desc_key, c.setting_keys
      from vis
      join recs r
        on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
      join cols c on c.org = vis.org and c.id = vis.tbl
  ),
  matched as materialized (
    select j.*,
           -- search answers in the tree's own reading order: type by type, then the type's scopes
           coalesce((tt.data ->> 'sort_order')::numeric, 0) as t_sort, tt.data ->> 'label_plural' as t_label
      from joined j
      join t tt on tt.org = j.organization_id and tt.id = j.table_id
     where p_mode <> 'search'
        or (j.visible ? 'name' and (j.data ->> 'name') ilike v_pat escape '\')
  ),
  ordered as (
    select m.*,
           row_number() over (order by
             case when p_mode = 'search' then m.t_sort end,
             case when p_mode = 'search' then m.t_label end,
             case when p_mode = 'search' then m.table_id end,
             coalesce((m.data ->> 'sort_order')::numeric, 0), m.data ->> 'name', m.id) as rn,
           count(*) over () as total
      from matched m
  )
  select coalesce(max(o.total), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'scope_type_id', o.table_id, 'organization_id', o.organization_id,
             'name', case when o.visible ? 'name' then o.data -> 'name' end,
             'description', case when o.visible ? o.desc_key then o.data -> o.desc_key end,
             'slug', case when o.visible ? 'slug' then o.data -> 'slug' end,
             'sort_order', case when o.visible ? 'sort_order' then o.data -> 'sort_order' end,
             'parent_scope_id', o.data -> 'parent_id',
             'settings', coalesce((select jsonb_object_agg(s.value ->> 'setting', custom._ctx_setting_back(o.data -> s.key, s.value ->> 'behavior'))
                                     from jsonb_each(o.setting_keys) s
                                    where o.data ? s.key
                                      and jsonb_typeof(o.data -> s.key) <> 'null'), '{}'::jsonb),
             'created_by', o.created_by, 'created_at', o.created_at, 'updated_at', o.updated_at)
           order by o.rn)
           filter (where o.rn > greatest(coalesce(p_offset, 0), 0)
                     and (p_limit is null or o.rn <= greatest(coalesce(p_offset, 0), 0) + p_limit)), '[]'::jsonb)
    into v_total, v_scopes
    from ordered o;

  perform platform.memo_k_drop('custom.qvi_pairs:' || p_me::text);

  return jsonb_build_object('scopes', v_scopes, 'total', v_total);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_scope_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- THE SCOPE DOORS DECIDE WHO IS ASKING, IN THEIR OWN NAME (store-doors-decide, census 17): a person
  -- refused by custom.context_type_write hears "custom.context_type_write", never a helper's name.
  -- The one ladder (custom.assert_client_may_reach) decides; nothing else.
  perform custom.assert_client_may_reach(p_organization_id, p_door);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_archived_types(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_uid      uuid := auth.uid();
  v_tables   uuid := custom.table_kernel_id();
  v_cand     uuid[];
  v_level    public.permission_level;
  v_mask     jsonb;
  v_shown    text[];
  v_declared text[];
  v_rows     jsonb;
  v_counts   jsonb := '{}'::jsonb;   -- archived type id -> archived scopes the caller could see
  v_types    uuid[];    -- the archived types that hold an unquarantined archived Record
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return '[]'::jsonb;
  end if;
  -- STORE-READ-PERF-5 (2026-09-30). ONLY THE ARCHIVED TABLES THE CONTEXT SYSTEM KEPT ARE READ.
  -- This door used to page custom.read_records_archived over EVERY archived Table of the organization
  -- (200 a page, each row rendered: its derived values, the mask, the choice labels) and keep the
  -- ones whose document said kept_for = context. test@test.com's own workspace holds 1,313 archived
  -- Tables and no archived scope type: 7-30 s to answer []. The candidates are the archived,
  -- unquarantined kernel rows whose stored kept_for is context (a superset of what the old filter
  -- kept, which read the same key from the rendered document); none, and the answer is [].
  -- The Table decision is asked first, as the archive door asked it (the wall was asked above, in
  -- this door's own name).
  perform custom.assert_may_know_table(p_organization_id, v_tables, 'custom.context_archived_types');
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_cand
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_tables
     and r.deleted_at is not null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and r.data ->> 'kept_for' = 'context';
  if cardinality(v_cand) = 0 then
    return '[]'::jsonb;
  end if;
  -- Of the candidates, exactly what the archive door answers about them: its rows through the one
  -- ladder's own predicate for this Table at viewer (custom.visible_predicate_sql, the sentence the
  -- archive door writes into its WHERE), each document through the one read mask
  -- (custom.read_mask_for at the caller's level on the Table), custom.mask_document,
  -- custom.choice_render and custom.with_whole_value_pointers, in that order, as the door renders it.
  v_level := custom.effective_level(v_uid, p_organization_id, v_tables);
  v_mask := custom.read_mask_for(v_uid, p_organization_id, v_tables, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_shown
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'doc', custom.record_values_of(r), 'wv', r.data -> '_values',
             'ws', r.data -> '_sources', 'at', r.deleted_at)), '[]'::jsonb)
      from custom.record r
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.id = any (%3$L::uuid[])
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %4$s
  $q$,
    p_organization_id, v_tables, v_cand,
    custom.visible_predicate_sql(v_uid, p_organization_id, v_tables, 'viewer'::public.permission_level, 'r'))
  into v_rows;
  -- Each carries how many of its scopes were archived, which is what a restore brings back.
  -- Each carries how many of its scopes were archived, which is what a restore brings back.
  -- THE ARCHIVED SCOPES THE CALLER COULD SEE (lane 9 SCOPES-ON-THE-STORE, chair ruling 4, 2026-10-02):
  -- exactly the rows the data home's archive answers the caller for that Table. ONE CALL FOR EVERY TYPE
  -- (lane 9 flip, 2026-10-03): custom.count_records_archived(org, types, 'org') — the archive door's own
  -- statement in its count-only answer, one containment walk for all of them. A type with no unquarantined
  -- archived Record is 0 without asking; a Table the caller may not know is left out of the count door's
  -- answer and is 0 here — nothing there is theirs to bring back. With nobody signed in (a principal but no
  -- auth.uid()) every count is 0, as before.
  with t as (
    select distinct (p ->> 'id')::uuid as id from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) p
     where exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null
                      and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'))
  select coalesce(array_agg(t.id order by t.id), '{}'::uuid[]) into v_types from t;
  if v_uid is not null and cardinality(v_types) > 0 then
    select coalesce(jsonb_object_agg(c.table_id::text, c.n), '{}'::jsonb) into v_counts
      from custom.count_records_archived(p_organization_id, v_types, 'org') c;
  end if;
  return (
    select coalesce(jsonb_agg(z.x order by z.x ->> 'deleted_at' desc, z.x ->> 'id'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
                 'label_singular', d.doc -> 'label_singular', 'label_plural', d.doc -> 'label_plural',
                 'icon', d.doc -> 'icon', 'color', d.doc -> 'color',
                 'deleted_at', p -> 'at',
                 'archived_scope_count', coalesce((v_counts ->> (p ->> 'id'))::integer, 0)) as x
          from jsonb_array_elements(v_rows) p
          cross join lateral (
            select custom.with_whole_value_pointers(
                     custom.choice_render(p_organization_id, v_tables,
                       custom.mask_document(p -> 'doc', v_shown, v_mask -> 'notices', false,
                                            v_mask -> 'all_key_ids', v_declared)),
                     p -> 'wv', p -> 'ws', v_shown, false, v_mask -> 'all_key_ids') as doc) d
         where d.doc ->> 'kept_for' = 'context') z);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_items(p_scope_type_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_type_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;

  -- Each scope type opens in its own organization (read from the Table itself), decided in this
  -- door's name; the Fields come through custom.applicable_fields, the store's own Field door, which
  -- asks whether the caller may know the Table. A Field the scope door derived (the scope's own
  -- name / description / slug / sort-order columns, a settings key — a version-5 id from
  -- custom._ctx_id) was never a context item and is not answered.
  for v_grp in
    select t.organization_id as org, t.id as tbl
      from custom.record t
     where t.id = any (v_ids) and t.table_id = v_tables and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_items');
    -- STORE-READ-PERF-5: the Table list asked about this one Table (custom.tables_listed_among:
    -- query_visible_ids' own answer, restricted to it), not every Table of the organization.
    continue when not exists (select 1 from custom.tables_listed_among(v_grp.org, array[v_grp.tbl]) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'data', f.data, 'carried', f.metadata -> 'moved_from' -> 'carried',
               'created_by', f.created_by, 'created_at', f.created_at, 'updated_at', f.updated_at,
               'version', f.version)
             order by coalesce((f.data ->> 'sort')::numeric, 0), f.data ->> 'label', f.id)
        from custom.applicable_fields(v_grp.org, v_grp.tbl, null) f
       where f.deleted_at is null
         and substr(f.id::text, 15, 1) <> '5'), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_resolve(p_bindings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me           uuid;
  v_binding      jsonb;
  v_record_ids   uuid[] := '{}';
  v_records      jsonb := '{}'::jsonb;
  v_scope_map    jsonb := '{}'::jsonb;
  v_orgs         jsonb := '{}'::jsonb;
  v_unresolved   jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_rec          uuid;
  v_org          uuid;
  v_where        jsonb;
  v_wheres       jsonb;
  v_doc          jsonb;
  v_hidden       jsonb;
  v_values       jsonb;
  v_row          record;
  v_key          text;
  v_field        text;
  v_cell         jsonb;
  v_sens         text;
  v_hint         text;
  v_delivery     text;
  v_note         text;
  v_fresh        text;
  v_stale        text;
  v_verdict      jsonb;
  v_order        jsonb := '{}'::jsonb;
  v_ready        text[];
  v_pending      jsonb;
  v_index        int := 0;
  v_progress     boolean;
  v_dep          jsonb;
  v_blocked      boolean;
  -- SCOPES-D1 (lane 9): a value kept as a file, or still waiting for its file, is never handed cut
  v_raw          jsonb;
  v_cap          bigint;
  v_caps         jsonb := '{}'::jsonb;
  v_ac           jsonb;
begin
  -- THE PERSON FIRST. There is no organization argument any more: each record names its own
  -- organization (custom.where_id_opens reads it from the record), so a turn whose scopes live
  -- in two organizations — Brightline's task tagged to Harborline's app — reads each under its
  -- own, and the organization the person happens to be working in decides nothing.
  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'custom.context_resolve reads context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door reads the person from the session. The server calls this door acting as the person operating the agent.';
  end if;

  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
    raise exception 'custom.context_resolve was asked to resolve something that is not a list of bindings.'
      using errcode = '22004',
            hint = 'Pass a JSON array of {key, scope_id|record_id, field_key} objects. A turn with no context items passes [] and gets an empty answer.';
  end if;

  if jsonb_array_length(p_bindings) = 0 then
    return jsonb_build_object(
      'scope_records', '{}'::jsonb, 'records', '{}'::jsonb, 'organizations', '{}'::jsonb,
      'bindings', '[]'::jsonb, 'unresolved', '[]'::jsonb,
      'read_as', 'the person operating this agent',
      'through', 'custom.where_id_opens, then custom.read_record under the record''s own organization',
      'principal', v_me);
  end if;

  if exists (select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b) <> 'object') then
    raise exception 'custom.context_resolve was handed a list whose entries are not bindings.'
      using errcode = '22004',
            hint = 'Each entry is an object: {key, scope_id|record_id, field_key}. An array of strings or numbers is not a turn''s context cells.';
  end if;

  if jsonb_array_length(p_bindings) > 500 then
    raise exception 'custom.context_resolve was handed % bindings and the ceiling is 500.',
      jsonb_array_length(p_bindings)
      using errcode = '22003',
            hint = 'A turn addresses a handful of context cells. A list this long is a caller asking for a whole catalogue, which is a different door (custom.agent_context reads a Table).';
  end if;

  -- ── 1. EVERY DISTINCT RECORD THE TURN NAMES — the scope id IS the record id ─────────────
  select array_agg(distinct x) into v_record_ids from (
    select nullif(coalesce(nullif(b ->> 'record_id', ''), b ->> 'scope_id'), '')::uuid as x
      from jsonb_array_elements(p_bindings) b
  ) s where x is not null;

  -- ── 2. EACH ONE ASKED FOR THE PERSON, THEN READ ONCE UNDER ITS OWN ORGANIZATION ─────────
  -- STORE-READ-PERF-3: where each record opens, asked ONCE for the whole set (one lookup of their
  -- homes, the organization wall once per organization, the ladder once per class) — each answer
  -- exactly custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(v_record_ids);
  foreach v_rec in array coalesce(v_record_ids, array[]::uuid[]) loop
    -- custom.where_id_opens is the ONE answer to "which organization does this id live in, and
    -- may this person open it" (ROUTE-RESOLVER; ACCESS-IS-PERSONAL uses the same door). Null is
    -- "not given to you" and "not in the store" alike, on purpose: the store does not tell a
    -- guessed id from a real one. The unresolved row says both halves, and the turn's old value
    -- stays underneath (the fallback link), so nothing is dropped.
    v_where := v_wheres -> (v_rec::text);
    if v_where is null or v_where ->> 'kind' <> 'record' then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope is not a record you may open in the record store — it has not been shared with you, or it has not been copied into the store yet — so its fields resolve the way they always have (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;
    v_org := (v_where ->> 'organization_id')::uuid;
    v_orgs := v_orgs || jsonb_build_object(v_rec::text, v_org);

    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      -- THE DOOR'S OWN REFUSAL, CARRIED, NOT SWALLOWED.
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'sqlstate', sqlstate, 'reason', sqlerrm);
      continue;
    end;

    v_scope_map := v_scope_map || jsonb_build_object(v_rec::text, v_rec);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);
    v_values := '{}'::jsonb;
    -- SCOPES-D1: the record's own value stamps say which cell holds only the first words of a
    -- text kept as a file (or still waiting for its file); the organization's cap on one value
    -- handed to an agent is read once per organization, as custom.resolve_context reads it.
    select jsonb_build_object('_values', r.data -> '_values', '_sources', r.data -> '_sources')
      into v_raw
      from custom.record r where r.organization_id = v_org and r.id = v_rec;
    if not v_caps ? v_org::text then
      v_caps := v_caps || jsonb_build_object(v_org::text, custom.agent_context_value_cap(v_org));
    end if;
    v_cap := (v_caps ->> v_org::text)::bigint;

    begin
      for v_row in
        select * from custom.record_values_versioned(v_org, v_rec)
      loop
        v_ac := custom._ctx_agent_cell(v_doc, v_raw, v_row.field_key, v_org, v_rec, v_cap);
        v_values := v_values || jsonb_build_object(v_row.field_key, jsonb_build_object(
          'value',         v_ac -> 'value',
          'field_id',      v_row.field_id,
          'value_version', v_row.value_version,
          'written_at',    v_row.written_at,
          'absent_reason', v_row.absent_reason,
          'actor',         v_row.actor,
          'source',        v_row.source,
          'masked',        v_hidden ? v_row.field_key,
          'mask_reason',   v_hidden -> v_row.field_key ->> 'reason')
          || case when v_ac ? 'whole_value' then jsonb_build_object('whole_value', v_ac -> 'whole_value') else '{}'::jsonb end);
      end loop;
    exception when others then
      select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
               'value',         e.ac -> 'value',
               'field_id',      null,
               'value_version', null,
               'written_at',    null,
               'absent_reason', format('the store did not let this principal read value versions (%s) — the value is the read door''s and its version is unknown rather than guessed', sqlerrm),
               'masked',        v_hidden ? e.key,
               'mask_reason',   v_hidden -> e.key ->> 'reason')
               || case when e.ac ? 'whole_value' then jsonb_build_object('whole_value', e.ac -> 'whole_value') else '{}'::jsonb end), '{}'::jsonb)
        into v_values
        from (select j.key, custom._ctx_agent_cell(v_doc, v_raw, j.key, v_org, v_rec, v_cap) as ac
                from jsonb_each(v_doc - '_hidden' - '_alternates' - '_retired') j) e;
    end;

    v_records := v_records || jsonb_build_object(v_rec::text, v_values);
  end loop;

  -- ── 3. EVERY BINDING, WITH ITS TWO CEILINGS ───────────────────────────────────────────
  for v_binding in select b from jsonb_array_elements(p_bindings) b loop
    v_key   := v_binding ->> 'key';
    v_field := v_binding ->> 'field_key';
    -- THE SCOPE ID IS THE RECORD ID (CUT-4). No slug, no document key, no second identity.
    v_rec   := nullif(coalesce(nullif(v_binding ->> 'record_id', ''), v_binding ->> 'scope_id'), '')::uuid;

    if v_rec is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key,
        'reason', 'this binding names no scope and no record, so there is nothing to read for it (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not (v_records ? v_rec::text) then
      continue;  -- the record's own refusal is already in v_unresolved, with its sentence
    end if;

    -- AGT-7's SENSITIVITY CEILING. Delivery may not widen what sensitivity allows. A
    -- restricted field is not dropped — dropping a real value is worse — it is moved off
    -- the inline tier so the agent fetches it when it actually needs it.
    v_hint := lower(coalesce(nullif(btrim(v_binding ->> 'fetch_hint'), ''), 'always'));
    v_sens := lower(coalesce(nullif(btrim(v_binding ->> 'sensitivity'), ''), ''));
    v_note := null;
    v_delivery := case v_hint
                    when 'always' then 'inline'
                    when 'on_demand' then 'on_demand'
                    when 'lazy' then 'on_demand'
                    when 'batch_related' then 'on_demand'
                    else null
                  end;
    if v_delivery is null then
      v_delivery := 'inline';
      v_note := format('this field asks to be fetched %L, which is not a delivery this system knows; it is delivered inline rather than dropped', v_hint);
    end if;
    if v_delivery = 'inline' and v_sens in ('restricted', 'privileged', 'confidential') then
      v_delivery := 'on_demand';
      v_note := format('this field is %s, so it is never written into the prompt unasked — the agent fetches it when it needs it (AGT-7)', v_sens);
    end if;

    v_cell := v_records -> v_rec::text -> v_field;
    if v_cell is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key, 'record_id', v_rec,
        'reason', format('the record this field points at has no field %L you can read', v_field));
      continue;
    end if;

    -- §D's FRESHNESS CEILING. THE RULE IS NOT WRITTEN HERE ANY MORE — it is
    -- `custom.freshness_verdict`, the one implementation this door, the merge resolver and
    -- every screen that shows a value's age all read. What used to be eighteen lines of the
    -- same arithmetic is one call, and a second copy of it anywhere now fails
    -- `pnpm check:one-freshness-ceiling`.
    v_verdict := custom.freshness_verdict(
                   nullif(v_cell ->> 'written_at', '')::timestamptz,
                   nullif(v_binding ->> 'freshness_seconds', '')::numeric);
    v_fresh := v_verdict ->> 'freshness';
    v_stale := v_verdict ->> 'stale_note';

    v_out := v_out || (jsonb_build_object(
      'key',           v_key,
      'scope_id',      v_binding -> 'scope_id',
      'record_id',     v_rec,
      'field_key',     v_field,
      'field_id',      v_cell -> 'field_id',
      'value',         v_cell -> 'value',
      'value_version', v_cell -> 'value_version',
      'written_at',    v_cell -> 'written_at',
      'masked',        v_cell -> 'masked',
      'mask_reason',   v_cell -> 'mask_reason',
      'absent_reason', v_cell -> 'absent_reason',
      'delivery',      v_delivery,
      'delivery_note', v_note,
      'freshness',     v_fresh,
      'stale_note',    v_stale,
      -- CARRIED, and this is not decoration: the ordering step below reads `depends_on`
      -- off these rows. Leaving it out made `v_pending` a map of empty arrays, so every
      -- binding looked ready at once and the order was whatever `jsonb_object_keys`
      -- happened to answer — which the seat suite caught as `2 < 0`.
      'depends_on',    coalesce(v_binding -> 'depends_on', '[]'::jsonb))
      -- SCOPES-D1: a value kept as a file names its file (whole_value), so the store's client hands
      -- the whole text (matrx_records RecordStore.context_resolve) — never the first words alone.
      || case when v_cell ? 'whole_value' then jsonb_build_object('whole_value', v_cell -> 'whole_value') else '{}'::jsonb end);
  end loop;

  -- ── 4. `depends_on` ORDER, AND A CYCLE NAMED RATHER THAN LOOPED ───────────────────────
  -- DYN-9 belongs at SAVE time and this is not save time, so a circle written before anybody
  -- checked it must not end somebody's turn. The bindings inside it are ordered last, and the
  -- answer SAYS which keys made the circle so the panel can render the remedy.
  select coalesce(jsonb_object_agg(b ->> 'key', coalesce(b -> 'depends_on', '[]'::jsonb)), '{}'::jsonb)
    into v_pending
    from jsonb_array_elements(v_out) b;

  loop
    v_progress := false;
    v_ready := '{}';
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_blocked := false;
      for v_dep in select d from jsonb_array_elements(v_pending -> v_key) d loop
        if v_pending ? (v_dep #>> '{}') and (v_dep #>> '{}') <> v_key then
          v_blocked := true;
        end if;
      end loop;
      if not v_blocked then
        v_ready := v_ready || v_key;
      end if;
    end loop;
    exit when coalesce(array_length(v_ready, 1), 0) = 0;
    foreach v_key in array v_ready loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
      v_pending := v_pending - v_key;
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;

  if v_pending <> '{}'::jsonb then
    v_unresolved := v_unresolved || jsonb_build_object(
      'key', (select string_agg(k, ' -> ') from jsonb_object_keys(v_pending) k),
      'reason', 'these context fields depend on each other in a circle, so no order can satisfy them all. They are resolved last, in the order they were declared, and the circle is what to fix.');
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(b || jsonb_build_object('order_index', v_order -> (b ->> 'key'))
                            order by coalesce((v_order ->> (b ->> 'key'))::int, 2147483647)), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(v_out) b;


  return jsonb_build_object(
    'scope_records', v_scope_map,
    'records',       v_records,
    'organizations', v_orgs,
    'bindings',      v_out,
    'unresolved',    v_unresolved,
    'read_as',       'the person operating this agent',
    'through',       'custom.where_id_opens, then custom.read_record under the record''s own organization',
    'principal',     v_me);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_parent uuid;
  v_rec    custom.record;
  v_row    context.scopes;
  v_desc   text;
  v_cur    jsonb;
  v_sort   smallint;
  v_spec   jsonb;
  v_was    text;
  v_actor  text;
  v_label  text;
  v_did    text;
  v_heal   boolean := false;
  v_slug   text;
  v_place  smallint;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_scope_id is null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.context_scope_write');
    v_org := p_organization_id;
    -- public.create_scope's own check and sentence (ADMIN LANE: a platform admin manages any organization's scopes).
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    -- THE TYPE BELONGS TO THE SAME TENANT (0850): a context Table of this organization in the store
    -- (archived ones too, as create_scope's check counted them). One sentence for foreign and invented ids.
    if p_type_id is null or not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = p_type_id
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'create_scope: scope type not found in this organization' using errcode = '22023';
    end if;
    v_type := p_type_id;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record p
           join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
          where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record' and p.deleted_at is null) then
      raise exception 'create_scope: parent scope not found in this organization' using errcode = '22023';
    end if;
    -- THE NEXT PLACE AMONG ITS SIBLINGS (same type, same parent, archived ones counted), as create_scope.
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select coalesce(max(nullif(r.data ->> 'sort_order', '')::int), 0) + 1
         from custom.record r
        where r.organization_id = v_org and r.table_id = v_type and r.data_class = 'record'
          and ((v_parent is null and nullif(r.data ->> 'parent_id', '') is null)
               or r.data ->> 'parent_id' = v_parent::text))::smallint);
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      'name', s -> 'name', 'description', coalesce(s ->> 'description', ''),
      'settings', coalesce(s -> 'settings', '{}'::jsonb),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'name')),
      'sort_order', v_sort, 'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE SCOPE, BY ITS ID, FROM THE STORE: a Record of a context Table (archived ones too, as before).
    select r.* into v_rec
      from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where r.id = p_scope_id and r.data_class = 'record';
    v_org := v_rec.organization_id;
    v_type := v_rec.table_id;
    -- public.update_scope's own check and sentence.
    if v_org is null or not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized to update scope' using errcode = '42501',
              detail = jsonb_build_object('scope_id', p_scope_id)::text;
    end if;
    v_parent := nullif(v_rec.data ->> 'parent_id', '')::uuid;
    if s ? 'parent_scope_id' then
      -- A SCOPE MOVED UNDER ANOTHER (lane SCOPES-OLD-WRITERS), decided on the store: a live scope of the same
      -- organization, never the scope itself or one of its own descendants.
      v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
      if v_parent is not null and (
           v_parent = p_scope_id
           or not exists (select 1 from custom.record p
                            join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                                 and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
                           where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record'
                             and p.deleted_at is null)
           or exists (with recursive under as (
                        select c.id from custom.record c
                         where c.organization_id = v_org and c.data_class = 'record' and c.data ->> 'parent_id' = p_scope_id::text
                        union
                        select c.id from custom.record c join under u on c.data ->> 'parent_id' = u.id::text
                         where c.organization_id = v_org and c.data_class = 'record')
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope of this organization this scope can sit under.'
          using errcode = '22023',
                hint = 'A scope''s parent is another live scope of the same organization, and never the scope itself or one of its own children.';
      end if;
    end if;
    select f.data ->> 'key' into v_desc from custom.record f
     where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
    v_desc := coalesce(v_desc, 'description');
    v_cur := custom._ctx_scope_settings(v_org, v_type, v_rec.data);
    -- A RECORD COPIED BEFORE THE SCOPE'S SLUG AND SORT ORDER HAD A HOME IN THE STORE (lane SCOPES-STORE-HOMES)
    -- does not hold them yet; its old row still does. Such a scope is written old row first, once, and the
    -- store half takes those words from it (the write-through's order), so nothing it holds is rewritten.
    v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
    v_slug := custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug'));
    v_place := coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint);
    v_spec := jsonb_build_object(
      'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope's COALESCE did.
      'name', coalesce(nullif(s -> 'name', 'null'::jsonb), v_rec.data -> 'name'),
      'description', coalesce(s ->> 'description', v_rec.data ->> v_desc, ''),
      'settings', case when s ? 'settings' then coalesce(nullif(s -> 'settings', 'null'::jsonb), v_cur) else v_cur end,
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug')),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint, 0::smallint),
      'created_by', v_rec.created_by, 'deleted_at', v_rec.deleted_at);
  end if;

  -- THE PARENT RULE, in the old trigger's own class (P0001) and words (lane manager ruling H6): the refusal
  -- contract stays what it was. The store half asks the same rule again below and finds it holds.
  begin
    perform custom._ctx_scope_parent_holds(v_org, v_type, v_parent);
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'P0001';
  end;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old tables' follow trigger does not copy it again, and
  -- named in custom.context_door_row, so the store's side-effect twin holds this row back until step 4.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    if v_actor = '' then
      perform set_config('app.actor_system', 'custom.context_write_through', true);
    end if;
    perform set_config('custom.context_door_row', coalesce(v_id, p_scope_id)::text, true);
    perform custom._ctx_store_scope(v_org, v_type, coalesce(v_id, p_scope_id), v_spec);
    perform set_config('app.actor_system', v_actor, true);
  end if;
  -- The scope-door mark covers the store write only: the old row's own triggers may write other old rows (a
  -- provisioned value) that the follow must carry as before. The door's own image row stays named in
  -- custom.context_door_row through step 2, so the follow and the twin leave that one row to this door.
  perform custom._ctx_mark(v_was);
  perform set_config('custom.context_door_row', coalesce(v_id, p_scope_id)::text, true);

  -- 2. THE IMAGE: the old row, written with today's statements, so every old trigger and reader sees it.
  if p_scope_id is null then
    insert into context.scopes (id, organization_id, scope_type_id, parent_scope_id, name, description, settings,
                                slug, sort_order, created_by)
    values (v_id, v_org, v_type, v_parent, v_spec ->> 'name', v_spec ->> 'description',
            v_spec -> 'settings', v_spec ->> 'slug', v_sort, (select auth.uid()))
    returning * into v_row;
  else
    -- The image takes the store's words for every column the door writes (the store is the truth; a
    -- word only the old row held is overwritten by the Record's), so the two cannot drift apart here.
    update context.scopes sc
       set parent_scope_id = v_parent,
           name = v_spec ->> 'name',
           description = v_spec ->> 'description',
           settings = v_spec -> 'settings',
           slug = case when v_heal then coalesce(v_slug, sc.slug) else v_spec ->> 'slug' end,
           sort_order = case when v_heal then coalesce(v_place, sc.sort_order) else (v_spec ->> 'sort_order')::smallint end,
           updated_at = now()
     where sc.id = p_scope_id
    returning * into v_row;
  end if;
  if v_row.id is null then
    -- A scope only the store holds answers as update_scope always answered it (the store write above goes back
    -- with this refusal).
    raise exception 'not authorized to update scope' using errcode = '42501',
            detail = jsonb_build_object('scope_id', p_scope_id)::text;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', '', true);
  v_was := custom._ctx_mark('door');
  v_did := custom._ctx_store_scope(v_org, v_type, v_row.id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  -- 4. THE STORE'S OWN SIDE EFFECTS, AFTER THE OLD ROW'S (the order of the days the old row was the writer):
  -- the twin was held back for this row in step 1; when step 3 changed nothing it has not run, so it runs now.
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_row.id, v_type, case when p_scope_id is null then 'created' else 'updated' end)));
  end if;

  if p_scope_id is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_scope_write');
  end if;
  select t.data ->> 'label_singular' into v_label
    from custom.record t where t.organization_id = v_org and t.id = v_type;
  return custom._ctx_answer(v_org, v_row.id, to_jsonb(v_row) || jsonb_build_object('type_label', v_label));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scopes(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 1000 then
    raise exception 'custom.context_scopes answers at most 1000 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 1000 or fewer.';
  end if;

  -- WHERE EACH ID OPENS IS READ FROM THE OBJECT ITSELF (a scope is a Record of a context Table), never
  -- from the caller's working organization. Each organization is decided in this door's name: one the
  -- caller cannot reach answers nothing for its ids (the old RLS's answer), and every document comes
  -- through custom.read_records_by_ids — the one ladder and the one read mask.
  for v_grp in
    select r.organization_id as org, r.table_id as tbl, array_agg(r.id) as ids
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
     where r.id = any (v_ids) and r.deleted_at is null
     group by 1, 2
  loop
    -- A PLATFORM CONTEXT TABLE (custom.table_is_platform_context: a context Table of a global-readable system
    -- organization, e.g. Matrx System's tags) is read by everyone signed in whom the one ladder lets know the Table;
    -- the organization wall stands aside for this one read of this one Table (mx.platform_context_org, cleared right
    -- after). Every other Table keeps the organization wall.
    if custom.table_is_platform_context(v_grp.org, v_grp.tbl) then
      perform set_config('mx.platform_context_org', v_grp.org::text, true);
      begin
        -- the Table's own wall: the one ladder must let this person know the Table, or it answers nothing
        perform custom.assert_may_know_table(v_grp.org, v_grp.tbl, 'custom.context_scopes');
      exception when insufficient_privilege then
        perform set_config('mx.platform_context_org', '', true);
        continue;
      end;
    else
      continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
      perform custom.assert_client_may_reach(v_grp.org, 'custom.context_scopes');
      continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    end if;
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.ids, false) x
      )
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'name', d.document -> 'name',
               'description', d.document -> coalesce((select f.data ->> 'key' from custom.record f
                                  where f.organization_id = v_grp.org
                                    and f.id = custom._ctx_id('scope-column-field', v_grp.tbl::text, 'description')), 'description'),
               'slug', d.document -> 'slug', 'sort_order', d.document -> 'sort_order',
               'parent_scope_id', d.document -> 'parent_id',
               'settings', custom._ctx_scope_settings(v_grp.org, v_grp.tbl, d.document),
               'created_by', h.created_by, 'created_at', h.created_at, 'updated_at', h.updated_at,
               'scope_type', jsonb_build_object(
                 'id', t.id, 'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                 'icon', t.data -> 'icon', 'color', t.data -> 'color', 'slug', t.data -> 'slug')))
        from d
        join custom.record h on h.organization_id = v_grp.org and h.id = d.id
        join custom.record t on t.organization_id = v_grp.org and t.id = v_grp.tbl), '[]'::jsonb);
    perform set_config('mx.platform_context_org', '', true);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tag_copy_batch(p_organization_id uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_rows integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  g          record;
  v_rows     integer;
  v_phase    text := coalesce(p_cursor->>'phase', 'tags');
  v_t        uuid := nullif(p_cursor->>'target_id', '')::uuid;
  v_st       text := p_cursor->>'source_type';
  v_s        uuid := nullif(p_cursor->>'source_id', '')::uuid;
  v_after    uuid := nullif(p_cursor->>'after_id', '')::uuid;
  v_seen     integer := 0;
  v_next     jsonb;
  v_did      text;
  v_last_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := null;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy_batch: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  if v_phase not in ('tags', 'archive') then
    raise exception 'custom.context_tag_copy_batch: the cursor names phase %, which is neither tags nor archive', v_phase
      using errcode = '22023', hint = 'Pass null to start, then the "next" this function returned.';
  end if;
  v_rows := coalesce(p_rows, (platform.knob_resolve('context', 'follow_batch_rows', p_organization_id) #>> '{}')::integer, 10);
  v_rows := least(greatest(v_rows, 1), 1000);
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  if p_cursor is null then
    -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3), registered once per copy.
    insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
    select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
           'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
           || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
      from platform.association_types a
     where a.target_type = 'scope' and a.is_active
       and not exists (select 1 from platform.association_types t
                        where t.source_type = a.source_type and t.target_type = 'record')
    on conflict (source_type, target_type) do nothing;

    -- A scope whose copy Record has not landed yet waits for the copy (counted once, never guessed).
    select count(distinct a.id) into n_waiting
      from platform.associations a
      join context.scopes s on s.id = a.target_id
     where a.target_type = 'scope' and s.organization_id = p_organization_id
       and not exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id and r.id = a.target_id
                          and r.data_class = 'record');
  end if;

  if v_phase = 'tags' then
    -- A NEW TAG'S REACHABILITY REFRESH IS DEFERRED to platform.reachability_flush (1381): this
    -- transaction only, trusted backend only; a new edge conveys nothing until it is flushed.
    perform platform.reachability_defer_begin();
    for g in
      select distinct x.target_id, x.source_type, x.source_id
        from platform.associations x
        join context.scopes s on s.id = x.target_id
       where x.target_type = 'scope'
         and s.organization_id = p_organization_id
         and (v_t is null or (x.target_id, x.source_type, x.source_id) > (v_t, v_st, v_s))
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = x.target_id
                        and r.data_class = 'record')
       order by x.target_id, x.source_type, x.source_id
       limit v_rows
    loop
      v_seen := v_seen + 1;
      v_t := g.target_id; v_st := g.source_type; v_s := g.source_id;
      begin
        -- ONE BODY FOR ONE TAG (SCOPES-WRITE-THROUGH): the per-edge write-through calls the same.
        v_did := custom._ctx_store_tag(p_organization_id, g.source_type, g.source_id, g.target_id);
        case v_did
          when 'made' then n_made := n_made + 1;
          when 'revived' then n_revived := n_revived + 1;
          when 'updated' then n_updated := n_updated + 1;
          when 'current' then n_current := n_current + 1;
          when 'archived' then n_archived := n_archived + 1;
          when 'same_edge_already_there' then n_same := n_same + 1;
          else null;
        end case;
      exception
        when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
          -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED (D3).
          n_refused := n_refused + 1;
          if jsonb_array_length(v_refused) < 20 then
            v_refused := v_refused || jsonb_build_array(jsonb_build_object(
              'pair', g.source_type || ' -> record',
              'source_id', g.source_id,
              'scope_id', g.target_id,
              'sqlstate', sqlstate,
              'says', left(split_part(sqlerrm, E'\n', 1), 300)));
          end if;
      end;
    end loop;
    if v_seen = v_rows then
      v_next := jsonb_build_object('phase', 'tags', 'target_id', v_t, 'source_type', v_st, 'source_id', v_s);
    else
      v_next := jsonb_build_object('phase', 'archive');
    end if;
  else
    -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
    with pick as (
      select t.id
        from platform.associations t
       where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
         and (v_after is null or t.id > v_after)
         and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       order by t.id
       limit v_rows),
    gone as (
      update platform.associations t
         set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
        from pick
       where t.id = pick.id
         and not exists (select 1 from platform.associations x
                          where x.target_type = 'scope' and x.target_id = t.target_id
                            and x.source_type = t.source_type and x.source_id = t.source_id)
      returning 1)
    select (select count(*) from pick), (select max(id::text)::uuid from pick), (select count(*) from gone)
      into v_seen, v_last_id, n_archived;
    v_next := case when v_seen = v_rows then jsonb_build_object('phase', 'archive', 'after_id', v_last_id) end;
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id, 'phase', v_phase, 'rows', v_rows, 'seen', v_seen,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused, 'next', v_next);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- RETIRED AS A ONE-TRANSACTION DOOR (lane FOLLOW-BATCH-2). Copying a whole organization's tags in
  -- the caller's transaction holds the sign-in table (auth.users, every copied tag's created_by) until
  -- that transaction commits: minutes for a large organization. A SECURITY DEFINER function cannot
  -- commit between batches, so this door refuses and names the one that can be committed per step.
  raise exception 'custom.context_tag_copy copies a whole organization in one transaction, which holds the sign-in table until it commits, so it no longer runs'
    using errcode = '0A000',
          detail = format('Organization %s: nothing was copied.', coalesce(p_organization_id::text, '(none named)')),
          hint = 'Call custom.context_tag_copy_batch(organization_id, cursor) and COMMIT after each call, passing back the "next" cursor it returns until it is null, then platform.reachability_flush(5) in short transactions until it returns less than 5. The context follow (aidream matrx_records.movers.context_follow) does exactly that; a new edit to any of the organization''s scopes wakes it.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
  v_org uuid;
  v_ids uuid[] := coalesce(p_scope_ids, '{}'::uuid[]);
  v_bad jsonb;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): NOTHING FAILS SILENTLY. Every id must be a scope of an
  -- organization the caller belongs to, or the whole set is refused before anything is written. One
  -- sentence for a null id, an invented id, a store-only Value and another organization's scope, so the
  -- refusal tells no one which ids exist (the 0749 rule). An anonymous call is left to
  -- set_entity_scopes, which refuses it in its own words. Archived scopes pass, as before.
  if auth.uid() is not null then
    select jsonb_agg(x.id order by x.ord) into v_bad
      from unnest(v_ids) with ordinality x(id, ord)
     where x.id is null
        or not exists (select 1
                         from context.scopes s
                         join iam.organization_member om
                           on om.organization_id = s.organization_id and om.user_id = auth.uid()
                        where s.id = x.id);
    if v_bad is not null then
      raise exception 'One of those scopes is not one you can tag with. Nothing was saved.'
        using errcode = '42501',
              detail = jsonb_build_object('scope_ids', v_bad)::text,
              hint = 'Each id must be a scope of an organization you belong to.';
    end if;
  end if;

  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, v_ids));
  -- set_entity_scopes has decided (editor on the record, a member of every scope's organization); the one
  -- ladder then answers for this door by its own name for each organization a tag belongs to.
  for v_org in select distinct s.organization_id from context.scopes s where s.id = any(v_ids) loop
    perform custom.assert_client_may_reach(v_org, 'custom.context_tags_set');
  end loop;
  return jsonb_build_object('ok', true, 'row', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_template_define(p_organization_id uuid, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types    jsonb := p_definition -> 'scope_types';
  v_n        int;
  v_keys     text[] := '{}';
  v_made     jsonb := '{}'::jsonb;   -- the definition's key of a type -> the id it was made with
  v_created  jsonb := '[]'::jsonb;
  v_items    int := 0;
  v_t        jsonb;
  v_f        jsonb;
  v_i        int;
  v_j        int;
  v_key      text;
  v_parent   text;
  v_type_id  uuid;
  v_progress boolean;
  v_ftype    text;
  v_spec     jsonb;
begin
  if p_organization_id is null then
    raise exception 'A template is applied to an organization, and none was named.' using errcode = '22004';
  end if;
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_define');
  if jsonb_typeof(v_types) is distinct from 'array' or jsonb_array_length(v_types) = 0 then
    raise exception 'A template lists the scope types it makes (scope_types), and this one lists none.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_types);

  -- EVERY TYPE HAS ITS TWO NAMES, EVERY FIELD ITS KEY AND LABEL, EVERY KEY ONCE — said before anything is made.
  for v_i in 0 .. v_n - 1 loop
    v_t := v_types -> v_i;
    if nullif(btrim(v_t ->> 'singular'), '') is null or nullif(btrim(v_t ->> 'plural'), '') is null then
      raise exception 'Every scope type in a template has a singular and a plural name; type % of this one does not.', v_i + 1
        using errcode = '22023';
    end if;
    for v_f in select e from jsonb_array_elements(coalesce(v_t -> 'fields', '[]'::jsonb)) e loop
      if nullif(btrim(v_f ->> 'key'), '') is null or nullif(btrim(v_f ->> 'display_name'), '') is null then
        raise exception 'Every field in a template has a key and a name; one field of % does not.', v_t ->> 'plural'
          using errcode = '22023';
      end if;
    end loop;
    v_key := coalesce(nullif(v_t ->> 'key', ''), '#' || v_i::text);
    if v_key = any (v_keys) then
      raise exception 'Two scope types in this template share the key %; each type''s key is its own.', v_key using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
  end loop;

  -- THE TYPES, A PARENT BEFORE ITS CHILDREN, each through custom.context_type_write.
  loop
    v_progress := false;
    for v_i in 0 .. v_n - 1 loop
      v_key := v_keys[v_i + 1];
      continue when v_made ? v_key;
      v_t := v_types -> v_i;
      v_parent := nullif(v_t ->> 'parent_key', '');
      -- A parent the template does not define is no parent (as public.apply_template_definition did).
      if v_parent is not null and not (v_parent = any (v_keys)) then
        v_parent := null;
      end if;
      continue when v_parent is not null and not (v_made ? v_parent);
      v_type_id := (custom.context_type_write(p_organization_id, null, jsonb_strip_nulls(jsonb_build_object(
                      'label_singular', v_t ->> 'singular',
                      'label_plural', v_t ->> 'plural',
                      'parent_type_id', case when v_parent is not null then v_made ->> v_parent end,
                      'icon', coalesce(nullif(v_t ->> 'icon', ''), 'folder'),
                      'description', coalesce(v_t ->> 'description', ''),
                      'sort_order', coalesce(nullif(v_t ->> 'sort_order', '')::int, v_i),
                      'max_assignments', nullif(v_t ->> 'max_assignments_per_entity', ''),
                      'color', nullif(v_t ->> 'color', ''),
                      'slug', nullif(v_t ->> 'slug', '')))) -> 'row' ->> 'id')::uuid;
      v_made := v_made || jsonb_build_object(v_key, v_type_id::text);
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;
  if (select count(*) from jsonb_object_keys(v_made)) < v_n then
    raise exception 'The scope types of this template name each other as parents in a circle (%), so none of them can be made first.',
      (select string_agg(k, ', ') from unnest(v_keys) k where not (v_made ? k))
      using errcode = '22023';
  end if;

  -- THE FIELDS, each through custom.context_item_write.
  for v_i in 0 .. v_n - 1 loop
    v_t := v_types -> v_i;
    v_type_id := (v_made ->> v_keys[v_i + 1])::uuid;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_type_id, 'key', v_t ->> 'key', 'label_singular', v_t ->> 'singular', 'label_plural', v_t ->> 'plural'));
    v_j := 0;
    for v_f in select e from jsonb_array_elements(coalesce(v_t -> 'fields', '[]'::jsonb)) e loop
      v_ftype := coalesce(nullif(v_f ->> 'value_type', ''), 'string');
      v_spec := jsonb_strip_nulls(jsonb_build_object(
        'key', v_f ->> 'key', 'display_name', v_f ->> 'display_name',
        'description', coalesce(v_f ->> 'description', ''), 'value_type', v_ftype,
        'category', nullif(v_f ->> 'category', ''),
        'sort_order', coalesce(nullif(v_f ->> 'sort_order', '')::int, v_j),
        'fetch_hint', coalesce(nullif(v_f ->> 'fetch_hint', ''), 'on_demand'),
        'sensitivity', coalesce(nullif(v_f ->> 'sensitivity', ''), 'internal'),
        'tags', case when jsonb_typeof(v_f -> 'tags') = 'array' then v_f -> 'tags' end));
      if v_ftype = 'reference' then
        -- A REFERENCE FIELD POINTS AT A SCOPE: of the type its reference_type_key names, else of its
        -- own type (every business template's "Reports To" is another team member).
        v_spec := v_spec || jsonb_build_object(
          'allowed_reference_types', '["scope"]'::jsonb,
          'allowed_scope_type_ids', jsonb_build_array(coalesce(v_made ->> nullif(v_f ->> 'reference_type_key', ''), v_type_id::text)));
      end if;
      perform custom.context_item_write(null, v_type_id, v_spec);
      v_items := v_items + 1;
      v_j := v_j + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'scope_types_created', v_created,
    'context_items_count', v_items,
    'writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tree_search(p_organization_ids uuid[], p_query text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_orgs  uuid[];
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
  v_q     text := btrim(coalesce(p_query, ''));
  v_lim   integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME — exactly as custom.context_tree does.
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_search');
  end loop;
  if v_q = '' then
    return jsonb_build_object('scopes', '[]'::jsonb, 'total', 0);
  end if;
  return custom._ctx_tree_part(v_me, v_orgs, v_admin, 'search', null, v_q, 0, v_lim);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tree_type_scopes(p_scope_type_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_lim   integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_part  jsonb;
  v_total integer;
begin
  -- The type's organization is read from the type itself (never the caller's working organization);
  -- a type that is not a live scope Table answers nothing, the same answer as a type she cannot see.
  select t.organization_id into v_org
    from custom.record t
   where t.id = p_scope_type_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context';
  if v_org is null then
    return jsonb_build_object('scopes', '[]'::jsonb, 'total', 0, 'offset', v_off, 'next_offset', null);
  end if;
  -- THE DOOR DECIDES, IN ITS OWN NAME, exactly as custom.context_tree decides the type's organization.
  if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
    v_admin := array[v_org];
  else
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_type_scopes');
  end if;
  v_part := custom._ctx_tree_part(v_me, array[v_org], v_admin, 'scopes', array[p_scope_type_id], null, v_off, v_lim);
  v_total := (v_part ->> 'total')::integer;
  return v_part || jsonb_build_object(
    'offset', v_off,
    'next_offset', case when v_off + v_lim < v_total then v_off + v_lim end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tree_types(p_organization_ids uuid[], p_with_counts boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_orgs  uuid[];
  v_org   uuid;
  v_admin uuid[] := '{}'::uuid[];
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME — exactly as custom.context_tree does.
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree_types');
  end loop;
  return custom._ctx_tree_part(v_me, v_orgs, v_admin, case when coalesce(p_with_counts, true) then 'types' else 'type_list' end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tree(p_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_orgs   uuid[];
  v_org    uuid;
  v_admin  uuid[] := '{}'::uuid[];
  v_types  jsonb := '[]'::jsonb;
  v_scopes jsonb := '[]'::jsonb;
  -- STORE-READ-PERF-6
  v_among  jsonb;
  v_tids   uuid[];
  v_pairs  text;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide): every organization named
  -- is one the caller may reach, or the call is refused here naming this door (42501) — never an
  -- empty tree that reads like "no scopes here".
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    -- THE ADMIN LANE (parity with the platform_admin_select policies the old scope tables carry): on
    -- a request from /administration/** (public.is_platform_admin() is true only with the admin-lane
    -- header, for a platform admin) an organization the admin is not a member of is read whole,
    -- for the scope console. Everyone else, and every user page, meets the wall.
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree');
  end loop;
  if v_me is null or cardinality(v_orgs) = 0 then
    return jsonb_build_object('types', v_types, 'scopes', v_scopes);
  end if;

  -- THE TWO-STEP SHAPE (SCOPES-CUTOVER-PLAN E7). Step 1: the scope types of these organizations —
  -- the live Tables the context system keeps — that the caller sees on the one ladder (asked only
  -- for organizations that keep a scope type at all). Step 2: their live Records the caller sees,
  -- by the (organization_id, table_id) index, and of each only the columns the caller may read.
  -- STORE-READ-PERF-6 (2026-10-01): STEP 1 FIRST, ON ITS OWN, SO THE READS BELOW CAN BE ASKED FOR ALL
  -- ORGANIZATIONS AT ONCE. The same Tables as before: the admin lane's whole, and of the others the ones
  -- custom.tables_listed_among keeps — with every organization and its scope Tables named in the
  -- statement memo first, so the one ladder's Table walk is asked once for all of them
  -- (custom.query_visible_ids' among path), not once per organization. Then the (organization, Table)
  -- pairs the records step reads are named the same way, so custom.query_visible_ids and
  -- custom.read_door_carried_ids answer them all in one pass. Both names are dropped when the tree is built.
  select coalesce(jsonb_object_agg(o.org, o.ids), '{}'::jsonb) into v_among
    from (select t.organization_id as org, jsonb_agg(t.id order by t.id) as ids
            from custom.record t
           where t.organization_id = any (v_orgs)
             and not (t.organization_id = any (v_admin))
             and t.table_id = v_tables
             and t.deleted_at is null
             and t.data ->> 'kept_for' = 'context'
           group by t.organization_id) o;
  perform platform.memo_k_put('custom.kernel_among_batch:' || v_me::text, v_among::text);
  with t0 as materialized (
    select t.organization_id as org, t.id
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  )
  select coalesce(array_agg(t0.id), '{}'::uuid[]),
         string_agg(case when not (t0.org = any (v_admin)) then t0.org::text || ':' || t0.id::text end, ',' order by t0.org, t0.id)
    into v_tids, v_pairs
    from t0
   where t0.org = any (v_admin)
      -- STORE-READ-PERF-5: the Table list asked among these scope Tables only
      -- (custom.tables_listed_among: query_visible_ids' own answer, restricted to them).
      or t0.id in (select v.v from (select t0.org, array_agg(t0.id) as ids from t0
                                      where not (t0.org = any (v_admin)) group by t0.org) o
                     cross join lateral custom.tables_listed_among(o.org, o.ids) v(v));
  perform platform.memo_k_drop('custom.kernel_among_batch:' || v_me::text);
  if v_pairs is not null then
    perform platform.memo_k_put('custom.qvi_pairs:' || v_me::text, v_pairs);
  end if;

  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  ),
  t as materialized (
    select t0.* from t0 where t0.id = any (v_tids)
  ),
  -- The scope's own columns (name, description, slug, sort order) and each settings key are Fields
  -- the scope door derived on its Table (version-5 ids from custom._ctx_id). Each one is answered only
  -- where the one field decision (iam.may_touch_field, the step custom.read_mask_for takes for every
  -- Field) lets the caller read it: asked at viewer, the least a person who sees the Record holds,
  -- and — only where viewer may not — again at the caller's own level on the Table.
  -- STORE-READ-PERF-4: every column Field of these organizations, and every live Record of these
  -- Tables, read in ONE pass each (the same rows the per-Table and per-id lookups found).
  flds as materialized (
    -- found through the store's GIN index on the document: a Field whose entity_definition_id is
    -- this Table's id holds exactly that string there, so containment finds exactly those rows.
    select f0.id, f0.organization_id, f0.data, f0.metadata
      from t t1
      join custom.record f0
        on f0.organization_id = t1.org
       and f0.data @> jsonb_build_object('entity_definition_id', t1.id::text)
       and f0.table_id = v_fields and f0.deleted_at is null
       and substr(f0.id::text, 15, 1) = '5'
  ),
  recs as materialized (
    select r0.id, r0.organization_id, r0.table_id, r0.data, r0.created_by, r0.created_at, r0.updated_at
      from custom.record r0
     where r0.organization_id = any ((select array_agg(distinct t2.org) from t t2)::uuid[])
       and r0.table_id = any ((select array_agg(t3.id) from t t3)::uuid[])
       and r0.deleted_at is null
  ),
  colf as materialized (
    select t.org, t.id as tbl, f.id as fid, f.data ->> 'key' as key,
           f.id = custom._ctx_id('scope-column-field', t.id::text, 'description') as is_desc,
           custom._ctx_setting_of(f.id, t.id, f.metadata -> 'moved_from' ->> 'note') as setting,
           f.data ->> 'type' as behavior,
           f.data ->> 'sensitivity' as sens,
           -- STORE-READ-PERF-4: the ONE field decision reads a Field through its sensitivity, a grant
           -- naming it, the formula inputs it reads, and (for a portal principal of the organization)
           -- the portal's field list. A Field with none of the last three answers like every other
           -- Field of its organization and sensitivity, so the decision is asked once for them all;
           -- every other Field is asked on its own, exactly as before.
           (exists (select 1 from iam.permissions p where p.resource_type = 'record' and p.resource_id = f.id)
            or coalesce(f.data ->> 'type', '') = 'formula'
            or exists (select 1 from custom.portal_principal pp
                        where pp.user_id = v_me and pp.organization_id = t.org)) as alone
      from t
      join flds f
        on f.organization_id = t.org
       and f.data ->> 'entity_definition_id' = t.id::text
  ),
  fgroup as materialized (
    select g.org, g.sens,
           iam.may_touch_field(v_me, g.rep, g.org, 'viewer'::public.permission_level, 'read') as viewer_reads
      from (select c.org, c.sens, min(c.fid::text)::uuid as rep
              from colf c
             where not c.alone and not (c.org = any (v_admin))
             group by c.org, c.sens) g
  ),
  shown as materialized (
    select colf.*
      from colf
      left join fgroup g on g.org = colf.org and g.sens is not distinct from colf.sens and not colf.alone
     where case when colf.org = any (v_admin) then true
                when g.viewer_reads then true
                when not colf.alone and g.viewer_reads is not null then
                  iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read')
                when iam.may_touch_field(v_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           -- The description column answers to scope_description on a Table with an item of that key.
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, jsonb_build_object('setting', s.setting, 'behavior', s.behavior)) from shown s
                      where s.org = t.org and s.tbl = t.id and s.setting is not null), '{}'::jsonb) as setting_keys
      from t
  ),
  vis as materialized (
    select t.org, t.id as tbl, v.v as id
      from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
     where not (t.org = any (v_admin))
    union all
    select t.org, t.id, r.id
      from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
     where t.org = any (v_admin)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', t.id, 'organization_id', t.org,
                'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                'name', t.data -> 'name', 'icon', t.data -> 'icon', 'color', t.data -> 'color',
                'slug', t.data -> 'slug', 'description', t.data -> 'description',
                'sort_order', t.data -> 'sort_order',
                'max_assignments_per_entity', t.data -> 'max_assignments_per_entity',
                'default_variable_keys', t.data -> 'default_variable_keys',
                'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
              order by coalesce((t.data ->> 'sort_order')::numeric, 0), t.data ->> 'label_plural', t.id)
                from t), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.id, 'scope_type_id', r.table_id, 'organization_id', r.organization_id,
                'name', case when c.visible ? 'name' then r.data -> 'name' end,
                'description', case when c.visible ? c.desc_key then r.data -> c.desc_key end,
                'slug', case when c.visible ? 'slug' then r.data -> 'slug' end,
                'sort_order', case when c.visible ? 'sort_order' then r.data -> 'sort_order' end,
                'parent_scope_id', r.data -> 'parent_id',
                'settings', coalesce((select jsonb_object_agg(s.value ->> 'setting', custom._ctx_setting_back(r.data -> s.key, s.value ->> 'behavior'))
                                        from jsonb_each(c.setting_keys) s
                                       where r.data ? s.key
                                         and jsonb_typeof(r.data -> s.key) <> 'null'), '{}'::jsonb),
                'created_by', r.created_by, 'created_at', r.created_at, 'updated_at', r.updated_at)
              order by coalesce((r.data ->> 'sort_order')::numeric, 0), r.data ->> 'name', r.id)
                from vis
                join recs r
                  on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
                join cols c on c.org = vis.org and c.id = vis.tbl), '[]'::jsonb)
    into v_types, v_scopes;
  perform platform.memo_k_drop('custom.qvi_pairs:' || v_me::text);

  return jsonb_build_object('types', v_types, 'scopes', v_scopes);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid := p_organization_id;
  v_id     uuid;
  v_parent uuid;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_keys   text[];
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
    -- public.create_scope_type's own check and sentences.
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = v_parent
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'create_scope_type: parent scope type not found in this organization' using errcode = '22023';
    end if;
    v_id := pg_catalog.gen_random_uuid();
    v_keys := coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      'label_singular', s -> 'label_singular', 'label_plural', s -> 'label_plural',
      'icon', coalesce(s ->> 'icon', 'folder'), 'description', coalesce(s ->> 'description', ''),
      'color', coalesce(s ->> 'color', ''), 'sort_order', coalesce((s ->> 'sort_order')::smallint, 0::smallint),
      'max_assignments_per_entity', (s ->> 'max_assignments')::smallint, 'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'label_plural')),
      'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE TYPE, BY ITS ID, FROM THE STORE: a live context Table (update_scope_type's "active" type).
    select t.* into v_t from custom.record t
     where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_cur := custom.scope_type_row_of(v_t);
    v_parent := nullif(v_cur ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
      -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS), decided on the store.
      perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
      if s ? 'parent_type_id' then
        v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
      end if;
      if s ? 'parent_type_id' and v_parent is not null and (
           v_parent = p_type_id
           or not exists (select 1 from custom.record st
                           where st.organization_id = v_org and st.id = v_parent and st.table_id = custom.table_kernel_id()
                             and st.data ->> 'kept_for' = 'context' and st.deleted_at is null)
           or exists (with recursive under as (
                        select st.id from custom.record st
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id()
                           and st.data ->> 'parent_type_id' = p_type_id::text
                        union
                        select st.id from custom.record st join under u on st.data ->> 'parent_type_id' = u.id::text
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id())
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope type of this organization this type can sit under.'
          using errcode = '22023',
                hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
      end if;
    end if;
    v_keys := coalesce(array(select jsonb_array_elements_text(v_cur -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', p_type_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope_type's COALESCE did (never a raw 23502).
      'label_singular', coalesce(nullif(s -> 'label_singular', 'null'::jsonb), v_cur -> 'label_singular'),
      'label_plural', coalesce(nullif(s -> 'label_plural', 'null'::jsonb), v_cur -> 'label_plural'),
      'icon', coalesce(nullif(s -> 'icon', 'null'::jsonb), v_cur -> 'icon'),
      'description', coalesce(nullif(s -> 'description', 'null'::jsonb), v_cur -> 'description'),
      'color', coalesce(nullif(s -> 'color', 'null'::jsonb), v_cur -> 'color'),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, (v_cur ->> 'sort_order')::smallint),
      -- A limit named is the limit (a null one clears it — that call takes the parent/limit path above, as
      -- before); a limit not named stays.
      'max_assignments_per_entity', case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                         else (v_cur ->> 'max_assignments_per_entity')::smallint end,
      'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_cur ->> 'slug')),
      'created_by', v_t.created_by, 'deleted_at', null);
  end if;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old table's follow trigger does not copy it again.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', coalesce(v_id, p_type_id)::text, true);
  perform custom._ctx_store_type(v_org, coalesce(v_id, p_type_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  -- The scope-door mark covers the store write only; the image row stays named in custom.context_door_row
  -- through step 2, so the follow and the twin leave that one row to this door and carry every other.
  perform custom._ctx_mark(v_was);

  -- 2. THE IMAGE: the old row with the store's words.
  if p_type_id is null then
    insert into context.scope_types (id, organization_id, parent_type_id, label_singular, label_plural, icon, description,
                                     sort_order, max_assignments_per_entity, default_variable_keys, color, slug)
    values (v_id, v_org, v_parent, v_spec ->> 'label_singular', v_spec ->> 'label_plural', v_spec ->> 'icon',
            v_spec ->> 'description', (v_spec ->> 'sort_order')::smallint,
            (v_spec ->> 'max_assignments_per_entity')::smallint, v_keys, v_spec ->> 'color', v_spec ->> 'slug')
    returning * into v_img;
  else
    update context.scope_types t
       set parent_type_id = v_parent,
           label_singular = v_spec ->> 'label_singular',
           label_plural = v_spec ->> 'label_plural',
           icon = v_spec ->> 'icon',
           description = v_spec ->> 'description',
           sort_order = (v_spec ->> 'sort_order')::smallint,
           max_assignments_per_entity = (v_spec ->> 'max_assignments_per_entity')::smallint,
           color = v_spec ->> 'color',
           slug = v_spec ->> 'slug',
           updated_at = now()
     where t.id = p_type_id
    returning * into v_img;
    if v_img.id is null then
      -- A type only the store holds answers as update_scope_type always answered it (the store write above
      -- goes back with this refusal).
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', '', true);
  v_was := custom._ctx_mark('door');
  v_did := custom._ctx_store_type(v_org, v_img.id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  -- 4. THE STORE'S OWN SIDE EFFECTS, AFTER THE OLD ROW'S (the order of the days the old row was the writer):
  -- the twin was held back for this row in step 1; when step 3 changed nothing it has not run, so it runs now.
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_img.id, custom.table_kernel_id(), case when p_type_id is null then 'created' else 'updated' end)));
  end if;

  if p_type_id is not null and not (s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null')) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(v_org, v_img.id, to_jsonb(v_img));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_values(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
  -- SCOPES-D2 (lane 9): the Table list asked once per organization, for the Tables of this call
  v_todo   jsonb := '[]'::jsonb;
  v_among  jsonb;
  v_listed text[] := '{}'::text[];   -- 'organization:Table' (a record id is unique only within its organization)
  v_g      jsonb;
  v_o      text;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'custom.context_values answers at most 200 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 200 or fewer.';
  end if;


  -- A value is a key of the scope's Record document; the document comes through
  -- custom.read_records_by_ids (the one ladder, the one read mask), so a key the caller may not see
  -- is simply absent. Beside each value: its version, when it was set, the source it came from and
  -- the old value id the copy carried (the Record's own value stamps).
  --
  -- SCOPES-D2 (lane 9, 2026-10-02): ONLY THE RECORDS THAT CAN HOLD A VALUE ARE READ. A scope answers
  -- a row here only for a value Field of its Table (a Field that is not one of the scope's own
  -- columns — those carry v5 ids) whose key its document holds, non-null. Most scopes hold none (a
  -- member's 683 scopes hold 19 values), yet every one was read through the ladder and the mask.
  -- So a record goes to custom.read_records_by_ids only when its stored data could produce such a
  -- row: a non-null value under one of those keys, or a `_computed` / `_derived` block, or its Table
  -- has a Field worked out at read time (lookup / rollup / formula). Anything else can only produce
  -- nothing, so leaving it out changes no answer (scopesd1d2_same_answer.mjs: memos on and off, both
  -- seats, hashed before and after). The wall is still met for every organization asked about, in the
  -- same order, before anything is read. Then the Table list is asked once per organization for the
  -- Tables this call reads (custom.tables_listed_among: query_visible_ids' answer restricted to them),
  -- with every organization and its Tables named in the statement memo first
  -- ('custom.kernel_among_batch:<person>', as custom.context_tree names them — STORE-READ-PERF-6), so
  -- the one ladder's Table walk is asked once for all of them; the name is dropped before any record
  -- is read.
  for v_grp in
    with g as materialized (
      select r.organization_id as org, r.table_id as tbl, r.id, r.data
        from custom.record r
        join custom.record t
          on t.organization_id = r.organization_id and t.id = r.table_id
         and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
       where r.id = any (v_ids) and r.deleted_at is null
    ),
    k as materialized (
      select x.organization_id as org, x.data ->> 'entity_definition_id' as tbl,
             array_agg(x.data ->> 'key') as keys,
             bool_or(custom.parity_type(x.data) in ('lookup', 'rollup', 'formula')) as computed
        from custom.record x
       where x.organization_id in (select distinct g.org from g)
         and x.table_id = v_fields and x.deleted_at is null
         and x.data ->> 'entity_definition_id' in (select distinct g.tbl::text from g)
         and substr(x.id::text, 15, 1) <> '5'
       group by 1, 2
    ),
    s as (
      select g.org, g.tbl, array_agg(g.id) as ids,
             coalesce(array_agg(g.id) filter (where k.org is not null and (
                        k.computed
                     or exists (select 1 from unnest(k.keys) kk
                                 where coalesce(jsonb_typeof(g.data -> kk), 'null') <> 'null')
                     or coalesce(g.data -> '_computed', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
                     or coalesce(g.data -> '_derived', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb))),
                      '{}'::uuid[]) as held
        from g left join k on k.org = g.org and k.tbl = g.tbl::text
       group by g.org, g.tbl
    )
    select s.org, s.tbl, s.ids, s.held
      from s
     order by s.org, s.tbl
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_values');
    continue when cardinality(v_grp.held) = 0;
    v_todo := v_todo || jsonb_build_array(jsonb_build_object('org', v_grp.org, 'tbl', v_grp.tbl, 'held', to_jsonb(v_grp.held)));
  end loop;
  if jsonb_array_length(v_todo) = 0 then
    return v_out;
  end if;

  -- STORE-READ-PERF-5: the Table list asked among these Tables, not every Table of the organization;
  -- SCOPES-D2: once per organization, every organization's walk asked in one pass.
  select jsonb_object_agg(o.org, o.tbls) into v_among
    from (select t ->> 'org' as org, jsonb_agg(distinct t -> 'tbl') as tbls
            from jsonb_array_elements(v_todo) t group by 1) o;
  perform platform.memo_k_put('custom.kernel_among_batch:' || v_me::text, v_among::text);
  for v_o in select jsonb_object_keys(v_among) loop
    v_listed := v_listed || coalesce((select array_agg(v_o || ':' || v::text) from custom.tables_listed_among(
                  v_o::uuid, array(select jsonb_array_elements_text(v_among -> v_o)::uuid)) v), '{}'::text[]);
  end loop;
  perform platform.memo_k_drop('custom.kernel_among_batch:' || v_me::text);

  for v_g in select t from jsonb_array_elements(v_todo) t loop
    continue when not ((v_g ->> 'org') || ':' || (v_g ->> 'tbl') = any (v_listed));
    select (v_g ->> 'org')::uuid as org, (v_g ->> 'tbl')::uuid as tbl,
           array(select jsonb_array_elements_text(v_g -> 'held')::uuid) as held
      into v_grp;
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.held, false) x
      ),
      h as materialized (
        select r.id, r.data -> '_values' as stamps, r.data -> '_sources' as sources, r.updated_at
          from custom.record r where r.organization_id = v_grp.org and r.id = any (v_grp.held)
      ),
      f as materialized (
        select x.id, x.data, x.metadata from custom.record x
         where x.organization_id = v_grp.org and x.table_id = v_fields and x.deleted_at is null
           and x.data ->> 'entity_definition_id' = v_grp.tbl::text
           and substr(x.id::text, 15, 1) <> '5'
      ),
      v as materialized (
        select d.id as scope_id, f.id as item_id, f.data ->> 'key' as key, f.data as fdoc, f.metadata as fmeta,
               d.document -> (f.data ->> 'key') as value,
               h.stamps -> (f.data ->> 'key') as stamp, h.sources, h.updated_at,
               d.document -> '_values' as dvals, d.document -> '_sources' as dsrcs
          from d join h on h.id = d.id
          join f on d.document ? (f.data ->> 'key') and jsonb_typeof(d.document -> (f.data ->> 'key')) <> 'null'
      ),
      -- SCOPES-D1 (lane 9, 2026-10-02): A TEXT KEPT AS A FILE IS NEVER ANSWERED AS ITS FIRST WORDS ALONE.
      -- The cell of a value over the store's ceiling holds its first 1000 characters; the whole text
      -- is a file. The read door's document names that file for a Field the caller may see
      -- (custom.with_whole_value_pointers), so the row carries it as `whole_value` (the file fields of
      -- the pointer only, custom.whole_value_pointer_of) and the screen opens the whole text. A text
      -- written but still waiting for its file (`pending`: the follower attaches it within seconds) is
      -- answered WHOLE from the store's own waiting row, and says so (`whole_value.in_value`).
      w as materialized (
        select v.*,
               case when jsonb_typeof(v.value) = 'string' then
                 coalesce(custom.whole_value_pointer_of(v.dvals, v.dsrcs, v.key),
                          case when v.sources -> (v.stamp ->> 'src') ->> 'kind' = 'whole_value_in_file'
                                and coalesce(v.sources -> (v.stamp ->> 'src') ->> 'file_id', '') = ''
                               then jsonb_strip_nulls(jsonb_build_object(
                                      'kind', 'whole_value_in_file', 'pending', true,
                                      'bytes', v.sources -> (v.stamp ->> 'src') -> 'bytes',
                                      'chars', v.sources -> (v.stamp ->> 'src') -> 'chars',
                                      'sha256', v.sources -> (v.stamp ->> 'src') -> 'sha256',
                                      'shown_chars', v.sources -> (v.stamp ->> 'src') -> 'shown_chars',
                                      'mime', v.sources -> (v.stamp ->> 'src') -> 'mime'))
                          end)
               end as whole
          from v
      ),
      wv as materialized (
        select w.*,
               case when (w.whole ->> 'pending')::boolean then
                 (select p.whole_text from custom.whole_value_parked p
                   where p.organization_id = v_grp.org and p.record_id = w.scope_id and p.field_key = w.key
                     and p.sha256 = w.whole ->> 'sha256')
               end as parked
          from w
      ),
      -- The names of the scopes a reference points at, for its chip — only scopes the caller sees
      -- (the one ladder's level on each, custom.levels_of, asked once for all of them).
      refs as materialized (
        select distinct (e #>> '{}')::uuid as id
          from v cross join lateral jsonb_array_elements(case jsonb_typeof(v.value)
                                                           when 'array' then v.value
                                                           when 'string' then jsonb_build_array(v.value)
                                                           else '[]'::jsonb end) e
         where v.fdoc ->> 'type' = 'relation' and jsonb_typeof(e) = 'string'
           and (e #>> '{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ),
      lv as materialized (
        select custom.levels_of(v_me, (select array_agg(refs.id) from refs)) as l where exists (select 1 from refs)
      ),
      names as materialized (
        select x.id, x.data ->> 'name' as name,
               -- A File RECORD (the kernel File Table) names its file in data.file_id; the old fence
               -- named the file, so the answer carries it beside the name (lane SCOPES-READ-SWITCH-VALIDATE).
               case when x.table_id = '11111111-0000-4000-8000-000000000006'::uuid then x.data ->> 'file_id' end as file_id
          from custom.record x, lv
         where x.organization_id = v_grp.org and x.id in (select refs.id from refs)
           and (lv.l -> x.id::text ->> 'l') is not null
      )
      select jsonb_agg(jsonb_build_object(
               'scope_id', v.scope_id, 'context_item_id', v.item_id, 'key', v.key,
               'value', case when v.parked is not null then to_jsonb(v.parked) else v.value end,
               'field', jsonb_build_object(
                 'type', v.fdoc -> 'type', 'multi', v.fdoc -> 'multi', 'format', v.fdoc -> 'format',
                 'display_format', v.fdoc -> 'display_format', 'config', v.fdoc -> 'config',
                 'relation_target', v.fdoc -> 'relation_target',
                 'carried', v.fmeta -> 'moved_from' -> 'carried'),
               -- THE VERSION A PERSON SEES (lane 9 SCOPES-ON-THE-STORE, chair ruling 2, 2026-10-02): the
               -- EditScopeValueSheet "v{n}" badge counts person-visible changes only. A system rewrite
               -- (the copy's correction, a long text re-filed as a file) bumps the store's own counter
               -- (the stamp's `ver`, custom.value_versions) but is not a change anybody made, so it never
               -- moves the shown number. The scope door stamps every person's write with its person-visible
               -- number (`old_version`: custom._ctx_value_write_store counts the writes; the copy carries the
               -- old row's), and a system rewrite carries the same number forward — so the shown version is
               -- the current source's `old_version`, and the stamp's `ver` only where a source names none.
               -- The internal counter is kept beside it as `store_version`.
               'version', coalesce(case when jsonb_typeof(v.sources -> (v.stamp ->> 'src') -> 'old_version') = 'number'
                                        then (v.sources -> (v.stamp ->> 'src') ->> 'old_version')::int end,
                                   (v.stamp ->> 'ver')::int, 1),
               'store_version', coalesce((v.stamp ->> 'ver')::int, 1),
               'set_at', coalesce(v.stamp ->> 'at', v.updated_at::text),
               'source_type', v.sources -> (v.stamp ->> 'src') ->> 'source_type',
               'value_id', v.sources -> (v.stamp ->> 'src') ->> 'old_value_id',
               'authored_by', case when (v.stamp ->> 'actor') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                                   then v.stamp ->> 'actor' end,
               'labels', (select jsonb_object_agg(n.id, n.name) from names n
                           where v.fdoc ->> 'type' = 'relation'
                             and (n.id::text = v.value #>> '{}'
                                  or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text))),
               'files', (select jsonb_object_agg(n.id, n.file_id) from names n
                          where n.file_id is not null and v.fdoc ->> 'type' = 'relation'
                            and (n.id::text = v.value #>> '{}'
                                 or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text))))
             || case when v.whole is null then '{}'::jsonb
                     else jsonb_build_object('whole_value',
                            v.whole || case when v.parked is not null then '{"in_value": true}'::jsonb else '{}'::jsonb end)
                end)
        from wv v), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;
