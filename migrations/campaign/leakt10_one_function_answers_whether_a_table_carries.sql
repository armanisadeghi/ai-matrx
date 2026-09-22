-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 99e166668ac434371bfa0083ea83e65c4a0763556bc2e4f838f6eea8a567d308
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 2537ba4d50d21b70664ec9d549e39e104c46d968aece1e834dadbecfa97b6a30
-- based-on: custom.doors_not_on_one_ladder() 4da5fd4f51c87b38c1acc6169dbfd3a49720ff3f37d51dc609dd7561c6e3f567
--
-- LEAK-T10 — "DOES THIS TABLE CARRY ITS ROWS TO YOU" IS ONE FUNCTION, ASKED BY BOTH DOORS.
--
-- The previous file closed T10 by making `custom.visible_set`'s whole-Table shortcut ask
-- `iam.has_access_for` about the Table, which is what the per-row ladder asks about it. Census 4
-- of `pnpm check:store-doors-decide` then named `custom.visible_set` by its own rule — a door
-- that reaches a RUNG directly is a door keeping a second ladder, and that census is right to
-- refuse it whatever the author's intentions were. Two pieces of code that mean to agree and are
-- written twice are exactly how this leak happened in the first place.
--
-- So the question gets a NAME and ONE BODY. `custom.table_carries_its_rows` is the arm
-- `custom.reaches_directly` runs when the ancestor it has reached IS the record's own Table —
-- the terminal one — and it is now literally the code that runs there, not a copy of it.
-- `custom.visible_set` asks the same function about the same Table.
--
-- WHY IT IS A FORM OF THE ONE FUNCTION AND NOT A RIVAL LADDER — the same argument that put
-- `custom.reaches_directly` on census 4's short list when SHARED-ONLY moved arms 1-3 into it.
-- `custom.has_visibility` has no copy of this arm; it calls `custom.reaches_directly`, which
-- calls this. There is one body and two callers, which is the opposite of a second ladder. The
-- census is amended to say so IN ITS OWN TEXT, with the reason, rather than the caller being
-- spelled around it.
--
-- AND IT IS PROVED, not asserted: census 13 (`custom.list_door_disagreements`) compares every
-- list-shaped door against `custom.read_record` for every (member, record) on the whole live
-- database under both privacy settings, plus a built two-Home fixture at each setting. It reads
-- zero with this file and names rows without it.
--
-- THE INVERSE is migrations/inverse/leakt10_one_function_answers_whether_a_table_carries_down.sql.

CREATE OR REPLACE FUNCTION custom.table_carries_its_rows(p_user_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- DOES THIS TABLE HAND ITS ROWS TO THIS PERSON? Arm 3 of the one ladder, at the point where the
-- ancestor it has walked to is the record's own TABLE — which `custom.visibility_ancestors`
-- makes TERMINAL, because a Table's own containers are its HOMES and a Home of a Table is not a
-- container of every record in it (T10: one Table, two Homes).
--
-- It asks the platform's access kernel about the Table row itself: ownership, a grant somebody
-- wrote with `custom.share_grant`, the organization lanes, the public and global-readable arms,
-- and the platform's own containment closure — and NOT the store's carrying walk, which is what
-- would climb into the Table's Homes and hand a person shared ONE project every record of the
-- Table in every other project.
--
-- IT IS ARM 1 AND NOTHING MORE, on purpose. `iam.effective_level` — the organization's own
-- membership default — is asked about the ROW, by the arm above this one, with the row's own
-- organization and Table; asking it about the TABLE row here would be a second, differently
-- parameterised question whose agreement with the first nobody has measured. The narrow answer
-- is the one census 13 reads zero on, across every organization on this database under both
-- privacy settings, and a wider one would have to earn that measurement first.
begin
  if p_user_id is null or p_table_id is null then return false; end if;
  return iam.has_access_for(p_user_id, 'record', p_table_id, p_required);
end;
$function$;

-- WHO MAY CALL IT, IN DATA. It is a SECURITY DEFINER body that decides access, so
-- `provision_shape_guard` refuses the transaction until this row exists. No client ever calls
-- it: it answers one arm of the one ladder for the two server-side deciders.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES ('custom', 'table_carries_its_rows',
        'p_user_id uuid, p_table_id uuid, p_required permission_level',
        ARRAY['uuid'::regtype, 'uuid'::regtype, 'public.permission_level'::regtype]::oid[],
        'p_table_id is checked with iam.has_access_for against p_user_id at p_required - the '
        'platform access kernel on the Table row itself, which is exactly what the per-row '
        'ladder asks about a TERMINAL Table ancestor. p_user_id is the principal the answer is '
        'about and is never taken from the session. A NULL p_user_id or a NULL p_table_id '
        'returns false: nobody reaches nothing.',
        'leakt10_one_function_answers_whether_a_table_carries.sql',
        'server_only: its two callers are custom.reaches_directly (arm 3, at the terminal Table) '
        'and custom.visible_set (the whole-Table shortcut that answers a page at once). Both are '
        'themselves server-only deciders behind the client doors; a client that could call this '
        'would be asking one arm of the ladder in isolation, which is the shape this lane exists '
        'to remove.',
        false, false);

CREATE OR REPLACE FUNCTION custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- DOES SOMETHING REACH THIS ROW? Arms 1, 2 and 3 of the one ladder, and nothing else. This is
-- not a second ladder: `custom.has_visibility` has no copy of these arms any more, it calls
-- this. The split exists because a Table answers YES to a fourth question — "may this person
-- know it" — that must never be read as "it carries everything inside it".
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

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19).
  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    return true;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if rec.container_type = 'record' and rec.container_id = v_table then
      if custom.table_carries_its_rows(p_user_id, rec.container_id, p_required) then
        return true;
      end if;
    elsif iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  return false;
