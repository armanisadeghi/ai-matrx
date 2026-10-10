-- chair-step: inverse of accesssetup_a — drops the two access-setup tables (iam.access_setup, iam.record_seat_change), their registry rows and the subject-column exemption. Run accesssetup_b's inverse (and every later accesssetup_* inverse) first; this destroys any per-record seat changes people made.
-- lane: access-setup
-- lock: iam

delete from meta.audit_exemption
 where check_name = 'legacy_owner_col' and schema_name = 'iam' and table_name = 'record_seat_change';
drop table if exists iam.record_seat_change;
delete from platform.entity_types where token = 'iam_record_seat_change';
drop table if exists iam.access_setup;
delete from platform.entity_types where token = 'iam_access_setup';
