-- chair-step: this GRANTs EXECUTE on ONE new function, custom.table_duplicate(uuid, boolean, text, uuid), to `authenticated`, after declaring it in platform.client_callable_door (signed-in callers only; anon gains nothing). It also REVOKEs PUBLIC's implicit EXECUTE on the three new internal helpers, custom._uuid_remap(jsonb, jsonb), custom._copied_metadata(jsonb) and custom._without_rows_of(jsonb, uuid, uuid), so no client can call them. Nothing else is granted, revoked, dropped or rewritten; no table, column, trigger or policy is touched; the only row written is the one door-register row. No strong lock: CREATE FUNCTION and one INSERT into the register. The schema-wide door-reopen sweep is held off for this transaction only (see "THE SWEEP" below) so the apply never contends for locks across `custom`.
-- lock: custom
-- lane: TABLE-ACTIONS
--
-- The inverse is `migrations/inverse/tableactions_a_table_can_be_duplicated_down.sql`.
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps a "Referral Intake Queue": who referred each
-- patient, the referral date, visits authorized, an intake status choice list, a link to the
-- patient's row in "Patients", a "Follow-up of" link back into the queue itself, a formula, and
-- two saved views ("New referrals this month", a board of physician referrals). The front desk
-- wants the same queue for the second clinic. Until this file the only way was to rebuild every
-- column, choice and view by hand. Now one call makes "Referral Intake Queue (copy)" with the same
-- columns, the same choices in the same order and colours, the same views pointing at the copy's
-- columns, and (when asked) the same rows.
--
-- WHAT IS COPIED
--   · the Table record: every setting and its look (decorations, default sort, row actions),
--     under a new name ("<name> (copy)", "(copy 2)", … when the name is taken in that
--     organization) and a new slug;
--   · every live Field (archived ones stay behind), with new ids;
--   · every choice list a Field uses, as a NEW choice list (its own Table, Fields and options:
--     words, colours, stable keys and order), so editing the copy's choices never edits the original's;
--   · every live saved view of the Table the caller may see (another person's "only me" view
--     stays theirs), with its filters, sorts, layout, and its own sharing as it was;
--   · with p_with_records, every live record the caller is handed as a list shows it
--     (custom.query_visible_ids at viewer; archived, quarantined, not-given rows and another
--     person's "only me" rows stay behind).
--   Every copied row keeps the source row's own sharing columns as they were (whole-row copy).
--
-- A COPY CARRIES ONLY WHAT THE CALLER CAN READ. The rows are the ones the store hands this
-- person (custom.query_visible_ids at viewer: the one ladder, then "Shown to"), and
-- each row's values go through the SAME field mask the read doors use (custom.read_mask_for for
-- this person, organization, Table and level, applied by custom.mask_document). A column this
-- person may not read (a "restricted" diagnosis, say) is still copied as a column, its values
-- are left empty, and the answer's left_behind.hidden_columns names it with how many values
-- stayed behind. RULING (lane manager, TABLE-ACTIONS fix round): a viewer of a shared table may
-- copy it into an organization of their own — Google Drive's default ("viewers can make a
-- copy"), defaults lean open — and because of the mask they copy exactly what they can see.
--
-- HOW IDS ARE KEPT POINTING AT THE RIGHT THING (the remap). The store names a Field by its KEY
-- almost everywhere (record values, sorts, filters, group/date/image fields, hidden columns,
-- widths in `presentation`, lookups' via/of/pick), and keys are copied unchanged — so those need
-- nothing. The places that name a Field, a Table, an option, a view or a record BY ID are
-- rewritten through one map (custom._uuid_remap, old id -> new id, any letter case) applied to
-- the whole document:
--     Table      data.decorations.color_by.field, .rules[].field, .rows{<record id>},
--                .cells{<record id>}{<field id>}; data.row_actions[].steps[].field / .value;
--                any other id the Table document holds
--     Field      data.entity_definition_id; data.relation_target when it is the Table itself
--                (a link to ANOTHER Table keeps pointing at that Table); data.config.options_table_id;
--                data.config.expr {"field": <id>} (formulas); a default naming a row
--     View       definition.table_id; definition.where.args[].field / {const: <record id>};
--                definition.filters values; definition.grid.widths{<id>};
--                metadata.record_positions{<record id>} (hand-set order)
--     Record     a link value naming another row of the same Table
--   An id the map does not hold (another Table, a person, a file) is left exactly as it was.
--
-- A ROW THAT WAS NOT COPIED IS NEVER POINTED AT. After the remap, any id still naming a row of
-- the SOURCE table (always, without records; with records, a row that stayed behind) is taken
-- out by custom._without_rows_of: a condition that names it (anything with an "op": a view's
-- where-clause node, a colour rule) is dropped whole; a step's "value" is cleared to null; any
-- other key holding it, or keyed by it, is dropped; an and/or left empty is dropped. Each
-- document that lost such a reference is named in left_behind.row_references_dropped. Census
-- on the clone 2026-10-02 of every Table, Field, view and Rule document: record ids sit only in
-- decorations.rows/.cells keys, view metadata.record_positions keys, and Table parent_id (a
-- Home, never a row of the copied table); where-constants, filter values, step values and
-- field defaults are the shapes the store accepts and are handled the same way.
--
-- WHAT IS NOT COPIED (said in the answer too): archived fields and records, the source's
-- history, forms, booking pages, portals, dashboards, capture sheets, rules (validation,
-- membership, digests), webhooks, Tables nested inside its rows, per-person view looks,
-- sharing grants, and comments. A view that names a membership Rule (`rule_id`) keeps naming
-- the source's Rule. Airtable's "Duplicate table" draws the same line.
--
-- RIGHTS. The caller must be able to open the source (custom.where_id_opens: the organization
-- wall or a share, then the ladder at viewer) and must be a MEMBER of the destination
-- organization (the copy is a new Table there, and the store lets any member declare a Table —
-- custom.table_declare asks exactly custom.assert_client_may_reach + custom.assert_store_door).
-- A portal client is not a member and cannot make a copy.
--
-- HISTORY. One history.migration_log row on the NEW table (verb "duplicate", note "Duplicated
-- from <name>"); every row the copy writes carries that event's id in history.row_versions.
-- The source is read, never written: no version, no event, no outbox row.
--
-- THE SWEEP. Every CREATE FUNCTION / GRANT / REVOKE fires platform_reopen_declared_doors, which
-- walks EVERY closed schema re-granting declared doors and closing undeclared client grants; on
-- the clone it hit its 2 s lock timeout six times per apply. This file needs none of it: the one
-- client door is declared in platform.client_callable_door and THEN granted (the order the
-- definer guard requires and honours on its own), and the three helpers are revoked from PUBLIC
-- explicitly below. So the sweep is held off for this transaction with its own re-entrancy mark
-- (platform.closed_schema_sweep, transaction-local, reset at the end of the file); the
-- per-function ddl guards still run. Proof: the resulting ACLs are read back after the apply.

select set_config('platform.closed_schema_sweep', '1', true);

create or replace function custom._uuid_remap(p_doc jsonb, p_map jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_text text;
  v_id   text;
begin
  if p_doc is null or p_map is null or p_map = '{}'::jsonb then
    return p_doc;
  end if;
  v_text := p_doc::text;
  -- Every uuid-shaped string in the document, values AND object keys, once each, in ANY letter
  -- case (the map's keys are uuid::text, lower case). A uuid is 36 fixed characters with no quote
  -- or backslash in it, so a plain replace cannot cut into anything else, and an id the map does
  -- not hold is left exactly as it was.
  for v_id in
    select distinct m[1]
      from regexp_matches(v_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'gi') m
  loop
    if p_map ? lower(v_id) then
      v_text := replace(v_text, v_id, p_map ->> lower(v_id));
    end if;
  end loop;
  return v_text::jsonb;
end;
$function$;

revoke execute on function custom._uuid_remap(jsonb, jsonb) from public;

comment on function custom._uuid_remap(jsonb, jsonb) is
  'TABLE-ACTIONS. Rewrites every id in a document that the map names (old id -> new id, any letter case), in values and in object keys; every other id is left as it was. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._copied_metadata(p_meta jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- What a copy of a record keeps of its metadata: only the system keys the platform registers
  -- for record-store rows (platform.metadata_reserved_keys, token 'record' — an option's stable
  -- key and position, a pick-list mark), minus where the ORIGINAL was moved in from, which is
  -- not true of the copy. Anything else a row picked up is not the copy's to carry.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(p_meta, '{}'::jsonb)) e
   where e.key <> 'moved_from'
     and exists (select 1 from platform.metadata_reserved_keys k
                  where k.table_token = 'record' and k.key = e.key);
$function$;

revoke execute on function custom._copied_metadata(jsonb) from public;

comment on function custom._copied_metadata(jsonb) is
  'TABLE-ACTIONS. The metadata a copied record-store row keeps: registered system keys only (platform.metadata_reserved_keys, token record), never moved_from. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._without_rows_of(p_doc jsonb, p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_out   jsonb;
  v_child jsonb;
  v_lost  boolean := false;
  e       record;
begin
  -- SQL NULL means "this whole value named a row that was not copied: take it out".
  if p_doc is null then
    return null;
  end if;
  case jsonb_typeof(p_doc)
    when 'string' then
      if (p_doc #>> '{}') ~* c_uuid
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.id = lower(p_doc #>> '{}')::uuid
                        and r.table_id = p_table_id) then
        return null;
      end if;
      return p_doc;
    when 'array' then
      v_out := '[]'::jsonb;
      for e in select value as v from jsonb_array_elements(p_doc) loop
        v_child := custom._without_rows_of(e.v, p_organization_id, p_table_id);
        if v_child is not null then
          v_out := v_out || jsonb_build_array(v_child);
        end if;
      end loop;
      return v_out;
    when 'object' then
      v_out := '{}'::jsonb;
      for e in select key as k, value as v from jsonb_each(p_doc) loop
        -- keyed BY a row (decorations.rows, record_positions): the entry goes.
        if e.k ~* c_uuid
           and exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id
                          and r.id = lower(e.k)::uuid
                          and r.table_id = p_table_id) then
          v_lost := true;
          continue;
        end if;
        v_child := custom._without_rows_of(e.v, p_organization_id, p_table_id);
        if v_child is null then
          v_lost := true;
          if e.k = 'value' then
            v_out := v_out || jsonb_build_object(e.k, 'null'::jsonb);   -- a step's value, cleared
          end if;
        else
          if v_child is distinct from e.v then
            v_lost := true;
          end if;
          v_out := v_out || jsonb_build_object(e.k, v_child);
        end if;
      end loop;
      if v_lost and p_doc ? 'op' then
        -- and / or / not keep what is left of their arguments; any other condition that named a
        -- row that is not here is dropped whole.
        if lower(coalesce(p_doc ->> 'op', '')) in ('and', 'or', 'not') then
          if jsonb_typeof(v_out -> 'args') = 'array' and jsonb_array_length(v_out -> 'args') > 0 then
            return v_out;
          end if;
          return null;
        end if;
        return null;
      end if;
      if v_lost and v_out = '{}'::jsonb then
        return null;                                   -- {"const": <row>} and its like
      end if;
      return v_out;
    else
      return p_doc;
  end case;
end;
$function$;

revoke execute on function custom._without_rows_of(jsonb, uuid, uuid) from public;

comment on function custom._without_rows_of(jsonb, uuid, uuid) is
  'TABLE-ACTIONS. Takes out of a document every reference to a row of the given Table: a condition (anything with an op) naming one is dropped whole, a "value" naming one is cleared to null, any other key holding or keyed by one is dropped. NULL when the whole value goes. Internal to custom.table_duplicate; no client grant.';

create or replace function custom.table_duplicate(
  p_table_id        uuid,
  p_with_records    boolean default false,
  p_name            text    default null,
  p_organization_id uuid    default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  -- THE MOST RECORDS ONE COPY CARRIES. Every record lands through the store's own guards (its
  -- checks, history capture, relation edges, outbox). Measured on the nightly copy 2026-10-02,
  -- set-based, from admin@admin.com's authenticated seat: ~5.5 ms a record on a one-column table
  -- (300 records 1.65 s), ~20 ms a record on a ten-column table with two links and two choice
  -- lists (20 records +0.4 s over a 1.4-4 s structure copy, the spread being the copy's load).
  -- A client call is cancelled at 8 s (authenticated's statement_timeout), so 100 keeps a wide
  -- table's whole copy inside one call with room to spare. Above it the person is told, never
  -- left with half a table. (custom.table_archive pages for the same reason; a paged copy is
  -- the follow-up if 100 proves too few.)
  c_most_records constant integer := 100;
  v_me         uuid := custom.query_principal();
  v_with       boolean := coalesce(p_with_records, false);
  v_opens      jsonb;
  v_id         uuid;
  v_from       uuid;
  v_to         uuid;
  v_src        custom.record;
  v_src_name   text;
  v_to_name    text;
  v_name       text;
  v_slug       text;
  v_base_slug  text;
  v_n          integer;
  v_new        uuid := gen_random_uuid();
  v_map        jsonb;
  v_parent     uuid;
  v_data       jsonb;
  v_live       bigint;
  v_cross      record;
  v_opt        record;
  v_new_opts   uuid;
  v_home       uuid;
  v_fields     integer := 0;
  v_lists      integer := 0;
  v_choices    integer := 0;
  v_views      integer := 0;
  v_records    integer := 0;
  v_k          integer;
  v_left_fields  bigint;
  v_left_records bigint;
  v_not_given    bigint := 0;
  v_private_views bigint := 0;
  v_event      uuid;
  v_self_keys  text[] := array[]::text[];
  v_dead_keys  text[] := array[]::text[];
  v_opt_dead   text[];
  -- THE READ MASK, the read doors' own (custom.read_records): who may read which column.
  v_level      public.permission_level;
  v_mask       jsonb;
  v_visible    text[];
  v_declared   text[];
  v_hidden     text[] := array[]::text[];
  v_hidden_out jsonb := '{}'::jsonb;
  v_refs_out   jsonb := '[]'::jsonb;
  v_stamp      jsonb;
  v_seen       uuid[] := array[]::uuid[];
begin
  if v_me is null then
    raise exception 'Sign in to duplicate a table.' using errcode = '42501';
  end if;
  if p_table_id is null then
    raise exception 'Say which table to duplicate.' using errcode = '22004';
  end if;

  -- READ ACCESS TO THE SOURCE: the store's one answer to "may this person open this id".
  v_opens := custom.where_id_opens(p_table_id);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    raise exception 'That table is not one you have been given, so nothing was copied.'
      using errcode = '42501',
            hint = 'The store says the same for a table you may not open and one that does not exist.';
  end if;
  v_from := (v_opens ->> 'organization_id')::uuid;
  v_id   := (v_opens ->> 'resolved_id')::uuid;
  -- THE DECISION, IN THIS BODY: the source organization's wall, asked here and not only inside
  -- custom.where_id_opens.
  perform custom.assert_client_may_reach(v_from, 'custom.table_duplicate');

  select r.* into v_src
    from custom.record r
   where r.organization_id = v_from and r.id = v_id;
  v_src_name := coalesce(nullif(btrim(v_src.data ->> 'name'), ''), 'This table');

  if v_src.data_class is distinct from 'table' then
    raise exception '% is part of how the record store is built, so it cannot be copied.', v_src_name
      using errcode = '42501';
  end if;
  if v_src.deleted_at is not null then
    raise exception '% is archived. Bring it back from the trash, then copy it.', v_src_name
      using errcode = '55000';
  end if;

  -- CREATE RIGHTS IN THE DESTINATION: a member of it, its record store open.
  v_to := coalesce(p_organization_id, v_from);
  select coalesce(nullif(btrim(o.name), ''), 'that organization') into v_to_name
    from iam.organizations o where o.id = v_to;
  if v_to_name is null or not iam.is_org_member(v_me, v_to) then
    raise exception 'You are not a member of that organization, so a copy of % cannot be made there.', v_src_name
      using errcode = '42501',
            hint = 'A table is copied only into an organization you belong to.';
  end if;
  perform custom.assert_client_may_reach(v_to, 'custom.table_duplicate');
  perform custom.assert_store_door(v_to, 'custom.table_duplicate');

  -- A COLUMN'S OWN TARGET NEVER CROSSES AN ORGANIZATION (custom.organization_references marks a
  -- Field's relation_target not openable). A copy into another organization whose column links
  -- to a different Table would be refused by the wall halfway through; it is refused here, by name.
  if v_to <> v_from then
    select f.data ->> 'label' as label, coalesce(t.data ->> 'name', 'another table') as target
      into v_cross
      from custom.record f
      left join custom.record t
        on t.organization_id = v_from and t.id = nullif(f.data ->> 'relation_target', '')::uuid
     where f.organization_id = v_from
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and nullif(f.data ->> 'relation_target', '') is not null
       and f.data ->> 'relation_target' <> v_id::text
     order by coalesce((f.data ->> 'sort')::integer, 0)
     limit 1;
    if found then
      raise exception '% links its column % to %, and a column cannot link across organizations. Copy it into %, or remove that column first.',
                      v_src_name, coalesce(v_cross.label, 'a link'), v_cross.target,
                      coalesce((select o.name from iam.organizations o where o.id = v_from), 'its own organization')
        using errcode = '55000';
    end if;
  end if;

  -- WHAT THIS PERSON MAY READ OF THE SOURCE: the same field mask custom.read_records asks, once.
  v_level := custom.effective_level(v_me, v_from, v_id);
  v_mask  := custom.read_mask_for(v_me, v_from, v_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  select coalesce(array_agg(d), '{}'::text[]) into v_hidden
    from unnest(v_declared) d where not (d = any (v_visible));

  -- THE MAP: old id -> new id for the Table, its live Fields, the views this person may see and
  -- (when asked) the live records this person may open. Choice lists and their options join it
  -- below as they are made.
  v_map := jsonb_build_object(v_id::text, v_new::text);
  v_map := v_map || coalesce((
    select jsonb_object_agg(f.id::text, gen_random_uuid()::text)
      from custom.record f
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text), '{}'::jsonb);
  v_map := v_map || coalesce((
    select jsonb_object_agg(sv.id::text, gen_random_uuid()::text)
      from platform.saved_view sv
     where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id
       and (sv.shown_to is distinct from 'only_me' or sv.created_by = v_me)), '{}'::jsonb);
  select count(*) into v_private_views
    from platform.saved_view sv
   where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id
     and sv.shown_to = 'only_me' and sv.created_by is distinct from v_me;
  if v_with then
    -- THE ROWS THIS PERSON IS HANDED: the store's one answer to "which rows of this Table may
    -- this person see, as a list shows them" (custom.query_visible_ids at viewer: the ladder, then
    -- "Shown to" — another person's "only me" rows stay theirs). Live, unquarantined rows only.
    v_seen := array(select q from custom.query_visible_ids(v_from, v_id, 'viewer') q);
    v_map := v_map || coalesce((
      select jsonb_object_agg(r.id::text, gen_random_uuid()::text)
        from custom.record r
       where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
         and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
         and r.id = any (v_seen)), '{}'::jsonb);
    select count(*) into v_live
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and v_map ? r.id::text;
    if v_live > c_most_records then
      raise exception '% has % records, more than one copy can carry (%). Copy it without its records, then import them.',
                      v_src_name, v_live, c_most_records
        using errcode = '54000';
    end if;
    select count(*) into v_not_given
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and not (v_map ? r.id::text);
  end if;

  -- THE NAME. A name the person gave is used as given; otherwise "<name> (copy)", then
  -- "(copy 2)", "(copy 3)", … until no live Table of the destination carries it.
  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    v_name := v_src_name || ' (copy)';
    v_n := 1;
    while exists (select 1 from custom.record t
                   where t.organization_id = v_to and t.table_id = custom.table_kernel_id()
                     and t.deleted_at is null and t.data ->> 'name' = v_name) loop
      v_n := v_n + 1;
      v_name := v_src_name || ' (copy ' || v_n || ')';
    end loop;
  end if;
  -- THE SLUG, made from the name the way custom._options_table_for makes one, and kept unique
  -- among the destination's live Tables.
  v_base_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g');
  v_base_slug := regexp_replace(v_base_slug, '^_+|_+$', '', 'g');
  if v_base_slug !~ '^[a-z]' then v_base_slug := 't_' || v_base_slug; end if;
  v_base_slug := left(v_base_slug, 56);
  v_slug := v_base_slug;
  v_k := 1;
  while exists (select 1 from custom.record t
                 where t.organization_id = v_to and t.table_id = custom.table_kernel_id()
                   and t.deleted_at is null and t.data ->> 'slug' = v_slug) loop
    v_k := v_k + 1;
    v_slug := v_base_slug || '_' || v_k;
  end loop;

  -- WHERE THE COPY LIVES: beside the source in its own organization; in another organization,
  -- in that organization's own record (made if the store never gave it one, as custom.table_move does).
  if v_to = v_from then
    v_parent := nullif(v_src.data ->> 'parent_id', '')::uuid;
  else
    v_parent := (select h.id from custom.record h
                  where h.organization_id = v_to and h.table_id = custom.organization_kernel_id()
                    and h.deleted_at is null order by h.created_at, h.id limit 1);
    if v_parent is null then
      insert into custom.record (organization_id, table_id, data)
      values (v_to, custom.organization_kernel_id(), jsonb_build_object('name', v_to_name))
      returning id into v_parent;
    end if;
  end if;

  -- THE ONE HISTORY ROW, ON THE NEW TABLE, written first so every row this statement writes
  -- carries its id (history.migration_record's mark). Undo is archiving the copy.
  v_event := history.migration_record(
    v_to, 'duplicate', 'table', v_new,
    jsonb_build_object('kind', 'none',
                       'why', 'A copy is undone by archiving it; the table it was copied from was never changed.',
                       'duplicated_from', v_id,
                       'duplicated_from_organization_id', v_from),
    format('Duplicated from %s', v_src_name));

  -- EVERY COPIED ROW IS THE SOURCE ROW, WHOLE, WITH ITS OWN SHARING COLUMNS AS THEY WERE: the
  -- row is read as one value and only what a copy changes is overwritten (ids, organization,
  -- documents, who made it and when). This stamp is what every copy overwrites.
  v_stamp := jsonb_build_object('organization_id', v_to, 'created_by', v_me, 'updated_by', v_me,
                                'created_at', now(), 'updated_at', now(), 'deleted_at', null,
                                'version', 1);

  -- EVERY CHOICE LIST, AS A NEW ONE. A choice list is itself a Table (FLD-5) whose records are
  -- the options, so it is copied the same way as the Table: its own Table record (in a Home of
  -- its own, as custom._options_table_for makes one), its Fields (a list may carry more than a
  -- title — "name" and "color" are common), and its live options with their words, colours,
  -- stable keys and order. Record values store the option's key, so they stay valid unchanged;
  -- editing the copy's choices never edits the original's. Choices are part of a column's
  -- definition, so they travel with the column even where the column's values are masked.
  for v_opt in
    select distinct o.id as opts_id
      from custom.record f
      join custom.record o
        on o.organization_id = v_from and o.id = (f.data -> 'config' ->> 'options_table_id')::uuid
       and o.table_id = custom.table_kernel_id() and o.data_class = 'table'
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
  loop
    v_new_opts := gen_random_uuid();
    v_lists := v_lists + 1;
    v_map := v_map || jsonb_build_object(v_opt.opts_id::text, v_new_opts::text);
    v_map := v_map || coalesce((
      select jsonb_object_agg(x.id::text, gen_random_uuid()::text)
        from custom.record x
       where x.organization_id = v_from
         and ((x.table_id = custom.field_kernel_id() and x.data_class <> 'kernel' and x.deleted_at is null
               and x.data ->> 'entity_definition_id' = v_opt.opts_id::text)
              or (x.table_id = v_opt.opts_id and x.data_class = 'record' and x.deleted_at is null))), '{}'::jsonb);

    insert into custom.record (organization_id, table_id, data)
    select v_to, custom.person_kernel_id(),
           jsonb_build_object('name', coalesce(nullif(o.data ->> 'name', ''), 'Choices') || ' Home')
      from custom.record o where o.organization_id = v_from and o.id = v_opt.opts_id
    returning id into v_home;

    insert into custom.record
    select (jsonb_populate_record(null::custom.record, to_jsonb(o) || v_stamp || jsonb_build_object(
              'id', v_new_opts,
              'data', custom._uuid_remap(o.data, v_map)
                      || jsonb_build_object(
                           'parent_id', v_home::text,
                           'slug', left(regexp_replace(coalesce(nullif(o.data ->> 'slug', ''), 'choices'),
                                                       '_[0-9a-f]{16,}$', '')
                                        || '_' || replace(gen_random_uuid()::text, '-', ''), 48)),
              'metadata', custom._copied_metadata(o.metadata)))).*
      from custom.record o where o.organization_id = v_from and o.id = v_opt.opts_id;

    insert into custom.record
    select (jsonb_populate_record(null::custom.record, to_jsonb(x) || v_stamp || jsonb_build_object(
              'id', v_map ->> x.id::text,
              'data', custom._uuid_remap(x.data, v_map),
              'metadata', custom._copied_metadata(x.metadata)))).*
      from custom.record x
     where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
       and x.data_class <> 'kernel' and x.deleted_at is null
       and x.data ->> 'entity_definition_id' = v_opt.opts_id::text
     order by coalesce((x.data ->> 'sort')::integer, 0), x.created_at;

    -- A value kept under an ARCHIVED column has no column in the copy: it stays behind with it.
    select coalesce(array_agg(distinct d.data ->> 'key'), array[]::text[]) into v_opt_dead
      from custom.record d
     where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
       and d.data_class <> 'kernel' and d.deleted_at is not null
       and d.data ->> 'entity_definition_id' = v_opt.opts_id::text
       and not exists (select 1 from custom.record l
                        where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                          and l.data_class <> 'kernel' and l.deleted_at is null
                          and l.data ->> 'entity_definition_id' = v_opt.opts_id::text
                          and l.data ->> 'key' = d.data ->> 'key');
    insert into custom.record
    select (jsonb_populate_record(null::custom.record, to_jsonb(x) || v_stamp || jsonb_build_object(
              'id', v_map ->> x.id::text,
              'table_id', v_new_opts,
              'data', custom._uuid_remap(x.data - '_values' - v_opt_dead, v_map),
              'metadata', custom._copied_metadata(x.metadata)))).*
      from custom.record x
     where x.organization_id = v_from and x.table_id = v_opt.opts_id
       and x.data_class = 'record' and x.deleted_at is null
     order by x.created_at, x.id;
    get diagnostics v_k = row_count;
    v_choices := v_choices + v_k;
  end loop;

  -- THE TABLE RECORD. Its settings and look, remapped, with every reference to a row that was
  -- not copied taken out; a person's copy, so never the app's.
  v_data := custom._uuid_remap(v_src.data, v_map);
  if custom._without_rows_of(v_data, v_from, v_id) is distinct from v_data then
    v_refs_out := v_refs_out || jsonb_build_array('the table''s colours or row actions');
  end if;
  v_data := coalesce(custom._without_rows_of(v_data, v_from, v_id), '{}'::jsonb)
            - 'kept_by_the_app' - 'kept_for';
  v_data := v_data || jsonb_build_object('name', v_name, 'slug', v_slug);
  if v_parent is not null then
    v_data := v_data || jsonb_build_object('parent_id', v_parent::text);
  end if;
  insert into custom.record
  select (jsonb_populate_record(null::custom.record, to_jsonb(v_src) || v_stamp || jsonb_build_object(
            'id', v_new, 'data', v_data, 'metadata', custom._copied_metadata(v_src.metadata)))).*;

  -- THE FIELDS, in two statements: the stored ones first, then the ones worked out from them
  -- (a formula's guard reads the Fields it names, so they have to be there).
  v_refs_out := v_refs_out || coalesce((
    select jsonb_agg('column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'))
      from custom.record f
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and custom._without_rows_of(custom._uuid_remap(f.data, v_map), v_from, v_id)
           is distinct from custom._uuid_remap(f.data, v_map)), '[]'::jsonb);
  insert into custom.record
  select (jsonb_populate_record(null::custom.record, to_jsonb(f) || v_stamp || jsonb_build_object(
            'id', v_map ->> f.id::text,
            'data', coalesce(custom._without_rows_of(custom._uuid_remap(f.data, v_map), v_from, v_id), '{}'::jsonb),
            'metadata', custom._copied_metadata(f.metadata)))).*
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_id::text
     and coalesce(f.data ->> 'type', '') <> 'formula' and coalesce(f.data ->> 'source', '') <> 'formula'
   order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at;
  get diagnostics v_k = row_count; v_fields := v_k;
  insert into custom.record
  select (jsonb_populate_record(null::custom.record, to_jsonb(f) || v_stamp || jsonb_build_object(
            'id', v_map ->> f.id::text,
            'data', coalesce(custom._without_rows_of(custom._uuid_remap(f.data, v_map), v_from, v_id), '{}'::jsonb),
            'metadata', custom._copied_metadata(f.metadata)))).*
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_id::text
     and (coalesce(f.data ->> 'type', '') = 'formula' or coalesce(f.data ->> 'source', '') = 'formula')
   order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at;
  get diagnostics v_k = row_count; v_fields := v_fields + v_k;

  -- THE VIEWS this person may see. Remapped; a condition or an order naming a row that was not
  -- copied is taken out; the copy's own; their sharing exactly as the source view's.
  v_refs_out := v_refs_out || coalesce((
    select jsonb_agg('view ' || sv.name)
      from platform.saved_view sv
     where v_map ? sv.id::text
       and (custom._without_rows_of(custom._uuid_remap(sv.definition - 'moved_from', v_map), v_from, v_id)
              is distinct from custom._uuid_remap(sv.definition - 'moved_from', v_map)
            or custom._without_rows_of(custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map), v_from, v_id)
              is distinct from custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map))), '[]'::jsonb);
  insert into platform.saved_view
  select (jsonb_populate_record(null::platform.saved_view, to_jsonb(sv) || v_stamp || jsonb_build_object(
            'id', v_map ->> sv.id::text,
            'subject_id', v_new,
            'definition', jsonb_set(coalesce(custom._without_rows_of(
                                      custom._uuid_remap(sv.definition - 'moved_from', v_map), v_from, v_id), '{}'::jsonb),
                                    '{table_id}', to_jsonb(v_new::text), true),
            'metadata', coalesce(custom._without_rows_of(
                                   custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map), v_from, v_id), '{}'::jsonb),
            'last_used_at', null,
            'published_to_web_at', null,
            'published_to_web_by', null))).*
    from platform.saved_view sv
   where sv.organization_id = v_from and v_map ? sv.id::text;
  get diagnostics v_views = row_count;

  -- THE RECORDS this person may open, set-based, through the read mask. Values are keyed by Field
  -- key, so they land as they are; a column this person may not read keeps its place in the copy
  -- and its values stay behind. The value envelope is stamped fresh by the store (these values
  -- were written now, by this person). A link to ANOTHER row of this same Table is judged as it
  -- lands ("points at a live record") and its target may land later in the same statement, so
  -- those columns are written in a second statement once every row exists — following the map
  -- to the copy's row. A link to a row that stayed behind is left empty, never the original.
  if v_with then
    select coalesce(array_agg(f.data ->> 'key'), array[]::text[]) into v_self_keys
      from custom.record f
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and f.data ->> 'relation_target' = v_id::text
       and not (f.data ->> 'key' = any (v_hidden));
    -- A value kept under an ARCHIVED column has no column in the copy: it stays behind with it.
    select coalesce(array_agg(distinct d.data ->> 'key'), array[]::text[]) into v_dead_keys
      from custom.record d
     where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
       and d.data_class <> 'kernel' and d.deleted_at is not null
       and d.data ->> 'entity_definition_id' = v_id::text
       and not exists (select 1 from custom.record l
                        where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                          and l.data_class <> 'kernel' and l.deleted_at is null
                          and l.data ->> 'entity_definition_id' = v_id::text
                          and l.data ->> 'key' = d.data ->> 'key');

    -- What the mask kept back, by column name, with how many values.
    select coalesce(jsonb_object_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), n.c), '{}'::jsonb)
      into v_hidden_out
      from custom.record f
      cross join lateral (
        select count(*) as c from custom.record r
         where r.organization_id = v_from and r.table_id = v_id and v_map ? r.id::text
           and jsonb_typeof(r.data -> (f.data ->> 'key')) is distinct from 'null'
           and r.data ? (f.data ->> 'key')) n
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and f.data ->> 'key' = any (v_hidden);

    insert into custom.record
    select (jsonb_populate_record(null::custom.record, to_jsonb(r) || v_stamp || jsonb_build_object(
              'id', v_map ->> r.id::text,
              'table_id', v_new,
              'data', custom._uuid_remap(
                        custom.mask_document(r.data - '_values' - v_dead_keys, v_visible, '{}'::jsonb,
                                             false, '{}'::jsonb, v_declared)
                        - v_hidden, v_map) - v_self_keys,
              'metadata', custom._copied_metadata(r.metadata)))).*
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and v_map ? r.id::text
     order by r.created_at, r.id;
    get diagnostics v_records = row_count;

    if cardinality(v_self_keys) > 0 then
      update custom.record x
         set data = x.data || p.patch
        from (select (v_map ->> r.id::text)::uuid as new_id,
                     jsonb_object_agg(k.key,
                       case jsonb_typeof(r.data -> k.key)
                         when 'string' then to_jsonb(v_map ->> lower(r.data ->> k.key))
                         else (select coalesce(jsonb_agg(to_jsonb(v_map ->> lower(e.v))), '[]'::jsonb)
                                 from jsonb_array_elements_text(r.data -> k.key) e(v)
                                where v_map ? lower(e.v))
                       end) as patch
                from custom.record r
                cross join unnest(v_self_keys) k(key)
               where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
                 and v_map ? r.id::text
                 and ((jsonb_typeof(r.data -> k.key) = 'string' and v_map ? lower(r.data ->> k.key))
                      or jsonb_typeof(r.data -> k.key) = 'array')
               group by r.id) p
       where x.organization_id = v_to and x.id = p.new_id;
    end if;
  end if;

  select count(*) into v_left_fields
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is not null
     and f.data ->> 'entity_definition_id' = v_id::text;
  select count(*) into v_left_records
    from custom.record r
   where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
     and (r.deleted_at is not null or coalesce(r.metadata ->> 'quarantine', 'false') = 'true');

  return jsonb_build_object(
    'duplicated', true,
    'table', jsonb_build_object('id', v_new, 'name', v_name),
    'from', jsonb_build_object('id', v_id, 'name', v_src_name, 'organization_id', v_from),
    'organization', jsonb_build_object('id', v_to, 'name', v_to_name),
    'copied', jsonb_build_object('fields', v_fields, 'choice_lists', v_lists, 'choices', v_choices,
                                 'views', v_views, 'records', v_records,
                                 'with_records', v_with),
    'left_behind', jsonb_build_object(
      'archived_fields', v_left_fields,
      'archived_records', case when v_with then v_left_records else null end,
      'records_not_yours_to_open', case when v_with then v_not_given else null end,
      'hidden_columns', v_hidden_out,
      'private_views', v_private_views,
      'row_references_dropped', v_refs_out,
      'not_copied', jsonb_build_array('history', 'forms', 'booking pages', 'portals', 'dashboards',
                                      'capture sheets', 'rules', 'webhooks', 'tables inside its rows',
                                      'sharing', 'comments')),
    'event_id', v_event,
    'path', '/data-v2/' || v_new::text);
end;
$function$;

comment on function custom.table_duplicate(uuid, boolean, text, uuid) is
  'TABLE-ACTIONS. Duplicates a Table the caller may open into an organization the caller is a member of (default: the same one): its settings and look, every live Field (new ids), every choice list as a new list (same words, keys, order), every live saved view (filters, sorts, layouts and every id inside them remapped to the copy), and with p_with_records every live record the caller may open, its values through the read doors'' own field mask (custom.read_mask_for + custom.mask_document: a column the caller may not read is copied empty and named in left_behind.hidden_columns); links within the Table follow to the copy, links to other Tables stay, and a reference to a row that was not copied is taken out. Name: p_name, else "<name> (copy)", "(copy 2)", …. Writes one history.migration_log row on the new Table (verb duplicate); the source is never written. Refuses with one sentence: not given / archived / not a member of the destination / a column linking across organizations / more records than one copy carries.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_duplicate',
   'p_table_id uuid, p_with_records boolean, p_name text, p_organization_id uuid',
   array['uuid'::regtype::oid, 'bool'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'Takes a Table id. Refuses unless custom.where_id_opens says the signed-in caller may open that Table (the organization wall or a share, then the ladder at viewer), the Table is live, and the caller is a member of the destination organization (iam.is_org_member) whose record store is open (custom.assert_client_may_reach + custom.assert_store_door, exactly what custom.table_declare asks). Only then does it write a NEW Table in the destination with copies of the source''s live Fields, choice lists, the saved views the caller may see and (when asked) the records the caller is handed (custom.query_visible_ids at viewer), each record''s values through the read doors'' field mask (custom.read_mask_for + custom.mask_document), so a copy never carries a value the caller could not read. It never writes the source.',
   'tableactions_a_table_can_be_duplicated.sql', null, true, false,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'tableactions_a_table_can_be_duplicated.sql',
     'arguments', jsonb_build_object(
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'check', 'custom.where_id_opens(p_table_id) decides first (the organization wall or a share, then the ladder at viewer); a Table the caller may not open is refused 42501 with the same sentence as one that does not exist, and only the resolved id is read after that.',
         'access', 'viewer on the Table (custom.where_id_opens)',
         'entity', 'custom_record',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
                                       'note', 'A foreign or invented id gets the same refusal; the copy is made only from a Table the caller may already open, so it cannot widen what the caller sees.'),
         'null_rule', jsonb_build_object('says', 'Say which table to duplicate.', 'sqlstate', '22004')),
       'p_with_records', jsonb_build_object(
         'type', 'boolean', 'position', 2, 'optional', true, 'sql_default', 'false',
         'check', 'A choice: copy the live records too (at most 100, else refused 54000 by name).',
         'foreign', jsonb_build_object('not_an_id', true),
         'null_rule', jsonb_build_object('means', 'false')),
       'p_name', jsonb_build_object(
         'type', 'text', 'position', 3, 'optional', true, 'sql_default', 'null',
         'check', 'The copy''s name; blank or null means "<name> (copy)", made unique in the destination.',
         'foreign', jsonb_build_object('not_an_id', true),
         'null_rule', jsonb_build_object('means', '"<name> (copy)", then "(copy 2)", …')),
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 4, 'optional', true, 'sql_default', 'null',
         'check', 'The destination. iam.is_org_member(caller, p_organization_id) decides before anything is written (refused 42501 by name), then custom.assert_client_may_reach and custom.assert_store_door; a non-member, an invented id and a foreign one get the same sentence.',
         'access', 'member',
         'entity', 'organization',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
                                       'note', 'The copy is written only into an organization the caller is a member of.'),
         'null_rule', jsonb_build_object('means', 'the source Table''s own organization')))))
on conflict do nothing;

grant execute on function custom.table_duplicate(uuid, boolean, text, uuid) to authenticated;

select set_config('platform.closed_schema_sweep', '0', true);
