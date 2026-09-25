// lib/api/adminDoor.ts — THE ADMIN DOOR onto user surfaces (Python server).
//
// THE ADMIN LANE (Arman, 2026-09-25; rule in utils/supabase/adminLane.ts): the
// server's user routes for Hindsight, the RAG search lab, workflow runs/plans
// and the review walk treat an admin as an ordinary person. The admin app
// reaches other people's records through the super-admin `/admin/...` twins,
// which answer in the same shapes. This is the ONE place a client call picks
// between the two, and it decides at REQUEST time from the page the person is
// on — so the same component reads the admin twin inside /administration and
// the user route everywhere else. Never pick the admin path any other way.

import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";

/** True when this request comes from the admin section (browser only). */
export function adminDoorOpen(): boolean {
  return browserAdminLaneOpen();
}

/**
 * `/hindsight/enrollments` → `/admin/hindsight/enrollments` inside the admin
 * section; unchanged everywhere else. Only for paths the server mounts under
 * `/admin` with the same response shape.
 */
export function adminDoorPath(userPath: string): string {
  return adminDoorOpen() ? `/admin${userPath}` : userPath;
}
