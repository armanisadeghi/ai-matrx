-- expect: branch=refuse:revoke-exemption-uncontained production=refuse:revoke-exemption-uncontained
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- Containment is checked whenever the exemption is CLAIMED, whatever the target, so a branch
-- rehearsal proves the same containment production will demand.
--
revoke select on all tables in schema custom from authenticated;
revoke select on all tables in schema platform from authenticated;
