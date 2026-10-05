-- chair-step: lane FINISH-THE-SWITCH sublane FTS-3, ONE-HOME wave 5: platform.flexible_data, platform.custom_entity_definition and platform.custom_record move to `deprecated` (old gone, never dropped; every row kept).
-- One transaction: the two doors leave, the search projection (33 search rows) is removed and its trigger disabled, the foreign keys out of the three tables into live schemas drop,
-- the three registry rows are retired, and the tables move and lose their client grants. Plan: common-docs projects/data-doctrine-adoption/v6/FLEXIBLE-DATA-RETIREMENT-PLAN.md §4.
-- Preconditions are checked here and refused by name: no table gained a row since the census; no foreign key from a live table points into the three (lane 7's two are gone).
-- Not re-bodied (the plan's step 2 tail): platform.search_item_backfill / search_item_parity / platform._t13_allowlist keep their flexible_data branch; it errors only when called with that token.
-- Locks: ACCESS EXCLUSIVE on the three tables (nothing reads them), brief SHARE ROW EXCLUSIVE on the tables the dropped foreign keys pointed at. lock_timeout 3s.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $pre$
declare v text;
begin
  if exists (select 1 from platform.custom_entity_definition) or exists (select 1 from platform.custom_record) then
    raise exception 'refused: custom_entity_definition / custom_record gained rows since the census (were 0); find the writer first';
  end if;
  select string_agg(k.conrelid::regclass::text || '.' || k.conname, ', ') into v
    from pg_constraint k
   where k.contype = 'f'
     and k.confrelid in ('platform.flexible_data'::regclass, 'platform.custom_entity_definition'::regclass, 'platform.custom_record'::regclass)
     and k.conrelid not in ('platform.custom_record'::regclass, 'platform.flexible_data'::regclass, 'platform.custom_entity_definition'::regclass);
  if v is not null then
    raise exception 'refused: a live table still has a foreign key into the retiring tables (lane 7 drops its own): %', v;
  end if;
end
$pre$;

-- 1. the search projection (33 rows; its trigger is disabled, not dropped) and the doors
-- DROP TRIGGER takes ACCESS EXCLUSIVE on 23 auth/storage/realtime relations (a sign-in freeze); DISABLE takes none. The trigger and its function stay with the moved table, inert.
alter table platform.flexible_data disable trigger _search_item_sync;
select platform._search_item_drop('flexible_data', id) from platform.flexible_data;
delete from platform.client_callable_door where function_name in ('flexible_data_write', 'flexible_data_archive');
drop function if exists public.flexible_data_write(uuid, jsonb, uuid);
drop function if exists public.flexible_data_archive(uuid, uuid);

-- 2. the foreign keys into live schemas (custom_record -> custom_entity_definition stays: both ends move together)
alter table platform.custom_entity_definition drop constraint if exists custom_entity_definition_created_by_fkey;
alter table platform.custom_entity_definition drop constraint if exists custom_entity_definition_organization_id_fkey;
alter table platform.custom_entity_definition drop constraint if exists custom_entity_definition_updated_by_fkey;
alter table platform.custom_record drop constraint if exists custom_record_created_by_fkey;
alter table platform.custom_record drop constraint if exists custom_record_organization_id_fkey;
alter table platform.custom_record drop constraint if exists custom_record_updated_by_fkey;
alter table platform.flexible_data drop constraint if exists flexible_data_category_id_fkey;
alter table platform.flexible_data drop constraint if exists flexible_data_created_by_fkey;
alter table platform.flexible_data drop constraint if exists flexible_data_created_by_fkey_p;
alter table platform.flexible_data drop constraint if exists flexible_data_organization_id_fkey;
alter table platform.flexible_data drop constraint if exists flexible_data_updated_by_fkey;
alter table platform.flexible_data drop constraint if exists flexible_data_updated_by_fkey_p;

-- 3. retire the registry rows
update platform.entity_types
   set is_active = false, type = 'deprecated', custom_fields_enabled = false, reference_pickable = false
 where token in ('flexible_data', 'custom_entity_definition', 'custom_record') and is_active;
update platform.shareable_resource_registry set is_active = false
 where resource_type in ('flexible_data', 'custom_entity_definition', 'custom_record') and is_active;

-- 4. the move
-- the definition moves first: the deprecated boundary refuses a retired table whose foreign key points at a live one
alter table platform.custom_entity_definition set schema deprecated;
alter table platform.custom_record            set schema deprecated;
alter table platform.flexible_data            set schema deprecated;
revoke all on table deprecated.custom_entity_definition, deprecated.custom_record, deprecated.flexible_data from anon, authenticated;

update platform.deprecated_relations set archived_as = 'deprecated.custom_entity_definition'
 where old_ref = 'platform.custom_entity_definition' and archived_as is null;
update platform.deprecated_relations set archived_as = 'deprecated.custom_record'
 where old_ref = 'platform.custom_record' and archived_as is null;
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
select 'platform.flexible_data', 'content_ir.kind_definition', 'deprecated.flexible_data',
       'wave 5 (ONE-HOME): kinds live in content_ir (lane 12 proof one, 2026-10-02); all 31 kind rows already there, 4 test rows'
 where not exists (select 1 from platform.deprecated_relations where old_ref = 'platform.flexible_data');
