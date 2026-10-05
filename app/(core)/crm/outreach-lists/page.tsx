import { Megaphone } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { OutreachListsPage } from "@/features/crm/components/outreach-lists/OutreachListsPage";

export const metadata = {
  title: "CRM Outreach Lists",
  description:
    "Build calling and outreach lists over your CRM records and power-dial them from the call queue.",
};

/** /crm/outreach-lists — the outreach list console (crm.outreach_list). */
export default async function CrmOutreachListsRoute() {
  const { isAuthenticated } = await getSessionVerdict();
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
      <RecordPageHeader record={{ name: "Outreach Lists" }} />
      <OutreachListsPage />
    </>
  );
}
