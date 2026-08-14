-- Producer-level suppression for platform.assists.
--
-- `suppressed_until` stays the ONE suppression lifecycle field:
--   finite timestamp = one assist is snoozed until then
--   Postgres infinity = this source_key is silenced until the user reverses it
--
-- The mandatory human reason uses the existing base `metadata` field, leaving
-- `decision_note` exclusively for an assist decision. No new status, column,
-- or preference table is introduced. Existing suppressed rows are the visible
-- and reversible record, and this INSERT trigger makes that record govern
-- future rows from the same producer as well. Without the trigger, a newly
-- discovered dedupe_key would immediately punch through the user's mute.
--
-- System-of-record:
-- /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md

begin;

create index if not exists assists_source_suppression_idx
  on platform.assists (user_id, source_key)
  where suppressed_until = 'infinity'::timestamptz;

create or replace function private.inherit_assist_source_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
      from platform.assists a
     where a.user_id = new.user_id
       and a.source_key = new.source_key
       and a.suppressed_until = 'infinity'::timestamptz
  ) then
    new.suppressed_until := 'infinity'::timestamptz;
  end if;

  return new;
end;
$$;

drop trigger if exists _inherit_source_suppression on platform.assists;
create trigger _inherit_source_suppression
  before insert on platform.assists
  for each row execute function private.inherit_assist_source_suppression();

commit;
