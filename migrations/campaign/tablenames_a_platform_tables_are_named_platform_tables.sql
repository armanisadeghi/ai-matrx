-- chair-step: renames five return columns and parameters (DROP + CREATE of seven functions) and the custom."table" view column; non-additive by nature, undone whole by migrations/inverse/tablenames_a_platform_tables_are_named_platform_tables_down.sql
-- lane: TABLE-NAMES-FINAL
-- lock: custom
-- based-on: custom._table_move_plan(uuid, uuid, uuid) 2c4ee200761a1bd592be936b27fddb420b3ee53bde3883b0ed730e4620f02fc1
-- based-on: custom._table_shape_guard() ad17b1f9e9b1293f732282f581efed4b22ca3d98f5d0914bafa6ac1f6b7432f6
-- based-on: custom._value_envelope() 4ceac2188157ebfbf5ea99996b18341585b036bc003bcfeddd2a1242150e7d01
-- based-on: custom.data_home(uuid, text, boolean) 64c82ad70b866cc9702a7da9fb1f5103c1ed952d2c06f6e3b8e2daf866bd6b2c
-- based-on: custom.data_home_slim(uuid, text, boolean) 57cac18721469a599dd81d110dec95ee0e79afebf6811caa1c0d812a5db7c919
-- based-on: custom.data_home_tables(uuid) 3821b9984dec8f74ccddc2327b9f2a7b56d0f965901906ccb9d7be75316346f1
-- based-on: custom.data_home_tables(uuid, boolean) 9e18834295643b56971b5a20fd156266d99d403884be234a81b2c518e006ec29
-- based-on: custom.records_search(text, integer, integer, uuid[], uuid[], boolean) 3e3757b8b558fc8e2008efd22c48a1f39120776aa471d67dc68aa2412aae7cea
-- based-on: custom.table_ensure(uuid, jsonb) 7e9d241504c87158851fd1a74a85fc2ea3c4b2c2f0358178705de0a77cc5cae8
-- based-on: custom.table_facts(uuid) b223bff3af00aaad4a996826c3a74dd827630e641144101d0a3af6160d8b924a
-- based-on: custom.table_kept_out_of_lists(text) a9c57ea71bae062f257cedf6a69931a975f8de65e5209fe9c7d52b5e7dd4f2df
-- based-on: custom.table_list_everywhere(uuid) 72dcc68ca69c1c989fe4bb639b39b1b5c0019416b11ccc71a3ff81d894f905ea
-- based-on: custom.table_list_everywhere(uuid, boolean) 6cf48014a153b8d5fe6ff9a780a7cec79a13839478adaa046cfe7b1d4bad0215
-- based-on: custom.table_placement(uuid, uuid, jsonb, boolean) 9c5211b9fb5638371b22f7b4ea472bd3043b0cd879cdc730bb34b67d276741ff
--
-- Ruled names (vocabulary FEATURE.md, Data words, Arman 2026-10-08): a table the platform keeps is a
-- PLATFORM TABLE; the words "kept by the app" and "app table" retire. This renames what the store SAYS:
--   * custom."table".kept_by_the_app (view column) and the same key in the answers of table_placement,
--     table_facts, table_list_everywhere, data_home_tables  ->  platform_owned
--   * include_app_tables / p_include_app_tables (parameter and the transaction-local setting)
--     ->  include_platform_tables / p_include_platform_tables
--   * the refusal "is kept by the app, so it is not yours to change" -> "is a platform table, ..."
--   * the agent-outputs table's Home name "Kept by the app" -> "Platform tables"
--   * ops.system_error kind app_table -> typed_table (signature prefix too; 2 rows, both resolved)
-- LEFT ALONE ON PURPOSE: the keys STORED inside table documents (kept_by_the_app, app_table.declared_in)
-- — renaming them is a rewrite of every live table document. They are listed in the lane report.
-- No policy, grant of a table, or iam kernel function is touched. Callers (records 0.87+, records-ui,
-- frontend, python) move in the same change.

drop function custom.data_home(uuid, text, boolean);

drop function custom.data_home_slim(uuid, text, boolean);

drop function custom.data_home_tables(uuid);

drop function custom.data_home_tables(uuid, boolean);

drop function custom.records_search(text, integer, integer, uuid[], uuid[], boolean);

drop function custom.table_facts(uuid);

drop function custom.table_list_everywhere(uuid, boolean);

