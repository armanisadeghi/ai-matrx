// /administration/database/relationships — Relationships hub, Overview tab.
//
// Control plane for the reachability / containment system
// (docs/db_changes/REACHABILITY-ROLLOUT.md): system status, the unified
// drift report, cache rebuild, and write-time enforcement. Rule CRUD lives
// on /rules; the registries on /entity-types and /sharing; the explorer,
// reachability inspector, and action catalog on their own tabs.
//
// The (admin) layout already requires Super Admin; every RPC below re-checks
// is_super_admin() server-side in the DB. Data is fetched here in the Server
// Component; all mutations happen in the client island via the same RPCs.

import { createClient } from "@/utils/supabase/server";
import { RelationshipsOverviewClient } from "@/features/admin/relationships/components/RelationshipsOverviewClient";

export const metadata = {
  title: "Relationship Manager | Matrx Admin",
};

export default async function RelationshipsOverviewPage() {
  const supabase = await createClient();

  const [statusRes, problemsRes] = await Promise.all([
    supabase.rpc("admin_relationship_system_status"),
    supabase.rpc("admin_relationship_problems"),
  ]);

  const firstError = statusRes.error ?? problemsRes.error;
  if (firstError) {
    // Loud, not swallowed — a failed load here means the RPC family or the
    // admin guard is broken, which is a defect to surface immediately.
    throw new Error(
      `Relationship Manager failed to load: ${firstError.message}`,
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <RelationshipsOverviewClient
        status={statusRes.data?.[0] ?? null}
        problems={problemsRes.data ?? []}
      />
    </div>
  );
}
