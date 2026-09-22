-- chair-step: this REPLACES the live bodies of platform.provision and platform.provision_validate — the one door every new table in the platform passes through — and rewrites the registries they read; it is never additive, never guarded by a campaign knob (a platform door must not depend on a campaign flag), and never unattended
--
-- W1-PROV — THE PROVISIONER LEARNS HASH PARTITIONING, THE SINGLE WRITE DOOR, AND THE ONE
--           BASE-CONTRACT COLUMN IT HAS BEEN ACCEPTING AND DISCARDING.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- Production's event trigger `provision_shape_guard` refuses any entity-shaped relation
-- created outside `platform.provision(spec)`. It is right to, and it is never disabled or
-- grandfathered around for new work. On 2026-09-17 it refused `custom.record`, and the
-- reason it could not simply be let through is that the provisioner CANNOT SAY what that
-- table is: read from production's own `pg_get_functiondef` the same day,
-- `platform.provision` is 517 lines carrying ZERO occurrences of `PARTITION`, ZERO of
-- `custom_fields`, and it emits `id uuid primary key` at line 113. So the door was narrower
-- than the shapes the platform already needs, and the answer is to widen the door rather
-- than to walk around it.
--
-- WHAT CHANGES, AND WHAT PROVABLY DOES NOT
-- ----------------------------------------
--  1. `partition: {"strategy":"hash","key":[...],"count":N}` — a NEW spec key. When it is
--     present the table is created `PARTITION BY HASH (<key>)` with `count` children in the
--     same transaction, and the primary key becomes `(<key>, id)` because PostgreSQL
--     requires the partition key inside every unique constraint. `count` is bounded 1…64.
--     Every unique index the spec asks for must contain the whole key or it is refused BY
--     NAME at `provision_validate`, so the refusal names the index instead of arriving as
--     an 0A000 out of the middle of the DDL.
--     🚨 THERE IS NO "EXISTING pg_partman FORM" TO PRESERVE. The build plan's §4.3 row says
--     `partition` is "accepted only as pg_partman-managed"; measured 2026-09-17 against the
--     live catalogue, the key exists in NO JSON schema row, in NO line of
--     `provision_validate` and in NO line of `provision`. It was a planned row that was
--     never built. `hash` is therefore the only strategy this file implements, and any
--     other value — `range`, `list`, `time`, `pg_partman` — is refused by name with that
--     said out loud, rather than being silently accepted and ignored.
--  2. `write_door: "single"` — a NEW spec key. It writes `platform.stamped_write_table`
--     BEFORE `iam.apply_rls` runs, so `iam.apply_table_grants` ITSELF issues the read-only
--     client grant. A lane measured on 2026-09-17 that `apply_rls` re-grants
--     `select, insert, update, delete` to `authenticated` immediately after certification;
--     revoking that afterwards would last exactly until the next regeneration, which is the
--     failure `apply_table_grants`'s own DD-248 comment describes in as many words. The
--     provisioner then PROVES the result: `has_table_privilege('authenticated', …)` must be
--     false for INSERT, UPDATE and DELETE or the whole transaction is refused.
--  3. `custom_fields: true` now EMITS `custom_fields jsonb not null default '{}'::jsonb`,
--     immediately after `metadata`, which is where REC-60 puts it. The key already existed
--     in the JSON schema and in the validator's stated-back answers; the builder recorded
--     the answer and emitted nothing. The platform's answer is still `false`, so no spec
--     that exists today changes at all — what ends is a spec key that silently did nothing.
--  4. `platform.provision` REBUILDS A TOKEN WHOSE RELATION IS GONE. `platform.provision_spec`
--     is append-only (a trigger refuses a DELETE: "the applied declaration IS the record"),
--     so the `unchanged` / `already carries a DIFFERENT declaration` check read a row that
--     outlives the table it describes: after any teardown the token could never be built
--     again, and rule 27's down-then-up loop was impossible for EVERY provisioned table.
--     The check now reads only a declaration whose relation still exists. Measured
--     read-only on production 2026-09-17, the whole blast radius is ONE token:
--     `platform.v_provision_spec_current` holds exactly one row, `provisioning_smoke`,
--     verb `deprovision`, relation ABSENT — a torn-down smoke test that this change makes
--     buildable again, which is the correct answer for it.
--  5. `iam.entity_read_kernel_fingerprint()` — A GUARD REPAIR, and the reason this file can
--     be rehearsed at all. The fingerprint aggregates sixteen access-kernel bodies
--     `order by n.nspname, p.proname, p.oid::text`. An OID is DATABASE-LOCAL: production's
--     three `iam.has_access_for_base` overloads sort 1700097, 1700098, 4422507 while the
--     branch's sort 109931, 56365, 56366 (as TEXT, '109931' < '56365'), so the same sixteen
--     bodies hash differently on the two databases and `provision_preflight` refuses EVERY
--     provisioning run on the rehearsal branch. Ordering by
--     `pg_get_function_identity_arguments(p.oid)` is stable everywhere. PROVEN, read-only,
--     2026-09-17: the repaired expression returns 2c20acc18f73ab979f0eb8f0e39c8c42 on
--     BOTH databases — byte-identical to the value production returns today and to the
--     constant `iam.entity_read_kernel_expected()` already holds. So on production this
--     changes the ORDER-BY and nothing else; the value it guards with does not move.
--
-- WHAT IS BYTE-IDENTICAL
-- ----------------------
-- A spec that declares neither `partition` nor `write_door` takes exactly the path it took
-- before: the same emitted DDL, the same `normalized_spec`, the same `spec_hash`. Neither
-- key is added to the validator's stated-back defaults ON PURPOSE — `spec_hash` is
-- `md5(normalized_spec::text)`, so a new answered key would change the hash of every
-- already-applied `platform.provision_spec` row (two on production today) and make
-- `provision()` answer "already carries a DIFFERENT declaration" for a token it in fact
-- carries unchanged. An idempotency break on a live door is not worth a stated-back
-- default; the answer is stated in the PLAN, which is not hashed.
--
-- WHY IT IS HEADER-LESS AND A CHAIR STEP
-- --------------------------------------
-- §6b.2's allow-list admits "a replacement that declares its `-- based-on:`" — but it ALSO
-- requires a guarded body to READ its guard, and making the platform's table-creation door
-- resolve a campaign knob would be a real defect: the provisioner is not campaign code.
-- The registry writes here (`platform.provision_rule_message`,
-- `platform.provision_schema`) are an INSERT into a table that is not on
-- `REGISTRY_INSERT_TABLES` and an UPDATE, which the allow-list has no shape for at all.
-- Both are correct refusals. So the whole change is what §4.9 calls a chair step: the
-- runner prints this reason and the file's ENTIRE body, refuses a non-TTY stdin at
-- `--target production`, and demands the filename typed back. The same bytes rehearse on
-- the branch with `--target branch`.
--
-- THE INVERSE: `migrations/inverse/w1_prov_provisioner_speaks_partitions_down.sql`, which
-- restores all four live bodies from this file's own `-- based-on:` sources.

--
-- THE BODIES THIS FILE WAS WRITTEN AGAINST (rule 6 / `pnpm db:based-on`). The two databases
-- carry byte-identical bodies for all four today — the sha256 of `pg_get_functiondef` was
-- compared across both, 2026-09-17 — so one file rehearses and lands from the same bytes.
-- based-on: platform.provision_base_columns() 116f53dc16d0d6dc4b6d323585a224f0958548e57a9d40a68cbd60852771aa58
-- based-on: iam.entity_read_kernel_fingerprint() 815aa1624b0b158ee3223d36e02d8eb67ad15f3cf413a2e63d75701c1cc895d1
-- based-on: platform.provision_validate(jsonb, text, uuid) 8e81b9f03b4b8f84aaa84a77f65e8f54b9bd500b6ef15f78416008a0f306d840
-- based-on: platform.provision(jsonb, text, uuid, text) 411b3f4fef5de4c9709ca0d252978b93302f0f2062f5565b93f3144949a93b42

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── 1. the refusal messages for the new rules (§4.8: field · why + rule id · legal · what to do)
insert into platform.provision_rule_message (rule_id, field_path, why, legal_values, otherwise) values
('partition.strategy.unsupported', 'partition.strategy',
 'the only partitioning strategy the provisioner implements is HASH on a tenant key. Time-based partitioning through pg_partman is written down in the build plan and has never been built: there is no code for it in provision_validate, none in provision, and no `partition` property in the spec''s JSON schema. Accepting the word and emitting nothing would be the silent failure this refusal exists to prevent',
 'hash',
 'Declare partition.strategy = "hash" with a NOT NULL key column, or drop `partition` from the call and provision an ordinary table. If this table genuinely needs a time-range partition set, that is an unbuilt capability and belongs in the table-provisioning register, not in a spec.'),
