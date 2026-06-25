-- platform_retrofit_entity_routine.sql
-- Applied 2026-06-24 (Wave 3 tooling). The registry-driven ADDITIVE retrofit (Step 1).
--
-- Idempotent. Detects the org column (organization_id|org_id), refuses on a created_by
-- TYPE collision (caller renames to created_by_kind first), adds the missing standard
-- columns, backfills org by strategy (personal | parent | keep) + created_by from the
-- owner column, swaps the legacy updated-at trigger for the shared _touch_row/_stamp_actor,
-- and self-verifies (0 null org / 0 null created_by). RLS flip, history capture, NOT NULL,
-- and drops are SEPARATE gated steps — never in here.
--
-- Usage: select platform.retrofit_entity('cx_message','message','parent','user_id','cx_conversation','conversation_id', null);

create or replace function platform.retrofit_entity(
  p_table           text,
  p_token           text,
  p_org_strategy    text default 'parent',
  p_owner_col       text default 'user_id',
  p_parent_table    text default null,
  p_parent_fk       text default null,
  p_legacy_trigger  text default null
) returns text
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_tbl text := format('public.%I', p_table);
  v_orgcol text; v_parent_orgcol text; v_cbt text;
  v_has_owner boolean; v_has_updated_at boolean; v_has_version boolean;
  v_null_org int; v_null_cb int := 0;
begin
  if to_regclass(v_tbl) is null then raise exception 'retrofit_entity: % not found', v_tbl; end if;

  select column_name into v_orgcol from information_schema.columns
   where table_schema='public' and table_name=p_table and column_name in ('organization_id','org_id') limit 1;
  if v_orgcol is null then v_orgcol := 'organization_id'; end if;

  select data_type into v_cbt from information_schema.columns
   where table_schema='public' and table_name=p_table and column_name='created_by';
  if v_cbt is not null and v_cbt <> 'uuid' then
    raise exception 'retrofit_entity(%): created_by is % (not uuid). Rename it to created_by_kind first, then re-run.', p_table, v_cbt;
  end if;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name=p_owner_col)  into v_has_owner;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name='updated_at') into v_has_updated_at;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name='version')    into v_has_version;

  execute format('alter table %s add column if not exists %I uuid', v_tbl, v_orgcol);
  execute format('alter table %s add column if not exists created_by uuid', v_tbl);
  execute format('alter table %s add column if not exists updated_by uuid', v_tbl);
  if not v_has_updated_at then execute format('alter table %s add column if not exists updated_at timestamptz not null default now()', v_tbl); end if;
  if not v_has_version    then execute format('alter table %s add column if not exists version integer not null default 1', v_tbl); end if;

  if p_legacy_trigger is not null then execute format('drop trigger if exists %I on %s', p_legacy_trigger, v_tbl); end if;
  execute format('drop trigger if exists _touch_row on %s', v_tbl);
  execute format('drop trigger if exists _stamp_actor on %s', v_tbl);

  if v_has_owner then
    execute format('update %s set created_by = %I where created_by is null', v_tbl, p_owner_col);
  end if;

  if p_org_strategy = 'personal' then
    if not v_has_owner then raise exception 'retrofit_entity(%): personal strategy needs owner col %', p_table, p_owner_col; end if;
    execute format($q$update %s t set %I = (select o.id from public.organizations o where o.is_personal and o.created_by = t.%I order by o.created_at limit 1) where t.%I is null$q$,
      v_tbl, v_orgcol, p_owner_col, v_orgcol);
  elsif p_org_strategy = 'parent' then
    if p_parent_table is null or p_parent_fk is null then raise exception 'retrofit_entity(%): parent strategy needs parent_table + parent_fk', p_table; end if;
    select column_name into v_parent_orgcol from information_schema.columns
     where table_schema='public' and table_name=p_parent_table and column_name in ('organization_id','org_id') limit 1;
    if v_parent_orgcol is null then raise exception 'retrofit_entity(%): parent % has no org column', p_table, p_parent_table; end if;
    execute format($q$update %s t set %I = p.%I from public.%I p where p.id = t.%I and t.%I is null$q$,
      v_tbl, v_orgcol, v_parent_orgcol, p_parent_table, p_parent_fk, v_orgcol);
  end if;

  execute format('create trigger _touch_row  before insert or update on %s for each row execute function platform._touch_row()', v_tbl);
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_tbl);

  execute format('select count(*) from %s where %I is null', v_tbl, v_orgcol) into v_null_org;
  if v_has_owner then execute format('select count(*) from %s where created_by is null', v_tbl) into v_null_cb; end if;
  if p_org_strategy <> 'keep' and v_null_org > 0 then raise exception 'retrofit_entity(%): % null-org rows remain', p_table, v_null_org; end if;
  if v_null_cb > 0 then raise exception 'retrofit_entity(%): % rows missing created_by', p_table, v_null_cb; end if;

  return format('retrofit_entity(%s) OK — orgcol=%s strategy=%s null_org=%s', p_table, v_orgcol, p_org_strategy, v_null_org);
end $fn$;

revoke all on function platform.retrofit_entity(text,text,text,text,text,text,text) from public;
