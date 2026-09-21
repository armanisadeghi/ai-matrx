-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_invitation_token_has_exactly_one_door.sql
-- Re-opens direct client writes on iam.invitations. Rule 27 only.
drop policy if exists invitations_client_insert_refused on iam.invitations;
drop policy if exists invitations_client_update_refused on iam.invitations;
drop policy if exists invitations_client_delete_refused on iam.invitations;
