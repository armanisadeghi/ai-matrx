"use client";

/**
 * ScopeBatchImportWindow
 *
 * Floating-window shortcut for batch-creating Variables and Context Slots
 * from a scope type's context items, opened from either the Variables or
 * Context Slots chip rows in the agent builder. Content is the route-shared
 * `ScopeBatchImportBody` — this file is only the WindowPanel shell.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ScopeBatchImportBody } from "@/features/agents/components/scope-batch-import/ScopeBatchImportBody";

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
      <ScopeBatchImportBody agentId={agentId} />
    </WindowPanel>
  );
}
