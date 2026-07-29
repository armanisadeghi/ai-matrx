"use client";

/**
 * SmartAgentInputSingleRow
 *
 * Single-row layout: textarea left, action buttons right (compact pill look).
 * Variables and resource chips stack above the row when present.
 * Self-contained — handles its own uninitialized shell fallback when
 * conversationId is missing, so it can be used directly without going
 * through SmartAgentInput.
 *
 * Required prop: conversationId (may be null/undefined while initializing).
 */

import React, { useState } from "react";
import { SmartAgentResourceChips } from "../resources/SmartAgentResourceChips";
import { AttachedDocumentChips } from "../resources/AttachedDocumentChips";
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { SingleRowActionButtons } from "./SingleRowActionButtons";
import { ConversationContextRail } from "./ConversationContextRail";
import { UninitializedShell } from "./UninitializedShell";
import { SmartInputFileDropTarget } from "./SmartInputFileDropTarget";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectAllResourcesResolved } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";

interface SmartAgentInputSingleRowProps {
  conversationId: string | null | undefined;
  sendButtonVariant?: "default" | "blue";
  uploadRoot?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
  surfaceKey?: string;
  disableSend?: boolean;
  variablesPanelStyle?: VariablesPanelStyle;
  extraRightControls?: React.ReactNode;
}

export function SmartAgentInputSingleRow({
  conversationId,
  sendButtonVariant = "default",
  uploadRoot = "userContent",
  uploadPath = "agent-attachments",
  enablePasteImages = true,
  showSendButton = true,
  showVariableIcon = true,
  surfaceKey,
  disableSend = false,
  variablesPanelStyle,
  extraRightControls,
}: SmartAgentInputSingleRowProps) {
  const dispatch = useAppDispatch();
  // Gate send (button + Enter) while the mic is recording or finishing a
  // transcript — submitting mid-voice drops the trailing audio and leaves the
  // recorder running.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const allResourcesResolved = useAppSelector(
    selectAllResourcesResolved(conversationId ?? ""),
  );
  const sendBlocked = disableSend || voiceBusy || !allResourcesResolved;

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-7 w-7 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-40 text-white"
      : "h-7 w-7 p-0 shrink-0 rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-40 text-foreground";

  if (!conversationId) {
    return <UninitializedShell sendBtnClass={sendBtnClass} singleRow />;
  }

  const handleSubmit = () => {
    if (!sendBlocked) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  return (
    <SmartInputFileDropTarget
      conversationId={conversationId}
      uploadRoot={uploadRoot}
      uploadPath={uploadPath}
      className="flex w-full flex-col gap-1"
    >
      {/* Conversation context rail (working doc, scratchpad, lists, context) */}
      <ConversationContextRail conversationId={conversationId} />

      {/* Variable inputs (stacked above the row when present) */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
      />

      {/* Resource chips (stacked above the row when present) */}
      <SmartAgentResourceChips conversationId={conversationId} />
      {/* Durable document attachments (association edges) — persist across turns/reloads */}
      <AttachedDocumentChips conversationId={conversationId} />

      {/* Single horizontal row */}
      <div className="flex items-center gap-1 bg-card rounded-none border border-border px-2 py-1 w-full min-w-0">
        {/* Textarea — flex-1 so it fills available width */}
        <div className="flex-1 min-w-0">
          <AgentTextarea
            conversationId={conversationId}
            compact
            uploadRoot={uploadRoot}
            uploadPath={uploadPath}
            enablePasteImages={enablePasteImages}
            surfaceKey={surfaceKey}
            disableSend={sendBlocked}
            singleRow
          />
        </div>

        {/* Action buttons pinned to the right */}
        <SingleRowActionButtons
          conversationId={conversationId}
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          showSendButton={showSendButton}
          showVariableIcon={showVariableIcon}
          sendButtonVariant={sendButtonVariant}
          surfaceKey={surfaceKey}
          disableSend={sendBlocked}
          onVoiceBusyChange={setVoiceBusy}
          extraRightControls={extraRightControls}
        />
      </div>
    </SmartInputFileDropTarget>
  );
}
