"use client";

/**
 * A shared chat's tool steps, rendered through the chat's OWN tool cards
 * (access ladder T-19b). The entry is the same `ToolLifecycleEntry` a reloaded
 * turn builds (`sharedToolEntry` ≙ `persistedToolEntry`), so every tool gets the
 * registry's renderer — static, DB-authored, or the generic disclosure line —
 * exactly as a reader of the chat sees it. A run of consecutive steps folds
 * into the chat's `ToolCallBatch` line.
 *
 * What reaches this component is the step as written (no masking pass — the
 * access-ladder law); a credential, raw-log or coding-session tool arrives withheld
 * (name + status only) and says so under its line.
 *
 * Loaded through `next/dynamic` from `./conversation-lens.tsx` so the tool
 * renderer graph stays out of every other share lens's chunk.
 */

import { Lock } from "lucide-react";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { ToolCallBatch } from "@/features/tool-call-visualization/components/ToolCallBatch";
import { sharedToolEntry, type SharedChatTool } from "./conversation-transcript";

function WithheldNote() {
  return (
    <p className="ml-5 flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="h-3 w-3 shrink-0" aria-hidden />
      Details of this step are private and not included in the shared view.
    </p>
  );
}

function OneTool({
  tool,
  conversationId,
}: {
  tool: SharedChatTool;
  conversationId: string;
}) {
  return (
    <div className="min-w-0" data-shared-tool={tool.name}>
      <ToolCallVisualization
        entries={[sharedToolEntry(tool)]}
        conversationId={conversationId}
        hasContent
        isPersisted
      />
      {tool.withheld ? <WithheldNote /> : null}
      {tool.outputTruncated ? (
        <p className="ml-5 text-xs text-muted-foreground">
          This result was very large; the shared view shows its summary.
        </p>
      ) : null}
    </div>
  );
}

export default function SharedConversationToolSteps({
  tools,
  conversationId,
}: {
  tools: SharedChatTool[];
  conversationId: string;
}) {
  if (tools.length === 1) {
    return <OneTool tool={tools[0]} conversationId={conversationId} />;
  }
  return (
    <ToolCallBatch
      entries={tools.map(sharedToolEntry)}
      conversationId={conversationId}
      isPersisted
    >
      {tools.map((tool) => (
        <OneTool key={tool.callId} tool={tool} conversationId={conversationId} />
      ))}
    </ToolCallBatch>
  );
}
