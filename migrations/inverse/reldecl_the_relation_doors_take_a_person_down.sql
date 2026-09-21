-- INVERSE of migrations/campaign/reldecl_the_relation_doors_take_a_person.sql
-- Restores the eleven relation surfaces exactly as they stood before lane RELATION-DECLARE —
-- SECURITY INVOKER over custom.record, deciding nothing but the organization's store switch —
-- so every one of them again answers a signed-in person `permission denied for table record`,
-- and the reverse side of a record again shows the titles of records nobody shared.
-- It also removes the two readers this lane added and the eleven door rows.

CREATE OR REPLACE FUNCTION platform.relation_declaration(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         record;
  v_flavor  text;
  v_mode    text;
  v_card    text;
  v_on_del  text;
  v_bind    text;
  v_targets uuid[];
  v_owned   boolean;
begin
  perform platform.assert_relations_door(p_organization_id);

  select r.id, r.organization_id, r.data into f
    from custom.record r
   where r.id = p_field_id
     and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     and r.deleted_at is null
   limit 1;
  if not found then
    raise exception 'there is no field % in this organization', p_field_id using errcode = '23503';
  end if;
  if coalesce(f.data ->> 'type', '') <> 'relation' then
    raise exception 'the field % behaves as %, so it declares no relation',
      coalesce(f.data ->> 'name', p_field_id::text), coalesce(nullif(f.data ->> 'type', ''), 'nothing')
      using errcode = '23514',
            hint = 'FLD-1 / REL-10: only a field whose behavior is `relation` carries a relation. A list field points at an options Table and is not this.';
  end if;

  -- REL-1. OWNERSHIP IS THE CONTAINED TABLE'S FACT, NOT THE FIELD'S. The Field says what it
  -- points at; the TABLE it points at says whether being pointed at means being contained. A
  -- Field that writes the word itself is refused, which is the only way "stored once" can be
  -- more than a sentence.
  if f.data ? 'flavor' or f.data -> 'config' ? 'flavor' then
    raise exception 'the field % cannot declare whether the relation owns what it points at',
      coalesce(f.data ->> 'name', p_field_id::text)
      using errcode = '23514',
            hint = 'REL-1 / V-39: ownership is ONE fact, stored once - on the table being pointed at, as `contained_by_relation`, because it is that table''s records that are or are not contained. Every field pointing at it reads the same answer, so two fields can never disagree about it. Declare it on the table.';
  end if;

  v_mode := lower(coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one'));
  if not (v_mode = any (platform.relation_target_modes())) then
    raise exception 'the field % points at "%", and a relation points at one table, several, or any',
      coalesce(f.data ->> 'name', p_field_id::text), v_mode
      using errcode = '23514',
            hint = 'REL-8: target_mode is one of ' || array_to_string(platform.relation_target_modes(), ', ') || '.';
  end if;

  if v_mode = 'one' then
    v_targets := array[nullif(f.data ->> 'relation_target', '')::uuid];
    if v_targets[1] is null then
      raise exception 'the field % points at one table and does not say which',
        coalesce(f.data ->> 'name', p_field_id::text) using errcode = '23514', hint = 'FLD-13 / REL-8: relation_target.';
    end if;
  elsif v_mode = 'several' then
    select array_agg((t #>> '{}')::uuid) into v_targets
      from jsonb_array_elements(coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb)) t;
    if v_targets is null or array_length(v_targets, 1) is null then
      raise exception 'the field % points at several tables and names none of them',
        coalesce(f.data ->> 'name', p_field_id::text)
        using errcode = '23514',
              hint = 'REL-8: target_mode `several` carries config.target_tables, the list of tables it may point at. One table is target_mode `one`; no list at all is target_mode `any`.';
    end if;
  else
    v_targets := null;   -- `any`: polymorphic without restriction
  end if;

  -- REL-1, read from the field's side. Mode `any` has no single contained table to ask, so a
  -- polymorphic relation is `referenced` and says so rather than guessing per target.
  v_owned := false;
  if v_mode = 'one' then
    select coalesce((t.data ->> 'contained_by_relation')::boolean, false) into v_owned
      from custom.record t
     where t.id = v_targets[1] and t.deleted_at is null
       and (t.organization_id = p_organization_id or t.data_class = 'kernel')
     limit 1;
  end if;
  v_flavor := case when coalesce(v_owned, false) then 'owned' else 'referenced' end;

  -- REL-7, from W1-FIELD's own column: 1 is a foreign key, anything larger is many.
  v_card := case when coalesce((f.data ->> 'relation_max')::integer, 0) = 1
                 then 'at_most_one' else 'many' end;

  -- REL-2, SEPARATE from flavor: the Field's own word wins, and the default merely differs by
  -- flavor because that is the useful default, never because the two are one property.
  v_on_del := lower(coalesce(nullif(f.data ->> 'on_target_delete', ''),
                             case when v_flavor = 'owned' then 'cascade' else 'set_null' end));
  if not (v_on_del = any (platform.relation_on_delete_actions())) then
    raise exception 'the field % says "%" happens when the thing it points at is deleted',
      coalesce(f.data ->> 'name', p_field_id::text), v_on_del
      using errcode = '23514',
            hint = 'REL-2: on_target_delete is one of ' || array_to_string(platform.relation_on_delete_actions(), ', ') || ', and it is a property of its own - an owned relation may restrict, and a referenced one may cascade.';
  end if;

  v_bind := lower(coalesce(nullif(f.data -> 'config' ->> 'binding', ''), 'live'));
  if not (v_bind = any (platform.relation_bindings())) then
    raise exception 'the field % is bound "%" to what it points at',
      coalesce(f.data ->> 'name', p_field_id::text), v_bind
      using errcode = '23514',
            hint = 'REL-3: binding is one of ' || array_to_string(platform.relation_bindings(), ', ') || '. `live` follows the target; `snapshot` freezes a copy in the relation''s own payload at write time.';
  end if;

  return jsonb_build_object(
    'field_id',    f.id,
    'key',         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
    'flavor',      v_flavor,
    'on_delete',   v_on_del,
    'binding',     v_bind,
    'ordered',     coalesce((f.data -> 'config' ->> 'ordered')::boolean, false),
    'loops',       coalesce((f.data -> 'config' ->> 'loops')::boolean, false),
    -- REL-6: default OFF on referenced, ON for owned - and the maximum level it carries is a
    -- word of its own, so "it carries" and "how much it carries" never collapse into one flag.
    'carries',     coalesce((f.data -> 'config' ->> 'carries')::boolean, v_flavor = 'owned'),
    'carries_max', coalesce(nullif(f.data -> 'config' ->> 'carries_max', ''), 'editor'),
    'cardinality', v_card,
    'max',         greatest(coalesce((f.data ->> 'relation_max')::integer, 1), 1),
    'target_mode', v_mode,
    'target_tables', case when v_targets is null then null else to_jsonb(v_targets) end,
    'inverse_key', nullif(f.data ->> 'inverse_key', '')
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
begin
  -- REL-14. The label is READ, never stored on the edge: a stored label is a copy that goes
  -- stale the moment the target is renamed, and T4's "nothing migrates" depends on the chip
  -- following the record rather than a copy of its old name.
  if p_target_type = 'record' then
    -- A record of ours: the title is the value of ITS TABLE'S declared title field.
    select r.data ->> (t.data ->> 'title_field') into v_title
      from custom.record r
      join custom.record t on t.id = r.table_id
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
    if v_title is null then
      -- W1-TIER's external stub keeps the cached title of a row that is not ours.
      select l.cached_title into v_title
        from custom.external_link l
       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    return v_title;
  end if;

  -- Any other registered token: the registry says which column carries its title, and it is
  -- read dynamically rather than guessed. A token with no title column has no label, and
  -- returning null is the honest answer - never the id wearing a name.
  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;
  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_field(p_organization_id uuid, p_record_id uuid, p_field_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_field uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_table is null then
    raise exception 'there is no record % in this organization', p_record_id using errcode = '23503';
  end if;
  select f.id into v_field
    from custom.record f
   where f.deleted_at is null
     and (f.organization_id = p_organization_id or f.data_class = 'kernel')
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = p_field_key
   limit 1;
  if v_field is null then
    raise exception 'this record''s table has no field called "%"', p_field_key
      using errcode = '23503',
            hint = 'REL-10: a relation''s `role` IS the field key, so a role with no field behind it would be an edge nothing declares. Declare the field first.';
  end if;
  return v_field;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relations_from(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, target_type text, target_id uuid, "position" integer, label text, flavor text, binding text, snapshot jsonb, field_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  return query
    select a.role, a.target_type, a.target_id, a.position,
           -- REL-14: hydrated here, at read, and never stored on the row.
           platform.relation_label(p_organization_id, a.target_type, a.target_id),
           d.declaration ->> 'flavor', d.declaration ->> 'binding',
           a.payload, a.relation_field_id
      from platform.associations a
      cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id) as declaration) d
     where a.organization_id = p_organization_id
       and a.source_type = 'record' and a.source_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
     order by a.role, a.position nulls last, a.created_at;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relations_to(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, source_type text, source_id uuid, "position" integer, label text, flavor text, field_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  -- REL-9 / C-12a. THE REVERSE END IS A WHERE CLAUSE. This function reads THE SAME ROWS
  -- `platform.relations_from` reads - one table, one row per relation - and differs from it in
  -- exactly two identifiers: it matches on `target_id` and returns `source_id`. There is no
  -- second stored row, no inverse edge written anywhere, and no second Field: `inverse_key` on
  -- the declaration is a LABEL for this query's result, never a thing that is stored.
  return query
    select a.role, a.source_type, a.source_id, a.position,
           platform.relation_label(p_organization_id, a.source_type, a.source_id),
           d.declaration ->> 'flavor', a.relation_field_id
      from platform.associations a
      cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id) as declaration) d
     where a.organization_id = p_organization_id
       and a.target_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
     order by a.role, a.position nulls last, a.created_at;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_delete_effects(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(action text, role text, other_type text, other_id uuid, label text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  -- Every LIVE relation POINTING AT this record, read from the reverse end (REL-9) - because
  -- what happens when a record is deleted is decided by the relations that point AT it, never by
  -- the ones it points FROM. Reading it any other way answers the wrong question confidently.
  return query
    select platform.relation_declaration(p_organization_id, a.relation_field_id) ->> 'on_delete',
           a.role, a.source_type, a.source_id,
           platform.relation_label(p_organization_id, a.source_type, a.source_id)
      from platform.associations a
     where a.organization_id = p_organization_id
       and a.target_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
     order by a.role, a.created_at;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_on_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e         record;
  v_names   text;
  v_cascade uuid[] := '{}';
  v_detach  integer := 0;
  v_ext     text;
begin
  -- THE SWITCH, by name: platform.assert_relations_door resolves custom/system_enabled
  -- through custom.store_is_open, so while that knob is off for an organization this
  -- surface answers only the role that owns platform.associations.
  perform platform.assert_relations_door(p_organization_id);

  -- RESTRICT FIRST, AND IT NAMES THEM. T7's own sentence is "refused, NAMING them", so the
  -- refusal carries the labels `platform.relation_label` hydrates at read - never a count, and
  -- never the ids, which tell the person nothing about what is in their way.
  select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action = 'restrict';
  if v_names is not null then
    raise exception 'this is still used by %, so it was not deleted', v_names
      using errcode = '23503',
            hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
  end if;

  -- CASCADE. An external row is not ours to delete - the REL-8 ruling makes external targets
  -- read-only in v1 - and a cascade that quietly skipped one would be a deletion the caller
  -- believes happened.
  select string_agg(distinct x.other_type, ', ') into v_ext
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action in ('cascade', 'set_null') and x.other_type <> 'record';
  if v_ext is not null then
    raise exception 'something outside this system (%) is attached to this, and nothing here can change it', v_ext
      using errcode = '0A000',
            hint = 'REL-N-1 / the REL-8 ruling: a relation may POINT at a row behind a connection, and in this version nothing writes back down it. Detach it in the system it lives in, or use that source''s own write-through - a relation is not a route into somebody else''s database.';
  end if;

  for e in select * from platform.relation_delete_effects(p_organization_id, p_record_id) loop
    if e.action = 'cascade' then
      v_cascade := v_cascade || e.other_id;
    elsif e.action = 'set_null' then
      -- THE VALUE GOES TOO, AND IT GOES FIRST. T7's own sentence is "deleting a Tag DETACHES
      -- from everything it touched", and until 2026-09-19 this arm withdrew the EDGE and left
      -- the id sitting in the relating record's document — the fourth pass measured exactly
      -- that: "detach-everywhere left the pointer dangling at a record that no longer exists".
      -- REL-11 says nothing ABOUT a relation is stored in the value; WHICH record it points at
      -- is the value, so detaching has to take it. The document write re-runs
      -- `custom._relation_associations`, which withdraws the edge from the same one place
      -- every other relation write does, and the statement below then finds nothing left to do
      -- — which is the point: there is one withdrawal, not two that can disagree.
      if e.other_type = 'record' then
        update custom.record r
           set data = case
                 when jsonb_typeof(r.data -> e.role) = 'array'
                   then jsonb_set(r.data, array[e.role],
                          coalesce((select jsonb_agg(x)
                                      from jsonb_array_elements(r.data -> e.role) x
                                     where (x #>> '{}') is distinct from p_record_id::text),
                                   '[]'::jsonb))
                 else r.data - e.role
               end
         where r.organization_id = p_organization_id
           and r.id = e.other_id
           and r.deleted_at is null
           and r.data ? e.role;
      end if;
      update platform.associations a
         set deleted_at = now()
       where a.organization_id = p_organization_id
         and a.source_id = e.other_id and a.role = e.role
         and a.target_id = p_record_id and a.deleted_at is null;
      v_detach := v_detach + 1;
    end if;
  end loop;

  -- The cascade DELETES nothing here: it RETURNS the records the delete has to take with it, so
  -- the one delete verb (`custom.record_delete`, W1-STORE's) stays the only thing that deletes a
  -- record - T7's "one delete verb throughout" survives this file rather than being quietly
  -- forked by it. `W3-MIG` wires the returned list into that verb.
  return jsonb_build_object(
    'restricted_by', '[]'::jsonb,
    'detached',      v_detach,
    'cascade_to',    to_jsonb(v_cascade));
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_set(p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_field  uuid;
  t        jsonb;
  i        integer := 0;
  v_type   text;
  v_id     uuid;
  v_written integer := 0;
begin
  perform platform.assert_relations_door(p_organization_id);
  v_field := platform.relation_field(p_organization_id, p_record_id, p_field_key);
  d := platform.relation_declaration(p_organization_id, v_field);

  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'the targets of a relation are a list, and this is %', jsonb_typeof(p_targets)
      using errcode = '22023',
            hint = 'REL-7: a relation points at at most one thing, or at many - both are written as a list, so the shape never has to change when the cardinality does. One target is a list of one.';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    i := i + 1;
    -- REL-N-1's reference shape: `{"entity": <token>, "row_id": <uuid>}`, W1-TIER's
    -- custom.relation_target_ours. A bare uuid means a record of ours, which is what every
    -- relation between two custom records is.
    if jsonb_typeof(t) = 'string' then
      v_type := 'record'; v_id := (t #>> '{}')::uuid;
    else
      v_type := coalesce(nullif(t ->> 'entity', ''), 'record');
      v_id   := nullif(t ->> 'row_id', '')::uuid;
    end if;
    if v_id is null then
      raise exception 'target % of this relation names no row', i using errcode = '22004';
    end if;

    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position,
       relation_field_id, origin, payload_kind, payload, created_by)
    values
      ('record', p_record_id, v_type, v_id, p_organization_id, p_field_key,
       case when (d ->> 'ordered')::boolean then i else null end,
       v_field, 'campaign',
       case when d ->> 'binding' = 'snapshot' then 'relation_snapshot' else null end,
       case when d ->> 'binding' = 'snapshot'
            then platform.relation_snapshot_of(p_organization_id, v_type, v_id) else null end,
       (select auth.uid()))
    on conflict (source_type, source_id, target_type, target_id, role) do update
      set position          = excluded.position,
          relation_field_id = excluded.relation_field_id,
          origin            = excluded.origin,
          payload_kind      = excluded.payload_kind,
          payload           = excluded.payload,
          deleted_at        = null;
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_unset(p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- A relation is UNMADE the way every edge in this platform is: soft, so the reverse end and
  -- the history both keep their record of it (REL-13).
  update platform.associations a
     set deleted_at = now()
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_snapshot_of(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb;
  v_table  uuid;
begin
  -- REL-3: a FROZEN COPY, taken now, living in the relation's own payload. Nothing in it
  -- points into History - there is no version and no row_version id to resolve against, which
  -- is exactly the difference the law names.
  if p_target_type = 'record' then
    select r.data, r.table_id into v_values, v_table
      from custom.record r
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
  end if;
  return jsonb_build_object(
    'taken_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'title',    platform.relation_label(p_organization_id, p_target_type, p_target_id),
    'table_id', v_table,
    'values',   coalesce(v_values, '{}'::jsonb));
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.relation_history(p_organization_id uuid, p_association_id uuid)
 RETURNS TABLE(version integer, operation text, at_time timestamp with time zone, actor_id uuid, role text, target_type text, target_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  return query
    -- `history.row_versions` stamps the moment in `occurred_at`; it carries no `created_at`
    -- (measured on the branch 2026-09-18, which is how this was caught: the whole function
    -- failed 42703 the first time anything asked a relation for its history).
    select v.version, v.operation, v.occurred_at, v.actor_id,
           v.row_data ->> 'role',
           v.row_data ->> 'target_type',
           nullif(v.row_data ->> 'target_id', '')::uuid
      from history.row_versions v
     where v.entity_type = 'agent_surface_binding'
       and v.row_id = p_association_id
       and v.organization_id = p_organization_id
     order by v.version, v.occurred_at;
end;
$function$

;

delete from platform.client_callable_door
 where schema_name = 'platform'
   and declared_by = 'RELATION-DECLARE';

drop function if exists platform.relation_edges_without_a_live_field();
drop function if exists platform.relation_edge_has_a_live_field(uuid, uuid);
-- 🚨 `platform.relation_withheld_label` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21).
-- REL-DISP adopted it: `custom._words_for` (`reldisp_a_relation_says_which_words_it_shows.sql`)
-- returns it on the live card-label path, and ARGS-RULED's `platform.relation_label` returns it
-- too. It is a one-line constant sentence, it carries none of this lane's behaviour, and
-- dropping it would make every withheld relation label raise instead of saying what it says.
-- The defect this file restores is carried entirely by the doors and the two edge functions
-- above, all of which are taken back; the label is left where it is.
--   drop function if exists platform.relation_withheld_label();   -- deliberately NOT dropped
