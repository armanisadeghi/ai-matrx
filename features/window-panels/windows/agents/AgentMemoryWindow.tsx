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
import { Brain, Copy, RefreshCw } from "lucide-react";
import { useAgentMemories } from "@/features/agents/components/memory/hooks/useAgentMemories";
import { AgentMemorySidebar } from "@/features/agents/components/memory/components/AgentMemorySidebar";
import { AgentMemoryBody } from "@/features/agents/components/memory/components/AgentMemoryBody";
import { AgentMemoryFooter } from "@/features/agents/components/memory/components/AgentMemoryFooter";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY, type ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { toast } from "@/lib/toast";
import { displayTitleForMemory } from "@/features/agents/components/memory/types";

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

  const selected = state.selectedMemory;

  // Identity here is the memory row (`chat.agent_memory`), not the agent that
  // wrote it — this window has no single agentId at all, it lists every
  // memory the platform holds about the current user across every agent.
  // Page-local: `AgentMemoryRow` only ever renders inside this window
  // (`grep -rl "AgentMemoryRow" features app` → AgentMemorySidebar +
  // AgentMemoryEditor, both children of this one surface).
  const memorySection: ContextMenuExtraSection = {
    id: "agent-memory",
    label: "Memory",
    icon: Brain,
    items: [
      {
        kind: "item",
        id: "am-copy-id",
        label: "Copy memory ID",
        icon: Copy,
        disabled: !selected,
        onSelect: () => {
          if (!selected) return;
          void navigator.clipboard.writeText(selected.id);
          toast.success("Memory ID copied");
        },
      },
      {
        kind: "item",
        id: "am-copy-content",
        label: "Copy memory content",
        icon: Copy,
        disabled: !selected,
        onSelect: () => {
          if (!selected) return;
          void navigator.clipboard.writeText(selected.content);
          toast.success("Memory content copied");
        },
      },
      {
        kind: "item",
        id: "am-refresh",
        label: "Refresh memories",
        icon: RefreshCw,
        onSelect: () => void state.refresh(),
      },
    ],
  };

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
      {/* Entity token is `cx_agent_memory` — despite the `cx_` prefix this one
          maps to schema "chat" table "agent_memory" (verified against the
          generated `@ai-matrx/associations` vocabulary), which is exactly
          this row. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        contextData={{ content: selected ? `${displayTitleForMemory(selected)}\n\n${selected.content}` : "" }}
        entity={
          selected
            ? { type: "cx_agent_memory", id: selected.id, title: displayTitleForMemory(selected) }
            : undefined
        }
        resolveContextOnOpen={() =>
          selected
            ? {
                content: `${displayTitleForMemory(selected)}\n\n${selected.content}`,
                [CONTEXT_MENU_ENTITY_KEY]: { type: "cx_agent_memory", id: selected.id, title: displayTitleForMemory(selected) },
              }
            : null
        }
        extraSections={[memorySection]}
      >
        <AgentMemoryBody state={state} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
