-- chair-step: declares ONE platform.client_callable_door row — custom.agg_calendar(uuid), the read of an
--   organization's two calendar knobs (time zone, first day of the week) — and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated`.
--   notionsmall4_b_the_calendar_reads_the_organizations_week.sql carries a bare GRANT, the one shape the
--   production allow-list refuses by name, so the grant never landed: opening Calendar logged
--   "permission denied for function agg_calendar" (403) for every signed-in person. Nothing is replaced,
--   dropped or revoked; `anon` gains nothing. The inverse is
--   `migrations/inverse/make_viewdup_b_the_calendar_door_is_declared_down.sql`.
-- lock: custom,platform
-- lane: MAKE-VIEWS-DEDUPE

set local lock_timeout = '2s';
set local statement_timeout = '60s';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'agg_calendar', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'The organization''s two calendar knobs (time zone, first day of the week) as one object. Reads only those two knobs of the organization named, so the calendar and timeline views start their weeks on the organization''s day.',
   'make_viewdup_b_the_calendar_door_is_declared.sql', null, true, false)
on conflict do nothing;

select custom.reopen_declared_doors();
