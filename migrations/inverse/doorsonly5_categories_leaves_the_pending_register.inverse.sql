-- chair-step: DOORS-ONLY-5 inverse — puts platform.categories back in
-- platform.doors_only_pending_cutover. It does NOT regenerate, because iam.apply_rls refuses
-- this table by name (DD-249 / R12), which is the whole reason the forward file could not end
-- in a regeneration either. Restoring the row tells a future generator to KEEP this table's
-- client write grants; it does not by itself make the table writable, because the named
-- restrictive refusal policies stay.

insert into platform.doors_only_pending_cutover
  (schema_name, table_name, reason, owner_lane)
values ('platform', 'categories',
        'RESTORED BY THE DOORS-ONLY-5 INVERSE. The doors public.cat_write and public.cat_archive exist and all thirteen client write call sites call them; this row only exists because somebody undid the cutover. Delete it, and once DD-249 / R12 is settled the next successful iam.apply_rls withdraws the write grants with no further decision.',
        'DOORS-ONLY-5')
on conflict (schema_name, table_name) do nothing;
