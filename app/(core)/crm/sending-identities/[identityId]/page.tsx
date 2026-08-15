import { ChevronRight, MailCheck } from "lucide-react";
import Link from "next/link";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { SendingIdentityDetailPage } from "@/features/crm/components/sending-identities/SendingIdentityDetailPage";

/** /crm/sending-identities/[identityId] — one mailbox: its gates, limits and health. */
export default async function SendingIdentityRoute({
  params,
}: {
  params: Promise<{ identityId: string }>;
}) {
  const { identityId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Sending Mailbox"
        route="/crm/sending-identities"
        description="Prove you own your sending domain, warm the mailbox up, and watch its delivery health."
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
            href="/crm/sending-identities"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Sending Mailboxes
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Mailbox</h1>
        </div>
      </PageHeader>
      <SendingIdentityDetailPage identityId={identityId} />
    </>
  );
}
