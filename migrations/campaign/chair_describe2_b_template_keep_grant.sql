-- chair_describe2_b_template_keep_grant.sql — lane CHAIR-DESCRIBE-2. The first file granted
-- custom.template_keep before its door row existed, so the DDL guard took the grant back; the row is
-- declared now (signed-in callers only), and the grant sticks.
grant execute on function custom.template_keep(uuid) to authenticated;
