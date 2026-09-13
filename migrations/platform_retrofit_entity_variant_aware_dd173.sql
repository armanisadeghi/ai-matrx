-- platform_retrofit_entity_variant_aware_dd173 — THE BASE-CONTRACT RETROFIT PATH, MADE HONEST
-- (DD-173. Schema work; no policy is written by this file.)
--
-- WHY THIS FILE EXISTS
-- --------------------
-- DD-173 is 57 registered tokens that `iam.apply_rls` REFUSES because the table lacks the base
-- contract its `rls_variant` requires. The register names `platform.retrofit_entity` as the path
-- that pays them. Re-read live before writing a line of it, that function CANNOT pay them:
--
--   1. It is hardcoded to ONE schema. Every table reference inside it is `format('public.%I',
--      p_table)`, so it can only ever retrofit `public`. Of DD-173's 57 tokens, FIFTY-FIVE live
--      in another schema (admin, ops, billing, tool, ui, iam, crm, education, files, seo,
--      platform, users, context, runtime, rag, scraper, workflow, growth, extend, meta). Called
--      for any of them it either raises `not found` or — worse — silently retrofits a
--      same-named `public` table that is a different table.
--   2. It is VARIANT-BLIND. It adds `version` + `updated_at` + `_touch_row` + `created_by` +
--      `updated_by` + `_stamp_actor` to whatever it is handed. §6d-3 (THE PER-VARIANT BASE COLUMN
--      CONTRACT, owner ruling 2026-08-21) says a `component` has NO actor columns and a `ledger`
--      has neither the actor pair nor the mutation trio — and that attaching `_stamp_actor` to a
--      component is "the entity fix and is wrong here". The old routine would have written the
--      exact dead columns §8's POSITIVE-ADD RULE forbids onto 10 ledgers in this very register.
--   3. It never adds `metadata`, never adds the `organization_id` / `created_by` / `updated_by`
--      FOREIGN KEYS, never sets `organization_id NOT NULL`, and never adds the `visibility` enum
--      that `iam.apply_rls` HARD-REQUIRES for the `system` variant. So a table it "completed"
--      still failed five `iam.verify_canonical` base checks and still could not be generated.
--
-- So the path named in the register is rebuilt here to BE that path: one function, schema-aware,
-- deriving what to add from the registry's own `rls_variant` through exactly the §6d-3 table, and
-- refusing — out loud, with the sentence a human needs — anything it cannot do correctly.
--
-- 🚨 IT ADDS ONLY WHAT THE VARIANT REQUIRES, AND REFUSES WHAT THE VARIANT FORBIDS (§6d-3).
--    variant     id      org   created_at  metadata  actor pair  mutation trio  visibility
--    entity      uuid    ✅    ✅          ✅        ✅          ✅             only if listed/shareable
--    system      uuid    ✅    ✅          ✅        ✅          ✅             ✅ REQUIRED
--    restricted  uuid    ✅    ✅          ✅        ✅          ✅             never added
--    personal    uuid    ✅    ✅          ✅        ✅          optional       never added
--    component   uuid    ✅    ✅          ✅        ❌ refused   only if versioned   ❌ refused
--    ledger      uuid/int ✅   ✅/occurred ✅        ❌ refused   only if versioned   ❌ refused
--
-- 🚨 NO NULL ORG (owner ruling 2026-08-21). `organization_id` is added, BACKFILLED by a named
--    strategy, and set NOT NULL in the same call. If one row would be left without an org the
--    whole call raises and names the count — a retrofit that leaves a nullable org column has
--    done the one thing the ruling forbids. The strategies are NAMED, never inferred:
--      'system'   — the row is platform/global/builtin content; the system organization is
--                   supplied EXPLICITLY (db-rules §2: "the launching operation explicitly supplies
--                   the system org"), never defaulted by the database.
--      'personal' — from the row's own owner column's personal organization.
--      'parent'   — from a named parent table through a named FK (parent may be schema-qualified).
--      'expr'     — a caller-written SQL expression over alias `t`, for the cases the three above
--                   cannot express. The expression is recorded in the return string.
--      'keep'     — the column already carries the truth; only the NOT NULL + FK are added.
--    There is no 'default', no 'infer', no 'first org' and no fallback: db-rules §2 forbids the
--    database choosing an organization, and a retrofit that guessed would be that forbidden
--    choice wearing a different hat.
--
-- 🚨 THE TRANSIENT NULLABLE WINDOW IS DECLARED, NOT HIDDEN. Between ADD COLUMN and SET NOT NULL
--    the column is nullable, and `platform._ddl_guard`'s log lane records that (severity 'error',
--    rule 'nullable_org') and RAISE WARNINGs. That is the guard doing its job and it is left to
--    fire: the ONE alternative — `add column ... not null default '<org>'` — is hard-blocked by
--    the same guard's `organization_id default` lane, and combining add+drop-default into one
--    ALTER is rejected by Postgres (`column "organization_id" of relation ... does not exist`);
--    both were tried live before this sentence was written. Callers ACKNOWLEDGE their own firings
--    through `platform.ddl_guard_ack` with a reason naming the retrofit — the supported write
--    path — so the log stays a ledger of reviewed events rather than a pile nobody reads.
--
-- The old single-schema signature is DROPPED, not left beside the new one. A safe path beside an
-- unsafe one is not a fix (DD-149's lesson); and with both present a four-argument call is
-- ambiguous to Postgres, so leaving it would make the honest path unreachable by accident. It has
-- no live caller: `platform.client_callable_door` has no row for it, DD-146 recorded "no client
-- caller anywhere", and every in-repo use is an already-applied migration file.
set local lock_timeout = '20s';

create or replace function platform.retrofit_entity(
  p_schema          text,
  p_table           text,
  p_token           text,
  p_org_strategy    text,                      -- system | personal | parent | expr | keep
  p_org_expr        text default null,         -- 'expr': SQL over alias t
  p_owner_col       text default null,         -- 'personal': the owner column
  p_parent_ref      text default null,         -- 'parent': schema.table
  p_parent_fk       text default null,         -- 'parent': the FK column on THIS table
  p_visibility_expr text default null,         -- SQL over alias t, or a literal; entity/system only
  p_legacy_trigger  text default null           -- a legacy updated_at trigger to drop
) returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tbl        regclass;
  v_variant    text;
  v_versioned  boolean;
  v_softdel    boolean;
  v_listed     boolean;
  v_shareable  boolean;
  v_actor_req  boolean;
  v_mut_req    boolean;
  v_vis_req    boolean;
  v_parent_sch text; v_parent_tbl text; v_parent_org text;
  v_cbt        text;
  v_null_org   bigint;
  v_null_vis   bigint;
  v_did        text[] := '{}';
  v_sysorg     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  function_has boolean;
begin
  -- ── the table, the token, and the registry must agree before a single column moves ──────────
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  if v_tbl is null then
    raise exception 'retrofit_entity: %.% does not exist', p_schema, p_table;
  end if;
  select et.rls_variant, coalesce(et.is_versioned,false), coalesce(et.has_soft_delete,false),
         coalesce(et.is_listed,false)
    into v_variant, v_versioned, v_softdel, v_listed
    from platform.entity_types et
   where et.token = p_token and et.is_active
     and et.schema_name = p_schema and et.table_name = p_table;
  if v_variant is null then
    raise exception
      'retrofit_entity: token % is not an active registered entity at %.%. The base contract is decided by the registry''s rls_variant, so a table that is not registered there cannot be retrofitted — register it first (platform.entity_types) with its data_class and variant.',
      p_token, p_schema, p_table;
  end if;
  if v_variant not in ('entity','system','restricted','personal','component','ledger') then
    raise exception 'retrofit_entity: token % has rls_variant %, which §6d-3 does not define', p_token, v_variant;
  end if;
  if p_org_strategy is null or p_org_strategy not in ('system','personal','parent','expr','keep') then
    raise exception
      'retrofit_entity(%): org strategy % is not one of system | personal | parent | expr | keep. NO NULL ORG (db-rules §2): the organization a row belongs to is stated by the operation, never inferred by the database, so this function has no default strategy.',
      p_token, coalesce(p_org_strategy,'<null>');
  end if;

  v_shareable := exists (select 1 from platform.shareable_resource_registry
                          where resource_type = p_token and is_active);
  v_actor_req := v_variant in ('entity','system','restricted');
  v_mut_req   := v_variant in ('entity','system','restricted','personal') or v_versioned;
  v_vis_req   := v_variant = 'system' or (v_variant = 'entity' and (v_listed or v_shareable));

  -- ── §6d-3 refusals: never a column the variant forbids ──────────────────────────────────────
  if p_visibility_expr is not null and v_variant in ('component','ledger') then
    raise exception
      'retrofit_entity(%): a % may not be given a visibility column — its generated RLS lane never reads one, so the column would be a second, competing access authority (§6d-1/§6d-2, and iam.verify_canonical WARNs it as a stray). Remove the visibility argument.',
      p_token, v_variant;
  end if;
  if v_vis_req and p_visibility_expr is null
     and not exists (select 1 from information_schema.columns
                      where table_schema=p_schema and table_name=p_table and column_name='visibility'
                        and udt_schema='platform' and udt_name='visibility') then
    raise exception
      'retrofit_entity(%): the % variant requires a visibility column and nobody said what these rows'' visibility is. iam.apply_rls refuses the table without it, and this function will not pick a value: "public" would publish every row to anonymous readers and "personal" would hide them from everyone. Pass p_visibility_expr — a literal such as ''public'', or SQL over alias t such as (case when t.active then ''public'' else ''internal'' end).',
      p_token, v_variant;
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname = 'org_id' and not a.attisdropped) then
    raise exception
      'retrofit_entity(%): %.% carries the legacy column org_id. organization_id is the canonical name (db-rules §2 kill list) and two org columns on one table is an access ambiguity, not a retrofit. Rename or drop org_id in its own migration first.',
      p_token, p_schema, p_table;
  end if;
  select data_type into v_cbt from information_schema.columns
   where table_schema = p_schema and table_name = p_table and column_name = 'created_by';
  if v_cbt is not null and v_cbt <> 'uuid' then
    raise exception
      'retrofit_entity(%): created_by is % (not uuid) on %.%. created_by is the entity''s access key and must FK auth.users; rename the domain column (e.g. to created_by_kind) in its own migration first.',
      p_token, v_cbt, p_schema, p_table;
  end if;

  -- ── id ───────────────────────────────────────────────────────────────────────────────────────
  -- A ledger row has a POSITION, not a shareable identity, so an integer sequence is canonical
  -- there (iam.verify_canonical, the history.row_versions shape) and is left alone.
  if not exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname = 'id' and not a.attisdropped) then
    if v_variant = 'ledger' then
      execute format('alter table %s add column id uuid not null default gen_random_uuid()', v_tbl::text);
      v_did := array_append(v_did, 'id(uuid, ledger had none)');
    else
      execute format('alter table %s add column id uuid not null default gen_random_uuid()', v_tbl::text);
      execute format('create unique index if not exists %I on %s (id)',
                     left(format('%s_%s_id_key', p_schema, p_table), 63), v_tbl::text);
      v_did := array_append(v_did, 'id(uuid + unique; the natural key stays the PK)');
    end if;
  else
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='id'
                      and (data_type='uuid' or (v_variant='ledger' and data_type in ('bigint','integer','smallint')))) then
      raise exception
        'retrofit_entity(%): %.% has an id column that is neither uuid nor (for a ledger) an integer sequence. The canonical identity cannot be changed underneath live rows by a retrofit — decide it in its own migration.',
        p_token, p_schema, p_table;
    end if;
  end if;

  -- ── organization_id: add, backfill by the NAMED strategy, NOT NULL, FK ──────────────────────
  if not exists (select 1 from pg_attribute a where a.attrelid = v_tbl and a.attname='organization_id' and not a.attisdropped) then
    execute format('alter table %s add column organization_id uuid', v_tbl::text);
    v_did := array_append(v_did, 'organization_id');
  end if;

  if p_org_strategy = 'system' then
    execute format('update %s t set organization_id = %L::uuid where t.organization_id is null', v_tbl::text, v_sysorg);
  elsif p_org_strategy = 'personal' then
    if p_owner_col is null then
      raise exception 'retrofit_entity(%): the personal strategy needs p_owner_col — which column holds the person whose organization this row belongs to?', p_token;
    end if;
    if not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname=p_owner_col and not a.attisdropped) then
      raise exception 'retrofit_entity(%): owner column % does not exist on %.%', p_token, p_owner_col, p_schema, p_table;
    end if;
    execute format(
      $q$update %s t set organization_id = (
           select o.id from iam.organizations o
            where o.is_personal and o.created_by = t.%I order by o.created_at limit 1)
         where t.organization_id is null$q$, v_tbl::text, p_owner_col);
  elsif p_org_strategy = 'parent' then
    if p_parent_ref is null or p_parent_fk is null then
      raise exception 'retrofit_entity(%): the parent strategy needs p_parent_ref (schema.table) and p_parent_fk', p_token;
    end if;
    v_parent_sch := split_part(p_parent_ref, '.', 1);
    v_parent_tbl := split_part(p_parent_ref, '.', 2);
    if to_regclass(format('%I.%I', v_parent_sch, v_parent_tbl)) is null then
      raise exception 'retrofit_entity(%): parent % does not exist', p_token, p_parent_ref;
    end if;
    select column_name into v_parent_org from information_schema.columns
     where table_schema=v_parent_sch and table_name=v_parent_tbl and column_name='organization_id';
    if v_parent_org is null then
      raise exception 'retrofit_entity(%): parent % has no organization_id to inherit — retrofit the parent first', p_token, p_parent_ref;
    end if;
    execute format(
      $q$update %s t set organization_id = p.organization_id
           from %I.%I p where p.id = t.%I and t.organization_id is null$q$,
      v_tbl::text, v_parent_sch, v_parent_tbl, p_parent_fk);
  elsif p_org_strategy = 'expr' then
    if p_org_expr is null then
      raise exception 'retrofit_entity(%): the expr strategy needs p_org_expr', p_token;
    end if;
    execute format('update %s t set organization_id = (%s) where t.organization_id is null', v_tbl::text, p_org_expr);
  end if;

  execute format('select count(*) from %s where organization_id is null', v_tbl::text) into v_null_org;
  if v_null_org > 0 then
    raise exception
      'retrofit_entity(%): % row(s) of %.% would be left with no organization by strategy %. NO NULL ORG (owner ruling 2026-08-21): NULL is not a scope, not "global", not "system" and not "unknown yet". Name the organization those rows belong to — a different strategy, or an expr — rather than letting the column stay nullable.',
      p_token, v_null_org, p_schema, p_table, p_org_strategy;
  end if;
  execute format('alter table %s alter column organization_id set not null', v_tbl::text);
  if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                  where c.conrelid=v_tbl and c.contype='f' and a.attname='organization_id'
                    and c.confrelid='iam.organizations'::regclass) then
    execute format('alter table %s add constraint %I foreign key (organization_id) references iam.organizations(id)',
                   v_tbl::text, left(format('%s_%s_organization_id_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'organization_id FK -> iam.organizations');
  end if;

  -- ── created_at (a ledger may name it occurred_at) ────────────────────────────────────────────
  if not exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and is_nullable='NO'
                    and (column_name='created_at' or (v_variant='ledger' and column_name='occurred_at'))) then
    if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_at' and not a.attisdropped) then
      execute format('update %s set created_at = now() where created_at is null', v_tbl::text);
      execute format('alter table %s alter column created_at set default now(), alter column created_at set not null', v_tbl::text);
      v_did := array_append(v_did, 'created_at NOT NULL');
    else
      execute format('alter table %s add column created_at timestamptz not null default now()', v_tbl::text);
      v_did := array_append(v_did, 'created_at');
    end if;
  end if;

  -- ── metadata: universal, every variant ───────────────────────────────────────────────────────
  if not exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='metadata'
                    and data_type='jsonb' and is_nullable='NO') then
    if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='metadata' and not a.attisdropped) then
      execute format('update %s set metadata = ''{}''::jsonb where metadata is null', v_tbl::text);
      execute format('alter table %s alter column metadata set default ''{}''::jsonb, alter column metadata set not null', v_tbl::text);
      v_did := array_append(v_did, 'metadata NOT NULL');
    else
      execute format('alter table %s add column metadata jsonb not null default ''{}''::jsonb', v_tbl::text);
      v_did := array_append(v_did, 'metadata');
    end if;
  end if;

  -- ── the ACTOR PAIR — entity family only (§6d-1, §6d-3) ──────────────────────────────────────
  if v_actor_req then
    if not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_by' and not a.attisdropped) then
      execute format('alter table %s add column created_by uuid', v_tbl::text);
      if p_owner_col is not null and exists (select 1 from information_schema.columns
            where table_schema=p_schema and table_name=p_table and column_name=p_owner_col and data_type='uuid') then
        execute format('update %s t set created_by = t.%I where t.created_by is null', v_tbl::text, p_owner_col);
        v_did := array_append(v_did, format('created_by (backfilled from %s)', p_owner_col));
      else
        v_did := array_append(v_did, 'created_by');
      end if;
    end if;
    if not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_by' and not a.attisdropped) then
      execute format('alter table %s add column updated_by uuid', v_tbl::text);
      v_did := array_append(v_did, 'updated_by');
    end if;
  end if;
  -- the FKs are checked wherever the columns EXIST — §6d-3: "if the column exists anyway it must
  -- still FK auth.users, and the gate keeps checking that".
  if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='created_by' and not a.attisdropped)
     and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='created_by' and c.confrelid='auth.users'::regclass) then
    execute format('update %s t set created_by = null where t.created_by is not null and not exists (select 1 from auth.users u where u.id = t.created_by)', v_tbl::text);
    execute format('alter table %s add constraint %I foreign key (created_by) references auth.users(id)',
                   v_tbl::text, left(format('%s_%s_created_by_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'created_by FK -> auth.users');
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_by' and not a.attisdropped)
     and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='updated_by' and c.confrelid='auth.users'::regclass) then
    execute format('update %s t set updated_by = null where t.updated_by is not null and not exists (select 1 from auth.users u where u.id = t.updated_by)', v_tbl::text);
    execute format('alter table %s add constraint %I foreign key (updated_by) references auth.users(id)',
                   v_tbl::text, left(format('%s_%s_updated_by_fkey', p_schema, p_table), 63));
    v_did := array_append(v_did, 'updated_by FK -> auth.users');
  end if;

  -- ── the MUTATION TRIO — where the row is user-revised, or the registry declares it versioned ─
  if v_mut_req then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='updated_at' and is_nullable='NO') then
      if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_at' and not a.attisdropped) then
        execute format('update %s set updated_at = coalesce(updated_at, now()) where updated_at is null', v_tbl::text);
        execute format('alter table %s alter column updated_at set default now(), alter column updated_at set not null', v_tbl::text);
        v_did := array_append(v_did, 'updated_at NOT NULL');
      else
        execute format('alter table %s add column updated_at timestamptz not null default now()', v_tbl::text);
        v_did := array_append(v_did, 'updated_at');
      end if;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='version'
                      and data_type='integer' and is_nullable='NO') then
      execute format('alter table %s add column if not exists version integer', v_tbl::text);
      execute format('update %s set version = coalesce(version, 1) where version is null', v_tbl::text);
      execute format('alter table %s alter column version set default 1, alter column version set not null', v_tbl::text);
      v_did := array_append(v_did, 'version');
    end if;
  end if;

  -- ── soft delete, when the registry declares it ───────────────────────────────────────────────
  if v_softdel and not exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='deleted_at' and not a.attisdropped) then
    execute format('alter table %s add column deleted_at timestamptz', v_tbl::text);
    v_did := array_append(v_did, 'deleted_at');
  end if;

  -- ── visibility — REQUIRED by iam.apply_rls for the system variant; never on component/ledger ─
  if v_vis_req then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='visibility'
                      and udt_schema='platform' and udt_name='visibility') then
      if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='visibility' and not a.attisdropped) then
        raise exception
          'retrofit_entity(%): %.% already has a visibility column that is not platform.visibility (the free-text kill, db-rules §2). Converting a live access driver in place is not a retrofit — do it in its own migration with its own proof.',
          p_token, p_schema, p_table;
      end if;
      execute format('alter table %s add column visibility platform.visibility', v_tbl::text);
      execute format('update %s t set visibility = (%s)::platform.visibility where t.visibility is null', v_tbl::text, p_visibility_expr);
      execute format('select count(*) from %s where visibility is null', v_tbl::text) into v_null_vis;
      if v_null_vis > 0 then
        raise exception 'retrofit_entity(%): the visibility expression left % row(s) NULL. Every row''s visibility is stated or the table is not retrofitted.', p_token, v_null_vis;
      end if;
      execute format('alter table %s alter column visibility set not null', v_tbl::text);
      v_did := array_append(v_did, format('visibility (%s)', p_visibility_expr));
    end if;
  end if;

  -- ── the canonical triggers, attached only where they have something to do ────────────────────
  if p_legacy_trigger is not null then
    execute format('drop trigger if exists %I on %s', p_legacy_trigger, v_tbl::text);
    v_did := array_append(v_did, format('dropped legacy trigger %s', p_legacy_trigger));
  end if;
  execute format('drop trigger if exists _touch_row on %s', v_tbl::text);
  execute format('drop trigger if exists _stamp_actor on %s', v_tbl::text);
  if v_actor_req then
    execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_tbl::text);
    v_did := array_append(v_did, '_stamp_actor');
  end if;
  select (exists (select 1 from information_schema.columns
                   where table_schema=p_schema and table_name=p_table and is_nullable='NO'
                     and column_name in ('updated_at','version')))
    into function_has;
  if function_has then
    execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_tbl::text);
    v_did := array_append(v_did, '_touch_row');
  end if;

  return format('retrofit_entity(%s.%s / token %s / variant %s) OK — org strategy %s, null_org 0. Changed: %s',
                p_schema, p_table, p_token, v_variant, p_org_strategy,
                case when cardinality(v_did)=0 then 'nothing (already canonical)' else array_to_string(v_did, ', ') end);
