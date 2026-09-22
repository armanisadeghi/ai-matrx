-- VIS-2 — THE RED TWIN. Every answer the green suite gets, asked of the database as it stood
-- BEFORE this lane, inside ONE transaction that ends in ROLLBACK.
--
-- RUN IT the same way as vis2_green.sql. It restores the four pre-VIS-2 bodies, drops the
-- as-of door, builds the same two throwaway organizations, and then asserts THE DEFECT — so
-- it FAILS if the old behaviour is not there, which is what makes the green suite's answers
-- mean something. It writes nothing that survives: one transaction, one ROLLBACK, and the
-- restored bodies go back with it.
--
-- R1 — an organization could not stop membership showing every record.
-- R2 — one organization's Table flag opened the wall into another organization on its own.
-- R3 — "who could see this on that day" could not be asked at all.
-- R4 — a field type change through the ordinary write door rewrote every value and left no
--      Migration row.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A red twin's job is to prove the GREEN suite's
-- clauses flip, so it has to ask the SAME questions from the SAME seat. It used to run every
-- clause as the role that OWNS `custom.record` — where `custom.assert_client_may_reach` returns
-- on its first line, every EXECUTE grant is free, SECURITY INVOKER and SECURITY DEFINER are the
-- same thing and the table is directly readable and writable — and it asked `custom.has_visibility`,
-- which is nobody's door, about a principal who was never signed in. It now takes the seat
-- `authenticated` in PART 0 and proves it holds it, and asks:
--   R1  `custom.query_can_see` AS `test@test.com` — the one door every read in the store climbs
--   R2  `custom.read_record` and `custom.relation_targets`, from the seat, for the edge that
--       reached into the other organization
--   R3  `custom.visibility_as_of` CALLED, from the seat, rather than looked up in the catalogue
--   R4  `custom.record_update` — the ordinary write door the clause is named after — and
--       `custom.migrations`, the history door, rather than `history.migration_log`
-- Fixtures go through `custom.table_declare`, `custom.field_declare` and `custom.record_write`.
--
-- WHAT STAYS OUTSIDE THE SEAT, and why. Restoring the four pre-VIS-2 bodies, deleting the
-- client-callable-door rows and dropping the as-of door are DDL: no door does DDL. And R2's edge
-- itself has NO client door at all — measured on the main database 2026-09-19,
-- `custom.relation_carry` refuses a record in another organization by name and
-- `custom.field_declare` refuses a `relation` column outright — so the edge is written by the
-- operator, which says so, and the CLAUSE is then asked from the seat: a person in organization A
-- holds and can read a link into organization B.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'vis2_red.sql'
\set requires 'row:platform.feature_knob:feature = 'custom' and key = 'member_default_visibility''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'vis2_red_suite', true);

-- ─────────────────────────────── the database as it stood before VIS-2
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_child_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the DD-263 header: the
  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because
  -- entity_row_access_attrs hard-codes o_vis := 'personal' for a table with no
  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).
  v_containment_carries boolean;
  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.
  -- iam.entity_read_expr decides which arms to EMIT from this function; this function
  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token
  -- resolves to `private` here rather than raising: the kernel cannot refuse, because
  -- refusing at runtime is denying a person their own data — so it fails toward privacy
  -- while iam.apply_rls refuses outright (chair R3, both directions).
  v_lanes platform.lane_set;
  -- 🚨 DD-263b (2026-09-15) — THE WALK IS BOUNDED IN **WORK**. See this migration's header.
  -- The containment walk is an explicit breadth-first frontier inside THIS frame. v_visited holds
  -- every node key already expanded across the WHOLE walk (seeded from p_path, which is how a
  -- caller hands in frames it has already resolved), so each node is expanded at most once and the
  -- cost is O(distinct ancestors) rather than O(paths). c_max_depth still refuses an inbound path
  -- at 32; c_max_nodes is the backstop on how much graph ONE access question may read.
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_visited text[];
  v_q_type text[]; v_q_id uuid[]; v_q_pub boolean[];
  v_head integer := 1; v_expanded integer := 0;
  v_type text; v_id uuid; v_pub boolean; v_key text;
