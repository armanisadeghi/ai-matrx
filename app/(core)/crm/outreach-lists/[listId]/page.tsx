import { Megaphone } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { OutreachListDetailPage } from "@/features/crm/components/outreach-lists/OutreachListDetailPage";

export const metadata = {
  title: "Outreach list — CRM",
  description: "Outreach list roster, status rollup, enrollment, and call queue.",
};

/** /crm/outreach-lists/[listId] — one outreach list's workspace. */
export default async function CrmOutreachListRoute({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Outreach Lists"
        route={`/crm/outreach-lists/${listId}`}
        description="Sign in to work this list."
        icon={Megaphone}
      />
    );
  }

  return (
    <>
      <RecordPageHeader
        backHref="/crm/outreach-lists"
        parents={[
          { label: "CRM", href: "/crm" },
          { label: "Outreach lists", href: "/crm/outreach-lists" },
        ]}
        record={{ name: "Outreach list" }}
      />
      <OutreachListDetailPage listId={listId} />
    </>
  );
}
