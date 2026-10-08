-- chair-step: the inverse of migrations/campaign/idcast_a_ids_are_compared_as_ids.sql (lane ID-CAST-CLASS) — puts the 21 function bodies back exactly as production held them before (pg_get_functiondef, 2026-10-08), text-cast id comparisons included. Nothing of anybody's data, no table, policy or grant is touched.
-- based-on: custom._ctx_store_scope(uuid, uuid, uuid, jsonb) ade766086c2fe5ace9e9d7eeb8e06bdd59b1b6fee06e782b8a78f086ba1111f0
-- based-on: custom._ctx_value_refs_of(uuid, jsonb, jsonb) 6cc81734186b2e5ba083429e67beba76eddf5643d9068369fd20b8e37a745ad1
-- based-on: custom._organization_work_return(uuid, uuid) 542f0610a315f4644360360b982cfae484b622e881b336fc3161e6026e770bb4
-- based-on: custom._organization_work_withdraw(uuid, uuid) eebe24c4e07f8a10f5a1787d0909db0738918cbcb8bb58711bfabe0384f66c86
-- based-on: custom._record_defaults_filled(uuid, uuid, jsonb) f1210b78f1c8bee8e4c291a73bc970b89c526847496834a2dbd7924fe3807abb
-- based-on: custom._record_events_to_activity() 7d447acef7a9212d1999de851acf7682d76ddde42b5f41e26ba95a1ba8fe78da
-- based-on: custom._view_field_key(uuid, uuid, text, text, jsonb, text[]) f33eb723b2d886e73ad9bb837499a89413eabf4f930ff687a7cd11b229120a4a
-- based-on: custom.context_item_archive(uuid) c20a7559d492ed9107d0123c7bee4f370bce906446ff095e6d1e84b80ed4a672
-- based-on: custom.context_item_restore(uuid) 9a6d349f835b0b24f396cc4576b888849cbdab58a376f1a94d97843c50ff4e73
-- based-on: custom.context_item_write(uuid, uuid, jsonb) 756f53eb14361d4e3c7e1ae58bfcaa17f3d1edab81eab40ca0d3abb9859e6f67
-- based-on: custom.context_values(uuid[]) 57193a76a222167ebd5bfa604f913be38b7a0f0c812fb5ac1f4657c8ec5d097e
-- based-on: custom.field_options(uuid, uuid) 87747b308a5025cd3518c4161737a5991ada1e6d5bf25a64bdc4467a816f5872
-- based-on: custom.inbox_remind_tick() c3a6fe4200971c0bccd1917ca9a5df9e78afb0b79f3e1cd72a29fce6739289a6
-- based-on: custom.migrate_retype(uuid, uuid, text, text) be465fe6f5f5878c10155472ec6580dd080a864cb3444de77826647680bb77a0
-- based-on: custom.relation_reverse_field(uuid, uuid, text) 86ddf0eb44cc1d8465d363d2b1177da8931d265afafd730c99f991698923cf4a
-- based-on: custom.relation_reverse_set(uuid, uuid, uuid, uuid[], uuid[]) b8125a8b5089f625cb9bbe582fe2ce86dcdd134496fcc9f353086604b6e193a4
-- based-on: custom.table_facts(uuid) b223bff3af00aaad4a996826c3a74dd827630e641144101d0a3af6160d8b924a
-- based-on: custom.template_upgrade(uuid, uuid, uuid) 1d8c0afc57bee7c75ad06f95e064f28fecd53fbe0f3635a50a574fcfc2c0ba00
-- based-on: custom.view_declare(uuid, uuid, jsonb) 0f2ad980cdb8e77f0594b18438336c6d639ab02ec6a81ebf49376c7bc8030e3b
-- based-on: platform._carried_back_value(uuid, text, uuid, text, jsonb) 391a9896c482c22f5184fc69ea3ad6045d46ada11340be175a9f4669c1b32a3c
-- based-on: platform._drill_lookup_words(text, text, text[], jsonb, text, text, integer) ad9aba73f66042624c50a31cc555a0cf2c8f8a1881e477009f202c003026f6cb

set local statement_timeout = '120s';

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
  -- CD-LADDER (2026-10-03): a custom record is never 'personal' (every Table starts at Organization);
  -- a spec that says so means "Only me", which is Shown to (written on insert below).
  v_vis      text := case when nullif(p_spec ->> 'visibility', '') = 'personal' then 'internal'
                          else coalesce(nullif(p_spec ->> 'visibility', ''), 'internal') end;
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
    raise exception 'A scope needs a name with letters or numbers in it, and "%" has none.', coalesce(p_spec ->> 'name', '<null>')
      using errcode = '22023', detail = 'ensure_slug: could not derive a slug (empty after normalization).';
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
  -- ONE LIVE SCOPE PER NAME UNDER ONE PARENT IN A TYPE (FTS-1d): idx_scope_unique_top / idx_scope_unique_nested
  -- refused through the image row; the store half asks it itself, in the same class and words.
  if v_deleted is null and exists (
       select 1 from custom.record x
        where x.organization_id = p_org and x.table_id = p_type and x.data_class = 'record' and x.deleted_at is null
          and x.id <> p_scope and x.data ->> 'name' = p_spec ->> 'name'
          and coalesce(x.data ->> 'parent_id', '') = coalesce(p_spec ->> 'parent_scope_id', '')) then
    if nullif(p_spec ->> 'parent_scope_id', '') is null then
      raise exception 'A scope named “%” already exists in %.', p_spec ->> 'name', (select coalesce(t.data ->> 'label_plural', t.data ->> 'label_singular', 'this type') from custom.record t where t.organization_id = p_org and t.id = p_type) using errcode = '23505',
        detail = format('idx_scope_unique_top: Key (organization_id, scope_type_id, name)=(%s, %s, %s) already exists.', p_org, p_type, p_spec ->> 'name');
    end if;
    raise exception 'A scope named “%” already exists under “%” in %.', p_spec ->> 'name',
      (select coalesce(x.data ->> 'name', 'its parent') from custom.record x where x.organization_id = p_org and x.id::text = p_spec ->> 'parent_scope_id'),
      (select coalesce(t.data ->> 'label_plural', t.data ->> 'label_singular', 'this type') from custom.record t where t.organization_id = p_org and t.id = p_type) using errcode = '23505',
      detail = format('idx_scope_unique_nested: Key (organization_id, scope_type_id, parent_scope_id, name)=(%s, %s, %s, %s) already exists.',
                      p_org, p_type, p_spec ->> 'parent_scope_id', p_spec ->> 'name');
  end if;
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
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by, published_to_web, shown_to, metadata, deleted_at)
    values (p_scope, p_org, p_type, 'record', v_data, coalesce(nullif(p_spec ->> 'created_by', '')::uuid, auth.uid()),
            (v_vis = 'public'),
            case when p_spec ->> 'visibility' = 'personal' then 'only_me'::platform.shown_to end,
            jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_scope::text)),
            v_deleted);
    v_did := 'made';
  else
    if (v_existing.deleted_at is null) <> (v_deleted is null) or v_existing.published_to_web is distinct from (v_vis = 'public') then
      update custom.record set deleted_at = v_deleted, published_to_web = (v_vis = 'public')
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

