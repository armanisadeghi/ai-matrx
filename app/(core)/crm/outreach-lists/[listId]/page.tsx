import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
  const { isAuthenticated } = await getServerAuth();
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
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            href="/crm/outreach-lists"
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          >
            Outreach Lists
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Outreach list</h1>
        </div>
      </PageHeader>
      <OutreachListDetailPage listId={listId} />
    </>
  );
}
