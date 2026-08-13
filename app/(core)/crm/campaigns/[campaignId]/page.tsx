import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CampaignDetailPage } from "@/features/crm/components/campaigns/CampaignDetailPage";

export const metadata = {
  title: "Campaign — CRM",
  description: "Campaign roster, status rollup, enrollment, and call queue.",
};

/** /crm/campaigns/[campaignId] — one campaign's workspace. */
export default async function CrmCampaignRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Campaigns"
        route={`/crm/campaigns/${campaignId}`}
        description="Sign in to work this campaign."
        icon={Megaphone}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            href="/crm/campaigns"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Campaigns
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Campaign</h1>
        </div>
      </PageHeader>
      <CampaignDetailPage campaignId={campaignId} />
    </>
  );
}
