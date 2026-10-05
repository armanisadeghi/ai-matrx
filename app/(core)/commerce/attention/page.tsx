import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AttentionQueue } from "@/features/commerce-review/components/AttentionQueue";

/**
 * /commerce/attention — open recall-audit disagreements, escalations and
 * high-impact unknowns in ONE list; every row opens its asset.
 */
export const dynamic = "force-dynamic";

export default async function CommerceAttentionPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/commerce/attention");
  return (
    <>
      <RecordPageHeader record={{ name: "Attention" }} />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <AttentionQueue />
      </div>
    </>
  );
}
