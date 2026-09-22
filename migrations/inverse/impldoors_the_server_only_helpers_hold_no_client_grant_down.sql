-- chair-step: SIX GRANTs. This is the inverse of
-- impldoors_the_server_only_helpers_hold_no_client_grant.sql and it hands `authenticated`
-- back EXECUTE on six server-only helpers -- which is the defect that file removed, put
-- back exactly. Running it restores `check:impl-doors:strict` to RED on D16a (2 rows) and
-- D18 (2 closed helpers reached through iam.verify_canonical). An inverse restores a
-- defect; it does not pretend to be an improvement.
--
-- ground-standing-ok: a b c d
--   (a) drops no function, so no trigger is left over a missing body.
--   (b) calls nothing a sibling inverse takes away.
--   (c) restores no body: this file changes GRANTS only.
--   (d) removes no object a later migration adopted.

grant execute on function platform.link_trigger_is_attached(text, text, text) to authenticated;
grant execute on function platform.notice_link_trigger_is_attached() to authenticated;
grant execute on function iam.verify_canonical(text, text, text, text) to authenticated;
grant execute on function iam.verify_canonical_ok(text, text, text, text) to authenticated;
grant execute on function iam.canonical_certify(text, text, text) to authenticated;
grant execute on function iam.canonical_certify_ok(text, text, text) to authenticated;
