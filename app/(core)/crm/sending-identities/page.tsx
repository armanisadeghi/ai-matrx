import { MailCheck } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
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
  const { isAuthenticated } = await getSessionVerdict();
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
      <RecordPageHeader
        backHref="/crm"
        parents={[{ label: "CRM", href: "/crm" }]}
        record={{ name: "Sending mailboxes" }}
      />
      <SendingIdentitiesPage />
    </>
  );
}
