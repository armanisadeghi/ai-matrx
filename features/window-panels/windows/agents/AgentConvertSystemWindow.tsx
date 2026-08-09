"use client";

/**
 * AgentConvertSystemWindow
 *
 * Floating window wrapping `AgentSyncBody` — the unified link surface between a
 * user agent and its system ("builtin") twin. From either side it offers the
 * relationship map, structured configuration diff, pull/push sync, personal-copy
 * creation, and the convert-to-new-system bootstrap when no twin exists.
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
      width={960}
      height={740}
      minWidth={560}
      minHeight={480}
      overlayId={OVERLAY_ID}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <AgentSyncBody key={agentId} agentId={agentId} onClose={onClose} />
    </WindowPanel>
  );
}
