-- expect: branch=refuse:header-allows-revoke-protected production=refuse:header-allows-revoke-protected
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke iam
--
-- This campaign did not create `iam`, so it may never be the subject of the exemption.
--
revoke select on all tables in schema iam from authenticated;
