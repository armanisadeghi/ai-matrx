-- chair-step: five ALTER FUNCTION statements, which the additive allow-list refuses by name — and correctly, because a blacklist cannot tell a guard being repaired from a guard being weakened. Each one flips a trigger function that a client may trigger from SECURITY INVOKER to SECURITY DEFINER (and gives one of them the locked search_path it was missing). No body is rewritten: every rule these guards enforce is byte-identical afterwards, and the only thing that changes is that the guard can now READ what it guards instead of dying on its own lookup. The inverse is migrations/inverse/share_a_guard_that_cannot_read_refuses_everything_down.sql and puts all five back.
--
-- SHARE — A GUARD THAT CANNOT READ WHAT IT GUARDS IS NOT A GUARD, IT IS A BLANKET REFUSAL.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-19 (left behind by lane STORE-ASOF,
-- which found that "a real person still cannot share a record at all" and correctly said the
-- share door was not its to open).
--
-- `iam.permissions` is the ONE grant table, and its RLS policies deliberately let a signed-in
-- person write their own resource's grants:
--     POLICY "Users can create permissions for own resources" FOR INSERT TO authenticated
--       WITH CHECK (is_platform_admin() OR is_resource_owner(resource_type, resource_id))
-- Every guard on that table is SECURITY DEFINER — platform._custom_record_grant_guard,
-- hr._guard_audited_tier_grant, iam._guard_emergency_door_grant, history.grant_capture — with
-- ONE exception. `iam._per_table_grant_guard` is SECURITY INVOKER and its first act is
--     select r.organization_id, r.table_id from custom.record r where r.id = new.resource_id
-- and `authenticated` holds no SELECT on `custom.record` (DOOR-N-1a keeps it that way on
-- purpose: the store is read through W4-DOOR, never through a table grant). So the guard dies
-- on its own lookup before it can decide anything:
--
--     ERROR:  permission denied for table record
--     CONTEXT: PL/pgSQL function iam._per_table_grant_guard() line 7 at SQL statement
--
-- reproduced live, in a rolled-back transaction, as `authenticated` carrying the JWT of
-- admin@admin.com sharing a record admin@admin.com created. Not one record share by a real
-- person has ever been possible: all 51 pre-existing record-grant history rows on this
-- database were written by the role that OWNS the store.
--
-- The refusal is not the rule the guard protects. Its rule is VIS-24 — a per-TABLE grant is
-- only ever legitimate on a custom Table — and that rule passes an ordinary record share
-- straight through. The privilege error fires for every share, including every one the rule
-- would allow, and it says "permission denied for table record", a sentence about a table the
-- person never named.
--
-- THE CLASS, and it is a class: a SECURITY INVOKER trigger on a table a client may WRITE,
-- whose body READS a table no client may SELECT, converts that guard into a blanket refusal
-- of every write it was supposed to judge. Censused platform-wide (every table on which
-- `authenticated` holds INSERT, UPDATE or DELETE), there are exactly FOUR members:
--
--   iam.permissions       _iam_per_table_grant_guard                reads custom.record
--   platform.associations trg_associations_zzz_relation_contract    reads custom.record
--   platform.associations zzzz_store_relation_edge_names_its_field  reads custom.carrying_rule
--   files.files           guard_tombstone_retention                 reads files.files
--
-- The two on `platform.associations` are the sharing-by-CONTAINMENT half of the same door:
-- an association is how a record is placed inside a container, and containment is how a share
-- cascades (VIS-1, VIS-5). `enforce_relation_edge` is dark today only because
-- `custom/associations_guard` gates it off; `_store_relation_edge_names_its_field` is not
-- gated at all and refuses every client-written relation edge out of a record.
-- `files.files` reads itself only under a purge run, and would die the same way.
--
-- THE FIX, and it is the shape every other guard on `iam.permissions` already has: a guard
-- reads with the privileges of the RULE, not of the person being judged. Each function is
-- ALTERed to SECURITY DEFINER — the bodies are not rewritten, so no rule moves a millimetre —
-- and each carries a locked `search_path` so the definer boundary cannot be steered by the
-- caller. Three already had `SET search_path TO 'pg_catalog'`; `files.guard_tombstone_retention`
-- had none, so it is given one in the same breath (its body is already fully qualified).
--
-- None of them writes anything. They SELECT to decide whether to RAISE. Running that SELECT as
-- the owner grants nothing: the only thing a caller gains is the guard's verdict, which is the
-- thing the guard exists to give them.
--
-- THE GUARD FOR THE GUARD: `iam.grant_path_blanket_refusals()` is the census above, executable.
-- It answered FOUR before this file and answers ZERO after it, and it is written against the
-- catalogue rather than against a list of names, so the next trigger somebody adds in this
-- shape is named the day it lands.

-- ─────────────────────────────────────────────────────────────────────── the four, closed

alter function iam._per_table_grant_guard() security definer;
alter function custom._store_relation_edge_names_its_field() security definer;
alter function platform.enforce_relation_edge() security definer;
alter function files.guard_tombstone_retention() set search_path to 'pg_catalog', 'files';
alter function files.guard_tombstone_retention() security definer;

