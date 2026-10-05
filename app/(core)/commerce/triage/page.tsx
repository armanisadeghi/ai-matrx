import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { TriageQueue } from "@/features/commerce-review/components/TriageQueue";

/**
 * /commerce/triage — gate 1, warehouse triage. Fast, image-first,
 * keyboard-driven value_bucket decisions on assets in awaiting_triage.
 */
export const dynamic = "force-dynamic";

export default async function CommerceTriagePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/commerce/triage");
  return (
    <>
      <RecordPageHeader record={{ name: "Warehouse Triage" }} />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <TriageQueue />
      </div>
    </>
  );
}
