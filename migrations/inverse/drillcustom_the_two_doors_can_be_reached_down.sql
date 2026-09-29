-- lane: DRILL-CUSTOM-PARITY
-- chair-step: the inverse of drillcustom_the_two_doors_can_be_reached.sql. It takes back the EXECUTE that file gave `authenticated` on custom.table_dimensions and custom.table_dimensions_set, and nothing else. A signed-in person then gets "permission denied" from both doors until the grant is given again.

revoke execute on function custom.table_dimensions(uuid, uuid) from authenticated;
revoke execute on function custom.table_dimensions_set(uuid, uuid, jsonb) from authenticated;
