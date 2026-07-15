import { Loader2 } from "lucide-react";

export default function AgentAppsLoading() {
  return (
    <div className="h-full flex items-center justify-center bg-textured">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
