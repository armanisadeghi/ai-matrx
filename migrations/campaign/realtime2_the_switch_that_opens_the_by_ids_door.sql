-- chair-step: this REVOKEs the implicit PUBLIC EXECUTE from `custom.read_records_by_ids` and GRANTs it to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. The function is the record store's ordinary read door addressed by an id SET instead of by a page: it resolves the reader from the session (`auth.uid()`), asks `custom.assert_may_know_table` exactly as `custom.read_records` does on its second line, and filters every row through `custom.visible_set` — the ONE ladder, the same call with the same arguments — so it can only ever answer with records the caller could already have paged to one screen at a time. Field masking, hidden-field notices and choice rendering are the same calls the page door makes. An id the caller may not see simply does not come back. It exists because the realtime notice has always named the exact ids that moved and no door could take them, so every three-cell change re-read a fifty-row page in every watching browser. The REVOKE NARROWS: it takes PUBLIC off before `authenticated` is named. No DROP, no data movement, no existing declared grant changed.
-- lane: REALTIME-2 (chair ruling 2026-09-21: a new name cannot collide)
--
--   custom.read_records_by_ids(uuid, uuid, uuid[], boolean)  → authenticated, EXECUTE

revoke all on function custom.read_records_by_ids(uuid, uuid, uuid[], boolean) from public;

grant execute on function custom.read_records_by_ids(uuid, uuid, uuid[], boolean) to authenticated;
