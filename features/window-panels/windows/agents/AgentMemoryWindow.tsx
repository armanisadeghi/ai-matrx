"use client";

/**
 * AgentMemoryWindow — lets a user browse, edit, add, and remove the
 * memories the agent has saved about them (`chat.agent_memory`).
 *
 * Thin composition root: `useAgentMemories()` is hoisted here so the
 * sidebar, body, and footer slots (siblings under WindowPanel) all read the
 * same state. Body renders content only; everything else is a slot.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Brain } from "lucide-react";
import { useAgentMemories } from "@/features/agents/components/memory/hooks/useAgentMemories";
import { AgentMemorySidebar } from "@/features/agents/components/memory/components/AgentMemorySidebar";
import { AgentMemoryBody } from "@/features/agents/components/memory/components/AgentMemoryBody";
import { AgentMemoryFooter } from "@/features/agents/components/memory/components/AgentMemoryFooter";

interface AgentMemoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const WINDOW_ID = "agent-memory-window";
const OVERLAY_ID = "agentMemoryWindow";

export default function AgentMemoryWindow({
  isOpen,
  onClose,
}: AgentMemoryWindowProps) {
  const state = useAgentMemories();

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      titleNode={
        <span className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Memory
        </span>
      }
      onClose={onClose}
      width={860}
      height={600}
      position="center"
      minWidth={560}
      minHeight={400}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      sidebar={<AgentMemorySidebar state={state} />}
      sidebarDefaultSize={240}
      sidebarMinSize={180}
      footer={<AgentMemoryFooter state={state} />}
    >
      <AgentMemoryBody state={state} />
    </WindowPanel>
  );
}
