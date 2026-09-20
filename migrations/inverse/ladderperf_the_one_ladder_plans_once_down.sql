-- INVERSE of migrations/campaign/ladderperf_the_one_ladder_plans_once.sql.
-- It puts the twenty bodies back as LANGUAGE sql, exactly as they were on the main database
-- at 2026-09-20 14:00 UTC, and drops the census. Running it restores the re-planning: that is
-- what scripts/campaign-tests/ladderperf_red.sql executes, inside a rolled-back transaction,
-- to show custom.ladder_replanners() red.

CREATE OR REPLACE FUNCTION custom.carrying_edges_of(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, conveys_max permission_level)
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
$function$;

CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION custom.derive_visibility(p_container_type text, p_container_id uuid)
 RETURNS TABLE(item_type text, item_id uuid, depth integer, max_level permission_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION custom.read_door_granted_ids(p_organization_id uuid, p_table_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and (p_table_id is null or r.table_id is not distinct from p_table_id);
$function$;

CREATE OR REPLACE FUNCTION iam.content_levels()
 RETURNS TABLE(level permission_level, ordinal integer, noun text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION iam.granted_level(p_user_id uuid, p_resource_type text, p_resource_id uuid)
 RETURNS permission_level
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                               where om.user_id = p_user_id));
$function$;

CREATE OR REPLACE FUNCTION iam.grant_addressed_level(p_user_id uuid, p_resource_type text, p_resource_id uuid)
 RETURNS permission_level
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                               where om.user_id = p_user_id));
$function$;

CREATE OR REPLACE FUNCTION iam.top_content_level()
 RETURNS permission_level
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$ select max(l.level) from iam.content_levels() l; $function$;

CREATE OR REPLACE FUNCTION iam.is_client_lane()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- TRUE when a person's identity is on this call (a browser, or our own pool acting as
  -- that person), and TRUE for any PostgREST web session. FALSE only for a server
  -- connection acting as nobody: a sweep, a system job, a migration.
  select (select auth.uid()) is not null
      or not iam.is_trusted_backend()
$function$;

CREATE OR REPLACE FUNCTION iam.is_trusted_backend()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION iam.my_orgs()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from iam.organization_member where user_id = (select auth.uid())
  union
  select s.organization_id from iam.system_orgs s
   where s.global_readable and public.is_super_admin_for((select auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.is_pack_curator(p_user uuid, p_pack_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'iam'
AS $function$
  select (not iam.is_client_lane()
          or p_user = (select auth.uid())
          or (select public.is_platform_admin()))
     and exists (
    select 1 from seo.starter_pack p
    join iam.industry_curators ic on ic.industry_id = p.industry_id and ic.deleted_at is null
    where p.id = p_pack_id and ic.user_id = p_user);
$function$;

CREATE OR REPLACE FUNCTION public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
  select (not iam.is_client_lane()
          or p_user = (select auth.uid())
          or (select public.is_platform_admin()))
     and exists (
    select 1 from platform.rulebook rb
    join iam.industry_curators ic on ic.industry_id = rb.industry_id and ic.deleted_at is null
    where rb.id = p_rulebook_id and rb.deleted_at is null and ic.user_id = p_user);
$function$;

CREATE OR REPLACE FUNCTION public.library_is_open(p_entity_type text, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from platform.entity_grants g
     where g.entity_type = p_entity_type
       and g.entity_id = p_entity_id
       and g.audience in ('industry', 'global'));
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM admin.admins a
    WHERE a.user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_user_is_admin cua
    WHERE cua.user_id = (select auth.uid())
      AND cua.is_admin IS TRUE
  );
$function$;

CREATE OR REPLACE FUNCTION platform.carrying_cycle_is_declared(p_a_type text, p_a_id uuid, p_b_type text, p_b_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION platform.carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    AND (r1.container_type, r1.container_id::text) < (r1.item_type, r1.item_id::text)
$function$;

CREATE OR REPLACE FUNCTION platform.undeclared_carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT c.a_type, c.a_id, c.b_type, c.b_id, c.shape
  FROM platform.carrying_cycles() c
  WHERE NOT platform.carrying_cycle_is_declared(c.a_type, c.a_id, c.b_type, c.b_id)
$function$;

drop function if exists custom.ladder_replanners(text[]);