begin
  if v_uid is null then return false; end if;
  v_visited := coalesce(p_path, ARRAY[]::text[]);
  v_key := p_type || ':' || p_id::text || ':' || (case when p_include_public then 't' else 'f' end);
  if v_visited @> ARRAY[v_key] then
    -- A CYCLE, handed in by a caller that is already resolving this very frame. Not an exception —
    -- the caller asked an access question and must get an ANSWER. `false` is the correct one: the
    -- outer frame is still being evaluated, so if it could have said `true` it would already have.
    raise warning 'iam.has_access_for_base: CARRYING CYCLE refused — % is already on the walk. Path: %. '
      'Answering false (correct: a frame still being evaluated cannot grant through itself). '
      'THIS IS A DATA DEFECT: run select * from platform.undeclared_carrying_cycles() to name it, and '
      'select platform.audit_carrying_cycles() to file it; break the loop by soft-deleting one of '
      'the platform.associations rows (or clearing the parent_id) that closes it.',
      v_key, array_to_string(v_visited || v_key, ' -> ');
    return false;
  end if;
  if coalesce(array_length(p_path, 1), 0) >= c_max_depth then
    raise warning 'iam.has_access_for_base: DEPTH CEILING % reached at %. Path: %. Answering false — '
      'a caller handed in more than % resolved frames. Investigate the path before raising the ceiling.',
      c_max_depth, v_key, array_to_string(v_visited || v_key, ' -> '), c_max_depth;
    return false;
  end if;

  v_q_type := ARRAY[p_type]; v_q_id := ARRAY[p_id]; v_q_pub := ARRAY[p_include_public];

  <<walk>>
  while v_head <= coalesce(array_length(v_q_type, 1), 0) loop
    v_type := v_q_type[v_head]; v_id := v_q_id[v_head]; v_pub := v_q_pub[v_head];
    v_head := v_head + 1;
    v_key := v_type || ':' || v_id::text || ':' || (case when v_pub then 't' else 'f' end);
    continue walk when v_visited @> ARRAY[v_key];
    v_visited := v_visited || v_key;
    v_expanded := v_expanded + 1;
    if v_expanded > c_max_nodes then
      -- The backstop. A single access question has read more of the containment graph than any
      -- real containment can present. Fail closed and SAY SO rather than run to a timeout.
      raise warning 'iam.has_access_for_base: WORK CEILING % nodes reached at %, asking about %:%. '
        'Answering false — the containment graph above this record is larger than one access '
        'question may read. Someone may be denied access they hold. Run '
        'select * from platform.undeclared_carrying_cycles() first: a loop is the usual cause.',
        c_max_nodes, v_key, p_type, p_id;
      return false;
    end if;

    select et.schema_name, et.table_name into v_schema, v_table
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
    v_lanes := iam.class_lanes(v_type);
    v_is_org_admin := null;

    if p_required = 'viewer'::public.permission_level
       and public.user_can_read_via_library_grant(v_uid, v_type, v_id)
    then return true; end if;
    -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
    -- everyone is readable by anyone signed in. The opt-in decides what you are
    -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
    -- grants (pilots, subscriptions) are excluded and stay targeted.
    if p_required = 'viewer'::public.permission_level
       and public.library_is_open(v_type, v_id)
    then return true; end if;
    if v_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, v_id) then return true; end if;
    if v_type = 'rulebook' and public.is_rulebook_curator(v_uid, v_id) then
      if p_required = 'viewer'::public.permission_level then return true; end if;
      if exists (select 1 from platform.rulebook rb
                  where rb.id = v_id and rb.status = 'draft' and rb.deleted_at is null)
      then return true; end if;
    end if;

    v_attrs := platform.entity_row_access_attrs(v_schema, v_table, v_id);
    v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
    continue walk when not coalesce(v_found, false);
    v_containment_carries := (v_vis is null
                              or v_vis >= 'internal'::platform.visibility
                              or not iam.table_has_visibility(v_schema, v_table));
    if v_owner = v_uid then return true; end if;
    -- 🚨 DD-136 (2026-09-12) — THE ORG-ADMIN LANE HONOURS `personal` VISIBILITY.
    -- This lane used to `return true` for any org owner/admin at viewer, with no
    -- visibility condition, while the two org lanes below are both guarded
    -- `v_vis >= 'internal'`. That single asymmetry meant `visibility='personal'`
    -- hid a row from a plain member and from nobody else: measured live, a plain
    -- member read 0 of other people's personal conversations and an org admin who
    -- is not a platform admin read 10,817 of them plus 74,485 messages, with no
    -- audit anywhere. Arman, 2026-09-12: the organization reaches a person's
    -- private data only through an audited emergency door, never by an admin
    -- browsing. The door is a GRANT (DD-137 generalises `public.hr_break_glass`),
    -- and a grant is already a first-class lane below — so the door needs no arm
    -- of its own and this guard leaves no bypass.
    --
    -- The `table_has_visibility` half is not a loophole: entity_row_access_attrs
    -- HARD-CODES o_vis := 'personal' for a table with no visibility column, so a
    -- bare `v_vis >= 'internal'` would strip this lane from 305 org-scoped tables
    -- that never declared a visibility contract and cannot hold a `personal` row
    -- at all. iam.entity_read_expr asks the SAME predicate, so the mirror and the
    -- kernel cannot drift on it (db-rules §6d).
    if p_required = 'viewer'::public.permission_level and v_org is not null then
      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
      -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
      -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
      -- 305 tables it spared are COMPONENTS, and a component has no visibility
      -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
      -- because it holds nothing private. It left every chat.message inside a
      -- `personal` conversation readable by the organization's admins after
      -- DD-136 had closed the conversation itself — 71,424 of them for one real
      -- admin. A component with a registered parent needs no role arm: its
      -- generated lane resolves the parent's accessible ids, so an admin who may
      -- read the parent still reads all of it, and an admin who may not, does not.
      -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)
      -- keeps a component/ledger token (NULL lanes — its access IS its parent's) exactly as
      -- it is; the parent it walks to is gated on its own class.
      if v_lanes.org_role_lane
         and v_is_org_admin
         and (v_vis >= 'internal'::platform.visibility
              or (not iam.table_has_visibility(v_schema, v_table)
                  and not iam.token_is_parented_component(v_type)))
      then return true; end if;
    end if;
    if v_pub and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
    -- 🚨 DD-185 (2026-09-13) — AND THE CLASS DECIDES WHETHER THIS ARM EXISTS AT ALL.
    -- This is the §6e global-readable system-organization lane, and it admits EVERY SIGNED-IN
    -- ACCOUNT — it asks about no membership, no role and no grant. Until this line it was
    -- unconditional, so a `confidential` row owned by the global-readable system org was readable
    -- by every signed-in user including a non-member (measured 0 -> 8, B-65). DD-174 fixed exactly
    -- this in the ledger branch; this is the same rule, in the resolver every other variant asks.
    -- The mirror (iam.entity_read_expr) drops the same arm in the same breath — the policy TEXT is
    -- what a real HTTP read runs against, the kernel is what the bounded has_access arm asks, and
    -- closing one without the other closes nothing (DD-170's lesson, the other way round).
    if v_pub and p_required = 'viewer'::public.permission_level
       and v_lanes.resolved_class in ('organization','public')
       and v_vis >= 'internal'::platform.visibility and v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
    -- DD-137b: our own staff go through the door too on the two private classes (§3.1
    -- derivation two). This is the runtime half of suppress_platform_admin_lane.
    -- DD-170 (2026-09-13): THE SAME WALL DD-165 GAVE THE OTHER STAFF ARMS, applied here too.
    -- This arm used to admit a super admin to ANY row owned by a global_readable system org
    -- with no visibility guard at all — the one staff arm DD-165 named but did not close
    -- (measured: 8 personal rows, browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
    -- agent.definition 1). Same predicate as the org-admin arm above: a table with a real
    -- visibility column is walled at >= internal; a table with none at all (and not a parented
    -- component, which has no visibility concept of its own) keeps the arm it always had.
    if v_lanes.platform_admin_lane
       and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(v_type)))
       and public.is_super_admin_for(v_uid) then return true; end if;
    if public.has_permission_for(v_uid, v_type, v_id, p_required) then return true; end if;
    if exists (
      select 1 from iam.memberships m
      join iam.membership_grant g on g.member_role = m.role and g.container_type in (v_type, '*')
      where m.container_type = v_type and m.container_id = v_id and m.user_id = v_uid
        and m.deleted_at is null and g.confers >= p_required) then return true; end if;
    if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, v_type, v_id) then return true; end if;
    -- DD-137b: the late org lanes, each answering to the class that owns it. The
    -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
    -- the lane exists, the row's own value says how far it reaches. DD-263b: evaluated with the
    -- rest of THIS node's arms rather than between the two containment walks; see the header —
    -- the result is a disjunction over the reachable nodes and cannot depend on the order.
    if v_vis >= 'internal'::platform.visibility and v_org is not null then
      if v_lanes.org_role_lane then
        if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
        if v_is_org_admin then return true; end if;
      end if;
      if v_lanes.org_member_lane
         and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
    end if;

    -- No arm on this node granted. Push its containers onto the frontier: the closure first, the
    -- registered FK parents second, both exactly as the recursive body walked them.
    if v_containment_carries then
      v_child_include_public := v_pub and (v_vis is null or v_vis = 'public'::platform.visibility);
      for rec in
        select r.container_type, r.container_id from platform.reachability r
        where r.item_type = v_type and r.item_id = v_id and r.max_level >= p_required
      loop
        if (rec.container_type, rec.container_id) is distinct from (v_type, v_id) then
          v_q_type := v_q_type || rec.container_type;
          v_q_id   := v_q_id   || rec.container_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
      for rec in
        select er.parent_type, er.fk_column from platform.entity_relationships er
        where er.child_type = v_type and er.kind in ('composition', 'containment')
        order by er.kind, er.parent_type, er.fk_column
      loop
        execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using v_id;
        if v_parent_id is not null then
          v_q_type := v_q_type || rec.parent_type;
          v_q_id   := v_q_id   || v_parent_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
    end if;
  end loop;
  return false;
