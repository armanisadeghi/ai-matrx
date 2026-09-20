-- additive: yes
--
-- chair-step: it DECLARES three SECURITY INVOKER functions of schema `custom`
--   (`custom.page_ceiling`, `custom.export_ceiling`, `custom.page_size`) as doors a SIGNED-IN
--   caller may reach, and then GRANTS EXECUTE on them to `authenticated` — the declaration first
--   and the grant after it, which is the order both DDL guards insist on. Nothing is created,
--   replaced or dropped and no data is touched. None of the three is SECURITY DEFINER, so none of
--   them can widen anything: each runs with the CALLER's own privileges and reads exactly what
--   that caller could already read — the knob register, which `authenticated` already holds
--   SELECT on and already reaches through `platform.knob_resolve` and `custom.store_is_open`.
--   `anon` is NOT granted: the only anonymous lane that decides a page size,
--   `custom.anon_submissions`, is SECURITY DEFINER, so the decision inside it runs as the definer.
--   The inverse is
--   `migrations/inverse/writeperf_the_page_decision_is_declared_then_granted_down.sql`.
--
-- WRITE-PERF — A GRANT THAT DID NOT STICK, AND THE LINE THAT MADE IT STICK.
--
-- `writeperf_the_page_decision_is_executable_by_the_person.sql` issued the grant at 21:22:03Z,
-- reported `[ OK ] Applied and ledgered`, and the grant WAS NOT THERE afterwards:
--
--     proacl of custom.page_size  ->  {postgres=X/postgres}
--
-- Schema `custom` is a closed schema: a client EXECUTE grant on a function with no
-- `platform.client_callable_door` row is swept back in the same DDL command, and the previous
-- file had DELETED those three rows on the reasoning that a SECURITY INVOKER function has no
-- definer privilege to declare. The register is not only about definer privilege — it is the
-- list of what a browser may call at all, and a function a browser calls belongs on it whichever
-- way round its security bit is set. `custom.store_is_open` is the precedent, sitting there with
-- exactly this shape.
--
-- THE LESSON, because it has now cost two files: `[ OK ] Applied and ledgered` from the runner
-- means the statements executed, NOT that they had the effect you wanted. The grant is checked
-- with `has_function_privilege` afterwards, every time.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers)
values
  ('custom', 'page_ceiling', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/writeperf_the_page_decision_is_declared_then_granted.sql (lane WRITE-PERF)',
   'PAGE-1: SECURITY INVOKER. It reads one knob row for the organization with the caller''s own privileges and returns an integer. p_organization_id NULL means the platform value, which is what a caller standing outside any organization gets; a foreign id and an invented one both answer the platform value, so there is nothing here to tell them apart with. It names no record, no Table and no person.',
   false, true),
  ('custom', 'export_ceiling', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/writeperf_the_page_decision_is_declared_then_granted.sql (lane WRITE-PERF)',
   'PAGE-1: SECURITY INVOKER. One knob row for the organization, read with the caller''s own privileges, answered as an integer. p_organization_id NULL means the platform value. It names no record, no Table and no person.',
   false, true),
  ('custom', 'page_size', 'p_organization_id uuid, p_door text, p_limit integer, p_default integer, p_ceiling integer',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid, 'int4'::regtype::oid, 'int4'::regtype::oid],
   'migrations/campaign/writeperf_the_page_decision_is_declared_then_granted.sql (lane WRITE-PERF)',
   'PAGE-1: SECURITY INVOKER. It turns one integer into another from two knob rows read with the caller''s own privileges. p_organization_id is used for nothing but resolving the ceiling knob and a NULL one takes the platform ceiling; it reads no record, opens nothing, and returns no data of anybody''s. The door that called it has already decided who is standing there — this is the page decision inside it, not a door of its own.',
   false, true)
on conflict (schema_name, function_name, identity_argtypes) do update
  set signed_in_callers = excluded.signed_in_callers,
      anonymous_callers = excluded.anonymous_callers,
      non_client_lane   = null,
      reason            = excluded.reason,
      declared_by       = excluded.declared_by;

grant execute on function custom.page_ceiling(uuid) to authenticated;
grant execute on function custom.export_ceiling(uuid) to authenticated;
grant execute on function custom.page_size(uuid, text, integer, integer, integer) to authenticated;
