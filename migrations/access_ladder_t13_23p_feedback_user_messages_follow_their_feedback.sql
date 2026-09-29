-- access_ladder_t13_23p_feedback_user_messages_follow_their_feedback.sql
-- chair-step: one table. Regenerates this child from its parent feedback and drops its hand-written read and insert policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- users.feedback_user_messages: same shape and ruling as feedback_comments (23o). The service_role policy stays.

set local lock_timeout = '2s';

select iam.apply_rls('users', 'feedback_user_messages', 'feedback_user_messages', 'component');

select iam.supersede_bespoke_policies('users', 'feedback_user_messages', array['Users read own feedback messages', 'Users reply to own feedback messages'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
