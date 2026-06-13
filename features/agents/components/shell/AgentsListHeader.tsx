import { Webhook } from "lucide-react";

export function AgentsListHeader() {
  return (
    <div className="flex items-center w-full gap-2 px-1">
      <Webhook className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Agents</span>
    </div>
  );
}
