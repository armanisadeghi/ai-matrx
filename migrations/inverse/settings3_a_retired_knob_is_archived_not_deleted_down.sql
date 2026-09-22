-- additive: no
-- THE INVERSE of migrations/campaign/settings3_a_retired_knob_is_archived_not_deleted.sql.
-- It drops the two doors and the three columns, which puts the six archived registrations
-- back on every settings screen and back in front of the settings guards, exactly as they
-- were. Nothing else in the registry is touched: the columns are the only place the archive
-- was ever recorded.

set lock_timeout = '4s';

drop function if exists platform.knob_unarchive(text, text);
drop function if exists platform.knob_archive(text, text, text, text);
drop index if exists platform.feature_knob_live_idx;
alter table platform.feature_knob drop constraint if exists feature_knob_archived_says_why;
alter table platform.feature_knob
  drop column if exists archived_by,
  drop column if exists archived_reason,
  drop column if exists archived_at;
