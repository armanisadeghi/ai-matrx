// /administration/relationships — Relationship Manager (Super Admin).
//
// Control plane for the reachability / containment system
// (docs/db_changes/REACHABILITY-ROLLOUT.md): which association shapes exist,
// which convey access and at what ceiling, unregistered strays, the closure
// cache, and write-time enforcement.
//
// The (admin) layout already requires Super Admin; every RPC below re-checks
// is_super_admin() server-side in the DB. Data is fetched here in the Server
// Component; all mutations happen in the client island via the same RPCs.

import { Network } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import RelationshipManagerClient from "@/features/admin/relationships/components/RelationshipManagerClient";

export const metadata = {
  title: "Relationship Manager | Matrx Admin",
};

export default async function RelationshipsAdminPage() {
  const supabase = await createClient();

  const [statusRes, rulesRes, unregisteredRes, problemsRes] = await Promise.all([
    supabase.rpc("admin_relationship_system_status"),
    supabase.rpc("admin_relationship_rules"),
    supabase.rpc("admin_unregistered_pairs"),
    supabase.rpc("admin_relationship_problems"),
  ]);

  const firstError =
    statusRes.error ?? rulesRes.error ?? unregisteredRes.error ?? problemsRes.error;
  if (firstError) {
    // Loud, not swallowed — a failed load here means the RPC family or the
    // admin guard is broken, which is a defect to surface immediately.
    throw new Error(
      `Relationship Manager failed to load: ${firstError.message}`,
    );
  }

  return (
    <div className="min-h-dvh bg-textured">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Network className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Relationship Manager</h1>
        <p className="ml-2 text-sm text-muted-foreground">
          Which relationships exist, which convey access, and what every
          container reaches.
        </p>
      </div>
      <RelationshipManagerClient
        status={statusRes.data?.[0] ?? null}
        rules={rulesRes.data ?? []}
        unregistered={unregisteredRes.data ?? []}
        problems={problemsRes.data ?? []}
      />
    </div>
  );
}
