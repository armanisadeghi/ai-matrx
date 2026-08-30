import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ApprovalsConsole } from "@/features/marketing/seo/value-system/suggestions/ApprovalsConsole";

/**
 * Approvals — every pending AI proposal for the signed-in reviewer's scope,
 * one place, with per-item and batch rulings. An AGENCY-plane operation: the
 * queue spans every brand the reviewer can see. Moved here from the flat
 * `/marketing/approvals` in the 2026-08-28 agency restructure.
 *
 * Register item KI-045. SoR:
 * common-docs/systems/marketing/seo/seo-keywords/REGISTER.md
 */
export default function MarketingApprovalsPage() {
  return (
    <div className="h-full overflow-y-auto p-3">
      <Suspense fallback={<LoadingSurface label="Loading your approval queue…" />}>
        <ApprovalsConsole />
      </Suspense>
    </div>
  );
}
