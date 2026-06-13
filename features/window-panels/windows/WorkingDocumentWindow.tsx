"use client";

/**
 * WorkingDocumentWindow — the floating-window wrapper around the reusable
 * `WorkingDocumentPanel`. Renders the working document for a single
 * conversation inside a draggable/resizable `WindowPanel`.
 *
 * Multi-instance, keyed by conversationId (see the `workingDocumentWindow`
 * opener). Ephemeral: unbound document content lives in Redux only, so the
 * window is not restored across reloads.
 */

import { useCallback } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WorkingDocumentPanel } from "@/features/agents/components/working-document/WorkingDocumentPanel";

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
      title="Working document"
      width={560}
      height={640}
      minWidth={360}
      minHeight={320}
      onClose={onClose}
      overlayId="workingDocumentWindow"
      onCollectData={collectData}
    >
      <WorkingDocumentPanel
        conversationId={conversationId}
        showOpenInWindow={false}
        className="h-full"
      />
    </WindowPanel>
  );
}
