-- chair-step: inverse of migrations/campaign/hr360_meet_policy_for_before_a_meeting_exists.sql (lane HR-360) — drops only the 3-argument form.
drop function if exists communication.meet_policy_for(uuid, uuid, text);
