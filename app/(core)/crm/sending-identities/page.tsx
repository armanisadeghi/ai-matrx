import { MailCheck } from "lucide-react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { SendingIdentitiesPage } from "@/features/crm/components/sending-identities/SendingIdentitiesPage";

/**
 * /crm/sending-identities — THE RIGHT TO SEND.
 *
 * The mailboxes this organization may send outreach from. Customers send from
 * their OWN mailboxes on their OWN verified domains; AI Matrx never relays
 * outreach through its own infrastructure (docs/handoffs/outreach-system.md §5).
 *
 * No SSR seed: the data comes from aidream (DNS proofs, mailbox probes, live
 * health), and a seed fetched before the user's org is known would be discarded
 * — the same reasoning as /crm itself.
 */
export default async function SendingIdentitiesRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Sending Mailboxes"
        route="/crm/sending-identities"
        description="Connect the mailbox your outreach is sent from, prove you own its domain, and watch its delivery health."
        icon={MailCheck}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <MailCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            href="/crm"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            CRM
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">
            Sending Mailboxes
          </h1>
        </div>
      </PageHeader>
      <SendingIdentitiesPage />
    </>
  );
}
