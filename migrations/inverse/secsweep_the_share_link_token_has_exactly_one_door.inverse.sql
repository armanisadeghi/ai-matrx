-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_share_link_token_has_exactly_one_door.sql
-- Re-opens direct client INSERT/UPDATE/DELETE on platform.share_links, which is the defect the
-- up-migration closed: a signed-in person could mint a no-login link with a token and a
-- permission_level of her choosing. Run it only to prove the pair reverses (rule 27).
drop policy if exists share_links_client_insert_refused on platform.share_links;
drop policy if exists share_links_client_update_refused on platform.share_links;
drop policy if exists share_links_client_delete_refused on platform.share_links;
