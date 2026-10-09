-- chair-step: undo pagebundle_b_the_bundle_door_is_opened_to_signed_in_callers.sql - takes the EXECUTE grant on custom.table_page_bundle back; the client then asks each door itself, as before
-- lane: PAGE-BUNDLE
revoke execute on function custom.table_page_bundle(uuid, uuid, uuid) from authenticated;
