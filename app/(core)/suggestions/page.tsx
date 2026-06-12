import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { SuggestionsManager } from "@/features/kg-suggestions/components/manager/SuggestionsManager";
import { getServerAuth } from "@/utils/supabase/getServerAuth";


export default async function SuggestionsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login");

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))] flex-col overflow-hidden bg-textured">
      <header className="flex items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">Suggestions</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            AI-found field values and scope links from your notes, tasks, and
            files. Nothing changes until you accept.
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <SuggestionsManager />
      </div>
    </div>
  );
}
