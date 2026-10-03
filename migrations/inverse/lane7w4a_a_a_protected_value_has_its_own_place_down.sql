-- inverse of lane7w4a_a_a_protected_value_has_its_own_place.sql — refused while a protected value exists (nothing is ever dropped with data in it).
set local lock_timeout = '3s';
do $$
begin
  if to_regclass('custom.entity_protected_value') is not null
     and (exists (select 1 from custom.entity_protected_value) or exists (select 1 from custom.entity_protected_value_version)) then
    raise exception 'Protected values exist; this inverse would drop them. Nothing was changed.' using errcode = '55000';
  end if;
end $$;
DELETE FROM platform.entity_types WHERE token IN ('entity_protected_value', 'entity_protected_value_version');
DROP TABLE IF EXISTS custom.entity_protected_value_version;
DROP TABLE IF EXISTS custom.entity_protected_value;
DELETE FROM platform.feature_knob WHERE feature = 'custom' AND key = 'protected_field_rules';
