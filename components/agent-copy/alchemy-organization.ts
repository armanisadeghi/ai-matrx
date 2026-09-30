// alchemy-organization — THE ORGANIZATION ALCHEMY WORKS IN, decided once for the host and its
// destinations. The same rule every other server-bound request reads (`lib/organization/
// organization-gate.ts` → `lib/api/admin-lane.ts`): in the admin section it is the platform tenant
// (the admin seat never acts as itself and is never asked to choose a workspace); everywhere else it
// is the selected workspace. Reading only the selected workspace hid AI preparation and every
// destination ("Open in a new chat", "Save to Notes", …) on every admin page, where the selected
// workspace is deliberately empty (lane DRILL-EXPLAIN walk, 2026-09-30).

import { adminLaneOrganizationId } from "@/lib/api/admin-lane";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

export function alchemyOrganizationId(state: Parameters<typeof selectOrganizationId>[0]): string | null {
  return adminLaneOrganizationId() ?? selectOrganizationId(state);
}
