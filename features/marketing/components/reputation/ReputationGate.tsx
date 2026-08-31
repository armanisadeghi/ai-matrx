"use client";

import dynamic from "next/dynamic";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

const ReputationWorkspace = dynamic(
  () =>
    import("./ReputationWorkspace").then((module) => module.ReputationWorkspace),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Loading reputation intelligence…" />,
  },
);

export function ReputationGate({
  /**
   * The view fixed by the ROUTE — threaded straight through to the workspace
   * so each reputation screen can own its own URL. Left out, the workspace
   * reads `?view=` exactly as before.
   */
  view,
}: {
  view?: string;
} = {}) {
  return <ReputationWorkspace view={view} />;
}