end; $function$;

CREATE OR REPLACE FUNCTION iam.member_default_level(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_word text;
  v_table_word text;
begin
  -- The organization's knob, resolved through the one ladder (system -> organization).
  begin
    v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
  exception when others then
    v_word := 'viewer';
  end;

  -- The per-table override, declared on the Table record itself. A Table is a record, so the
  -- knob lives where its subject lives rather than in a second settings store.
  if p_table_id is not null and to_regclass('custom.record') is not null then
    select nullif(btrim(t.data ->> 'member_default_level'), '')
      into v_table_word
      from custom.record t
     where t.organization_id = p_organization_id
       and t.id = p_table_id
       and t.deleted_at is null;
    if v_table_word is not null then
      v_word := v_table_word;
    end if;

    -- A table carrying a `restricted` field confers NOTHING by membership, whatever the knob
    -- says, and says so rather than quietly downgrading: the field's own sensitivity is the
    -- stricter rule and VIS-22 makes it the default (section 4).
    if exists (select 1
                 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id
                  and f.data ->> 'sensitivity' = 'restricted') then
      return null;
    end if;
  end if;

  if v_word is null or v_word = 'none' then
    return null;
  end if;
  if not exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
    raise exception 'custom/member_default_level says %, and the levels are %',
                    v_word,
                    (select string_agg(l.level::text, ', ' order by l.ordinal) from iam.content_levels() l)
      using errcode = '22023',
            hint = 'VIS-19: a role sets a default level, and a default has to be one of the four - or "none".';
  end if;
  return v_word::public.permission_level;
end;
$function$;

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
    if coalesce(v_opened, false) then
      continue;
    end if;

    raise exception '% belongs to a different organization', r.what
      using errcode = '23503',
            hint = case when r.openable
                     then 'REC-29 / T15: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it, which this one does not - set cross_organization_relations on that table first.'
                     else 'REC-29 / T15: organizations are hard walls. What a record IS - its table, the table a field points at, the record an external link stands for - never crosses an organization. The route across organizations is a relation the table allows, never this.'
                   end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb;
  v_tables   uuid[];
  v_mode     text;
  v_live     integer;
  v_max      integer;
  v_other    uuid;
  v_ttable   uuid;
  v_src_org  uuid;
  v_tgt_org  uuid;
  v_opened   boolean;
  v_names    text;
  v_loop     boolean;
begin
  -- GATE ONE, and it is structural: an edge nobody declared as a relation is not this
  -- trigger's business, whatever the switch says.
  if new.relation_field_id is null then
    return new;
  end if;

  -- GATE TWO, the switch. `custom/associations_guard` holds the MEANING of these columns off.
  -- A relation edge written while it is off is returned untouched rather than half-enforced:
  -- half a contract is the silent failure this system is built to refuse.
  if not platform.relations_are_on(new.organization_id) then
    return new;
  end if;

  d := platform.relation_declaration(new.organization_id, new.relation_field_id);

  -- ------------------------------------------------------------------ REL-10, the role itself
  if coalesce(new.role, '') <> coalesce(d ->> 'key', '') then
    raise exception 'this relation is stored under the role "%" but its field is called "%"',
      coalesce(new.role, '<none>'), coalesce(d ->> 'key', '<none>')
      using errcode = '23514',
            hint = 'REL-10: a relation is an association whose `role` IS the field key. They are the same string or the edge belongs to no field.';
  end if;

  -- ------------------------------------------------------------------------- REL-12, the wall
  select r.organization_id into v_src_org from custom.record r where r.id = new.source_id limit 1;
  select r.organization_id, r.table_id into v_tgt_org, v_ttable
    from custom.record r where r.id = new.target_id limit 1;

  v_opened := false;
  if v_tgt_org is not null and v_tgt_org is distinct from new.organization_id then
    -- REC-29's ONE opening, read off the Table the relation STARTS at - the same column
    -- `custom.assert_organization_wall` reads, never a second flag.
    select coalesce((t.data ->> 'cross_organization_relations')::boolean, false) into v_opened
      from custom.record s join custom.record t on t.id = s.table_id
     where s.id = new.source_id limit 1;
    if not coalesce(v_opened, false) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = 'REC-29 / REL-12 / T15: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it, which this one does not - set cross_organization_relations on that table first.';
    end if;
  end if;
  if v_src_org is not null and v_src_org is distinct from new.organization_id then
    raise exception 'the record this relation starts at belongs to a different organization'
      using errcode = '23503',
            hint = 'REC-29 / REL-12 / T15: organizations are hard walls. An edge is stamped with the organization of the record it starts at; a relation cannot be filed under an organization that does not own its own source.';
  end if;

  -- --------------------------------------------------------------- REL-8, the target's token
  v_mode := d ->> 'target_mode';
  if v_mode <> 'any' then
    select array_agg((t #>> '{}')::uuid) into v_tables
      from jsonb_array_elements(coalesce(d -> 'target_tables', '[]'::jsonb)) t;
    if new.target_type <> 'record' then
      raise exception 'this relation points at tables of ours, and "%" is not one of them', new.target_type
        using errcode = '23514',
              hint = 'REL-8: a relation whose target mode is one or several names tables in this organization. To point at anything registered, declare target_mode `any`.';
    end if;
    if v_ttable is null or not (v_ttable = any (v_tables)) then
      select string_agg(coalesce(t.data ->> 'name', t.id::text), ', ' order by t.data ->> 'name')
        into v_names from custom.record t where t.id = any (v_tables);
      raise exception 'this relation points at %, and that record is not one of them',
        coalesce(v_names, 'a table it does not name')
        using errcode = '23514',
              hint = 'REL-8: target_mode `one` allows exactly the declared table, `several` allows exactly the declared list, and `any` allows anything. Widen the declaration or point at a record of a table it allows.';
    end if;
  end if;

  -- ------------------------------------------------------------------- REL-7, the cardinality
  v_max := case when d ->> 'cardinality' = 'at_most_one' then 1
                else greatest(coalesce((d ->> 'max')::integer, 1), 1) end;
  select count(*) into v_live
    from platform.associations a
   where a.source_type = new.source_type and a.source_id = new.source_id
     and a.role = new.role and a.deleted_at is null
     and a.relation_field_id is not null
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
     limit 1;
    if v_max = 1 then
      raise exception 'this points at one thing at a time, and it already points at %',
        coalesce(platform.relation_label(new.organization_id, new.target_type, v_other), v_other::text)
        using errcode = '23514',
              hint = 'REL-7: cardinality is `at most one` or `many`. Remove the one that is there, or let the field point at many.';
    end if;
    raise exception 'this points at at most % things and already points at that many', v_max
      using errcode = '23514',
            hint = 'REL-7: the field''s own relation_max is the cap. Remove one, or raise the cap on the field.';
  end if;

  -- ------------------------------------------------------------------------ REL-5, the loops
  if not coalesce((d ->> 'loops')::boolean, false) then
    with recursive walk(id, depth) as (
      select new.target_id, 1
      union all
      select a.target_id, w.depth + 1
        from walk w
        join platform.associations a
          on a.source_id = w.id
         and a.relation_field_id = new.relation_field_id
         and a.deleted_at is null
       where w.depth < 32
    )
    select exists (select 1 from walk where id = new.source_id) into v_loop;
    if coalesce(v_loop, false) then
      raise exception 'that would make this point back at itself through the same relation'
        using errcode = '23514',
              hint = 'REL-5 / T11: a relation says whether loops are allowed. This one does not allow them - set loops on the field to let two records point at each other along it. The walk follows this relation only, so two DIFFERENT relations between the same two records were never a loop.';
    end if;
  end if;

  return new;
end;
$function$;


delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('relation_target_card', 'record_card', 'cross_organization_links_open');

CREATE OR REPLACE FUNCTION custom._field_type_converts_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_label     text;
  v_table     uuid;
  v_was       text;
  v_now       text;
  v_converted integer := 0;
  v_retired_n integer := 0;
  r           record;
  v_val       jsonb;
  v_new       jsonb;
  v_data      jsonb;
  v_retired   jsonb;
  v_alts      jsonb;
  v_keep_alts jsonb;
  v_alt       jsonb;
  v_conv_alt  jsonb;
  v_alts_retired integer := 0;
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    perform custom.assert_store_door(new.organization_id, 'custom.record');
  end if;

  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return null;
  end if;

  v_was := custom.field_behaviour(old.data);
  v_now := custom.field_behaviour(new.data);
  if v_was is not distinct from v_now then
    return null;                          -- the Field still asks for the same thing
  end if;

  v_key   := new.data ->> 'key';
  v_label := coalesce(nullif(new.data ->> 'label', ''), v_key, 'this field');
  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_key is null or v_table is null then
    return null;
  end if;

  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and x.data ? v_key
  loop
    v_val := r.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    v_new := custom.field_value_convert(new.data, v_val);

    if v_new is not null then
      -- THE ALTERNATES COME TOO. VAL-3: an alternate is a candidate for the SAME field, so
      -- custom.validate_value_envelope judges it by the SAME behaviour — and a converted value
      -- sitting beside an unconverted alternate is a document that cannot be written at all.
      -- (Measured: converting Phone to a number while a merge's "222" alternate stayed a
      -- string failed the very write that was doing the converting.) One that does not convert
      -- is kept in _retired as what it was, with its rank and its source.
      v_data := r.data;
      v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
      if jsonb_typeof(v_alts) = 'array' and jsonb_array_length(v_alts) > 0 then
        v_keep_alts := '[]'::jsonb;
        v_retired   := coalesce(v_data -> '_retired', '[]'::jsonb);
        if jsonb_typeof(v_retired) <> 'array' then
          v_retired := '[]'::jsonb;
        end if;
        for v_alt in select e from jsonb_array_elements(v_alts) e loop
          v_conv_alt := custom.field_value_convert(new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
              'reason', format('%s changed what it holds and this other candidate for it does not convert, so it is kept here as it was (FLD-4 / T12)', v_label),
              'at', to_jsonb(now()));
            v_alts_retired := v_alts_retired + 1;
          end if;
        end loop;
        if jsonb_array_length(v_keep_alts) > 0 then
          v_data := jsonb_set(v_data, array['_values', v_key, 'alternates'], v_keep_alts);
        else
          v_data := jsonb_set(v_data, array['_values', v_key],
                              (v_data -> '_values' -> v_key) - 'alternates');
        end if;
        if jsonb_array_length(v_retired) > 0 then
          v_data := v_data || jsonb_build_object('_retired', v_retired);
        end if;
      end if;
      if v_new is distinct from v_val then
        v_data := v_data || jsonb_build_object(v_key, v_new);
        v_converted := v_converted + 1;
      end if;
      if v_data is distinct from r.data then
        update custom.record x set data = v_data
         where x.organization_id = new.organization_id and x.id = r.id;
      end if;
    else
      -- IT DOES NOT CONVERT. The same place, the same shape and the same reason T8's retype
      -- already uses: the value and its envelope are kept in `_retired`, and the key leaves
      -- the document so the record can be written again.
      v_data    := r.data;
      v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
      if jsonb_typeof(v_retired) <> 'array' then
        v_retired := '[]'::jsonb;
      end if;
      v_retired := v_retired || jsonb_build_object(
        'key',      v_key,
        'label',    v_label,
        'value',    v_val,
        'envelope', v_data -> '_values' -> v_key,
        'reason',   format('%s now holds %s, and %s is not one — this value was kept here when the field changed, neither coerced nor deleted (FLD-4 / T12)',
                           v_label,
                           case when new.data ->> 'type' = 'range'
                                     and coalesce(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else coalesce(new.data ->> 'type', 'something else') end,
                           coalesce('"' || (v_val #>> '{}') || '"', 'that value')),
        'at',       to_jsonb(now()));
      v_data := v_data - v_key;
      if jsonb_typeof(v_data -> '_values') = 'object' then
        v_data := jsonb_set(v_data, '{_values}', (v_data -> '_values') - v_key);
      end if;
      v_data := v_data || jsonb_build_object('_retired', v_retired);
      update custom.record x set data = v_data
       where x.organization_id = new.organization_id and x.id = r.id;
      v_retired_n := v_retired_n + 1;
    end if;
  end loop;

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$;

drop function if exists custom.visibility_as_of(uuid, uuid, timestamptz);

-- ─────────────────────────────────────────────── the same fixtures the green suite uses
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_a    uuid := gen_random_uuid();
  v_b    uuid := gen_random_uuid();
  v_hq   uuid; v_hq_b uuid; v_tbl uuid; v_bt uuid; v_rec uuid; v_recb uuid; v_fld uuid;
  v_edge uuid; v_n integer; v_red integer := 0; v_caught text;
  v_boss text := current_user;   -- the connected role, for the one edge no client door can make
begin
  perform set_config('app.actor_system', 'campaign-test/vis2_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_a, 'VIS-2 Red A', 'vis2-red-a-' || substr(v_a::text, 1, 8), 'VRA', c_admin),
         (v_b, 'VIS-2 Red B', 'vis2-red-b-' || substr(v_b::text, 1, 8), 'VRB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_a, 'organization', v_a, c_admin, 'owner',  'active'),
         (v_a, 'organization', v_a, c_dana,  'member', 'active'),
         (v_b, 'organization', v_b, c_admin, 'owner',  'active');
  -- The store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_a, v_a, 'true'::jsonb, 'vis2_red'),
         ('custom','system_enabled','organization', v_b, v_b, 'true'::jsonb, 'vis2_red'),
         -- R1's whole subject: organization A says membership alone conveys NOTHING.
         ('custom','member_default_visibility','organization', v_a, v_a, '"shared_only"'::jsonb, 'vis2_red');

  -- Two Home records. A Home is made by the onboarding path and no client door covers it.
  insert into custom.record (organization_id, table_id, data, created_by)
  values (v_a, null, jsonb_build_object('name', 'Red HQ'),   c_admin) returning id into v_hq;
  insert into custom.record (organization_id, table_id, data, created_by)
  values (v_b, null, jsonb_build_object('name', 'Red B HQ'), c_admin) returning id into v_hq_b;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  v_tbl := custom.table_declare(v_a, jsonb_build_object(
    'name', 'Case', 'slug', 'vis2_red_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'),
                                jsonb_build_object('name', 'severity')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.field_declare(v_a, v_tbl, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  -- `severity` is a TEXT column holding "3". R4 turns it into a number through the ordinary
  -- write door and watches what the store does about it.
  v_fld := custom.field_declare(v_a, v_tbl, jsonb_build_object('key','severity','label','Severity','plain','text','sort',20));

  v_bt := custom.table_declare(v_b, jsonb_build_object(
    'name', 'Supplier', 'slug', 'vis2_red_supplier', 'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
    'title_field', 'name', 'parent_id', v_hq_b::text));
  perform custom.field_declare(v_b, v_bt, jsonb_build_object('key','name','label','Name','plain','text','sort',10));

  v_rec  := custom.record_write(v_a, v_tbl, jsonb_build_object('title','Patient 7','severity','3','parent_id', v_hq::text));
  v_recb := custom.record_write(v_b, v_bt,  jsonb_build_object('name','Fairmont Office Supply','parent_id', v_hq_b::text));

  -- ════════════════════════════════════════════════════════════════════════════
  -- R1 — the organization says shared_only and IS IGNORED.
  -- Asked as DANA, through `custom.query_can_see`, the door every read climbs.
  -- ════════════════════════════════════════════════════════════════════════════
  -- (The `shared_only` override itself is a fixture, written before the seat with the other
  --  two — the knob table takes no writes from a client seat, and R1 is about what the KERNEL
  --  does with the setting, not about who may set it.)
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_a, v_rec, 'viewer') then
    raise exception 'R1 NOT RED — with the old kernel back, shared_only already worked. The green suite proves nothing.'; end if;
  -- AND THE CONTROL, so R1 is not a door that says yes to everything: she is a plain member,
  -- so changing the SHAPE of the table is still refused.
  v_caught := null;
  begin
    perform custom.field_declare(v_a, v_tbl, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'R1 NOT MEASURED — test@test.com added a column to a table she is not an admin of, so this seat is not a client seat and the answer above means nothing.'; end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_red := v_red + 1;
  raise notice 'R1 RED — the organization set "only what is shared" and the member still sees a record nobody shared with her (custom.query_can_see = true), while the same seat is still refused a shape change.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- R2 — the source Table's flag alone opens the wall, with the other organization never asked.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The flag is an ordinary setting on the Table record, set through the ordinary write door.
  perform custom.record_update(v_a, v_tbl, jsonb_build_object('cross_organization_relations', true));

  -- THE EDGE ITSELF HAS NO CLIENT DOOR. Measured on the main database 2026-09-19:
  -- `custom.relation_carry` refuses a record in another organization by name, and
  -- `custom.field_declare` refuses a `relation` column outright — so a person cannot make this
  -- edge through any door at all, and this ONE step leaves the seat and says so. It asserts no
  -- product clause while it is out; the clause is asked from the seat, below.
  perform set_config('role', v_boss, true);
  begin
    insert into custom.record (organization_id, table_id, data_class, data, created_by)
    values (v_a, v_tbl, 'relation',
            jsonb_build_object('from', v_rec::text, 'to', v_recb::text,
                               'role', 'supplier', 'kind', 'referenced', 'carrying', false),
            c_admin)
    returning id into v_edge;
  exception when foreign_key_violation then
    perform set_config('role', 'authenticated', true);
    raise exception 'R2 NOT RED — the old wall already required both organizations. The green suite proves nothing.';
  end;
  perform set_config('role', 'authenticated', true);

  -- AND NOW THE CLAUSE, from the seat: a person in organization A holds a live link that reaches
  -- a record organization B never agreed to, and can read both ends of it.
  if not (custom.record_resolve(v_a, v_edge) ->> 'live')::boolean then
    raise exception 'R2 NOT RED — the edge did not survive, so "one organization''s flag opened the wall" is not what is being shown.'; end if;
  if (custom.read_record(v_a, v_edge, true) ->> 'to') <> v_recb::text then
    raise exception 'R2 NOT RED — the read door in organization A does not hand back a link naming organization B''s record.'; end if;
  if not exists (select 1 from custom.relation_targets(v_a, v_edge, 'to') t where t = v_recb) then
    raise exception 'R2 NOT RED — the relation door in organization A does not name organization B''s record as the target.'; end if;
  v_red := v_red + 1;
  raise notice 'R2 RED — one organization''s Table flag reached into another organization; organization B was never asked, and A''s own read and relation doors hand the link back.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- R3 — the question cannot be asked at all.
  -- CALLED from the seat, not looked up in the catalogue: what matters is that a person asking
  -- "who could see this on that day" gets nothing back.
  -- ════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform 1 from custom.visibility_as_of(v_a, v_rec, now()) limit 1;
  exception when undefined_function then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'R3 NOT RED — the as-of door answered, so "it did not exist" is not what is being shown.'; end if;
  v_red := v_red + 1;
  raise notice 'R3 RED — a person asking "who could see this, and when" is told there is no such function: %', left(v_caught, 90);

  -- ════════════════════════════════════════════════════════════════════════════
  -- R4 — the rewrite happens and the Migration log knows nothing about it.
  -- Through `custom.record_update`, which IS "the ordinary write door" the clause names, and
  -- read back through `custom.migrations`, the history door a person's history panel uses.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.record_update(v_a, v_fld,
    jsonb_build_object('type', 'range', 'config', jsonb_build_object('kind', 'number')));
  select count(*) into v_n from custom.migrations(v_a, v_fld, 50) m
   where m.verb = 'retype' and m.target_kind = 'field';
  if v_n <> 0 then
    raise exception 'R4 NOT RED — the old conversion already wrote % migration row(s) a person can see.', v_n; end if;
  if (custom.read_record(v_a, v_rec, true) -> 'severity') is null then
    raise exception 'R4 NOT RED — nothing was actually converted, so "rewrote the values and logged nothing" is not what is being shown.'; end if;
  v_red := v_red + 1;
  raise notice 'R4 RED — a field type change through the ordinary write door rewrote the table''s values and left no Migration row for anyone to find.';

  if v_red <> 4 then raise exception 'ONLY % of 4 blocks went red.', v_red; end if;
  raise notice '4 of 4 blocks are RED (the defects VIS-2 closes were all present before it) — every clause asked from the seat `authenticated`, through the doors a signed-in person reaches.';
end $t$;

rollback;
