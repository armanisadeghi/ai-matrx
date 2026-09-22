-- LEAK-T10 — THE RED TWIN. IT PUTS THE DEFECTS BACK AND REQUIRES EVERY GREEN CLAUSE TO FAIL.
--
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/leakt10_red.sql
--
-- It executes the REAL BYTES of two of this lane's inverse migrations —
-- `migrations/inverse/leakt10_a_home_of_a_table_is_not_the_whole_table_down.sql` and
-- `migrations/inverse/leakt10_a_refusal_says_what_is_true_down.sql` — inside a transaction that
-- always rolls back. That is two things at once: it proves those inverses are valid SQL that
-- actually executes, and it proves `leakt10_green.sql` is green about something. A green suite
-- nobody has seen fail is a green suite that may be asserting nothing.
--
-- Every block below is RED when the defect it asserts is BACK. If a block comes out green, the
-- fix is not what made the difference and the green suite's corresponding clause is worthless.
--
-- NOTHING IS COMMITTED. The DDL, the fixture and the organization all disappear at ROLLBACK.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'leakt10_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'7e100000-0000-4a00-8a00-000000000002\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/leakt10_red', true);

-- ══════════════════════════ THE DEFECTS, PUT BACK, FROM THE INVERSES' OWN BYTES ══════════════

CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive seed as (
    -- THE ONE NEW FACT: which of this item's containers IS the Table it lives in. Everything
    -- else about the walk is unchanged.
    select e.container_type, e.container_id, e.conveys_max,
           (p_item_type = 'record'
            and exists (select 1 from custom.record r
                         where r.id = p_item_id and r.table_id = e.container_id)) as is_table
      from custom.carrying_edges_of(p_item_type, p_item_id) e
  ), up as (
    select s.container_type, s.container_id, 1 as depth, s.conveys_max as max_level, s.is_table,
           array[p_item_type || ':' || p_item_id::text,
                 s.container_type || ':' || s.container_id::text] as path
      from seed s
    union all
    select e.container_type, e.container_id, u.depth + 1,
           least(u.max_level, e.conveys_max), false,
           u.path || (e.container_type || ':' || e.container_id::text)
      from up u
      cross join lateral custom.carrying_edges_of(u.container_type, u.container_id) e
     -- `not u.is_table` is the whole change: a Table is where the walk stops, because a
     -- Table's own containers are its Homes and a Home of the Table is not a container of
     -- every record in it.
     where u.depth < 16
       and not u.is_table
       and not (e.container_type || ':' || e.container_id::text) = any (u.path)
  )
  select u.container_type, u.container_id, min(u.depth), max(u.max_level)
    from up u
   group by u.container_type, u.container_id;
$function$
;

CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label   text;
  v_vis     platform.visibility;
  v_rep     uuid;
  v_id      uuid;
  v_n       integer;
  v_window  integer;
  v_carried record;
  -- SHARED-ONLY (2026-09-19): does the caller reach the TABLE itself at this level? Asked
  -- ONCE, before anything else, because it answers for every row at once.
  v_table_carries boolean := false;
  v_tables        integer;
