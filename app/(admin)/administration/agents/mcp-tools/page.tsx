import { Suspense } from "react";
import { McpToolsManager } from "@/features/tool-call-visualization/admin/McpToolsManager";
import { Loader2 } from "lucide-react";

export default function McpToolsPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading tools…
          </div>
        }
      >
        <McpToolsManager />
      </Suspense>
    </div>
  );
}
