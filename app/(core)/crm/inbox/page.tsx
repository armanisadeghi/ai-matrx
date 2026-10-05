import { Inbox } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { InboxPage } from "@/features/crm/inbox/components/InboxPage";

export const metadata = {
  title: "Outreach Inbox",
  description:
    "Every reply to your outreach in one place, with the campaign, the step it answers and the record that motivated the message.",
};

/**
 * /crm/inbox — the unified outreach inbox.
 *
 * A VIEW over crm.interaction (D9). It lives BESIDE the CRM at /crm/* on
 * purpose: a separate outreach console is named as a failure mode in the work
 * order's traps list.
 */
export default async function CrmInboxRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Outreach Inbox"
        route="/crm/inbox"
        description="Every reply to your outreach in one place, with the full thread."
        icon={Inbox}
      />
    );
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Outreach Inbox" }} />
      <InboxPage />
    </>
  );
}
