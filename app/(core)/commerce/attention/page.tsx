import { BellRing } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AttentionQueue } from "@/features/commerce-review/components/AttentionQueue";

/**
 * /commerce/attention — open recall-audit disagreements, escalations and
 * high-impact unknowns in ONE list; every row opens its asset.
 */
export const dynamic = "force-dynamic";

export default async function CommerceAttentionPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/attention");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <BellRing className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">Attention</h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured">
        <AttentionQueue />
      </div>
    </>
  );
}
