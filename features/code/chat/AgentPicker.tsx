"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { beginFreshCodeChat } from "./begin-fresh-code-chat";

interface AgentPickerProps {
  /** Shown inside the empty chat panel. */
  variant?: "empty-state" | "inline";
  className?: string;
}

const CODE_AGENT_PICKER_CONSUMER_ID = "code-workspace-agent-picker";

/**
 * Code-workspace adapter for the canonical agent picker. Selection writes
 * `?agentId=…` through `beginFreshCodeChat`; the roster, tabs, search, sort,
 * favorites, filters, counts, and agent detail all come from the same picker
 * used by the chat route.
 */
export function AgentPicker({
  variant = "empty-state",
  className,
}: AgentPickerProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentAgentId = searchParams.get("agentId");

  const selectAgent = useCallback(
    (agentId: string) => {
      beginFreshCodeChat({
        dispatch,
        router,
        pathname,
        searchParams,
        agentId,
      });
    },
    [dispatch, pathname, router, searchParams],
  );

  if (variant === "inline") {
    return (
      <AgentListDropdown
        consumerId={CODE_AGENT_PICKER_CONSUMER_ID}
        onSelect={selectAgent}
        activeAgentId={currentAgentId}
        compact
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
    >
      <Boxes size={36} strokeWidth={1.2} className="text-muted-foreground" />
      <div className="text-sm font-medium text-foreground">
        Pick an agent to start chatting
      </div>
      <div className="max-w-sm text-xs text-muted-foreground">
        The chat panel and conversation history both run against the agent you
        select.
      </div>
      <div className="h-[min(420px,60dvh)] w-full max-w-md overflow-hidden rounded-md border border-border bg-background text-left">
        <AgentListInlinePicker
          consumerId={CODE_AGENT_PICKER_CONSUMER_ID}
          onSelect={selectAgent}
          activeAgentId={currentAgentId}
          className="h-full"
          showPinnedAgent={false}
        />
      </div>
    </div>
  );
}

export default AgentPicker;
