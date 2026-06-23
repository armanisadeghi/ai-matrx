"use client";

/**
 * WorkingDocumentWindow — the floating-window wrapper around the unified
 * `DocumentsWorkspace`. Renders the conversation's working document AND
 * scratchpad as tabs, with a collapsible recent-docs rail, inside a
 * draggable/resizable `WindowPanel`.
 *
 * Multi-instance, keyed by conversationId (see the `workingDocumentWindow`
 * opener). Ephemeral: unbound document content lives in Redux only, so the
 * window is not restored across reloads.
 */

import { useCallback } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { DocumentsWorkspace } from "@/features/agents/components/working-document/documents-workspace/DocumentsWorkspace";

interface WorkingDocumentWindowProps {
  isOpen: boolean;
  onClose?: () => void;
  instanceId?: string;
  conversationId?: string | null;
}

export default function WorkingDocumentWindow({
  isOpen,
  onClose,
  instanceId,
  conversationId,
}: WorkingDocumentWindowProps) {
  const collectData = useCallback(
    () => ({ conversationId: conversationId ?? null }),
    [conversationId],
  );

  if (!isOpen || !conversationId) return null;

  return (
    <WindowPanel
      id={instanceId}
      title="Documents"
      width={720}
      height={640}
      minWidth={420}
      minHeight={320}
      onClose={onClose}
      overlayId="workingDocumentWindow"
      onCollectData={collectData}
    >
      <DocumentsWorkspace
        conversationId={conversationId}
        defaultRailOpen
        className="h-full"
      />
    </WindowPanel>
  );
}
