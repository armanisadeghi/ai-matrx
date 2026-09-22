-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: platform.memo_clear() 59a25537a63a4f04b7f12ff7d4a3a23effcde09ca8c1d2e4c240898e0e11ab99
-- based-on: custom.carrying_edges_in(uuid) 4b4e40a753ab9e5455d5ea18325578dd8cecb1ecd01d3b1887f3513ba185bd7a
-- based-on: custom.visible_record_ids(uuid, permission_level) a99682186e83ae0581e5708b4d9cfe5f9c2af9f7c17b8a10a4289aeab8c6d5b1
--
-- MIRROR-PERF-2 — AN ORGANIZATION'S CARRYING EDGES ARE A PROPERTY OF THE ORGANIZATION, SO THEY
-- ARE ASKED ONCE PER ORGANIZATION AND NOT ONCE PER TABLE.
--
-- THE FINDING THIS ANSWERS (lane RED-SUITES-3, 2026-09-21, PROGRESS-RED-SUITES-3 §10): "the SET
-- form, the landed good path, takes ~12.6 s to name 5434 visible ids. Both forms are dominated
-- by something neither the ratio nor this lane looked at."
--
-- WHAT IT IS, MEASURED, NOT GUESSED. `track_functions = 'pl'` over one call of
-- `custom.visible_record_ids(4060701e-…, 'viewer')` on the main database, 2026-09-21
-- (15,084 ms, 5,434 ids, 1,034 (organization, Table) pairs, 77 organizations):
--
--     function                                self ms   calls
--     custom.carrying_edges_in                   2877    1133   <-- the largest SELF node
--     custom.visible_set                         2075    1034
--     custom.visibility_ancestors                1788    1000
--     custom.read_door_carried_ids               1380     913
--     custom.visible_record_ids                  1102       1
--     custom.read_door_granted_ids               1095    1483
--
-- `custom.carrying_edges_in(p_organization_id)` takes ONE argument, an organization, and it was
-- executed 1,133 times for 77 distinct organizations — once inside every
-- `custom.read_door_carried_ids` call, which `custom.visible_set` makes once per (organization,
-- Table) pair. 150,445 edge rows were materialised where 1,981 exist. Its own dominating plan
-- node, `EXPLAIN (ANALYZE, BUFFERS)` on the largest organization:
--
--     Bitmap Heap Scan on platform.associations (actual time=0.129..0.763 rows=281 loops=1)
--       Recheck Cond: ((organization_id = '8cb71c8b-…') OR (organization_id IS NULL))
--       Filter: (deleted_at IS NULL)   Rows Removed by Filter: 742
--       Heap Blocks: exact=368         Buffers: shared hit=375
--
-- — 368 heap blocks, twice per call, 1,133 times. That is the per-iteration recomputation of an
-- organization-level fact, and it is what this file removes.
--
-- WHAT IT DOES NOT CLAIM. The ladder is still ~43% of the run (`custom.has_visibility` total
-- 6,431 ms over 2,019 calls) and this file does not touch it — `mirrorperf_the_mirror_asks_the_
-- set_not_the_row.sql` already said closing that is a change to the ancestor walk. Measured
-- end to end, interleaved A/B on one connection, five readings each, main database 2026-09-21:
--
--     without this file  15006 / 19538 / 14731 / 14734 / 14472 ms   median 14734
--     with this file     11978 / 12620 / 12782 / 12357 / 12259 ms   median 12357
--
-- a 2,377 ms gap (16%) against reading spreads of 5,066 and 804 ms. 5,434 ids both arms, and
-- the two answers were compared inside the loop on every one of the five rounds.
--
-- THE MEMO IS THE PLATFORM'S OWN, NOT A SECOND CACHE. It is one transaction-local slot,
-- `mx_memo.ce`, seat-checked the same way `mx_memo.b` is (role, JWT claims, session_user), and it is
-- cleared by `platform.memo_clear()` — which every one of the sixty existing memo-clear
-- triggers already calls. A memo of an EDGE SET has three inputs the memo lane did not cover,
-- because nothing memoised before depended on them, so this file gives them the same
-- statement-level clear every other input has: `platform.association_types`,
-- `custom.carrying_rule` and `custom.portal_table`. The one input deliberately left uncovered
-- is an INSERT into `platform.associations`, which the lane has never cleared on: a missing new
-- edge under-reports reach, which is a denial and never a leak, and that is the side of the
-- difference the memo lane is already on.
--
-- AND THE LOOP IS ORDERED SO THE SLOT IS HOT. `group by organization_id, table_id` comes back
-- in hash order, so the 1,034 pairs of 77 organizations arrive interleaved and a one-slot memo
-- misses on nearly every pair — measured: with the unordered loop the memo saved nothing
-- (medians 14838 vs 14857 ms). `order by r.organization_id` makes every pair of one
-- organization consecutive, which is the whole of the gain above. The function returns a SET
-- and never promised an order, and census 12 compares sorted arrays.
--

