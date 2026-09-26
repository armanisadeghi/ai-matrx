-- chair-step: inverse of migrations/campaign/bigvalueswrite_the_two_doors_can_be_reached.sql - takes EXECUTE on custom.whole_value_complete and custom.whole_values_waiting back from `authenticated`. A person's write of a text over the ceiling then refuses in words (the store cannot complete its file in the writer's session) until the grant is back; nothing else changes.
-- lane: BIG-VALUES-WRITE

revoke execute on function custom.whole_value_complete(uuid, uuid, text, uuid) from authenticated;
revoke execute on function custom.whole_values_waiting(uuid, uuid[]) from authenticated;
