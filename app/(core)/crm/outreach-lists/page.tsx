import { Megaphone } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { OutreachListsPage } from "@/features/crm/components/outreach-lists/OutreachListsPage";

export const metadata = {
  title: "CRM Outreach Lists",
  description:
    "Build calling and outreach lists over your CRM records and power-dial them from the call queue.",
};

/** /crm/outreach-lists — the outreach list console (crm.outreach_list). */
export default async function CrmOutreachListsRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Outreach Lists"
        route="/crm/outreach-lists"
        description="Build calling and outreach lists over your CRM records."
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
            Outreach Lists
          </h1>
        </div>
      </PageHeader>
      <OutreachListsPage />
    </>
  );
}
