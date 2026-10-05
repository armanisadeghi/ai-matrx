-- draft: apply only in the 01:00-04:00 PT window (announced): DROP TRIGGER requests ACCESS EXCLUSIVE on every auth.* table (a sign-in lock, measured on the clone 2026-10-03).
-- chair-step: lane FINISH-THE-SWITCH sublane FTS-3, ONE-HOME wave 4 SOAK 4-LAST: the switch-back restore trigger on deprecated.udt_datasets (DISABLED today) is dropped.
-- It refused a restore of a moved table unless "Switch back"; the undo was retired 2026-10-01 20:08Z and the table's write refusal stays.
-- workbench._moved_older_table_restores_with_switch_back() is left (a trigger function with no door row); drop it in a later file once nothing names it.
set local lock_timeout = '2s';
drop trigger if exists _moved_older_table_restores_with_switch_back on deprecated.udt_datasets;
