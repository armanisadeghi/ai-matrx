import { Suspense } from "react";
import { ListChecks } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { ChaseboxPage } from "@/features/crm/chasebox/components/ChaseboxPage";

export const metadata = {
  title: "Chasebox",
  description:
    "What needs you now across every outreach campaign: fresh replies, drafts awaiting approval, stalled sequences, blocked members, and people worth escalating.",
};

/**
 * /crm/chasebox — the action queue.
 *
 * Saved filters over crm.interaction + crm.outreach_list_member (D9,
 * research/03). No new tables, no second outreach console.
 */
export default async function CrmChaseboxRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Chasebox"
        route="/crm/chasebox"
        description="What needs you now across every outreach campaign, in one glance."
        icon={ListChecks}
      />
    );
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Chasebox" }} />
      {/* The page reads `?queue=` so an assist chip can open one queue
          directly; `useSearchParams` needs a boundary above it. */}
      <Suspense fallback={null}>
        <ChaseboxPage />
      </Suspense>
    </>
  );
}
