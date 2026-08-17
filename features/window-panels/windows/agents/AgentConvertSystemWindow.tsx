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
import { updateMandateDefinition } from "@/features/admin/mandates/service";

interface AgentConvertSystemWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  /**
   * Optional agent-mandate context (set by the admin mandates console). All three
   * are plain serializable values carried through overlay data — the rebind
   * callback is constructed HERE, never passed through Redux. When `mandateId`
   * is present the sync body offers "Rebind mandate to system side" in place,
   * writing through the console's canonical `updateMandateDefinition` path.
   */
  mandateId?: string | null;
  mandateKey?: string | null;
  mandateLabel?: string | null;
}

const WINDOW_ID = "agent-convert-system-window";
const OVERLAY_ID = "agentConvertSystemWindow";

export default function AgentConvertSystemWindow({
  isOpen,
  onClose,
  agentId,
  mandateId,
  mandateKey,
  mandateLabel,
}: AgentConvertSystemWindowProps) {
  if (!isOpen) return null;

  const rebindMandateToSystem = mandateId
    ? async (systemAgentId: string): Promise<void> => {
        await updateMandateDefinition(mandateId, {
          default_agent_id: systemAgentId,
          default_agent_version_id: null,
          use_latest: true,
        });
      }
    : undefined;

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
      <AgentSyncBody
        key={agentId}
        agentId={agentId}
        onClose={onClose}
        mandateKey={mandateKey ?? undefined}
        mandateLabel={mandateLabel ?? mandateKey ?? undefined}
        onRebindToSystem={rebindMandateToSystem}
      />
    </WindowPanel>
  );
}
