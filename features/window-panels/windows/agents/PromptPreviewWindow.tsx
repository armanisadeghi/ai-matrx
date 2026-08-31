"use client";

/**
 * PromptPreviewWindow
 *
 * Floating-window presentation of the full-prompt dry-run preview. Wraps the
 * shared `PromptPreviewContent` (which runs `requestPromptPreview` on mount) in
 * a draggable / resizable / minimizable `WindowPanel`, so a creator can keep the
 * assembled prompt — context, tools, and the auto-injected Matrx Directives
 * guidance — open beside their work instead of in a blocking dialog.
 *
 * Read-only: the content calls no model and persists nothing.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { PromptPreviewContent } from "@/features/agents/prompt-preview/PromptPreviewContent";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceAgentId } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useAgentMenuSection, agentEntityRef } from "@/features/agents/menu/agent-actions";

interface PromptPreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
}

const WINDOW_ID = "prompt-preview-window";
const OVERLAY_ID = "promptPreviewWindow";

export default function PromptPreviewWindow({
  isOpen,
  onClose,
  conversationId,
}: PromptPreviewWindowProps) {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectInstanceAgentId(conversationId));
  const agentName = useAppSelector((s) =>
    agentId ? (selectAgentName(s, agentId) ?? null) : null,
  );
  const agentSection = useAgentMenuSection({
    agentId: agentId ?? "",
    agentName,
    onRefresh: agentId ? () => dispatch(fetchFullAgent(agentId)) : undefined,
  });

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Full prompt preview"
      onClose={onClose}
      width={720}
      height={720}
      minWidth={480}
      minHeight={420}
      overlayId={OVERLAY_ID}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* Read-only prompt dry-run text — Copy/Export of the assembled prompt
          is the obvious want here; the entity is the agent this prompt was
          built for. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentId ? agentEntityRef(agentId, agentName) : undefined}
        extraSections={agentId ? [agentSection] : []}
      >
        <PromptPreviewContent conversationId={conversationId} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
