"use client";

/**
 * SmartAgentInput
 *
 * Thin dispatcher that picks between the two standalone layout components
 * based on the `singleRowTextarea` prop. Each sub-component is fully
 * self-contained (including its own uninitialized-shell fallback) and can
 * be used directly with identical UI/behavior.
 *
 * Layout modes:
 *   default           — SmartAgentInputStacked: variables → chips → textarea → toolbar
 *   singleRowTextarea — SmartAgentInputSingleRow: horizontal row, textarea left, buttons right
 *
 * Required prop: conversationId.
 */

import React from "react";
import { SmartAgentInputStacked } from "./SmartAgentInputStacked";
import { SmartAgentInputSingleRow } from "./SmartAgentInputSingleRow";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";

interface SmartAgentInputProps {
  conversationId: string | null | undefined;
  singleRowTextarea?: boolean;
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

export function SmartAgentInput({
  conversationId,
  singleRowTextarea = false,
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
}: SmartAgentInputProps) {
  if (singleRowTextarea) {
    return (
      <SmartAgentInputSingleRow
        conversationId={conversationId}
        sendButtonVariant={sendButtonVariant}
        uploadBucket={uploadBucket}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        showSendButton={showSendButton}
        showVariableIcon={showVariableIcon}
        surfaceKey={surfaceKey}
        disableSend={disableSend}
        variablesPanelStyle={variablesPanelStyle}
        extraRightControls={extraRightControls}
      />
    );
  }

  return (
    <SmartAgentInputStacked
      conversationId={conversationId}
      sendButtonVariant={sendButtonVariant}
      showSubmitOnEnterToggle={showSubmitOnEnterToggle}
      uploadBucket={uploadBucket}
      uploadPath={uploadPath}
      enablePasteImages={enablePasteImages}
      compact={compact}
      showSendButton={showSendButton}
      showVariableIcon={showVariableIcon}
      surfaceKey={surfaceKey}
      disableSend={disableSend}
      variablesPanelStyle={variablesPanelStyle}
      extraRightControls={extraRightControls}
    />
  );
}
