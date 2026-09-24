-- chair-step: this puts back the four bodies sc1t_a_column_crosses_the_wall_where_it_is_open.sql
--   replaced — custom.organization_references, custom.assert_organization_wall,
--   custom._table_move_plan, custom.table_move — byte for byte what pg_get_functiondef answered on
--   the dev clone on 2026-09-24 before it ran. A relation Field's target is then a hard wall again
--   and a move of a table whose column points at a table that stays is refused. Nothing else is
--   touched. A Field already pointing into another organization keeps its declaration; its next
--   write is refused by the restored wall.
-- lane: SC-1-TAILS
-- lock: custom
-- based-on: custom.organization_references(text,uuid,jsonb) 6e49c29f82d3ea96f2f78cec9d96583196df1b48bbc42d5fbd4d15b4656ba171
-- based-on: custom.assert_organization_wall(text,uuid,jsonb) 79f6ce19cac7d6854513636a65494665eb489aeddbf021ac12ca26023260c319
-- based-on: custom._table_move_plan(uuid,uuid,uuid) d39e038ba19d0ca2d80d0faf8e5223189f63bb5bb4586732dea44213541ada41
-- based-on: custom.table_move(uuid,uuid,integer) e7e6ba70790acd0160a86b70f0713c314d6f666061f37c462e92d717ffd3e32c

