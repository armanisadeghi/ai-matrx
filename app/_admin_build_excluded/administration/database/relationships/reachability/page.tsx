// /administration/database/relationships/reachability — the "why can they see this?"
// debugger. Client-fetching via the admin_reachability_* RPCs; no server data.

import { ReachabilityInspectorClient } from "@/features/admin/relationships/components/ReachabilityInspectorClient";

export const metadata = {
  title: "Reachability Inspector | Matrx Admin",
};

export default function ReachabilityInspectorPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <ReachabilityInspectorClient />
    </div>
  );
}
