-- chair-step: this GRANTs EXECUTE on ONE new function, custom.table_duplicate(uuid, boolean, text, uuid), to `authenticated`, after declaring it in platform.client_callable_door (signed-in callers only; anon gains nothing). It also REVOKEs PUBLIC's implicit EXECUTE on the new internal helper custom._uuid_remap(jsonb, jsonb), so no client can call it. Nothing else is granted, revoked, dropped or rewritten: the file adds custom._uuid_remap(jsonb, jsonb) (internal, no client grant) and custom.table_duplicate, touches no table, column, trigger or policy, and writes no row except the one door-register row. No strong lock: CREATE FUNCTION and one INSERT into the register.
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
--   · every choice list a Field uses, as a NEW choice list (its options keep their words, their
--     stable keys and their order), so editing the copy's choices never edits the original's;
--   · every live saved view of the Table, with its filters, sorts and layout;
--   · with p_with_records, every live record (archived and quarantined ones stay behind).
--
-- HOW IDS ARE KEPT POINTING AT THE RIGHT THING (the remap). The store names a Field by its KEY
-- almost everywhere (record values, sorts, filters, group/date/image fields, hidden columns,
-- widths in `presentation`, lookups' via/of/pick), and keys are copied unchanged — so those need
-- nothing. The places that name a Field, a Table, an option or a record BY ID are rewritten
-- through one map (custom._uuid_remap, old id -> new id) applied to the whole document:
--     Table      data.decorations.color_by.field, .rules[].field, .rows{<record id>},
--                .cells{<record id>}{<field id>}; data.row_actions[].steps[].field;
--                any other id the Table document holds
--     Field      data.entity_definition_id; data.relation_target when it is the Table itself
--                (a link to ANOTHER Table keeps pointing at that Table); data.config.options_table_id;
--                data.config.expr {"field": <id>} (formulas)
--     View       definition.table_id; definition.where.args[].field; definition.grid.widths{<id>};
--                metadata.record_positions{<record id>} (hand-set order, with records only)
--     Record     a link value naming another row of the same Table; data.parent_id when it is one
--   An id the map does not hold (another Table, a person, a file) is left exactly as it was.
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
  -- Every uuid-shaped string in the document, values AND object keys, once each. A uuid is
  -- 36 fixed characters with no quote or backslash in it, so a plain replace cannot cut into
  -- anything else, and an id the map does not hold is left exactly as it was.
  for v_id in
    select distinct m[1]
      from regexp_matches(v_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m
  loop
    if p_map ? v_id then
      v_text := replace(v_text, v_id, p_map ->> v_id);
    end if;
  end loop;
  return v_text::jsonb;
end;
$function$;

revoke execute on function custom._uuid_remap(jsonb, jsonb) from public;

comment on function custom._uuid_remap(jsonb, jsonb) is
  'TABLE-ACTIONS. Rewrites every id in a document that the map names (old id -> new id), in values and in object keys; every other id is left as it was. Internal to custom.table_duplicate; no client grant.';

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
  -- lists (20 records +0.4 s over the 1.4 s structure copy). A client call is cancelled at
  -- ~8 s, so 200 keeps a wide table's whole copy inside one call. Above it the person is told,
  -- never left with half a table. (custom.table_archive pages for the same reason; a paged copy
  -- is the follow-up if 200 proves too few.)
  c_most_records constant integer := 200;
  v_me         uuid := custom.query_principal();
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
  v_fields     integer := 0;
  v_lists      integer := 0;
  v_choices    integer := 0;
  v_views      integer := 0;
  v_records    integer := 0;
  v_k          integer;
  v_left_fields  bigint;
  v_left_records bigint;
  v_event      uuid;
  v_self_keys  text[] := array[]::text[];
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

  if coalesce(p_with_records, false) then
    select count(*) into v_live
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true';
    if v_live > c_most_records then
      raise exception '% has % records, more than one copy can carry (%). Copy it without its records, then import them.',
                      v_src_name, v_live, c_most_records
        using errcode = '54000';
    end if;
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

  -- THE MAP: old id -> new id for the Table, its live Fields, its live views and (when asked)
  -- its live records. Choice lists and their options join it below as they are made.
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
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id), '{}'::jsonb);
  if coalesce(p_with_records, false) then
    v_map := v_map || coalesce((
      select jsonb_object_agg(r.id::text, gen_random_uuid()::text)
        from custom.record r
       where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
         and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'), '{}'::jsonb);
  end if;

  -- EVERY CHOICE LIST, AS A NEW ONE. Made through custom._options_table_for (the builder every
  -- list column's choices come from), then filled with the source's live options: the same
  -- words, the same stable keys (record values store the key, so they stay valid unchanged) and
  -- the same order.
  for v_opt in
    select distinct on (f.data -> 'config' ->> 'options_table_id')
           (f.data -> 'config' ->> 'options_table_id')::uuid as opts_id,
           coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as label
      from custom.record f
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
     order by f.data -> 'config' ->> 'options_table_id', coalesce((f.data ->> 'sort')::integer, 0)
  loop
    v_new_opts := custom._options_table_for(v_to, v_opt.label, '[]'::jsonb);
    v_lists := v_lists + 1;
    v_map := v_map || jsonb_build_object(v_opt.opts_id::text, v_new_opts::text);
    with src as (
      select o.id, gen_random_uuid() as new_id, o.data, o.metadata, o.shown_to
        from custom.record o
       where o.organization_id = v_from and o.table_id = v_opt.opts_id
         and o.data_class = 'record' and o.deleted_at is null
    ), ins as (
      insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
      select s.new_id, v_to, v_new_opts, 'record', s.data - '_values', s.metadata - 'moved_from',
             s.shown_to
        from src s
      returning 1
    )
    select v_map || coalesce((select jsonb_object_agg(s.id::text, s.new_id::text) from src s), '{}'::jsonb)
      into v_map;
    get diagnostics v_k = row_count;
    v_choices := v_choices + (select count(*) from custom.record o
                               where o.organization_id = v_to and o.table_id = v_new_opts
                                 and o.data_class = 'record' and o.deleted_at is null);
  end loop;

  -- THE TABLE RECORD. Its settings and look, remapped; a person's copy, so never the app's.
  -- Without records, a colour pinned to one of the source's rows or cells stays behind with it.
  v_data := custom._uuid_remap(v_src.data, v_map) - 'kept_by_the_app' - 'kept_for';
  if not coalesce(p_with_records, false) then
    v_data := v_data #- '{decorations,rows}' #- '{decorations,cells}';
  end if;
  v_data := v_data || jsonb_build_object('name', v_name, 'slug', v_slug);
  if v_parent is not null then
    v_data := v_data || jsonb_build_object('parent_id', v_parent::text);
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
  values (v_new, v_to, custom.table_kernel_id(), 'table', v_data,
          v_src.metadata - 'moved_from' - 'older_shares_seen', v_src.shown_to);

  -- THE FIELDS, in two statements: the stored ones first, then the ones worked out from them
  -- (a formula's guard reads the Fields it names, so they have to be there).
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
  select (v_map ->> f.id::text)::uuid, v_to, f.table_id, f.data_class,
         custom._uuid_remap(f.data, v_map), f.metadata - 'moved_from', f.shown_to
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_id::text
     and coalesce(f.data ->> 'type', '') <> 'formula' and coalesce(f.data ->> 'source', '') <> 'formula'
   order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at;
  get diagnostics v_k = row_count; v_fields := v_k;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
  select (v_map ->> f.id::text)::uuid, v_to, f.table_id, f.data_class,
         custom._uuid_remap(f.data, v_map), f.metadata - 'moved_from', f.shown_to
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_id::text
     and (coalesce(f.data ->> 'type', '') = 'formula' or coalesce(f.data ->> 'source', '') = 'formula')
   order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at;
  get diagnostics v_k = row_count; v_fields := v_fields + v_k;

  -- THE VIEWS. Remapped; the copy's own; a hand-set order travels only with the rows it orders.
  insert into platform.saved_view
    (id, name, description, surface_key, subject_id, definition, definition_version, is_default,
     sort_order, organization_id, created_by, shown_to, metadata, custom_fields)
  select (v_map ->> sv.id::text)::uuid, sv.name, sv.description, sv.surface_key, v_new,
         jsonb_set(custom._uuid_remap(sv.definition - 'moved_from', v_map), '{table_id}', to_jsonb(v_new::text), true),
         sv.definition_version, sv.is_default, sv.sort_order, v_to, v_me, sv.shown_to,
         case when coalesce(p_with_records, false)
              then custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map)
              else coalesce(sv.metadata, '{}'::jsonb) - 'record_positions' end,
         coalesce(sv.custom_fields, '{}'::jsonb)
    from platform.saved_view sv
   where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id;
  get diagnostics v_views = row_count;

  -- THE RECORDS, set-based. Values are keyed by Field key, so they land as they are; the value
  -- envelope is stamped fresh by the store (these values were written now, by this person).
  -- A link to ANOTHER row of this same Table is judged as it lands ("points at a live record"),
  -- and its target may land later in the same statement, so those columns are written in a
  -- second statement once every row exists — following the map to the copy's row. A link to a
  -- row that stayed behind (archived) is left empty rather than pointed at the original.
  if coalesce(p_with_records, false) then
    select coalesce(array_agg(f.data ->> 'key'), array[]::text[]) into v_self_keys
      from custom.record f
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and f.data ->> 'relation_target' = v_id::text;

    insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
    select (v_map ->> r.id::text)::uuid, v_to, v_new, 'record',
           custom._uuid_remap(r.data - '_values', v_map) - v_self_keys, r.metadata - 'moved_from',
           r.shown_to
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     order by r.created_at, r.id;
    get diagnostics v_records = row_count;

    if cardinality(v_self_keys) > 0 then
      update custom.record x
         set data = x.data || p.patch
        from (select (v_map ->> r.id::text)::uuid as new_id,
                     jsonb_object_agg(k.key,
                       case jsonb_typeof(r.data -> k.key)
                         when 'string' then to_jsonb(v_map ->> (r.data ->> k.key))
                         else (select coalesce(jsonb_agg(to_jsonb(v_map ->> e.v)), '[]'::jsonb)
                                 from jsonb_array_elements_text(r.data -> k.key) e(v)
                                where v_map ? e.v)
                       end) as patch
                from custom.record r
                cross join unnest(v_self_keys) k(key)
               where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
                 and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                 and v_map ? r.id::text
                 and ((jsonb_typeof(r.data -> k.key) = 'string' and v_map ? (r.data ->> k.key))
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
                                 'with_records', coalesce(p_with_records, false)),
    'left_behind', jsonb_build_object(
      'archived_fields', v_left_fields,
      'archived_records', case when coalesce(p_with_records, false) then v_left_records else null end,
      'not_copied', jsonb_build_array('history', 'forms', 'booking pages', 'portals', 'dashboards',
                                      'capture sheets', 'rules', 'webhooks', 'tables inside its rows',
                                      'sharing', 'comments')),
    'event_id', v_event,
    'path', '/data-v2/' || v_new::text);
end;
$function$;

comment on function custom.table_duplicate(uuid, boolean, text, uuid) is
  'TABLE-ACTIONS. Duplicates a Table the caller may open into an organization the caller is a member of (default: the same one): its settings and look, every live Field (new ids), every choice list as a new list (same words, keys, order), every live saved view (filters, sorts, layouts and every id inside them remapped to the copy), and with p_with_records every live record (links within the Table follow to the copy; links to other Tables stay). Name: p_name, else "<name> (copy)", "(copy 2)", …. Writes one history.migration_log row on the new Table (verb duplicate); the source is never written. Refuses with one sentence: not given / archived / not a member of the destination / a column linking across organizations / more records than one copy carries.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_duplicate',
   'p_table_id uuid, p_with_records boolean, p_name text, p_organization_id uuid',
   array['uuid'::regtype::oid, 'bool'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'Takes a Table id. Refuses unless custom.where_id_opens says the signed-in caller may open that Table (the organization wall or a share, then the ladder at viewer), the Table is live, and the caller is a member of the destination organization (iam.is_org_member) whose record store is open (custom.assert_client_may_reach + custom.assert_store_door, exactly what custom.table_declare asks). Only then does it write a NEW Table in the destination with copies of the source''s live Fields, choice lists, saved views and (when asked) records. It never writes the source.',
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
         'check', 'A choice: copy the live records too (at most 200, else refused 54000 by name).',
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