-- 1. THE MEMO LANE LEARNS THE NEW SLOT.
create or replace function platform.memo_clear()
returns void
language sql
set search_path to ''
as $fn$
  select set_config('mx_memo.v', '', true),
         set_config('mx_memo.s', '', true),
         set_config('mx_memo.b', '', true),
         -- MIRROR-PERF-2 (2026-09-21): the organization edge slot. One name added here is what
         -- puts it behind every memo-clear trigger on the database at once.
         set_config('mx_memo.ce', '', true);
$fn$;

comment on function platform.memo_clear() is
  'Throws away everything this transaction remembered about who reaches what: the three memo '
  'lanes (mx_memo.v, .s, .b) and, since MIRROR-PERF-2, the organization carrying-edge slot '
  'mx_memo.ce. Every memo-clear trigger on the database calls this one function, so a new '
  'remembered thing joins them all by being named here.';

-- 2. THE THREE EDGE INPUTS THE MEMO LANE DID NOT COVER.
--
-- 🚨 THESE TRIGGERS RUN THIS LANE'S OWN FUNCTION, NOT `platform.memo_clear_stmt`, AND THE SLOT
-- SPELLS THE SEAT OUT INSTEAD OF CALLING `platform.memo_b_seat()`. Not taste — the guard
-- `check-inverses-leave-the-ground-standing` clause (d): two inverses already in the tree,
-- `writeperf3_the_table_is_read_once_per_statement_down.sql` (drops `platform.memo_b_seat`) and
-- `writeperf3_the_write_path_asks_the_ladder_once_down.sql` (drops `platform.memo_clear_stmt`),
-- take those two objects away outright. Every body and every trigger that adopts one of them
-- turns one of those inverses from "puts a defect back" into "breaks the platform", and this
-- file will not widen that. The two inverses are a real finding and are reported as one; they
-- are not this lane's files to rewrite, and neutering one could disarm its own red twin.
create or replace function platform.memo_clear_edge_inputs_stmt()
returns trigger
language plpgsql
set search_path to ''
as $fn$
begin
  -- ONE call per STATEMENT, never one per row. A carrying RULE has just moved, so every edge
  -- set this transaction remembered is thrown away with the rest of the memo.
  perform platform.memo_clear();
  return null;
end;
$fn$;

comment on function platform.memo_clear_edge_inputs_stmt() is
  'MIRROR-PERF-2 (2026-09-21): the statement-level memo clear for the three tables that decide '
  'what an organization''s carrying edges ARE — platform.association_types, custom.carrying_rule '
  'and custom.portal_table. Identical in behaviour to platform.memo_clear_stmt; separate because '
  'a sibling lane''s inverse drops that one outright and this file will not make that inverse '
  'more destructive than it already is.';
drop trigger if exists zz_memo_clear_i on platform.association_types;
drop trigger if exists zz_memo_clear_u on platform.association_types;
drop trigger if exists zz_memo_clear_d on platform.association_types;
create trigger zz_memo_clear_i after insert on platform.association_types
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_u after update on platform.association_types
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_d after delete on platform.association_types
  for each statement execute function platform.memo_clear_edge_inputs_stmt();

drop trigger if exists zz_memo_clear_i on custom.carrying_rule;
drop trigger if exists zz_memo_clear_u on custom.carrying_rule;
drop trigger if exists zz_memo_clear_d on custom.carrying_rule;
create trigger zz_memo_clear_i after insert on custom.carrying_rule
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_u after update on custom.carrying_rule
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_d after delete on custom.carrying_rule
  for each statement execute function platform.memo_clear_edge_inputs_stmt();

