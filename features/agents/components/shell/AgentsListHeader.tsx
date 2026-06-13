import Link from "next/link";
import { FileChartColumn, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AgentsListHeader() {
  return (
    <div className="flex items-center w-full gap-2 px-1">
      <Webhook className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Agents</span>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      >
        <Link href="/reports/agent-drift">
          <FileChartColumn className="h-3.5 w-3.5" />
          Drift report
        </Link>
      </Button>
    </div>
  );
}
