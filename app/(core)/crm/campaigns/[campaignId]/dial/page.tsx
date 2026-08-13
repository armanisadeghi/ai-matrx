import Link from "next/link";
import { ChevronRight, PhoneCall } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CallQueuePage } from "@/features/crm/components/campaigns/CallQueuePage";

export const metadata = {
  title: "Call queue — CRM",
  description:
    "Power-dial a campaign: claim the next member, dial, log the call, disposition, next.",
};

/** /crm/campaigns/[campaignId]/dial — the power dialer. */
export default async function CrmCampaignDialRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Call queue"
        route={`/crm/campaigns/${campaignId}/dial`}
        description="Sign in to power-dial this campaign."
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
            href="/crm/campaigns"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Campaigns
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Link
            href={`/crm/campaigns/${campaignId}`}
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Campaign
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Call queue</h1>
        </div>
      </PageHeader>
      <CallQueuePage campaignId={campaignId} />
    </>
  );
}
