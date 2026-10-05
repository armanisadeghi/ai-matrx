import { Store } from "lucide-react";
import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { StoreConnectShell } from "@/features/commerce-review/components/StoreConnectShell";

/**
 * /commerce/stores/connect — onboarding + the store-connect shell W6's
 * OAuth routes will fill (UX.md page inventory, V1).
 */
export const dynamic = "force-dynamic";

export default async function CommerceStoreConnectPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/commerce/stores/connect");
  return (
    <>
      <RecordPageHeader record={{ name: "Connect a Store" }} />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <StoreConnectShell />
      </div>
    </>
  );
}