('partition.key.missing', 'partition.key',
 'a hash partition has to be hashed on something, and the column has to be NOT NULL on every row — a NULL in the key means a row with no partition',
 null,
 'Set partition.key to an array naming one or more NOT NULL columns; on a tenant-scoped table that is ["organization_id"], which is the reason the shape exists.'),
('partition.key.not_a_candidate', 'partition.key',
 'a hash partition key must be a column that exists and is NOT NULL on every row. The candidates are the base columns the builder always emits NOT NULL plus the declared fields that say not_null',
 null,
 'Name one of the listed columns, or add not_null: true to the field you meant and declare it again. `id` is deliberately not a candidate: hashing on it scatters one organization''s rows across every child and buys nothing.'),
('partition.count.out_of_range', 'partition.count',
 'the number of hash partitions is bounded. One is legal and means "partitioned, with room to split later"; above sixty-four the child tables cost more in planning, vacuum and catalogue size than the reads save',
 '1 … 64',
 'Pick a count inside the range and say in the spec''s description what you measured. Sixteen is what the record store measured as the best of 1 / 16 / 64 on its own predicates.'),
('partition.unique_index.missing_key', 'indexes[].columns',
 'PostgreSQL requires every unique constraint on a partitioned table to CONTAIN the partition key — a unique index that does not would have to be enforced across all children, and it refuses to create one. This is refused here, by name, rather than as an 0A000 out of the middle of the DDL',
 null,
 'Add the partition key column(s) to this index''s columns — on a tenant-scoped store the honest uniqueness is per organization anyway — or drop the unique flag. A `fields[].unique` on a partitioned table is always a single-column index and can never satisfy this, so declare it in indexes[] with the key included.'),
('write_door.unknown', 'write_door',
 'write_door says who may write these rows directly. `none` is the ordinary posture: the variant''s own grants apply. `single` means the client holds no direct INSERT, UPDATE or DELETE at all and every write goes through a declared door function',
 'none | single',
 'Use one of the two words, or leave write_door out entirely — the platform''s answer is `none`.'),
('write_door.no_door_declared', 'write_door',
 'write_door = single removes the client''s direct write privilege, so a table declaring it with no function in functions[] would be a table nothing can write at all — a dead end shipped deliberately',
 null,
 'Declare the write door in functions[] in the same spec, with its body, its client_access and an arg_checks entry for every entity id it takes; provision() writes its platform.client_callable_door row in the same transaction. If the writes really are server-only through an existing function, declare that function here without a body.'),
('write_door.proof_failed', 'write_door',
 'the provisioner declared write_door = single and then READ the catalogue back, and `authenticated` still holds a direct write privilege on the new table. A declaration the catalogue disagrees with is not a posture',
 null,
 'This is a provisioner bug, not a spec error: platform.stamped_write_table was written before iam.apply_rls and iam.apply_table_grants should have issued the read-only client grant. Report the token and this message; nothing was written, so there is nothing to undo.')
on conflict (rule_id) do nothing;

-- ── 2. the spec's JSON schema gains the two new keys ───────────────────────────
-- `additionalProperties: false`, so a key the schema does not know is refused by the shape
-- check before any of the rules above can speak. The restricted (lane B) schema is
-- deliberately NOT given them: PLAN §4.0's split, extended to two declarations that carry
-- no SQL text but are still the operator's — see the validator's own lane-B refusal.
update platform.provision_schema
   set schema = jsonb_set(
         jsonb_set(schema, '{properties,partition}', '{
           "type": "object",
           "properties": {
             "strategy": {"type": "string"},
             "key": {"type": "array", "items": {"type": "string"}},
             "count": {"type": "integer"}
           },
           "additionalProperties": false
         }'::jsonb, true),
         '{properties,write_door}', '{"type": "string"}'::jsonb, true),
       description = description,
       updated_at = now()
 where name = 'full';

-- ── 3. the candidate list a partition key is held to ───────────────────────────
create or replace function platform.provision_partition_key_candidates(p_spec jsonb)
returns text[]
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- A hash partition key must be NOT NULL on every row: a NULL in the key means a row with
  -- no partition at all. So the candidates are the base columns the builder always emits
  -- NOT NULL, plus the declared fields that say so. `id` is deliberately absent — hashing
  -- on it scatters one organization's rows across every child and buys nothing.
  select array(
    select c from (values ('organization_id'), ('created_at'), ('updated_at'), ('version')) v(c)
    union all
    select x.value->>'name'
      from jsonb_array_elements(coalesce(p_spec->'fields', '[]'::jsonb)) x
     where coalesce((x.value->>'not_null')::boolean, false)
       and nullif(btrim(coalesce(x.value->>'name', '')), '') is not null);
$fn$;

comment on function platform.provision_partition_key_candidates(jsonb) is
  'The columns a hash partition key may name: the NOT NULL base columns the builder always emits, plus the spec''s own not_null fields. Read by provision_validate so the refusal can print the legal values instead of only the illegal one.';

-- ── 4. the base contract names the column the builder may now emit ─────────────
create or replace function platform.provision_base_columns()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select array['id','organization_id','created_by','updated_by','created_at','updated_at',
                  'deleted_at','version','metadata','custom_fields','visibility','category_id']::text[]
$fn$;

