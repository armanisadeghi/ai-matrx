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

import React from "react";
import { SmartAgentResourceChips } from "../resources/SmartAgentResourceChips";
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { SingleRowActionButtons } from "./SingleRowActionButtons";
import { UninitializedShell } from "./UninitializedShell";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";

interface SmartAgentInputSingleRowProps {
  conversationId: string | null | undefined;
  sendButtonVariant?: "default" | "blue";
  uploadBucket?: string;
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
  uploadBucket = "userContent",
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

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-7 w-7 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-40 text-white"
      : "h-7 w-7 p-0 shrink-0 rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-40 text-foreground";

  if (!conversationId) {
    return <UninitializedShell sendBtnClass={sendBtnClass} singleRow />;
  }

  const handleSubmit = () => {
    if (!disableSend) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Variable inputs (stacked above the row when present) */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
      />

      {/* Resource chips (stacked above the row when present) */}
      <SmartAgentResourceChips conversationId={conversationId} />

      {/* Single horizontal row */}
      <div className="flex items-center gap-1 bg-card rounded-none border border-border px-2 py-1 w-full min-w-0">
        {/* Textarea — flex-1 so it fills available width */}
        <div className="flex-1 min-w-0">
          <AgentTextarea
            conversationId={conversationId}
            compact
            uploadBucket={uploadBucket}
            uploadPath={uploadPath}
            enablePasteImages={enablePasteImages}
            surfaceKey={surfaceKey}
            disableSend={disableSend}
            singleRow
          />
        </div>

        {/* Action buttons pinned to the right */}
        <SingleRowActionButtons
          conversationId={conversationId}
          uploadBucket={uploadBucket}
          uploadPath={uploadPath}
          showSendButton={showSendButton}
          showVariableIcon={showVariableIcon}
          sendButtonVariant={sendButtonVariant}
          surfaceKey={surfaceKey}
          disableSend={disableSend}
          extraRightControls={extraRightControls}
        />
      </div>
    </div>
  );
}
