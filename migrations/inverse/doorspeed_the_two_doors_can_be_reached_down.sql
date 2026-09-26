-- chair-step: inverse of migrations/campaign/doorspeed_the_two_doors_can_be_reached.sql - takes EXECUTE on custom.read_records_page and custom.record_change_many back from `authenticated`. The Sheet then answers that the page and batch doors are absent (it names them) until the grant is back; nothing else changes.
-- lane: data-tables-grid-overhaul

revoke execute on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) from authenticated;
revoke execute on function custom.record_change_many(uuid, uuid, jsonb) from authenticated;
