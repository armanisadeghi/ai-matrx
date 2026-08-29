import { PackageSearch } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TriageQueue } from "@/features/commerce-review/components/TriageQueue";

/**
 * /commerce/triage — gate 1, warehouse triage. Fast, image-first,
 * keyboard-driven value_bucket decisions on assets in awaiting_triage.
 */
export const dynamic = "force-dynamic";

export default async function CommerceTriagePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/triage");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <PackageSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">
            Warehouse Triage
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <TriageQueue />
      </div>
    </>
  );
}
