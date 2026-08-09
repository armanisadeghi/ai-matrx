import type { Metadata } from "next";
import { DeadEndsConsole } from "@/features/admin/dead-ends/DeadEndsConsole";
import {
  DEAD_END_HISTORY,
  DEAD_END_REPORT,
} from "@/features/admin/dead-ends/report-data";

/**
 * No Dead Ends scoreboard.
 *
 * Reads the COMMITTED report snapshot (the shape-doctor pattern —
 * `features/content-ir/admin/shape-doctor-server.ts`), not a live scan: a
 * 6,800-file AST walk is not a page load, and a static import is the only
 * thing that reliably resolves inside a Vercel function. Refresh the snapshot
 * with `pnpm check:dead-ends:write` and commit it; the console shows the scan's
 * age and screams when it goes stale. The snapshot is validated, not cast —
 * see `report-data.ts`.
 *
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "No Dead Ends",
  description:
    "Door Law violations across the repo — ranked, openable, with a one-click repair brief per finding.",
};

export default function DeadEndsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <DeadEndsConsole report={DEAD_END_REPORT} history={DEAD_END_HISTORY} />
    </div>
  );
}
