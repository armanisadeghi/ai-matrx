// features/admin/applications/installations/types.ts
//
// Installed fleet — typed rows for the admin_list_app_instances SECURITY
// DEFINER RPC (public.app_instances joined to the owning user's email).
// All shapes derive from the generated Database types — never hand-mirrored.

import type { Database } from "@/types/database.types";

export type AppInstanceRow =
  Database["public"]["Functions"]["admin_list_app_instances"]["Returns"][number];
