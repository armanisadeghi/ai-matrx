"use client";

// ChatMobileAgentName — Mobile header center slot.
//
// Reads agent name from URL agentId → agentDefinition slice.
// Tapping opens AgentPickerSheet — navigates to /ssr/chat/a/{id} on select.

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

const AgentPickerSheet = dynamic(
  () =>
    import("@/features/cx-chat/components/agent/AgentPickerSheet").then(
      (m) => ({ default: m.AgentPickerSheet }),
    ),
  { ssr: false },
);

export default function ChatMobileAgentName() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const agentIdFromUrl = (() => {
    const pathMatch = pathname.match(/\/ssr\/chat\/a\/([^/?]+)/);
    return pathMatch?.[1] ?? searchParams.get("agent") ?? undefined;
  })();

  const agentRecord = useAppSelector((state) =>
    agentIdFromUrl ? selectAgentById(state, agentIdFromUrl) : undefined,
  );
  const displayName = agentRecord?.name ?? "Matrx Chat";

  const handleAgentSelect = useCallback(
    (agent: { promptId: string }) => {
      setIsPickerOpen(false);
      router.push(`/ssr/chat/a/${agent.promptId}`);
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
        className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full matrx-shell-glass text-sm font-medium text-foreground/90 transition-colors select-none min-w-0 active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
        aria-label="Change AI agent"
      >
        <span className="truncate max-w-[180px]">{displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>
    </>
  );
}
