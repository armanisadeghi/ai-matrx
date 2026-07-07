"use client";

/**
 * PromptPreviewWindow
 *
 * Floating-window presentation of the full-prompt dry-run preview. Wraps the
 * shared `PromptPreviewContent` (which runs `requestPromptPreview` on mount) in
 * a draggable / resizable / minimizable `WindowPanel`, so a creator can keep the
 * assembled prompt — context, tools, and the auto-injected Matrx Actions
 * guidance — open beside their work instead of in a blocking dialog.
 *
 * Read-only: the content calls no model and persists nothing.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { PromptPreviewContent } from "@/features/agents/prompt-preview/PromptPreviewContent";

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
      <PromptPreviewContent conversationId={conversationId} />
    </WindowPanel>
  );
}
