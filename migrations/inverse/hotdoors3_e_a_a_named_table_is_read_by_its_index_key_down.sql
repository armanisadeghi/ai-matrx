-- chair-step: undo hotdoors3_e_a_a_named_table_is_read_by_its_index_key.sql - restores custom.visible_set and custom._record_shown_to_ctx as part d left them
-- lane: HOT-DOORS-3
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 7f1b41a16871a8d58d84170d6f2a6347c8c94666f868fbb632910e06da0ef4fd
-- based-on: custom._record_shown_to_ctx(uuid[], uuid) d48f0353757f55e192a1c39605c8578b46d42b9cb3cfa0d0ef969730beb701bf

set local statement_timeout = '60s';

Output format is unaligned.
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

Output format is unaligned.
CREATE OR REPLACE FUNCTION custom._record_shown_to_ctx(p_organization_ids uuid[], p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE "SHOWN TO" CONTEXT FOR THE RECORDS ONE LIST IS ABOUT TO READ.
--
-- custom.query_visible_ids passes platform.shown_to_context('record') to platform.shown_to_lists
-- for every row it lists. That context names, for EVERY organization the reader belongs to, the
-- organization's default list ('d') and her teammates there ('t'); it is worked out once per
-- transaction, and every PostgREST request is its own transaction, so every door call paid it:
-- ~100 ms for admin@admin.com (47 organizations; iam.teammate_user_ids ~1.3 ms each) and ~30 ms
-- for test@test.com, on every tree, values and items call.
--
-- platform.shown_to_lists reads the context of the ROW'S organization only, and reads the teammates
-- part ('t') only when the row's list resolves to 'my_team' — the row's own shown_to, or, when it has
-- none, the organization's default. So for the organizations this list reads, and this Table when one
-- is named:
--   * when some live row there says 'my_team', or some such organization's default is 'my_team',
--     the answer IS platform.shown_to_context('record'), whole (so the rare case is byte-identical);
--   * otherwise it is that context without the teammates: {org: {"d": <the same default>}} for each
--     of these organizations the reader is a live member of — the only keys any row here can read.
-- It decides nothing: shown_to_lists answers every row exactly as it would with the whole context.
-- The answer waits in the STATEMENT memo (platform.memo_k_*: fenced by the statement, the backend,
-- the transaction's first write and the seat) for the next list of the same statement that reads the
-- same organizations and Table (the scope tree asks once per scope Table).
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_d   platform.shown_to;
  v_key text;
  v_hit text;
  r     record;
begin
  if v_uid is null then
    return v_out;
  end if;
  v_key := 'custom.record_shown_to_ctx:' || v_uid::text || ':' || coalesce(p_table_id::text, '-') || ':'
        || md5(array_to_string(array(select distinct x::text from unnest(p_organization_ids) x order by 1), ','));
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  if exists (select 1 from custom.record x
              where x.organization_id = any (p_organization_ids)
                and (p_table_id is null or x.table_id = p_table_id)
                and x.deleted_at is null
                and x.shown_to = 'my_team'::platform.shown_to) then
    v_out := platform.shown_to_context('record');
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  for r in
    select distinct om.organization_id
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = v_uid
       and om.organization_id = any (p_organization_ids)
  loop
    v_d := platform.shown_to_default('record', r.organization_id, v_uid);
    if v_d = 'my_team'::platform.shown_to then
      v_out := platform.shown_to_context('record');
      perform platform.memo_k_put(v_key, v_out::text);
      return v_out;
    end if;
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d));
  end loop;
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end;
$function$
;
