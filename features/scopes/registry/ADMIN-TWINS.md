# Admin twins

`adminTwins.ts` is the one table of records that open at an admin page inside `/administration` (conversation, sch_task, sandbox_instance, workflow). `resolveEntityDoors` and `useEntityHref` read it at request time (`browserAdminLaneOpen()`); user pages are unchanged. Add a token only when an admin page keyed on the same id exists. Guard: `__tests__/admin-seat-doors.test.ts`.
