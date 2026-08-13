import { Megaphone } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CampaignListPage } from "@/features/crm/components/campaigns/CampaignListPage";

export const metadata = {
  title: "CRM Campaigns",
  description:
    "Build calling and outreach campaigns over your CRM records and power-dial them from the call queue.",
};

/** /crm/campaigns — the campaign console (crm.campaign). */
export default async function CrmCampaignsRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Campaigns"
        route="/crm/campaigns"
        description="Build calling and outreach campaigns over your CRM records."
        icon={Megaphone}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Campaigns
          </h1>
        </div>
      </PageHeader>
      <CampaignListPage />
    </>
  );
}
