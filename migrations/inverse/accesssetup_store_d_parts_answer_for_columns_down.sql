-- chair-step: inverse of accesssetup_store_d — drops the Store Tables part answers and the column panel doors; no door calls them before the swap.
-- lane: access-setup-store
-- lock: custom,iam

drop function if exists custom._store_cell_per_row(jsonb);
drop function if exists custom.store_field_part(jsonb);
drop function if exists custom.field_access_set(uuid,text,text);
drop function if exists custom.field_access_setup(uuid,jsonb);
drop function if exists custom._store_person_card(uuid);
drop function if exists custom.store_part_notice(custom.record,text);
drop function if exists custom.store_part_who(jsonb,text);
drop function if exists iam.parts_visible_for(uuid,uuid,permission_level);
drop function if exists iam.part_may_edit(uuid,uuid,uuid);
drop function if exists iam.part_may_read(uuid,uuid,uuid);
drop function if exists iam.part_may_touch(uuid,uuid,uuid,permission_level,text);
drop function if exists custom._store_column_itself(uuid,uuid,uuid,uuid,permission_level,text);
drop function if exists custom._store_portal_allows(uuid,uuid,uuid,text);
drop function if exists custom._store_part_cells(uuid,uuid,text,text);
delete from platform.client_callable_door where schema_name in ('custom','iam') and function_name in ('_store_part_cells','_store_portal_allows','_store_column_itself','part_may_touch','part_may_read','part_may_edit','parts_visible_for','store_part_who','store_part_notice','_store_person_card','field_access_setup','field_access_set','store_field_part','_store_cell_per_row');
