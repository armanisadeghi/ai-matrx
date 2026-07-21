import { Suspense } from "react";
import { AuditWorkspace } from "@/features/marketing/components/audit/AuditWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteAuditPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site audit…" />}>
      <AuditWorkspace />
    </Suspense>
  );
}
