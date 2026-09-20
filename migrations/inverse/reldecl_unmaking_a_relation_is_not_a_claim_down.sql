-- INVERSE of migrations/campaign/reldecl_unmaking_a_relation_is_not_a_claim.sql
-- Puts the relation contract back to enforcing a row that is being withdrawn, and puts the
-- link withdrawal back AFTER the column change - so unmaking a relation is refused by the
-- relation contract itself: 'the field Crew behaves as text, so it declares no relation'.

CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb;
  v_tables   uuid[];
  v_mode     text;
  v_live     integer;
  v_max      integer;
  v_other    uuid;
  v_ttable   uuid;
  v_src_org  uuid;
  v_tgt_org  uuid;
  v_opened   boolean;
  v_names    text;
  v_loop     boolean;
begin
  -- GATE ONE, and it is structural: an edge nobody declared as a relation is not this
  -- trigger's business, whatever the switch says.
  if new.relation_field_id is null then
    return new;
  end if;

  -- GATE TWO, the switch. `custom/associations_guard` holds the MEANING of these columns off.
  -- A relation edge written while it is off is returned untouched rather than half-enforced:
  -- half a contract is the silent failure this system is built to refuse.
  if not platform.relations_are_on(new.organization_id) then
    return new;
  end if;

  d := platform.relation_declaration(new.organization_id, new.relation_field_id);

  -- ------------------------------------------------------------------ REL-10, the role itself
  if coalesce(new.role, '') <> coalesce(d ->> 'key', '') then
    raise exception 'this relation is stored under the role "%" but its field is called "%"',
      coalesce(new.role, '<none>'), coalesce(d ->> 'key', '<none>')
      using errcode = '23514',
            hint = 'REL-10: a relation is an association whose `role` IS the field key. They are the same string or the edge belongs to no field.';
  end if;

  -- ------------------------------------------------------------------------- REL-12, the wall
  select r.organization_id into v_src_org from custom.record r where r.id = new.source_id limit 1;
  select r.organization_id, r.table_id into v_tgt_org, v_ttable
    from custom.record r where r.id = new.target_id limit 1;

  v_opened := false;
  if v_tgt_org is not null and v_tgt_org is distinct from new.organization_id then
    -- REC-29's ONE opening, read off the Table the relation STARTS at - the same column
    -- `custom.assert_organization_wall` reads, never a second flag.
    select coalesce((t.data ->> 'cross_organization_relations')::boolean, false) into v_opened
      from custom.record s join custom.record t on t.id = s.table_id
     where s.id = new.source_id limit 1;
    -- 🚨 VIS-2 (2026-09-19) — BOTH ORGANIZATIONS, NOT ONE. Same rule, same two
    -- knobs and the same sentence as `custom.assert_organization_wall`: the Table the
    -- relation STARTS at has to allow it, and both organizations have to have turned
    -- cross-organization links on. One organization's flag is not consent from the other.
    if not (coalesce(v_opened, false)
            and custom.cross_organization_links_open(new.organization_id, v_tgt_org)) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = format('REC-29 / REL-12 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                            case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                            case when custom.cross_organization_links_open(new.organization_id, new.organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                            case when custom.cross_organization_links_open(v_tgt_org, v_tgt_org) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end);
    end if;
  end if;
  if v_src_org is not null and v_src_org is distinct from new.organization_id then
    raise exception 'the record this relation starts at belongs to a different organization'
      using errcode = '23503',
            hint = 'REC-29 / REL-12 / T15: organizations are hard walls. An edge is stamped with the organization of the record it starts at; a relation cannot be filed under an organization that does not own its own source.';
  end if;

  -- --------------------------------------------------------------- REL-8, the target's token
  v_mode := d ->> 'target_mode';
  if v_mode <> 'any' then
    select array_agg((t #>> '{}')::uuid) into v_tables
      from jsonb_array_elements(coalesce(d -> 'target_tables', '[]'::jsonb)) t;
    if new.target_type <> 'record' then
      raise exception 'this relation points at tables of ours, and "%" is not one of them', new.target_type
        using errcode = '23514',
              hint = 'REL-8: a relation whose target mode is one or several names tables in this organization. To point at anything registered, declare target_mode `any`.';
    end if;
    if v_ttable is null or not (v_ttable = any (v_tables)) then
      select string_agg(coalesce(t.data ->> 'name', t.id::text), ', ' order by t.data ->> 'name')
        into v_names from custom.record t where t.id = any (v_tables);
      raise exception 'this relation points at %, and that record is not one of them',
        coalesce(v_names, 'a table it does not name')
        using errcode = '23514',
              hint = 'REL-8: target_mode `one` allows exactly the declared table, `several` allows exactly the declared list, and `any` allows anything. Widen the declaration or point at a record of a table it allows.';
    end if;
  end if;

  -- ------------------------------------------------------------------- REL-7, the cardinality
  v_max := case when d ->> 'cardinality' = 'at_most_one' then 1
                else greatest(coalesce((d ->> 'max')::integer, 1), 1) end;
  select count(*) into v_live
    from platform.associations a
   where a.source_type = new.source_type and a.source_id = new.source_id
     and a.role = new.role and a.deleted_at is null
     and a.relation_field_id is not null
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
     limit 1;
    if v_max = 1 then
      raise exception 'this points at one thing at a time, and it already points at %',
        coalesce(platform.relation_label(new.organization_id, new.target_type, v_other), v_other::text)
        using errcode = '23514',
              hint = 'REL-7: cardinality is `at most one` or `many`. Remove the one that is there, or let the field point at many.';
    end if;
    raise exception 'this points at at most % things and already points at that many', v_max
      using errcode = '23514',
            hint = 'REL-7: the field''s own relation_max is the cap. Remove one, or raise the cap on the field.';
  end if;

  -- ------------------------------------------------------------------------ REL-5, the loops
  if not coalesce((d ->> 'loops')::boolean, false) then
    with recursive walk(id, depth) as (
      select new.target_id, 1
      union all
      select a.target_id, w.depth + 1
        from walk w
        join platform.associations a
          on a.source_id = w.id
         and a.relation_field_id = new.relation_field_id
         and a.deleted_at is null
       where w.depth < 32
    )
    select exists (select 1 from walk where id = new.source_id) into v_loop;
    if coalesce(v_loop, false) then
      raise exception 'that would make this point back at itself through the same relation'
        using errcode = '23514',
              hint = 'REL-5 / T11: a relation says whether loops are allowed. This one does not allow them - set loops on the field to let two records point at each other along it. The walk follows this relation only, so two DIFFERENT relations between the same two records were never a loop.';
    end if;
  end if;

  return new;
end;
$function$

;

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
    -- SEAT-SUITES: a column that was indexed stays indexed when it changes what it holds,
    -- unless the patch says otherwise. `custom._field_document_for` builds a fresh document
    -- and knows nothing about either setting, so without this a retype silently un-promoted
    -- the column and the index went on standing for a shape that no longer exists.
    if coalesce(p_patch -> 'promoted', v_old -> 'promoted') is not null then
      v_next := v_next || jsonb_build_object('promoted', coalesce(p_patch -> 'promoted', v_old -> 'promoted'));
    end if;
    if coalesce(p_patch -> 'unique', v_old -> 'unique') is not null then
      v_next := v_next || jsonb_build_object('unique', coalesce(p_patch -> 'unique', v_old -> 'unique'));
    end if;
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

    -- ── RELATION-DECLARE, 2026-09-20: A COLUMN THAT STOPS POINTING TAKES ITS LINKS. ─────
    -- Retyping a relation column to text left its edges LIVE in platform.associations, still
    -- naming a field that no longer behaves as a relation - and platform.relations_to then
    -- raised 23514 for EVERY record of the table it used to point at. One column took down
    -- the whole reverse side of another table. The links go in the same operation as the
    -- change that made them meaningless, softly, so REL-13's history keeps its record of them.
    if (v_old ->> 'type') = 'relation'
       and ((v_next ->> 'type') is distinct from 'relation'
            or (v_next ->> 'relation_target') is distinct from (v_old ->> 'relation_target')) then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        case when (v_next ->> 'type') is distinct from 'relation'
             then format('"%s" no longer points at other records',
                         coalesce(v_next ->> 'label', v_next ->> 'key'))
             else format('"%s" now points at a different table',
                         coalesce(v_next ->> 'label', v_next ->> 'key')) end);
    end if;

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
  -- SEAT-SUITES: THE TWO SETTINGS THIS DOOR ACCEPTED AND THREW AWAY. `custom.promote_field`
  -- reads `promoted` and `unique` off the Field document to decide whether to build an index
  -- and whether it is a unique one. Neither had an arm here, so `custom.field_update(field,
  -- {"promoted":true,"unique":true})` returned the field id, reported success and changed
  -- nothing — and no person could ever ask for an indexed or a unique column through any
  -- door. Measured from the seat `authenticated` on the main database, 2026-09-19:
  -- promote_field answered `"unique": false` after the door said yes. Same class as T12,
  -- which STORE-T closed for `plain` and `type`; these are the last two.
  if p_patch ? 'promoted'       then v_next := jsonb_set(v_next, '{promoted}', to_jsonb(coalesce((p_patch ->> 'promoted')::boolean, false))); end if;
  if p_patch ? 'unique'         then v_next := jsonb_set(v_next, '{unique}', to_jsonb(coalesce((p_patch ->> 'unique')::boolean, false))); end if;
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

CREATE OR REPLACE FUNCTION custom.field_retire(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  jsonb;
  v_table  uuid;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_added  integer;
  v_title  text;
  v_names  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_retire');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_retire');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_field, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was removed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door removes a field from a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514',
            hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_retire',
                                          'admin'::public.permission_level, 'table');

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;

  -- THE SET THAT IS GOING. The field, and every field of this same table that works out its
  -- answer through it - and then every field that works out ITS answer through one of those.
  -- A lookup that feeds a rollup goes in the same operation as the relation both read.
  v_going := array[p_field_id];
  v_keys  := array[v_field ->> 'key'];
  loop
    v_added := array_length(v_going, 1);
    select coalesce(array_agg(x.id), '{}'::uuid[]), coalesce(array_agg(x.key), '{}'::text[])
      into v_going, v_keys
      from (
        select f.id as id, f.data ->> 'key' as key
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = v_table
           and (f.id = any (v_going)
                or f.data -> 'config' ->> 'via'  = any (v_keys)
                or f.data -> 'config' ->> 'of'   = any (v_keys)
                or f.data -> 'config' ->> 'pick' = any (v_keys))
      ) x;
    exit when array_length(v_going, 1) = v_added;
  end loop;

  -- REC-2. The title goes nowhere, and the refusal says which field in the set is the title.
  v_title := v_spec ->> 'title_field';
  if v_title = any (v_keys) then
    select string_agg('"' || custom.said(f.data ->> 'label', f.data ->> 'key') || '"', ', ' order by f.data ->> 'key')
      into v_names
      from custom.record f
     where f.organization_id = p_organization_id and f.id = any (v_going);
    raise exception 'Removing "%" would also remove %, and one of those is "%" - what every record of this table is called.',
                    custom.said(v_field ->> 'label', 'that field'), v_names, v_title
      using errcode = '23514',
            hint = 'REC-2: a record is shown as a chip with the value of its title field. Make another field the title first, and then this removal takes the whole set in one operation.';
  end if;

  -- REC-1. A table keeps at least one field, and the refusal says how many the set would take.
  if jsonb_array_length(coalesce(v_spec -> 'fields', '[]'::jsonb)) <= array_length(v_going, 1) then
    raise exception 'A table keeps at least one field, and removing "%" would take all % of them.',
                    custom.said(v_field ->> 'label', 'that field'),
                    array_length(v_going, 1)::text
      using errcode = '23514',
            hint = 'REC-1: a table has to declare its fields. Add another field first, and then this removal goes through.';
  end if;

  -- The field records go first: a retirement is not a change of shape (custom.is_a_retirement),
  -- so every guard lets the whole set through in ONE statement, and the table is then left
  -- declaring only fields that exist.
  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id();

  update custom.record
     set data = jsonb_set(data, '{fields}', (
           select coalesce(jsonb_agg(f), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) f
            where not (f ->> 'name' = any (v_keys)))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  -- ── RELATION-DECLARE, 2026-09-20: AND THE LINKS GO WITH THE COLUMNS. ─────────────────
  -- The column was gone and its edges were live, naming a field that no longer exists, which
  -- is the same 23514 a retype caused on the other table's reverse side. The whole going set
  -- is withdrawn in one statement, through the one withdrawal both this and custom.field_update
  -- call, so a removal never leaves a relation behind it.
  perform custom.relation_edges_withdraw(p_organization_id, v_going,
    format('the column "%s" was removed', custom.said(v_field ->> 'label', v_field ->> 'key')));

  return true;
end
$function$

;

