-- chair-step: inverse of accesssetup_store_a — drops the six frozen column-answer oracles; nothing live calls them.
-- lane: access-setup-store
-- lock: iam,custom

DROP FUNCTION IF EXISTS custom._legacy_read_mask_at(uuid,boolean,permission_level,text);
DROP FUNCTION IF EXISTS custom._legacy_read_mask_for(uuid,uuid,uuid,permission_level,text);
DROP FUNCTION IF EXISTS custom._legacy_hidden_field_notice(custom.record,text);
DROP FUNCTION IF EXISTS iam._legacy_visible_field_ids(uuid,uuid,uuid,permission_level,text);
DROP FUNCTION IF EXISTS iam._legacy_may_touch_field(uuid,uuid,uuid,permission_level,text);
DROP FUNCTION IF EXISTS iam._legacy_may_touch_field_itself(uuid,uuid,uuid,permission_level,text);
delete from platform.client_callable_door where function_name in ('_legacy_may_touch_field_itself','_legacy_may_touch_field','_legacy_visible_field_ids','_legacy_read_mask_for','_legacy_read_mask_at','_legacy_hidden_field_notice') and schema_name in ('iam','custom');
