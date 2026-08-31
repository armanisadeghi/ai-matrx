"use client";

/**
 * ScopeBatchImportWindow
 *
 * Floating-window shortcut for batch-creating Variables and Context Policies
 * from a scope type's context items, opened from either the Variables or
 * Context Policies chip rows in the agent builder. Content is the route-shared
 * `ScopeBatchImportBody` — this file is only the WindowPanel shell.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ScopeBatchImportBody } from "@/features/agents/components/scope-batch-import/ScopeBatchImportBody";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useAgentMenuSection, agentEntityRef } from "@/features/agents/menu/agent-actions";

interface ScopeBatchImportWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
}

const WINDOW_ID = "scope-batch-import-window";
const OVERLAY_ID = "scopeBatchImportWindow";

export default function ScopeBatchImportWindow({
  isOpen,
  onClose,
  agentId,
}: ScopeBatchImportWindowProps) {
  const dispatch = useAppDispatch();
  const agentName = useAppSelector((s) => selectAgentName(s, agentId) ?? null);
  const agentSection = useAgentMenuSection({
    agentId,
    agentName,
    onRefresh: () => dispatch(fetchFullAgent(agentId)),
  });

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Batch add from scope"
      onClose={onClose}
      width={720}
      height={640}
      minWidth={520}
      minHeight={420}
      overlayId={OVERLAY_ID}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* No onDone→close: a user typically repeats this for several scope types
          in one sitting, so a successful batch resets selection but leaves the
          window open. They close it explicitly when done. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentEntityRef(agentId, agentName)}
        extraSections={[agentSection]}
      >
        <ScopeBatchImportBody agentId={agentId} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
