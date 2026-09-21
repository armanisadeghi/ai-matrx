-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_research_refresh_lease_is_the_servers.sql
-- Lets a client take, hold or release another organization's research refresh again. Rule 27 only.
drop trigger if exists rs_topic_refresh_lease_is_the_servers on research.rs_topic;
drop function if exists research._refresh_lease_is_the_servers();
