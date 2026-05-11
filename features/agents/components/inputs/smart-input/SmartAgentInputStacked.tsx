"use client";

/**
 * SmartAgentInputStacked
 *
 * Stacked layout: variables → chips → textarea → toolbar.
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
import { InputActionButtons } from "./InputActionButtons";
import { UninitializedShell } from "./UninitializedShell";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";

interface SmartAgentInputStackedProps {
  conversationId: string | null | undefined;
  sendButtonVariant?: "default" | "blue";
  showSubmitOnEnterToggle?: boolean;
  uploadBucket?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  compact?: boolean;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
  surfaceKey?: string;
  disableSend?: boolean;
  variablesPanelStyle?: VariablesPanelStyle;
  extraRightControls?: React.ReactNode;
}

export function SmartAgentInputStacked({
  conversationId,
  sendButtonVariant = "default",
  showSubmitOnEnterToggle = true,
  uploadBucket = "userContent",
  uploadPath = "agent-attachments",
  enablePasteImages = true,
  compact = false,
  showSendButton = true,
  showVariableIcon = true,
  surfaceKey,
  disableSend = false,
  variablesPanelStyle,
  extraRightControls,
}: SmartAgentInputStackedProps) {
  const dispatch = useAppDispatch();

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-7 w-7 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-40 text-white"
      : "h-7 w-7 p-0 shrink-0 rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-40 text-foreground";

  if (!conversationId) {
    return <UninitializedShell sendBtnClass={sendBtnClass} singleRow={false} />;
  }

  const handleSubmit = () => {
    if (!disableSend) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  return (
    <div
      className={`flex flex-col min-h-0 bg-card rounded-lg w-full ${compact ? "max-w-[500px]" : "max-w-[800px]"} border border-border overflow-hidden`}
    >
      {/* Variable inputs — scrolls internally, never pushes textarea/toolbar off screen */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact={compact}
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
      />

      {/* Resource chips — pinned, never scrolls away */}
      <SmartAgentResourceChips conversationId={conversationId} />

      {/* Textarea — shrinks slightly under pressure but stays visible */}
      <AgentTextarea
        conversationId={conversationId}
        compact={compact}
        uploadBucket={uploadBucket}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        surfaceKey={surfaceKey}
        disableSend={disableSend}
      />

      {/* Toolbar — always pinned at the bottom */}
      <InputActionButtons
        conversationId={conversationId}
        uploadBucket={uploadBucket}
        uploadPath={uploadPath}
        showSendButton={showSendButton}
        showSubmitOnEnterToggle={showSubmitOnEnterToggle}
        showVariableIcon={showVariableIcon}
        sendButtonVariant={sendButtonVariant}
        surfaceKey={surfaceKey}
        disableSend={disableSend}
        extraRightControls={extraRightControls}
      />
    </div>
  );
}
