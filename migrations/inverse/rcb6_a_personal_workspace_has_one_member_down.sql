-- INVERSE of migrations/rcb6_a_personal_workspace_has_one_member.sql (lane RC-B6).
-- lane: RC-B6
-- lock: iam
-- window-class: DROP TRIGGER on iam.memberships takes ACCESS EXCLUSIVE (plus the supautils auth set) — measured on the clone; run only in the 1–4 AM PT window
drop trigger if exists _a_personal_workspace_has_one_member on iam.memberships;
drop function if exists iam._a_personal_workspace_has_one_member();
