-- chair-step: it DROPS the two archive doors, their client_callable_door rows, the index,
--   the check constraint and the three archived_* columns of platform.feature_knob. That is
--   the whole point of an inverse — it takes the archive away, which puts the six retired
--   registrations back on every settings screen. It destroys no data anybody entered: the
--   only rows it touches are the two door declarations this lane inserted, and the only
--   values it loses are the archive stamps the up migration wrote.
-- THE INVERSE of migrations/campaign/settings3_a_retired_knob_is_archived_not_deleted.sql.
-- It drops the two doors and the three columns, which puts the six archived registrations
-- back on every settings screen and back in front of the settings guards, exactly as they
-- were. Nothing else in the registry is touched: the columns are the only place the archive
-- was ever recorded.

set lock_timeout = '2s';

-- The door declarations go with the doors. Leaving them would make a re-apply of the up
-- migration insert a SECOND copy of each row: platform.client_callable_door has no unique
-- key on (schema_name, function_name, identity_args), so its `on conflict do nothing`
-- cannot catch a duplicate.
delete from platform.client_callable_door
 where schema_name = 'platform' and function_name in ('knob_archive', 'knob_unarchive');

drop function if exists platform.knob_unarchive(text, text);
drop function if exists platform.knob_archive(text, text, text, text);
drop index if exists platform.feature_knob_live_idx;
alter table platform.feature_knob drop constraint if exists feature_knob_archived_says_why;
alter table platform.feature_knob
  drop column if exists archived_by,
  drop column if exists archived_reason,
  drop column if exists archived_at;