begin
  o_all_visible     := false;
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;

  if p_user is null or p_organization_id is null then
    o_fallback := true;
    o_note := 'READ-PERF: no principal, so the set-based shape has nobody to answer for. The door is walking the per-row ladder, which is what it did before this file.';
    return;
  end if;

  -- THE FOURTH THING THAT MAKES IT STOP (SHARED-ONLY). With no Table named, the answer spans
  -- the kernel Table as well as every ordinary one, and a Table is no longer a member of a
  -- visibility CLASS — it is visible when something inside it is (arm 4 of the one ladder),
  -- so two Tables of one class answer differently and no representative can speak for them.
  if p_table_id is null then
    o_fallback := true;
    o_note := 'SHARED-ONLY: no Table was named, so this answer spans the kernel Table, whose rows '
           || 'are Tables — and a Table is visible when a record inside it is, which is not a '
           || 'property of its visibility class. The door is walking the per-row ladder. REMEDY: '
           || 'name the Table, or give custom.visible_set a per-Table carry list the way '
           || 'custom.visible_predicate_sql would need to emit `table_id = any(...)`.';
    return;
  end if;

  -- THE FIRST THING THAT MAKES IT STOP. `iam.has_access_for_base` pushes a child's REGISTERED
  -- FK parents onto its frontier as well as the closure. There is no such registration for
  -- `record` today, so a record's containers come only from associations — which
  -- `custom.read_door_carried_ids` resolves. If one is ever registered, a row's container is a
  -- COLUMN of its own row, two rows of one class stop answering alike, and the argument this
  -- file rests on stops holding. So it says so and walks.
  if exists (select 1 from platform.entity_relationships er
              where er.child_type = 'record' and er.kind in ('composition', 'containment')) then
    o_fallback := true;
    o_note := 'READ-PERF: `record` now has a registered FK containment parent in '
           || 'platform.entity_relationships, so a row''s container is a column of its own row and '
           || 'two rows of one visibility class no longer answer alike. The door is walking the '
           || 'per-row ladder. REMEDY: teach custom.visible_set to classify on that column too, or '
           || 'seed custom.read_door_carried_ids from it the way it is seeded from associations.';
    return;
  end if;

  -- THE TABLE ITSELF, ONCE (SHARED-ONLY). A Table shared with somebody carries every row in it
  -- (arm 3 of `custom.carrying_edges_of`), so one ladder call about the TABLE answers for the
  -- whole page — and it answers the ordinary case too, where the caller is simply a member of
  -- an organization at `all_records`. The rows it does NOT speak for are the ones whose own
  -- `visibility` is below `internal`, which that edge deliberately does not carry; they fall
  -- through to their class below exactly as before.
  --
  -- 🚨 AND THE TABLE HAS TO BE THIS ORGANIZATION'S OWN LIVE ROW — the same condition arm 3 of
  -- `custom.carrying_edges_of` joins on, and the reason it joins on it. The kernel Tables
  -- (`Table`, `Field`, and the home-record kernel every fixture hangs off) live in the SYSTEM
  -- organization, which is global_readable, so `iam.has_access_for` says yes about them to
  -- EVERY signed-in person. Without this line `p_table_id = 11111111-…-0002` — the Field
  -- kernel — made every Field row of a `shared_only` organization visible to every member.
  -- `custom.shared_only_disagreements()` found it on the main database the minute it existed:
  -- 199 (member, record) pairs where the read door said yes and the one ladder said no.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    -- SHARED-ONLY: `custom.reaches_directly`, NOT the whole ladder. The ladder's arm 4 says
    -- a Table you can see one record inside is a Table you may KNOW; reading that as "and
    -- so it carries every row" turned a single shared record into the whole table on the
    -- main database the day this was written.
    v_table_carries := custom.reaches_directly(p_user, 'record', p_table_id, p_required);
  end if;

  -- THE GRANTED IDS, and the second thing that makes it stop.
  o_granted_all := custom.read_door_granted_ids(p_organization_id, p_table_id);
  v_n := coalesce(array_length(o_granted_all, 1), 0);
  if v_n > custom.read_door_ladder_ceiling() then
    o_fallback := true;
    o_note := format('READ-PERF: %s ids of this Table carry a grant, a membership or a closure row, '
                  || 'which is over the ceiling of %s, so asking them one at a time is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or resolve grants set-based the way '
                  || 'custom.read_door_carried_ids resolves containment.',
                  v_n, custom.read_door_ladder_ceiling());
    return;
  end if;

  -- THE TABLE LIST (SHARED-ONLY). The rows of the kernel Table are the organization's Tables,
  -- and a Table is visible when a record inside it is — one Table at a time, never by class.
  -- An organization holds a few hundred Tables at the very most (263 is the largest on this
  -- database today, against a ceiling of 5,000), so this enumerates them and asks the ladder
  -- once each. Over the ceiling it says so and walks, like every other stop here.
  if p_table_id = custom.table_kernel_id() then
    select count(*) into v_tables
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.deleted_at is null;
    if v_tables > custom.read_door_ladder_ceiling() then
      o_fallback := true;
      o_note := format('SHARED-ONLY: this organization holds %s Tables, over the ceiling of %s, and a '
                    || 'Table is visible when a record inside it is - which no representative can '
                    || 'answer for. The door is walking the per-row ladder. REMEDY: raise '
                    || 'custom.read_door_ladder_ceiling(), or index the "does this Table hold a row '
                    || 'this person reaches" question the way custom.visibility_cache intends.',
                    v_tables, custom.read_door_ladder_ceiling());
      return;
    end if;
    for v_id in
      select r.id
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
    loop
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_id, p_required) then
        o_carried_visible := o_carried_visible || v_id;
      end if;
    end loop;
    o_all_visible := (v_tables = coalesce(array_length(o_carried_visible, 1), 0));
    return;
  end if;

  -- CONTAINMENT, ONCE, DOWNWARD — and the third thing that makes it stop.
  v_carried := custom.read_door_carried_ids(p_user, p_organization_id, p_table_id, p_required);
  o_ladder_calls := o_ladder_calls + coalesce(v_carried.o_containers, 0);
  if v_carried.o_ids is null then
    o_fallback := true;
    o_note := format('READ-PERF: this Table''s records sit under %s distinct containers, which is '
                  || 'over the ceiling of %s, so asking the ladder about each of them is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or give the containers an accessible-set '
                  || 'cache the way VIS-9''s epochs intend.',
                  v_carried.o_containers, custom.read_door_ladder_ceiling());
    return;
  end if;
  o_carried_visible := v_carried.o_ids;

  -- THE CLASSES. One ladder call for each label of `platform.visibility` this Table actually
  -- holds, asked about a row that is NOT the caller's own, NOT granted and NOT carried — the
  -- three things that would make a representative answer for a reason its class does not have.
  for v_label in select e.enumlabel
                   from pg_catalog.pg_enum e
                   join pg_catalog.pg_type t on t.oid = e.enumtypid
                   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'visibility'
                  order by e.enumsortorder
  loop
    v_vis := v_label::platform.visibility;
    -- THE TABLE ALREADY ANSWERED FOR THIS CLASS (SHARED-ONLY). The Table edge carries every
    -- row at or above `internal`, so when the caller reaches the Table there is nothing left
    -- to ask about those classes and no representative to find.
    if v_table_carries and v_vis >= 'internal'::platform.visibility then
      o_true_visibility := o_true_visibility || v_vis;
      continue;
    end if;
    -- THE ROW THIS CLASS SPEAKS FOR, found in three bounded index scans instead of one scan of
    -- the class. `created_by is distinct from p_user` is two ranges and a null, and each of the
    -- three stops at its own first entry; the window is one row wider than the number of ids
    -- that may not represent their class, so it cannot miss a row it is allowed to choose.
    v_window := coalesce(array_length(o_granted_all, 1), 0)
              + coalesce(array_length(o_carried_visible, 1), 0) + 1;
    select c.id into v_rep
      from (
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by is null
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by < p_user
          order by r.created_by desc
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by > p_user
          order by r.created_by asc
          limit v_window)
      ) c
     where not (c.id = any (o_granted_all))
       and not (c.id = any (o_carried_visible))
     limit 1;
    if v_rep is not null then
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_rep, p_required) then
        o_true_visibility := o_true_visibility || v_vis;
      end if;
    end if;
  end loop;

  -- THE GRANTED IDS, ONE AT A TIME, ON THE ONE LADDER. Nothing here decides anything: it asks.
  foreach v_id in array o_granted_all loop
    o_ladder_calls := o_ladder_calls + 1;
    if custom.has_visibility(p_user, 'record', v_id, p_required) then
      o_granted_visible := o_granted_visible || v_id;
    end if;
  end loop;

  -- IS IT THE WHOLE TABLE? Then the page needs no visibility predicate at all and the LIMIT
  -- stops the scan at the first p_limit rows. This is the ordinary case — somebody reading a
  -- Table of their own organization — and it is the case that was costing seconds.
  o_all_visible := (v_n = 0)
                   and not exists (
                     select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.table_id is not distinct from p_table_id
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
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

  -- ── RELATION-DECLARE, 2026-09-20: AND THE LINKS GO WITH THE COLUMNS. ─────────────────
  -- The column was gone and its edges were live, naming a field that no longer exists, which
  -- is the same 23514 a retype caused on the other table's reverse side. The whole going set
  -- is withdrawn in one statement, through the one withdrawal both this and custom.field_update
  -- call, so a removal never leaves a relation behind it. It runs BEFORE the field records are
  -- retired, while those columns still say what their links mean.
  perform custom.relation_edges_withdraw(p_organization_id, v_going,
    format('the column "%s" was removed', custom.said(v_field ->> 'label', v_field ->> 'key')));

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

  return true;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.io_comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL, AND IT IS THE ENUM DOING THE WORK. `commenter` is the second rung, so this one
  -- call admits commenters, editors and admins and refuses viewers — without a single string
  -- comparison and without a second access idea beside the platform's.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    raise exception 'You may read this record but not comment on it.'
      using errcode = '42501',
            hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
  end if;

  -- THE ONE READ DOOR. This used to select from custom.record directly. It was checked, so it
  -- did not leak — but a second reading path is a second place the door's masking does not
  -- apply, and that argument is exactly the one that failed for seo.keyword_value_map.
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- THE READ DOOR SAID NO WHERE THE ACCESS QUESTION SAID YES, and that disagreement is not
    -- this door's to resolve. `custom.read_record` decides from the derived containment graph,
    -- which conveys nothing for a record with no association; `custom.has_visibility`, checked
    -- above, is the platform's ONE answer and has already admitted this caller at `commenter`.
    -- So the comment lands and the convenience copy of `table_id` is simply absent — the one
    -- thing that never happens is a second reading path into `custom.record`.
    v_doc := null;
  end;
  if false then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  v_table := (v_doc ->> 'table_id')::uuid;   -- null when the read door declined; see above

  if p_parent_comment_id is not null
     and not exists (select 1 from custom.io_comment c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.record_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  insert into custom.io_comment (organization_id, record_id, table_id, body, anchor,
                                 parent_comment_id, created_by)
  values (p_organization_id, p_record_id, v_table, btrim(p_body),
          coalesce(p_anchor, '{}'::jsonb), p_parent_comment_id, v_user)
  returning id into v_id;
  return v_id;
end;
$function$

;


DROP FUNCTION IF EXISTS custom.refusals_claiming_a_level_never_asked();

-- ══════════════════════════ THE SAME FIXTURE THE GREEN SUITE BUILDS ══════════════════════════
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LEAK-T10 Red Throwaway', 'leakt10-red-throwaway', 'LTR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'LEAK-T10 red twin'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'LEAK-T10 red twin');

do $t$
declare
  v_org   constant uuid := '7e100000-0000-4a00-8a00-000000000002';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text; v_boss text := current_user;
  v_home uuid; v_tproj uuid; v_hx uuid; v_hy uuid; v_trisk uuid; v_rx uuid; v_ry uuid;
  v_titems uuid; v_num uuid; v_dbl uuid; v_item uuid;
  n int; v_msg text; v_red int := 0;
begin
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;
  c_dana_j  := json_build_object('sub', v_dana::text,  'role', 'authenticated', 'email', 'test@test.com')::text;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this twin did not take the seat — current_user is %', current_user;
  end if;

  v_home  := custom.record_write(v_org, custom.organization_kernel_id(), jsonb_build_object('name', 'red home'));
  v_tproj := custom.table_declare(v_org, jsonb_build_object(
    'name','ltr_projects','slug','ltr_projects','label_singular','Project','label_plural','Projects',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tproj, jsonb_build_object('label','Title','type','text'));
  v_hx := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project X'));
  v_hy := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project Y'));
  v_trisk := custom.table_declare(v_org, jsonb_build_object(
    'name','ltr_risks','slug','ltr_risks','label_singular','Risk','label_plural','Risks',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_trisk, jsonb_build_object('label','Title','type','text'));
  perform custom.home_add(v_org, v_trisk, v_hx);
  perform custom.home_add(v_org, v_trisk, v_hy);
  v_rx := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in X'));
  v_ry := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in Y'));
  perform custom.record_reparent(v_org, v_rx, v_hx);
  perform custom.record_reparent(v_org, v_ry, v_hy);
  perform custom.share_grant(v_org, v_hx, 'user', v_dana, 'viewer'::public.permission_level);

  -- ══ RED 1 — the lists hand her the OTHER project's risk while the record door refuses it.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into n from custom.read_records(v_org, v_trisk, true, 200, 0) d where d.id = v_ry;
  if n = 0 then
    raise exception 'RED 1 IS GREEN — custom.read_records withheld the other project''s risk even with the old whole-Table shortcut back. The green suite''s clause 1c proves nothing.';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 IS RED — custom.read_records hands her the risk that lives in the project she was never given';

  select count(*) into n from custom.query_across_homes(v_org, v_trisk, 200, 0, 'viewer') d where d.record_id = v_ry;
  if n = 0 then
    raise exception 'RED 2 IS GREEN — custom.query_across_homes withheld it. The green suite''s clause 1e proves nothing.';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 IS RED — custom.query_across_homes hands her the same row';

  select count(*) into n from custom.query_visible_ids(v_org, v_trisk, 'viewer') d where d = v_ry;
  if n = 0 then
    raise exception 'RED 3 IS GREEN — custom.query_visible_ids withheld it. The green suite''s clause 1d proves nothing.';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 IS RED — custom.query_visible_ids hands her the same id';

  -- …AND THE RECORD DOOR STILL REFUSES IT, which is what makes this a disagreement and not a
  -- policy. If this ever stops being true the defect has changed shape.
  begin
    perform custom.read_record(v_org, v_ry, true);
    raise exception 'RED 4 IS GREEN — custom.read_record opened it too, so the two doors agree and there is no disagreement to find.';
  exception when insufficient_privilege then
    v_red := v_red + 1;
    raise notice 'RED 4 IS RED — custom.read_record still refuses the row the lists just handed her';
  end;

  -- ══ RED 5 — a column a formula depends on is retired in silence.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_titems := custom.table_declare(v_org, jsonb_build_object(
    'name','ltr_items','slug','ltr_items','label_singular','Item','label_plural','Items',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_titems, jsonb_build_object('label','Title','type','text'));
  v_num := custom.field_declare(v_org, v_titems, jsonb_build_object('label','Number','type','number'));
  v_dbl := custom.field_declare(v_org, v_titems, jsonb_build_object('label','Double','type','number',
    'parity','formula',
    'config', jsonb_build_object('expr', jsonb_build_object('op','multiply','args',
      jsonb_build_array(jsonb_build_object('field', v_num::text), jsonb_build_object('const', 2))))));
  v_msg := null;
  begin
    perform custom.field_retire(v_org, v_num);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is not null then
    raise exception 'RED 5 IS GREEN — custom.field_retire still refused with "%", so the green suite''s clause 2b proves nothing.', v_msg;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 IS RED — the column the formula "Double" reads was retired with no refusal at all';

  -- ══ RED 6 — the comment refusal tells somebody who may not read that she may.
  v_item := custom.record_write(v_org, v_titems, jsonb_build_object('title','an item'));
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform custom.io_comment_write(v_org, v_item, 'hello');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or position('You may read this record' in v_msg) = 0 then
    raise exception 'RED 6 IS GREEN — she was not told she may read it; it said "%".', coalesce(v_msg, '<the comment went through>');
  end if;
  v_red := v_red + 1;
  raise notice 'RED 6 IS RED — "%"', v_msg;

  -- ══ RED 7 — census 13 names the leak, on this very fixture.
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.list_door_disagreements(null, v_org)
   where why like 'doors-disagree%';
  if n = 0 then
    raise exception 'RED 7 IS GREEN — census 13 named no disagreement in an organization where three list doors just handed her a row custom.read_record refuses. The census is not measuring what it claims to.';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 7 IS RED — census 13 names % (member, record, door) disagreement(s) in this organization', n;

  -- ══ RED 8 — the shape census 14 looks for is BACK in the door's body.
  -- The refusal inverse DROPS census 14 along with the fix, which is what a true inverse does —
  -- so the clause cannot call it. It asks the same question of the catalogue instead, exactly
  -- as the census does: the body says "You may read this record" and never asks `viewer`. And
  -- it says out loud that the guard itself is gone, because a guard that vanishes must never
  -- read as a pass.
  if to_regproc('custom.refusals_claiming_a_level_never_asked') is not null then
    raise exception 'RED 8 IS GREEN — census 14 is still here, so its inverse did not execute and the bytes above proved nothing.';
  end if;
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname = 'io_comment_write'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~ 'You may read this record'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~ '''viewer''::public\.permission_level';
  if n = 0 then
    raise exception 'RED 8 IS GREEN — custom.io_comment_write no longer matches what census 14 looks for, although it just told somebody she may read a record it never asked about.';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 8 IS RED — census 14 is gone with the fix, and the body it would have named matches its pattern again';

  raise notice '% of 8 blocks are RED (the defect they assert is back)', v_red;
  if v_red <> 8 then
    raise exception 'only % of 8 blocks went red', v_red;
  end if;
end $t$;

rollback;
