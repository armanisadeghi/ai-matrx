// /administration/database/relationships — Relationships hub, Overview tab.
//
// Control plane for the reachability / containment system
// (docs/db_changes/REACHABILITY-ROLLOUT.md): system status, the unified
// drift report, cache rebuild, and write-time enforcement. Rule CRUD lives
// on /rules; the registries on /entity-types and /sharing; the explorer,
// reachability inspector, and directive catalog on their own tabs.
//
// The (admin) layout already requires Super Admin; every RPC below re-checks
// is_super_admin() server-side in the DB. Data is fetched here in the Server
// Component; all mutations happen in the client island via the same RPCs.

import { createClient } from "@/utils/supabase/server";
import { readAllRows } from "@ai-matrx/data/db";
import { RelationshipsOverviewClient } from "@/features/admin/relationships/components/RelationshipsOverviewClient";
import type { RelationshipProblem } from "@/features/admin/relationships/types";

export const metadata = {
  title: "Relationship Manager | Matrx Admin",
};

export default async function RelationshipsOverviewPage() {
  const supabase = await createClient();

  const [statusRes, problems] = await Promise.all([
    supabase.rpc("admin_relationship_system_status"),
    readAllRows<RelationshipProblem>(
      ({ from, to }) =>
        supabase
          .rpc("admin_relationship_problems", undefined, { count: "exact" })
          .order("severity")
          .order("edge_count", { ascending: false })
          .order("kind")
          .order("source_type")
          .order("target_type")
          .order("label")
          .order("container_side")
          .order("detail")
          .range(from, to),
      { label: "public.admin_relationship_problems" },
    ),
  ]);

  if (statusRes.error) {
    // Loud, not swallowed — a failed load here means the RPC family or the
    // admin guard is broken, which is a defect to surface immediately.
    throw new Error(
      `Relationship Manager failed to load: ${statusRes.error.message}`,
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <RelationshipsOverviewClient
        status={statusRes.data?.[0] ?? null}
        problems={problems}
      />
    </div>
  );
}
