-- chair-step: the inverse of hub_the_hub_doors_can_be_reached.sql. It REVOKEs EXECUTE on the
-- three hub doors from `authenticated` and nothing else — no DROP, no data movement, no other
-- role named. After it runs the doors still exist and are still declared; a signed-in person
-- simply cannot call them, which is the state the store was in before the grants.
-- lane: DATA-HUB

revoke execute on function custom.pipelines(uuid) from authenticated;
revoke execute on function custom.shares_outside(uuid) from authenticated;
revoke execute on function custom.hub_changed_by(uuid, text, uuid[]) from authenticated;
