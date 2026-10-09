// features/scopes/registry/adminTwins.ts
//
// THE ADMIN SEAT'S DOORS. On a user page a record opens at its user route
// (`/chat/<id>`); that route treats an admin as an ordinary person, so for a
// record the admin does not own it is a dead end. Inside /administration the
// same record opens at its ADMIN TWIN. This is the ONE table of twins, read by
// `resolveEntityDoors` and `useEntityHref` — a token appears here only when an
// admin page keyed on the same id exists.
//
// Component-free on purpose (it sits on the door path; see doors.ts).

import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";

export const ADMIN_TWIN_HREF: Readonly<Record<string, (id: string) => string>> = {
  conversation: (id) => `/administration/chat/cx-dashboard/conversations/${id}`,
  sch_task: (id) => `/administration/automation/scheduling/tasks/${id}`,
  sandbox_instance: (id) => `/administration/compute/sandbox/${id}`,
  workflow: (id) => `/administration/automation/workflows/${id}`,
};

/** The admin-twin href for (token, id) on the admin seat; null elsewhere. */
export function adminTwinHref(
  token: string,
  id: string,
  seatOpen: boolean = browserAdminLaneOpen(),
): string | null {
  if (!seatOpen) return null;
  return ADMIN_TWIN_HREF[token]?.(id) ?? null;
}