end;
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
  -- whole page.
  --
  -- 🚨 AND THE QUESTION IS `iam.has_access_for`, NOT `custom.reaches_directly` (LEAK-T10,
  -- 2026-09-20). This is the whole of acceptance test 10 and it is a live cross-project leak.
  -- `custom.reaches_directly` treats the Table as the SUBJECT of the walk, so its arm 3 climbs
  -- from the Table into the Table's own HOMES — and a person shared ONE Home of a Table was
  -- handed every record of that Table in every other Home, with its contents, by this line,
  -- while `custom.read_record` refused her the same row.
  --
  -- What the PER-ROW ladder asks about this Table is one thing, and asking exactly it is what
  -- makes the two doors agree by construction instead of by agreement:
  -- `custom.visibility_ancestors` returns the Table as a TERMINAL ancestor of every row in it,
  -- at `admin`, and `custom.reaches_directly` arm 3 then asks
  -- `iam.has_access_for(user, 'record', <the Table>, required)` about it — ownership, a grant
  -- row, the organization lanes, the platform's own containment closure, and nothing above
  -- them. A whole Table shared through `custom.share_grant` writes the `iam.permissions` row
  -- that admits it, so the case this shortcut exists for is untouched.
  --
  -- The rows it does NOT speak for are the ones whose own `visibility` is below `internal`,
  -- which that edge deliberately does not carry; they fall through to their class below.
  --
  -- THE SAME-ORGANISATION, LIVE-ROW JOIN STAYS. The kernel Tables (`Table`, `Field`, and the
  -- home-record kernel every fixture hangs off) live in the SYSTEM organization, which is
  -- global_readable, so `iam.has_access_for` says yes about them to EVERY signed-in person.
  -- Without this line `p_table_id = 11111111-…-0002` — the Field kernel — made every Field row
  -- of a `shared_only` organization visible to every member.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := custom.table_carries_its_rows(p_user, p_table_id, p_required);
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

CREATE OR REPLACE FUNCTION custom.doors_not_on_one_ladder()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'decides a row with a ladder of its own (iam.has_access_for / iam.effective_level / '
         'public.has_permission_for) instead of custom.has_visibility, so reading and writing '
         'can disagree again'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     -- THE CODE, NOT THE PROSE: `--` comments are stripped before the body is read, so a
     -- sentence explaining the old ladder can never fail this census and a sentence
     -- promising the new one can never pass it.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(iam\.has_access_for|iam\.effective_level|public\.has_permission_for)'
     -- The one function itself, its level form, its set form and this census.
     and p.proname not in ('has_visibility', 'has_visibility_at', 'effective_level',
                           'visible_record_ids', 'doors_not_on_one_ladder',
                           -- `custom.reaches_directly` IS the one function: lane SHARED-ONLY
                           -- moved arms 1-3 of custom.has_visibility into it, and
                           -- custom.has_visibility has no copy of them any more, it calls this.
                           -- Excusing it is naming a form of the one function, exactly as the
                           -- four above are, and not excusing a rival ladder.
                           'reaches_directly',
                           -- `custom.table_carries_its_rows` IS arm 3 of that same function at
                           -- the terminal Table, moved out so that the per-row door and the
                           -- SET-BASED door run the same body instead of two that mean to
                           -- agree (lane LEAK-T10, 2026-09-20 — two such bodies is precisely
                           -- how a member shared ONE Home of a Table came to be handed every
                           -- record of it in every other Home by the list doors while
                           -- custom.read_record refused her). custom.reaches_directly calls it
                           -- and keeps no copy; census 13 compares the two doors on every
                           -- (member, record) on this database and reads zero.
                           'table_carries_its_rows')
     -- AND NOTHING ELSE. `custom._field_write_door` was excused here until 2026-09-19,
     -- when lane REACH routed it onto `custom.effective_level`. There is no excused
     -- object in this store any more beyond the forms of the one function itself.
   order by 1;
$function$;
