-- platform_retrofit_entity_keeps_triggers — applied live 2026-09-28 14:40 UTC (estate-reduction
-- certification; defect found by the AF1 DB-trace checker). Body below is the live
-- pg_get_functiondef, md5 6843e8a06b85ecc98bc76d3135e63492 (was ccdee97ea90762d8afea6ef4d3ecb69e,
-- mirrored in platform_retrofit_entity_fks_not_valid_orphans_refuse.sql).
--
-- Defect: the canonical-trigger step dropped every trigger running platform._stamp_actor /
-- platform._touch_row (by function), then re-created _stamp_actor only for the actor variants
-- (entity/system/restricted) and _touch_row only where updated_at/version are NOT NULL. A
-- component table carrying created_by (communication.dm_messages, sms_media, sms_messages) lost
-- the trigger that stamps who wrote the row. Also `enable trigger user` at the end switched ON
-- every trigger that had been OFF (or ALWAYS/REPLICA) before the call.
-- Fix: every user trigger is snapshotted before anything moves; any dropped canonical trigger the
-- variant rules do not re-attach is restored (canonical name when it had the canonical shape,
-- verbatim otherwise); each trigger's exact on/off state is restored by name; the result names
-- every trigger added and removed; a final check RAISES if a trigger that existed before is gone
-- without its function still attached (p_legacy_trigger, which the caller names, excepted).
-- Applied as four md5-guarded exact replacements on the live body; rolled-back proof on
-- communication.sms_media (old body: trg_stamp_actor gone; new: _stamp_actor kept, a pre-disabled
-- set_updated_at stays disabled) and extend.wbx_pattern (unchanged). Log: common-docs
-- projects/database-estate-reduction/CHANGE-LOG.md.
-- based-on: platform.retrofit_entity(text, text, text, text, text, text, text, text, text, text) 67906d60f97fde528f74925be0076fce8412e9f449ec6f27d3210f309aa49803
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform.retrofit_entity(p_schema text, p_table text, p_token text, p_org_strategy text, p_org_expr text DEFAULT NULL::text, p_owner_col text DEFAULT NULL::text, p_parent_ref text DEFAULT NULL::text, p_parent_fk text DEFAULT NULL::text, p_visibility_expr text DEFAULT NULL::text, p_legacy_trigger text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_rel        text := format('%I.%I', p_schema, p_table);
  v_defer      boolean := platform.provision_defer_base_fks();
  v_fk_sql     text[] := '{}';
  v_fk_names   text[] := '{}';
  v_stmt       text;
  v_orph_col   text;
  v_orph_src   text;
  v_orph_n     bigint;
  v_orph_ids   text;
  v_orph_rows  text;
  v_trig_pre   jsonb := '[]';   -- every user trigger before anything moves: name, function, on/off state, definition
  v_tg         jsonb;
  v_state      text;
  v_trig_add   text[] := '{}';
  v_trig_rm    text[] := '{}';
  v_trig_lost  text[] := '{}';
begin
  -- STRUCTURAL ONLY. This function adds and backfills the base columns, the canonical triggers and
  -- the base FKs. It never creates, drops or regenerates an access rule (RLS policy) — that is
  -- iam.apply_rls, run by the security lanes as its own step. Callers outside those lanes run this,
  -- then, in a SEPARATE transaction, one table per transaction:
  --     select platform.provision_validate_base_contract('<schema>.<table>');
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
  if v_variant not in ('entity','system','restricted','personal','component','ledger','reference') then
    raise exception 'retrofit_entity: token % has rls_variant %, which §6d-3 does not define', p_token, v_variant;
  end if;
  if p_org_strategy is null or p_org_strategy not in ('system','parent','expr','keep') then
    raise exception
      'retrofit_entity(%): org strategy % is not one of system | parent | expr | keep. NO NULL ORG (db-rules §2): the organization a row belongs to is stated by the operation, never inferred by the database, so this function has no default strategy.',
      p_token, coalesce(p_org_strategy,'<null>');
  end if;

  v_shareable := exists (select 1 from platform.shareable_resource_registry
                          where resource_type = p_token and is_active);
  v_actor_req := v_variant in ('entity','system','restricted');
  v_mut_req   := v_variant in ('entity','system','restricted','personal') or v_versioned;
  v_vis_req   := v_variant = 'system' or (v_variant = 'entity' and (v_listed or v_shareable));

  -- ── §6d-3 refusals: never a column the variant forbids ──────────────────────────────────────
  if p_visibility_expr is not null and v_variant in ('component','ledger','reference') then
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
      'retrofit_entity(%): created_by is % (not uuid) on %.%. created_by is the entity''s access key and must FK iam.users; rename the domain column (e.g. to created_by_kind) in its own migration first.',
      p_token, v_cbt, p_schema, p_table;
  end if;

  -- ── ORPHAN ACTORS REFUSE, NEVER BLANK (2026-09-27 plan attack M4) ────────────────────────────
  -- A created_by/updated_by (or the owner column created_by is backfilled from) whose person is not
  -- in iam.users still records who made the row. This function used to set it to NULL so the FK
  -- would fit: a silent loss of ownership. It now refuses before anything moves, with the count and
  -- samples; the caller restores the person or decides the rightful owner in its own migration.
  foreach v_orph_col in array array['created_by','updated_by'] loop
    v_orph_src := null;
    if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname=v_orph_col and not a.attisdropped) then
      if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname=v_orph_col
                        and c.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)) then
        v_orph_src := v_orph_col;
      end if;
    elsif v_orph_col = 'created_by' and v_actor_req and p_owner_col is not null
          and exists (select 1 from information_schema.columns
                       where table_schema=p_schema and table_name=p_table and column_name=p_owner_col and data_type='uuid') then
      v_orph_src := p_owner_col;
    end if;
    continue when v_orph_src is null;
    execute format('select count(*) from %s t where t.%I is not null and not exists (select 1 from iam.users u where u.id = t.%I)',
                   v_tbl::text, v_orph_src, v_orph_src) into v_orph_n;
    if v_orph_n > 0 then
      execute format('select string_agg(x::text, '', '') from (select distinct t.%I x from %s t where t.%I is not null and not exists (select 1 from iam.users u where u.id = t.%I) limit 5) s',
                     v_orph_src, v_tbl::text, v_orph_src, v_orph_src) into v_orph_ids;
      execute format('select string_agg(k, '', '') from (select %s k from %s t where t.%I is not null and not exists (select 1 from iam.users u where u.id = t.%I) limit 5) s',
                     case when exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='id' and not a.attisdropped)
                          then 't.id::text' else 't.ctid::text' end,
                     v_tbl::text, v_orph_src, v_orph_src) into v_orph_rows;
      raise exception using
        errcode = '23503',
        message = format('retrofit_entity(%s): %s row(s) of %s have a %s whose person is not in iam.users',
                         p_token, v_orph_n, v_rel, v_orph_src),
        detail  = format('count=%s; sample person ids: %s; sample rows (%s): %s', v_orph_n, v_orph_ids,
                         case when exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='id' and not a.attisdropped)
                              then 'id' else 'ctid' end, v_orph_rows),
        hint    = 'Nothing was changed. This function never blanks who made a row. Restore the missing people in iam.users, or decide the rightful owner of those rows in their own migration (with a backup), then run the retrofit again.';
    end if;
  end loop;

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
  --  4. 🚨 AND WHAT IT TAKES OFF, IT PUTS BACK (2026-09-28, AF1 checker). The drop-by-function
  --     below used to re-create `_stamp_actor` only for the actor variants and `_touch_row` only
  --     where updated_at/version are NOT NULL — so a COMPONENT table that carried created_by
  --     (communication.dm_messages, sms_media, sms_messages) silently lost the trigger that stamps
  --     who wrote the row. And `enable trigger user` at the end switched ON every trigger that had
  --     been deliberately OFF (or ALWAYS/REPLICA) before. Now: every user trigger is snapshotted
  --     here (function, on/off state, definition); any dropped trigger whose function this function
  --     does not re-attach is restored; each trigger's exact on/off state is restored by name; the
  --     result names every trigger added and removed; and a final check RAISES if any trigger that
  --     existed before is gone without its function still attached (p_legacy_trigger excepted —
  --     the caller named it).
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', tg.tgname, 'fn', tg.tgfoid::regprocedure::text, 'proname', pr.proname,
           'nsp', pr.pronamespace::regnamespace::text, 'enabled', tg.tgenabled::text,
           'def', pg_get_triggerdef(tg.oid)) order by tg.tgname), '[]'::jsonb)
    into v_trig_pre
    from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
   where tg.tgrelid = v_tbl and not tg.tgisinternal;
  execute format('alter table %s disable trigger user', v_tbl::text);
  for v_trig in select tg.tgname from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
                 where tg.tgrelid = v_tbl and not tg.tgisinternal
                   and pr.pronamespace = 'platform'::regnamespace
                   and pr.proname in ('_touch_row','_stamp_actor')
  loop
    execute format('drop trigger if exists %I on %s', v_trig, v_tbl::text);
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
    v_fk_names := array_append(v_fk_names, left(format('%s_%s_organization_id_fkey', p_schema, p_table), 63));
    v_fk_sql := array_append(v_fk_sql, format('alter table %s add constraint %I foreign key (organization_id) references iam.organizations(id)%s',
                   v_tbl::text, left(format('%s_%s_organization_id_fkey', p_schema, p_table), 63), case when v_defer then ' not valid' else '' end));
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
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='created_by' and c.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)) then
    v_fk_names := array_append(v_fk_names, left(format('%s_%s_created_by_fkey', p_schema, p_table), 63));
    v_fk_sql := array_append(v_fk_sql, format('alter table %s add constraint %I foreign key (created_by) references iam.users(id)%s',
                   v_tbl::text, left(format('%s_%s_created_by_fkey', p_schema, p_table), 63), case when v_defer then ' not valid' else '' end));
    v_did := array_append(v_did, 'created_by FK -> iam.users');
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid=v_tbl and a.attname='updated_by' and not a.attisdropped)
     and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
                      where c.conrelid=v_tbl and c.contype='f' and a.attname='updated_by' and c.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)) then
    v_fk_names := array_append(v_fk_names, left(format('%s_%s_updated_by_fkey', p_schema, p_table), 63));
    v_fk_sql := array_append(v_fk_sql, format('alter table %s add constraint %I foreign key (updated_by) references iam.users(id)%s',
                   v_tbl::text, left(format('%s_%s_updated_by_fkey', p_schema, p_table), 63), case when v_defer then ' not valid' else '' end));
    v_did := array_append(v_did, 'updated_by FK -> iam.users');
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
  end if;
  if v_actor_req then
    execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_tbl::text);
  end if;
  select (exists (select 1 from information_schema.columns
                   where table_schema=p_schema and table_name=p_table and is_nullable='NO'
                     and column_name in ('updated_at','version')))
    into function_has;
  if function_has then
    execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_tbl::text);
  end if;
  -- a canonical trigger that was on the table and that the variant rules above did not re-attach
  -- comes back: under its canonical name when it had the canonical shape, verbatim otherwise.
  for v_tg in select e from jsonb_array_elements(v_trig_pre) e
               where e->>'nsp' = 'platform' and e->>'proname' in ('_touch_row','_stamp_actor')
  loop
    continue when exists (select 1 from pg_trigger tg where tg.tgrelid = v_tbl and not tg.tgisinternal
                            and tg.tgfoid = (v_tg->>'fn')::regprocedure);
    if replace(v_tg->>'def', format('CREATE TRIGGER %s ', quote_ident(v_tg->>'name')), 'CREATE TRIGGER x ')
       = format('CREATE TRIGGER x BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION platform.%s()', v_tbl::text, v_tg->>'proname')
       and not exists (select 1 from pg_trigger tg where tg.tgrelid = v_tbl and tg.tgname = v_tg->>'proname') then
      execute format('create trigger %I before insert or update on %s for each row execute function platform.%I()',
                     v_tg->>'proname', v_tbl::text, v_tg->>'proname');
    else
      execute v_tg->>'def';
    end if;
  end loop;

  -- every trigger back to the exact on/off state it had; one this function created stays on
  for v_trig in select tg.tgname from pg_trigger tg where tg.tgrelid = v_tbl and not tg.tgisinternal loop
    select e->>'enabled' into v_state from jsonb_array_elements(v_trig_pre) e where e->>'name' = v_trig;
    v_state := coalesce(v_state, 'O');
    execute format('alter table %s %s trigger %I', v_tbl::text,
                   case v_state when 'O' then 'enable' when 'A' then 'enable always'
                                when 'R' then 'enable replica' else 'disable' end, v_trig);
  end loop;

  -- the trigger ledger: every trigger added or removed is named, and none is lost
  select coalesce(array_agg(format('%s (%s)', tg.tgname, tg.tgfoid::regprocedure) order by tg.tgname), '{}')
    into v_trig_add
    from pg_trigger tg
   where tg.tgrelid = v_tbl and not tg.tgisinternal
     and not exists (select 1 from jsonb_array_elements(v_trig_pre) e where e->>'name' = tg.tgname);
  select coalesce(array_agg(format('%s (%s)', e->>'name', e->>'fn') order by e->>'name'), '{}')
    into v_trig_rm
    from jsonb_array_elements(v_trig_pre) e
   where not exists (select 1 from pg_trigger tg where tg.tgrelid = v_tbl and not tg.tgisinternal and tg.tgname = e->>'name');
  select coalesce(array_agg(format('%s (%s)', e->>'name', e->>'fn') order by e->>'name'), '{}')
    into v_trig_lost
    from jsonb_array_elements(v_trig_pre) e
   where e->>'name' is distinct from p_legacy_trigger
     and not exists (select 1 from pg_trigger tg where tg.tgrelid = v_tbl and not tg.tgisinternal
                       and tg.tgfoid = (e->>'fn')::regprocedure);
  if cardinality(v_trig_lost) > 0 then
    raise exception
      'retrofit_entity(%): would remove trigger(s) % from % without attaching the same function again. A retrofit never takes away a trigger that stamps or owns data. Nothing was changed.',
      p_token, array_to_string(v_trig_lost, ', '), v_rel;
  end if;
  if cardinality(v_trig_add) > 0 then
    v_did := array_append(v_did, 'triggers added: ' || array_to_string(v_trig_add, ', '));
  end if;
  if cardinality(v_trig_rm) > 0 then
    v_did := array_append(v_did, 'triggers removed: ' || array_to_string(v_trig_rm, ', '));
  end if;

  -- ── THE BASE FKs GO ON LAST, NOT VALID (2026-09-27 plan attack B1) ───────────────────────────
  -- Adding a FK takes SHARE ROW EXCLUSIVE on the REFERENCED table (iam.users, iam.organizations)
  -- until the transaction ends, and a validated add also scans this table while holding it: every
  -- sign-up and sign-in write queues behind that. So the FKs are the last statements this function
  -- runs, added NOT VALID (no scan), and recorded in platform.provision_base_contract_pending.
  -- Validation is a SEPARATE call in its own transaction, one table per transaction:
  --     select platform.provision_validate_base_contract('<schema>.<table>');
  -- VALIDATE takes SHARE UPDATE EXCLUSIVE here and ROW SHARE on the referenced table, so it never
  -- blocks a sign-in. Until it runs, iam.verify_canonical FAILs the base FK checks.
  -- matrx.provision_defer_base_fks = 'off' (a rolled-back rehearsal only) builds them validated.
  foreach v_stmt in array v_fk_sql loop
    execute v_stmt;
  end loop;
  if cardinality(v_fk_sql) > 0 and v_defer then
    insert into platform.provision_base_contract_pending (relation, token, attached_at, detail)
    values (v_rel, p_token, now(), jsonb_build_object('source', 'retrofit_entity', 'not_valid', to_jsonb(v_fk_names)))
    on conflict (relation) do update
      set token = excluded.token, attached_at = excluded.attached_at, validated_at = null,
          detail = platform.provision_base_contract_pending.detail || excluded.detail;
    v_did := array_append(v_did, format('FKs added NOT VALID; validate next, in its own transaction: select platform.provision_validate_base_contract(%L)', v_rel));
  end if;

  return format('retrofit_entity(%s.%s / token %s / variant %s) OK — org strategy %s, null_org 0. Changed: %s',
                p_schema, p_table, p_token, v_variant, p_org_strategy,
                case when cardinality(v_did)=0 then 'nothing (already canonical)' else array_to_string(v_did, ', ') end);
end
$function$
;