-- ── 5. THE GUARD REPAIR: the fingerprint stops ordering by a database-local OID ─
create or replace function iam.entity_read_kernel_fingerprint()
returns text
language sql
stable
set search_path to 'pg_catalog'
as $fn$

  -- Ordered by IDENTITY, so the hash is stable across catalog reordering AND across
  -- databases. It used to end `order by … p.oid::text`, which is neither: an OID is
  -- assigned per database, so production's three iam.has_access_for_base overloads sorted
  -- 1700097/1700098/4422507 and the rehearsal branch's sorted 109931/56365/56366 (as TEXT),
  -- and the same sixteen bodies hashed differently on the two databases. The value this
  -- returns is unchanged on production: 2c20acc18f73ab979f0eb8f0e39c8c42, measured both
  -- ways, read-only, 2026-09-17.
  select md5(string_agg(p.prosrc, '|' order by n.nspname, p.proname,
                        pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','accessible_entity_ids'), ('iam','has_org_access_for'),
    ('files','has_access_for'), ('files','is_crawl_artifact'),
    ('files','crawl_site_conveys'),
    ('platform','entity_row_access_attrs'),
    ('public','user_can_read_via_library_grant'), ('public','library_is_open'),
    ('public','is_rulebook_curator'), ('public','is_pack_curator'),
    ('public','_edu_can_read_via_assignment'), ('public','has_permission_for'),
    ('public','is_org_admin_for'), ('public','user_can_read_data_store_via_grant')
  );
$fn$;

-- ── 6. the validator ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.provision_validate(p_spec jsonb, p_lane text DEFAULT 'full'::text, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f            jsonb[] := '{}'::jsonb[];
  n            jsonb;
  answered     text[]  := '{}'::text[];
  plan         jsonb[] := '{}'::jsonb[];
  v_lane       text    := lower(coalesce(p_lane, 'full'));
  v_restricted boolean;
  v_schema     text;
  v_table      text;
  v_token      text;
  v_type       text;
  v_variant    text;
  v_origin     text;
  v_access     jsonb;
  v_class      text;
  v_scope      text;
  v_vis        text;
  v_key        text;
  v_soft       boolean;
  v_err        text;
  v_item       jsonb;
  v_sub        jsonb;
  v_name       text;
  v_txt        text;
  v_names      text[] := '{}'::text[];
  v_fk_cols    text[] := '{}'::text[];
  v_all_cols   text[];
  v_i          int;
  v_uuid       uuid;
  v_defaults   jsonb;
  v_part       jsonb;
  v_pkey       text[];
  v_pcount     integer;
  v_icols      text[];
begin
  v_restricted := (v_lane = 'restricted');
  if v_lane not in ('full','restricted') then
    raise exception 'platform.provision_validate: p_lane must be ''full'' or ''restricted'' (got %)', p_lane;
  end if;

  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return jsonb_build_object(
      'ok', false, 'lane', v_lane,
      'findings', jsonb_build_array(platform.provision_finding(
        'shape.invalid', '(the whole spec)', null,
        format('the spec is %s, not a JSON object', coalesce(jsonb_typeof(p_spec), 'null')))),
      'normalized_spec', null, 'spec_hash', null, 'plan', '[]'::jsonb);
  end if;

  n := p_spec;

  -- W0-7 / PLAN §3.1: the preflight's refusals are findings here too, so the dry run
  -- says what provision() would refuse before anybody takes a lock.
  f := f || array(select x from jsonb_array_elements((platform.provision_preflight())->'findings') x);

  -- === shape ==============================================================
  for v_err in
    select e from unnest(extensions.jsonschema_validation_errors(
      (select s.schema from platform.provision_schema s where s.name = 'full')::json,
      p_spec::json)) e
  loop
    f := f || platform.provision_finding('shape.invalid', '(see below)', null, v_err);
  end loop;

  -- === lane B: the closed subset (PLAN §4.0) ==============================
  -- The GRANT on platform.provision_restricted is the boundary; these checks are
  -- what that entry point refuses with, so the refusal names the field.
  if v_restricted then
    if p_org_id is null then
      f := f || platform.provision_finding('lane.org_missing', 'p_org_id', null,
                  'no organization was passed with this call');
    end if;
    if p_spec ? 'checks' and jsonb_array_length(coalesce(p_spec->'checks','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'checks[]', null,
                  'table-level CHECK expressions are raw SQL');
    end if;
    if p_spec ? 'types' and jsonb_array_length(coalesce(p_spec->'types','[]'::jsonb)) > 0 then
      f := f || platform.provision_finding('lane.expression_refused', 'types[]', null,
                  'creating a type is lane A only — pick from the existing types listed by provision_options(''vocabularies'')');
    end if;
    if coalesce(p_spec->>'audit_class','entity') = 'machinery' then
      f := f || platform.provision_finding('lane.expression_refused', 'audit_class', null,
                  'audit_class = machinery');
    end if;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
      if v_item ? 'check' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].check', coalesce(v_item->>'name','?')), null, v_item->>'check');
      end if;
      if v_item ? 'generated' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('fields[%s].generated', coalesce(v_item->>'name','?')), null,
               'a generated column is a stored SQL expression');
      end if;
      if v_item ? 'default'
         and not platform.provision_default_menu_ok(v_item->'default', v_item->>'type') then
        f := f || platform.provision_finding('lane.default_menu',
               format('fields[%s].default', coalesce(v_item->>'name','?')), null,
               v_item->>'default');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
      if v_item ? 'where' then
        f := f || platform.provision_finding('lane.expression_refused', 'indexes[].where', null,
                    v_item->>'where');
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
      if v_item ? 'body' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].body', coalesce(v_item->>'name','?')), null,
               'a function body is SQL executed by a SECURITY DEFINER owned by postgres');
      end if;
      if lower(coalesce(v_item->>'security','invoker')) = 'definer' then
        f := f || platform.provision_finding('lane.expression_refused',
               format('functions[%s].security', coalesce(v_item->>'name','?')), null, 'definer');
      end if;
    end loop;
    if jsonb_array_length(coalesce(p_spec->'views','[]'::jsonb)) > 0 then
      for v_item in select value from jsonb_array_elements(p_spec->'views') loop
        if v_item ? 'definition' then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].definition', coalesce(v_item->>'name','?')), null,
                 'a view definition is raw SQL read by a postgres-owned relation');
        end if;
        if coalesce((v_item->>'security_invoker')::boolean, true) is false then
          f := f || platform.provision_finding('lane.expression_refused',
                 format('views[%s].security_invoker', coalesce(v_item->>'name','?')), null, 'false');
        end if;
      end loop;
    end if;
    -- PLAN §4.0's line, for the two declarations that are not SQL text but are still the
    -- operator's: `partition` multiplies the relation count of one table by up to 64, and
    -- `write_door` decides who may write a tenant's own rows. The platform's answer for
    -- lane B is the unpartitioned table with the variant's ordinary grants.
    if p_spec ? 'partition' then
      f := f || platform.provision_finding('lane.expression_refused', 'partition', null,
                  'partitioning is a physical storage decision — lane A only');
    end if;
    if p_spec ? 'write_door' then
      f := f || platform.provision_finding('lane.expression_refused', 'write_door', null,
                  'the write-door posture decides who may write these rows — lane A only');
    end if;
  end if;

  -- === identity ===========================================================
  v_schema := p_spec->>'schema';
  v_table  := p_spec->>'table';
  v_token  := p_spec->>'token';

  if v_schema is null then
    f := f || platform.provision_finding('identity.schema.missing');
  elsif v_schema in ('public','graveyard','information_schema')
        or v_schema like 'pg\_%'
        or v_schema in ('auth','storage','realtime','vault','extensions','supabase_functions',
                        'supabase_migrations','cron','net','pgsodium','pgsodium_masks',
                        'graphql','graphql_public','_analytics','_realtime') then
    f := f || platform.provision_finding('identity.schema.forbidden', 'schema', null, v_schema);
  elsif not exists (select 1 from pg_namespace where nspname = v_schema) then
    f := f || platform.provision_finding('identity.schema.unknown', 'schema', null, v_schema);
  elsif not exists (select 1 from platform.provision_generate_target t
                     where t.schema_name = v_schema
                       and t.orm_target and t.types_target) then
    -- THE PARITY RULE: provisionable only if the repository can generate for it.
    -- Checked on BOTH lanes and before the grant check, because a schema the repo
    -- cannot represent is illegal for everyone, not merely ungranted to someone.
    f := f || platform.provision_finding('identity.schema.not_generable', 'schema',
           coalesce((select string_agg(t.schema_name, ' | ' order by t.schema_name)
                       from platform.provision_generate_target t
                      where t.orm_target and t.types_target),
                    '(the repo has published no generate targets at all — run scripts/check_provision_generate_targets.py --fix)'),
           format('%s (ORM model target: %s; frontend type target: %s)', v_schema,
                  coalesce((select t.orm_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all'),
                  coalesce((select t.types_target::text from platform.provision_generate_target t
                             where t.schema_name = v_schema), 'no row — the repo does not list it at all')));
  elsif v_restricted and p_org_id is not null
        and not exists (select 1 from platform.provision_grant g
                         where g.organization_id = p_org_id and g.schema_name = v_schema) then
    f := f || platform.provision_finding('lane.schema_not_granted', 'schema',
           coalesce((select string_agg(g.schema_name, ' | ' order by g.schema_name)
                       from platform.provision_grant g where g.organization_id = p_org_id),
                    '(this organization holds no schema yet)'),
           v_schema);
  end if;

  if v_table is null then
    f := f || platform.provision_finding('identity.table.missing');
  elsif not platform.provision_identifier_ok(v_table) then
    f := f || platform.provision_finding('identity.table.name', 'table', null, v_table);
  else
    if v_schema is not null and to_regclass(format('%I.%I', v_schema, v_table)) is not null then
      f := f || platform.provision_finding('identity.token.taken', 'table', null,
             format('%s.%s already exists', v_schema, v_table));
    end if;
    -- §1a: a repeated table name must mean the same ROLE.
    if exists (select 1 from platform.entity_types e
                where e.table_name = v_table and e.schema_name is distinct from v_schema) then
      if p_spec->'same_role_as'->>'token' is null
         or btrim(coalesce(p_spec->'same_role_as'->>'reason','')) = '' then
        f := f || platform.provision_finding('identity.table.collision', 'table',
               null,
               format('%s already names %s', v_table,
                 (select string_agg(e.schema_name||'.'||e.table_name||' ('||e.token||')', ', ' order by e.token)
                    from platform.entity_types e where e.table_name = v_table)));
      elsif not exists (select 1 from platform.entity_types e
                         where e.token = p_spec->'same_role_as'->>'token') then
        f := f || platform.provision_finding('identity.same_role_as.unknown', 'same_role_as.token',
               null, p_spec->'same_role_as'->>'token');
      end if;
    end if;
  end if;

  if v_token is null then
    f := f || platform.provision_finding('identity.token.missing');
  elsif not platform.provision_identifier_ok(v_token) then
    f := f || platform.provision_finding('identity.table.name', 'token', null, v_token);
  elsif exists (select 1 from platform.entity_types e where e.token = v_token) then
    f := f || platform.provision_finding('identity.token.taken', 'token', null, v_token);
  end if;

  if btrim(coalesce(p_spec->>'label','')) = '' then
    f := f || platform.provision_finding('identity.label.missing');
  end if;
  if btrim(coalesce(p_spec->>'description','')) = '' then
    f := f || platform.provision_finding('identity.description.missing');
  end if;

  -- === type and origin ====================================================
  v_type := p_spec->>'type';
  if v_type is null then
    f := f || platform.provision_finding('type.missing', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated');
  elsif v_type not in ('entity','detail','reference','ledger','restricted','system','deprecated') then
    f := f || platform.provision_finding('type.unknown', 'type',
           'entity | detail | reference | ledger | restricted | system | deprecated', v_type);
  elsif v_type = 'deprecated' then
    f := f || platform.provision_finding('type.not_provisionable', 'type', null, v_type);
  elsif v_type = 'system' then
    f := f || platform.provision_finding('type.self_declared_machinery', 'type',
           'entity | detail | reference | ledger | restricted', v_type);
  end if;

  v_variant := case v_type
                 when 'entity'     then 'entity'
                 when 'detail'     then 'component'
                 when 'reference'  then 'system'
                 when 'ledger'     then 'ledger'
                 when 'restricted' then 'restricted'
                 else null end;

  v_origin := p_spec->>'origin';
  if v_origin is null then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom');
  elsif v_origin = 'custom' then
    f := f || platform.provision_finding('origin.custom_unbuilt', 'origin', 'standard', 'custom');
  elsif v_origin <> 'standard' then
    f := f || platform.provision_finding('origin.missing', 'origin', 'standard | custom', v_origin);
  end if;

  -- === the access block — no silent defaults ==============================
  v_access := p_spec->'access';
  if v_access is null or jsonb_typeof(v_access) <> 'object' then
    f := f || platform.provision_finding('access.missing');
    v_access := '{}'::jsonb;
  end if;
  v_class := v_access->>'data_class';
  v_scope := v_access->>'default_list_scope';
  v_vis   := v_access->>'visibility';
  v_key   := v_access->>'key_column';

  if v_class is not null
     and v_class not in ('private','confidential','organization','public') then
    f := f || platform.provision_finding('access.data_class.missing', 'access.data_class',
           'private | confidential | organization | public', v_class);
    v_class := null;
  end if;

  if v_type = 'detail' then
    if v_class is not null then
      f := f || platform.provision_finding('access.data_class.forbidden_for_detail',
             'access.data_class', null, v_class);
    end if;
    if v_scope is not null then
      f := f || platform.provision_finding('access.default_list_scope.forbidden',
             'access.default_list_scope', null, v_scope);
    end if;
    if v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    end if;
    if p_spec->'component_anon_read_via_public_parent' is null then
      f := f || platform.provision_finding('registration.component_anon_read.missing');
    end if;
  elsif v_type in ('entity','reference','ledger','restricted') then
    if v_class is null then
      if v_type = 'ledger' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', '(not set), and type = ''ledger''');
      elsif v_key = 'user_id' then
        -- The personal shape: the live CHECK admits NULL or private, so NULL is a
        -- legal answer here and there is nothing to refuse.
        null;
      else
        f := f || platform.provision_finding('access.data_class.missing');
      end if;
    else
      if v_type = 'ledger' and v_class = 'private' then
        f := f || platform.provision_finding('access.data_class.ledger_private', 'access.data_class',
               'confidential | organization | public', 'private');
      end if;
      if v_key = 'user_id' and v_class <> 'private' then
        f := f || platform.provision_finding('access.data_class.personal_not_private',
               'access.data_class', 'private (or omit it)', v_class);
      end if;
      if btrim(coalesce(v_access->>'data_class_reason','')) = '' then
        f := f || platform.provision_finding('access.data_class_reason.missing');
      end if;
    end if;

    if v_type = 'ledger' then
      if v_scope is not null then
        f := f || platform.provision_finding('access.default_list_scope.forbidden',
               'access.default_list_scope', null, v_scope);
      end if;
    elsif v_scope is null then
      f := f || platform.provision_finding('access.default_list_scope.missing');
    elsif v_scope not in ('mine','organization') then
      f := f || platform.provision_finding('access.default_list_scope.missing',
             'access.default_list_scope', 'mine | organization', v_scope);
    end if;

    if v_type = 'restricted' and v_vis is not null then
      f := f || platform.provision_finding('access.visibility.forbidden', 'access.visibility', null, v_vis);
    elsif v_type = 'reference' and v_vis is null then
      f := f || platform.provision_finding('access.visibility.required');
    elsif v_vis is not null and v_vis not in ('personal','internal','link','public') then
      f := f || platform.provision_finding('access.visibility.required', 'access.visibility',
             'personal | internal | link | public', v_vis);
    elsif v_vis = 'personal' and btrim(coalesce(v_access->>'visibility_reason','')) = '' then
      f := f || platform.provision_finding('access.visibility.reason_missing');
    end if;

    if v_type = 'entity' then
      if v_key is null then
        f := f || platform.provision_finding('access.key_column.missing');
      elsif v_key not in ('created_by','user_id') then
        f := f || platform.provision_finding('access.key_column.missing', 'access.key_column',
               'created_by | user_id', v_key);
      end if;
      if v_key = 'user_id' then v_variant := 'personal'; end if;
    end if;
  end if;

  -- === parents ============================================================
  if v_type = 'detail' then
    if jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('parents.missing');
    end if;
  elsif jsonb_array_length(coalesce(p_spec->'parents','[]'::jsonb)) > 0 then
    f := f || platform.provision_finding('parents.forbidden', 'parents', null, v_type);
  end if;

  -- === fields =============================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := v_item->>'name';
    if not platform.provision_identifier_ok(v_name) then
      f := f || platform.provision_finding('fields.name.invalid', format('fields[%s].name', v_i), null, v_name);
      continue;
    end if;
    if v_name = any (platform.provision_base_columns()) then
      f := f || platform.provision_finding('fields.name.base_collision',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    if v_name = any (v_names) then
      f := f || platform.provision_finding('fields.name.duplicate',
             format('fields[%s].name', v_i), null, v_name);
    end if;
    v_names := v_names || v_name;

    if btrim(coalesce(v_item->>'type','')) = '' then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i));
    elsif to_regtype(v_item->>'type') is null then
      f := f || platform.provision_finding('fields.type.missing', format('fields[%s].type', v_i),
             null, format('%L is not a type this database has', v_item->>'type'));
    end if;

    if v_item ? 'references' then
      v_fk_cols := v_fk_cols || v_name;
      v_txt := v_item->'references'->>'on_delete';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i));
      elsif lower(v_txt) not in ('cascade','restrict','set_null','no_action') then
        f := f || platform.provision_finding('fields.references.on_delete.missing',
               format('fields[%s].references.on_delete', v_i),
               'cascade | restrict | set_null | no_action', v_txt);
      end if;
      v_txt := v_item->'references'->>'target';
      if v_txt is null then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, '(not set)');
      elsif not exists (select 1 from platform.entity_types e where e.token = v_txt)
            and (position('.' in v_txt) = 0 or to_regclass(v_txt) is null) then
        f := f || platform.provision_finding('fields.references.target.unknown',
               format('fields[%s].references.target', v_i), null, v_txt);
      elsif v_restricted and p_org_id is not null
            and exists (select 1 from platform.entity_types e
                         where e.token = v_txt and e.rls_variant <> 'system'
                           and not exists (select 1 from platform.provision_grant g
                                            where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
        f := f || platform.provision_finding('parents.cross_tenant',
               format('fields[%s].references.target', v_i), null, v_txt);
      end if;

      v_txt := v_item->>'relationship_kind';
      if v_txt is null then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i));
      elsif v_txt not in ('composition','reference','lookup') then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_kind', v_i), 'composition | reference | lookup', v_txt);
      elsif btrim(coalesce(v_item->>'relationship_note','')) = '' then
        f := f || platform.provision_finding('fields.relationship_kind.missing',
               format('fields[%s].relationship_note', v_i), null,
               'the kind is declared but the one-line note is empty');
      end if;
    end if;

    if v_item ? 'generated'
       and coalesce((v_item->'generated'->>'stored')::boolean, false) is not true then
      f := f || platform.provision_finding('fields.generated.stored',
             format('fields[%s].generated.stored', v_i), 'true', v_item->'generated'->>'stored');
    end if;
  end loop;

  v_all_cols := v_names || platform.provision_base_columns();

  -- The personal shape keys every row on user_id; iam.verify_canonical FAILs
  -- `legacy_owner_col` ("personal variant requires user_id") without the column.
  if v_type = 'entity' and v_key = 'user_id' and not ('user_id' = any (v_names)) then
    f := f || platform.provision_finding('access.key_column.user_id_missing', 'fields', null,
           'access.key_column = ''user_id'' but no field is named user_id');
  end if;

  -- parent FK columns must be columns this spec declares
  v_i := 0;
  for v_txt in select value #>> '{}' from jsonb_array_elements(coalesce(p_spec->'parents','[]'::jsonb)) loop
    v_i := v_i + 1;
    if position(':' in v_txt) = 0
       or btrim(split_part(v_txt, ':', 1)) = '' or btrim(split_part(v_txt, ':', 2)) = '' then
      f := f || platform.provision_finding('parents.shape', format('parents[%s]', v_i), null, v_txt);
      continue;
    end if;
    v_name := btrim(split_part(v_txt, ':', 1));
    if not exists (select 1 from platform.entity_types e where e.token = v_name) then
      f := f || platform.provision_finding('parents.unknown_token', format('parents[%s]', v_i), null, v_name);
    elsif v_restricted and p_org_id is not null
          and exists (select 1 from platform.entity_types e
                       where e.token = v_name and e.rls_variant <> 'system'
                         and not exists (select 1 from platform.provision_grant g
                                          where g.organization_id = p_org_id and g.schema_name = e.schema_name)) then
      f := f || platform.provision_finding('parents.cross_tenant', format('parents[%s]', v_i), null, v_name);
    end if;
    if btrim(split_part(v_txt, ':', 2)) <> all (v_names) then
      f := f || platform.provision_finding('parents.unknown_column', format('parents[%s]', v_i), null,
             btrim(split_part(v_txt, ':', 2)));
    end if;
  end loop;

  -- === registration =======================================================
  v_txt := p_spec->>'taxonomy_node_id';
  if v_txt is null then
    f := f || platform.provision_finding('registration.taxonomy_node_id.missing');
  else
    begin
      v_uuid := v_txt::uuid;
      if not exists (select 1 from platform.taxonomy_node t where t.id = v_uuid) then
        f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
      end if;
    exception when others then
      f := f || platform.provision_finding('registration.taxonomy_node_id.unknown', 'taxonomy_node_id', null, v_txt);
    end;
  end if;

  if btrim(coalesce(p_spec->>'category_label','')) = '' then
    f := f || platform.provision_finding('registration.category_label.missing');
  end if;

  if coalesce((p_spec->>'is_listed')::boolean, false) then
    v_txt := p_spec->>'title_column';
    if v_txt is null then
      f := f || platform.provision_finding('registration.title_column.missing');
    elsif v_txt <> all (v_all_cols) then
      f := f || platform.provision_finding('registration.title_column.unknown', 'title_column',
             array_to_string(v_all_cols, ' | '), v_txt);
    end if;
  end if;

  if p_spec ? 'content_role'
     and p_spec->>'content_role' <> all (platform.provision_live_vocabulary('content_role')) then
    f := f || platform.provision_finding('registration.content_role.unknown', 'content_role',
           array_to_string(platform.provision_live_vocabulary('content_role'), ' | '), p_spec->>'content_role');
  end if;

  if coalesce(p_spec->>'relation_kind','table') = 'projection'
     and (p_spec->>'projects_token' is null or coalesce(p_spec->>'audit_class','entity') <> 'machinery') then
    f := f || platform.provision_finding('registration.relation_kind.projection');
  end if;

  if coalesce(p_spec->>'audit_class','entity') = 'machinery'
     and btrim(coalesce(p_spec->>'audit_class_reason','')) = '' then
    f := f || platform.provision_finding('registration.audit_class.reason_missing');
  end if;

  -- === sharing ============================================================
  if not (p_spec ? 'sharing') then
    f := f || platform.provision_finding('sharing.missing');
  elsif jsonb_typeof(p_spec->'sharing') = 'object' then
    if btrim(coalesce(p_spec->'sharing'->>'display_label','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.display_label', null,
             'the sharing object carries no display_label');
    end if;
    if btrim(coalesce(p_spec->'sharing'->>'url_path_template','')) = '' then
      f := f || platform.provision_finding('sharing.missing', 'sharing.url_path_template', null,
             'the sharing object carries no url_path_template');
    end if;
    -- ATTACK #20: strip-client-excluded-columns.ts removes an excluded column from
    -- database.types.ts, so the share renderer would reference a field the types
    -- say does not exist.
    for v_txt in
      select x from unnest(coalesce(
        array(select jsonb_array_elements_text(p_spec->'sharing'->'public_columns')), '{}'::text[])) x
      where x = any (coalesce(array(select jsonb_array_elements_text(p_spec->'client_excluded_columns')), '{}'::text[]))
    loop
      f := f || platform.provision_finding('sharing.excluded_and_public', 'sharing.public_columns', null, v_txt);
    end loop;
  end if;

  -- === indexes ============================================================
  v_soft := coalesce((p_spec->>'soft_delete')::boolean, v_type is distinct from 'ledger');
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
    v_i := v_i + 1;
    if v_item ? 'method'
       and lower(v_item->>'method') <> all (platform.provision_live_vocabulary('index_method')) then
      f := f || platform.provision_finding('indexes.method.unknown', format('indexes[%s].method', v_i),
             array_to_string(platform.provision_live_vocabulary('index_method'), ' | '), v_item->>'method');
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'columns','[]'::jsonb)) loop
      if v_txt <> all (v_all_cols) then
        f := f || platform.provision_finding('registration.title_column.unknown',
               format('indexes[%s].columns', v_i), array_to_string(v_all_cols, ' | '), v_txt);
      end if;
    end loop;
  end loop;

  -- === partition ==========================================================
  -- PARTITIONING IS A PLATFORM PRIMITIVE, NOT ONE STORE'S SPECIAL CASE. A table that will
  -- hold every organization's rows is partitioned on the tenant key so a list read touches
  -- one child and a cross-organization maintenance read never scans the whole table.
  --
  -- 🚨 THE PRIMARY KEY IS A CONSEQUENCE, NOT A SECOND CHOICE. PostgreSQL requires every
  -- unique constraint on a partitioned table to CONTAIN the partition key, so the base
  -- contract's `id` alone cannot be the key and the builder emits `(<key columns>, id)`.
  -- Every unique index the spec asks for is held to the same rule HERE, by name, so the
  -- refusal names the index instead of arriving as a 0A000 out of the middle of the DDL.
  v_part := p_spec->'partition';
  if v_part is not null and jsonb_typeof(v_part) = 'object' then
    if coalesce(v_part->>'strategy', '') <> 'hash' then
      f := f || platform.provision_finding('partition.strategy.unsupported', 'partition.strategy',
             'hash', coalesce(nullif(v_part->>'strategy', ''), '(not set)'));
    end if;

    v_pkey := coalesce(array(select jsonb_array_elements_text(v_part->'key')), '{}'::text[]);
    if cardinality(v_pkey) = 0 then
      f := f || platform.provision_finding('partition.key.missing', 'partition.key',
             array_to_string(platform.provision_partition_key_candidates(p_spec), ' | '));
    else
      foreach v_txt in array v_pkey loop
        if v_txt <> all (platform.provision_partition_key_candidates(p_spec)) then
          f := f || platform.provision_finding('partition.key.not_a_candidate', 'partition.key',
                 array_to_string(platform.provision_partition_key_candidates(p_spec), ' | '), v_txt);
        end if;
      end loop;
    end if;

    begin
      v_pcount := (v_part->>'count')::integer;
    exception when others then
      v_pcount := null;
    end;
    if v_pcount is null or v_pcount < 1 or v_pcount > 64 then
      f := f || platform.provision_finding('partition.count.out_of_range', 'partition.count',
             '1 … 64', coalesce(nullif(v_part->>'count', ''), '(not set)'));
    end if;

    if cardinality(v_pkey) > 0 then
      v_i := 0;
      for v_item in select value from jsonb_array_elements(coalesce(p_spec->'indexes','[]'::jsonb)) loop
        v_i := v_i + 1;
        if coalesce((v_item->>'unique')::boolean, false) then
          v_icols := coalesce(array(select jsonb_array_elements_text(v_item->'columns')), '{}'::text[]);
          foreach v_txt in array v_pkey loop
            if v_txt <> all (v_icols) then
              f := f || platform.provision_finding('partition.unique_index.missing_key',
                     format('indexes[%s].columns', v_i), array_to_string(v_pkey, ' | '),
                     format('[%s] — %L is not in it', array_to_string(v_icols, ', '), v_txt));
            end if;
          end loop;
        end if;
      end loop;
      for v_item in select value from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) loop
        if coalesce((v_item->>'unique')::boolean, false) then
          f := f || platform.provision_finding('partition.unique_index.missing_key',
                 format('fields[%s].unique', coalesce(v_item->>'name','?')),
                 array_to_string(v_pkey, ' | '),
                 format('a single-column unique index on %L', coalesce(v_item->>'name','?')));
        end if;
      end loop;
    end if;
  elsif v_part is not null then
    f := f || platform.provision_finding('partition.strategy.unsupported', 'partition',
           'an object, e.g. {"strategy":"hash","key":["organization_id"],"count":16}',
           format('a JSON %s', jsonb_typeof(v_part)));
  end if;

  -- === write door =========================================================
  -- DOOR-N-1's law, as a spec answer: `single` means `authenticated` holds no direct
  -- INSERT, UPDATE or DELETE on this table and every write goes through a declared door.
  v_txt := coalesce(p_spec->>'write_door', 'none');
  if v_txt not in ('none', 'single') then
    f := f || platform.provision_finding('write_door.unknown', 'write_door', 'none | single', v_txt);
  elsif v_txt = 'single'
        and jsonb_array_length(coalesce(p_spec->'functions','[]'::jsonb)) = 0 then
    f := f || platform.provision_finding('write_door.no_door_declared', 'write_door', null,
           'single, with functions[] empty');
  end if;

  -- === association types ==================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'association_types','[]'::jsonb)) loop
    v_i := v_i + 1;
    foreach v_txt in array array['source_type','target_type'] loop
      v_name := v_item->>v_txt;
      if v_name is not null and v_name <> coalesce(v_token,'')
         and not exists (select 1 from platform.entity_types e where e.token = v_name) then
        f := f || platform.provision_finding('association_types.unknown_token',
               format('association_types[%s].%s', v_i, v_txt), null, v_name);
      end if;
    end loop;
    if (v_item->'label') is null or jsonb_typeof(v_item->'label') = 'null' then
      if btrim(coalesce(v_item->>'notes','')) = '' then
        f := f || platform.provision_finding('association_types.wildcard_reason',
               format('association_types[%s].label', v_i), null, 'null (a wildcard for the whole pair)');
      end if;
    end if;
  end loop;

  -- === functions ==========================================================
  v_i := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'functions','[]'::jsonb)) loop
    v_i := v_i + 1;
    v_name := coalesce(v_item->>'name', format('#%s', v_i));
    if not v_restricted and btrim(coalesce(v_item->>'body','')) = '' then
      f := f || platform.provision_finding('functions.body.missing', format('functions[%s].body', v_name));
    end if;
    v_txt := v_item->>'client_access';
    if v_txt is null then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name));
    elsif v_txt not in ('anonymous','signed_in','server_only') then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].client_access', v_name),
             'anonymous | signed_in | server_only', v_txt);
    elsif v_txt = 'server_only' then
      if length(btrim(coalesce(v_item->>'non_client_lane',''))) < 40 then
        f := f || platform.provision_finding('functions.non_client_lane.missing',
               format('functions[%s].non_client_lane', v_name),
               'at least 40 characters (the live CHECK door_non_client_lane_is_declared)',
               coalesce(v_item->>'non_client_lane','(not set)'));
      end if;
    elsif v_txt = 'anonymous' and length(btrim(coalesce(v_item->>'anonymous_purpose',''))) < 40 then
      f := f || platform.provision_finding('functions.client_access.missing',
             format('functions[%s].anonymous_purpose', v_name),
             'at least 40 characters (the live CHECK door_anonymous_purpose_is_declared)',
             coalesce(v_item->>'anonymous_purpose','(not set)'));
    end if;
    if btrim(coalesce(v_item->>'reason','')) = '' then
      f := f || platform.provision_finding('functions.reason.missing', format('functions[%s].reason', v_name));
    end if;
    -- lessons ledger 23 + 27: a door is declared per ARGUMENT, and NULL is an argument.
    -- An entry with no body declares a door for a function that ALREADY exists (the
    -- only kind lane B may declare), so its arguments are read from the catalogue,
    -- never from text the caller wrote.
    v_txt := v_item->>'args';
    if not (v_item ? 'body') then
      select pg_get_function_arguments(p.oid) into v_txt
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = v_schema and p.proname = v_item->>'name'
       order by p.oid desc limit 1;
      if not found then
        if v_restricted then
          f := f || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', coalesce(v_item->>'name','?')), null,
                 format('%s.%s does not exist', coalesce(v_schema,'?'), coalesce(v_item->>'name','?')));
        end if;
        v_txt := v_item->>'args';
      end if;
    end if;
    f := f || platform.provision_arg_check_findings(coalesce(v_item->>'name','?'), v_txt, v_item->'arg_checks');
  end loop;

  -- === views ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'views','[]'::jsonb)) loop
    v_name := coalesce(v_item->>'name','?');
    if not v_restricted and btrim(coalesce(v_item->>'definition','')) = '' then
      f := f || platform.provision_finding('views.definition.missing', format('views[%s].definition', v_name));
    end if;
    if coalesce((v_item->>'security_invoker')::boolean, true) is false
       and btrim(coalesce(v_item->>'security_invoker_reason','')) = '' then
      f := f || platform.provision_finding('views.security_invoker.exemption',
             format('views[%s].security_invoker', v_name), 'true', 'false');
    end if;
    if coalesce((v_item->>'registered_as_projection')::boolean, false)
       and jsonb_array_length(coalesce(v_item->'primary_key','[]'::jsonb)) = 0 then
      f := f || platform.provision_finding('views.projection.primary_key', format('views[%s].primary_key', v_name));
    end if;
  end loop;

  -- === knobs ==============================================================
  for v_item in select value from jsonb_array_elements(coalesce(p_spec->'knobs','[]'::jsonb)) loop
    v_name := format('%s/%s', coalesce(v_item->>'feature','?'), coalesce(v_item->>'key','?'));
    v_txt := v_item->>'value_type';
    if v_txt is null or v_txt <> all (platform.provision_live_vocabulary('knob_value_type')) then
      f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].value_type', v_name),
             array_to_string(platform.provision_live_vocabulary('knob_value_type'), ' | '),
             coalesce(v_txt,'(not set)'));
    elsif v_txt = 'secret' and (jsonb_typeof(coalesce(v_item->'value','null'::jsonb)) <> 'object'
                                or not (v_item->'value' ? 'vault_key')) then
      f := f || platform.provision_finding('knobs.secret_shape', format('knobs[%s].value', v_name));
    elsif v_txt = 'json' and (v_item ? 'min_value' or v_item ? 'max_value' or v_item ? 'allowed_values') then
      f := f || platform.provision_finding('knobs.json_range', format('knobs[%s].min_value', v_name));
    end if;
    for v_txt in select jsonb_array_elements_text(coalesce(v_item->'overridable_by','[]'::jsonb)) loop
      if v_txt <> all (platform.provision_live_vocabulary('knob_scope_kind')) then
        f := f || platform.provision_finding('knobs.overridable_by.unknown',
               format('knobs[%s].overridable_by', v_name),
               array_to_string(platform.provision_live_vocabulary('knob_scope_kind'), ' | '), v_txt);
      end if;
    end loop;
    foreach v_txt in array array['override_direction','propagation','set_by'] loop
      if v_item ? v_txt
         and v_item->>v_txt <> all (platform.provision_live_vocabulary('knob_'||v_txt)) then
        f := f || platform.provision_finding('knobs.value_type.unknown', format('knobs[%s].%s', v_name, v_txt),
               array_to_string(platform.provision_live_vocabulary('knob_'||v_txt), ' | '), v_item->>v_txt);
      end if;
    end loop;
  end loop;

  -- === the platform's answers, STATED BACK (§4, the 15 silent columns) =====
  v_defaults := jsonb_build_object(
    'versioned', false,
    'soft_delete', (v_type is distinct from 'ledger'),
    'category', false,
    'gin_jsonb', exists (select 1 from jsonb_array_elements(coalesce(p_spec->'fields','[]'::jsonb)) x
                          where lower(coalesce(x.value->>'type','')) = 'jsonb'),
    'realtime', false,
    'content_kinds', '[]'::jsonb,
    'custom_fields', false,
    'is_listed', false,
    'relation_kind', 'table',
    'audit_class', 'entity',
    'version_store', 'history',
    'client_read_only', false,
    'reference_pickable', false,
    'agent_writable', false,
    'confirmation_enabled', false,
    'indexes', '[]'::jsonb,
    'fields', '[]'::jsonb,
    'checks', '[]'::jsonb,
    'types', '[]'::jsonb,
    'functions', '[]'::jsonb,
    'views', '[]'::jsonb,
    'knobs', '[]'::jsonb,
    'association_types', '[]'::jsonb,
    'parents', '[]'::jsonb,
    'client_excluded_columns', '[]'::jsonb)
  -- lesson 19: the 15 columns nobody was told about. Each value below IS the live
  -- column default, so nothing changes behaviourally -- only the silence ends.
  || jsonb_build_object(
    'base_tier', 1,
    'is_module', false,
    'default_members_can_add', true,
    'default_needs_approval', false,
    'default_scopeable', true,
    'default_auto_ingest', false,
    'allow_preview', true,
    'reference_candidate_predicates', '{}'::jsonb,
    'governed_columns', null,
    'retention_owner_column', null,
    'user_artifact_kind', null,
    'reference_category', null,
    'agent_write_notes', null,
    'lifecycle', '{"enlisted": false, "hot_days": null}'::jsonb);

  for v_name, v_sub in select key, value from jsonb_each(v_defaults) loop
    if not (n ? v_name) then
      n := n || jsonb_build_object(v_name, v_sub);
      answered := answered || v_name;
    end if;
  end loop;

  -- A unique index on a soft-deletable table is made PARTIAL on deleted_at IS NULL
  -- (DD-121). Stated back rather than assumed; omit it only with a written reason.
  if v_soft then
    n := jsonb_set(n, '{indexes}', coalesce((
      select jsonb_agg(
        case when coalesce((ix.value->>'unique')::boolean, false)
                  and not (ix.value ? 'where')
                  and not (ix.value ? 'where_omitted_reason')
             then ix.value || jsonb_build_object('where', 'deleted_at IS NULL')
             else ix.value end)
        from jsonb_array_elements(n->'indexes') ix), '[]'::jsonb));
  end if;

  -- The personal shape with no class: the live CHECK admits NULL, but iam.apply_rls
  -- refuses an unset class (DD-137b) and iam.verify_canonical FAILs a personal token
  -- that is not `private` (§3.1 derivation one). There is exactly one legal value, so
  -- it is the platform's answer, stated back — never a 23502 from inside apply_rls.
  if v_type = 'entity' and v_key = 'user_id' and v_class is null then
    n := jsonb_set(n, '{access}', coalesce(n->'access', '{}'::jsonb) || jsonb_build_object(
           'data_class', 'private',
           'data_class_reason', coalesce(nullif(btrim(v_access->>'data_class_reason'), ''),
             'personal shape: every row belongs to the one person in user_id, and rls_variant personal admits only the private class')));
    answered := answered || 'access.data_class'::text;
  end if;

  n := n || jsonb_build_object(
    'rls_variant', v_variant,
    'platform_answers', to_jsonb(answered));

  -- === the plan ===========================================================
  plan := array[
    jsonb_build_object('step','preflight','detail','7 event triggers bound+enabled, session_replication_role=origin, lock_timeout bounded, entity read kernel fingerprint matches, no provisioning already in flight'),
    jsonb_build_object('step','revalidate','detail','platform.provision_validate is re-run inside provision()''s own transaction — that is where a race with concurrent DDL resolves (no plan fingerprint, PLAN §3.2)')];
  if jsonb_array_length(n->'types') > 0 then
    plan := plan || jsonb_build_object('step','create types','detail', format('%s enum type(s) in %s', jsonb_array_length(n->'types'), coalesce(quote_ident(v_schema), '(schema not set)')));
  end if;
  plan := plan || jsonb_build_object('step','create table',
            -- quote_ident(NULL) is NULL, where %I on NULL RAISES: an empty spec must come
            -- back as findings, never as "null values cannot be formatted as an SQL identifier".
            'detail', format('%s.%s with %s declared column(s) plus the base contract',
                             coalesce(quote_ident(v_schema), '(schema not set)'),
                             coalesce(quote_ident(v_table), '(table not set)'),
                             jsonb_array_length(coalesce(n->'fields', '[]'::jsonb))));
  if jsonb_typeof(p_spec->'partition') = 'object' then
    plan := plan || jsonb_build_object('step','partition',
              'detail', format('PARTITION BY HASH (%s) into %s child table(s), and the primary key is (%s, id) because PostgreSQL requires the partition key in every unique constraint',
                               array_to_string(coalesce(array(select jsonb_array_elements_text(p_spec->'partition'->'key')), '{}'::text[]), ', '),
                               coalesce(p_spec->'partition'->>'count', '(not set)'),
                               array_to_string(coalesce(array(select jsonb_array_elements_text(p_spec->'partition'->'key')), '{}'::text[]), ', ')));
  end if;
  plan := plan || jsonb_build_object('step','revoke default ACL',
            'detail','REVOKE ALL FROM PUBLIC, anon, authenticated, service_role immediately after CREATE TABLE — 20 schemas carry ALTER DEFAULT PRIVILEGES rows that grant every NEW relation automatically, so today the default ACL, not the spec, is the source of a new table''s grants');
  plan := plan || jsonb_build_object('step','indexes',
            'detail','every FK gets a covering index, BASE COLUMNS INCLUDED (organization_id, created_by, updated_by) — that trio is 1,174 of the 2,029 live unindexed FKs');
  plan := plan || jsonb_build_object('step','triggers','detail','_stamp_actor, _stamp_actor_tier, _touch_row, _metadata_guard, and platform.assert_same_org for every declared tenancy check (the ONE shared validation-only function, never a per-table clone)');
  plan := plan || jsonb_build_object('step','iam.apply_rls','detail', format('variant %s', coalesce(v_variant,'?')));
  if coalesce(p_spec->>'write_door','none') = 'single' then
    plan := plan || jsonb_build_object('step','write door',
              'detail','platform.stamped_write_table is written BEFORE iam.apply_rls, so iam.apply_table_grants itself issues the read-only client grant and every later regeneration keeps it — a REVOKE after apply_rls would last exactly until the next one');
  end if;
  plan := plan || jsonb_build_object('step','register','detail','platform.entity_types, including every one of the 15 columns that used to be left to the column default with nobody told');
  if jsonb_array_length(n->'association_types') > 0 then
    plan := plan || jsonb_build_object('step','association types','detail', format('%s edge type(s)', jsonb_array_length(n->'association_types')));
  end if;
  if jsonb_array_length(n->'knobs') > 0 then
    plan := plan || jsonb_build_object('step','knobs','detail','seeded in the SAME transaction — platform.knob_resolve raises on a missing knob rather than falling back (lessons ledger 11)');
  end if;
  if jsonb_array_length(n->'views') > 0 then
    plan := plan || jsonb_build_object('step','views','detail','security_invoker = true unless an exemption reason is given');
  end if;
  if jsonb_array_length(n->'functions') > 0 then
    plan := plan || jsonb_build_object('step','functions','detail', format('%s function(s)', jsonb_array_length(n->'functions')));
  end if;
  plan := plan || jsonb_build_object('step','doors','detail','every client_callable_door row written BEFORE any grant (lessons ledger 1 and 24: a guard-log revoke row means the grant preceded the door, 51 times out of 86)');
  plan := plan || jsonb_build_object('step','grants','detail','every GRANT last, as ONE block — each GRANT fires a DB-wide re-sweep of ~2,000 DEFINER functions');
  plan := plan || jsonb_build_object('step','certify','detail','iam.canonical_certify; provision() refuses on any FAIL and on the WARNs that describe the table it just built');
  plan := plan || jsonb_build_object('step','capture','detail','the platform.provision_spec row, inside this same transaction, so capture cannot be skipped');

  return jsonb_build_object(
    'ok', cardinality(f) = 0,
    'lane', v_lane,
    'findings', coalesce(to_jsonb(f), '[]'::jsonb),
    'normalized_spec', n,
    'spec_hash', md5(n::text),
    'plan', coalesce(to_jsonb(plan), '[]'::jsonb),
    'locks', 'ACCESS SHARE on what it reads, and never ACCESS EXCLUSIVE, because it emits no DDL. This is not "no locks".');
end;
$function$;


-- ── 7. the builder ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  v_part     jsonb;
  v_pkey     text;
  v_pcount   integer;
  v_ix       integer;
  r          record;
begin
  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    -- 🚨 THE DECLARATION IS HISTORY; THE CATALOGUE IS STATE. `platform.provision_spec` is
    -- append-only by design — a trigger refuses a DELETE with "the applied declaration IS the
    -- record" — so a token whose relation has since been torn down STILL has a current row in
    -- this view. Without the existence test below, provision() answered `unchanged` for a
    -- table that does not exist, or refused it as "a DIFFERENT declaration", and that token
    -- could never be rebuilt. It made rule 27's down-then-up loop impossible for every
    -- provisioned table, which is how it was found. When the relation is gone the stored
    -- declaration is a record of what once stood there; provision() creates, so it proceeds
    -- and appends a new row beside the old one.
    select * into v_cur from platform.v_provision_spec_current c
     where c.token = v_token
       and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  -- PARTITIONED OR NOT, THIS IS THE SAME BUILDER. When the spec declares no partition the
  -- emitted DDL is byte-for-byte what it has always been; `v_part` is null, `v_pkey` is
  -- null, and every branch below collapses to the empty string.
  v_part := case when jsonb_typeof(n->'partition') = 'object' then n->'partition' else null end;
  if v_part is null then
    v_cols := 'id uuid primary key default gen_random_uuid()';
  else
    -- PostgreSQL refuses a unique constraint on a partitioned table that does not contain
    -- the partition key, so `id` stops being the whole key and becomes its tail.
    v_pcount := (v_part->>'count')::integer;
    v_pkey   := (select string_agg(format('%I', c), ', ')
                   from jsonb_array_elements_text(v_part->'key') c);
    v_cols   := 'id uuid not null default gen_random_uuid()';
  end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      v_frag := v_frag || format(' references %s(id) on delete %s', v_target,
        case lower(v_item->'references'->>'on_delete')
          when 'cascade' then 'cascade' when 'restrict' then 'restrict'
          when 'set_null' then 'set null' else 'no action' end);
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid references auth.users(id)';
  v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  -- REC-40 / REC-60: the one field-value column, emitted by the builder, immediately after
  -- `metadata` so the platform-wide column is never confused with a table's own domain
  -- columns. The spec key already existed and the platform's answer is still `false`; what
  -- changes is that answering `true` now EMITS something instead of being recorded and
  -- ignored.
  if coalesce((n->>'custom_fields')::boolean, false) then
    v_cols := v_cols || ', custom_fields jsonb not null default ''{}''::jsonb';
  end if;
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  if v_part is not null then
    v_cols := v_cols || format(', constraint %I primary key (%s, id)',
                left(format('%s_pkey', v_table), 63), v_pkey);
  end if;

  execute format('create table %s (%s)%s', v_rel, v_cols,
    case when v_part is null then '' else format(' partition by hash (%s)', v_pkey) end);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- the children, in THIS transaction --------------------------------
  -- They are created here, before the indexes and the triggers, so that every partitioned
  -- index and every row trigger the builder attaches to the parent propagates to all of
  -- them at birth rather than being a thing somebody has to remember for child seventeen.
  -- The guard exempts a partition child of a registered parent, and inside provision() the
  -- marker exempts both — Doctrine: partitions are their parent.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('create table %I.%I partition of %s for values with (modulus %s, remainder %s)',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')), v_rel, v_pcount, v_ix);
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
    v_created := v_created || jsonb_build_object('partitions',
      format('%s hash partition(s) of %s on (%s), %s.%s_p00 … %s.%s_p%s',
             v_pcount, v_rel, v_pkey, v_schema, v_table, v_schema, v_table,
             lpad((v_pcount - 1)::text, 2, '0')));
  end if;

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, BASE COLUMNS INCLUDED: updated_by, organization_id
  -- and created_by are 1,174 of the 2,029 live unindexed FKs, and they are columns the
  -- BUILDER emits, so the rule lives here and not in the declaration.
  foreach v_txt in array array['organization_id','created_by','updated_by'] loop
    execute format('create index on %s (%I)', v_rel, v_txt);
  end loop;
  if v_cat then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason');
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- the single write door, DECLARED BEFORE THE GRANTS ARE GENERATED ---
  -- 🚨 THE CLASS FIX, NOT THE INSTANCE. iam.apply_table_grants issues
  -- `grant select, insert, update, delete … to authenticated` for every non-ledger variant,
  -- so a REVOKE issued AFTER apply_rls lasts exactly until the next regeneration — the
  -- failure that function's own DD-248 comment describes in as many words. The register it
  -- already reads is where a one-write-door table says so, so the generator itself issues
  -- the narrow grant and every regeneration keeps it.
  if n->>'write_door' = 'single' then
    insert into platform.stamped_write_table(
      schema_name, table_name, stamp_column, rls_variant, declared_by, reason)
    values (v_schema, v_table, 'created_by', v_variant, format('platform.provision(%s)', v_token),
            format('write_door = single. `authenticated` holds no direct INSERT, UPDATE or DELETE on %s; the only write path is %s, declared in platform.client_callable_door in this same transaction. iam.apply_table_grants reads THIS register (DD-248), so the narrow grant is what the generator issues rather than something revoked behind its back — which would last only until the next regeneration.',
                   v_rel,
                   coalesce((select string_agg(format('%s.%s', v_schema, x.value->>'name'), ', ')
                               from jsonb_array_elements(n->'functions') x), '(none declared)')))
    on conflict (schema_name, table_name) do nothing;
    v_created := v_created || jsonb_build_object('write_door', format('single: %s', v_rel));
  end if;

  -- ---- RLS -------------------------------------------------------------
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- A policy on the PARENT is not consulted when a partition is addressed DIRECTLY, and
  -- ENABLE ROW LEVEL SECURITY does not cascade. "Unreachable" must never depend on which
  -- relation name a caller happens to type, so every child carries RLS enabled with no
  -- policy of its own, which denies every non-owner outright.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('alter table %I.%I enable row level security',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
  end if;

  -- ---- association types -----------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
  end loop;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create or replace view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create or replace function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE block. Each GRANT fires a
    -- DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8).
    if (v_item->>'client_access') = 'signed_in' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to authenticated',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to anon, authenticated',
                                     v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from ((v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s; observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access',
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- the write-door proof: the narrow grant, OBSERVED -----------------
  -- Same shape as the door proof above, and for the same reason: the declaration is worth
  -- nothing unless the catalogue agrees with it at the end of the transaction.
  if n->>'write_door' = 'single' then
    if has_table_privilege('authenticated', v_rel::regclass, 'INSERT')
       or has_table_privilege('authenticated', v_rel::regclass, 'UPDATE')
       or has_table_privilege('authenticated', v_rel::regclass, 'DELETE') then
      raise exception '%', (platform.provision_finding('write_door.proof_failed', 'write_door', null,
               format('authenticated still holds INSERT=%s UPDATE=%s DELETE=%s on %s',
                      has_table_privilege('authenticated', v_rel::regclass, 'INSERT'),
                      has_table_privilege('authenticated', v_rel::regclass, 'UPDATE'),
                      has_table_privilege('authenticated', v_rel::regclass, 'DELETE'), v_rel)))->>'message'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     and l.rule = 'definer_client_grant_revoked'
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the
  -- CHECK NAME is the prefix of `detail`. Refuse on every FAIL and every WARN except
  -- the three legacy-column WARNs (§3.1); INFO (the snapshot row) is ignored.
  for r in select * from iam.canonical_certify(v_schema, v_table, v_token) loop
    v_certify := v_certify || jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail);
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,''));
    end if;
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user));

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    'canonical_certify_ok', iam.canonical_certify_ok(v_schema, v_table, v_token),
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.');
end;
$function$;
