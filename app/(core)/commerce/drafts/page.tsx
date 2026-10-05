import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { DraftReviewQueue } from "@/features/commerce-review/components/DraftReviewQueue";

/**
 * /commerce/drafts — gate 2, lister craft. AI listing drafts in in_review:
 * evidence beside every field, confidence-gated presentation, edit-in-place,
 * keyboard approval at the ~15s/item bar.
 */
export const dynamic = "force-dynamic";

export default async function CommerceDraftsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/commerce/drafts");
  return (
    <>
      <RecordPageHeader record={{ name: "Drafts Review" }} />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <DraftReviewQueue />
      </div>
    </>
  );
}