end
$fn$;

revoke all on function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) to service_role;
comment on function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) is
  'DD-173: the base-contract retrofit path. Schema-aware and variant-aware — adds exactly what the registry''s rls_variant requires under db-rules §6d-3 and refuses what it forbids. NO NULL ORG: organization_id is backfilled by a NAMED strategy and set NOT NULL in the same call, or the call raises.';

-- The single-schema, variant-blind predecessor. Dropped rather than kept beside the new one:
-- with both present a four-argument call is ambiguous, so the honest path would be unreachable
-- by accident, and the old one silently retrofits the wrong table for any non-public schema.
drop function if exists platform.retrofit_entity(text,text,text,text,text,text,text);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE FORCING PROOF — the function is shown FAILING the way it must, then doing the job, against
-- this database, in this transaction. A retrofit routine that cannot be shown refusing is a
-- routine nobody can trust to refuse.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $proof$
declare
  v_msg text; v_res text; v_detail text; v_fail text[] := '{}'; v_ok int := 0; v_in_sysorg bigint;
  v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_base_fail int;
begin
  -- RED 1 — the old single-schema signature is GONE, so nothing can call the wrong table.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='platform' and p.proname='retrofit_entity'
                and pg_get_function_identity_arguments(p.oid) = 'p_table text, p_token text, p_org_strategy text, p_owner_col text, p_parent_table text, p_parent_fk text, p_legacy_trigger text') then
    v_fail := v_fail || 'the single-schema predecessor still exists';
  else v_ok := v_ok + 1; end if;

  -- RED 2 — §6d-3: a ledger may not be handed a visibility column. Real token, real refusal.
  begin
    perform platform.retrofit_entity('admin','admin_audit_log','admin_audit_log','system',null,null,null,null,'''public''',null);
    v_fail := v_fail || 'a ledger accepted a visibility column';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%may not be given a visibility column%' then v_ok := v_ok + 1;
    else v_fail := v_fail || format('ledger/visibility refusal said the wrong thing: %s', v_msg); end if;
  end;

  -- RED 3 — NO NULL ORG: there is no default strategy, and the refusal says why.
  begin
    perform platform.retrofit_entity('admin','admin_audit_log','admin_audit_log','whatever');
    v_fail := v_fail || 'an unnamed org strategy was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%NO NULL ORG%' then v_ok := v_ok + 1;
    else v_fail := v_fail || format('org-strategy refusal said the wrong thing: %s', v_msg); end if;
  end;

  -- RED 4 — the system variant will not have its visibility guessed for it.
  begin
    perform platform.retrofit_entity('platform','retention_policy','retention_policy','system');
    v_fail := v_fail || 'a system-variant table was retrofitted with a guessed visibility';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%nobody said what these rows%' then v_ok := v_ok + 1;
    else v_fail := v_fail || format('visibility refusal said the wrong thing: %s', v_msg); end if;
  end;

  -- RED 5 — an unregistered table has no variant, so it has no base contract to apply.
  begin
    perform platform.retrofit_entity('public','_schema_migrations','__zz_no_such_token_dd173__','system');
    v_fail := v_fail || 'an unregistered token was retrofitted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%not an active registered entity%' then v_ok := v_ok + 1;
    else v_fail := v_fail || format('registry refusal said the wrong thing: %s', v_msg); end if;
  end;

  -- GREEN — a table in a NON-public schema (the thing the predecessor could not reach at all),
  -- registered as an `entity`, comes out of ONE call with ZERO base-contract FAILs.
  --
  -- 🚨 THE PROOF UNDOES ITSELF WITHOUT A DROP, AND THAT IS DELIBERATE. Dropping the scratch table
  -- would drop the FKs the retrofit just added to `auth.users` and `iam.organizations`, and
  -- dropping an FK takes ACCESS EXCLUSIVE on the REFERENCED table — on `auth.users`, against live
  -- traffic, that is a lock this migration must never take (measured: the drop sat on the lock
  -- past a 20 s lock_timeout, twice). So the whole GREEN arm runs inside a plpgsql sub-block that
  -- ENDS BY RAISING: the sub-block is a savepoint, so every schema change it made is rolled back,
  -- while the plain variables it measured into are memory and survive. Nothing is left behind and
  -- no lock is taken on a shared table.
  begin
    execute 'create schema if not exists zz_dd173_proof';
    execute 'create table zz_dd173_proof.probe(k text primary key, owner_uid uuid)';
    execute 'insert into zz_dd173_proof.probe(k, owner_uid) values (''a'', null), (''b'', null)';
    insert into platform.entity_types(token, schema_name, table_name, label, rls_variant, data_class, data_class_reason, is_active, is_versioned, has_soft_delete)
    values ('__zz_dd173_probe__','zz_dd173_proof','probe','DD-173 retrofit proof','entity','confidential',
            'throwaway proof row created and rolled back inside the DD-173 retrofit migration', true, false, false);

    v_res := platform.retrofit_entity('zz_dd173_proof','probe','__zz_dd173_probe__','system');

    select count(*) into v_base_fail
      from iam.verify_canonical('zz_dd173_proof','probe','__zz_dd173_probe__','entity')
     where status='FAIL' and (check_name like 'base_%' or check_name like 'trg_%');
    select string_agg(check_name||' ('||coalesce(detail,'')||')', '; ') into v_detail
      from iam.verify_canonical('zz_dd173_proof','probe','__zz_dd173_probe__','entity')
     where status='FAIL' and (check_name like 'base_%' or check_name like 'trg_%');
    select count(*) into v_in_sysorg from zz_dd173_proof.probe where organization_id = v_org;

    raise exception 'dd173_proof_rollback';
  exception when others then
    if sqlerrm <> 'dd173_proof_rollback' then raise; end if;
  end;
  raise notice 'dd173 proof: %', v_res;
  if v_base_fail = 0 then v_ok := v_ok + 1;
  else v_fail := v_fail || format('the retrofitted probe still has %s base-contract FAIL(s): %s', v_base_fail, v_detail);
  end if;
  if v_in_sysorg <> 2 then
    v_fail := v_fail || 'the system strategy did not put both rows in the system organization';
  else v_ok := v_ok + 1; end if;

  if cardinality(v_fail) > 0 then
    raise exception 'dd173: the retrofit path failed its own proof — %', array_to_string(v_fail, ' ; ');
  end if;
  raise notice 'dd173: retrofit_entity proof GREEN — % assertions (5 refusals proven by their own message, one non-public-schema table retrofitted to 0 base-contract FAILs)', v_ok;
end $proof$;
