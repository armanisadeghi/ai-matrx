-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.carrying_edges_of(text, uuid) bf80be76af2c7d4563921f5c82404b336edda37a37c4a96c4a25da0203b1487d
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) c203376a653fb7b7c137c0ed40f638a56d552b50e06ad973949db30c974939dd
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 980c36601819798aa73b8b938f725abbd8c34cfaf7c74bd4c2e6f78f5235e32e
--
-- SHARED-ONLY — UNDER `shared_only`, SHARING ACTUALLY SHARES.
--
-- THE DEFECT, reproduced on the MAIN database before a byte was written, in a throwaway
-- organization with two real seats (`admin@admin.com` owner, `test@test.com` a plain member),
-- `custom/system_enabled` on and `custom/member_default_visibility` = `shared_only`:
--
--   RUNG 1, a record shared with her at viewer through `custom.share_grant`:
--       the ladder says she sees the RECORD .................... true
--       the ladder says she sees the TABLE it lives in ......... FALSE
--       her seat, `custom.read_records` ....... ERROR: You do not have access to this table,
--                                              so custom.read_records has nothing to show you.
--   RUNG 2, the whole TABLE shared with her at viewer:
--       the ladder says she sees a RECORD in it ................ FALSE
--       her seat, `custom.read_records` ....... 0 rows (the table opens, and it is empty)
--   RUNG 4, a record SHE created herself in that table:
--       the ladder says she sees her OWN record ............... true
--       her seat, `custom.read_records` ....... the same refusal as rung 1.
--
-- So an organization that chooses the stricter of the two privacy settings loses sharing
-- entirely — the sixth independent pass's worst finding, and the reason its note test fails.
--
-- WHY. A record's Table is not an association row: it is the `table_id` COLUMN of the record
-- itself. `custom.carrying_edges_of` — the store's whole account of what carries what — reads
-- `platform.associations` and nothing else, so the Table was invisible to the containment walk
-- in BOTH directions:
--
--   DOWNWARD, nothing carried from a Table to the records inside it, so a table share reached
--   no row. Under `all_records` this was invisible because membership already reached every
--   row; `shared_only` is the setting that removes the other reason and leaves the hole bare.
--
--   UPWARD, a Table was never "a thing you can see", so `custom.assert_may_know_table` — the
--   first line of `custom.read_records`, `custom.applicable_fields` and every screen door —
--   refused a person who could see a record inside it, which is rungs 1 and 4 above.
--
-- WHAT THIS FILE DOES. Both directions, once, in the store's own edge set and its ONE ladder:
--
--   1. `custom.carrying_edges_of` gains the Table a record lives in, at `admin` — the same
--      `conveys_max` as `contains`, minimum-along-the-path deciding the rest (VIS-3). Because
--      the walk is recursive, a Table homed in a Record (the `home` rule) now carries that
--      Record's share down to the rows as well.
--   2. `custom.has_visibility` gains ONE arm: a TABLE you can see something inside is a Table
--      you may KNOW — at `viewer` and never above it, because knowing a table is not changing
--      one. That is what makes rungs 1 and 4 open a screen, and what puts the table in the
--      list the screens build.
--   3. `custom.visible_set` — the set-based read door — learns the same two facts without
--      giving up READ-PERF's shape: it asks the ladder ONCE about the Table itself (whole
--      table visible → no predicate at all), and it stops treating Tables as a visibility
--      CLASS, because a Table's visibility now depends on what is inside it and two Tables of
--      one class no longer answer alike.
--
-- WHAT IT DOES NOT DO, deliberately:
--   * `custom.carrying_edges_in` (the org-wide edge set READ-PERF's set-based walk
--     materialises) does NOT get the arm. One row per record in the organization would be
--     materialised on every page — the exact cost READ-PERF removed. It is not needed: when
--     the caller reaches the Table, `custom.visible_set` answers `o_all_visible` before that
--     walk ever runs; when the caller does not, the Table carries nothing and there is nothing
--     to find. `custom.read_door_parity` is what would name a row where those two disagree.
--   * `custom.carrying_edges` (the view the STORED closure and `custom.visibility_parity` are
--     built on) does NOT get the arm either. The stored closure is a closure over association
--     ROWS; the Table edge is a column, derived on every read, and writing 5,593 rows into
--     `platform.reachability` to say "this record is in its own table" would be a cache of a
--     column.
--   * Nothing changes for an organization at `all_records`: every arm added here only ever
--     returns true where the member lane already did, so the answer set can only be the same
--     or larger, and under `all_records` it was already everything.

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE EDGE THE STORE COULD NOT SEE: the Table a record lives in.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.carrying_edges_of(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, conveys_max public.permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- arm 1a — platform.containment_edges, the rule whose SOURCE is the container
  select a.source_type, a.source_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 1b — the same rule table, the rule whose TARGET is the container
  select a.target_type, a.target_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id
  union
  -- arm 2a — custom.carrying_rule, source side
  select a.source_type, a.source_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 2b — custom.carrying_rule, target side
  select a.target_type, a.target_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id
  union
  -- arm 3 — THE TABLE A RECORD LIVES IN (SHARED-ONLY, 2026-09-19). Every arm above reads
  -- `platform.associations`; this one is not there to read, because a record's Table is the
  -- `table_id` COLUMN of the record itself. Sharing a Table is the most ordinary thing a
  -- person does on this store and it conveyed NOTHING before this line: under `shared_only`
  -- a colleague shared a whole table at Admin opened it and saw zero rows.
  --
  -- `admin` is the same `conveys_max` the `contains` and `home` rules already carry, so a
  -- Table shared at Viewer conveys viewer and one shared at Admin conveys admin — the
  -- MINIMUM along the path decides (VIS-3), exactly as for a record inside a record.
  --
  -- THE SAME-ORGANISATION JOIN IS THE GUARD, not decoration. The kernel Tables (`Table`,
  -- `Field`) live in the kernel organisation, so a Table row (whose own `table_id` is the
  -- kernel `Table`) and a Field row (whose `table_id` is the kernel `Field`) produce no edge
  -- here: nobody is ever carried by the Table-of-all-Tables. `r.table_id <> r.id` is the
  -- second: the kernel `Table` row's `table_id` IS itself.
  select 'record'::text, r.table_id, 'admin'::public.permission_level
    from custom.record r
    join custom.record t
      on t.id = r.table_id
     and t.organization_id = r.organization_id
     and t.deleted_at is null
   where p_item_type = 'record'
     and r.id = p_item_id
     and r.table_id is not null
     and r.table_id <> r.id
     and r.deleted_at is null
     -- THE ROW'S OWN VISIBILITY IS THE BOUNDARY, and dropping it would be a LEAK, not a
     -- widening. `personal` is below every organization lane the access kernel runs (DD-136:
     -- the org arms honour the row's own `visibility`), so a row somebody marked personal is
     -- reached by a grant and by its creator and by nothing else. Carrying it on a TABLE share
     -- would hand every member of every `all_records` organization — who already reaches every
     -- Table — every personal row in it, which is the opposite of what this file is for.
     and r.visibility >= 'internal'::platform.visibility;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE UPWARD HALF: a Table you can see something inside is a Table you may know.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.table_has_a_visible_record(p_user uuid, p_organization_id uuid, p_table_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- IS THERE ONE ROW OF THIS TABLE THIS PERSON REACHES FOR A REASON THAT IS NOT THE TABLE?
--
-- This is the second half of the containment rule the store was missing, and it is asked of
-- the ONE ladder, once per candidate, over a BOUNDED candidate set — never of every row.
-- The candidates are exactly the three things that can make an individual row visible when
-- the class it belongs to is not:
--
--   a. she created it          — the kernel's own unconditional owner arm
--   b. somebody addressed it   — a grant, a membership on the row, a library grant, a closure
--                                row: `custom.read_door_granted_ids`, the same set the read
--                                door's own bounded walk uses
--   c. something carries it    — a container that is not this Table
--
-- IT CANNOT RECURSE. Every id it asks about is an ORDINARY record (its `table_id` is
-- `p_table_id`, which is never the kernel Table), and the arm in `custom.has_visibility` that
-- calls this function fires only for a row that IS a Table. One level, always.
declare
  v_id      uuid;
  v_ids     uuid[];
  v_ceiling integer := custom.read_door_ladder_ceiling();
begin
  if p_user is null or p_organization_id is null or p_table_id is null then
    return false;
  end if;

  -- (a) HER OWN ROW. `iam.has_access_for_base` returns true on `v_owner = v_uid` before any
  -- lane is consulted, so this needs no ladder call at all.
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null
                and r.created_by = p_user) then
    return true;
  end if;

  -- (b) A ROW SOMEBODY ADDRESSED.
  v_ids := custom.read_door_granted_ids(p_organization_id, p_table_id);
  if coalesce(array_length(v_ids, 1), 0) <= v_ceiling then
    foreach v_id in array v_ids loop
      if custom.has_visibility(p_user, 'record', v_id, 'viewer'::public.permission_level) then
        return true;
      end if;
    end loop;
  end if;

  -- (c) A ROW SOMETHING ELSE CARRIES. Bounded by the same ceiling and by the association
  -- rows that actually touch this Table's records — not by the size of the Table.
  for v_id in
    select distinct e.item_id
      from custom.carrying_edges_in(p_organization_id) e
      join custom.record r
        on r.organization_id = p_organization_id
       and r.id = e.item_id
       and r.table_id = p_table_id
       and r.deleted_at is null
     where e.item_type = 'record'
       and not (e.container_type = 'record' and e.container_id = p_table_id)
     limit v_ceiling
  loop
    if custom.has_visibility(p_user, 'record', v_id, 'viewer'::public.permission_level) then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

-- WHO MAY CALL IT, IN DATA. Nobody with a browser: it takes the principal as an argument,
-- so a client reaching it directly could ask about somebody else. The doors a person calls
-- take no principal and resolve the reader from the session.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, non_client_lane, reason)
select 'custom', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'migrations/campaign/sharedonly_a_shared_table_shows_its_rows.sql (lane SHARED-ONLY)',
       'server_only: called only from arm 4 of custom.has_visibility - the one ladder - when the row being judged is a Table, and from the SHARED-ONLY test suites. It takes the principal as an argument, so a client reaching it directly could ask what somebody else can see.',
       'The upward half of containment: is there one row of this Table this person reaches for a reason that is not the Table itself. p_user is the principal the answer is FOR and is never taken from a client. p_organization_id and p_table_id are read off the row custom.has_visibility was asked about, and every candidate id is joined back to custom.record on (organization_id, table_id, id), which is the organization wall itself (REC-29). A NULL in any of the three returns false, which admits nothing.'
  from pg_catalog.pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname = 'table_has_a_visible_record'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

comment on function custom.table_has_a_visible_record(uuid, uuid, uuid) is
  'SHARED-ONLY: is there one row of this Table this person reaches for a reason that is not the Table itself? The upward half of containment - it is what makes a Table you were shared a RECORD in open on screen and appear in the table list.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE ONE LADDER gains ONE arm. Nothing else in it moves.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.has_visibility(p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec     record;
  v_org   uuid;
  v_table uuid;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership,
  -- grant rows, the organization lanes (which honour the row's own `visibility`, DD-136),
  -- the containment walk, the public and global-readable system-organization arms. This is
  -- the arm the WRITE doors used to ask on their own; asking it here is what makes reading
  -- and writing the same question.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19). The boolean
  -- kernel above carries the platform's generic member lane; it does not carry
  -- `custom/member_default_level`, the knob an organization sets for its own records, nor
  -- the per-Table override written on the Table record itself. `iam.effective_level` is the
  -- one place that resolves both, so it is asked rather than re-derived. The organization
  -- and Table are read off the row so that every caller gets the same answer for the same
  -- record, whichever door it came through.
  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    return true;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING. A record is carried by its Table and by whatever
  -- carries that; an ancestor conveys at most `conveys_max`, and the first ancestor that
  -- conveys enough AND that this principal reaches at that level answers true.
  --
  -- SHARED-ONLY (2026-09-19): "carried by its Table" is what that first sentence always
  -- said and what `custom.carrying_edges_of` never did. It does now — arm 3 of that
  -- function — so a Table shared with somebody carries its rows down here, and a Table
  -- homed in a Record carries the Record's share down through the Table in the same walk.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    if iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  -- ARM 4 — A TABLE YOU CAN SEE SOMETHING INSIDE IS A TABLE YOU MAY KNOW (SHARED-ONLY).
  --
  -- Arms 1 to 3 all ask "who reaches THIS row". A Table is a record (REC-25) and so it was
  -- asked the same way — and under `shared_only` the answer for somebody who had been shared
  -- one RECORD inside it was no. `custom.assert_may_know_table` is the first line of
  -- `custom.read_records`, `custom.applicable_fields` and every screen door in the store, so
  -- that no closed the whole feature for her: the record she had been given was unreachable
  -- through the only doors that show it, and the table it lived in never appeared in her
  -- list. So did the table holding a record SHE HERSELF had created.
  --
  -- AT `viewer` AND NEVER ABOVE IT. Knowing a table — its name, its columns, that it exists —
  -- is not changing one. Adding a column, renaming it, deleting it all ask `admin` on the
  -- Table and this arm refuses them, so a person shared one row of a table cannot reshape it.
  --
  -- IT IS THE LAST ARM ON PURPOSE: it is the only one that reads other rows, so every cheaper
  -- reason has already been tried and answered no.
  if p_type = 'record'
     and p_required <= 'viewer'::public.permission_level
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, v_org, p_id) then
    return true;
  end if;

  return false;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE SET-BASED READ DOOR learns the same two facts, and keeps READ-PERF's shape.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
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
  if p_table_id is distinct from custom.table_kernel_id() then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := custom.has_visibility(p_user, 'record', p_table_id, p_required);
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
$function$;