comment on function iam._per_table_grant_guard() is
  'VIS-24, the per-table grant rule. SECURITY DEFINER since 2026-09-19 (lane SHARE): it reads '
  'custom.record to find the record''s organization and Table, and no client role holds SELECT '
  'there, so as SECURITY INVOKER it raised "permission denied for table record" for every record '
  'share anybody ever attempted. A guard reads with the privileges of the rule, not of the person '
  'being judged.';
comment on function custom._store_relation_edge_names_its_field() is
  'REL-10, the relation edge names its field. SECURITY DEFINER since 2026-09-19 (lane SHARE): it '
  'reads custom.carrying_rule, which no client role may SELECT, so every client-written relation '
  'edge out of a record died on the lookup instead of being judged.';
comment on function platform.enforce_relation_edge() is
  'REL-5/7/8/10/12 and VIS-34, the relation contract. SECURITY DEFINER since 2026-09-19 (lane '
  'SHARE): it reads custom.record for both endpoints'' organizations. Dark today behind '
  'custom/associations_guard; it would have refused every client relation edge the moment that '
  'knob was turned on.';
comment on function files.guard_tombstone_retention() is
  'D23 tombstone retention. SECURITY DEFINER with a locked search_path since 2026-09-19 (lane '
  'SHARE): authenticated holds DELETE on files.files and no SELECT, so the guard''s own '
  'parent-walk would have died under a purge run.';

-- ───────────────────────────────────────────────────────────── the census, written as code

create function iam.grant_path_blanket_refusals()
returns table (
  on_table          text,
  trigger_name      text,
  guard_function    text,
  unreadable_table  text,
  what_happens      text,
  remedy            text
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- THE CLASS: a SECURITY INVOKER trigger on a table a CLIENT MAY WRITE, whose body reads a
  -- table NO client may SELECT. Such a guard never renders its verdict — it dies on its own
  -- lookup with `42501 permission denied`, refusing every write it was supposed to judge,
  -- including the ones its rule allows. The client roles are read from the catalogue rather
  -- than named, so this cannot drift from what PostgREST actually serves.
  with client_role as (
    select r.rolname
      from pg_roles r
     where r.rolname in ('authenticated', 'anon')
  ),
  client_writable as (
    select c.oid, n.nspname || '.' || c.relname as tbl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p')
       and exists (
             select 1 from client_role cr
              where has_table_privilege(cr.rolname, c.oid, 'INSERT')
                 or has_table_privilege(cr.rolname, c.oid, 'UPDATE')
                 or has_table_privilege(cr.rolname, c.oid, 'DELETE')
           )
  ),
  invoker_guard as (
    select distinct w.tbl, t.tgname, f.oid, f.oid::regprocedure::text as fn,
           pg_get_functiondef(f.oid) as src
      from pg_trigger t
      join client_writable w on w.oid = t.tgrelid
      join pg_proc f on f.oid = t.tgfoid
     where not t.tgisinternal
       and not f.prosecdef
  ),
  reference as (
    select g.tbl, g.tgname, g.fn, lower(m[1]) as ref
      from invoker_guard g,
           lateral regexp_matches(
             g.src,
             '(?:from|join|update|into)[[:space:]]+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)',
             'gi') m
  )
  select r.tbl,
         r.tgname,
         r.fn,
         r.ref,
         format('a client write to %s runs %s, which reads %s and gets 42501 permission denied '
                'before the rule is ever applied — every write is refused, including the ones '
                'the rule allows', r.tbl, r.fn, r.ref),
         format('alter function %s security definer; (and give it a locked SET search_path if it '
                'has none). A guard reads with the privileges of the rule, never of the person '
                'being judged — do NOT grant SELECT on %s to a client role instead.', r.fn, r.ref)
    from reference r
   where to_regclass(r.ref) is not null
     and (select c.relkind from pg_class c where c.oid = to_regclass(r.ref)) in ('r', 'p', 'v', 'm')
     and not exists (
           select 1 from client_role cr
            where has_table_privilege(cr.rolname, to_regclass(r.ref), 'SELECT')
         )
   group by 1, 2, 3, 4
   order by 1, 2, 4;
$$;

comment on function iam.grant_path_blanket_refusals() is
  'Lane SHARE, 2026-09-19. Names every SECURITY INVOKER trigger on a client-writable table whose '
  'body reads a table no client role may SELECT — the shape that turns a guard into a blanket '
  'refusal of every write it exists to judge. Four on 2026-09-19 before the same file closed '
  'them; zero after. Written against the catalogue, so a fifth is named the day it lands.';

-- The census is a CENSUS: it reads pg_proc, pg_trigger and the role catalogue and answers a
-- maintenance question about this platform's own guards. No client ever calls it, so it
-- declares the lane it does belong to rather than a client door.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'grant_path_blanket_refusals',
   iam.door_identity_args('iam.grant_path_blanket_refusals()'::regprocedure),
   array[]::oid[],
   'Takes no entity id and reads nothing but the catalogue: pg_class, pg_proc, pg_trigger, pg_roles and has_table_privilege. It returns the NAMES of guards that are mis-shaped, never a row of anybody''s data, and there is no argument to check a caller against.',
   'migrations/campaign/share_a_guard_that_cannot_read_refuses_everything.sql (lane SHARE)',
   'server_only: this is a platform-maintenance census run by the campaign suites and by pnpm check scripts over a direct postgres connection. Naming which of our own triggers are mis-shaped is an operator answer, not a product surface, and no client screen asks it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
