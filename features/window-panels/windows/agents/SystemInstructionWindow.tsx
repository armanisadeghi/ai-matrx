"use client";

/**
 * SystemInstructionWindow
 *
 * Floating-window twin of `SystemInstructionModal`. Both wrap the same
 * `SystemInstructionEditor` (Redux-backed, keyed by conversationId), so they
 * stay in sync — the window is simply the draggable / resizable / minimizable
 * presentation for users who want to keep the structured-instruction editor
 * open alongside their work instead of in a blocking dialog.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SystemInstructionEditor } from "@/features/agents/components/builder/message-builders/system-instructions/SystemInstructionEditor";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceAgentId } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAgentMenuSection, agentEntityRef } from "@ai-matrx/chat/agents/menu/agent-actions";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

interface SystemInstructionWindowProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
}

const WINDOW_ID = "system-instruction-window";
const OVERLAY_ID = "systemInstructionWindow";

export default function SystemInstructionWindow({
  isOpen,
  onClose,
  conversationId,
}: SystemInstructionWindowProps) {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectInstanceAgentId(conversationId));
  const agentName = useAgentName(agentId) ?? null;
  const agentSection = buildAgentMenuSection({
    agentId: agentId ?? "",
    agentName,
    onRefresh: agentId ? () => dispatch(fetchFullAgent(agentId)) : undefined,
  });

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Structured System Instruction"
      onClose={onClose}
      width={620}
      height={640}
      minWidth={420}
      minHeight={360}
      overlayId={OVERLAY_ID}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* A multi-field structured form (intro/outro/injected sections/…), not
          one textarea — each `ProTextarea` field has no menu of its own
          (out of scope: components/official/ProTextarea.tsx carries no
          EditableContextMenu today), so this wraps the pane read-only with
          Copy/Export of the whole structured instruction and the agent it
          belongs to. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentId ? agentEntityRef(agentId, agentName) : undefined}
        extraSections={agentId ? [agentSection] : []}
      >
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          <SystemInstructionEditor conversationId={conversationId} />
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