set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION custom.organization_references(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS TABLE(site text, what text, ref_id uuid, openable boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return query
    -- THE CENSUS. One row per id the store accepts that must resolve inside the organization.
    -- `openable` marks the one site REC-29's "unless the Table allows it" can open.
    --
    -- custom.record — the Table a record belongs to.
    select 'table_id', 'the table this record belongs to',
           nullif(p_row ->> 'table_id', '')::uuid, false
     where p_kind = 'custom.record'
  
    union all
    -- custom.record — the two ends of a relation row (REC-26). THE OPENABLE SITE.
    select 'data.' || e.k, case e.k when 'from' then 'the record this relation starts at'
                                    else 'the record this relation points at' end,
           nullif(p_row -> 'data' ->> e.k, '')::uuid, true
      from (values ('from'), ('to')) e(k)
     where p_kind = 'custom.record' and p_row ->> 'data_class' = 'relation'
  
    union all
    -- custom.record — a Field's declared relation target (FLD-13), and a list Field's options
    -- Table (FLD-5), and the Table a Field defines (FLD-8).
    select 'data.' || e.k, e.w, nullif(p_row -> 'data' ->> e.k, '')::uuid, false
      from (values ('relation_target',      'the table this relation field points at'),
                   ('entity_definition_id', 'the table this field belongs to'),
                   ('scope_table_id',       'the table this rule is about'),
                   ('target_field_id',      'the field this rule works out'),
                   ('rule_id',              'the rule this merge field uses')) e(k, w)
     where p_kind = 'custom.record'
  
    union all
    select 'data.config.options_table_id', 'the table this list field takes its choices from',
           nullif(p_row -> 'data' -> 'config' ->> 'options_table_id', '')::uuid, false
     where p_kind = 'custom.record'
  
    union all
    -- custom.record — every Field a Rule's expression reaches for, by id (REC-17).
    select 'data.expr.field', 'a field this rule reads', (l ->> 'field')::uuid, false
      from jsonb_path_query(coalesce(p_row -> 'data' -> 'expr', '{}'::jsonb),
                            '$.**{0 to 12} ? (exists(@.field))') l
     where p_kind = 'custom.record'
       and jsonb_typeof(l -> 'field') = 'string'
       and (l ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  
    union all
    -- custom.external_link — the stub Record it stands for and the source it came from.
    select 'record_id', 'the record this external link stands for',
           nullif(p_row ->> 'record_id', '')::uuid, false
     where p_kind = 'custom.external_link'
    union all
    select 'source_id', 'the external source this link came from',
           nullif(p_row ->> 'source_id', '')::uuid, false
     where p_kind = 'custom.external_link';
    -- custom.external_source carries no reference into the store: its columns are the
    -- connection token, the foreign schema and table, and the link template. It is listed here
    -- in words rather than omitted, so the next reader knows it was looked at.
end
$function$
;

CREATE OR REPLACE FUNCTION custom.assert_organization_wall(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r        record;
  v_other  uuid;
  v_opened boolean;
begin
  for r in select * from custom.organization_references(p_kind, p_organization_id, p_row)
            where ref_id is not null loop

    -- The kernel is the platform's shared vocabulary (REC-27) and is stored in one
    -- organization, so every organization points at it. Read from the row, never a literal.
    select case when x.data_class = 'kernel' then null else x.organization_id end
      into v_other
      from custom.record x
     where x.id = r.ref_id
     limit 1;

    if v_other is null or v_other = p_organization_id then
      continue;                       -- same organization, the kernel, or resolves nowhere
    end if;

    -- REC-29's one opening: the Table whose records this relation starts at may allow it.
    v_opened := false;
    if r.openable then
      select coalesce((t.data ->> 'cross_organization_relations')::boolean, false)
        into v_opened
        from custom.record f
        join custom.record t
          on t.organization_id = f.organization_id and t.id = f.table_id
       where f.organization_id = p_organization_id
         and f.id = nullif(p_row -> 'data' ->> 'from', '')::uuid
       limit 1;
    end if;
    -- 🚨 VIS-2 (2026-09-19) — AND THE OTHER ORGANIZATION HAS TO AGREE.
    -- The Table flag above is ONE organization's sentence about its own records, and until
    -- now it was the whole of the opening: organization 1 could set a flag on its own Table
    -- and reach into organization 2's records with organization 2 never asked. VIS-23 says
    -- cross-organization sharing is a GRANT whose principal is another organization, and a
    -- grant has two sides. `custom/cross_organization_links` is that second side: an
    -- organization knob, default OFF for everybody, and the wall opens only where the Table
    -- allows it AND both organizations have said yes.
    if coalesce(v_opened, false)
       and custom.cross_organization_links_open(p_organization_id, v_other) then
      continue;
    end if;

    raise exception '% belongs to a different organization', r.what
      using errcode = '23503',
            hint = case when r.openable
                     then format('REC-29 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                                 case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                                 case when custom.cross_organization_links_open(p_organization_id, p_organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                                 case when custom.cross_organization_links_open(v_other, v_other) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end)
                     else 'REC-29 / T15: organizations are hard walls. What a record IS - its table, the table a field points at, the record an external link stands for - never crosses an organization. The route across organizations is a relation the table allows, never this.'
                   end;
  end loop;
end;
$function$
;

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

  -- ── a column's own target never crosses the wall (REC-29 / T15, custom.organization_references) ──
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table,
           coalesce(nullif(btrim(mt.data ->> 'name'), ''), 'a table') as of_name
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'relation_target', '')::uuid
      left join custom.record mt
        on mt.organization_id = v_org and mt.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.id = any (v_fields) and f.deleted_at is null
       and nullif(f.data ->> 'relation_target', '') is not null
       and not (nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t))
       -- the store's own tables (Person, File, …) are kernels every organization shares
       and exists (select 1 from custom.record k where k.organization_id = v_org
                    and k.id = nullif(f.data ->> 'relation_target', '')::uuid and k.data_class <> 'kernel')
     limit 3
  loop
    v_general := v_general || format(
      '%s column links to %s, which stays in %s. A column never points at another organization''s table: remove that column or move %s first.',
      case when r.of_table = p_table_id then 'Its ' || r.col else r.of_name || '''s ' || r.col end,
      r.other, v_org_name, r.other);
  end loop;
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and not (f.id = any (v_fields))
       and nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t)
     limit 3
  loop
    v_general := v_general || format(
      '%s links to this table through its %s column and stays in %s. Remove that column or move %s first.',
      r.other, r.col, v_org_name, r.other);
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
    elsif v_cross_n > 0 and not custom.cross_organization_links_open(v_org, r.id) then
      -- THE WALL IS ASKED OF BOTH ORGANIZATIONS, and the sentence says which is shut.
      v_to_why := format(
        'Some of its rows are linked to rows that stay in %s, and links between organizations need both to allow them: %s. Turn on "Links to other organizations" there, or remove those links first.',
        v_org_name,
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
    'links_across', v_cross_n);

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

CREATE OR REPLACE FUNCTION custom.table_move(p_table_id uuid, p_to_organization_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_opens   jsonb;
  v_plan    jsonb;
  v_from    uuid;
  v_id      uuid;
  v_to_name text;
  v_dest    jsonb;
  v_tables  uuid[];
  v_fields  uuid[];
  v_recs    uuid[];
  v_others  uuid[];
  v_all     uuid[];
  v_rows    uuid[];
  v_forms   uuid[];
  v_pending uuid[];
  v_ids     uuid[];
  v_home_from uuid;
  v_home_to   uuid;
  v_n       bigint;
  v_wave    integer := 0;
  v_moved   jsonb := '{}'::jsonb;
  v_version integer;
  v_events  bigint;
begin
  if v_me is null then
    raise exception 'Sign in to move a table.' using errcode = '42501';
  end if;
  if p_table_id is null or p_to_organization_id is null then
    raise exception 'Say which table to move and which organization it goes to.' using errcode = '22004';
  end if;

  v_opens := custom.where_id_opens(p_table_id);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    raise exception 'That table is not one you have been given, so nothing moved.'
      using errcode = '42501',
            hint = 'The store says the same for a table you may not open and one that does not exist.';
  end if;
  v_from := (v_opens ->> 'organization_id')::uuid;
  v_id   := (v_opens ->> 'resolved_id')::uuid;

  v_plan := custom._table_move_plan(v_id, p_to_organization_id, v_me);

  if not coalesce((v_plan ->> 'may_move')::boolean, false) then
    raise exception '%', v_plan ->> 'why_not' using errcode = '42501';
  end if;
  if p_to_organization_id = v_from then
    raise exception '% is already in %.', v_plan #>> '{table,name}', v_plan #>> '{organization,name}'
      using errcode = '22023';
  end if;
  select d into v_dest from jsonb_array_elements(v_plan -> 'destinations') d
   where d ->> 'id' = p_to_organization_id::text;
  if v_dest is null then
    raise exception 'You are not a member of that organization, so % cannot go there.', v_plan #>> '{table,name}'
      using errcode = '42501',
            hint = 'A table moves only into an organization you belong to.';
  end if;
  v_to_name := v_dest ->> 'name';
  if not coalesce((v_dest ->> 'ok')::boolean, false) then
    raise exception '%', v_dest ->> 'why' using errcode = '55000';
  end if;
  if jsonb_array_length(v_plan -> 'held_by') > 0 then
    raise exception '%', v_plan -> 'held_by' ->> 0
      using errcode = '55000',
            detail = (v_plan -> 'held_by')::text,
            hint = format('Nothing moved. %s stays in %s until this is sorted.',
                          v_plan #>> '{table,name}', v_plan #>> '{organization,name}');
  end if;
  v_version := (v_plan #>> '{table,version}')::integer;
  if p_expected_version is not null and p_expected_version <> v_version then
    raise exception 'Someone changed % while you were deciding. Look again, then move it.', v_plan #>> '{table,name}'
      using errcode = '40001';
  end if;

  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,tables}') x)  into v_tables;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,fields}') x)  into v_fields;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,records}') x) into v_recs;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,others}') x)  into v_others;
  v_all  := v_tables || v_fields || v_recs || v_others;
  v_rows := v_tables || v_recs;

  -- THE ORGANIZATION'S OWN RECORD, on both sides (asked here: custom.organization_home_id is
  -- G11's and its inverse removes it — check:inverses-leave-the-ground-standing, clause d).
  v_home_from := (select h.id from custom.record h
                   where h.organization_id = v_from and h.table_id = custom.organization_kernel_id()
                     and h.deleted_at is null order by h.created_at, h.id limit 1);
  v_home_to   := (select h.id from custom.record h
                   where h.organization_id = p_to_organization_id and h.table_id = custom.organization_kernel_id()
                     and h.deleted_at is null order by h.created_at, h.id limit 1);

  -- THE MARK custom._store_door reads: this transaction moves rows out of v_from. Cleared below.
  perform set_config('custom.table_move_from', v_from::text, true);

  -- IN CONTAINMENT ORDER (SC-1-TAILS). The containment guard and the wall judge every row as it
  -- lands, so a row moves only once everything it points at that is ALSO moving has moved: its
  -- container (parent_id), its Table (table_id), the Table its Field belongs to. The Table first,
  -- then its Fields and rows, then the Tables inside those rows, then theirs — one statement a
  -- wave. The moved Table itself is re-homed under the new organization's own record (or at its
  -- top); a row whose container moves with it keeps its container.
  v_pending := v_tables || v_fields || v_recs;
  loop
    v_wave := v_wave + 1;
    select coalesce(array_agg(x.id), array[]::uuid[]) into v_ids
      from custom.record x
     where x.organization_id = v_from
       and x.id = any (v_pending)
       and not exists (
             select 1 from custom.record p
              where p.organization_id = v_from
                and p.id = any (v_pending)
                and p.id <> x.id
                and (   p.id = x.table_id
                     or p.id = nullif(x.data ->> 'entity_definition_id', '')::uuid
                     or (x.id <> v_id and p.id = custom.containment_parent(x.data))
                     -- a row is judged against its Table's Fields, so they land first
                     or (x.table_id <> custom.field_kernel_id()
                         and p.table_id = custom.field_kernel_id()
                         and p.data ->> 'entity_definition_id' = x.table_id::text)));
    exit when coalesce(array_length(v_ids, 1), 0) = 0;

    -- THE EDGES OF THIS WAVE'S ROWS GO FIRST, AND ASLEEP. A row that lands in the new organization
    -- re-states its relation edges there (custom._relation_associations, as an INSERT), and an
    -- edge still filed under the old organization would be judged there against a Field that has
    -- already left (platform.enforce_relation_edge: "there is no field … in this organization").
    -- So each live edge starting at a row of this wave is re-filed under the new organization
    -- while retired and marked as this move's (the edge contract does not judge a retired row);
    -- the row's own trigger wakes the ones its value still states, and the sweep after the loop
    -- wakes the rest. An edge that was already retired is re-filed as it is.
    update platform.associations a
       set organization_id  = p_to_organization_id,
           deleted_at       = coalesce(a.deleted_at, now()),
           deleted_via_type = case when a.deleted_at is null then 'table_move' else a.deleted_via_type end,
           deleted_via_id   = case when a.deleted_at is null then v_id else a.deleted_via_id end
     where a.organization_id = v_from
       and a.source_type = 'record' and a.source_id = any (v_ids)
       and a.relation_field_id is not null;

    update custom.record x
       set organization_id = p_to_organization_id,
           data = case
                    when x.id <> v_id then x.data
                    when custom.containment_parent(x.data) is null then x.data
                    when custom.containment_parent(x.data) = any (v_all) then x.data
                    when custom.containment_parent(x.data) = v_home_from and v_home_to is not null
                      then jsonb_set(x.data, '{parent_id}', to_jsonb(v_home_to::text))
                    else x.data - 'parent_id' end
     where x.organization_id = v_from
       and x.id = any (v_ids);
    get diagnostics v_n = row_count;
    exit when v_n = 0;
    v_pending := array(select p.id from custom.record p
                        where p.organization_id = v_from and p.id = any (v_pending));
    exit when coalesce(array_length(v_pending, 1), 0) = 0;
    if v_wave > 64 then exit; end if;
  end loop;
  -- The edges this move put to sleep and no row's trigger woke: woken, in the new organization.
  update platform.associations a
     set deleted_at = null, deleted_via_type = null, deleted_via_id = null
   where a.organization_id = p_to_organization_id
     and a.deleted_via_type = 'table_move' and a.deleted_via_id = v_id
     and a.deleted_at is not null;
  if coalesce(array_length(v_pending, 1), 0) > 0 then
    raise exception 'Some of what % carries points at itself in a circle, so nothing moved.', v_plan #>> '{table,name}'
      using errcode = '55000',
            hint = 'REC-8: containment is a tree. The store found rows that wait on each other; report this with the table''s name.';
  end if;
  v_moved := v_moved || jsonb_build_object(
    'tables',  (select count(*) from custom.record t where t.organization_id = p_to_organization_id and t.id = any (v_tables)),
    'fields',  coalesce(array_length(v_fields, 1), 0),
    'records', coalesce(array_length(v_recs, 1), 0),
    'waves',   v_wave);

  update custom.record x set organization_id = p_to_organization_id
   where x.organization_id = v_from and x.id = any (v_others);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('with_it', v_n);
  perform set_config('custom.table_move_from', '', true);

  -- What hangs off its rows, keyed by the Table or by one of its rows.
  update custom.io_comment c set organization_id = p_to_organization_id
   where c.organization_id = v_from and (c.table_id = any (v_tables) or c.record_id = any (v_rows));
  update custom.io_import i set organization_id = p_to_organization_id
   where i.organization_id = v_from and i.table_id = any (v_tables);
  update custom.io_outbox o set organization_id = p_to_organization_id
   where o.organization_id = v_from and (o.table_id = any (v_tables) or o.record_id = any (v_rows));
  update custom.agent_table_origin a set organization_id = p_to_organization_id
   where a.organization_id = v_from and a.table_id = any (v_tables);
  update custom.doc_render d set organization_id = p_to_organization_id
   where d.organization_id = v_from and (d.table_id = any (v_tables) or d.record_id = any (v_rows));
  update custom.doc_signature s set organization_id = p_to_organization_id
   where s.organization_id = v_from and s.record_id = any (v_rows);
  update custom.external_link l set organization_id = p_to_organization_id
   where l.organization_id = v_from and l.record_id = any (v_rows);
  select coalesce(array_agg(f.id), array[]::uuid[]) into v_forms
    from custom.anon_form f where f.organization_id = v_from and f.table_id = any (v_tables);
  update custom.anon_form f set organization_id = p_to_organization_id
   where f.organization_id = v_from and f.id = any (v_forms);
  update custom.anon_inbound i set organization_id = p_to_organization_id
   where i.organization_id = v_from and i.table_id = any (v_tables);
  update custom.anon_submission s set organization_id = p_to_organization_id
   where s.organization_id = v_from and (s.table_id = any (v_tables) or s.form_id = any (v_forms));
  update custom.anon_replay s set organization_id = p_to_organization_id
   where s.organization_id = v_from and s.table_id = any (v_tables);
  update custom.anon_token k set organization_id = p_to_organization_id
   where k.organization_id = v_from and (k.form_id = any (v_forms) or k.record_id = any (v_rows));
  update custom.anon_hit h set organization_id = p_to_organization_id
   where h.organization_id = v_from and h.form_id = any (v_forms);
  update custom.anon_form_draft d set organization_id = p_to_organization_id
   where d.organization_id = v_from and d.form_id = any (v_forms);
  update custom.record_alias a set organization_id = p_to_organization_id
   where a.organization_id = v_from and a.new_id = any (v_all);
  update platform.saved_view v set organization_id = p_to_organization_id
   where v.organization_id = v_from and v.subject_id = any (v_tables);
  -- AN EDGE IS FILED UNDER THE ORGANIZATION OF THE ROW IT STARTS AT (REL-12). One that starts at
  -- a moving row goes with it; one that starts at a row that stays and points at a moving row
  -- stays, and holds its value across the wall the plan already found open. An edge from
  -- something that is not a record (a file, a note) naming a moving row goes with the row, as
  -- before.
  update platform.associations a set organization_id = p_to_organization_id
   where a.organization_id = v_from
     and ((a.source_type = 'record' and a.source_id = any (v_all))
          or (a.source_type <> 'record' and a.target_type = 'record' and a.target_id = any (v_all)));

  -- ITS HISTORY GOES WITH IT. A version is the history OF A ROW; the row now answers in the new
  -- organization, so "who changed this and when" must still answer there.
  update history.row_versions v set organization_id = p_to_organization_id
   where v.entity_type = 'custom.record' and v.organization_id = v_from and v.row_id = any (v_all);

  -- THE MOVE ITSELF IS A VERSION OF EACH TABLE IT CARRIED. The store's capture triggers pair old
  -- and new rows by (organization, id), so a row that changed organization is not paired by
  -- them; this writes the one version per Table that says what happened, who did it, from where.
  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record', t.id, t.organization_id, t.version, 'UPDATE',
         to_jsonb(t) || jsonb_build_object('moved_from_organization_id', v_from,
                                           'moved_with_table_id', case when t.id <> v_id then v_id end),
         v_me, platform.actor_tier(), null, 'table_move'
    from custom.record t
   where t.organization_id = p_to_organization_id and t.id = any (v_tables) and t.data_class = 'table';

  -- A MOVE IS A CHANGE EVENT (SC-1-TAILS). The capture triggers pair by (organization, id) and so
  -- see nothing here; the door writes the pair itself, on the store's one outbox, so matrx-local's
  -- sync, pg_notify('records_changed') and the realtime broadcast learn of it in this transaction:
  -- every live row it moved is `deleted` where it was and `created` where it is. Written AFTER the
  -- outbox re-key above, so these rows are never re-keyed themselves.
  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select side.org, 'records.changed', x.id, x.table_id, side.op, '[]'::jsonb,
         jsonb_build_object(
           'user_id',   v_me,
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  'table_move',
           'moved_table_id', v_id,
           'moved_from_organization_id', v_from,
           'moved_to_organization_id', p_to_organization_id),
         side.org::text || ':' || x.id::text || ':' || coalesce(x.version, 0)::text || ':' || side.op
           || ':table_move:' || txid_current()::text,
         nullif(current_setting('custom.op_id', true), '')::uuid
    from custom.record x
   cross join (values (v_from, 'deleted'), (p_to_organization_id, 'created')) side(org, op)
   where x.organization_id = p_to_organization_id and x.id = any (v_all) and x.deleted_at is null
   order by side.op desc, x.id
  on conflict do nothing;
  get diagnostics v_events = row_count;
  v_moved := v_moved || jsonb_build_object('events', v_events);

  -- What the visibility cache remembers about these rows was worked out in the old organization.
  -- It is a cache (VIS-7): emptied for them, it is rebuilt on the next read. (Not
  -- custom.bump_epoch: W2-EPOCH's inverse removes it — check:inverses-leave-the-ground-standing.)
  delete from custom.visibility_cache c
   where c.item_id = any (v_all) or c.container_id = any (v_all);

  return jsonb_build_object(
    'moved', true,
    'table', v_plan -> 'table',
    'from',  v_plan -> 'organization',
    'to',    jsonb_build_object('id', p_to_organization_id, 'name', v_to_name),
    'carried', v_moved,
    'path',  '/data-v2/' || v_id::text);
end;
$function$
;
