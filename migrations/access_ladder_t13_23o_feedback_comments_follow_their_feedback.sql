-- access_ladder_t13_23o_feedback_comments_follow_their_feedback.sql
-- chair-step: one table. Regenerates this child from its parent feedback and drops its hand-written read and insert policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- users.feedback_comments: the hand-written read opened a comment only to the feedback's submitter; the
-- parent feedback is also readable by its organization's members, so they now read its comments too
-- (ruled correct). Insert: feedback editor (generated) replaces submitter-only.

set local lock_timeout = '2s';

select iam.apply_rls('users', 'feedback_comments', 'feedback_comments', 'component');

select iam.supersede_bespoke_policies('users', 'feedback_comments', array['Users can view comments on own feedback', 'Users can comment on own feedback'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
