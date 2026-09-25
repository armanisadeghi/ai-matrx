-- inverse of migrations/campaign/uifix19_a_destination_carries_its_address.sql
-- lane: UI-FIX-19
-- based-on: custom._table_move_plan(uuid, uuid, uuid) e978ac0b4cf472cbd005703bf98044a709ad473f51c55e59cef4729d3c432c0b
-- Restores custom._table_move_plan(uuid, uuid, uuid) to the body it replaced (sha d39e038b…).
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
                and coalesce((custom.table_placement(ot.organization_id, ot.id, ot.data, false) ->> 'kept_by_the_app')::boolean, false))
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
    select o.id, o.name::text as name, m.role::text as role
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = p_me and o.id <> v_org
     order by o.is_personal desc, o.name
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
    v_dest := v_dest || jsonb_build_object('id', r.id, 'name', r.name, 'role', r.role,
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