drop trigger if exists zz_memo_clear_i on custom.portal_table;
drop trigger if exists zz_memo_clear_u on custom.portal_table;
drop trigger if exists zz_memo_clear_d on custom.portal_table;
create trigger zz_memo_clear_i after insert on custom.portal_table
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_u after update on custom.portal_table
  for each statement execute function platform.memo_clear_edge_inputs_stmt();
create trigger zz_memo_clear_d after delete on custom.portal_table
  for each statement execute function platform.memo_clear_edge_inputs_stmt();

-- 3. THE EDGE SET, ASKED ONCE PER ORGANIZATION.
create or replace function custom.carrying_edges_in(p_organization_id uuid)
returns table(container_type text, container_id uuid, item_type text, item_id uuid,
              conveys_max public.permission_level)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_raw  text := nullif(current_setting('mx_memo.ce', true), '');
  v_slot jsonb;
  v_json jsonb;
begin
  -- THE SLOT, IF IT IS THIS SEAT'S AND THIS ORGANIZATION'S. A blob that will not parse, a
  -- different seat and a different organization are all MISSES, never errors — the same three
  -- steps platform.memo_b_get takes.
  if v_raw is not null then
    begin
      v_slot := v_raw::jsonb;
    exception when others then
      v_slot := null;
    end;
    if v_slot is not null
       -- The seat, spelled out rather than called — see the note at part 2. Byte-identical
       -- to `platform.memo_b_seat()`: role, the JWT claims, and `session_user`.
       and (v_slot ->> '_seat') is not distinct from
           md5(coalesce(current_setting('role', true), '') || '|' ||
               coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
               session_user)
       and (v_slot ->> 'o') is not distinct from coalesce(p_organization_id::text, '-') then
      v_json := v_slot -> 'e';
    end if;
  end if;

  if v_json is null then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_json from (
      -- arm 1 — platform.containment_edges
      select case when r.container_side = 'source' then a.source_type else a.target_type end
               as container_type,
             case when r.container_side = 'source' then a.source_id   else a.target_id   end
               as container_id,
             case when r.container_side = 'source' then a.target_type else a.source_type end
               as item_type,
             case when r.container_side = 'source' then a.target_id   else a.source_id   end
               as item_id,
             r.conveys_max as conveys_max
        from platform.associations a
        join platform.association_types r
          on r.source_type = a.source_type
         and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null
         and r.is_active
         and r.container_side = any (array['source', 'target'])
         and (a.organization_id = p_organization_id or a.organization_id is null)
      union
      -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
      select case when cr.container_side = 'source' then a.source_type else a.target_type end,
             case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
             case when cr.container_side = 'source' then a.target_type else a.source_type end,
             case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
             cr.conveys_max
        from platform.associations a
        join custom.carrying_rule cr
          on cr.role = a.role
         and cr.is_active
       where a.deleted_at is null
         and (a.organization_id = p_organization_id or a.organization_id is null)
      union
      -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
      -- the container; the record holding the Field is the item. This is what makes "only
      -- theirs" answerable without a per-portal query: an outsider holding her own client
      -- record reaches exactly the records that name it, at the level the portal declared,
      -- through the same ladder as everything else on this platform.
      select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
        from platform.associations a
        join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
        join custom.portal p on p.id = pt.portal_id and p.is_active
       where a.deleted_at is null
         and a.organization_id = p_organization_id
         and pt.organization_id = p_organization_id
         and a.source_type = 'record'
         and a.target_type = 'record') q;

    perform set_config('mx_memo.ce',
                       jsonb_build_object('_seat',
                                          md5(coalesce(current_setting('role', true), '') || '|' ||
                                              coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
                                              session_user),
                                          'o', coalesce(p_organization_id::text, '-'),
                                          'e', v_json)::text,
                       true);
  end if;

  return query
    select x.container_type, x.container_id, x.item_type, x.item_id, x.conveys_max
      from jsonb_to_recordset(v_json)
        as x(container_type text, container_id uuid, item_type text, item_id uuid,
             conveys_max public.permission_level);
end;
$fn$;