CREATE OR REPLACE FUNCTION custom._table_move_plan(p_table_id uuid, p_to uuid, p_me uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tables   uuid := custom.table_kernel_id();
  v_fieldk   uuid := custom.field_kernel_id();
  v_ceiling  constant integer := 16;   -- REC-N-4, the containment ceiling
  v_t        record;
  v_org      uuid;
  v_org_name text;
  v_name     text;
  v_may      boolean := false;
  v_why_not  text;
  v_general  text[] := array[]::text[];
  v_carry_t  uuid[];            -- tables that move: the table, what is inside it, their own choice lists
  v_add      uuid[];
  v_inside   integer := 0;      -- tables that ride along because they live inside what moves
  v_round    integer := 0;
  v_fields   uuid[];
  v_recs     uuid[];
  v_others   uuid[];            -- rules, dashboards, templates, relations that move
  v_all      uuid[];
  v_idre     text;
  r          record;
  v_dest     jsonb := '[]'::jsonb;
  v_to_why   text;
  v_counts   jsonb;
  v_shared   text;
  v_home_like boolean;
  v_cross_n  integer := 0;      -- relation values that will cross the wall
  v_cross_shut text;            -- a source table that does not allow links to other organizations
  v_cols_n   integer := 0;      -- columns that will point across the wall (SC-1-TAILS)
begin
  select t.* into v_t
    from custom.record t
   where t.id = p_table_id and t.table_id = v_tables
   limit 1;
  if not found then
    return null;
  end if;
  v_org  := v_t.organization_id;
  v_name := coalesce(nullif(btrim(v_t.data ->> 'name'), ''), 'This table');
  select o.name into v_org_name from iam.organizations o where o.id = v_org;
  v_org_name := coalesce(v_org_name, 'its organization');

  -- WHO MAY MOVE IT: the person who made it, or an owner or admin of its organization.
  v_may := p_me is not null
           and (v_t.created_by = p_me or iam.is_org_manager(v_org, p_me));
  if not v_may then
    v_why_not := format('Only the person who made %s or an owner or admin of %s can move it.',
                        v_name, v_org_name);
  end if;

  -- ── what the store or the app keeps never moves by itself ──
  if v_t.data_class = 'kernel' then
    v_general := v_general || format('%s is one of the record store''s own tables, so it stays where it is.', v_name);
  elsif coalesce((v_t.data ->> 'kept_by_the_app')::boolean, false) or v_t.data ? 'scope_binding' then
    v_general := v_general || format(
      'The app keeps %s for %s, so it moves with what uses it, not by itself.',
      v_name,
      coalesce(case v_t.data ->> 'kept_for'
                 when 'context' then 'the context system'
                 when 'choices' then 'a column''s choices'
                 else nullif(v_t.data ->> 'kept_for', '') end,
               'one of its features'));
  end if;
  if v_t.deleted_at is not null then
    v_general := v_general || format('%s is in the trash. Restore it first, then move it.', v_name);
  end if;

  -- ── where it sits: a HOME (its organization's record, a person's space, a "Home" folder, a
  -- kernel row) moves with nothing and is re-pointed; a row of another Table or a Table is a
  -- container, and a Table inside a container moves with it, not by itself ──
  if custom.containment_parent(v_t.data) is not null then
    select coalesce(nullif(btrim(p.data ->> 'name'), ''), nullif(btrim(p.data ->> 'title'), ''), 'another record'),
           (p.table_id is null or p.data_class = 'kernel'
            or exists (select 1 from custom.record k where k.id = p.table_id and k.data_class = 'kernel'))
           and p.table_id is distinct from v_tables
      into v_shared, v_home_like
      from custom.record p
     where p.organization_id = v_org and p.id = custom.containment_parent(v_t.data);
    if not coalesce(v_home_like, true) then
      v_general := v_general || format('%s lives inside %s, so it moves with that, not by itself.',
                                       v_name, coalesce(v_shared, 'another record'));
    end if;
  end if;

  -- ── the carry set: a CLOSURE (SC-1-TAILS). What is inside what moves, moves with it. ──
  -- Each round adds (a) the choice lists only the carried tables' columns use, and (b) every
  -- Table — live or in the trash — whose home is a carried Table or a row of one. It stops when
  -- a round adds nothing, or at the containment ceiling, which is then said.
  v_carry_t := array[p_table_id];
  loop
    v_round := v_round + 1;
    select coalesce(array_agg(distinct o.id), array[]::uuid[]) into v_add
      from custom.record f
      join custom.record o
        on o.organization_id = v_org
       and o.id = nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid
       and o.table_id = v_tables
     where f.organization_id = v_org and f.table_id = v_fieldk
       and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t)
       and not (o.id = any (v_carry_t))
       and coalesce((o.data ->> 'kept_by_the_app')::boolean, false)
       and not exists (select 1 from custom.record g
                        where g.organization_id = v_org and g.table_id = v_fieldk
                          and g.deleted_at is null
                          and g.data -> 'config' ->> 'options_table_id' = o.id::text
                          and not (coalesce(nullif(g.data ->> 'entity_definition_id', '')::uuid,
                                            '00000000-0000-0000-0000-000000000000'::uuid) = any (v_carry_t)));
    v_carry_t := v_carry_t || v_add;

    select coalesce(array_agg(t2.id), array[]::uuid[]) into v_add
      from custom.record t2
     where t2.organization_id = v_org and t2.table_id = v_tables and t2.data_class = 'table'
       and not (t2.id = any (v_carry_t))
       and custom.containment_parent(t2.data) is not null
       and (custom.containment_parent(t2.data) = any (v_carry_t)
            or exists (select 1 from custom.record x
                        where x.organization_id = v_org
                          and x.id = custom.containment_parent(t2.data)
                          and x.table_id = any (v_carry_t)));
    v_inside := v_inside + coalesce(array_length(v_add, 1), 0);
    v_carry_t := v_carry_t || v_add;

    exit when coalesce(array_length(v_add, 1), 0) = 0;
    if v_round >= v_ceiling then
      v_general := v_general || format(
        'Tables are nested more than %s deep inside %s, which is deeper than the store keeps things inside things. Take the innermost ones out first.',
        v_ceiling, v_name);
      exit;
    end if;
  end loop;

  -- Choice lists it shares with a Table that stays: named, refused.
  for r in
    select distinct coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      join custom.record g
        on g.organization_id = v_org and g.table_id = v_fieldk and g.deleted_at is null
       and g.data -> 'config' ->> 'options_table_id' = f.data -> 'config' ->> 'options_table_id'
       and not (coalesce(nullif(g.data ->> 'entity_definition_id', '')::uuid,
                         '00000000-0000-0000-0000-000000000000'::uuid) = any (v_carry_t))
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(g.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t)
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
     limit 3
  loop
    v_general := v_general || format(
      'Its %s column shares its choices with %s, which stays in %s. Give one of them its own choices first.',
      r.col, r.other, v_org_name);
  end loop;

  select coalesce(array_agg(f.id), array[]::uuid[]) into v_fields
    from custom.record f
   where f.organization_id = v_org and f.table_id = v_fieldk
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_recs
    from custom.record x
   where x.organization_id = v_org and x.table_id = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_others
    from custom.record x
   where x.organization_id = v_org
     and not (x.id = any (v_carry_t))
     and (   (x.data_class = 'rule'               and nullif(x.data ->> 'scope_table_id', '')::uuid   = any (v_carry_t))
          or (x.data_class = custom.dashboard_class() and nullif(x.data ->> 'subject_table_id', '')::uuid = any (v_carry_t))
          or (x.data_class = 'doc_template'       and nullif(x.data ->> 'renders_table_id', '')::uuid = any (v_carry_t))
          or (x.data_class = 'checklist_template' and nullif(x.data ->> 'about_table_id', '')::uuid   = any (v_carry_t))
          -- a relation record is filed with the row it starts at (REL-12): it moves with its
          -- `from`; one whose `to` stays is judged below.
          or (x.data_class = 'relation'
              and nullif(x.data ->> 'from', '')::uuid = any (v_recs)));

  v_all := v_carry_t || v_fields || v_recs || v_others;

  -- ── a COLUMN whose target stays, or a column that stays pointing in (SC-1-TAILS, chair ruling
  -- 2026-09-24): the same wall as a row link — it holds across organizations when the Table it
  -- STARTS at allows links to other organizations and both organizations have turned links on
  -- (asked per destination below); the store's own kernel Tables are shared and never cross ──
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table,
           coalesce(nullif(btrim(mt.data ->> 'name'), ''), 'a table') as of_name,
           coalesce((mt.data ->> 'cross_organization_relations')::boolean, false) as allowed
      from custom.record f
      join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'relation_target', '')::uuid
       and ot.data_class <> 'kernel'
      left join custom.record mt
        on mt.organization_id = v_org and mt.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.id = any (v_fields) and f.deleted_at is null
       and not (nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t))
  loop
    v_cols_n := v_cols_n + 1;
    if not r.allowed then
      v_general := v_general || format(
        '%s column links to %s, which stays in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove that column first.',
        case when r.of_table = p_table_id then 'Its ' || r.col else r.of_name || '''s ' || r.col end,
        r.other, v_org_name, r.of_name, r.of_name);
    end if;
  end loop;
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other,
           coalesce((ot.data ->> 'cross_organization_relations')::boolean, false) as allowed
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and not (f.id = any (v_fields))
       and nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t)
  loop
    v_cols_n := v_cols_n + 1;
    if not r.allowed then
      v_general := v_general || format(
        '%s links to this table through its %s column and stays in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove that column first.',
        r.other, r.col, v_org_name, r.other, r.other);
    end if;
  end loop;

  -- ── a relation VALUE between a moving row and a row that stays (REC-29 / VIS-34) ──
  -- It holds across the wall where the wall is open: the Table it STARTS at allows links to other
  -- organizations, and both organizations have turned links on (asked per destination below).
  -- An OWNED relation record is containment, and containment never crosses.
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.data_class = 'relation' and x.deleted_at is null
                and coalesce(x.data ->> 'kind', '') = 'owned'
                and ((nullif(x.data ->> 'from', '')::uuid = any (v_recs))
                     <> (nullif(x.data ->> 'to', '')::uuid = any (v_recs)))) then
    v_general := v_general || format(
      'Some of its rows own, or are owned by, rows that stay in %s. What is inside something moves with it, so take them apart first.',
      v_org_name);
  end if;
  with crossing as (
    -- the edges of relation columns (platform.associations, one fact with the value)
    select a.source_id as src, a.target_id as tgt
      from platform.associations a
     where a.deleted_at is null and a.relation_field_id is not null
       and a.source_type = 'record' and a.target_type = 'record'
       and ((a.source_id = any (v_recs)) <> (a.target_id = any (v_recs)))
       and exists (select 1 from custom.record o where o.organization_id = v_org
                    and o.id = case when a.source_id = any (v_recs) then a.target_id else a.source_id end)
    union all
    -- referenced relation records
    select nullif(x.data ->> 'from', '')::uuid, nullif(x.data ->> 'to', '')::uuid
      from custom.record x
     where x.organization_id = v_org and x.data_class = 'relation' and x.deleted_at is null
       and coalesce(x.data ->> 'kind', '') <> 'owned'
       and ((nullif(x.data ->> 'from', '')::uuid = any (v_recs))
            <> (nullif(x.data ->> 'to', '')::uuid = any (v_recs)))
  )
  select count(*)::integer,
         (select coalesce(nullif(btrim(st.data ->> 'name'), ''), 'a table')
            from crossing c2
            join custom.record s  on s.organization_id = v_org and s.id = c2.src
            join custom.record st on st.organization_id = v_org and st.id = s.table_id
           where not coalesce((st.data ->> 'cross_organization_relations')::boolean, false)
           limit 1)
    into v_cross_n, v_cross_shut
    from crossing;
  if v_cross_shut is not null then
    v_general := v_general || format(
      'Some of its rows are linked to rows that stay in %s, and %s does not allow links to other organizations. Allow it in %s''s settings, or remove those links first.',
      v_org_name, v_cross_shut, v_cross_shut);
  end if;

  -- ── containment across the edge of what moves ──
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.id = any (v_recs)
                and custom.containment_parent(x.data) is not null
                and not (custom.containment_parent(x.data) = any (v_all))) then
    v_general := v_general || 'Some of its rows live inside records of another table. Take them out first.'::text;
  end if;
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.table_id <> v_tables and x.deleted_at is null
                and not (x.id = any (v_all))
                and custom.containment_parent(x.data) = any (v_recs)) then
    v_general := v_general || 'Records of other tables live inside its rows. Take them out first.'::text;
  end if;

  -- ── what else in the organization still uses it ──
  for r in
    select p.title from custom.portal p
     where p.organization_id = v_org and p.archived_at is null
       and (p.client_table_id = any (v_carry_t)
            or exists (select 1 from custom.portal_table pt
                        where pt.portal_id = p.id and pt.table_id = any (v_carry_t)))
     limit 3
  loop
    v_general := v_general || format(
      'The client portal "%s" shows it. Take it out of that portal first.', r.title);
  end loop;
  if exists (select 1 from iam.permissions g
              where g.resource_type = 'record' and g.resource_id = any (v_carry_t)
                and g.granted_to_organization_id = v_org
                and g.status <> 'rejected'
                and (g.expires_at is null or g.expires_at > now())) then
    v_general := v_general || format(
      'It is shared with everyone in %s. Stop sharing it with the whole organization first, so nobody keeps access by accident.',
      v_org_name);
  end if;
  v_idre := array_to_string(array(select x::text from unnest(v_carry_t || v_fields) x), '|');
  for r in
    select x.data_class as cls,
           coalesce(nullif(btrim(x.data ->> 'name'), ''), nullif(btrim(x.data ->> 'label'), ''), 'something') as nm,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), null) as of_table
      from custom.record x
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = x.table_id and ot.table_id = v_tables
     where x.organization_id = v_org and x.deleted_at is null
       and x.table_id is distinct from v_fieldk            -- a column of another table is named above
       and not (x.id = any (v_all))
       -- A row of a table THE APP keeps (its own bookkeeping — the older saved-views copy, a
       -- choice list) follows the table by id and holds nothing in place.
       and not (ot.id is not null
                and coalesce((custom.table_placement(ot.organization_id, ot.id, ot.data, false) ->> 'platform_owned')::boolean, false))
       -- A relation record whose `to` is a moving row is judged above, as a link.
       and x.data_class is distinct from 'relation'
       and x.data::text ~ v_idre
     limit 3
  loop
    v_general := v_general || format(
      '%s "%s"%s still uses it and stays in %s. Change it first.',
      initcap(replace(case r.cls when 'record' then 'row' else r.cls end, '_', ' ')),
      r.nm,
      case when r.of_table is not null and r.cls = 'record' then format(' of %s', r.of_table) else '' end,
      v_org_name);
  end loop;

  -- ── where it may go: every organization this person belongs to, but this one ──
  for r in
    -- UI-FIX-19: the web address rides along, so a screen can tell two same-named organizations apart.
    select o.id, o.name::text as name, o.slug::text as slug, m.role::text as role
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = p_me and o.id <> v_org
     order by o.name
  loop
    v_to_why := null;
    if not custom.store_is_open(r.id) then
      v_to_why := format('%s does not keep its data in the record store yet.', r.name);
    elsif exists (select 1 from custom.record d
                   where d.organization_id = r.id and d.table_id = v_tables and d.deleted_at is null
                     and lower(coalesce(d.data ->> 'slug', d.data ->> 'name'))
                       = lower(coalesce(v_t.data ->> 'slug', v_t.data ->> 'name'))) then
      v_to_why := format('%s already has a table called %s. Rename one of them first.', r.name, v_name);
    elsif v_cross_n + v_cols_n > 0 and not custom.cross_organization_links_open(v_org, r.id) then
      -- THE WALL IS ASKED OF BOTH ORGANIZATIONS, and the sentence says which is shut.
      v_to_why := format(
        '%s, and links between organizations need both to allow them: %s. Turn on "Links to other organizations" there, or remove those links first.',
        case when v_cross_n > 0 then format('Some of its rows are linked to rows that stay in %s', v_org_name)
             else format('Some of its columns link to tables that stay in %s', v_org_name) end,
        case when not custom.cross_organization_links_open(v_org, v_org) and not custom.cross_organization_links_open(r.id, r.id)
               then format('neither %s nor %s does', v_org_name, r.name)
             when not custom.cross_organization_links_open(v_org, v_org)
               then format('%s does not', v_org_name)
             else format('%s does not', r.name) end);
    end if;
    v_dest := v_dest || jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'role', r.role,
                                           'ok', v_to_why is null, 'why', v_to_why);
  end loop;

  v_counts := jsonb_build_object(
    'fields',  (select count(*) from custom.record f where f.organization_id = v_org and f.id = any (v_fields)
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id and f.deleted_at is null),
    'records', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is null),
    'in_trash', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is not null),
    'choice_lists', greatest(coalesce(array_length(v_carry_t, 1), 1) - 1 - v_inside, 0),
    'with_it', coalesce(array_length(v_others, 1), 0),
    -- SC-1-TAILS: what rides along because it lives inside, and the links that will reach back.
    'tables_inside', v_inside,
    'links_across', v_cross_n,
    'columns_across', v_cols_n);

  return jsonb_build_object(
    'table',        jsonb_build_object('id', p_table_id, 'name', v_name, 'version', v_t.version),
    'organization', jsonb_build_object('id', v_org, 'name', v_org_name),
    'may_move',     v_may,
    'why_not',      v_why_not,
    'held_by',      to_jsonb(v_general),
    'destinations', v_dest,
    'carries',      v_counts,
    -- internal: the ids that move. The doors strip this before a client reads the answer.
    '_carry',       jsonb_build_object('tables', to_jsonb(v_carry_t), 'fields', to_jsonb(v_fields),
                                       'records', to_jsonb(v_recs), 'others', to_jsonb(v_others)));
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
  v_reader     jsonb;   -- CHAIR-CONFIDENTIAL-STORE
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- LANE 10 FD: A COPY IS NOT DAY-ONE DATA. A table made as a copy (custom.table_duplicate's
  -- in-progress word, kept_for "copying") never carries the Foundation mark of what it copied.
  if tg_op = 'INSERT' and d ->> 'kept_for' = 'copying' and d ? 'foundation' then
    new.data := new.data - 'foundation';
    d := new.data;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := array_append(v_bad, format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: type ∈ {entity, detail}.')::text);
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := array_append(v_bad, format('a detail table has to say what it is a detail of'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token is required when type is detail.')::text);
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := array_append(v_bad, format('only a detail table has a parent table'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token belongs to type detail and to nothing else.')::text);
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := array_append(v_bad, format('a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1.')::text);
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := array_append(v_bad, format('a table needs a slug made of lower-case letters, digits and underscores'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: slug.')::text);
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := array_append(v_bad, format('a table needs both of its labels - one thing and many things'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: label_singular and label_plural.')::text);
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := array_append(v_bad, format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: display. T4 turns a list into a page and migrates nothing.')::text);
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether its records are ordered'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: ordered.')::text);
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := array_append(v_bad, format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: heavy|light.')::text);
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := array_append(v_bad, format('a table has to say how long it keeps its history'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: retention.')::text);
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if custom.store_is_open(new.organization_id) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := array_append(v_bad, format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days'));
      v_bad_hints := array_append(v_bad_hints, (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor))::text);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table has to say how its records are sorted by default'));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: default_sort is an array of {field, direction}.')::text);
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := array_append(v_bad, format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: manual row order.')::text);
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether an agent may write to it'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: agent_writable, default true, is declared rather than guessed.')::text);
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := array_append(v_bad, format('a table has to declare its fields'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := array_append(v_bad, format('every field of a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := array_append(v_bad, format('a table needs a title field, or its records cannot be shown as chips'));
      v_bad_hints := array_append(v_bad_hints, ('REC-2.')::text);
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := array_append(v_bad, format('the title field %s is not one of this table''s fields', v_title));
      v_bad_hints := array_append(v_bad_hints, ('REC-2: the title field names one of the table''s own fields.')::text);
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := array_append(v_bad, format('a table has to live somewhere - give it a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).')::text);
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := array_append(v_bad, format('a detail record cannot be a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.')::text);
  end if;

  -- ── SC-1 PLACEMENT (2026-09-23): WHO KEEPS THIS TABLE, AND WHETHER THE PICKER OFFERS IT. ──
  -- `kept_by_the_app` is the store's one flag for a Table the app or one of its features keeps
  -- (custom._options_table_for has always stamped it). Beside it, optionally, `kept_for` names
  -- WHICH feature in one lower-case word (context, education, dictionary, …) — only on a Table
  -- that is kept — and `offered_as_context` says whether the context picker offers the Table.
  -- Each is judged only when present; absent is the default (custom.table_placement).
  -- Judged only while the organization's store is switched on (custom/system_enabled), exactly
  -- like the rest of the store's own shape rules; switched off, the document is stored as written.
  -- CHAIR-ALWAYS-ON 2026-10-03: the store switch is retired; custom.store_is_open answers true for every organization.
  if custom.store_is_open(new.organization_id) then
    if d ? 'kept_by_the_app' and jsonb_typeof(d -> 'kept_by_the_app') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being a platform table'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_by_the_app is true or false.')::text);
    end if;
    if d ? 'kept_for' and (jsonb_typeof(d -> 'kept_for') is distinct from 'string'
                           or coalesce(d ->> 'kept_for', '') !~ '^[a-z][a-z_]*$') then
      v_bad := array_append(v_bad, format('the feature that keeps a table is named in one lower-case word, and this one says %s',
                      custom.said(d ->> 'kept_for', 'nothing')));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_for is a word such as context, education or dictionary.')::text);
    end if;
    if d ? 'kept_for' and d ->> 'kept_by_the_app' is distinct from 'true' then
      v_bad := array_append(v_bad, format('only a table the app keeps says which feature keeps it'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: say kept_by_the_app = true beside kept_for, or take kept_for off.')::text);
    end if;
    if d ? 'offered_as_context' and jsonb_typeof(d -> 'offered_as_context') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being offered in the context picker'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: offered_as_context is true or false.')::text);
    end if;
    -- LANE 10 FD (2026-10-02): `foundation` marks a Table as part of the business's day-one data
    -- (Patients, Therapists, Services). A mark, not storage: true, false, or absent (= false).
    -- Never a kept_for word: a foundation table stays the organization's own (or `context`).
    if d ? 'foundation' and jsonb_typeof(d -> 'foundation') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being foundation data'));
        v_bad_hints := array_append(v_bad_hints, ('Foundation: foundation is true or false.')::text);
    end if;
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE (2026-10-02): THE TABLE'S LEVEL AND THE PEOPLE ITS RULES NAME. ──
  -- `level` is absent (Organization, the default) or "confidential". `readers` is the record's own
  -- rules: a list of {field, level} where `field` is one of this Table's fields whose value names a
  -- person (a Person record, a person's id) or a team, and `level` is viewer (the default),
  -- commenter or editor. Only a Confidential Table names readers. Who may SET either is decided
  -- after the shape below: only the Arman-approved door.
  if d ? 'level' and (jsonb_typeof(d -> 'level') is distinct from 'string' or d ->> 'level' <> 'confidential') then
    v_bad := array_append(v_bad, format('a table is Confidential or it leaves its level out, and this one says %s', custom.said(d ->> 'level', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: level is "confidential", or absent for Organization.')::text);
  end if;
  if d ? 'readers' and d ->> 'level' is distinct from 'confidential' then
    v_bad := array_append(v_bad, format('only a Confidential table names the people who may read its records'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: readers belong to a Confidential table; take them off, or make the table Confidential.')::text);
  elsif d ? 'readers' and jsonb_typeof(d -> 'readers') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table names its readers as a list'));
      v_bad_hints := array_append(v_bad_hints, ('readers is a list of {field, level}.')::text);
  elsif d ? 'readers' then
    for v_reader in select x from jsonb_array_elements(d -> 'readers') x loop
      if jsonb_typeof(v_reader) is distinct from 'object'
         or coalesce(v_reader ->> 'field', '') = ''
         or v_names is null or not ((v_reader ->> 'field') = any (v_names)) then
        v_bad := array_append(v_bad, format('a reader is one of this table''s own fields, and %s is not', custom.said(coalesce(v_reader ->> 'field', v_reader #>> '{}'), 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers: {field: <a field of this table naming a person or a team>, level: viewer|commenter|editor}.')::text);
      elsif v_reader ? 'level' and coalesce(v_reader ->> 'level', '') not in ('viewer', 'commenter', 'editor') then
        v_bad := array_append(v_bad, format('a reader reads, comments or edits, and %s says %s', v_reader ->> 'field', custom.said(v_reader ->> 'level', 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].level is viewer, commenter or editor; owner and admin are not given by a field.')::text);
      -- CHAIR-ACCESS c: `when` is a condition in the saved-view where grammar - a flat {column: value}
      -- map over this table's own columns, or a Rule expression ({"op": ...}). Anything else, or a flat
      -- key that is not a column of this table, is refused here so a reveal rule never silently fails.
      elsif v_reader ? 'when' and jsonb_typeof(v_reader -> 'when') is distinct from 'object' then
        v_bad := array_append(v_bad, format('a reader''s when is a condition on the row, and %s''s is a %s', v_reader ->> 'field', jsonb_typeof(v_reader -> 'when')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when is {column: value, ...} over this table''s columns, or a Rule expression {"op": ..., "args": [...]} - the same grammar a saved view''s where uses.')::text);
      elsif v_reader ? 'when' and not custom.filter_is_rule(v_reader -> 'when')
            and exists (select 1 from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names))) then
        v_bad := array_append(v_bad, format('a reader''s when names a column this table does not have: %s',
                   (select string_agg(k, ', ') from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names)))));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when: every key is one of this table''s column keys.')::text);
      end if;
    end loop;
  end if;

  -- CHAIR-DOORS-3A (2026-10-03): `maker_is_reader` says the Table belongs to the organization and the
  -- person who made it reads only what any reader reads (custom.confidential_answer). It is a state of
  -- a Confidential Table and nothing else: true, or left out.
  if d ? 'maker_is_reader' and (d -> 'maker_is_reader' is distinct from 'true'::jsonb
                                or d ->> 'level' is distinct from 'confidential') then
    v_bad := array_append(v_bad, format('only a Confidential table keeps its maker as a reader, and it says so with true or leaves it out'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: maker_is_reader is true on a Confidential table, or absent.')::text);
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE: ONLY ARMAN MAKES A TABLE CONFIDENTIAL, AND ONLY HE CHANGES WHOM ──
  -- ── IT NAMES. The same rule as a standard table (platform.strict_class_refusal): the change is ──
  -- ── refused unless an approval in his own words was recorded for this Table in THIS transaction ──
  -- ── (platform.class_approval_by_arman, token custom.table:<id>). Leaving Confidential for ──
  -- ── Organization needs no approval. ──
  if d ->> 'level' = 'confidential'
     and (tg_op = 'INSERT'
          or old.data ->> 'level' is distinct from 'confidential'
          or (old.data -> 'readers') is distinct from (d -> 'readers'))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class)
     -- CONFIDENTIAL-BY-ORG-ADMIN (Arman, 2026-10-08): the second approval an organization's own administrator
     -- gives for that organization's own custom table, recorded by custom.set_table_confidential in this transaction.
     and not exists (select 1 from platform.class_approval_by_org_admin b
                      where b.token = 'custom.table:' || new.id::text
                        and b.txid = pg_current_xact_id()
                        and b.organization_id = new.organization_id
                        and b.level = 'confidential') then
    raise exception 'Refused: % would become Confidential%. Every table is Organization by default, and Confidential locks people out of their own organization''s work, so only Arman approves it. The law: common-docs/policies/access-ladder.md. If Arman approved this table in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>''). For an organization''s own custom table an administrator of that organization approves instead: custom.set_table_confidential(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_reason => ''<why>''). Moving a table back to Organization never needs approval.',
                    coalesce(nullif(d ->> 'name', ''), new.id::text),
                    case when tg_op = 'UPDATE' and old.data ->> 'level' = 'confidential' then ' with different readers' else '' end,
                    new.id, new.id
      using errcode = '42501';
  end if;

  -- ── CHAIR-DOORS-3A: ONLY ARMAN TURNS "THE MAKER IS ONLY A READER" ON OR OFF, AND ONLY HE MOVES SUCH ──
  -- ── A TABLE BACK TO ORGANIZATION. The maker still holds the Table's own row; without this she ──
  -- ── could take the state off, or drop the level, and read every row again. The same approval, ──
  -- ── recorded in this transaction by the same door. ──
  if ((tg_op = 'INSERT' and d ? 'maker_is_reader')
      or (tg_op = 'UPDATE'
          and ((old.data -> 'maker_is_reader') is distinct from (d -> 'maker_is_reader')
               or (old.data -> 'maker_is_reader' = 'true'::jsonb
                   and d ->> 'level' is distinct from 'confidential'))))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class)
     and not exists (select 1 from platform.class_approval_by_org_admin b
                      where b.token = 'custom.table:' || new.id::text
                        and b.txid = pg_current_xact_id()
                        and b.organization_id = new.organization_id) then
    raise exception 'Refused: % keeps the person who made it as only a reader, and only Arman turns that on or off or moves such a table back to Organization. The law: common-docs/policies/access-ladder.md. If Arman approved it in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => null, p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>'', p_maker_is_reader => true or false).',
                    coalesce(nullif(d ->> 'name', ''), new.id::text), new.id
      using errcode = '42501';
  end if;

  -- ── LANE 10 FD (2026-10-02): ONLY THE TABLE'S OWNER OR AN ADMIN CHANGES ITS FOUNDATION MARK. ──
  -- The mark is the business's own say about its day-one data, so it is the admin rung on the
  -- Table (an owner holds admin), the rung that changes who sees a table — not the editor rung
  -- that renames it. Absent and false are the same mark, so only a real change is judged. A new
  -- Table may be made marked (its maker owns it; a template install marks its tables this way or
  -- right after). A write with no person behind it (the server lane, a migration) is judged by
  -- the door it came through, as every other key here.
  if tg_op = 'UPDATE'
     and custom.table_is_foundation(old.data) is distinct from custom.table_is_foundation(d) then
    declare
      v_who uuid := custom.query_principal();
    begin
      if v_who is not null
         and custom.effective_level(v_who, new.organization_id, new.id, 'record')
             is distinct from 'admin'::public.permission_level then
        raise exception 'Only the owner of % or an admin can change whether it is Foundation.',
                        coalesce(nullif(d ->> 'name', ''), 'this table')
          using errcode = '42501',
                hint = 'Nothing was changed. Ask the table''s owner.';
      end if;
    end;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
  -- KINDS-GLUE N-C3: the platform Fields of a Table kept for agent outputs (config.kept_by = agent_output),
  -- key -> {label, default}, read in the same walk of the applicable Fields.
  v_platform jsonb := '{}'::jsonb;
  v_kept_by  text;
  v_flabel   text;
  v_fdefault jsonb;
  v_pkey     text;
  -- BIG-VALUES-WRITE: the text values over the ceiling this write carries into files.
  v_whole    jsonb := '{}'::jsonb;     -- key -> the whole text the writer supplied
  v_park     jsonb := '{}'::jsonb;     -- key -> the whole text that still needs its file
  v_ceiling  bigint;
  v_text     text;
  v_prior    jsonb;
  v_carry    jsonb;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- A TEXT VALUE OF ANY SIZE SIMPLY SAVES (lane BIG-VALUES-WRITE, 2026-09-25). The owner:
  -- "Make sure that large data size is easy for users." A business record's text value over
  -- this organization's ceiling for one value (custom/value_max_bytes) is no longer refused:
  -- the cell keeps its first 1000 characters, and the whole text is carried into a file by
  -- the ONE rule the table mover already uses (matrx_records.big_values) - here it waits in
  -- custom.whole_value_parked until its file is written (below, and custom.whole_value_complete).
  -- The ceiling below then judges what the cell really holds. A definition row, a JSON value
  -- and a value on a key that is not one of the Table's Fields keep the refusal.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_ceiling := custom.whole_value_ceiling(new.organization_id);
    for v_key, v_text in
      select e.key, e.value #>> '{}'
        from jsonb_each(v_data) e
       where left(e.key, 1) <> '_' and jsonb_typeof(e.value) = 'string'
         and octet_length(e.value::text) > v_ceiling
    loop
      -- Held OFF by the store's own switch (custom/system_enabled): an organization whose store
      -- is not on keeps the refusal below, exactly as before this file.
      -- CHAIR-ALWAYS-ON 2026-10-03: the store switch is retired; the store is always on, so no exit here.
      v_whole := v_whole || jsonb_build_object(v_key, v_text);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(custom.whole_value_head(v_text)));
    end loop;
  end if;

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  -- DATA-V2-BASICS-2 (2026-09-29): AN AGENT ACTING FOR A PERSON CARRIES THAT PERSON. When the document
  -- does not say who wrote it, the author is the connection's declaration (custom.actor_word above)
  -- — and so is the person: the connection is signed in AS the person the agent acts for (the server's
  -- acting_as, the same principal the held-write card carries). The records a store door writes for an
  -- agent (a choice column's choices, a board's rules) used to be refused "does not say who the agent is
  -- acting for" whenever custom/agent_schema_changes let the agent write without asking. A document that
  -- DECLARES itself an agent still names its person itself.
  if v_obo is null and v_actor = 'agent' and nullif(btrim(coalesce(v_data ->> '_actor', '')), '') is null then
    v_obo := nullif(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')), '');
  end if;
  -- A SERVER-SIDE AGENT WRITE CARRIES ITS PERSON ON THE ROW (Agent Studio, 2026-10-04). A server
  -- channel has no JWT, so the arm above finds nobody — yet the row it writes already names the person
  -- the work is for: `created_by`. Measured: the Agent Builder (MCP agent_author) saving an agent whose
  -- tags were new made `platform.tag_scope_id` create the tag scope, whose store copy
  -- (`custom._ctx_store_scope`, created_by = the agent's owner) was refused "does not say who the
  -- agent is acting for", so no agent with a never-used tag could be built server-side. A document
  -- that DECLARES itself an agent still names its person itself.
  if v_obo is null and v_actor = 'agent' and nullif(btrim(coalesce(v_data ->> '_actor', '')), '') is null
     and new.created_by is not null then
    v_obo := new.created_by::text;
  end if;
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src, v_kept_by, v_flabel, v_fdefault in
                        select f.data ->> 'key', f.data ->> 'source', f.data -> 'config' ->> 'kept_by',
                               coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key'), f.data -> 'default'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
      if v_key is not null and v_kept_by = 'agent_output' then
        v_platform := v_platform || jsonb_build_object(v_key, jsonb_build_object('label', v_flabel, 'default', v_fdefault));
      end if;
    end loop;

    -- KINDS-GLUE N-C3 (CHAIR-DOORS-2): ON A TABLE KEPT FOR AGENT OUTPUTS, A PERSON NEVER WRITES THE
    -- PLATFORM FIELDS, AND A PERSON'S EDIT MARKS THE ROW KEPT. The platform Fields (output_state,
    -- output_chain, output_generation, output_replaced_by, output_reason, ...) say where an output stands
    -- in its chain; only the chain door custom.record_write_graph_superseding moves them, and it opens
    -- itself for exactly its own transaction (custom.output_chain_door = this transaction's id), so a
    -- person's Make current / Keep both through that door is the door's write, not hers. The one
    -- platform Field a person sets herself is output_kept = true: keeping is the owner's own mark.
    -- Any other value a person writes on such a row (or a row she adds) marks it kept, so the next
    -- regeneration never hides or overwrites her work (knob records/agent_outputs.keep_on_person_edit,
    -- default on, per organization and Table). A person's own import counts as hers: the importer
    -- stamps imported values `system` (they came from a file), so a row it adds in a person's browser
    -- session (the connection says user, the document says it came via import) is judged as her write.
    if v_platform <> '{}'::jsonb
       and (v_actor = 'user'
            or (v_data -> '_source' ->> 'via' = 'import' and platform.declared_actor_tier() is not distinct from 'user'))
       and coalesce(current_setting('custom.output_chain_door', true), '') is distinct from txid_current()::text then
      for v_pkey in select k from jsonb_object_keys(v_platform) k loop
        if v_pkey = 'output_kept' and (v_data -> v_pkey) = 'true'::jsonb then
          continue;
        end if;
        if (tg_op = 'UPDATE' and (v_data -> v_pkey) is distinct from (old.data -> v_pkey))
           or (tg_op = 'INSERT' and coalesce(v_data -> v_pkey, 'null'::jsonb) <> 'null'::jsonb
               and (v_data -> v_pkey) is distinct from (v_platform -> v_pkey -> 'default')) then
          raise exception '"%" is a platform table, so it is not yours to change.', v_platform -> v_pkey ->> 'label'
            using errcode = '42501',
                  hint = 'Nothing was saved. Where an output stands in its chain changes only through its own actions (Make current, Keep both, It replaces...). Edit the output''s values instead, and it is kept as yours.';
        end if;
      end loop;
      if v_platform ? 'output_kept'
         and (v_data -> 'output_kept') is distinct from 'true'::jsonb
         and (tg_op = 'INSERT'
              or exists (select 1 from jsonb_each(v_data) e
                          where left(e.key, 1) <> '_' and not (v_platform ? e.key)
                            and (old.data -> e.key) is distinct from e.value))
         and coalesce((platform.knob_resolve('records', 'agent_outputs.keep_on_person_edit', new.organization_id, null,
                         jsonb_build_array(jsonb_build_object('kind', 'table', 'id', new.table_id))) #>> '{}')::boolean, true) then
        v_data := v_data || jsonb_build_object('output_kept', true);
        if not (v_values ? 'output_kept') then
          v_values := v_values || jsonb_build_object('output_kept', '{}'::jsonb);
        end if;
      end if;
    end if;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  -- BIG-VALUES-WRITE: each carried value's envelope names its whole text. The SAME whole text
  -- the cell's file already holds (same SHA-256) keeps that pointer, so re-saving it is not a
  -- new version; any other text gets a pending pointer and waits for its file.
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(v_whole) e loop
    if coalesce(jsonb_typeof(v_data -> '_values' -> v_key), '') <> 'object' then
      raise exception '%', custom.size_refusal(new.organization_id,
                                               jsonb_build_object(v_key, v_whole -> v_key))
        using errcode = '23514',
              hint = 'Only a Field of this Table carries a big text into a file. Declare the Field, then write it again.';
    end if;
    v_prior := null;
    if tg_op = 'UPDATE' then
      v_prior := old.data -> '_sources' -> (old.data -> '_values' -> v_key ->> 'src');
    end if;
    v_carry := custom.whole_value_source(v_text, v_data -> '_values' -> v_key -> 'src');
    if v_prior is not null and v_prior ->> 'kind' = 'whole_value_in_file'
       and v_prior ->> 'sha256' = v_carry ->> 'sha256' then
      v_data := jsonb_set(v_data, array[v_key], old.data -> v_key);
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_prior);
    else
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_carry);
      v_park := v_park || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  -- LANE 10 P4 round 3 (V11 #6): CLEARING A VALUE IS A WRITE, AND SAYS WHO MADE IT. A value this
  -- write removed keeps an envelope stamped with this writer and moment (its version moved on, no
  -- value, no absence word), so Last changed by names whoever cleared it. A value set aside into
  -- `_retired` by this same write (a change of the column) keeps that path instead.
  if tg_op = 'UPDATE' and jsonb_typeof(old.data -> '_values') = 'object' then
    for v_key in
      select e.key from jsonb_each(old.data -> '_values') e
       where old.data ? e.key and jsonb_typeof(old.data -> e.key) <> 'null'
         and (not (v_data ? e.key) or jsonb_typeof(v_data -> e.key) = 'null')
         and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_data -> '_retired') = 'array'
                                                                  then v_data -> '_retired' else '[]'::jsonb end) x
                          where x ->> 'key' = e.key)
    loop
      v_data := jsonb_set(v_data, '{_values}',
                  coalesce(case when jsonb_typeof(v_data -> '_values') = 'object' then v_data -> '_values' end, '{}'::jsonb)
                  || jsonb_build_object(v_key, jsonb_build_object(
                       'ver', coalesce((old.data -> '_values' -> v_key ->> 'ver')::numeric, 0) + 1,
                       'actor', v_actor, 'on_behalf_of', to_jsonb(v_obo), 'at', to_jsonb(now()))));
    end loop;
  end if;

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;

  -- BIG-VALUES-WRITE: the whole texts that still need their file wait beside the record, in
  -- the same transaction - so a refused write leaves nothing waiting.
  if v_park <> '{}'::jsonb then
    perform custom.whole_value_park(new.organization_id, new.table_id, new.id,
                                    coalesce(new.created_by, custom.query_principal()),
                                    new.visibility, v_data, v_park);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_platform_tables boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
-- SEARCHED (lane DATA-HOME-3B, 2026-10-01): p_search narrows those same rows to the ones that match and
-- ranks them (see the campaign file's header); unsearched, nothing below the walk changes.
-- APP TABLES (lane CHAIR-DOORS-2, v6 N-C8, 2026-10-02): a Table the app keeps out of every default
-- list (custom.table_kept_out_of_lists — today the outputs an agent lands, kept_for agent_output) is
-- not among the tables unless p_include_platform_tables is true — the page's "Show platform tables" switch.
-- It is handed to custom.data_home_tables as is; it narrows, never widens, and searched rows obey it.
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_qid     uuid;
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.data_home searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  -- PERF-FIX-3: ... AND FOR THE OTHER ORGANIZATIONS THE PAGE LISTS. An organization she reaches only through a
  -- share (a live grant on one of its Tables) has forms, portals or dashboards listed too, and each of
  -- those asks custom.hub_changed_by, which asks custom.visible_set for that organization - and found no
  -- memo entry, so the walk ran a second time, alone, for one organization. Walked here with the rest it
  -- is one pass; the answer about an organization never depends on which others are walked beside it
  -- (custom.tables_seen_among's header), so what visible_set reads back is what it would have worked out.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
            union
            -- PERF-FIX-4 g: an organization reached only through a share is walked here only with the switch
            -- off; otherwise it is walked below, and only if the page asks who changed something in it
            select t.organization_id
              from iam.permissions g
              join custom.record t
                on t.id = g.resource_id
               and t.table_id = custom.table_kernel_id()
               and t.deleted_at is null
              join iam.organizations o on o.id = t.organization_id and o.archived_at is null
             where g.resource_type = 'record'
               and g.granted_to_user_id = v_me
               and g.status = 'active'
               and (g.expires_at is null or g.expires_at > now())
               and (p_organization_id is null or t.organization_id = p_organization_id)
               and coalesce(current_setting('mx.data_home_set', true), '') = 'off'));

  -- LANE 10 FD (2026-10-02): each table row also says whether it is Foundation — read off the Table's
  -- own document (custom.table_is_foundation), one key lookup per row already admitted above.
  -- The rows keep the door's own order (WITH ORDINALITY, aggregated in it), exactly as before the join.
  select coalesce(jsonb_agg((to_jsonb(t) - 'ordinality')
                              || jsonb_build_object('foundation', coalesce(custom.table_is_foundation(r.data), false))
                            -- PERF-FIX-4 e: a fixed order (name, then id), so two calls on one snapshot are byte-identical
                            order by coalesce(t.table_name, ''), t.table_id, t.organization_id, (to_jsonb(t) - 'ordinality')::text), '[]'::jsonb)
    into v_tables
    from custom.data_home_tables(p_organization_id, p_include_platform_tables) with ordinality t
    left join custom.record r
      on r.organization_id = t.organization_id and r.id = t.table_id and r.table_id = custom.table_kernel_id()
   -- DATA-HOME-SLIM (2026-10-08): PLATFORM TABLES ONLY WHEN ASKED. A Table the app keeps for itself
   -- (kept_by_the_app: a choice column's List above all, 682 of the 760 such rows for the admin seat)
   -- is listed only under "Show platform tables" (p_include_platform_tables). The page already dropped them
   -- in the browser by this same fact (records-ui isKeptTable over a data_home row is exactly
   -- kept_by_the_app = true); now they are never sent, and nobody is asked who changed them.
   where p_include_platform_tables or not coalesce(t.platform_owned, false);
  -- PERF-FIX-4 e: a fixed order (name, then id, then kind and organization)
  select coalesce(jsonb_agg(to_jsonb(i)
                            order by coalesce(i.item_row ->> 'title', i.item_row ->> 'name', i.item_row ->> 'label', ''),
                                     i.item_id, i.kind, i.organization_id, to_jsonb(i)::text), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  if v_q is not null then
    -- A WHOLE ID PASTED IN finds its row outright; any shorter run of hex never matches an id.
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_qid := v_q::uuid;
    end if;

    -- THE TABLES SHE MAY OPEN (above), ranked on title, description and Fields.
    with t as (
      select e as row_, (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
             coalesce(e ->> 'table_name', '') as nm, (e ->> 'updated_at')::timestamptz as at
        from jsonb_array_elements(v_tables) e
    ), d as (
      -- the Table's own description, read from the very Table record listed above
      select r.id, nullif(btrim(r.data ->> 'description'), '') as descr
        from t
        join custom.record r
          on r.organization_id = t.org
         and r.id = t.id
         and r.table_id = custom.table_kernel_id()
    ), f as (
      -- its live Fields (custom.applicable_fields' own rule: data.entity_definition_id = the Table)
      select (fr.data ->> 'entity_definition_id') as tid,
             array_agg(coalesce(nullif(btrim(fr.data ->> 'label'), ''), fr.data ->> 'key')
                       order by (fr.data ->> 'sort') nulls last, fr.id) as labels,
             array_agg(coalesce(fr.data ->> 'key', '') order by (fr.data ->> 'sort') nulls last, fr.id) as keys
        from custom.record fr
       where fr.organization_id = any (array(select distinct t.org from t))
         and fr.table_id = custom.field_kernel_id()
         and fr.deleted_at is null
         and (fr.data ->> 'entity_definition_id') in (select t.id::text from t)
       group by 1
    ), s as (
      select t.row_, t.nm, t.at, d.descr, f.labels, f.keys,
             public.mtx_search_score(v_q, case when v_qid is not null then t.id end, t.nm, d.descr,
                                     null, null, coalesce(f.labels, '{}'), coalesce(f.keys, '{}')) as rank,
             (v_qid is not null and t.id = v_qid) as by_id
        from t
        left join d on d.id = t.id
        left join f on f.tid = t.id::text
    ), hit as (
      select s.*,
             case
               when s.by_id then 'id'
               when public.mtx_search_score(v_q, null, s.nm, null, null, null) > 0 then 'name'
               when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0 then 'description'
               when public.mtx_search_score(v_q, null, null, null, null, null, coalesce(s.labels, '{}'), coalesce(s.keys, '{}')) > 0 then 'field'
               -- several words spread over title, description and Fields: say where the first word is
               when position(split_part(lower(v_q), ' ', 1) in lower(s.nm)) > 0 then 'name'
               when position(split_part(lower(v_q), ' ', 1) in lower(coalesce(s.descr, ''))) > 0 then 'description'
               else 'field'
             end as matched_in
        from s
       where s.rank > 0
    )
    select coalesce(jsonb_agg(
             h.row_ || jsonb_build_object(
               'match_rank', h.rank,
               'matched_in', h.matched_in,
               'matched_field', case when h.matched_in = 'field' then
                  (select coalesce(l.label, k.key)
                     from unnest(coalesce(h.labels, '{}')) with ordinality as l(label, o)
                     full join unnest(coalesce(h.keys, '{}')) with ordinality as k(key, o) using (o)
                    where position(split_part(lower(v_q), ' ', 1) in lower(coalesce(l.label, ''))) > 0
                       or position(split_part(lower(v_q), ' ', 1) in lower(coalesce(k.key, ''))) > 0
                    -- the Field that holds the whole search first, then the first that holds its first word
                    order by (position(lower(v_q) in lower(coalesce(l.label, ''))) > 0) desc,
                             (position(lower(v_q) in lower(coalesce(k.key, ''))) > 0) desc,
                             o
                    limit 1) end)
             order by h.rank desc, length(h.nm), h.at desc nulls last, h.nm, h.row_::text), '[]'::jsonb)
      into v_tables
      from hit h;

    -- THE REST THE HOME LISTS (forms, booking pages, portals, dashboards, digests, checklists,
    -- automations, outside shares), ranked on their own title and description.
    with i as (
      select e as row_,
             coalesce(e -> 'item_row' ->> 'title', e -> 'item_row' ->> 'name', e -> 'item_row' ->> 'label', '') as nm,
             nullif(btrim(e -> 'item_row' ->> 'description'), '') as descr,
             (e ->> 'item_id')::uuid as id
        from jsonb_array_elements(v_items) e
    ), s as (
      select i.*,
             public.mtx_search_score(v_q, case when v_qid is not null then i.id end, i.nm, i.descr, null, null) as rank,
             (v_qid is not null and i.id = v_qid) as by_id
        from i
    )
    select coalesce(jsonb_agg(
             s.row_ || jsonb_build_object(
               'match_rank', s.rank,
               'matched_in', case when s.by_id then 'id'
                                  when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0
                                   and public.mtx_search_score(v_q, null, s.nm, null, null, null) = 0 then 'description'
                                  else 'name' end,
               'matched_field', null)
             order by s.rank desc, length(s.nm), s.nm, s.id, s.row_::text), '[]'::jsonb)
      into v_items
      from s
     where s.rank > 0;
  end if;

  -- THE MAKER, BY NAME (lane DATA-HOME-3B2, 2026-10-01). Every Table row gains created_by_name: the
  -- name custom.history_people gives its maker (created_by) in the Table's own organization — the
  -- same door that names who changed a row on this page (custom.hub_changed_by), so Owner and
  -- Changed by never disagree about a person's name. Only a member of that organization is named;
  -- a maker who is not one (left, or never was) is null and the page shows its dash. One
  -- history_people call per organization, after any search narrowing; row order is kept.
  -- SYNCED FROM (lane VISION-REACH wave 3): every Table row also says where it syncs from — the
  -- provider of its sync_source ('postgres' for an outside database, 'google_sheets' for a sheet
  -- tab), null for a table of our own — read from the very Table record listed, so the home can
  -- badge it Synced.
  -- WHO CHANGED EACH TABLE, FROM THE SAME READ (lane CHAIR-STORE-PERF, 2026-10-03). The Tables listed
  -- above are the ones the one walk already admitted for her (custom.data_home_tables lists nothing
  -- else), and custom.hub_changed_by answers a live Table from that same walk — so asking it again,
  -- one organization at a time, re-decided what this statement had decided (51 asks, ~330 ms for a
  -- person in 38 organizations with Tables). Their changed-by row is read here, off the Table record
  -- this step already joins, with the name from the same custom.history_people call that names the
  -- maker. Same row, same shape: organization_id, id, at = updated_at (else created_at),
  -- who = the name of updated_by (else created_by), null when that person is not a member.
  -- Everything else the home lists (dashboards, digests, checklists, boards, forms, booking pages,
  -- portals), and any Table row not answered here, is still asked of custom.data_home_changed_by.
  with rows_ as materialized (
    select t.e, t.o,
           (t.e ->> 'organization_id')::uuid as org,
           (t.e ->> 'table_id')::uuid as id,
           (t.e ->> 'created_by')::uuid as maker,
           tr.data -> 'sync_source' ->> 'provider' as synced_from,
           coalesce(tr.updated_at, tr.created_at) as at,
           coalesce(tr.updated_by, tr.created_by) as changer,
           (tr.id is not null and tr.deleted_at is null and coalesce(tr.data_class, 'record') <> 'record') as answered
      from jsonb_array_elements(v_tables) with ordinality as t(e, o)
      left join custom.record tr
        on tr.organization_id = (t.e ->> 'organization_id')::uuid
       and tr.id = (t.e ->> 'table_id')::uuid
       and tr.table_id = custom.table_kernel_id()
  ), mk as (
    select r.org, array_agg(distinct p.id) as ids
      from rows_ r
      cross join lateral (values (r.maker), (case when r.answered then r.changer end)) as p(id)
     where p.id is not null
     group by 1
  ), people as materialized (
    -- asked once per organization (materialized: never once per row)
    select mk.org, custom.history_people(mk.org, mk.ids) as m from mk
  )
  select coalesce(jsonb_agg(r.e || jsonb_build_object('created_by_name', p.m #>> array[r.e ->> 'created_by', 'name'],
                                                      'synced_from', r.synced_from)
                  order by r.o), '[]'::jsonb),
         -- one row a Table, however many lanes listed it (the asks below were always a set)
         (select coalesce(jsonb_agg(jsonb_build_object('organization_id', c.org, 'id', c.id, 'at', c.at,
                                                       'who', cp.m #>> array[c.changer::text, 'name'])
                                    order by c.org, c.id), '[]'::jsonb)
            from (select distinct a.org, a.id, a.at, a.changer from rows_ a where a.answered) c
            left join people cp on cp.org = c.org)
    into v_tables, v_changed
    from rows_ r
    left join people p on p.org = r.org;

  with listed as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), ids as (
    -- a structure answered above (a Table, or an item that IS that Table) is not asked again
    select l.org, l.k, l.id
      from listed l
     where not (l.k = 'structure'
                and exists (select 1 from jsonb_to_recordset(v_changed) as a(organization_id uuid, id uuid)
                             where a.organization_id = l.org and a.id = l.id))
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  -- PERF-FIX-4 g (2026-10-07): the organizations reached only through a share that the asks below name,
  -- walked together in one pass (their tables listed here are the granted ones, answered without the walk;
  -- only custom.hub_changed_by's form, portal and structure arms read the walk for them). An organization's
  -- answer never depends on which others are walked beside it (custom.tables_seen_among's header).
  -- PERF-FIX-4 h: no longer needed (custom.hub_changed_by asks such an organization among the named Tables);
  -- kept only for the switch's old path, which walks them up front anyway.
  if false and v_asks is not null then
    perform count(*)
       from custom.tables_seen_once_per_group(v_me, array(
              select distinct (e ->> 'organization_id')::uuid
                from jsonb_array_elements(v_asks) e
               where not exists (select 1 from iam.organization_member m
                                  where m.organization_id = (e ->> 'organization_id')::uuid and m.user_id = v_me)));
  end if;
  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  -- PERF-FIX-4 i: who changed what, in a fixed order (organization, id, then the row), so two calls on one
  -- snapshot are byte-identical (the asks' rows came back in whatever order each door's plan gave)
  select coalesce(jsonb_agg(e order by e ->> 'organization_id', e ->> 'id', e::text), '[]'::jsonb)
    into v_changed
    from jsonb_array_elements(v_changed) e;

  if v_q is null then
    return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
  end if;
  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed, 'search', v_q);
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home_slim(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_platform_tables boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  h jsonb := custom.data_home(p_organization_id, p_search, p_include_platform_tables);
begin
  return (jsonb_build_object(
    'slim', true,
    'orgs', coalesce((select jsonb_object_agg(q.org, q.nm)
                        from (select distinct t ->> 'organization_id' as org, t ->> 'organization_name' as nm
                                from jsonb_array_elements(h -> 'tables') t) q), '{}'::jsonb),
    'tables', coalesce((select jsonb_agg((select jsonb_object_agg(k.key, k.value)
                                            from jsonb_each(t - 'organization_name') k
                                           where k.value <> 'false'::jsonb
                                             and not (k.value = 'null'::jsonb and k.key in ('created_by', 'created_by_name', 'synced_from')))
                                         order by o)
                          from jsonb_array_elements(h -> 'tables') with ordinality as x(t, o)), '[]'::jsonb),
    'items', h -> 'items',
    'changed_by', coalesce((select jsonb_agg(jsonb_build_array(c ->> 'organization_id', c ->> 'id', c -> 'at', c -> 'who') order by o)
                              from jsonb_array_elements(h -> 'changed_by') with ordinality as y(c, o)), '[]'::jsonb),
    'search', h -> 'search'));
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, platform_owned boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text
                                       || ':' || pg_catalog.pg_current_snapshot()::text) is null));


  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    team_reach as materialized (
      -- MY TEAM (lane DATA-HOME-2, 2026-09-30): (organization, person) pairs the signed-in person shares a
      -- live team with — iam.my_team_reach, the same answer every *_list_scoped RPC narrows My team by.
      select tr.organization_id, tr.user_id from iam.my_team_reach(null) tr
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'platform_owned')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'platform_owned')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end,
           -- MY TEAM: the Table's maker shares a live team with her in its organization.
           exists (select 1 from team_reach tr where tr.organization_id = a.id and tr.user_id = t.created_by),
           -- SYSTEM: the Table lives in an organization the platform itself keeps (iam.organizations.is_system).
           coalesce((select o2.is_system from iam.organizations o2 where o2.id = a.id), false),
           -- THE MAKER (lane DATA-HOME-2, 2026-09-30): the Table's own created_by, so a list outside the
           -- data home (the agent builder's picker) can run the shell's lanes on the same facts.
           t.created_by
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'platform_owned', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      -- PERF-FIX-3: a hashed set lookup (an EXISTS in a select list is a correlated
                                      -- CTE scan per row: 1,781 scans of the CTE, ~0.3 ms each)
                                      else (t.id::text in (select o.id from options_ids o)) end) as word offset 0) w) d offset 0
      ) pl
     -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
     -- default list (custom.table_kept_out_of_lists on its placement word) is listed only when the caller
     -- asks with p_include_platform_tables. Every other Table the app keeps (lists, scopes, forms …) is unchanged.
     -- The switch travels as the transaction-local setting custom.include_platform_tables, which only the
     -- two-argument overload sets (and puts back); unset, the Table stays out.
     where current_setting('custom.include_platform_tables', true) is not distinct from 'on'
        or not custom.table_kept_out_of_lists(pl.p ->> 'kept_for');
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid, p_include_platform_tables boolean)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, platform_owned boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- "SHOW APP TABLES" (lane CHAIR-DOORS-2, v6 N-C8): custom.data_home_tables(uuid) with the one switch. It
-- decides nothing itself — the one-argument door (SECURITY DEFINER, its own walls) answers; this only
-- tells it, through the transaction-local custom.include_platform_tables, whether the Tables the app keeps out
-- of default lists are wanted, and puts the setting back as it found it, on every path.
declare
  v_was text := current_setting('custom.include_platform_tables', true);
begin
  perform set_config('custom.include_platform_tables', case when p_include_platform_tables then 'on' else 'off' end, true);
  return query select * from custom.data_home_tables(p_organization_id);
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
exception when others then
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
  raise;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.records_search(p_search text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_table_ids uuid[] DEFAULT NULL::uuid[], p_organization_ids uuid[] DEFAULT NULL::uuid[], p_include_platform_tables boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, table_id uuid, table_name text, name text, organization_id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_like    text;
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_cap     integer;
  v_orgs    uuid[];
  v_org     uuid;
  v_ids     uuid[];
  v_tids    uuid[];
  v_oids    uuid[];
  v_names   text[];
  v_tnames  text[];
  v_ats     timestamp with time zone[];
  v_kept    uuid[] := '{}'::uuid[];
  v_open    uuid[];
  v_part    uuid[];
  v_pair    record;
  v_pairs   integer := 0;
begin
  -- THE READER IS THE SESSION'S OWN PERSON. Nobody signed in: nothing is listed (the picker's empty state).
  if v_me is null then
    return;
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.records_search searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;

  -- THE ORGANIZATIONS: hers, every one by default. A named one is decided first, in this door's own
  -- name (never an empty list that reads like "nothing there"); then the list is narrowed to it.
  if p_organization_ids is not null then
    foreach v_org in array p_organization_ids loop
      perform custom.assert_client_may_reach(v_org, 'custom.records_search');
    end loop;
  end if;
  v_orgs := array(
    select m.organization_id
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = v_me
       and (p_organization_ids is null or m.organization_id = any (p_organization_ids)));
  if coalesce(cardinality(v_orgs), 0) = 0 then
    return;
  end if;

  -- THE CANDIDATES, in one scan: every live record of a Table she may be shown (app-kept Tables behind
  -- the switch), named like the search, ranked, newest first, capped at two pages (at least 200).
  v_cap  := least(greatest((v_offset + v_limit) * 2, 200), 1000);
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  with t as (
    select t.id, t.organization_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table') as nm,
           coalesce(nullif(btrim(t.data ->> 'title_field'), ''), 'name')  as tf
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
       and (p_table_ids is null or t.id = any (p_table_ids))
       and (p_include_platform_tables or not custom.table_kept_out_of_lists(t.data ->> 'kept_for'))
  ), c as (
    select r.id, r.table_id, r.organization_id, r.updated_at, t.nm,
           nullif(btrim(r.data ->> t.tf), '') as name,
           case when v_q is null then 3
                when lower(r.data ->> t.tf) = lower(v_q) then 0
                when lower(r.data ->> t.tf) like lower(v_q) || '%' then 1
                when lower(r.data ->> t.tf) like '% ' || lower(v_q) || '%' then 2
                else 3 end as rank
      from custom.record r
      join t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = any (v_orgs)
       and r.data_class = 'record'
       and r.deleted_at is null
       and (v_like is null or (r.data ->> t.tf) ilike v_like)
     order by 7, r.updated_at desc, r.id
     limit v_cap
  )
  select array_agg(c.id          order by c.rank, c.updated_at desc, c.id),
         array_agg(c.table_id    order by c.rank, c.updated_at desc, c.id),
         array_agg(c.organization_id order by c.rank, c.updated_at desc, c.id),
         array_agg(c.name        order by c.rank, c.updated_at desc, c.id),
         array_agg(c.nm          order by c.rank, c.updated_at desc, c.id),
         array_agg(c.updated_at  order by c.rank, c.updated_at desc, c.id)
    into v_ids, v_tids, v_oids, v_names, v_tnames, v_ats
    from c;
  if v_ids is null then
    return;
  end if;

  -- AN ORGANIZATION THAT TURNED THE STORE OFF lists nothing (custom.data_home_tables' rule), asked only
  -- of the organizations that hold candidates (a handful), never of every membership.
  v_open := array(select distinct x from unnest(v_oids) x where custom.store_is_open(x));

  -- THE ONE LIST RULE, once per candidate Table, best-ranked Table first. custom.listed_predicate_sql
  -- is the predicate every door that lists over a Table's rows is built from; a Table whose predicate
  -- refuses this reader (she may not know it) contributes nothing — the same as an invented id.
  -- THE WALK STOPS when the page is full: every Table not yet asked holds only rows ranked after its
  -- first candidate, so once the rows kept AHEAD of the next Table's first candidate fill the page,
  -- no unasked Table can change it.
  for v_pair in
    select u.o as org, u.t as tbl, min(u.n) as first_n,
           lead(min(u.n)) over (order by min(u.n)) as next_first_n
      from unnest(v_oids, v_tids) with ordinality as u(o, t, n)
     group by u.o, u.t
     order by min(u.n)
  loop
    continue when not (v_pair.org = any (v_open));
    begin
      execute format(
        'select coalesce(array_agg(r.id), ''{}''::uuid[]) from custom.record r '
        ' where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null '
        '   and r.id = any (%L::uuid[]) and %s',
        v_pair.org, v_pair.tbl,
        array(select u.i from unnest(v_ids, v_oids, v_tids) as u(i, o, t) where u.o = v_pair.org and u.t = v_pair.tbl),
        custom.listed_predicate_sql(v_me, v_pair.org, v_pair.tbl, 'viewer'::public.permission_level, 'r'))
        into v_part;
    exception when insufficient_privilege then
      v_part := '{}'::uuid[];
    end;
    v_kept := v_kept || coalesce(v_part, '{}'::uuid[]);
    v_pairs := v_pairs + 1;
    exit when v_pairs >= 200;
    exit when v_pair.next_first_n is not null
          and (select count(*) from unnest(v_ids) with ordinality as u(i, n)
                where u.n < v_pair.next_first_n and u.i = any (v_kept)) >= v_offset + v_limit;
  end loop;

  return query
    select u.id, u.tid, u.tnm, u.nm, u.oid, u.at
      from unnest(v_ids, v_tids, v_tnames, v_names, v_oids, v_ats) with ordinality as u(id, tid, tnm, nm, oid, at, n)
     where u.id = any (v_kept)
     order by u.n
    offset v_offset
     limit v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.table_ensure(p_organization_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
  v_stored  jsonb;
  v_doc     jsonb;
  v_key     text;
  v_drift   jsonb := '[]'::jsonb;
  -- L12-7: which feature keeps the table this spec describes. A slug is not unique, and two tables
  -- of one slug kept for different things (a person's own, and an app's) are different tables.
  v_kept_for text := nullif(btrim(p_spec ->> 'kept_for'), '');
  -- L12-6: the Home the caller names, when she names one. An instruction, never stored.
  v_home_raw text := nullif(btrim(p_spec ->> 'home_id'), '');
  v_home_given uuid;
  -- VERIFIER 2026-10-02: an archived app table, the app Home, and what a new table's rows start with.
  v_gone      record;
  v_app       boolean := jsonb_typeof(p_spec -> 'app_table') = 'object';
  v_row_defs  jsonb := case when jsonb_typeof(p_spec -> 'row_defaults') = 'object' then p_spec -> 'row_defaults' end;
  v_reach     text := nullif(btrim(p_spec ->> 'members_reach'), '');
  v_keys      text[];
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_ensure');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_ensure');

  if v_name is null then
    raise exception 'Give the table a name.'
      using errcode = '22023',
            hint = 'A table is found by its slug and made with its name. Nothing was made.';
  end if;
  if v_slug is null then
    v_slug := coalesce(nullif(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), 48), ''), 'table');
  end if;
  if v_home_raw is not null then
    if v_home_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That home is not one this store knows, so the table was not made.'
        using errcode = '22023', hint = 'Name the Home by its id, or leave it out and one is made. Nothing was made.';
    end if;
    v_home_given := v_home_raw::uuid;
  end if;

  -- THE LOCK IS THE WHOLE RACE GUARANTEE. Held until this transaction ends; the second caller
  -- reads the first one's committed table below instead of making its own.
  perform pg_advisory_xact_lock(
    hashtextextended('custom.table_ensure|' || p_organization_id::text || '|' || v_slug
                     || coalesce('|' || v_kept_for, ''), 0));

  select r.id, (r.data ->> 'parent_id')::uuid into v_table, v_home
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug
     and nullif(btrim(r.data ->> 'kept_for'), '') is not distinct from v_kept_for
   order by r.created_at, r.id
   limit 1;

  if v_table is null and v_kept_for is not null then
    -- AN ARCHIVED TABLE IS NEVER MADE AGAIN BEHIND THE BACK OF WHOEVER ARCHIVED IT (verifier,
    -- 2026-10-02: an archived app table was silently remade by the next save, so the archive
    -- "worked" and the table came back empty beside it). A table kept for something is found by
    -- slug and kept_for; when none is live and one is archived, this is refused by name, with the
    -- remedy. A table kept for nothing (a person's "Create table") is unchanged: a new one is made.
    select r.id, coalesce(nullif(r.data ->> 'name', ''), v_name) as name into v_gone
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is not null
       and r.data ->> 'slug' = v_slug
       and nullif(btrim(r.data ->> 'kept_for'), '') = v_kept_for
     order by r.created_at, r.id
     limit 1;
    if v_gone.id is not null then
      raise exception '% is archived, so it was not made again.', v_gone.name
        using errcode = '55000',
              hint = 'Restore it from Archived tables, then try again. Nothing was made.',
              detail = jsonb_build_object('archived_table_id', v_gone.id)::text;
    end if;
  end if;

  if v_table is not null then
    -- A table she may not know is refused in the read door's own words, never re-made beside it.
    perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.table_ensure');
    -- LANE 12 P5: THE MARK REACHES A TABLE MADE BEFORE IT EXISTED. An app table's spec carries
    -- `code_depends: true` (ensureAppTable); an existing copy without it gets it on this ensure, with
    -- the declaration's `declared_in` when the stored block has none. A merge of two keys, never a
    -- retype; nothing else on the document changes. Adding the mark is never refused (the guard
    -- refuses only its removal).
    if v_app and coalesce((p_spec ->> 'code_depends')::boolean, false) then
      update custom.record r
         set data = r.data
                    || jsonb_build_object('code_depends', true)
                    || case when (p_spec -> 'app_table') ? 'declared_in'
                                 and not coalesce((r.data -> 'app_table') ? 'declared_in', false)
                            then jsonb_build_object('app_table',
                                   coalesce(r.data -> 'app_table', '{}'::jsonb)
                                   || jsonb_build_object('declared_in', p_spec -> 'app_table' -> 'declared_in'))
                            else '{}'::jsonb end
       where r.organization_id = p_organization_id
         and r.id = v_table
         and (not (r.data @> '{"code_depends": true}'::jsonb)
              or ((p_spec -> 'app_table') ? 'declared_in'
                  and not coalesce((r.data -> 'app_table') ? 'declared_in', false)));
    end if;
  elsif v_home_given is null and v_app then
    -- ONE HOME FOR EVERY APP TABLE OF THE ORGANIZATION (verifier, 2026-10-02: each app table made a
    -- Home of its own, so the organization's Homes filled with "<table> Home" entries nobody made).
    -- Found by what it is kept for (`kept_for: agent_output`, lane12_g), never by its display name,
    -- which a person may rename; found or made under its own lock, so two first saves make one Home.
    perform pg_advisory_xact_lock(hashtextextended('custom.table_ensure|app_home|' || p_organization_id::text, 0));
    select h.id into v_home
      from custom.record h
     where h.organization_id = p_organization_id
       and h.table_id = custom.person_kernel_id()
       and h.deleted_at is null
       and h.data ->> 'kept_for' = 'agent_output'
     order by h.created_at, h.id
     limit 1;
    if v_home is null then
      v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                    jsonb_build_object('name', 'Platform tables', 'kept_for', 'agent_output'));
    end if;
  elsif v_home_given is not null then
    -- L12-6: AN EXISTING HOME, in this organization and live. No second Home is made. Landing a table
    -- in it is the Home's ADD rung (lane12_g): the organization's members_can_add setting, as every
    -- other store door reads it through custom.table_add_rung — never a fixed 'editor'.
    perform custom.assert_client_may_change(p_organization_id, v_home_given, 'custom.table_ensure',
                                            custom.table_add_rung(p_organization_id, v_home_given), 'home');
    if not exists (select 1 from custom.record h
                    where h.organization_id = p_organization_id
                      and h.id = v_home_given
                      and h.deleted_at is null) then
      raise exception 'That home is not here, so the table was not made.'
        using errcode = '22023',
              hint = 'Name a Home of this organization that is not archived, or leave it out and one is made. Nothing was made.';
    end if;
    v_home := v_home_given;
  else
    v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                  jsonb_build_object('name', v_name || ' Home'));
  end if;

  if v_table is null then
    v_table := custom.table_declare(
      p_organization_id,
      (p_spec - 'fields' - 'home_id' - 'row_defaults' - 'members_reach')
        || jsonb_build_object(
             'slug', v_slug,
             'parent_id', v_home,
             -- THE DECLARED KEY, KEPT. A table's `fields` list names each column by its key, and
             -- table_declare's column sketch builds a key from `name` unless one is given — which
             -- collapsed KINDS-GLUE's `cards__flashcard` to `cards_flashcard` and the table was refused.
             'fields', coalesce((select jsonb_agg(jsonb_build_object('name', f ->> 'key', 'key', f ->> 'key') order by n)
                                   from jsonb_array_elements(v_fields) with ordinality e(f, n)
                                  where nullif(f ->> 'key', '') is not null), '[]'::jsonb)));
    v_created := true;

    -- WHAT A NEW TABLE'S ROWS START WITH, AND WHO OF THE ORGANIZATION REACHES IT — each through its
    -- own door, as the caller (who made the table, so may set both). An app table of scope `person`
    -- starts its rows "Only me" (hidden from others' lists, never locked — T-36); an app table every
    -- member adds rows to is reached by members at the level the spec names.
    if v_row_defs is not null then
      perform custom.table_row_defaults_set(p_organization_id, v_table, v_row_defs);
    end if;
    if v_reach is not null then
      perform custom.share_lane_set(p_organization_id, v_table, 'organization', v_reach::public.permission_level);
    end if;
  end if;

  -- THE COLUMNS, through the column door. On a new table every one is defined (the sketches
  -- table_declare made are filled in); on an existing table only a key it does not have yet is
  -- added — a column already defined is never touched, and how it differs from the spec is SAID.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    v_key := v_field ->> 'key';
    v_stored := null;
    if not v_created then
      select r.data into v_stored
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and r.data ->> 'key' = v_key
         and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
       order by r.created_at, r.id
       limit 1;
    end if;

    if v_stored is null then
      perform custom.field_declare(p_organization_id, v_table, v_field);
      continue;
    end if;

    -- THE DECLARED SIDE, as the store would have stored it. A spec it cannot read is itself a
    -- difference, named with the store's own sentence — never a refusal of the whole call.
    begin
      v_doc := custom._field_document_for(p_organization_id, v_table, v_field);
    exception when others then
      v_drift := v_drift || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'aspect', 'spec', 'stored', null, 'declared', sqlerrm));
      continue;
    end;

    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', v_key, 'aspect', a.aspect, 'stored', a.stored, 'declared', a.declared)
                       order by a.n)
        from (values
          (1, 'type',     to_jsonb(coalesce(v_stored ->> 'parity_type', v_stored ->> 'type')),
                          to_jsonb(coalesce(v_doc ->> 'parity_type', v_doc ->> 'type'))),
          (2, 'format',   to_jsonb(nullif(v_stored ->> 'format', '')),
                          to_jsonb(nullif(v_doc ->> 'format', ''))),
          (3, 'label',    to_jsonb(btrim(v_stored ->> 'label')),
                          to_jsonb(btrim(v_doc ->> 'label'))),
          (4, 'multi',    to_jsonb(coalesce((v_stored ->> 'multi')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'multi')::boolean, false))),
          (5, 'required', to_jsonb(coalesce((v_stored ->> 'required')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'required')::boolean, false))),
          (6, 'unique',   to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_stored -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')),
                          to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')))
        ) a(n, aspect, stored, declared)
       where a.stored is distinct from a.declared), '[]'::jsonb);
  end loop;

  -- A STORED COLUMN THE SPEC NO LONGER DECLARES (verifier, 2026-10-02): kept, never removed, and
  -- said — aspect `extra`, its stored type in `stored`.
  if not v_created then
    select coalesce(array_agg(f ->> 'key'), '{}'::text[]) into v_keys from jsonb_array_elements(v_fields) f;
    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', r.data ->> 'key', 'aspect', 'extra',
                                          'stored', coalesce(r.data ->> 'parity_type', r.data ->> 'type'),
                                          'declared', null)
                       order by r.created_at, r.id)
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and nullif(r.data ->> 'key', '') is not null
         and not ((r.data ->> 'key') = any (v_keys))), '[]'::jsonb);
  end if;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created, 'drift', v_drift);
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.table_facts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, platform_owned boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid, foundation boolean)
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
           (t.p ->> 'platform_owned')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'platform_owned')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'platform_owned')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'platform_owned')::boolean then null
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
      left join t wt on kw.word = 'workflow' and wt.id = platform.uuid_or_null(kw.ref)
      -- SCOPES-READS-REST (2026-09-29): the scope a context Table belongs to is a live Record of the store.
      left join lateral (select r.id, r.data ->> 'name' as name
                           from custom.record r
                          where kw.word = 'context' and r.organization_id = p_organization_id
                            and r.id = platform.uuid_or_null(kw.ref) and r.data_class = 'record' and r.deleted_at is null) sc on true
      left join lateral (
        select
          case
            when not (t.p ->> 'platform_owned')::boolean then null
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
            when not (t.p ->> 'platform_owned')::boolean then null
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
              then 'Platform table: ' || case kw.ref
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
            when kw.word = 'app' then 'A platform table.'
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
$function$
;

CREATE OR REPLACE FUNCTION custom.table_kept_out_of_lists(p_kept_for text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHICH PLACEMENT WORDS STAY OUT OF EVERY DEFAULT LIST (lane CHAIR-DOORS-2, v6 N-C8). One word today:
  -- agent_output — the table an agent's outputs land in (KINDS-GLUE wave 2). A list shows such a Table
  -- only when its caller asks (p_include_platform_tables). Null and every other word: not kept out.
  select coalesce(p_kept_for, '') = any (array['agent_output', 'copying'])
$function$
;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_field  uuid := custom.field_kernel_id();
  v_orgs   uuid[] := '{}'::uuid[];
  v_org    uuid;
  v_tables jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization still meets its own wall (custom.assert_client_may_reach, this door's name)
  -- and its own ladder (custom.query_visible_ids) below; an organization whose wall refuses (42501)
  -- contributes nothing. No permission is changed by this branch.
  --
  -- TABLE-LIST-PERF (2026-10-03, lane data-tables-grid-overhaul; shipped by CHAIR-GRID): ONE STATEMENT
  -- FOR EVERY ORGANIZATION. This branch used to call this same door once per organization, and each
  -- call counted rows, Fields and latest activity Table by Table and asked custom.table_placement (a
  -- scan of the organization's whole Field graph) once per Table: ~25-40 s for admin@admin.com (48
  -- organizations, ~600 Tables) against an 8 s statement limit. Now the walls are asked first, the one
  -- ladder is primed once for all admitted organizations (custom.tables_seen_once_per_group, as
  -- custom.data_home_tables does), and the counts, the Field graph and the placement are read once,
  -- set-based. Same rows, same shape, same order.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        perform custom.assert_client_may_reach(v_org, 'custom.table_list_everywhere');
        v_orgs := v_orgs || v_org;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
  else
    perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');
    v_orgs := array[p_organization_id];
  end if;

  if cardinality(v_orgs) = 0 then
    return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
  end if;

  -- STORE-READ-PERF-3/4: the one ladder's Table answer for every admitted organization at once; the
  -- answer waits in this statement's memo and each custom.query_visible_ids below reads its own
  -- organization's part. It decides nothing: without it every answer is the same, only slower.
  if v_me is not null then
    perform count(*) from custom.tables_seen_once_per_group(v_me, v_orgs);
  end if;

  with visible as materialized (
    select o.org, v.v as id
      from unnest(v_orgs) as o(org)
      cross join lateral custom.query_visible_ids(o.org, v_kernel) v
  ),
  tbl as materialized (
    select t.*
      from custom.record t
      join visible v on v.org = t.organization_id and v.id = t.id
     where t.table_id = v_kernel
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  activity as materialized (
    -- rows and latest activity of every listed Table, one grouped read
    select r.organization_id, r.table_id,
           max(r.updated_at) as last_updated,
           count(*) filter (where r.data_class = 'record' and r.deleted_at is null) as row_count
      from (select distinct organization_id, id from tbl) k
      join custom.record r on r.organization_id = k.organization_id and r.table_id = k.id
     group by 1, 2
  ),
  field_counts as materialized (
    -- the Field graph of the admitted organizations, read once: live Fields per Table ...
    select f.organization_id, f.data ->> 'entity_definition_id' as entity_id, count(*) as field_count
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.data_class = 'field'
       and f.deleted_at is null
     group by 1, 2
  ),
  options_tables as materialized (
    -- ... and which Tables a list Field takes its choices from (custom.table_placement's one
    -- Field-graph question, asked once for every organization instead of once per Table)
    select distinct f.organization_id, f.data -> 'config' ->> 'options_table_id' as id
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.deleted_at is null
       and f.data ->> 'type' = 'list'
       and f.data -> 'config' ->> 'options_table_id' is not null
  ),
  store as materialized (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             -- CHAIR-WORLD-LANE: the list's Public mark is the Table's own (published to the web).
             'is_public', t.published_to_web,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at, a.last_updated),
             'row_count', coalesce(a.row_count, 0),
             'field_count', coalesce(fc.field_count, 0),
             'store', 'records')
           -- SC-1 PLACEMENT: custom.table_placement(t.organization_id, t.id, t.data, false), word for
           -- word, with its one Field-graph question answered from `options_tables` above instead of per Table.
           || (select jsonb_build_object(
                        'platform_owned', d.kept,
                        'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end,
                        'offered_as_context',
                          case when jsonb_typeof(t.data -> 'offered_as_context') = 'boolean'
                               then (t.data ->> 'offered_as_context')::boolean else false end)
                 from (select w.word,
                              (w.word is not null
                               or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                               or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                         from (select custom.table_kept_for_derived(
                                        t.data, false,
                                        ot.id is not null) as word) w) d) as doc
      from tbl t
      left join activity a on a.organization_id = t.organization_id and a.table_id = t.id
      left join field_counts fc on fc.organization_id = t.organization_id and fc.entity_id = t.id::text
      left join options_tables ot on ot.organization_id = t.organization_id and ot.id = t.id::text
  )
  -- The order keys are the door's own (latest activity, then creation, newest first); the Table's id
  -- closes a tie so two calls page the same way (CHAIR-GRID).
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc,
                                           (x.doc ->> 'id')), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_platform_tables.
    from (select s.doc from store s
           where current_setting('custom.include_platform_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$
;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid, p_include_platform_tables boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- "SHOW APP TABLES" (lane CHAIR-DOORS-2, v6 N-C8): custom.table_list_everywhere(uuid) with the one switch.
-- The one-argument door (SECURITY DEFINER, its own walls) answers; this only sets the transaction-local
-- custom.include_platform_tables for that one call and puts it back as it found it, on every path.
declare
  v_was text := current_setting('custom.include_platform_tables', true);
  v_out jsonb;
begin
  perform set_config('custom.include_platform_tables', case when p_include_platform_tables then 'on' else 'off' end, true);
  v_out := custom.table_list_everywhere(p_organization_id);
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
  return v_out;
exception when others then
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
  raise;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.table_placement(p_organization_id uuid, p_table_id uuid, p_data jsonb, p_is_kernel boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHO KEEPS A TABLE, AND WHETHER THE CONTEXT PICKER OFFERS IT (lane SC-1 PLACEMENT).
  --   kept_by_the_app     the store's one flag: true = the app or one of its features keeps it,
  --                       false = the organization's own. Stored, or read off the older facts.
  --   kept_for            WHICH feature: the stored word (context, education, dictionary, …),
  --                       else the one the older facts say, else `app`. Null when not kept.
  --   offered_as_context  whether the context picker offers the Table. Stored, else false: only
  --                       a Table somebody marked (a scope type the mover lands) is a context.
  --   foundation          whether the Table is part of the business's day-one data (lane 10 FD).
  select jsonb_build_object(
           'platform_owned', d.kept,
           'kept_for', case when d.kept then coalesce(nullif(btrim(p_data ->> 'kept_for'), ''), d.word, 'app') end,
           'offered_as_context',
             case when jsonb_typeof(p_data -> 'offered_as_context') = 'boolean'
                  then (p_data ->> 'offered_as_context')::boolean else false end,
           -- LANE 10 FD: the business's day-one data (custom.table_is_foundation). Absent = false.
           'foundation', custom.table_is_foundation(p_data))
    from (select w.word,
                 (w.word is not null
                  or coalesce(p_data ->> 'kept_by_the_app', '') = 'true'
                  or coalesce(btrim(p_data ->> 'kept_for'), '') <> '') as kept
            from (select custom.table_kept_for_derived(
                           p_data, p_is_kernel,
                           case when p_is_kernel then false
                                -- the Field graph, asked here and not through custom.table_is_options_table: that
                                -- function is WRITE-PERF-4's and its inverse removes it
                                -- (check:inverses-leave-the-ground-standing, clause d).
                                else exists (select 1 from custom.record f
                                              where f.organization_id = p_organization_id
                                                and f.table_id = custom.field_kernel_id()
                                                and f.deleted_at is null
                                                and f.data ->> 'type' = 'list'
                                                and f.data -> 'config' ->> 'options_table_id' = p_table_id::text) end) as word) w) d
$function$
;

alter view custom."table" rename column kept_by_the_app to platform_owned;

create or replace view custom."table" with (security_invoker=true) as
SELECT id,
    organization_id,
    COALESCE((data ->> 'slug'::text), lower((data ->> 'name'::text))) AS slug,
    (data ->> 'name'::text) AS name,
    COALESCE((data ->> 'label_singular'::text), (data ->> 'name'::text)) AS label_singular,
    COALESCE((data ->> 'label_plural'::text), custom.plural_of((data ->> 'name'::text))) AS label_plural,
    (data ->> 'icon'::text) AS icon,
    (data ->> 'color'::text) AS color,
    COALESCE((data ->> 'type'::text), 'entity'::text) AS type,
    (COALESCE((data ->> 'type'::text), 'entity'::text) = 'detail'::text) AS detail,
    (data ->> 'parent_token'::text) AS parent_token,
    COALESCE(((data ->> 'agent_writable'::text))::boolean, true) AS agent_writable,
    COALESCE((data ->> 'display'::text), 'list'::text) AS display,
    COALESCE(((data ->> 'ordered'::text))::boolean, false) AS ordered,
    COALESCE((data ->> 'weight'::text), 'light'::text) AS weight,
    COALESCE(((data ->> 'retention_days'::text))::integer, 30) AS retention_days,
    (data ->> 'title_field'::text) AS title_field,
    COALESCE((data -> 'fields'::text), '[]'::jsonb) AS fields,
    COALESCE((data -> 'default_sort'::text), '[]'::jsonb) AS default_sort,
    COALESCE((data ->> 'row_order'::text), 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    (data_class = 'kernel'::text) AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data,
    ((custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'platform_owned'::text))::boolean AS platform_owned,
    (custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'kept_for'::text) AS kept_for,
    ((custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'offered_as_context'::text))::boolean AS offered_as_context,
    custom.table_is_foundation(data) AS foundation
   FROM custom.record r
  WHERE ((table_id = custom.table_kernel_id()) AND (deleted_at IS NULL));

notify pgrst, 'reload schema';

update ops.system_error set kind = 'typed_table', error_type = regexp_replace(error_type, '^app_table\.', 'typed_table.') where kind = 'app_table';
