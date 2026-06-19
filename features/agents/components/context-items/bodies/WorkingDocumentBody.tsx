"use client";

/**
 * Working-document drawer body. The working document is a live, collaborative
 * context item re-sent every turn — so editing it here reaches the agent
 * automatically (no re-attach needed). Reuses the canonical
 * `WorkingDocumentPanel`, conversation-keyed.
 */

import { WorkingDocumentPanel } from "@/features/agents/components/working-document/WorkingDocumentPanel";
import type { ContextItemBodyProps } from "../types";

export function WorkingDocumentBody({ item }: ContextItemBodyProps) {
  return (
    <div className="h-full min-h-0">
      <WorkingDocumentPanel
        conversationId={item.conversationId}
        showHeader
        showEnableToggle={false}
      />
    </div>
  );
}
