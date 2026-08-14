import Link from "next/link";
import { ChevronRight, PhoneCall } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CallQueuePage } from "@/features/crm/components/outreach-lists/CallQueuePage";

export const metadata = {
  title: "Call queue — CRM",
  description:
    "Power-dial a list: claim the next member, dial, log the call, disposition, next.",
};

/** /crm/outreach-lists/[listId]/dial — the power dialer. */
export default async function CrmOutreachListDialRoute({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Call queue"
        route={`/crm/outreach-lists/${listId}/dial`}
        description="Sign in to power-dial this list."
        icon={PhoneCall}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <PhoneCall className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            href="/crm/outreach-lists"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Outreach Lists
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Link
            href={`/crm/outreach-lists/${listId}`}
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Outreach list
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Call queue</h1>
        </div>
      </PageHeader>
      <CallQueuePage listId={listId} />
    </>
  );
}
