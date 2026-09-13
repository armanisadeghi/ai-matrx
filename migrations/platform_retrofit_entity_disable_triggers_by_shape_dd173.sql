-- platform_retrofit_entity_disable_triggers_by_shape_not_by_name_dd173 — DD-173.
--
-- The previous file took `platform.retrofit_entity` out of the `_touch_row` silent-null class by
-- dropping `_touch_row` and `_stamp_actor` BEFORE any backfill. Rehearsing the next DD-173 batch
-- found the hole in that fix immediately: `platform.change_type_default` carries
-- `platform._touch_row()` under the trigger NAME `_touch`. The drop-by-name missed it, the trigger
-- fired on the backfills, and the `metadata` column added earlier in the same transaction came
-- back NULL — this time loudly (`null value in column "metadata" ... violates not-null
-- constraint`) only because `metadata` is NOT NULL. On any nullable column it would have been
-- silent again.
--
-- A NAME IS NOT AN IDENTITY. This version disables EVERY user trigger on the table for the
-- duration of the retrofit (`alter table ... disable trigger user`), which is correct on its own
-- terms — a backfill is not a user write and must not fire anything — and then drops the canonical
-- pair BY FUNCTION (`pg_proc.proname`) rather than by trigger name, so a legacy alias cannot
-- survive beside the trigger this function re-creates. Triggers are re-enabled before it returns,
-- and any failure rolls the whole thing back.
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
  v_trig text;
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

  -- ── THE CANONICAL TRIGGERS COME OFF BEFORE ANY BACKFILL AND GO BACK ON AT THE END ──────────
  -- Two reasons, and the second is a silent data loss this retrofit walked into head-first.
  --  1. A backfill is not a user revision. Leaving `_touch_row` attached bumps `version` and
  --     restamps `updated_at` on every row this function touches, which is a lie about the row.
  --  2. 🚨 `platform._touch_row()` rebuilds NEW with `jsonb_populate_record(NEW, ...)`. Once the
  --     trigger has fired in a transaction its cached row-type for NEW is THE SHAPE THE TABLE HAD
  --     THEN, so an UPDATE writing a column ADDED LATER IN THE SAME TRANSACTION is rebuilt without
  --     it and the new value is silently dropped to NULL. Measured live: the batch-1 retrofit of
  --     crm.jurisdiction_policy backfilled organization_id (firing the trigger), then added
  --     `visibility` and backfilled it — and all 35 rows came out NULL, with no error anywhere.
  --     Only this function's own "every row's visibility is stated or the table is not
  --     retrofitted" assertion caught it. Detaching the trigger first takes this function out of
  --     that class entirely: every backfill it does runs with no trigger attached at all.
  --  3. 🚨 AND IT IS DONE BY DISABLING, NOT BY NAME. The first version of this dropped
  --     `_touch_row` and `_stamp_actor` BY NAME. `platform.change_type_default` carries the very
  --     same function under the name `_touch`, so the drop missed it, the trigger fired on the
  --     backfills, and the `metadata` column added earlier in the transaction came back NULL — this
  --     time loudly, as a NOT NULL violation, because `metadata` is NOT NULL. A name is not an
  --     identity: `alter table ... disable trigger user` covers every trigger whatever it is
  --     called, and the canonical pair is then dropped BY FUNCTION (pg_proc.proname) so a
  --     non-canonically-named duplicate cannot survive beside the one this function re-creates.
  execute format('alter table %s disable trigger user', v_tbl::text);
  for v_trig in select tg.tgname from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
                 where tg.tgrelid = v_tbl and not tg.tgisinternal
                   and pr.proname in ('_touch_row','_stamp_actor')
  loop
    execute format('drop trigger if exists %I on %s', v_trig, v_tbl::text);
    v_did := array_append(v_did, format('dropped %s (a canonical trigger under a non-canonical name)', v_trig));
  end loop;

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

  execute format('alter table %s enable trigger user', v_tbl::text);

  return format('retrofit_entity(%s.%s / token %s / variant %s) OK — org strategy %s, null_org 0. Changed: %s',
                p_schema, p_table, p_token, v_variant, p_org_strategy,
                case when cardinality(v_did)=0 then 'nothing (already canonical)' else array_to_string(v_did, ', ') end);
