"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import ExecutionInstanceInspector from "@/components/admin/state-analyzer/execution-inspector/ExecutionInstanceInspector";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
// context-menu-exempt: entity — a Redux state dump of an in-memory execution instance keyed by conversationId, not a persisted record with an entity token

interface ExecutionInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExecutionInspectorWindow({
  isOpen,
  onClose,
}: ExecutionInspectorWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id="execution-inspector-window"
      title="Execution Inspector"
      onClose={onClose}
      width="80vw"
      height="75dvh"
      minWidth={900}
      minHeight={500}
      urlSyncKey="exec-inspector"
      urlSyncId="execution-inspector-window"
      urlSyncArgs={{ m: "ei" }}
      overlayId="executionInspectorWindow"
    >
      <NonEditableContextMenu
        sourceFeature="admin"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
      >
        <ExecutionInstanceInspector className="flex-1 h-full" />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
