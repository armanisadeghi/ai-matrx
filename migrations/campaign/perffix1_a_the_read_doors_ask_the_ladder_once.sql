-- lane: PERF-FIX-1
-- based-on: custom.levels_of(uuid, uuid[]) c68324ebb43257c324ee9a4648a3d8b6f60145ea672fba4fc34dfbd92ea859e3
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) e112904932a463533367019b2ecc59aa8e87fa75e45d20e87fd24a837f9acdea
-- based-on: custom.confidential_anchor(uuid) 262d14fc501219f5d2e58be5138b248a9aace86e95bfb2eb1501a89c0899028c
--
-- PERF-FIX-1 (2026-10-07). The read doors (custom.read_records_page, platform.drill_rows,
-- custom.record_aggregate) spent their time asking the one access ladder the same questions again:
--   * custom.visible_set walked the whole ladder up to four times in ONE statement for the same
--     (person, organization, Table, rung) - now asked once, kept in the statement memo;
--   * custom.confidential_anchor read the row by id across sixteen partitions 272-404 times a page -
--     now asked once per record per statement;
--   * custom.levels_of asked the ladder once for EVERY row of a Table whose rows are named by a
--     portal's naming field (the Deliverables shape: each row points at a client) - rows that point
--     at the same terminal portal targets and differ in nothing else the ladder reads are now one class.
-- Nothing here decides who sees what: every answer is the one the ladder gave before, asked fewer times.
-- Function bodies only, no table, no grant: any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- CHAIR-READPERF (round 2, 2026-10-03). Each answer for an id that exactly ONE row carries also names
-- that row's organization: {"l": .., "s": .., "o": "<organization id>"}. It is a fact this door has
-- already read (the row's home), handed on so the next door reads the row by its key (organization,
-- id) — one partition — instead of by id across all sixteen. An id no row carries, or more than one
-- row carries, has no "o". Every reader of this answer takes `l` and `s` by name.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`), whether its document names
-- a parent, whether its Table is Confidential — or a row somewhere else that NAMES that record by
-- id: a grant (`iam.permissions`), a membership THIS PERSON holds on it (`iam.memberships`, record
-- or scope — nothing on the ladder reads anybody else's), a library grant
-- (`platform.entity_grants`), a closure row (`platform.reachability`), a carrying edge
-- (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4 — every arm but the Table the record lives in),
-- or an assignment to a scope (`public._edu_can_read_via_assignment`). Everything else the ladder
-- reads — the organization's lanes and knobs, the Table's own grants and carrying, whether this
-- person is an admin, owns a record in the organization, or holds any grant anywhere — is the same
-- for every record that shares those columns. So two records with the same columns, the same own
-- memberships and NO other row naming either of them get the same answer at every rung, and the
-- ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, a record of a Confidential Table or with a
-- parent in its document (CHAIR-READPERF), an id that is not a record, and every record while
-- `record` has a registered FK containment parent (custom.visible_set's first stop) is asked on
-- its own, exactly as before. The class memo lives in this one call and nowhere else, so it can
-- never outlive the snapshot it was answered in.
--
-- SCOPES-HANDOFF-BUDGET (2026-09-28). An association that TARGETS the record names it only when it
-- is one of the carrying arms that read it from that side — arm 1a (an active association type
-- whose container is the SOURCE) and arm 2a (an active carrying rule of that role whose container
-- is the SOURCE) — exactly as the source-side test below has always matched arms 1b/2b/4. It used
-- to be ANY live association targeting the record, and every scope a transcript, an agent or a
-- workflow is tagged with carries a `context_tag` edge whose container is the scope itself (the
-- target side), so every scope of a type was walked on its own: 1,166 ladder walks for one type.
-- No other arm of the ladder reads an association that targets the record (visibility_ancestors
-- and addressed_cap read only custom.carrying_edges_of; has_access_for_base reads grants,
-- memberships and platform.reachability, each still a naming row here).
--
-- CHAIR-READPERF (2026-10-03). The person's OWN memberships on a record are part of its class key
-- (`mine` below: container_type/role/status of each live row, sorted), not a reason to walk it alone;
-- a scope names its members, and every scope of a type was a class of its own for a member of all
-- of them. `s` is read off the rung the halving found (null: viewer was asked and said no; viewer:
-- it was asked and said yes; above: the ladder is monotone, as the halving itself assumes).
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_ks     text[] := array[]::text[];
  v_vs     jsonb[] := array[]::jsonb[];
  v_v      jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
  -- PERF-FIX-1: a row named only by a portal's naming field is classed by WHERE it points
  v_t      uuid;
  v_tbl    uuid;
  v_ok     boolean;
  v_tmemo  jsonb := '{}'::jsonb;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           count(*) over (partition by u.id) as n,
           -- a Confidential Table's row and a row with a parent answer from their own document
           (t.data ->> 'level' = 'confidential') is true
             or jsonb_typeof(x.data -> 'parent_id') = 'string' as alone,
           -- this person's own live memberships on it, the only ones the ladder reads (read once for
           -- the person, grouped, and joined: an aggregate run once per id cost 0.09 ms an id)
           mm.mine,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id
                        and ( exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'source')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'source')))
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           -- PERF-FIX-1: a naming field that DOES yield a portal edge (a record target, an active
                           -- portal) is no longer a reason to walk the row alone: it is part of the class key below
                           or a.relation_field_id is not null
                              and exists (select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                              and not (a.target_type = 'record'
                                       and exists (select 1 from custom.portal_table pt
                                                     join custom.portal p on p.id = pt.portal_id and p.is_active
                                                    where pt.names_via_field_id = a.relation_field_id))
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named,
           -- PERF-FIX-1: the portal edges custom.carrying_edges_of arm 4 would give this record, as a sorted
           -- signature (target id / what it conveys) and as the targets themselves
           (select string_agg(z.s, ',' order by z.s)
              from (select distinct a.target_id::text || '/' || pt.conveys_max::text as s
                      from platform.associations a
                      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
                      join custom.portal p on p.id = pt.portal_id and p.is_active
                     where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                       and a.target_type = 'record') z) as portal_sig,
           (select array_agg(distinct a.target_id)
              from platform.associations a
              join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
              join custom.portal p on p.id = pt.portal_id and p.is_active
             where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
               and a.target_type = 'record') as portal_targets
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
      left join custom.record t on t.organization_id = x.organization_id and t.id = x.table_id
      left join (select m.container_id,
                        string_agg(m.container_type || '/' || coalesce(m.role, '') || '/' || coalesce(m.status, ''), ','
                                   order by m.container_type, m.role, m.status) as mine
                   from iam.memberships m
                  where m.user_id = p_user_id and m.container_type in ('record', 'scope') and m.deleted_at is null
                  group by m.container_id) mm on mm.container_id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named or r.alone then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text || ':' || coalesce(r.mine, '');
      -- PERF-FIX-1: two records that point at the same portal targets, and differ in nothing else the
      -- ladder reads, have the same carriers and so the same answer - but only while each target is a
      -- TERMINAL container (its only carrying edge is the Table it lives in), so the walk above it is the
      -- same for both and no cycle back through the record itself can tell them apart. Any other target
      -- and the row is asked on its own, exactly as before.
      if r.portal_sig is not null then
        v_ok := true;
        foreach v_t in array r.portal_targets loop
          if not (v_tmemo ? v_t::text) then
            select t.table_id into v_tbl from custom.record t where t.id = v_t limit 1;
            v_tmemo := v_tmemo || jsonb_build_object(v_t::text,
              v_tbl is not null
              and not exists (select 1 from custom.carrying_edges_of('record', v_t) e
                               where e.container_type <> 'record' or e.container_id is distinct from v_tbl));
          end if;
          if not (v_tmemo ->> v_t::text)::boolean then
            v_ok := false;
            exit;
          end if;
        end loop;
        v_key := case when v_ok then v_key || ':' || r.portal_sig end;
      end if;
    end if;

    if v_key is not null and v_memo ? v_key then
      v_ks := v_ks || r.id::text;
      v_vs := v_vs || case when r.n = 1 then (v_memo -> v_key) || jsonb_build_object('o', r.organization_id)
                           else v_memo -> v_key end;
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := v_l is not null;
    v_v := jsonb_build_object('l', v_l, 's', v_s);
    v_ks := v_ks || r.id::text;
    v_vs := v_vs || case when r.found and r.n = 1 then v_v || jsonb_build_object('o', r.organization_id)
                         else v_v end;
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, v_v);
    end if;
  end loop;
  -- SCOPES-HANDOFF-BUDGET: the answers are gathered in two arrays and made one object at the end
  -- (appending to a jsonb object copies it whole, so a set of n ids cost n^2 bytes).
  select coalesce(jsonb_object_agg(k.k, k.v), '{}'::jsonb) into v_out
    from unnest(v_ks, v_vs) as k(k, v);
  return v_out;
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
  v_seen_memo     text;   -- STORE-READ-PERF-3
  v_ms_key        text;   -- PERF-FIX-1
  v_ms            jsonb;
begin
  o_all_visible     := false;
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;

  -- PERF-FIX-1 (2026-10-07). THE ANSWER, ONCE PER STATEMENT. One list door asks this set for the same
  -- (person, organization, Table, rung) up to four times in a single statement - the predicate, the
  -- visible-ids list, the by-ids read - and each ask walked the whole ladder again (~50 ms each on a
  -- Table of a few dozen rows). The answer is a function of those four arguments and the snapshot, so
  -- the first ask leaves it in the statement memo (platform.memo_k_*: fenced by the statement, the
  -- backend, the seat and the transaction's first write) fenced here by the snapshot too, exactly as
  -- custom.tables_seen is, and the others read it back. Only the full walk is remembered (the early
  -- stops - archived, copying, fallback - are cheap and unchanged); a transaction that has written
  -- asks every time.
  if p_user is not null and p_organization_id is not null and p_table_id is not null
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_ms_key := 'custom.visible_set:' || p_user::text || ':' || p_organization_id::text || ':'
             || p_table_id::text || ':' || p_required::text || ':' || pg_catalog.pg_current_snapshot()::text;
    v_ms := platform.memo_k_get(v_ms_key)::jsonb;
    if v_ms is not null then
      o_all_visible     := (v_ms ->> 'a')::boolean;
      o_true_visibility := coalesce(array(select jsonb_array_elements_text(v_ms -> 't')), '{}'::text[])::platform.visibility[];
      o_granted_all     := coalesce(array(select jsonb_array_elements_text(v_ms -> 'g')), '{}'::text[])::uuid[];
      o_granted_visible := coalesce(array(select jsonb_array_elements_text(v_ms -> 'v')), '{}'::text[])::uuid[];
      o_carried_visible := coalesce(array(select jsonb_array_elements_text(v_ms -> 'c')), '{}'::text[])::uuid[];
      o_ladder_calls    := (v_ms ->> 'n')::integer;
      o_fallback        := (v_ms ->> 'f')::boolean;
      o_note            := v_ms ->> 'o';
      return;
    end if;
  end if;

  if p_user is null or p_organization_id is null then
    o_fallback := true;
    o_note := 'READ-PERF: no principal, so the set-based shape has nobody to answer for. The door is walking the per-row ladder, which is what it did before this file.';
    return;
  end if;

  -- CD-LADDER (2026-10-03): AN ARCHIVED ORGANIZATION IS CLOSED TO EVERYONE (access ladder T-33). The
  -- kernel and custom.read_record refuse every row of it, so the set every list door is built from is
  -- empty too (custom.list_door_disagreements found this set carrying rows the read door refused).
  if exists (select 1 from iam.organizations o
              where o.id = p_organization_id and o.archived_at is not null) then
    o_note := 'ARCHIVED: this organization is archived and closed to everyone (access ladder T-33).';
    return;
  end if;

  -- TABLE-ACTIONS: A TABLE STILL BEING COPIED IS ITS MAKER'S ALONE. For anybody else its row set is
  -- empty, exactly the shape of an archived organization above, so every list door built on this set
  -- (custom.read_records, custom.read_records_page, custom.query_visible_ids …) answers nothing.
  if p_table_id is not null and custom._copy_in_progress_hides(p_user, p_table_id) then
    o_note := 'COPYING: this table is still being copied, and only the person copying it can see it.';
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

  -- THE CONFIDENTIAL STOP (CHAIR-CONFIDENTIAL-STORE, 2026-10-02). A row of a Confidential Table —
  -- or a child of one — opens to its owner and the people ITS OWN fields name, so two rows of one
  -- visibility class no longer answer alike and no representative may speak for its class. Asked
  -- only when the organization holds a Confidential Table at all, so every other organization pays
  -- one bounded look at its own Tables and nothing else changes.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.data ->> 'level' = 'confidential')
     and (exists (select 1 from custom.record t
                   where t.organization_id = p_organization_id
                     and t.id = p_table_id
                     and t.data ->> 'level' = 'confidential')
          or exists (select 1 from custom.record c
                      where c.organization_id = p_organization_id
                        and c.table_id = p_table_id
                        and c.deleted_at is null
                        and jsonb_typeof(c.data -> 'parent_id') = 'string'
                        and custom.confidential_anchor(c.id) is not null)) then
    o_fallback := true;
    o_note := 'CONFIDENTIAL: this Table is Confidential, or holds rows whose parent is, so each row '
           || 'opens to its owner and the people its own fields name and no visibility class can '
           || 'answer for another row. The door is walking the per-row ladder (custom.confidential_answer).';
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

  -- AN ARCHIVED TABLE WITH NO LIVE RECORD IS ALL-VISIBLE, SAID AT ONCE (CHAIR-DOORS-3A, asked by lane 9
  -- SCOPES-ON-THE-STORE, scopes-i). For a Table that is not the kernel, past the confidential and the
  -- containment-relationship stops above, whose own kernel row is not live and which holds no live
  -- record, the rest of this body can only answer o_all_visible = true with every array empty: the
  -- Table-carries question is asked of a live Table only; custom.read_door_granted_ids returns live
  -- ids only, so v_n = 0; custom.read_door_carried_ids has no live record to climb from, so o_ids = {}
  -- and o_containers = 0; every representative query reads live rows only; and the final `exists`
  -- is false. Production, 2026-10-03: 27 of 27 archived scope types, both seats, answered exactly
  -- so after the granted-ids read, the containment walk, 15 representative queries and the exists.
  -- The answer is the same; only the work is gone. o_ladder_calls stays 0, as it was.
  if p_table_id is distinct from custom.table_kernel_id()
     and not exists (select 1 from custom.record t
                      where t.organization_id = p_organization_id
                        and t.id = p_table_id
                        and t.deleted_at is null)
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.table_id = p_table_id
                        and r.deleted_at is null) then
    o_all_visible := true;
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
  -- STORE-READ-PERF-3: for the Table kernel, the same ids may already be in this statement's memo,
  -- left by custom.tables_seen_once_per_group, which asked read_door_granted_ids' own query once for
  -- every organization of the door statement that called us.
  -- STORE-READ-PERF-4: only while the transaction has written nothing (a writing transaction may
  -- have changed the answer after the memo was taken).
  if p_table_id = custom.table_kernel_id() and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_seen_memo := platform.memo_k_get('custom.kernel_granted:' || p_organization_id::text || ':' || pg_catalog.pg_current_snapshot()::text);
  end if;
  if v_seen_memo is not null then
    o_granted_all := array(select g from unnest(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[]) g order by g);
    v_seen_memo := null;
  else
    o_granted_all := custom.read_door_granted_ids(p_organization_id, p_table_id);
  end if;
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
    -- STORE-READ-PERF-3 (2026-09-28). At viewer the same answer — custom.has_visibility about every
    -- live Table — comes from custom.tables_seen_once_per_group: the one ladder asked once per group
    -- of Tables it cannot tell apart (its header has the argument), or, when the door statement
    -- that called us already asked it for this person and organization, from that statement's memo.
    -- Any other level walks every Table as before. o_ladder_calls still counts one answer per Table.
    if p_required = 'viewer'::public.permission_level then
      v_seen_memo := case when pg_catalog.pg_current_xact_id_if_assigned() is null
                          then platform.memo_k_get('custom.tables_seen:' || p_user::text || ':' || p_organization_id::text
                                                   || ':' || pg_catalog.pg_current_snapshot()::text) end;
      if v_seen_memo is null then
        select coalesce(array_agg(g.id) filter (where g.seen), '{}'::uuid[])
          into o_carried_visible
          from custom.tables_seen_once_per_group(p_user, array[p_organization_id]) g;
      else
        o_carried_visible := coalesce(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[], '{}'::uuid[]);
      end if;
      o_ladder_calls := o_ladder_calls + v_tables;
    else
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
    end if;
    o_all_visible := (v_tables = coalesce(array_length(o_carried_visible, 1), 0));
    if v_ms_key is not null then
      perform platform.memo_k_put(v_ms_key, jsonb_build_object('a', o_all_visible, 't', to_jsonb(o_true_visibility),
        'g', to_jsonb(o_granted_all), 'v', to_jsonb(o_granted_visible), 'c', to_jsonb(o_carried_visible),
        'n', o_ladder_calls, 'f', o_fallback, 'o', o_note)::text);
    end if;
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
  if v_ms_key is not null then
    perform platform.memo_k_put(v_ms_key, jsonb_build_object('a', o_all_visible, 't', to_jsonb(o_true_visibility),
      'g', to_jsonb(o_granted_all), 'v', to_jsonb(o_granted_visible), 'c', to_jsonb(o_carried_visible),
      'n', o_ladder_calls, 'f', o_fallback, 'o', o_note)::text);
  end if;
  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.confidential_anchor(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE CONFIDENTIAL ROW A RECORD ANSWERS TO, or null. A record of a Confidential Table answers to
-- itself; a record whose parent_id climbs (at most 16 hops) to one answers to that row — "children
-- inherit their parent" (access ladder). A Table, a field, a rule, a kernel row: null.
--
-- PERF-FIX-1 (2026-10-07): ASKED ONCE PER RECORD PER STATEMENT. One page of 38 rows asked this 272-404
-- times (the ladder asks it for every rung it tries, through custom.confidential_answer and
-- custom.reaches_directly) and each ask read `custom.record` by id across all sixteen partitions. The
-- answer is a function of the id and the snapshot, so the first ask leaves it in the statement memo
-- (platform.memo_k_*: fenced by statement, backend, seat and the transaction's first write) fenced
-- here by the snapshot as custom.visible_set is; a transaction that has written asks every time.
declare
  v_id     uuid := p_id;
  v_org    uuid;
  v_data   jsonb;
  v_level  text;
  v_hops   integer := 0;
  v_res    uuid;
  v_key    text;
  v_hit    text;
begin
  if p_id is null then return null; end if;
  if pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_key := 'custom.confidential_anchor:' || p_id::text || ':' || pg_catalog.pg_current_snapshot()::text;
    v_hit := platform.memo_k_get(v_key);
    if v_hit is not null then
      return nullif(v_hit, '-')::uuid;
    end if;
  end if;
  loop
    select r.organization_id, r.data, t.data ->> 'level'
      into v_org, v_data, v_level
      from custom.record r
      left join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
     where r.id = v_id and r.data_class = 'record';
    if not found then exit; end if;
    if v_level = 'confidential' then v_res := v_id; exit; end if;
    exit when v_hops >= 16 or jsonb_typeof(v_data -> 'parent_id') is distinct from 'string';
    v_hops := v_hops + 1;
    begin
      v_id := (v_data ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      v_res := null;
      exit;
    end;
  end loop;
  if v_key is not null then
    perform platform.memo_k_put(v_key, coalesce(v_res::text, '-'));
  end if;
  return v_res;
end;
$function$
;
