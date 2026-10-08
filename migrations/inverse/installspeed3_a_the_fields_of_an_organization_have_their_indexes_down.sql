-- chair-step: the inverse of migrations/campaign/installspeed3_a_the_fields_of_an_organization_have_their_indexes.sql (lane TEMPLATE-INSTALL-SLOW) — drops the 32 partial field-kernel indexes it added, concurrently. Nothing of anybody's data is touched.
-- lock: custom
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.

drop index concurrently if exists custom.record_fieldkernel_token_rp_00;
drop index concurrently if exists custom.record_fieldkernel_token_rp_01;
drop index concurrently if exists custom.record_fieldkernel_token_rp_02;
drop index concurrently if exists custom.record_fieldkernel_token_rp_03;
drop index concurrently if exists custom.record_fieldkernel_token_rp_04;
drop index concurrently if exists custom.record_fieldkernel_token_rp_05;
drop index concurrently if exists custom.record_fieldkernel_token_rp_06;
drop index concurrently if exists custom.record_fieldkernel_token_rp_07;
drop index concurrently if exists custom.record_fieldkernel_token_rp_08;
drop index concurrently if exists custom.record_fieldkernel_token_rp_09;
drop index concurrently if exists custom.record_fieldkernel_token_rp_10;
drop index concurrently if exists custom.record_fieldkernel_token_rp_11;
drop index concurrently if exists custom.record_fieldkernel_token_rp_12;
drop index concurrently if exists custom.record_fieldkernel_token_rp_13;
drop index concurrently if exists custom.record_fieldkernel_token_rp_14;
drop index concurrently if exists custom.record_fieldkernel_token_rp_15;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_00;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_01;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_02;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_03;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_04;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_05;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_06;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_07;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_08;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_09;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_10;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_11;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_12;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_13;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_14;
drop index concurrently if exists custom.record_fieldkernel_def_key_rp_15;