end
$fn$;

revoke all on function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) from public;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE FORCING PROOF — RED then GREEN, against this database, on the real shape that broke it: a
-- table carrying platform._touch_row() under a NON-canonical trigger name. Both arms run inside
-- plpgsql sub-blocks that end by raising, so they undo themselves without a DROP.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $proof$
declare v_red text; v_green_nulls bigint; v_green_trigs int; v_fail text[] := '{}';
begin
  -- RED — drop-by-name is not enough: the legacy alias survives and nulls the new column.
  begin
    execute 'create schema if not exists zz_dd173_alias';
    execute 'create table zz_dd173_alias.probe(k text primary key, updated_at timestamptz, version integer)';
    execute 'insert into zz_dd173_alias.probe(k, version) values (''a'',1)';
    execute 'create trigger _touch before insert or update on zz_dd173_alias.probe for each row execute function platform._touch_row()';
    execute 'drop trigger if exists _touch_row on zz_dd173_alias.probe';   -- the old fix, by name
    execute 'drop trigger if exists _stamp_actor on zz_dd173_alias.probe';
    execute 'update zz_dd173_alias.probe set version = 1';
    execute 'alter table zz_dd173_alias.probe add column later_col text';
    execute 'update zz_dd173_alias.probe set later_col = ''written''';
    execute 'select coalesce(later_col, ''<NULL>'') from zz_dd173_alias.probe' into v_red;
    raise exception 'dd173_alias_rollback';
  exception when others then
    if sqlerrm <> 'dd173_alias_rollback' then raise; end if;
  end;
  if v_red = '<NULL>' then
    raise notice 'dd173: RED reproduced — a drop BY NAME leaves platform._touch_row() attached under the alias _touch, and the new column came back NULL';
  else
    v_fail := v_fail || format('the alias class did not reproduce (later_col = %s)', v_red);
  end if;

  -- GREEN — the retrofit, on exactly that shape, populates what it adds and leaves ONE canonical
  -- touch trigger behind, not two.
  begin
    execute 'create schema if not exists zz_dd173_alias2';
    execute 'create table zz_dd173_alias2.probe(k text primary key, updated_at timestamptz, version integer, is_active boolean not null default true)';
    execute 'insert into zz_dd173_alias2.probe(k, version) values (''a'',1), (''b'',1)';
    execute 'create trigger _touch before insert or update on zz_dd173_alias2.probe for each row execute function platform._touch_row()';
    insert into platform.entity_types(token, schema_name, table_name, label, rls_variant, data_class, data_class_reason, is_active, is_versioned, has_soft_delete)
    values ('__zz_dd173_alias__','zz_dd173_alias2','probe','DD-173 trigger-alias proof','system','public',
            'throwaway proof row created and rolled back inside the DD-173 trigger-alias migration', true, false, false);
    perform platform.retrofit_entity('zz_dd173_alias2','probe','__zz_dd173_alias__','system',
              null, null, null, null, $x$'public'$x$, null);
    execute 'select count(*) from zz_dd173_alias2.probe where visibility is null or metadata is null' into v_green_nulls;
    select count(*) into v_green_trigs from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
     where tg.tgrelid = 'zz_dd173_alias2.probe'::regclass and not tg.tgisinternal and pr.proname = '_touch_row';
    raise exception 'dd173_alias_rollback';
  exception when others then
    if sqlerrm <> 'dd173_alias_rollback' then raise; end if;
  end;
  if v_green_nulls = 0 and v_green_trigs = 1 then
    raise notice 'dd173: GREEN — visibility and metadata written on every row, and exactly one _touch_row trigger left behind (the alias is gone, not duplicated)';
  else
    v_fail := v_fail || format('after the retrofit %s row(s) carry a NULL visibility or metadata and %s _touch_row trigger(s) are attached (expected 0 and 1)', v_green_nulls, v_green_trigs);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'dd173: the trigger-by-shape fix failed its own proof — %', array_to_string(v_fail, ' ; ');
  end if;
end $proof$;