CREATE OR REPLACE FUNCTION custom._ctx_value_refs_of(p_org uuid, p_value jsonb, p_field jsonb)
 RETURNS TABLE(ref_type text, ref_key text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHAT A STORED CONTEXT VALUE POINTS AT (FTS-1e): the old indexer's reading (context.index_reference_value),
  -- asked of the value the scope's Record holds.
  -- A fence kept as text (any field): the old indexer's own words — its type, each item's key.
  select s.env ->> 'type', context.reference_item_ref_key(s.env ->> 'type', it)
    from (select context.parse_reference_fence(p_value #>> '{}') as env where jsonb_typeof(p_value) = 'string') s
   cross join lateral jsonb_array_elements(case when jsonb_typeof(s.env -> 'items') = 'array' then s.env -> 'items' else '[]'::jsonb end) it
   where context.reference_item_ref_key(s.env ->> 'type', it) is not null
  union all
  -- A reference column (custom._ctx_value_of's three shapes): a File column holds File Records (the old fence
  -- named the file, which the File Record carries as data.file_id); a typed column holds {token, id}; a scope
  -- column holds the scope ids.
  select case when p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006' then 'file'
              when jsonb_typeof(e) = 'object' then e ->> 'token'
              else 'scope' end,
         case when p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006'
                then coalesce((select x.data ->> 'file_id' from custom.record x
                                where x.organization_id = p_org and x.id::text = e #>> '{}'), e #>> '{}')
              when jsonb_typeof(e) = 'object' then e ->> 'id'
              else e #>> '{}' end
    from jsonb_array_elements(case when p_field ->> 'type' = 'relation' then
                                case jsonb_typeof(p_value) when 'array' then p_value
                                                           when 'string' then jsonb_build_array(p_value)
                                                           else '[]'::jsonb end
                              else '[]'::jsonb end) e
   where (jsonb_typeof(e) = 'object' and e ->> 'id' is not null)
      or (jsonb_typeof(e) = 'string' and context.parse_reference_fence(e #>> '{}') is null)
$function$;

CREATE OR REPLACE FUNCTION custom._organization_work_return(p_organization_id uuid, p_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  x        jsonb;
  v_back_a integer := 0;
  v_back_s integer := 0;
  v_back_w integer := 0;
  v_left   jsonb := '[]'::jsonb;
  v_n      integer;
  v_d      jsonb;
  v_ver    integer;
  v_del    timestamptz;
  v_total  integer := 0;
  v_events integer := 0;
begin
  if exists (select 1 from iam.organizations g where g.id = p_organization_id and g.archived_at is not null) then
    return null;                               -- still archived: nothing comes back
  end if;

  -- EVERY OPEN EVENT, newest first (an organization archived, restored and archived again has one
  -- open event per archive that nothing has undone yet).
  for m in
    select * from history.migration_log l
     where l.organization_id = p_organization_id
       and l.target_kind = 'organization' and l.target_id = p_organization_id
       and l.verb = 'archive' and l.undone_at is null
     order by l.applied_at desc
  loop
    v_events := v_events + 1;
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   m.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive of organization', true);

    -- a. APPROVALS: back to pending only if nothing changed them since and their subject is live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,approvals}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.version, r.deleted_at into v_d, v_ver, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'the approval itself was archived'));
      elsif v_d ->> 'state' <> 'withdrawn' or v_d ->> 'withdrawn_with' is distinct from 'organization'
            or v_ver <> (x ->> 1)::integer then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'it was changed after the organization was archived'));
      elsif custom.work_approval_withdrawal(p_organization_id, v_d) is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval',
                    'why', custom.work_approval_withdrawal(p_organization_id, v_d)));
      else
        perform set_config('custom.decision_door', 'work_approval:return', true);
        update custom.record r
           set data = (r.data - 'decided_at' - 'withdrawn_by' - 'withdrawn_reason' - 'withdrawn_with' - 'outcome')
                      || '{"state":"pending"}'::jsonb
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        perform set_config('custom.decision_door', '', true);
        v_back_a := v_back_a + 1;
      end if;
    end loop;

    -- b. ASSIGNMENTS: back to the same person only if the record is live, nobody reassigned it and
    --    that person record is still live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,assignments}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'the record was archived'));
      elsif nullif(v_d ->> 'assignee', '') is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'it was assigned again since'));
      elsif not exists (select 1 from custom.record pr
                         where pr.organization_id = p_organization_id and pr.id::text = x ->> 1
                           and pr.table_id = custom.person_kernel_id() and pr.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'that person is no longer here'));
      else
        update custom.record r
           set data = r.data || jsonb_build_object('assignee', x ->> 1)
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        v_back_w := v_back_w + 1;
      end if;
    end loop;

    -- c. SIGNATURE REQUESTS: the same link works again only if its record is live and nothing
    --    else answered or stopped it.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,sign_requests}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the request was archived'));
      elsif v_d ->> 'invalidated_with' is distinct from 'organization' or v_d ? 'signed_at' or v_d ? 'declined_at' then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'it was answered or stopped some other way'));
      elsif not exists (select 1 from custom.record s
                         where s.organization_id = p_organization_id and s.id = nullif(v_d ->> 'record_id', '')::uuid
                           and s.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the record it asks about was archived'));
      else
        perform set_config('custom.decision_door', 'sign_request:return', true);
        update custom.record r
           set data = r.data - 'invalidated_at' - 'invalidation_reason' - 'invalidated_by' - 'invalidated_with'
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        perform set_config('custom.decision_door', '', true);
        v_back_s := v_back_s + 1;
      end if;
    end loop;

    update history.migration_log l
       set undone_at = now(), undone_by = p_by,
           inverse = l.inverse || jsonb_build_object('left', v_left)
     where l.organization_id = p_organization_id and l.id = m.id;
  end loop;

  return jsonb_build_object('events', v_events, 'approvals', v_back_a, 'assignments', v_back_w,
                            'sign_requests', v_back_s, 'left', v_left,
                            'sentence', format('%s of %s waiting item(s) came back; %s stayed withdrawn.',
                                               v_back_a + v_back_w + v_back_s, v_total, jsonb_array_length(v_left)));
end
$function$;

CREATE OR REPLACE FUNCTION custom._organization_work_withdraw(p_organization_id uuid, p_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     iam.organizations%rowtype;
  v_when    timestamptz;
  v_at      text;
  v_reason  text;
  v_sreason text;
  v_log     uuid := gen_random_uuid();
  v_appr    jsonb := '[]'::jsonb;
  v_asg     jsonb := '[]'::jsonb;
  v_sign    jsonb := '[]'::jsonb;
  v_note    text;
begin
  select * into v_org from iam.organizations g where g.id = p_organization_id;
  if not found or v_org.archived_at is null then
    return null;                               -- only an archived organization gives anything up
  end if;
  v_when := v_org.archived_at;
  v_at   := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_reason := format('%s was archived on %s, so this change can no longer be made there.',
                     v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'))
              || coalesce(' Reason given: ' || nullif(btrim(v_org.archive_reason), '') || '.', '');
  v_sreason := format('%s was archived on %s, so this signature request was withdrawn and the link no longer works.',
                      v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'));

  -- EVERY VERSION THIS WRITES POINTS AT ONE EVENT (history.record_capture reads these three).
  perform set_config('history.mark_at',   statement_timestamp()::text, true);
  perform set_config('history.mark_id',   v_log::text,                 true);
  perform set_config('history.mark_verb', 'archive of organization',   true);

  perform set_config('custom.decision_door', 'work_approval:withdraw', true);
  -- a. PENDING APPROVALS
  with w as (
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     p_by::text,
             'withdrawn_reason', v_reason,
             'withdrawn_with',   'organization',
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and coalesce(r.data ->> 'state', 'pending') = 'pending'
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_appr from w;
  perform set_config('custom.decision_door', '', true);

  -- b. OPEN ASSIGNMENTS (the same predicate custom._inbox_items lists: a live record whose Assignee
  --    names a person record, in a state that is not finished)
  with open_work as (
    select r.id, r.data ->> 'assignee' as assignee
      from custom.record r
      join custom.record pr
        on pr.organization_id = r.organization_id
       and pr.id::text = r.data ->> 'assignee'
       and pr.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.data_class = 'record'
       and r.deleted_at is null
       and nullif(r.data ->> 'assignee', '') is not null
       and not coalesce((s.data ->> 'terminal')::boolean, false)
  ),
  w as (
    update custom.record r
       set data = r.data - 'assignee'
      from open_work o
     where r.organization_id = p_organization_id and r.id = o.id
    returning r.id, o.assignee, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.assignee, w.version) order by w.id), '[]'::jsonb) into v_asg from w;

  perform set_config('custom.decision_door', 'sign_request:withdraw', true);
  -- c. SIGNATURE REQUESTS STILL WAITING ON THEIR SIGNER
  with w as (
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at',      now(),
             'invalidation_reason', v_sreason,
             'invalidated_by',      p_by::text,
             'invalidated_with',    'organization')
     where r.organization_id = p_organization_id
       and r.data_class = 'sign_request'
       and r.deleted_at is null
       and custom.sign_request_state(r.data) in ('sent', 'viewed')
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_sign from w;
  perform set_config('custom.decision_door', '', true);

  if jsonb_array_length(v_appr) + jsonb_array_length(v_asg) + jsonb_array_length(v_sign) = 0 then
    return jsonb_build_object('event_id', null, 'approvals', 0, 'assignments', 0, 'sign_requests', 0);
  end if;

  v_note := format('%s archived: %s waiting approval(s) withdrawn, %s open assignment(s) unassigned, %s signature request(s) stopped. Restoring the organization brings back each one whose subject is still live.',
                   v_org.name, jsonb_array_length(v_appr), jsonb_array_length(v_asg), jsonb_array_length(v_sign));
  insert into history.migration_log (id, organization_id, verb, target_kind, target_id, inverse, applied_by, note)
  values (v_log, p_organization_id, 'archive', 'organization', p_organization_id,
          jsonb_build_object(
            'kind',        'organization_restore',
            'open',        false,
            'archived_at', v_when,
            'reason',      v_reason,
            'took',        jsonb_build_object('approvals', v_appr, 'assignments', v_asg, 'sign_requests', v_sign)),
          p_by, v_note);

  return jsonb_build_object('event_id', v_log,
                            'approvals', jsonb_array_length(v_appr),
                            'assignments', jsonb_array_length(v_asg),
                            'sign_requests', jsonb_array_length(v_sign),
                            'sentence', v_note);
end
$function$;

CREATE OR REPLACE FUNCTION custom._record_defaults_filled(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
declare
  v_out  jsonb := case when p_data is not null and jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  f      record;
  v_key  text;
  v_type text;
  v_def  jsonb;
  v_fit  jsonb;
  v_opts uuid;
  v_word text;
  v_ok   boolean;
begin
  if p_organization_id is null or p_table_id is null then
    return v_out;
  end if;
  -- INSTALL-SPEED-2: plan_cache_mode (above) holds this lookup's plan generic; it was re-planned
  -- once per row of every record_write_many. Same rows, same order of work.
  for f in
    select x.data
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.field_kernel_id()
       and x.data_class = 'field'
       and x.deleted_at is null
       and x.data ->> 'entity_definition_id' = p_table_id::text
       and x.data ? 'default'
  loop
    v_key  := f.data ->> 'key';
    v_type := f.data ->> 'type';
    v_def  := f.data -> 'default';
    -- NAMED BY THE CALLER — a value or an explicit null — is the caller's, never the default's.
    if v_key is null or v_out ? v_key then
      continue;
    end if;
    -- NOTHING TO FILL: an absent default, and the empty containers the older system stored as
    -- "no value" ([] on a list, {} on a text column).
    if v_def is null or jsonb_typeof(v_def) = 'null'
       or v_def = '[]'::jsonb or v_def = '{}'::jsonb or v_def = '""'::jsonb then
      continue;
    end if;
    -- A FIELD NOBODY TYPES INTO never takes a default: it is worked out, linked or applies only to
    -- some types of record.
    if v_type in ('formula', 'rollup', 'lookup', 'relation', 'attachment', 'autonumber')
       or coalesce(f.data ->> 'source', '') in ('formula', 'rollup', 'lookup', 'computed')
       or (jsonb_typeof(f.data -> 'applies_to_types') = 'array' and jsonb_array_length(f.data -> 'applies_to_types') > 0) then
      continue;
    end if;

    if v_type = 'list' then
      -- A CHOICE: an option's id, or a word the choice-words trigger resolves to one. A closed
      -- column takes it only when it names one of its choices.
      v_ok := true;
      if coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false) is not true then
        v_opts := nullif(coalesce(f.data ->> 'options_table_id', f.data -> 'config' ->> 'options_table_id'), '')::uuid;
        for v_word in
          select e #>> '{}' from jsonb_array_elements(case when jsonb_typeof(v_def) = 'array' then v_def else jsonb_build_array(v_def) end) e
        loop
          if v_word is null or v_opts is null or not exists (
               select 1 from custom.record o
                where o.organization_id = p_organization_id
                  and o.table_id = v_opts
                  and o.deleted_at is null
                  and (o.id::text = v_word
                       or lower(coalesce(o.data ->> 'name', o.data ->> 'title', '')) = lower(btrim(v_word))
                       or o.metadata ->> 'option_key' = v_word)) then
            v_ok := false;
          end if;
        end loop;
      end if;
      if not v_ok then
        continue;
      end if;
      v_fit := case when coalesce((f.data ->> 'multi')::boolean, false) and jsonb_typeof(v_def) <> 'array'
                    then jsonb_build_array(v_def) else v_def end;
    else
      v_fit := custom.field_value_convert(f.data, v_def);
      if v_fit is null then
        continue;
      end if;
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_fit);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._record_events_to_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  insert into platform.activity_log (organization_id, entity_type, entity_id, action, actor_id, metadata)
  select n.organization_id,
         custom.record_source_key(n.table_id),
         n.record_id,
         'record.' || case
           when n.operation = 'updated' then 'updated'
           when n.operation = 'created' and coalesce(r.version, 1) > 1 then 'restored'
           when n.operation = 'created' then 'created'
           when n.operation = 'deleted' and r.id is null then 'purged'
           when n.operation = 'deleted' then 'archived'
           else n.operation end,
         nullif(n.actor ->> 'user_id', '')::uuid,
         jsonb_build_object(
           'table_id',          n.table_id,
           'table_name',        t.data ->> 'name',
           'record_id',         n.record_id,
           'version',           r.version,
           'changed_field_ids', n.changed_field_ids,
           -- G8: the changed columns by KEY, the older store's `changed_fields` word, so the
           -- scheduler's `changed_fields` filter (scheduler.sch_match_event) reads both stores
           -- one way.
           'changed_fields',    coalesce((select jsonb_agg(f.data ->> 'key' order by f.data ->> 'key')
                                            from custom.record f
                                           where f.organization_id = n.organization_id
                                             and f.table_id = custom.field_kernel_id()
                                             and f.id::text in (select jsonb_array_elements_text(
                                                   case when jsonb_typeof(n.changed_field_ids) = 'array'
                                                        then n.changed_field_ids else '[]'::jsonb end))),
                                         '[]'::jsonb),
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and (exists (select 1 from files.webhooks w
                   where w.is_active
                     and w.organization_id = n.organization_id
                     and w.resource_types && custom.record_source_keys(n.table_id))
          -- G8: ONE PATH FOR BOTH STORES. A schedule that runs an agent when a row changes
          -- (scheduler.sch_trigger type `event`) listens to the same activity spine the older
          -- store's workbench.udt_row_activity writes, and scheduler.sch_match_event fires it
          -- from there. A record-store table's changes now land on that spine whenever a live
          -- schedule listens for them, exactly as they do for a webhook.
          or exists (select 1 from scheduler.sch_trigger t
                      where t.type = 'event' and t.enabled and t.deleted_at is null
                        and t.organization_id = n.organization_id
                        and t.config ->> 'entity_type' = any (custom.record_source_keys(n.table_id))))
     -- The organization's own store switch (the guard this file names): a store that is off
     -- announces nothing, to a webhook or to a schedule.
     -- (CHAIR-ALWAYS-ON 2026-10-03: the per-organization store switch is retired; the store is always on, so
     -- the knob arm that used to sit here is gone.)
     ;
  -- LANE SCOPES-SIDE-EFFECTS: the old scope tables' side effects ride this consumer's own statement
  -- (the search index, the suggestion-sweep wake, a scope's dataset table), for Tables kept for
  -- context only — custom._context_side_effects filters. No trigger of their own: creating one on
  -- custom.io_outbox would queue every store write behind its lock.
  perform custom._context_side_effects(
    (select jsonb_agg(jsonb_build_array(n.organization_id, n.record_id, n.table_id, n.operation))
       from new_rows n
      where n.event_key = 'records.changed' and n.table_id is not null));
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION custom._view_field_key(p_organization_id uuid, p_table_id uuid, p_path text, p_shape text, p_ref jsonb, p_known text[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ref   text;
  v_doc   jsonb;
  v_dead  boolean;
  v_type  text;
  v_par   text;
  v_kind  text;
  v_label text;
  v_held  boolean;
  v_cfg   jsonb;
  v_far   jsonb;
  v_ftab  text;
  v_flds  jsonb;
begin
  if p_ref is null or jsonb_typeof(p_ref) <> 'string' or btrim(p_ref #>> '{}') = '' then
    raise exception '% names a Field, and nothing was named.', p_path
      using errcode = '22023', hint = 'Name the Field by its key or its id. Nothing was written.';
  end if;
  v_ref := p_ref #>> '{}';

  select f.data, f.deleted_at is not null into v_doc, v_dead
    from custom.record f
   where f.organization_id = p_organization_id and f.data_class = 'field'
     and f.data ->> 'entity_definition_id' = p_table_id::text
     and (f.id::text = v_ref or f.data ->> 'key' = v_ref)
   order by (f.deleted_at is null) desc, f.updated_at desc
   limit 1;

  if v_doc is not null and v_ref = any (p_known) then
    return v_doc ->> 'key';
  end if;
  if v_doc is null and v_ref = any (p_known) then
    -- A word the view already held that is no Field of this Table now (a column since removed
    -- for good). Kept as it was; the screens skip a Field they cannot find.
    return v_ref;
  end if;
  if v_doc is null then
    raise exception '% names "%", which is not a field of this table.', p_path, v_ref
      using errcode = '22023', hint = 'A view names the fields of its own table, by key or id. Nothing was written.';
  end if;
  v_label := coalesce(nullif(v_doc ->> 'label', ''), v_doc ->> 'key');
  if v_dead and p_path <> 'presentation.hiddenFields' then
    -- (Hiding a column that is archived anyway harms nobody, so that one list takes it.)
    raise exception '% names %, which has been archived.', p_path, v_label
      using errcode = '22023', hint = 'An archived field is not shown to anyone, so a view cannot be built on it. Restore it first, or pick another. Nothing was written.';
  end if;

  v_type := v_doc ->> 'type';
  v_par  := coalesce(v_doc ->> 'parity_type', '');
  v_kind := coalesce(v_doc -> 'config' ->> 'kind', '');

  -- LANE 10 FDT: A DATE SETTING TAKES A FIELD WHOSE VALUE IS A DATE, stored or worked out (Airtable
  -- places a calendar or a timeline by a formula or a lookup that returns a date). A stored date
  -- column, as before; a formula whose answer is a date, typed by `custom._fxp_type` — the one rule
  -- the formula editor's "gives a date" uses; a lookup of ONE value whose picked column on the far
  -- table is a stored date or a date formula. A rollup is never one: `custom.rollup_value` adds up
  -- numbers only, so a rollup of dates is always empty and a calendar on it would show nothing.
  -- Everything else is refused with the same sentences as before.
  if p_shape = 'field:date' then
    v_held := v_type = 'range' and (v_kind in ('date', 'datetime') or v_par in ('date', 'datetime'));
    v_cfg := coalesce(v_doc -> 'config', '{}'::jsonb);
    if not v_held and v_type = 'formula' and not (v_cfg ? 'via') and jsonb_typeof(v_cfg -> 'expr') = 'object' then
      select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '[]'::jsonb)
        into v_flds
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text;
      v_held := custom._fxp_type(v_cfg -> 'expr', v_flds) = 'date';
    elsif not v_held and v_type = 'formula' and v_cfg ? 'via' and not (v_cfg ? 'agg')
          and not coalesce((v_doc ->> 'multi')::boolean, false) then
      select f.data ->> 'relation_target' into v_ftab
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and f.data ->> 'key' = v_cfg ->> 'via'
       limit 1;
      if v_ftab is not null then
        select f.data into v_far
          from custom.record f
         where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_ftab
           and f.data ->> 'key' = v_cfg ->> 'pick'
         limit 1;
      end if;
      if v_far ->> 'type' = 'range' then
        v_held := coalesce(v_far -> 'config' ->> 'kind', '') in ('date', 'datetime')
               or coalesce(v_far ->> 'parity_type', '') in ('date', 'datetime');
      elsif v_far ->> 'type' = 'formula' and not (v_far -> 'config' ? 'via')
            and jsonb_typeof(v_far -> 'config' -> 'expr') = 'object' then
        select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                                     'type', f.data ->> 'type', 'config', f.data -> 'config')), '[]'::jsonb)
          into v_flds
          from custom.record f
         where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_ftab;
        v_held := custom._fxp_type(v_far -> 'config' -> 'expr', v_flds) = 'date';
      end if;
    end if;
    v_held := coalesce(v_held, false);
  end if;
  if p_shape = 'field:number'
     and not (v_type = 'formula'
              or (v_type = 'range' and v_kind not in ('date', 'datetime', 'time')
                  and v_par not in ('date', 'datetime', 'time'))) then
    raise exception 'The board sums a number, a money or a percentage field under each column, and % holds none of those.', v_label
      using errcode = '22023', hint = 'Pick a number field to total. Nothing was written.';
  elsif p_shape = 'field:date' and not v_held then
    -- LANE 10 VK: the same date test for every date setting; the sentence names the setting.
    if p_path = 'end_field' then
      raise exception 'A record''s end is a date, and % does not hold one.', v_label
        using errcode = '22023', hint = 'Pick a date field for where it ends. Nothing was written.';
    elsif p_path = 'start_field' then
      raise exception 'A timeline places a record by a date, and % does not hold one.', v_label
        using errcode = '22023', hint = 'Pick a date field for where it starts. Nothing was written.';
    end if;
    raise exception 'A calendar places a record by a date, and % does not hold one.', v_label
      using errcode = '22023', hint = 'Pick a date field. Nothing was written.';
  elsif p_shape = 'field:color' and v_type not in ('list', 'boolean') then
    raise exception 'Colour by gives one colour to each value of a choice, and % is not a choice.', v_label
      using errcode = '22023', hint = 'Pick a choice or a yes/no field to colour by. Nothing was written.';
  elsif p_shape = 'field:lane' and v_type not in ('list', 'relation', 'boolean', 'text') then
    raise exception 'A swimlane is one row for each value of a choice, a person, a link or a word, and % holds a %.', v_label, v_type
      using errcode = '22023', hint = 'Pick a choice, a person or a link field. Nothing was written.';
  end if;
  return v_doc ->> 'key';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_archive(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    custom.record;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.delete_context_item's own checks and sentences.
  if v_org is null or v_f.deleted_at is not null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)
        -- Arman 2026-10-07: do it like the best in the world; structure is the org admins' and the creator's
        or (iam.has_org_access(v_org) and exists (select 1 from custom.record ct where ct.organization_id = v_org and ct.id = v_type and ct.created_by = (select auth.uid())))) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_now, 'is_active', false,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = p_item_id;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_archive');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'deleted_at', v_img.deleted_at));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_restore(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    custom.record;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.restore_context_item's own checks and sentences.
  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_f.deleted_at is null and coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
    return custom._ctx_answer(v_org, p_item_id,
             jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.'));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)
        -- Arman 2026-10-07: do it like the best in the world; structure is the org admins' and the creator's
        or (iam.has_org_access(v_org) and exists (select 1 from custom.record ct where ct.organization_id = v_org and ct.id = v_type and ct.created_by = (select auth.uid())))) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', null, 'is_active', true,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = p_item_id;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'restored', true));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_row    jsonb;
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_f      custom.record;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_sort   smallint;
  v_img    custom.record;
  v_rowupdate boolean := false;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_item_id is null then
    -- public.create_context_item's own checks and sentences, on the store Table.
    select t.* into v_t from custom.record t
     where t.id = p_scope_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    v_type := p_scope_type_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
    end if;
    if (auth.role() = 'service_role' or iam.has_org_admin(v_org)
        -- Arman 2026-10-07: do it like the best in the world; structure is the org admins' and the creator's
        or (iam.has_org_access(v_org) and exists (select 1 from custom.record ct where ct.organization_id = v_org and ct.id = v_type and ct.created_by = (select auth.uid())))) is not true then
      raise exception 'organization admin required for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform context.validate_table_template_source(
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end, v_org);
    -- THE NEXT PLACE among the type's active context fields (the store keeps sort + 2).
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select (coalesce(max(nullif(f.data ->> 'sort', '')::int - 2), 0) + 1)::smallint
         from custom.record f
        where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
          and f.data ->> 'entity_definition_id' = v_type::text and f.deleted_at is null
          and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
          and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)));
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'scope_type_id', v_type, 'key', s -> 'key', 'display_name', s -> 'display_name',
      'description', coalesce(s ->> 'description', ''), 'category', s -> 'category',
      'value_type', coalesce(s ->> 'value_type', 'string'), 'fetch_hint', coalesce(s ->> 'fetch_hint', 'on_demand'),
      'sensitivity', coalesce(s ->> 'sensitivity', 'internal'), 'status', 'active', 'source_type', 'manual',
      'tags', coalesce(s -> 'tags', '[]'::jsonb), 'slug', custom._ctx_scope_slug(s ->> 'key'), 'sort_order', v_sort,
      'created_by', auth.uid(),
      'allowed_reference_types', case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then s -> 'allowed_reference_types' end,
      'max_items', coalesce((s ->> 'max_items')::int, 1),
      'allowed_scope_type_ids', case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then s -> 'allowed_scope_type_ids' end,
      'reference_source', case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end,
      'is_active', true, 'deleted_at', null, 'depends_on', '[]'::jsonb);
  else
    -- THE FIELD, BY ITS ID, FROM THE STORE (any state), and its Table.
    select f.* into v_f from custom.record f
      join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
    v_org := v_f.organization_id;
    v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      -- THE ROW POLICY'S OWN QUESTION, BY NAME (lane SCOPES-OLD-WRITERS): a platform admin, or an admin of the
      -- field's organization; a field the caller may not change answers exactly as a missing one.
      if v_org is null or not (public.is_platform_admin() or coalesce(iam.has_org_admin(v_org), false)
                                  or (coalesce(iam.has_org_access(v_org), false) and exists (select 1 from custom.record ct where ct.organization_id = v_org and ct.id = v_type and ct.created_by = (select auth.uid())))) then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      -- public.update_context_item's own checks and sentences: an active field.
      if v_org is null or v_f.deleted_at is not null then
        perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
      end if;
      if (auth.role() = 'service_role' or iam.has_org_admin(v_org)
        -- Arman 2026-10-07: do it like the best in the world; structure is the org admins' and the creator's
        or (iam.has_org_access(v_org) and exists (select 1 from custom.record ct where ct.organization_id = v_org and ct.id = v_type and ct.created_by = (select auth.uid())))) is not true then
        raise exception 'organization admin required for this organization' using errcode = '42501',
                detail = jsonb_build_object('org', v_org)::text;
      end if;
    end if;
    -- The field's words in the old shape, from the store, with what the caller changed applied as the old
    -- statement applies it (named keys on the row path; non-null words on the plain path).
    v_cur := custom.scope_item_row_of(v_f) || jsonb_build_object(
      'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_f.deleted_at,
      'is_active', coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
      'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
      'status_note', v_f.data -> 'status_note', 'source_type', 'manual');
    if v_rowupdate then
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note', 'custom_component', 'review_interval_days',
                       'allowed_reference_types', 'max_items', 'allowed_scope_type_ids', 'reference_source');
      if s ? 'max_items' then
        v_spec := v_spec || jsonb_build_object('max_items', coalesce((s ->> 'max_items')::int, 1));
      end if;
    else
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note')
         and jsonb_typeof(e.value) <> 'null';
    end if;
  end if;

  -- 1. THE STORE, the only home (FTS-1f): no old row is written; its own side effects run with its write.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform custom._ctx_store_item(v_org, v_type, coalesce(v_id, p_item_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  select f.* into v_img from custom.record f where f.organization_id = v_org and f.id = coalesce(v_id, p_item_id);
  if v_img.id is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  v_row := custom.context_item_row_of(v_img);
  perform custom.assert_client_may_reach(v_org, 'custom.context_item_write');
  return custom._ctx_answer(v_org, v_img.id, v_row);
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
    raise exception 'Too many scopes were asked for at once (% asked, 200 at most); ask for fewer and try again.', cardinality(v_ids)
      using errcode = '22023', detail = 'custom.context_values answers at most 200 scopes a call.', hint = 'Ask in batches of 200 or fewer.';
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
    perform custom.assert_scope_door(v_grp.org, 'custom.context_values');
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

CREATE OR REPLACE FUNCTION custom.field_options(p_organization_id uuid, p_field_id uuid)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an
  -- invented one answer identically: both are refused, neither is told whether
  -- the Field exists.
  perform custom.assert_store_door(p_organization_id, 'custom.field_options');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_options');
  -- CHAIR-WORLD-LANE-2: a person the wall admitted only through the world lane reads the choices of a Field
  -- of a Public Table, and of no other Field (an unknown Field names no Table, and is refused as before).
  perform custom.assert_public_reader_names_a_public_table(p_organization_id,
    (select t.id
       from custom.record f
       join custom.record t
         on t.organization_id = f.organization_id
        and t.id::text = f.data ->> 'entity_definition_id'
        and t.table_id = custom.table_kernel_id()
      where f.organization_id = p_organization_id
        and f.id = p_field_id
        and f.table_id = custom.field_kernel_id()
        and f.deleted_at is null),
    'custom.field_options');

  -- IN THE ORDER THE PERSON DECLARED THEM (lane P, 2026-10-07). `custom._options_table_for`
  -- stamps `metadata.option_position`; without an ORDER BY this answered in heap order, so a
  -- status declared Idea · Planning · Assets ready · Posted came back Posted · Idea · Planning ·
  -- Assets ready in every dropdown and board that reads its choices here. Same order as
  -- `custom.choice_options`.
  return query
  select o.*
    from custom.record f
    join custom.record o
      on o.organization_id = f.organization_id
     and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
     and o.deleted_at is null
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
   order by (o.metadata ->> 'option_position')::integer nulls last, o.created_at, o.id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.inbox_remind_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_now      timestamptz := custom._inbox_now();
  p          record;
  x          record;
  v_days     integer;
  v_id       uuid;
  v_reminded integer := 0;
  v_back     integer := 0;
  v_ch       text;                  -- STORE-TAILS-3: the channel being written
begin
  -- WHO MIGHT BE OWED SOMETHING: approvers of a pending ask at least a day old, assignees of open
  -- work untouched for at least a day, and anybody whose snooze has come due. Each is then asked
  -- through custom._inbox_items — the SAME predicate their inbox and badge read — so a reminder
  -- is never about something they cannot see, have cleared, or have snoozed.
  for p in
    select distinct c.organization_id, c.user_id from (
      select a.organization_id, ap.user_id
        from custom.record a
        cross join lateral custom.work_approval_approvers(a.organization_id,
                     nullif(a.data ->> 'subject_id', '')::uuid,
                     nullif(a.data ->> 'approver_id', '')::uuid) ap
       where a.data_class = 'work_approval' and a.deleted_at is null
         and coalesce(a.data ->> 'state', 'pending') = 'pending'
         and a.created_at < v_now - interval '1 day'
      union
      select r.organization_id,
             case when pr.data ->> 'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (pr.data ->> 'user_id')::uuid end
        from custom.record r
        join custom.record pr
          on pr.organization_id = r.organization_id
         and pr.id::text = r.data ->> 'assignee'
         and pr.table_id = custom.person_kernel_id()
       where r.data_class = 'record' and r.deleted_at is null
         and nullif(r.data ->> 'assignee', '') is not null
         and r.updated_at < v_now - interval '1 day'
      union
      select s.organization_id, s.person_id
        from custom.inbox_item_state s
       where s.snoozed_until is not null and s.snoozed_until <= v_now and s.woke_at is null
    ) c
    -- AN ARCHIVED ORGANIZATION IS NEVER REMINDED: nobody works there any more, and its leftover
    -- asks would otherwise nag everybody who ever belonged to it (54 such reminders were measured
    -- on production, in 14 archived organizations, before the first run of the tick).
    join iam.organizations g on g.id = c.organization_id and g.archived_at is null
    where c.user_id is not null
  loop
    begin
      v_days := coalesce((platform.knob_resolve('custom', 'inbox_reminder_after_days', p.organization_id) #>> '{}')::integer, 3);
      for x in
        select * from custom._inbox_items(p.organization_id, p.user_id, false) i
         where i.inbox_state = 'waiting'
           and ((i.snoozed_until is not null and i.snoozed_until <= v_now and i.woke_at is null)
                or (i.reminded_at is null and v_days > 0 and i.at < v_now - make_interval(days => v_days)))
      loop
        if x.snoozed_until is not null and x.snoozed_until <= v_now and x.woke_at is null then
          -- A SNOOZE THAT CAME DUE says so once. It counts as the item's reminder.
          -- STORE-TAILS-3: every channel the person has on for this kind of notice (in the app and,
          -- by default, by email); `custom.agg_deliver` asks their switch and writes each one.
          foreach v_ch in array array['in_app', 'email'] loop
            v_id := custom.agg_deliver(p.organization_id, null, x.item_id, v_ch, p.user_id,
                      'custom.inbox.snooze_ended',
                      format('Back in your inbox: %s', x.title),
                      'You snoozed this until now. It is at the top of your inbox.',
                      jsonb_build_object('source', 'inbox', 'reason', 'snooze_ended', 'item_id', x.item_id,
                                         'kind', x.kind, 'table_id', x.table_id, 'snoozed_until', x.snoozed_until),
                      format('inbox:%s:back:%s', p.user_id, extract(epoch from x.snoozed_until)::bigint));
            if v_id is not null then
              update communication.notification n
                 set deep_link = case when v_ch = 'in_app' then coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
                                      else '/o/' || coalesce(x.subject_id, x.item_id)::text end
               where n.id = v_id and n.organization_id = p.organization_id and n.status in ('pending', 'render_pending');
            end if;
          end loop;
          update custom.inbox_item_state s
             set woke_at = v_now, reminded_at = coalesce(s.reminded_at, v_now), updated_at = now()
           where s.organization_id = p.organization_id and s.person_id = p.user_id and s.item_id = x.item_id;
          v_back := v_back + 1;
        else
          -- ONE REMINDER, EVER, per person and item: the stamp here and the notification's unique
          -- dedupe key both say so.
          foreach v_ch in array array['in_app', 'email'] loop
            v_id := custom.agg_deliver(p.organization_id, null, x.item_id, v_ch, p.user_id,
                      'custom.inbox.reminder',
                      format('Still waiting on you: %s', x.title),
                      case when x.kind = 'assignment'
                           then format('Assigned to you in %s and untouched for %s days. Open your inbox to finish it, snooze it, or clear it.',
                                       coalesce(x.table_name, 'a table'), v_days)
                           else format('%s asked %s days ago. Approve or decline it in your inbox, or snooze it until you can.',
                                       coalesce(x.requested_by_name, 'Somebody'), v_days) end,
                      jsonb_build_object('source', 'inbox', 'reason', 'reminder', 'item_id', x.item_id,
                                         'kind', x.kind, 'table_id', x.table_id, 'after_days', v_days),
                      format('inbox:%s:reminder', p.user_id));
            if v_id is not null then
              update communication.notification n
                 set deep_link = case when v_ch = 'in_app' then coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
                                      else '/o/' || coalesce(x.subject_id, x.item_id)::text end
               where n.id = v_id and n.organization_id = p.organization_id and n.status in ('pending', 'render_pending');
            end if;
          end loop;
          insert into custom.inbox_item_state as s (organization_id, person_id, item_id, reminded_at, updated_at)
          values (p.organization_id, p.user_id, x.item_id, v_now, now())
          on conflict (organization_id, person_id, item_id)
          do update set reminded_at = coalesce(s.reminded_at, excluded.reminded_at), updated_at = now();
          v_reminded := v_reminded + 1;
        end if;
      end loop;
    exception when others then
      -- ONE ORGANIZATION'S TROUBLE NEVER STOPS EVERYBODY ELSE'S REMINDERS — and it is loud.
      raise warning 'custom.inbox_remind_tick: organization % person %: % (%)', p.organization_id, p.user_id, sqlerrm, sqlstate;
    end;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'back', v_back, 'at', v_now);
end
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE CALLER AND THE ROW, on the one ladder, exactly as the other verbs ask it — this verb
  -- is executable by `authenticated` and a door that decides nothing is not a door. Then the
  -- switch: custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such record here to retype.' using errcode = '02000',
            detail = jsonb_build_object('id', p_id)::text;
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-05): THE CHANGE GOES THROUGH THE ONE DOOR THAT SHAPES
    -- A COLUMN. Writing the bare `type` word left a choice column's list and its several-choices switch
    -- on a column that was now Text, and the shape guard refused it ("is not a list, so it has no
    -- choices to take from a table") — the Sheet's Stores → Text could never change a choice column.
    -- custom.field_update builds the whole document for the new kind (list kept, several choices off,
    -- its default carried); its own trigger converts the values and writes the migration row, which
    -- sees this verb's row and does not write a second.
    perform custom.field_update(p_organization_id, p_id,
              jsonb_build_object('type', case p_to when 'boolean' then 'checkbox'
                                                   when 'range' then 'number'
                                                   else p_to end));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.relation_reverse_field(p_organization_id uuid, p_field_id uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fwd   jsonb;
  v_have  uuid;
  v_label text;
  v_key   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_reverse_field');
  select f.data into v_fwd
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null;
  if v_fwd is null or v_fwd ->> 'type' <> 'relation' then
    raise exception 'This column is not a link, so it has no other side.' using errcode = '22023';
  end if;
  if nullif(v_fwd -> 'config' ->> 'reverse_of', '') is not null then
    raise exception 'This column is already the other side of a link.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_fwd -> 'config' ->> 'target_mode', ''), 'one') <> 'one'
     or not exists (select 1 from custom.record t
                     where t.organization_id = p_organization_id
                       and t.id::text = v_fwd ->> 'relation_target'
                       and t.table_id = custom.table_kernel_id() and t.data_class = 'table'
                       and t.deleted_at is null) then
    raise exception 'Only a link to one of your tables can show on the other table.' using errcode = '22023';
  end if;
  perform custom.assert_may_know_table(p_organization_id, (v_fwd ->> 'entity_definition_id')::uuid, 'custom.relation_reverse_field');
  perform custom.assert_may_know_table(p_organization_id, (v_fwd ->> 'relation_target')::uuid, 'custom.relation_reverse_field');

  select x.id into v_have from custom._reverse_field_of(p_organization_id, p_field_id) x;
  if v_have is not null then
    return v_have;
  end if;

  select coalesce(nullif(btrim(p_label), ''), nullif(btrim(t.data ->> 'name'), ''), 'Linked records') into v_label
    from custom.record t
   where t.organization_id = p_organization_id and t.id::text = v_fwd ->> 'entity_definition_id';
  -- The key the reverse column already answers to, so every view, filter and roll-up that named it keeps it.
  v_key := coalesce(nullif(v_fwd ->> 'inverse_key', ''), 'linked_' || replace(p_field_id::text, '-', ''));

  -- THE STORE'S OWN DECLARATION DOOR, as the caller: the right to change the other table is decided there.
  return custom.field_declare(p_organization_id, (v_fwd ->> 'relation_target')::uuid,
           jsonb_build_object('type', 'relation', 'label', v_label, 'key', v_key,
                              'relation_target', v_fwd ->> 'entity_definition_id', 'multi', true,
                              'config', jsonb_build_object('reverse_of', p_field_id::text)));
end
$function$;

CREATE OR REPLACE FUNCTION custom.relation_reverse_set(p_organization_id uuid, p_record_id uuid, p_field_id uuid, p_add uuid[] DEFAULT '{}'::uuid[], p_remove uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rev    jsonb;
  v_fwd    jsonb;
  v_fwd_id uuid;
  v_fkey   text;
  v_multi  boolean;
  v_table  uuid;
  v_other  uuid;
  v_have   jsonb;
  v_left   jsonb;
  v_n      integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_reverse_set');
  if coalesce(cardinality(p_add), 0) + coalesce(cardinality(p_remove), 0) > 200 then
    raise exception 'At most 200 links can be changed at once.' using errcode = '22023';
  end if;
  select r.data into v_rev
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_field_id
     and r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null;
  v_fwd_id := nullif(v_rev -> 'config' ->> 'reverse_of', '')::uuid;
  if v_fwd_id is null
     or not exists (select 1 from custom._reverse_field_of(p_organization_id, v_fwd_id) x where x.id = p_field_id) then
    raise exception 'This column is not the other side of a link.' using errcode = '22023';
  end if;
  select f.data into v_fwd from custom.record f where f.organization_id = p_organization_id and f.id = v_fwd_id;
  v_fkey := coalesce(nullif(v_fwd ->> 'key', ''), v_fwd ->> 'name');
  v_multi := coalesce((v_fwd ->> 'multi')::boolean, false) or coalesce((v_fwd ->> 'relation_max')::integer, 1) > 1;

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null and r.data_class = 'record';
  if v_table is null or v_table::text <> v_rev ->> 'entity_definition_id' then
    raise exception 'This record is not in the table this column belongs to.' using errcode = '22023';
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.relation_reverse_set',
                                        'viewer'::public.permission_level, 'record');

  foreach v_other in array coalesce(p_add, '{}'::uuid[]) loop
    if v_multi then
      -- MANY: additive, the forward door's own way of adding one link.
      perform platform.relation_set(p_organization_id, v_other, v_fkey, jsonb_build_array(p_record_id::text));
    else
      -- AT MOST ONE (REL-7): the other record now points here instead — Notion's move. The document is
      -- replaced through the store's own door and its statement trigger withdraws the old edge.
      perform custom.assert_client_may_change(p_organization_id, v_other, 'custom.relation_reverse_set',
                                              'editor'::public.permission_level, 'record');
      perform custom.record_update(p_organization_id, v_other, jsonb_build_object(v_fkey, p_record_id::text));
    end if;
    v_n := v_n + 1;
  end loop;

  foreach v_other in array coalesce(p_remove, '{}'::uuid[]) loop
    perform custom.assert_client_may_change(p_organization_id, v_other, 'custom.relation_reverse_set',
                                            'editor'::public.permission_level, 'record');
    select case when jsonb_typeof(r.data -> v_fkey) = 'array' then r.data -> v_fkey
                when jsonb_typeof(r.data -> v_fkey) = 'string' then jsonb_build_array(r.data -> v_fkey)
                else '[]'::jsonb end
      into v_have
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_other and r.deleted_at is null
       and r.table_id::text = v_fwd ->> 'entity_definition_id';
    if v_have is null or not (v_have ? p_record_id::text) then
      continue;
    end if;
    select coalesce(jsonb_agg(x.v order by x.o), '[]'::jsonb) into v_left
      from jsonb_array_elements(v_have) with ordinality x(v, o)
     where x.v #>> '{}' <> p_record_id::text;
    perform custom.record_update(p_organization_id, v_other,
              jsonb_build_object(v_fkey, case when v_multi then v_left
                                              when jsonb_array_length(v_left) = 0 then 'null'::jsonb
                                              else v_left -> 0 end));
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_facts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, kept_by_the_app boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid, foundation boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_org uuid;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29):
  -- the facts of every Table the caller may open in every organization she belongs to, each
  -- organization asked through this same door with its name (its own wall, its own ladder). A
  -- refusing organization (42501) contributes nothing. No permission is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return;
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        return query select * from custom.table_facts(v_org);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  -- CHAIR-WORLD-LANE-2: a person admitted only to READ a Public Table of this organization is told that its live
  -- Public Tables are public — and nothing else: not who made them, not what keeps them, no other Table.
  if custom.world_reader_only(p_organization_id) then
    return query
      select r.id, 'public'::text, false, false, null::text, false, null::text, null::text, null::text,
             null::uuid, null::uuid, false
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.published_to_web;
    return;
  end if;
  return query
    with t as (
      select r.id, r.shown_to, r.published_to_web, r.created_by, r.data,
             custom.table_placement(r.organization_id, r.id, r.data, r.data_class = 'kernel') as p
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.table_kernel_id()) v)
    ),
    -- WHICH COLUMN USES EACH CHOICES TABLE: the list Field whose config names it. The first
    -- one made, when several share it.
    uses as (
      select distinct on (nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid)
             nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as options_table_id,
             coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as column_label,
             nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       order by nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid, f.created_at
    )
    select t.id,
           -- CD-LADDER (2026-10-03): the lane word, worked out from Shown to and Published to the web;
           -- the row column T-13 retires is not read.
           case when t.published_to_web then 'public' when t.shown_to = 'only_me' then 'personal' else 'internal' end,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'kept_by_the_app')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end,
           -- LANE 10 FD: the Foundation mark, for every Table, kept or not.
           (t.p ->> 'foundation')::boolean
      from t
      left join lateral (
        select t.p ->> 'kept_for' as word,
               case t.p ->> 'kept_for'
                 when 'context'  then nullif(t.data -> 'scope_binding' ->> 'scope_id', '')
                 when 'workflow' then nullif(t.data ->> 'parent_id', '')
                 when 'app'      then substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
               end as ref
      ) kw on true
      left join uses u on u.options_table_id = t.id
      left join t ut on ut.id = u.of_table                     -- only a table the caller can open is named
      left join t wt on kw.word = 'workflow' and wt.id::text = kw.ref
      -- SCOPES-READS-REST (2026-09-29): the scope a context Table belongs to is a live Record of the store.
      left join lateral (select r.id, r.data ->> 'name' as name
                           from custom.record r
                          where kw.word = 'context' and r.organization_id = p_organization_id
                            and r.id::text = kw.ref and r.data_class = 'record' and r.deleted_at is null) sc on true
      left join lateral (
        select
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' then 'The choices behind your columns'
            when kw.word = 'context' then 'The context system'
            when kw.word = 'checklists' then 'Checklists'
            when kw.word = 'bookings' then 'Bookings'
            when kw.word = 'workflow' then 'Workflows'
            when kw.word = 'store' then 'The store itself'
            when kw.word = 'app' then 'The app'
            else initcap(replace(kw.word, '_', ' '))
          end as keeper_group,
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' and u.options_table_id is not null and ut.id is not null
              then format('Kept by the %s column of %s: it holds that column''s choices and opens from there.',
                          u.column_label, coalesce(nullif(ut.data ->> 'name', ''), 'a table'))
            when kw.word = 'choices' and u.options_table_id is not null
              then format('Kept by the %s column of a table you cannot open: it holds that column''s choices.', u.column_label)
            when kw.word = 'choices'
              then 'Kept for a column''s choices. No column uses it now, so only its own page opens it.'
            when kw.word = 'context' and sc.id is not null
              then format('Kept by the context system: it belongs to %s and opens from there.', sc.name)
            when kw.word = 'context' and coalesce((t.p ->> 'offered_as_context')::boolean, false)
              then format('Kept by the context system: each %s in it is a context you can pick for an agent, and opens on its own page.',
                          lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record')))
            when kw.word = 'context'
              then 'Kept by the context system.'
            when kw.word = 'checklists'
              then 'Kept by checklists: the steps of every checklist run in this organization.'
            when kw.word = 'bookings'
              then format('Kept by bookings: the times people are holding on %s.',
                          coalesce(nullif(regexp_replace(coalesce(t.data ->> 'name', ''), '^Slots for ', ''), ''), 'a booking page'))
            when kw.word = 'workflow' and wt.id is not null
              then format('Kept by the workflow of %s: the states its records move through.', coalesce(nullif(wt.data ->> 'name', ''), 'a table'))
            when kw.word = 'workflow'
              then 'Kept by a table''s workflow: the states its records move through.'
            when kw.word = 'store'
              then 'Part of the store itself: every table is built on it.'
            when kw.word = 'app' and kw.ref is not null
              then 'Kept by the app: ' || case kw.ref
                     when 'view' then 'the saved views of the tables here.'
                     when 'comment' then 'the comments people leave on records.'
                     when 'form' then 'the forms made on the tables here.'
                     when 'dashboard' then 'the dashboards made on the tables here.'
                     when 'action' then 'the action inbox.'
                     when 'checklist' then 'the checklist runs.'
                     when 'slots' then 'the times people are holding on a booking page.'
                     when 'demo' then 'a demonstration of the app''s screens.'
                     when 'shapeproof' then 'a demonstration of the app''s screens.'
                     else 'its own bookkeeping.' end
            when kw.word = 'app' then 'Kept by the app.'
            else format('Kept by %s.', replace(kw.word, '_', ' '))
          end as keeper_says,
          case
            when kw.word = 'context' and sc.id is not null then 'scope'
            when kw.word = 'choices' and ut.id is not null then 'table'
            when kw.word = 'workflow' and wt.id is not null then 'table'
          end as used_in_kind,
          case
            when kw.word = 'context' and sc.id is not null then sc.id
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_id,
          case
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_table_id
      ) s on true;
end;
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
           'this_call_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  -- What the caller sent as the definition. Never the table and never the filters (both have
  -- their own place above), and never the hand-set order (custom.view_record_order_set's).
  v_in      jsonb := coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                                   then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                                        - 'order'::text
                              end, '{}'::jsonb);
  v_row     record;
  v_def     jsonb;
  v_cleared text[];
  v_set     jsonb;
  v_keys    jsonb;
  v_levels  integer;
  v_old     jsonb := '{}'::jsonb;
  -- VIEW-SWITCH: whether the view being written IS the table's default (its designation).
  v_was_default boolean := false;
  -- ORDER-FIX: the one order word a caller may send. A hand-set order is written by placing
  -- the rows (custom.view_record_order_set); a caller may only turn it off ("sorted").
  v_order_in text := case when jsonb_typeof(p_spec -> 'definition') = 'object'
                          then nullif(p_spec -> 'definition' ->> 'order', '') end;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- ── ORDER-FIX: A VIEW'S ORDER IS ITS SORT OR ITS HAND-SET ORDER, NEVER BOTH. A caller may say
  -- "sorted" (stop using the hand-set order); "manual" is written only by placing the rows.
  if v_order_in is not null and v_order_in <> 'sorted' then
    raise exception 'A view is put in a hand-set order by placing its rows, not by naming the word "%".', v_order_in
      using errcode = '22023',
            hint = 'Place the rows with custom.view_record_order_set; send order "sorted" (or a sort) to go back to a sort. Nothing was written.';
  end if;

  -- ── GRID-PRIMITIVES G7: `layout` IS THE VIEW'S KIND; THE GRID'S CHOICES ARE `grid`. A settings
  -- OBJECT sent as `layout` (G1's shape) is moved under `grid` rather than refused.
  if jsonb_typeof(v_in -> 'layout') = 'object' then
    v_in := (v_in - 'layout'::text)
            || jsonb_build_object('grid', coalesce(case when jsonb_typeof(v_in -> 'grid') = 'object'
                                                        then v_in -> 'grid' end, '{}'::jsonb)
                                          || (v_in -> 'layout'));
  end if;

  -- A key sent as JSON null means "clear it"; every other key sent replaces that one key.
  select coalesce(array_agg(e.key) filter (where jsonb_typeof(e.value) = 'null'), '{}'::text[]),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb)
    into v_cleared, v_set
    from jsonb_each(v_in) e;

  -- ── S1-PRIME VIEW-KEYS: A KEY CLEARED MUST BE A KEY. Clearing a setting no view has is the same
  -- misspelling as setting one.
  if exists (select 1 from unnest(v_cleared) c(k)
              where not exists (select 1 from custom.view_keys() r where r.path = c.k)) then
    raise exception 'A saved view has no setting called "%", so there is nothing to clear.',
                    (select c.k from unnest(v_cleared) c(k)
                      where not exists (select 1 from custom.view_keys() r where r.path = c.k) limit 1)
      using errcode = '22023', hint = 'The settings a view keeps are listed by custom.view_keys(). Nothing was written.';
  end if;

  -- ONE HIDDEN-COLUMN LIST. A caller that names hidden columns by Field ID (`hidden_fields`, the
  -- mover's shape) has them written where the grid and the gallery read them —
  -- `presentation.hiddenFields`, by Field KEY; the ids stay only as provenance under
  -- `moved_from.hidden_fields` when the view was moved in. Two lists of one thing drift.
  if jsonb_typeof(v_set -> 'hidden_fields') = 'array' then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb) into v_keys
      from jsonb_array_elements_text(v_set -> 'hidden_fields') x(fid)
      join custom.record f
        on f.organization_id = p_organization_id and f.id::text = x.fid
       and f.data_class = 'field' and f.data ->> 'key' is not null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    if jsonb_typeof(v_set -> 'moved_from') = 'object' then
      v_set := jsonb_set(v_set, '{moved_from,hidden_fields}', v_set -> 'hidden_fields', true);
    end if;
    v_set := jsonb_set(v_set - 'hidden_fields'::text, '{presentation}',
                       coalesce(case when jsonb_typeof(v_set -> 'presentation') = 'object'
                                     then v_set -> 'presentation' end, '{}'::jsonb)
                       || jsonb_build_object('hiddenFields', v_keys), true);
  end if;

  if v_id is not null then
    select sv.* into v_row
      from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
       for update;
    if v_row.id is null then
      raise exception 'There is no such saved view here.' using errcode = '23503',
              hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('id', v_id)::text;
    end if;
    v_old := coalesce(v_row.definition, '{}'::jsonb);
  end if;

  -- ── S1-PRIME VIEW-KEYS: EVERY KEY SENT IS JUDGED BY THE REGISTRY, AND THE FILTER BY THE ONE
  -- COMPILER, BEFORE ANYTHING IS WRITTEN. `moved_from` is the server's and is not judged here.
  v_set := (custom.view_keys_check(p_organization_id, p_table_id, v_set - 'moved_from'::text,
                                   v_old))
           || coalesce(case when v_set ? 'moved_from' then jsonb_build_object('moved_from', v_set -> 'moved_from') end, '{}'::jsonb);
  -- ── VIEW-SWITCH-NOT-DESIGNATION (VERIFIER-21, 2026-09-25): LOOKING AT A TABLE IS NOT DECIDING
  -- HOW IT OPENS. The table's default view — its `is_default` and its `layout` — is the
  -- table's DESIGNATION: how it opens for everyone. It is changed by one deliberate act, by someone
  -- who may edit the table: `custom.view_designate`. This door (VIEWER on the table) keeps every
  -- other setting of every view, but never the designation, so pressing Kanban or Calendar can
  -- never again open a member's table in the owner's last look.
  if v_id is not null then
    v_was_default := coalesce(v_row.is_default, false) or (v_old -> 'is_default') = 'true'::jsonb;
    if v_was_default
       and ((v_set ? 'layout' and (v_set ->> 'layout') is distinct from coalesce(v_old ->> 'layout', 'grid'))
            or 'layout' = any(v_cleared)) then
      raise exception 'Looking at this table as a % does not change how it opens for everyone, so it was not saved onto its default view.',
                      coalesce(v_set ->> 'layout', 'grid')
        using errcode = '22023',
              hint = 'The table''s default layout is changed only by "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
    end if;
    if (v_set ? 'is_default' and (v_set -> 'is_default') is distinct from to_jsonb(v_was_default))
       or ('is_default' = any(v_cleared) and v_was_default) then
      raise exception 'Which view a table opens on is chosen with "Make this the default", not by saving a view.'
        using errcode = '22023',
              hint = 'Use custom.view_designate, by someone who can edit the table. Nothing was written.';
    end if;
  elsif (v_set -> 'is_default') = 'true'::jsonb
        and exists (select 1 from platform.saved_view sv
                     where sv.organization_id = p_organization_id and sv.deleted_at is null
                       and sv.surface_key = 'custom/records'
                       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
                       and (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb)) then
    raise exception 'This table already has a default view, so a new view cannot be saved as it.'
      using errcode = '22023',
            hint = 'Save the view, then use "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
  end if;

  -- ── VIEW-LOOK (VERIFIER-23 item 1, 2026-09-25): A LOOK IS YOURS UNTIL YOU SAVE IT. A saved view
  -- is how everybody who opens it sees the table; choosing a board's grouping, a calendar's date
  -- field, a sort, a filter, a hidden column or a width while looking is the person's OWN look
  -- (custom.view_look_set) until someone who may EDIT the table saves it onto the view. So a
  -- change to a view that already exists needs editor on the table — or the view is the caller's
  -- own and is not the table's default. Saving a NEW view is unchanged (viewer).
  if v_id is not null then
    if not custom.query_is_store_owner()
       and custom.query_principal() is not null
       and not (v_row.created_by is not distinct from custom.query_principal() and not v_was_default)
       and not custom.has_visibility(custom.query_principal(), 'record', p_table_id, 'editor'::public.permission_level) then
      raise exception 'Only someone who can edit this table saves a change onto its view "%" for everyone, so your change was not saved onto it.', v_row.name
        using errcode = '42501',
              hint = 'Your own look at this view is kept for you alone (custom.view_look_set) and "Reset to view" returns to it; someone who can edit the table presses "Save to view". Nothing was written.';
    end if;
  end if;

  -- `filters` is the FLAT map the digests and the notifier read (custom.agg_view_admits); a Rule
  -- expression there would be refused by name the first time a subscription asks it, so it is
  -- refused here, with where it belongs.
  if p_spec ? 'filters' and v_filters <> '{}'::jsonb then
    if custom.filter_is_rule(v_filters) then
      raise exception 'A view''s filters are the flat Field-to-value map, and this is a Rule expression.'
        using errcode = '22023', hint = 'Send a nested question as definition.where (S2-PRIME); the digests and the notifier read filters. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, v_filters);
  end if;

  if v_id is not null then
    -- MERGE. What the caller did not send stays exactly as it was.
    v_def := coalesce(v_row.definition, '{}'::jsonb);
    v_set := v_set - 'moved_from'::text;
    v_cleared := array_remove(v_cleared, 'moved_from');
    if jsonb_typeof(v_set -> 'grid') = 'object' and jsonb_typeof(v_def -> 'grid') = 'object' then
      v_set := jsonb_set(v_set, '{grid}', (v_def -> 'grid') || (v_set -> 'grid'));
    end if;
    v_def := (v_def - v_cleared) || v_set;
    if p_spec ? 'filters' then
      v_def := jsonb_set(v_def, '{filters}', v_filters, true);
    end if;
    -- The table is the view's for life.
    v_def := jsonb_set(v_def, '{table_id}', to_jsonb(p_table_id), true);
    if not (v_def ? 'filters') then
      v_def := jsonb_set(v_def, '{filters}', '{}'::jsonb, true);
    end if;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  else
    -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
    -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
    -- view saved here needs no translation before a subscription can be written over it.
    -- THE CASTS ARE NOT DECORATION (42725 without them: `jsonb - text` vs `jsonb - text[]`).
    v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters) || v_set;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  end if;

  -- ── ORDER-FIX: CHOOSING A SORT REPLACES THE HAND-SET ORDER (Airtable's rule: a manual order is
  -- one of a view's sorts, and picking a column sort replaces it). The positions stay on the
  -- view's row, so placing the rows again starts from the order the person last kept.
  if v_def ->> 'order' = 'manual'
     and (v_order_in = 'sorted'
          or (jsonb_typeof(v_set -> 'sorts') = 'array' and jsonb_array_length(v_set -> 'sorts') > 0)) then
    v_def := jsonb_set(v_def, '{order}', '"sorted"'::jsonb, true);
  end if;

  -- ── S1-PRIME VIEW-KEYS: THE KEYS THAT MUST AGREE, ASKED OF THE VIEW AS IT WILL BE STORED.
  if nullif(v_def ->> 'swimlane_field', '') is not null
     and v_def ->> 'swimlane_field' = v_def ->> 'group_field' then
    raise exception 'The swimlanes and the columns are both %, so every lane would hold one column.', v_def ->> 'swimlane_field'
      using errcode = '22023', hint = 'A swimlane cuts the board by a second field. Nothing was written.';
  end if;
  v_levels := case when jsonb_typeof(v_def -> 'presentation' -> 'grouping') = 'object'
                   then 1 + coalesce(case when jsonb_typeof(v_def -> 'presentation' -> 'grouping' -> 'then') = 'array'
                                          then jsonb_array_length(v_def -> 'presentation' -> 'grouping' -> 'then') end, 0)
                   else 0 end;
  if v_levels > 3 then
    raise exception 'A view groups at most three levels deep, and this one would group %.', v_levels
      using errcode = '22023', hint = 'Nothing was written.';
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = coalesce(v_name, name), definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._carried_back_value(p_org uuid, p_store_type text, p_options uuid, p_older_type text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if p_store_type = 'list' and p_options is not null then
    if jsonb_typeof(p_value) = 'array' then
      return (select coalesce(jsonb_agg(coalesce(
                 (select to_jsonb(o.data ->> 'name') from custom.record o
                   where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
                     and o.data ->> 'name' is not null
                     and (o.id::text = e.v #>> '{}' or o.data ->> 'key' = e.v #>> '{}' or o.data ->> 'name' = e.v #>> '{}'
                          or o.metadata ->> 'option_key' = e.v #>> '{}'
                          or (coalesce(o.metadata ->> 'option_key', '') = '' and custom.choice_slug(o.data ->> 'name') = e.v #>> '{}'))
                   order by (o.deleted_at is null) desc limit 1), e.v) order by e.n), '[]'::jsonb)
                from jsonb_array_elements(p_value) with ordinality e(v, n));
    end if;
    return coalesce(
      (select to_jsonb(o.data ->> 'name') from custom.record o
        where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
          and o.data ->> 'name' is not null
          and (o.id::text = p_value #>> '{}' or o.data ->> 'key' = p_value #>> '{}' or o.data ->> 'name' = p_value #>> '{}'
               -- CHOICE-COLUMN-EDIT: a cell holds the option's KEY (metadata.option_key, or the slug of its
               -- words for an option the mover left unkeyed); the older cell takes the option's words.
               or o.metadata ->> 'option_key' = p_value #>> '{}'
               or (coalesce(o.metadata ->> 'option_key', '') = '' and custom.choice_slug(o.data ->> 'name') = p_value #>> '{}'))
        order by (o.deleted_at is null) desc limit 1),
      p_value);
  end if;
  if p_older_type in ('json', 'object', 'array') and jsonb_typeof(p_value) = 'string' then
    begin
      return (p_value #>> '{}')::jsonb;
    exception when others then
      return p_value;
    end;
  end if;
  return p_value;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._drill_lookup_words(p_token text, p_column text, p_ids text[] DEFAULT NULL::text[], p_where jsonb DEFAULT NULL::jsonb, p_word text DEFAULT NULL::text, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s       record;
  v_conds text[] := '{}';
  k       text;
  v       jsonb;
  v_out   jsonb;
begin
  -- CHAIR-ENTITY-BLOCKS-3: A PERSON (token `user`) reads as her name, among the people she shares an
  -- organization with (platform._drill_person_words); iam.users has no name column to read as her.
  if p_token = 'user' then
    return platform._drill_person_words(p_ids, p_word, p_limit);
  end if;
  -- the token's table through the registry's own door (custom.entity_table): the registry rows are not
  -- readable by a signed-in person directly, so platform.entity_read_source answered nothing as her
  select et.schema_name, et.table_name into s from custom.entity_table(p_token) et;
  if s.table_name is null
     or not has_table_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), 'select')
     or not has_column_privilege(current_user, format('%I.%I', s.schema_name, s.table_name), p_column, 'select') then
    return '[]'::jsonb;
  end if;
  if p_ids is not null then
    v_conds := v_conds || format('t.id::text = any (%L::text[])', p_ids);
  elsif platform._drill_column(s.schema_name, s.table_name, 'deleted_at') is not null then
    v_conds := v_conds || 't.deleted_at is null'::text;   -- a choice list offers live rows only
  end if;
  if p_word is not null then
    v_conds := v_conds || format('(t.%I::text = %L or lower(t.%I::text) = lower(%L))', p_column, p_word, p_column, p_word);
  end if;
  for k, v in select e.key, e.value from jsonb_each(coalesce(p_where, '{}'::jsonb)) e loop
    if v = 'null'::jsonb then
      v_conds := v_conds || format('t.%I is null', k);
    elsif jsonb_typeof(v) = 'object' and v ? 'empty' then
      v_conds := v_conds || format('t.%I is %s null', k, case when (v ->> 'empty')::boolean then '' else 'not' end);
    else
      v_conds := v_conds || format('t.%I::text = %L', k, v #>> '{}');
    end if;
  end loop;
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', x.id, ''word'', x.w) order by x.o), ''[]'') from ('
    || 'select t.id::text as id, t.%I::text as w, row_number() over (order by %s) as o from %I.%I t%s order by %s limit %s'
    || ') x where x.w is not null',
    p_column,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    s.schema_name, s.table_name,
    case when cardinality(v_conds) > 0 then ' where ' || array_to_string(v_conds, ' and ') else '' end,
    case when p_sort is not null then format('t.%I nulls last, t.id', p_sort) else 't.id' end,
    greatest(coalesce(p_limit, 500), 1))
    into v_out;
  return v_out;
end
$function$;
