"use client";

// ChatMobileAgentName — Mobile header center slot.
//
// Reads agent name from URL agentId → agentDefinition slice.
// Tapping opens AgentPickerSheet — navigates to /demos/chat/a/{id} on select.

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "../../host/navigation";
import { AgentPickerSheet } from "../../next/lazy/AgentPickerSheet";
import { useAppSelector } from "../../store/hooks";
import { selectAgentById } from "../../agents/redux/agent-definition/selectors";
import { pushAppHref } from "@ai-matrx/chat/host/ui-slots";

export default function ChatMobileAgentName() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const agentIdFromUrl = (() => {
    const pathMatch = pathname.match(/\/demos\/chat\/a\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("agent") ?? undefined;
  })();

  const agentRecord = useAppSelector((state) =>
    agentIdFromUrl ? selectAgentById(state, agentIdFromUrl) : undefined,
  );
  const displayName = agentRecord?.name ?? "Matrx Chat";

  const handleAgentSelect = useCallback(
    (agent: { promptId: string }) => {
      setIsPickerOpen(false);
      pushAppHref(router, `/demos/chat/a/${agent.promptId}`);
    },
    [router],
  );

  return (
    <>
      <AgentPickerSheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedAgent={
          agentRecord
            ? { promptId: agentRecord.id, name: agentRecord.name }
            : null
        }
        onSelect={handleAgentSelect}
      />
      <button
        onClick={() => setIsPickerOpen(true)}
        className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full matrx-glass-thin-border text-sm font-medium text-foreground/90 transition-colors select-none min-w-0 active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
        aria-label="Change AI agent"
      >
        <span className="truncate max-w-[180px]">{displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>
    </>
  );
}