comment on function custom.carrying_edges_in(uuid) is
  'Every carrying edge inside one organization: the association-type arm, the custom.carrying_rule '
  'arm and the portal naming-field arm, unioned. MIRROR-PERF-2 (2026-09-21): the answer is a '
  'property of the ORGANIZATION, so it is remembered for the rest of the transaction in the '
  'one-slot memo mx_memo.ce, seat-checked the way mx_memo.b is and cleared by platform.memo_clear() '
  'with every other memo. It was executed 1,133 times for 77 organizations in one call of '
  'custom.visible_record_ids and was that call''s largest self-time node at 2,877 ms.';

-- 4. AND THE PAIR LOOP IS ORDERED SO THE SLOT IS HOT.
create or replace function custom.visible_record_ids(
  p_user_id  uuid,
  p_required public.permission_level default 'viewer'::public.permission_level
)
returns table(id uuid)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_pair record;
  v_pred text;
begin
  -- NO PRINCIPAL, NO SET. The old body said this with `p_user_id is not null` inside the WHERE;
  -- saying it here keeps `custom.visible_predicate_sql`'s own no-principal arm (which judges the
  -- campaign's maintenance connection by its ROLE) out of a function whose whole job is to
  -- answer for a PERSON.
  if p_user_id is null then
    return;
  end if;

  -- ONE PAIR AT A TIME, AND THE PAIRS ARE THE STORE'S OWN. A record lives in exactly one
  -- (organization, Table), so these groups partition the live rows: no row is asked about twice
  -- and none is missed. `table_id` may be null — `is not distinct from` is what keeps those rows
  -- in their own group rather than dropping them, and `custom.visible_set` says of that group
  -- that it cannot answer set-based, which puts the per-row ladder back for exactly those rows.
  --
  -- 🚨 ORDERED BY ORGANIZATION (MIRROR-PERF-2, 2026-09-21), AND THE ORDER IS THE POINT.
  -- Everything inside the loop that costs anything is asked per organization, not per pair:
  -- `custom.carrying_edges_in` was the largest self-time node of this function at 2,877 ms over
  -- 1,133 calls for 77 organizations. It remembers one organization at a time, so the pairs of
  -- one organization must ARRIVE together; `group by` hands them back in hash order, where a
  -- one-slot memo misses nearly every time (measured: 14838 ms unordered against 14857 ms with
  -- the memo, no difference at all — against 12357 ms once ordered). This function returns a
  -- SET and has never promised an order, and census 12 compares sorted arrays.
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r
     where r.deleted_at is null
     group by r.organization_id, r.table_id
     order by r.organization_id, r.table_id
  loop
    -- THE READ DOOR'S OWN PREDICATE, BUILT THE WAY THE READ DOOR BUILDS IT. This is the whole
    -- point of the file: the set form and this function cannot drift, because there is only one
    -- of them. `custom.visible_predicate_sql` emits `true` when the whole pair is visible, the
    -- four-arm set expression when it is not, and the per-row ladder verbatim when
    -- `custom.visible_set` declines.
    v_pred := custom.visible_predicate_sql(p_user_id, v_pair.org, v_pair.tbl, p_required, 'r');

    return query execute format(
      'select r.id from custom.record r'
      || ' where r.organization_id = %L::uuid'
      || '   and r.table_id is not distinct from %L::uuid'
      || '   and r.deleted_at is null'
      || '   and (%s)',
      v_pair.org, v_pair.tbl, v_pred);
  end loop;

  return;
end;
$fn$;

comment on function custom.visible_record_ids(uuid, public.permission_level) is
  'MIRROR-PERF (2026-09-20): every live record this person reaches at p_required, asked ONCE '
  'per (organization, Table) through custom.visible_set — the same set the read doors are built '
  'from — instead of once per row. iam.accessible_entity_ids returns this set while '
  'custom/accessible_entity_ids_guard is on, and iam.entity_read_expr puts it in the RLS '
  'mirror''s last arm, so the cost of a direct read is one visibility computation per statement '
  'rather than one per row. Census 12 of check:store-doors-decide is the standing parity proof. '
  'MIRROR-PERF-2 (2026-09-21): the pairs arrive ordered by organization so the organization''s '
  'carrying-edge set is built once per organization rather than once per pair — 14734 ms to '
  '12357 ms, median of five interleaved readings, same 5,434 ids.';
