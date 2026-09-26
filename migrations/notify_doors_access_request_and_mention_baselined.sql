-- Two caller-gated notification doors join the reviewed baseline of client-reachable
-- notification doors (CHECK 35, hr_l3_107). Both insert into communication.notification,
-- so they entered the derived door set as "neither credentialed nor baselined" and failed
-- `HR punch write path` (surfaced as hr-punch-write-path-client-direct-insert-into-hr-punch;
-- no hr.punch writer is involved — the punch-specific checks all pass).
--
-- Reviewed 2026-09-25; anon holds no EXECUTE on either:
--  · public.access_request_blind — refuses without auth.uid(); files the ask through
--    public.access_request_create (the canonical access-request path) only when the caller
--    LACKS viewer on a live record, and notifies only the recipients that path returns, in
--    the request's own organization. The caller's answer never reveals whether the record
--    exists.
--  · public.cmt_mention_notify — refuses unless the caller authored the comment; notifies a
--    mentioned person only if they hold viewer on the comment's parent record and have not
--    switched comment.mention off; the deep link must be an in-app path.

insert into hr.notify_outsider_door_baseline (schema_name, function_name, identity_args, anon_ok, reason)
values
  ('public','access_request_blind','p_type text, p_id uuid, p_message text, p_href text', false,
   'Caller-gated: auth.uid() required; files via access_request_create only when the caller lacks viewer, notifies only the owners that path returns, in the request''s org. anon has no EXECUTE.'),
  ('public','cmt_mention_notify','p_comment_id uuid, p_recipients uuid[], p_deep_link text', false,
   'Caller-gated: only the comment''s author (auth.uid()) may send; each recipient must hold viewer on the parent record and have comment.mention on. anon has no EXECUTE.')
on conflict (schema_name, function_name, identity_args) do nothing;
