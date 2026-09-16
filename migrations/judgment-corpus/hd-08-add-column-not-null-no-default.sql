-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- ADD COLUMN ... NOT NULL with no DEFAULT rewrites and locks the whole table and fails on
-- existing rows. `additive` is not the same word as `safe`.
--
alter table custom.zz_thing add column zz_required text not null;
