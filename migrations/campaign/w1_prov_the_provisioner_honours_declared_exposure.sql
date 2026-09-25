-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.apply_table_grants(text, text, text) 5911b39be170804c321b13cfd2afb627a14623c80b2d8bc294c90c6624c3a17c
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 8043afd667b5f9eb894299b68c941701df50a89dc2c6edeb43fdd04a040b50ec
-- based-on: platform.provision(jsonb, text, uuid, text) ec762f6a4770cad2f97c9e13fa8bdc0dfb59fd34f010faee77b72ccabf14c11b
--
-- W1-PROV-CLOSED — THE PROVISIONER HONOURS A SCHEMA'S DECLARED EXPOSURE.
--
-- THE DEFECT, MEASURED RATHER THAN ASSERTED (rehearsal branch, 2026-09-17)
-- ------------------------------------------------------------------------
-- Schema `custom` must hold no client-role privilege until switch-checklist step 3. It was
-- closed by `w1_prov_custom_record_via_the_door.sql`'s four REVOKEs. It is open again. The
-- two sources were told apart by measuring which statements issue which grants, because they
-- have very different standings and the fix must keep one of them working:
--
--   1. `grant usage on schema custom to authenticated`, `grant select on all tables …` and
--      `alter default privileges in schema custom grant select on tables to authenticated`
--      are `scripts/gate-corpus/branch-api.ts` lines 599, 601 and 641 — the `--expose` verb,
--      a DELIBERATE rehearsal act on the BRANCH for the HTTP proofs. It must stay possible.
--      No statement in the provisioning path issues any of the three: proven by running the
--      RED probe below with `custom` closed — after one `platform.provision(spec)`,
--      `has_schema_privilege('authenticated','custom','USAGE')` was still FALSE and
--      `pg_default_acl` for the schema still held zero client rows.
--
--   2. The per-relation client grant IS the provisioner's, on EVERY provision, for EVERY
--      schema. RED, 2026-09-17 on the branch, inside one rolled-back transaction: schema
--      `custom` closed by four REVOKEs and three `ALTER DEFAULT PRIVILEGES … REVOKE`
--      (0 relations with a client grant, 0 default-ACL rows), then ONE ordinary
--      `platform.provision(spec)` for a throwaway entity table, and the new relation read
--      `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}`.
--      That is `iam.apply_table_grants` doing exactly what it is written to do. So a REVOKE
--      issued after a provision lasts until the next provision into the same schema, which is
--      why lane `W1-TIER`'s two provisions re-opened what `W1-PROV` had closed, and why no
--      lane's exit anywhere would have noticed.
--
-- THE CLASS, NOT THE INSTANCE
-- ---------------------------
-- The fix is not a `custom`-shaped special case and not a revoke bolted onto the end of one
-- lane's file. **A schema's exposure to client roles is DECLARED, and the provisioner honours
-- the declaration.** The declaration is `platform.schema_client_exposure`, a registry row per
-- schema, and a schema with NO row keeps the platform's historical answer — exposed — so every
-- existing spec's provisioning result is unchanged, shape for shape.
--
-- WHY A REGISTRY AND NOT `pgrst.db_schemas`, WHICH WAS THE OBVIOUS CANDIDATE. Membership of
-- `pgrst.db_schemas` is the source of truth for PostgREST reachability (§6.2's fact one), and
-- reading it here would need no new object. It is the WRONG source of truth for GRANTS, and
-- that was measured rather than argued: on the branch, schemas `esign` (12 relations) and `hr`
-- (134 relations) hold `authenticated` table grants and are NOT in `pgrst.db_schemas`. Making
-- absence from that list mean "closed" would strip the client grants from every future table in
-- two live feature schemas — the opposite of shape-identical. A declaration has to be a
-- decision somebody wrote down, with a reason, not the shadow of a different decision.
--
-- WHAT NOW HONOURS IT — every place in the provisioning path that can hand a privilege to
-- PUBLIC, `anon`, `authenticated` or `service_role`, enumerated from the live bodies with
-- `grep -n 'grant\|revoke'` over `pg_get_functiondef` rather than from memory:
--
--   `iam.apply_table_grants`      the ONE funnel for table and column grants; every caller,
--                                 including `platform.create_entity_table` → `iam.apply_rls`,
--                                 reaches it. Closed ⇒ it revokes all four roles at table AND
--                                 column level, issues nothing, and says so with the remedy.
--   `iam._apply_rls_unchecked`    the single `grant select … to anon` that does NOT go through
--                                 that funnel (the `component_anon_read_via_public_parent`
--                                 lane). Closed ⇒ the pub_read POLICY is still created, the
--                                 GRANT is not, and the notice says the lane is inert.
--   `platform.provision`          door `grant execute …` (closed ⇒ the
--                                 `platform.client_callable_door` row is still written, the
--                                 EXECUTE grant is not), every created VIEW (revoked — a new
--                                 relation inherits the schema's default ACL), every created
--                                 FUNCTION (revoked — PostgreSQL grants EXECUTE to PUBLIC
--                                 implicitly, which is why four functions in `custom` read
--                                 `proacl IS NULL`), and the door proof, which now expects
--                                 `declared AND exposed` instead of `declared`.
--
-- `write_door: "single"` keeps meaning exactly what it means. The `platform.stamped_write_table`
-- row is still written, `iam.apply_table_grants` still reads it, and in an EXPOSED schema the
-- read-only client grant is still what it issues. In a closed schema there is no grant to
-- narrow, and `platform.provision`'s write-door proof — `authenticated` holds no INSERT, UPDATE
-- or DELETE — passes for the stronger reason.
--
-- AND IT PROVES ITSELF FROM THE CATALOGUE. `platform.provision` ends a provision into a closed
-- schema by running `platform.schema_exposure_violations(schema)` and REFUSING the whole
-- transaction if anything at all is reachable — schema USAGE, a relation ACL, a column ACL, a
-- default-privilege row, or a function's EXECUTE. That is the same shape as the door proof and
-- the write-door proof beside it, and for the same stated reason: a rule the generator followed
-- is worth nothing unless the catalogue agrees with it at the end of the transaction. It is
-- also what makes this a guard and not an instruction — a grant added to this function later,
-- or issued by a trigger it fires, refuses the provision instead of quietly reopening a store.
--
-- THE REHEARSAL ACT STAYS POSSIBLE, EXPLICIT AND REVERSIBLE. `branch-api.ts --expose <s>` now
-- DECLARES the exposure (it writes `client_exposed = true` with its reason) before it grants,
-- and the new `--unexpose <s>` declares it closed, revokes USAGE, every table, function and
-- sequence privilege and both default-privilege sets, and removes the schema from
-- `pgrst.db_schemas`. Exposure, grants and PostgREST membership move together in one verb
-- instead of drifting apart, and the provisioner reads the declaration rather than guessing.
--
-- WHAT LANDS ON PRODUCTION FROM THIS FILE: three new objects and three function bodies, and
-- no row at all. Until `w1_prov_closed_declares_custom_closed.sql` seeds one, the registry is
-- EMPTY and `platform.schema_is_client_exposed` answers `true` for every one of the 60 schemas and the three replaced bodies take their existing branch for
-- every existing spec. Rule 4's first exception — a security repair — is what admits the three
-- replacements; each carries its `-- based-on:` line and the runner refuses the file if any
-- live body has moved.
--
-- THE INVERSE: `migrations/inverse/w1_prov_the_provisioner_honours_declared_exposure_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- ── the declaration ───────────────────────────────────────────────────────────
create table if not exists platform.schema_client_exposure (
  schema_name    text primary key,
  client_exposed boolean     not null,
  reason         text        not null,
  declared_by    text        not null,
  declared_at    timestamptz not null default now()
);

comment on table platform.schema_client_exposure is
  'THE DECLARATION OF A SCHEMA''S EXPOSURE TO CLIENT ROLES (PUBLIC, anon, authenticated, service_role). The provisioner honours it: a schema declared client_exposed = false receives NO grant from any provisioning path — no table or column grant, no function EXECUTE, no door grant — and platform.provision refuses the transaction if the catalogue disagrees at the end of it. A schema with NO row keeps the platform''s historical answer, exposed, so an existing spec provisions exactly as it did before this registry existed.';
comment on column platform.schema_client_exposure.reason is
  'Why this schema is open or closed, in a sentence. It is printed in every refusal and every withheld-grant notice, so it is what the next person reads at 3 a.m.';

-- RLS on, zero policies: every client role is denied outright, and no REVOKE is needed to
-- make that true. Schema `platform` carries no `ALTER DEFAULT PRIVILEGES` row (the twenty that
-- do are admin, communication, crm, docproc, extend, files, hindsight, pdf, plan, podcast,
-- public, rag, research, scheduler, seo, ui, users, web, workbench and workflow), so a new
-- table born here inherits no client grant to revoke. A REVOKE would also be refused by the
-- additive allow-list, correctly: this file names production.
alter table platform.schema_client_exposure enable row level security;

-- ── reading it ────────────────────────────────────────────────────────────────
create or replace function platform.schema_is_client_exposed(p_schema text)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- NO ROW MEANS EXPOSED, AND THAT IS THE WHOLE COMPATIBILITY STORY. Fifty-nine schemas have
  -- no row, answer true, and provision exactly as they did before. Closure is a decision
  -- somebody wrote down with a reason, never an omission and never the shadow of PostgREST's
  -- schema list (`esign` and `hr` are absent from that list and legitimately granted).
  select coalesce((select e.client_exposed
                     from platform.schema_client_exposure e
                    where e.schema_name = p_schema), true);
$fn$;

comment on function platform.schema_is_client_exposed(text) is
  'True when schema p_schema may receive client-role grants from the provisioner. Reads platform.schema_client_exposure; a schema with no row is exposed.';

-- ── proving it, from the catalogue ────────────────────────────────────────────
create or replace function platform.schema_exposure_violations(p_schema text default null)
returns table (schema_name text, kind text, object_name text, detail text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- Every way a client role can hold something in a schema declared CLOSED. p_schema null
  -- means every closed schema. This is the check the remedy is written against and the check
  -- platform.provision runs on itself before it returns; it is positive — it returns the
  -- object and what is wrong with it — never an absence somebody has to interpret.
  with closed as (
    select e.schema_name
      from platform.schema_client_exposure e
     where not e.client_exposed
       and (p_schema is null or e.schema_name = p_schema)
  ),
  roles as (select unnest(array['anon','authenticated','service_role']) as rolname)
  select c.schema_name, 'schema-usage'::text, c.schema_name,
         format('role %s holds USAGE or CREATE on the schema', r.rolname)
    from closed c cross join roles r
   where has_schema_privilege(r.rolname, c.schema_name, 'USAGE')
      or has_schema_privilege(r.rolname, c.schema_name, 'CREATE')
  union all
  select c.schema_name, 'schema-usage'::text, c.schema_name,
         format('PUBLIC holds a schema privilege: %s', n.nspacl::text)
    from closed c join pg_namespace n on n.nspname = c.schema_name
   where n.nspacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'relation'::text, cl.relname,
         format('%s', cl.relacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
   where cl.relacl::text ~ '(anon|authenticated|service_role)=' or cl.relacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'column'::text, format('%s.%s', cl.relname, a.attname),
         format('%s', a.attacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
    join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
   where a.attacl::text ~ '(anon|authenticated|service_role)=' or a.attacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'default-privilege'::text, d.defaclobjtype::text,
         format('%s', d.defaclacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_default_acl d on d.defaclnamespace = n.oid
   where d.defaclacl::text ~ '(anon|authenticated|service_role)=' or d.defaclacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  -- A function with proacl NULL is not ungranted: PostgreSQL grants EXECUTE to PUBLIC
  -- implicitly at CREATE, which is why this asks has_function_privilege rather than reading
  -- the ACL text. It is how four functions in schema `custom` stayed callable after every
  -- visible grant had been revoked.
  select c.schema_name, 'function-execute'::text,
         format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
         format('role %s can EXECUTE', r.rolname)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_proc p on p.pronamespace = n.oid
   cross join roles r
   where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
   order by 1, 2, 3, 4;
$fn$;

comment on function platform.schema_exposure_violations(text) is
  'Every client-role privilege that still exists inside a schema declared CLOSED in platform.schema_client_exposure: schema USAGE/CREATE, relation and column ACLs, default-privilege rows, and function EXECUTE reachability (which catches the implicit PUBLIC grant a new function is born with). Empty means closed. platform.provision runs it on itself before it returns.';

-- ── the declaration itself is a SEPARATE FILE, and here is why ────────────────
-- The one row this campaign declares — `custom` is closed — is
-- `migrations/campaign/w1_prov_closed_declares_custom_closed.sql`. It is not here because the
-- additive allow-list admits an INSERT only into the eight registry tables it names, and
-- `platform.schema_client_exposure` is not one of them. Widening that allow-list unattended,
-- to make one of this lane's own files easier to land, is the move this campaign's rules exist
-- to prevent, so the row travels the sanctioned route instead: a chair step that prints its one
-- INSERT. On production this file is therefore inert until that row exists — the registry is
-- empty, every schema answers `exposed`, and all three replaced bodies behave exactly as they
-- do today. That ordering is deliberate and is the safe one.
