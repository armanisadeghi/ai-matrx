import { FileCheck2 } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { DraftReviewQueue } from "@/features/commerce-review/components/DraftReviewQueue";

/**
 * /commerce/drafts — gate 2, lister craft. AI listing drafts in in_review:
 * evidence beside every field, confidence-gated presentation, edit-in-place,
 * keyboard approval at the ~15s/item bar.
 */
export const dynamic = "force-dynamic";

export default async function CommerceDraftsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/commerce/drafts");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1.5 px-1 text-sm">
          <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-foreground">
            Drafts Review
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <DraftReviewQueue />
      </div>
    </>
  );
}
