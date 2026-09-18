import "server-only";

import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";

/**
 * The sole service-role client door for interactive database-admin surfaces.
 * Route-group admission is intentionally broader than this privilege, so the
 * caller's current server-side identity is re-checked before the secret client
 * is created or any SQL can be sent.
 */
export async function requireSuperAdminDatabaseClient() {
  await requireSuperAdmin();
  return createAdminClient();
}
