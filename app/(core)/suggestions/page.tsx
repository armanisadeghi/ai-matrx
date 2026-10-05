import { redirect } from "next/navigation";
import { SuggestionsManager } from "@/features/kg-suggestions/components/manager/SuggestionsManager";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function SuggestionsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/suggestions"));

  return (
    <>
      <RecordPageHeader record={{ name: "Suggestions" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <SuggestionsManager />
        </div>
      </div>
    </>
  );
}
