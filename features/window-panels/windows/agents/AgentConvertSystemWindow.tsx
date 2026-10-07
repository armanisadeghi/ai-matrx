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
import { AgentComingSoonContent } from "@ai-matrx/chat/agents/components/coming-soon/AgentComingSoonContent";
import { AgentSyncBody } from "@/features/agents/components/admin/AgentSyncBody";
import {
  agentDefaultHolder,
  putMandateDefaultHolder,
} from "@/features/mandates/overrides";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAgentMenuSection, agentEntityRef } from "@ai-matrx/chat/agents/menu/agent-actions";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

interface AgentConvertSystemWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  /**
   * Optional agent-mandate context (set by the admin mandates console). All three
   * are plain serializable values carried through overlay data — the rebind
   * callback is constructed HERE, never passed through Redux. When `mandateId`
   * is present the sync body offers "Rebind mandate to system side" in place,
   * writing through the ONE gated door for a mandate's default holder
   * (`putMandateDefaultHolder`), never through the definition row.
   */
  mandateId?: string | null;
  mandateKey?: AnyMandateKey | null;
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
  const dispatch = useAppDispatch();
  const agentName = useAgentName(agentId) ?? null;
  const agentSection = buildAgentMenuSection({
    agentId: agentId ?? "",
    agentName,
    onRefresh: agentId ? () => dispatch(fetchFullAgent(agentId)) : undefined,
  });

  if (!isOpen) return null;

  const rebindMandateToSystem = mandateId
    ? async (systemAgentId: string): Promise<void> => {
        // Rebinding to the system twin always tracks latest — the twin is the
        // agent we now maintain, so pinning it to the version that existed at
        // conversion time would freeze it immediately.
        //
        // THROUGH THE DOOR (AD226, FIX-R5): this is the mandate's SYSTEM rung,
        // so it goes through `PUT /mandates/{key}/default-holder` like every
        // other rebind. The door needs the mandate KEY, which is why this
        // callback is only offered when the console passed one.
        if (!mandateKey) {
          throw new Error(
            "This window was opened without the mandate's key, so the rebind door " +
              "cannot be addressed. Open Linked Agent Sync from the mandates console.",
          );
        }
        await putMandateDefaultHolder(
          dispatch,
          mandateKey,
          agentDefaultHolder(systemAgentId),
        );
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
          description="Open it from an agent's actions menu"
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
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentEntityRef(agentId, agentName)}
        extraSections={[agentSection]}
      >
        <AgentSyncBody
          key={agentId}
          agentId={agentId}
          onClose={onClose}
          mandateKey={mandateKey ?? undefined}
          mandateLabel={mandateLabel ?? mandateKey ?? undefined}
          onRebindToSystem={rebindMandateToSystem}
        />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
