-- Timed source quiet — the insert trigger must inherit a WINDOW, not just
-- `infinity`.
--
-- `private.inherit_assist_source_suppression()` only ever looked for
-- `suppressed_until = 'infinity'`, so "quiet this kind until I turn it back
-- on" survived a producer's next dedupe key but "quiet this kind for four
-- hours" did NOT: the very next sweep inserted a fresh row that punched
-- straight through the mute. A mute that lasts until the next cron tick is
-- worse than no mute, because the user believes it worked.
--
-- The generalised rule: a new row inherits the FURTHEST-FUTURE suppression
-- still in force on that (user, source) — `infinity` sorts last, so the old
-- behaviour is a strict special case. Only rows carrying the
-- `metadata.source_suppression` record count, so an ordinary per-assist
-- snooze can never silence a whole producer by accident.

create or replace function private.inherit_assist_source_suppression()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_until timestamptz;
begin
  select max(a.suppressed_until)
    into v_until
    from platform.assists a
   where a.user_id = new.user_id
     and a.source_key = new.source_key
     and a.suppressed_until > pg_catalog.clock_timestamp()
     and a.metadata ? 'source_suppression';

  if v_until is not null then
    new.suppressed_until := v_until;
  end if;

  return new;
end;
$function$;
