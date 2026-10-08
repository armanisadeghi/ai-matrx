-- chair-step: undo pagebundle2_b_the_record_bundle_door_is_opened_to_signed_in_callers.sql - takes back the signed-in EXECUTE on custom.record_page_bundle; the record page then asks each door itself
-- lane: PAGE-BUNDLE-2
revoke execute on function custom.record_page_bundle(uuid, uuid) from authenticated;
