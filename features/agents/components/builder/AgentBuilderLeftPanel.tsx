import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentModelConfiguration } from "./AgentModelConfiguration";
import { AgentVariablesManager } from "@/features/agents/components/variables-management/AgentVariablesManager";
import { AgentContextSlotsManager } from "../context-slots-management/AgentContextSlotsManager";
import { AgentBuilderMessagesArea } from "./AgentBuilderLeftPanelContent";
import { AddMessageButtons } from "./AddMessageButtons";
import { AgentResourcesManager } from "./AgentResourcesManager";

interface AgentBuilderLeftPanelProps {
  agentId: string;
}

function MessagesAreaSkeleton() {
  return (
    <div className="flex flex-col gap-2 flex-1 pr-1">
      <Skeleton className="h-[360px] w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="flex-1 w-full rounded-lg" />
    </div>
  );
}

function AddButtonsSkeleton() {
  return (
    <>
      <Skeleton className="h-7 w-16 rounded-md" />
      <Skeleton className="h-7 w-20 rounded-md" />
    </>
  );
}

export function AgentBuilderLeftPanel({ agentId }: AgentBuilderLeftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 shrink-0 pt-0.5 pb-2">
        <AgentModelConfiguration agentId={agentId} />
        <AgentVariablesManager agentId={agentId} />
        <AgentContextSlotsManager agentId={agentId} />
        <AgentResourcesManager agentId={agentId} />
      </div>

      <Suspense fallback={<MessagesAreaSkeleton />}>
        <AgentBuilderMessagesArea agentId={agentId} />
      </Suspense>

      <div className="flex items-center justify-end gap-1 shrink-0 py-2 border-t border-border bg-background">
        <Suspense fallback={<AddButtonsSkeleton />}>
          <AddMessageButtons agentId={agentId} />
        </Suspense>
      </div>
    </div>
  );
}
