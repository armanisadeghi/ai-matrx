-- chair-step: unarchives exactly the four knobs SHEET-LEFTOVERS item 3 archived and clears the retired mark on the two kept overrides
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_c_the_four_sheet_knobs_are_archived_not_deleted_down';

update platform.feature_knob set
  archived_at = null, archived_reason = null, archived_by = null, updated_at = now()
 where archived_by = 'SHEET-LEFTOVERS (2026-10-07)';

update platform.knob_override set
  metadata = metadata - 'retired'
 where metadata -> 'retired' ->> 'by' = 'SHEET-LEFTOVERS';
