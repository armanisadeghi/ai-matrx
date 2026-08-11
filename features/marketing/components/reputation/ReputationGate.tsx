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

export function ReputationGate() {
  return <ReputationWorkspace />;
}
