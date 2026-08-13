import type { Metadata } from "next";
import { Merge } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { DuplicateReviewPage } from "@/features/crm/components/dedup/DuplicateReviewPage";

export const metadata: Metadata = {
  title: "Duplicates — CRM",
  description:
    "Review suggested duplicate people and companies, merge them safely, and undo any merge.",
};

/**
 * /crm/duplicates — the merge review queue: scan results, side-by-side pair
 * comparison, merge/dismiss decisions, and recent merges with exact undo.
 */
export default async function CrmDuplicatesRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="CRM duplicates"
        route="/crm/duplicates"
        description="Find and merge duplicate people and companies without losing anything."
        icon={Merge}
      />
    );
  }

  // The client component owns the header (RouteHeader: back + title + Scan),
  // same pattern as /crm/[partyId].
  return <DuplicateReviewPage />;
}
