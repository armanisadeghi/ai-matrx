import { Suspense } from "react";
import { ListChecks } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
  const { isAuthenticated } = await getServerAuth();
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
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <ListChecks
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Chasebox
          </h1>
        </div>
      </PageHeader>
      {/* The page reads `?queue=` so an assist chip can open one queue
          directly; `useSearchParams` needs a boundary above it. */}
      <Suspense fallback={null}>
        <ChaseboxPage />
      </Suspense>
    </>
  );
}
