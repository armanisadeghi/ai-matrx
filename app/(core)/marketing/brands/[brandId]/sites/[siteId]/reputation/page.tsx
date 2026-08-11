import { Suspense } from "react";
import { ReputationGate } from "@/features/marketing/components/reputation/ReputationGate";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteReputationPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading reputation intelligence…" />}>
      <ReputationGate />
    </Suspense>
  );
}
