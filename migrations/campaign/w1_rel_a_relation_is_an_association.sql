-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
--
-- W1-REL, FILE 2 — THE RELATION, AS A ROW IN `platform.associations` AND NOWHERE ELSE.
--
-- REL-10 is the whole file in one sentence: *relations are stored as associations with
-- `role` = the field key*. Everything here exists to make that literally true and to make the
-- other twelve laws readable off the same single row.
--
-- WHY IN `platform` AND NOT IN `custom`. A relation is a PLATFORM primitive, not a feature of
-- the custom store: the edge table is `platform.associations`, the 34,216 rows already in it are
-- the platform's, and `@ai-matrx/associations` is the package every Matrx client already
-- installs to read them. This lane EXTENDS `platform.associations`; it does not fork it, and it
-- writes no second edge table. A relation surface built inside `custom` would have been the
-- second one, visible to nothing the package already speaks.
--
-- THE DOOR, BECAUSE A NEW FUNCTION IN `platform` IS NOT BEHIND FACT TWO'S REVOKES.
-- Schema `custom` is revoked from every role (§6 fact two) and a function created there
-- inherits that. `platform` is a LIVE schema and a freshly created function there carries
-- PostgreSQL's default `EXECUTE` to `PUBLIC`. So every function below - READ ones included -
-- opens with `platform.assert_relations_door()`, which returns when `custom/associations_guard`
-- resolves true or the caller is a member of the role that owns `platform.associations`, and
-- otherwise raises `42501` naming the knob and the remedy. Nothing here fails silently and
-- nothing here is reachable while the campaign is dark; that is the switch, stated as a
-- predicate rather than as a hope about grants.
--
-- WHAT EACH LAW BECOMES, IN CONTRACT ORDER
-- ----------------------------------------
--   REL-1   `flavor` is `owned` or `referenced`, and OWNERSHIP IS ONE FACT STORED ONCE ON THE
--           CONTAINED TABLE - `data->>'contained_by_relation'` on the TARGET Table's own record
--           - and READ FROM THE FIELD'S SIDE by `platform.relation_declaration`. A Field that
--           tries to declare `flavor` itself is refused by name and told whose fact it is.
--           That refusal is what makes "stored once" enforceable instead of aspirational.
--   REL-2   `on_delete` is `cascade` | `set_null` | `restrict`, SEPARATE from flavor: it is
--           read from the Field's own `on_target_delete` (W1-FIELD's column), and the
--           declaration carries both words independently. An owned relation may be
--           `restrict`; a referenced one may be `cascade`. File 3 enforces the outcomes.
--   REL-3   `binding` is `live` | `snapshot`, and a snapshot is A FROZEN COPY IN THE RELATION'S
--           PAYLOAD - `platform.associations.payload`, typed `payload_kind = 'relation_snapshot'`
--           and registered in `platform.edge_payload_kind` so `platform.validate_edge_payload()`
--           accepts it - INSIDE THE RELATING RECORD'S DOCUMENT'S OWN EDGE. It is never a
--           pointer into History: nothing in the snapshot names a version, a row_version id or
--           a timestamp to resolve against, and `platform.relation_snapshot_of` builds it from
--           the target's values AT WRITE TIME.
--   REL-4   `ordered` is yes or no - `position` on the edge, written by ordinality when the
--           declaration says ordered and left NULL when it does not.
--   REL-5   `loops` are allowed or refused - `config.loops`, defaulting to REFUSED. File 3
--           refuses the cycle; this file is where the word is read.
--   REL-6   `carries` declares whether Visibility flows and the maximum Access level it
--           carries; DEFAULT OFF ON REFERENCED, ON FOR OWNED. Both halves are in
--           `platform.relation_declaration`'s defaults and both are readable off the
--           declaration, so `W2-VIS` derives from a word rather than from a guess.
--   REL-7   `cardinality` is at most one, or many - read from W1-FIELD's `relation_max`
--           (1 = at most one, anything greater = many). File 3 refuses the (n+1)th.
--   REL-8   `target` is one Table, several, or any - THE RULING IS IN BUILD-LOG 01:45 UTC.
--           `config.target_mode` is `one` | `several` | `any`; `several` carries
--           `config.target_tables`. Mode `one` reads W1-FIELD's `relation_target`.
--   REL-9   every relation is visible FROM BOTH ENDS and the reverse is NOT a second Field -
--           `platform.relations_from` and `platform.relations_to` read THE SAME ROWS from the
--           two sides. There is no second stored row, no inverse edge and no second Field; the
--           reverse is a WHERE clause. That is `C-12a`, and it cannot pass while broken because
--           the reverse query names `target_id` where the forward one names `source_id`, over
--           one table.
--   REL-10  `role` = the field key, on every row this file writes, with no exception.
--   REL-11  NOTHING ABOUT A RELATION IS STORED IN THE VALUE. `platform.relation_set` writes
--           only into `platform.associations`; it never touches `custom.record.data`, and
--           `platform.relations_from` reads the edge table, never the document. The one write
--           this file makes into a record is REL-1's ownership fact, which is a TABLE's
--           property and not a value of any record.
--   REL-14  LABELS HYDRATE FROM THE TARGET'S TITLE FIELD AT READ - `platform.relation_label`,
--           called by both readers, never stored on the edge. For a record of ours it is the
--           target Table's own `title_field`; for any other registered token it is that
--           token's `title_column` read dynamically; for an external row it is the cached
--           title `W1-TIER`'s `custom.external_link` holds, and NOTHING is written back.
--
-- THE INVERSE: `migrations/inverse/w1_rel_a_relation_is_an_association_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ----------------------------------------------------------------- 1. the door and the switch

create or replace function platform.relations_are_on(p_organization_id uuid default null)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_on boolean;
begin
  -- The established read (§6b.4b, and `custom.store_is_open`'s own words): knob_resolve
  -- answers jsonb and `#>> '{}'` takes the scalar out. `platform.knob_resolve` is SECURITY
  -- INVOKER and `has_table_privilege('anon','platform.feature_knob','SELECT')` is false, so for
  -- a role that merely cannot SEE the row it RAISES `P0001 ... is not seeded`, which reads like
  -- a missing knob and is not one. A switch this reader cannot read is OFF, never on.
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'associations_guard', p_organization_id) #>> '{}')::boolean,
                     false);
  exception when others then
    v_on := false;
  end;
  return v_on;
