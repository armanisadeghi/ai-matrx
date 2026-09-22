-- chair-step: it REPLACES twenty live bodies on the live path and no knob can hold it OFF. Every body is the live body character for character, moved from LANGUAGE sql into plpgsql so PostgreSQL caches its plan for the session instead of re-planning it on every call; no arm is added, removed or reordered and no predicate is touched. A `-- guard:` line here would be a comment pretending to be a switch, which is exactly what the runner refuses. Parity is proved instead, and measured: 5,000 (member, record) pairs in ONE repeatable-read snapshot, custom.has_visibility at viewer and editor plus custom.effective_level on 500 of them - before-hash df83b471d4e3a170dde8f692919b123f, after-hash df83b471d4e3a170dde8f692919b123f, 0 disagreements, 2,399 of the 5,000 answering true so the sample is not degenerate.
-- based-on: custom.carrying_edges_of(text, uuid) 6902329922d62f83cbb328d1d890fe7f3f688282080730b47b1fb0b9d22aa6b9
-- based-on: custom.carrying_edges_in(uuid) b31bfa5c582360f5505e2c1045138e8829e0bf65a24672518505734e66d60b91
-- based-on: custom.visibility_ancestors(text, uuid) f66872424cd50cd07efd4d8cddc48ffb7470b0361995e1e4facd3139e7e565e4
-- based-on: custom.derive_visibility(text, uuid) 5ab76ac5bec5019ff3b3256ce3c762b12d941656732f200aad285da4062d6219
-- based-on: custom.read_door_granted_ids(uuid, uuid) 38a80283f1e79e53871cde1eb74c10d0da70c7a94083660dec27ce8ba3773556
-- based-on: iam.content_levels() d5c1850dcb517591e0ba93e461783a4827b05a4421ec8466bbfba3010eb37d5e
-- based-on: iam.granted_level(uuid, text, uuid) ff38b35ffc47f57a20bc96c514caddb581e652b182d821c69ec72aa269cd0ff6
-- based-on: iam.grant_addressed_level(uuid, text, uuid) 496d7be28b6efaed17de14e2dca55d67a9b242f24941c5507b333707ae087237
-- based-on: iam.top_content_level() 35f723f153fb353761463a3fe39dc17c20f39a10dbe2e2e5b13eaa3decdcb2cf
-- based-on: iam.is_client_lane() 6f14d8afabcae87fa39146c09f61258575e5296d94c2d481438f13c13d0ff1b5
-- based-on: iam.is_trusted_backend() 0a65b52fa1260f9ac0e96896caf2b72c42ad6a659b916e35e98f0a1e6b332f11
-- based-on: iam.my_orgs() ad720afaeab2a8c6f2a0337ce1dbc16e0f96ce39c8a3655dd58e54cff9dfbabe
-- based-on: public.is_pack_curator(uuid, uuid) bcfa573c910372af1dc842b237678f29a323aef2052133a649660c70996c6092
-- based-on: public.is_rulebook_curator(uuid, uuid) 2564d704ffd0140ba5250473f9f98b06472905761cca1be5cf30266312d483d6
-- based-on: public.library_is_open(text, uuid) 1a589370ec83f75d157718bfd4d5fe95301ed0fdeb29d1fb0b7c9e42ee68dd24
-- based-on: public.is_admin() 11d11a8941d45ec228788bd0829010868f4f207b9991eaba2564c7e796f5feab
-- based-on: public.is_platform_admin() 774438aa9a323840d6b3c0c4bdb2c6c59fb855914003264daff0e380c5d638c2
-- based-on: platform.carrying_cycle_is_declared(text, uuid, text, uuid) 11dd39064e15f88abdc0e9825528c41b368beb32afbe143536862b5b3d261453
-- based-on: platform.carrying_cycles() deca2c2d5cef1fdeb6ee05f8825d629d9cf2476f2aaedd26a71ec687eb0b879b
-- based-on: platform.undeclared_carrying_cycles() 432f33f3c3047ad6544b1bedb32d45cae8b17cab311e2e1f55f322e313b3a7c1
--
-- LADDER-PERF — THE ONE LADDER STOPS RE-PLANNING ITSELF.
--
-- WHAT IT COST, measured on the MAIN database on 2026-09-20, warm, 20-30 calls per number
-- (the numbers other lanes reported and this file's own profile agree):
--
--   custom.has_visibility(member, 'record', an ordinary row, 'viewer')     15.4 - 16.2 ms
--   custom.has_visibility(member, 'record', a TABLE row,     'viewer')     24.7 ms
--   custom.effective_level(member, org, an ordinary row)                   30.6 - 32.9 ms
--   iam.has_access_for — the platform kernel the ladder wraps               1.58 ms
--
-- So the ladder cost TEN TIMES the kernel it wraps, and everything the store does per row
-- paid it: MIRROR-PERF's set computation, census 12 of check:store-doors-decide, and a
-- member's own RLS read.
--
-- WHERE IT WENT, root-caused with a live clock rather than guessed:
--
--   custom.visibility_ancestors('record', an ordinary row)   10.5 ms   of the 15.4
--   custom.visibility_ancestors('record', a TABLE row)       18.7 ms   of the 24.7
--   custom.carrying_edges_of('record', one node)              6.6 ms   called once per node
--
-- and `custom.carrying_edges_of` run INLINE, with the same rows, as one ordinary statement:
--
--   Unique (actual time=0.156..0.163 rows=1)  Buffers: shared hit=42
--
-- 0.16 ms inline against 6.6 ms as a function call, and 42 buffers against 218. The rows are
-- not the cost. THE PLAN IS. `EXPLAIN` of the same body as a prepared statement with its
-- parameters says it outright:
--
--   Planning: Buffers: shared hit=152   Planning Time: 5.420 ms   Execution Time: 0.428 ms
--
-- THE CLASS. A SQL-LANGUAGE function is inlined by the planner only when it is a plain
-- SELECT with no SECURITY DEFINER and no SET clause. Every function on this ladder is
-- `SECURITY DEFINER SET search_path TO ''` — correctly so — which means none of them is ever
-- inlined, AND a non-inlined SQL-language function is re-planned on EVERY CALL: its plan
-- cache lives for the duration of the calling query, not for the session. A plpgsql function
-- with the identical body keeps its plan in the session's SPI cache and plans ONCE. Proven,
-- same database, same rows, a plpgsql clone of `custom.carrying_edges_of` built beside it:
--
--   SQL-language custom.carrying_edges_of   7.24 ms/call
--   plpgsql clone, body byte-identical      1.36 ms/call
--
--   LIVE  custom.visibility_ancestors(record)  10.3 ms      plpgsql clone  2.38 ms
--   LIVE  custom.visibility_ancestors(TABLE)   19.0 ms      plpgsql clone  1.06 ms
--   ... and the two answers compared row for row: IDENTICAL.
--
-- And it is not one function. Walking the call graph from `custom.has_visibility`,
-- `custom.effective_level`, `custom.reaches_directly` and `custom.visible_set` reaches 50
-- names, of which TWENTY-TWO are SQL-language and non-inlinable. This file converts every one
-- of them that has a query to plan; the three that are left are IMMUTABLE and return a
-- constant, so there is no plan to cache. `custom.ladder_replanners()` is the census that says
-- so, and it is what keeps the class closed.
--
-- NOTHING ABOUT ANY ANSWER CHANGES. Each body below is the live body, character for
-- character, moved inside `begin return query <body>; end` (or `begin return (<body>); end`
-- for a scalar). No arm is added, removed or reordered; no predicate is touched. The
-- `-- based-on:` lines are the statement of exactly which bodies these were taken from, and
-- `pnpm db:apply` refuses the whole file if one of them has moved.
--
-- WHAT IT BUYS, measured the same way after (rolled back, then applied for real):
--
--   custom.visibility_ancestors('record', an ordinary row)   10.5 ms  ->  0.74 ms
--   custom.has_visibility(member, an ordinary row)           15.4 ms  ->  4.71 ms
--   custom.has_visibility(member, a TABLE row)               24.7 ms  ->  7.46 ms
--   custom.effective_level(member, an ordinary row)          30.6 ms  ->  9.10 ms
--
-- ---------------------------------------------------------------------------------------------
-- THE TWENTY BODIES, MOVED WORD FOR WORD INTO plpgsql SO THEY PLAN ONCE PER SESSION.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION custom.carrying_edges_of(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
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
    -- `Field`, and the home-record kernel every fixture hangs off) live in the SYSTEM
    -- organization, which is global_readable, so a Table row (whose own `table_id` is the
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
       and r.visibility >= 'internal'::platform.visibility
    union
    -- arm 4 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The mirror of arm 3 of
    -- `custom.carrying_edges_in`, asked from the item's side: this Job names a client, that
    -- client's record is its container, and what it conveys is what the portal declared. It
    -- matches on `relation_field_id` — one Field of one Table of one organization — and never
    -- on the role, because a role is a field key and "client" is a word a hundred organizations
    -- will use.
    select 'record'::text, a.target_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and p_item_type = 'record'
       and a.source_type = 'record'
       and a.source_id = p_item_id
       and a.target_type = 'record';
end
$fn$;

CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
    -- arm 1 — platform.containment_edges
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
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
    -- the container; the record holding the Field is the item. This is what makes "only theirs"
    -- answerable without a per-portal query: an outsider holding her own client record reaches
    -- exactly the records that name it, at the level the portal declared, through the same
    -- ladder as everything else on this platform.
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record'
       and a.target_type = 'record';
end
$fn$;

CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
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
             least(u.max_level, e.conveys_max),
             -- LEAK-T10: THE SAME FACT, AT EVERY DEPTH. This was hard-coded `false`, so the
             -- terminal rule held only for the row the walk started from. One step further out
             -- a Home is a row of some Table too, and the walk climbed from that Table into ITS
             -- Homes — the same leak, one level up, in a place no test looked.
             (u.container_type = 'record'
              and exists (select 1 from custom.record r
                           where r.id = u.container_id and r.table_id = e.container_id)),
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
end
$fn$;

CREATE OR REPLACE FUNCTION custom.derive_visibility(p_container_type text, p_container_id uuid)
 RETURNS TABLE(item_type text, item_id uuid, depth integer, max_level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
    with recursive walk as (
      select e.item_type, e.item_id, 1 as depth, e.conveys_max as max_level,
             array[p_container_type || ':' || p_container_id::text,
                   e.item_type || ':' || e.item_id::text] as path
      from custom.carrying_edges e
      where e.container_type = p_container_type
        and e.container_id   = p_container_id
      union all
      select e.item_type, e.item_id, w.depth + 1,
             least(w.max_level, e.conveys_max),          -- VIS-3: the MINIMUM along the path
             w.path || (e.item_type || ':' || e.item_id::text)
      from walk w
      join custom.carrying_edges e
        on  e.container_type = w.item_type
        and e.container_id   = w.item_id
      where w.depth < 16                                  -- REC-N-4: the ceiling, read from here
        and not (e.item_type || ':' || e.item_id::text) = any (w.path)   -- VIS-4: loops terminate
    )
    select w.item_type, w.item_id, min(w.depth), max(w.max_level)  -- VIS-2: the MAXIMUM across paths
    from walk w
    group by w.item_type, w.item_id;
end
$fn$;

CREATE OR REPLACE FUNCTION custom.read_door_granted_ids(p_organization_id uuid, p_table_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return (
    select coalesce(array_agg(distinct r.id), '{}'::uuid[])
      from (
        -- a grant on the record (public.has_permission_for, iam.granted_level, iam.grant_addressed_level)
        select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
        union all
        -- a membership held ON the record itself
        select m.container_id from iam.memberships m where m.container_type = 'record'
        -- the open library (public.user_can_read_via_library_grant, public.library_is_open)
        union all
        select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
        -- the platform closure the access kernel pushes onto its own frontier
        union all
        select rr.item_id from platform.reachability rr where rr.item_type = 'record'
      ) h
      join custom.record r
        on r.organization_id = p_organization_id
       and r.id = h.id
       and r.deleted_at is null
       and (p_table_id is null or r.table_id is not distinct from p_table_id)
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.content_levels()
 RETURNS TABLE(level permission_level, ordinal integer, noun text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $fn$
begin
  return query
    select e.enumlabel::text::public.permission_level,
           row_number() over (order by e.enumsortorder)::integer,
           case e.enumlabel
             when 'viewer'    then 'can read it'
             when 'commenter' then 'can read it and say something about it'
             when 'editor'    then 'can change it'
             when 'admin'     then 'can change it and decide who else may'
           end
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'permission_level'
     order by e.enumsortorder;
end
$fn$;

CREATE OR REPLACE FUNCTION iam.granted_level(p_user_id uuid, p_resource_type text, p_resource_id uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return (
    select max(p.permission_level)
      from iam.permissions p
     where p.resource_type = p_resource_type
       and p.resource_id   = p_resource_id
       and p.status <> 'rejected'
       and (p.expires_at is null or p.expires_at > now())
       and (p.granted_to_user_id = p_user_id
            or p.is_public
            or p.granted_to_organization_id in (select om.organization_id
                                                  from iam.organization_member om
                                                 where om.user_id = p_user_id))
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.grant_addressed_level(p_user_id uuid, p_resource_type text, p_resource_id uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return (
    select max(p.permission_level)
      from iam.permissions p
     where p.resource_type = p_resource_type
       and p.resource_id   = p_resource_id
       and p.status <> 'rejected'
       and (p.expires_at is null or p.expires_at > now())
       and coalesce(p.is_public, false) = false
       and (p.granted_to_user_id = p_user_id
            or p.granted_to_organization_id in (select om.organization_id
                                                  from iam.organization_member om
                                                 where om.user_id = p_user_id))
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.top_content_level()
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $fn$
begin
  return (
   select max(l.level) from iam.content_levels() l
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.is_client_lane()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $fn$
begin
  return (
    -- TRUE when a person's identity is on this call (a browser, or our own pool acting as
    -- that person), and TRUE for any PostgREST web session. FALSE only for a server
    -- connection acting as nobody: a sweep, a system job, a migration.
    select (select auth.uid()) is not null
        or not iam.is_trusted_backend()
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.is_trusted_backend()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $fn$
begin
  return (
    -- TRUE for a caller that is the server itself, never for a browser:
    --   a) the PostgREST request carries the service-role claim. `current_user` is
    --      USELESS inside a SECURITY DEFINER body (it is the function owner, D166);
    --      the JWT role claim survives into the definer context.
    --   b) the session is not a PostgREST web session at all. Supabase's PostgREST
    --      always logs in as `authenticator` and then SET ROLEs to anon /
    --      authenticated / service_role, so any other `session_user` is a direct
    --      connection: our own login role, which can already read these tables
    --      without asking any function for permission.
    select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
        or session_user <> 'authenticator'
  );
end
$fn$;

CREATE OR REPLACE FUNCTION iam.my_orgs()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
begin
  return query
    select organization_id from iam.organization_member where user_id = (select auth.uid())
    union
    select s.organization_id from iam.system_orgs s
     where s.global_readable and public.is_super_admin_for((select auth.uid()));
end
$fn$;

CREATE OR REPLACE FUNCTION public.is_pack_curator(p_user uuid, p_pack_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'iam'
AS $fn$
begin
  return (
    select (not iam.is_client_lane()
            or p_user = (select auth.uid())
            or (select public.is_platform_admin()))
       and exists (
      select 1 from seo.starter_pack p
      join iam.industry_curators ic on ic.industry_id = p.industry_id and ic.deleted_at is null
      where p.id = p_pack_id and ic.user_id = p_user)
  );
end
$fn$;

CREATE OR REPLACE FUNCTION public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $fn$
begin
  return (
    select (not iam.is_client_lane()
            or p_user = (select auth.uid())
            or (select public.is_platform_admin()))
       and exists (
      select 1 from platform.rulebook rb
      join iam.industry_curators ic on ic.industry_id = rb.industry_id and ic.deleted_at is null
      where rb.id = p_rulebook_id and rb.deleted_at is null and ic.user_id = p_user)
  );
end
$fn$;

CREATE OR REPLACE FUNCTION public.library_is_open(p_entity_type text, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return (
    select exists (
      select 1 from platform.entity_grants g
       where g.entity_type = p_entity_type
         and g.entity_id = p_entity_id
         and g.audience in ('industry', 'global'))
  );
end
$fn$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $fn$
begin
  return (
    SELECT EXISTS (
      SELECT 1
      FROM admin.admins a
      WHERE a.user_id = (select auth.uid())
    )
  );
end
$fn$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
begin
  return (
    SELECT EXISTS (
      SELECT 1
      FROM public.current_user_is_admin cua
      WHERE cua.user_id = (select auth.uid())
        AND cua.is_admin IS TRUE
    )
  );
end
$fn$;

CREATE OR REPLACE FUNCTION platform.carrying_cycle_is_declared(p_a_type text, p_a_id uuid, p_b_type text, p_b_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return (
    WITH RECURSIVE declared_edge AS (
      SELECT CASE WHEN at.container_side = 'source' THEN a.source_type ELSE a.target_type END AS container_type,
             CASE WHEN at.container_side = 'source' THEN a.source_id   ELSE a.target_id   END AS container_id,
             CASE WHEN at.container_side = 'source' THEN a.target_type ELSE a.source_type END AS item_type,
             CASE WHEN at.container_side = 'source' THEN a.target_id   ELSE a.source_id   END AS item_id
      FROM platform.associations a
      JOIN platform.association_types at
        ON at.source_type = a.source_type AND at.target_type = a.target_type
       AND (at.label IS NULL OR at.label = a.label)
      WHERE a.deleted_at IS NULL AND at.is_active
        AND at.container_side IN ('source', 'target') AND at.allows_loops
    ),
    up_a (t, i) AS (
      SELECT p_a_type, p_a_id
      UNION
      SELECT e.container_type, e.container_id FROM up_a JOIN declared_edge e ON e.item_type = up_a.t AND e.item_id = up_a.i
    ),
    up_b (t, i) AS (
      SELECT p_b_type, p_b_id
      UNION
      SELECT e.container_type, e.container_id FROM up_b JOIN declared_edge e ON e.item_type = up_b.t AND e.item_id = up_b.i
    )
    SELECT EXISTS (SELECT 1 FROM up_a WHERE up_a.t = p_b_type AND up_a.i = p_b_id)
       AND EXISTS (SELECT 1 FROM up_b WHERE up_b.t = p_a_type AND up_b.i = p_a_id)
  );
end
$fn$;

CREATE OR REPLACE FUNCTION platform.carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
    -- Self-containment: a record that contains itself.
    SELECT r.container_type, r.container_id, r.item_type, r.item_id, 'self'::text
    FROM platform.reachability r
    WHERE (r.container_type, r.container_id) IS NOT DISTINCT FROM (r.item_type, r.item_id)
    UNION ALL
    -- Mutual containment: each reaches the other. `platform.reachability` is the CLOSURE, so this one
    -- pair-wise join finds a cycle of ANY length, not only the two-hop kind.
    SELECT r1.container_type, r1.container_id, r1.item_type, r1.item_id, 'mutual'::text
    FROM platform.reachability r1
    JOIN platform.reachability r2
      ON  r2.container_type = r1.item_type
      AND r2.container_id   = r1.item_id
      AND r2.item_type      = r1.container_type
      AND r2.item_id        = r1.container_id
    WHERE (r1.container_type, r1.container_id) IS DISTINCT FROM (r1.item_type, r1.item_id)
      AND (r1.container_type, r1.container_id::text) < (r1.item_type, r1.item_id::text);
end
$fn$;

CREATE OR REPLACE FUNCTION platform.undeclared_carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
begin
  return query
    SELECT c.a_type, c.a_id, c.b_type, c.b_id, c.shape
    FROM platform.carrying_cycles() c
    WHERE NOT platform.carrying_cycle_is_declared(c.a_type, c.a_id, c.b_type, c.b_id);
end
$fn$;

-- ---------------------------------------------------------------------------------------------
-- THE CENSUS THAT KEEPS THE CLASS CLOSED.
--
-- It walks the call graph from the ladder's own entry points, reading each function's live
-- definition and following every `schema.name(` it mentions, and names every function it
-- reaches that is LANGUAGE sql and cannot be inlined — SECURITY DEFINER or a SET clause — and
-- therefore re-plans its body on every call. IMMUTABLE functions are excused BY RULE, not by a
-- hand list: an IMMUTABLE function on this ladder returns a constant (the kernel Table's id,
-- the Field Table's id, the ladder ceiling) and has no query to plan.
--
-- It is read by `pnpm check:store-doors-decide` and it is the thing that goes red if a later
-- lane writes a new SQL-language helper into the ladder.
-- ---------------------------------------------------------------------------------------------
create or replace function custom.ladder_replanners(p_roots text[] default array['custom.has_visibility','custom.effective_level','custom.reaches_directly','custom.visible_set'])
returns table(fn text, lang text, why text, remedy text)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_front text[];
  v_seen  text[] := '{}'::text[];
  v_cur   text;
  v_head  integer := 1;
  v_body  text;
  rec     record;
begin
  v_front := coalesce(p_roots, '{}'::text[]);
  while v_head <= coalesce(array_length(v_front, 1), 0) and v_head <= 1000 loop
    v_cur  := v_front[v_head];
    v_head := v_head + 1;
    continue when v_seen @> array[v_cur];
    v_seen := v_seen || v_cur;
    select string_agg(pg_catalog.pg_get_functiondef(pr.oid), E'\n')
      into v_body
      from pg_catalog.pg_proc pr
      join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname || '.' || pr.proname = v_cur;
    continue when v_body is null;
    for rec in
      select distinct mm[1] || '.' || mm[2] as callee
        from pg_catalog.regexp_matches(
               v_body,
               '(custom|iam|platform|public|history)[.]([a-z0-9_]+)[[:space:]]*[(]', 'g') as mm
    loop
      if not (v_seen @> array[rec.callee]) then
        v_front := v_front || rec.callee;
      end if;
    end loop;
  end loop;

  return query
  select ns.nspname || '.' || pr.proname,
         'sql'::text,
         'LANGUAGE sql and not inlinable ('
           || case when pr.prosecdef then 'SECURITY DEFINER' else '' end
           || case when pr.prosecdef and pr.proconfig is not null then ' + ' else '' end
           || case when pr.proconfig is not null then 'SET' else '' end
           || '), so PostgreSQL re-plans its body on every call - the plan cache of a '
           || 'non-inlined SQL-language function lives for the calling query, not the session.',
         'Move the identical body into plpgsql: begin return query <body>; end. '
           || 'LADDER-PERF measured 7.24 ms -> 1.36 ms on custom.carrying_edges_of doing exactly that.'
    from pg_catalog.pg_proc pr
    join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
    join pg_catalog.pg_language l   on l.oid  = pr.prolang
   where l.lanname = 'sql'
     and (pr.prosecdef or pr.proconfig is not null)
     and pr.provolatile <> 'i'
     and ns.nspname || '.' || pr.proname = any (v_seen)
   group by 1, 2, 3, 4
   order by 1;
end;
$fn$;

comment on function custom.ladder_replanners(text[]) is
  'LADDER-PERF: every function the one ladder reaches that is LANGUAGE sql and cannot be '
  'inlined, and therefore re-plans its body on every call. Zero rows is the contract. '
  'IMMUTABLE functions are excused by rule - they return a constant and have no query to plan.';


-- ---------------------------------------------------------------------------------------------
-- THE DOOR ROWS THE SHAPE GUARD ASKS FOR.
--
-- Five of the twenty are SECURITY DEFINER functions that had never been declared in
-- `platform.client_callable_door` — they predate the rule, and `provision_shape_guard` refuses
-- a SECURITY DEFINER body that reaches COMMIT with no access decision declared IN DATA. None of
-- them is a client door and none becomes one here: `signed_in_callers` and `anonymous_callers`
-- are both false and each says, in a sentence, which lane calls it and why no client ever does.
-- The sixth row is this lane's own census.
-- ---------------------------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'library_is_open', 'p_entity_type text, p_entity_id uuid',
   ARRAY[25, 2950]::oid[],
   'p_entity_id is NOT checked against the caller and must not be: this answers whether a '
   || 'resource was given to an industry or to everyone, which is a property of the RESOURCE '
   || 'and of nobody in particular. iam.has_access_for_base asks it as one arm of its own walk '
   || 'and the walk is what decides the caller. NULL entity id answers false.',
   'ladderperf_the_one_ladder_plans_once.sql',
   'server_only: called by iam.has_access_for_base (the platform access kernel) and by '
   || 'iam.entity_read_expr''s generated policy text. A client never calls it directly and '
   || 'never should - on its own it is a fact about a row, not a decision about a person.',
   false, false),
  ('platform', 'carrying_cycle_is_declared', 'p_a_type text, p_a_id uuid, p_b_type text, p_b_id uuid',
   ARRAY[25, 2950, 25, 2950]::oid[],
   'Neither id is checked against the caller: this is a question about the containment graph '
   || '("is this loop one somebody declared on purpose"), asked while a walk is already '
   || 'refusing to grant through it. NULL ids answer false.',
   'ladderperf_the_one_ladder_plans_once.sql',
   'server_only: called by platform.undeclared_carrying_cycles and the cycle audit, which run '
   || 'as operator censuses. A client has no id to pass and no answer it could act on.',
   false, false),
  ('platform', 'carrying_cycles', '', ARRAY[]::oid[],
   'Takes no argument and names every containment loop on the database, which is an operator '
   || 'question about the graph rather than about any one person''s access.',
   'ladderperf_the_one_ladder_plans_once.sql',
   'server_only: called by platform.undeclared_carrying_cycles and by the carrying-cycle audit '
   || 'the access kernel points a warning at. It would tell a client about rows in every '
   || 'organization, so no client may ever call it.',
   false, false),
  ('platform', 'undeclared_carrying_cycles', '', ARRAY[]::oid[],
   'Takes no argument and names every containment loop nobody declared, across every '
   || 'organization - an operator census, not a per-person answer.',
   'ladderperf_the_one_ladder_plans_once.sql',
   'server_only: named by iam.has_access_for_base''s own warning text as the thing an operator '
   || 'runs when a walk refuses a cycle. It spans every organization, so no client may call it.',
   false, false),
  ('custom', 'ladder_replanners', 'p_roots text[]', ARRAY[1009]::oid[],
   'Takes no entity id at all: the argument is a list of FUNCTION NAMES to start the call-graph '
   || 'walk from, and the answer is about the system catalogue. There is nothing here to check '
   || 'against a caller. A null or empty array walks from nothing and returns nothing.',
   'ladderperf_the_one_ladder_plans_once.sql',
   'server_only: called by pnpm check:store-doors-decide (censuses 14 and 15) and by '
   || 'scripts/campaign-tests/ladderperf_green.sql. It reads pg_proc and tells you which '
   || 'functions re-plan; a client has no use for it and must not be able to read the catalogue.',
   false, false);
