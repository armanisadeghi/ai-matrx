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
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <SystemInstructionEditor conversationId={conversationId} />
      </div>
    </WindowPanel>
  );
}
