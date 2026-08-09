// /administration/database/relationships/reachability — the "why can they see this?"
// debugger. Client-fetching via the admin_reachability_* RPCs; no server data.
//
// Deep link: ?mode=contents|containers&type=<entity token>&id=<uuid> prefills
// the form and runs the lookup on mount, so a "N conveying containers" count on
// another surface can reach the actual containers. Anything else falls back to
// the empty form rather than 404ing — this is a debugger, not a record page.

import { ReachabilityInspectorClient } from "@/features/admin/relationships/components/ReachabilityInspectorClient";

export const metadata = {
  title: "Reachability Inspector | Matrx Admin",
};

export default async function ReachabilityInspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; type?: string; id?: string }>;
}) {
  const { mode, type, id } = await searchParams;

  return (
    <div className="h-full overflow-y-auto p-4">
      <ReachabilityInspectorClient
        initialMode={
          mode === "containers" || mode === "contents" ? mode : undefined
        }
        initialType={type}
        initialId={id}
      />
    </div>
  );
}
