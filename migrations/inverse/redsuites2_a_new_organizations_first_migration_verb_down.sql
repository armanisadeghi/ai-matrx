-- autocommit: yes
--
-- chair-step: it drops the index RED-SUITES-2 added to history.row_versions and its 29
--   partition indexes. DROP INDEX CONCURRENTLY takes no lock against writers. It removes an
--   index and nothing else.
--
-- Running this puts back a full 7 GB scan on the first Migration verb any organization with no
-- history yet ever runs.

drop index concurrently if exists history.rv_org_latest_idx;
drop index concurrently if exists history.row_versions_2025_11_org_latest_idx;
drop index concurrently if exists history.row_versions_2025_12_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_01_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_02_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_03_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_04_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_05_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_06_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_07_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_08_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_09_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_10_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_11_org_latest_idx;
drop index concurrently if exists history.row_versions_2026_12_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_01_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_02_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_03_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_04_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_05_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_06_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_07_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_08_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_09_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_10_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_11_org_latest_idx;
drop index concurrently if exists history.row_versions_2027_12_org_latest_idx;
drop index concurrently if exists history.row_versions_2028_01_org_latest_idx;
drop index concurrently if exists history.row_versions_2028_02_org_latest_idx;
drop index concurrently if exists history.row_versions_default_org_latest_idx;
