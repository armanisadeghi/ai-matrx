-- chair-step: THE INVERSE of migrations/campaign/hr_rev_09_goal_review_is_checked_at_submit.sql (lane HR-REVIEWS). Restore hr.hr_review_submit_response first by re-applying its hr_rev_07 definition as CREATE OR REPLACE (this file does not restate it), then drop the two hr_rev_09 functions below. Not yet rehearsed.
drop function hr._rev_answer_problems(jsonb, jsonb, uuid[]);
drop function hr._rev_review_goal_ids(uuid);
