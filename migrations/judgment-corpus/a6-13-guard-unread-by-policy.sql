-- expect: branch=refuse:guard-unread production=refuse:guard-unread
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- ATTACK-6 finding 2, second half: a CREATE POLICY whose body never names the knob that is
-- supposed to hold it OFF. A guard the body never reads is a comment, not a switch.
--
create policy zz_judgment_scoped on custom.zz_thing for select using (organization_id = iam.current_org());