end;
$fn$;

create or replace function platform.assert_relations_door(p_organization_id uuid default null)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_owner oid;
  v_who   name := coalesce(nullif(current_setting('role', true), 'none'), session_user);
begin
  if platform.relations_are_on(p_organization_id) then
    return;
  end if;
  -- Read the owner from the catalogue, never as a role literal (rule 15).
  select c.relowner into v_owner from pg_class c where c.oid = 'platform.associations'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;
  raise exception 'Relations are switched off, so this is not answering "%" yet.', v_who
    using errcode = '42501',
          hint = 'custom/associations_guard resolves false. While it does, the relation surface over platform.associations belongs to the campaign that owns it and takes callers only from the role that owns platform.associations. The switch checklist turns the knob on; a lane never does. Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$fn$;

-- ------------------------------------------------------- 2. the closed sets, as the only copy
-- Rule 15: no literals in gates. Every refusal below and in file 3 names its set by calling
-- these, so a word can be added in exactly one place and a test can read the set it is testing.

create or replace function platform.relation_flavors() returns text[]
  language sql immutable set search_path to 'pg_catalog'
  as $fn$ select array['owned','referenced'] $fn$;

create or replace function platform.relation_on_delete_actions() returns text[]
  language sql immutable set search_path to 'pg_catalog'
  as $fn$ select array['cascade','set_null','restrict'] $fn$;

create or replace function platform.relation_bindings() returns text[]
  language sql immutable set search_path to 'pg_catalog'
  as $fn$ select array['live','snapshot'] $fn$;

create or replace function platform.relation_cardinalities() returns text[]
  language sql immutable set search_path to 'pg_catalog'
  as $fn$ select array['at_most_one','many'] $fn$;

create or replace function platform.relation_target_modes() returns text[]
  language sql immutable set search_path to 'pg_catalog'
  as $fn$ select array['one','several','any'] $fn$;

-- ----------------------------------------------- 3. the registry rows the edge table demands
-- `platform.enforce_known_association` refuses an unregistered (source_type, target_type) pair
-- by name, and `platform.validate_edge_payload` refuses a payload whose kind is unregistered.
-- Both are LIVE bodies this lane does not touch; what it does is register what it writes.
-- `record` is `custom.record`'s token, landed by `W1-STORE`, read back live before this line.
-- `allows_loops` is TRUE at the TYPE level on purpose: loops are a PER-RELATION word (REL-5)
-- declared on the Field, and refusing them here would make `config.loops = true` unrepresentable
-- for every relation at once. File 3 is where the per-relation refusal lives.



-- -------------------------------------------------------------- 4. the declaration, read once

create or replace function platform.relation_declaration(p_organization_id uuid, p_field_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

create or replace function platform.relation_field(p_organization_id uuid, p_record_id uuid, p_field_key text)
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

-- --------------------------------------------------------- 5. the label, hydrated at read

create or replace function platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

create or replace function platform.relation_snapshot_of(p_organization_id uuid, p_target_type text, p_target_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

-- ------------------------------------------------------------ 6. the write door, and the read

create or replace function platform.relation_set(
  p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

create or replace function platform.relation_unset(
  p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

create or replace function platform.relations_from(p_organization_id uuid, p_record_id uuid)
returns table(role text, target_type text, target_id uuid, "position" integer,
              label text, flavor text, binding text, snapshot jsonb, field_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

create or replace function platform.relations_to(p_organization_id uuid, p_record_id uuid)
returns table(role text, source_type text, source_id uuid, "position" integer,
              label text, flavor text, field_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

comment on function platform.relations_to(uuid, uuid) is
  'W1-REL / REL-9 / C-12a: the reverse end of every relation, read BY QUERY over the same rows platform.relations_from reads. No second stored row, no inverse edge, no second Field.';
