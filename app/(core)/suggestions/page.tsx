import { redirect } from "next/navigation";
import { SuggestionsManager } from "@/features/kg-suggestions/components/manager/SuggestionsManager";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function SuggestionsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/suggestions"));

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            Suggestions
          </h1>
        </div>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <SuggestionsManager />
        </div>
      </div>
    </>
  );
}
