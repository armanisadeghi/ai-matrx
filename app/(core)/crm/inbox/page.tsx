import { Inbox } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Outreach Inbox"
        route="/crm/inbox"
        description="Every reply to your outreach in one place, in full context."
        icon={Inbox}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Outreach Inbox
          </h1>
        </div>
      </PageHeader>
      <InboxPage />
    </>
  );
}
