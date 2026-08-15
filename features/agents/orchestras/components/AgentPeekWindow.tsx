// features/agents/agent-sets/components/AgentPeekWindow.tsx
//
// Non-blocking agent "quick look" as a draggable WindowPanel (NOT a blocking
// Dialog). Renders the canonical AgentSneakPeekContent (lazy-loads the full agent
// def + shows summary/model/variables/tools/JSON) inside the window shell. Reached
// ONLY via AgentPeekButton's dynamic() import, so WindowPanel stays behind the
// lazy boundary (see window-panels + code-splitting skills).

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  AgentSneakPeekContent,
  AgentSneakPeekCopyMenu,
} from "@/features/agents/components/agent-listings/AgentSneakPeekModal";

export default function AgentPeekWindow({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  return (
    <WindowPanel
      id={`agent-peek-${agentId}`}
      onClose={onClose}
      title={agent?.name ?? "Agent"}
      width={480}
      height={600}
      minWidth={360}
      minHeight={340}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={<AgentSneakPeekCopyMenu agentId={agentId} />}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AgentSneakPeekContent agentId={agentId} active />
      </div>
    </WindowPanel>
  );
}
