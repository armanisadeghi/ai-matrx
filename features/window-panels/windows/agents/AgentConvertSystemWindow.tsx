"use client";

/**
 * AgentConvertSystemWindow
 *
 * Floating window wrapping `AgentSyncBody` — the unified link surface between a
 * user agent and its system ("builtin") twin. From either side it offers:
 * pull (system → my copy), push (user → system), create-my-personal-copy, and
 * the convert-to-new-system bootstrap when a user agent has no twin yet.
 *
 * The overlay id (`agentConvertSystemWindow`) and registry slug
 * (`agent-convert-system-window`) are preserved so the menu dispatcher
 * (`openAgentConvertSystemWindow`) and existing persisted sessions keep working.
 */

import { Link2 } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentComingSoonContent } from "@/features/agents/components/coming-soon/AgentComingSoonContent";
import { AgentSyncBody } from "@/features/agents/components/admin/AgentSyncBody";

interface AgentConvertSystemWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
}

const WINDOW_ID = "agent-convert-system-window";
const OVERLAY_ID = "agentConvertSystemWindow";

export default function AgentConvertSystemWindow({
  isOpen,
  onClose,
  agentId,
}: AgentConvertSystemWindowProps) {
  if (!isOpen) return null;

  if (!agentId) {
    return (
      <WindowPanel
        id={WINDOW_ID}
        title="Linked Agent Sync"
        onClose={onClose}
        width={520}
        height={360}
        minWidth={420}
        minHeight={300}
        overlayId={OVERLAY_ID}
      >
        <AgentComingSoonContent
          icon={Link2}
          title="No agent selected"
          description="Open this window from an agent's actions menu to sync it with its linked system or user agent."
          agentId={null}
        />
      </WindowPanel>
    );
  }

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Linked Agent Sync"
      onClose={onClose}
      width={620}
      height={580}
      minWidth={480}
      minHeight={420}
      overlayId={OVERLAY_ID}
      bodyClassName="p-4"
    >
      <AgentSyncBody agentId={agentId} onClose={onClose} />
    </WindowPanel>
  );
}
