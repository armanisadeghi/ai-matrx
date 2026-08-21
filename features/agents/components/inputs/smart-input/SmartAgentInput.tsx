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
import { InboxQueueStrip } from "./InboxQueueStrip";
import { ChatConnectorStrip } from "@/features/connectors/ChatConnectorStrip";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";

interface SmartAgentInputProps {
  conversationId: string | null | undefined;
  /**
   * `ambient` is the quiet, single-line launcher used by scroll-revealed page
   * assistants. It keeps the canonical composer/execution path while hiding
   * context, variable, resource, voice, and connector chrome until the full
   * conversation surface opens.
   */
  presentation?: "default" | "ambient";
  singleRowTextarea?: boolean;
  sendButtonVariant?: "default" | "blue";
  showSubmitOnEnterToggle?: boolean;
  uploadRoot?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  compact?: boolean;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
  surfaceKey?: string;
  disableSend?: boolean;
  variablesPanelStyle?: VariablesPanelStyle;
  extraRightControls?: React.ReactNode;
  /**
   * Show the connector reminder line under the composer. Default true — a
   * surface opts OUT only when it genuinely has no room (an embedded runner,
   * a single-purpose form), never to tidy the UI.
   */
  showConnectors?: boolean;
}

export function SmartAgentInput({
  conversationId,
  presentation = "default",
  singleRowTextarea = false,
  sendButtonVariant = "default",
  showSubmitOnEnterToggle = true,
  uploadRoot = "userContent",
  uploadPath = "agent-attachments",
  enablePasteImages = true,
  compact = false,
  showSendButton = true,
  showVariableIcon = true,
  surfaceKey,
  disableSend = false,
  variablesPanelStyle,
  extraRightControls,
  showConnectors = true,
}: SmartAgentInputProps) {
  const isAmbient = presentation === "ambient";
  // Queued-while-running message cards render above EITHER variant, so every
  // surface that mounts a composer also sees / edits / withdraws its queue
  // (docs/TURN_BOUNDARY_INBOX.md). Renders null when the queue is empty.
  const queueStrip = conversationId && !isAmbient ? (
    <InboxQueueStrip conversationId={conversationId} />
  ) : null;

  // One quiet line under EVERY composer variation: what this conversation could
  // reach if the user connected it. Mounted here rather than in each host so a
  // new composer surface cannot forget it. Renders nothing once everything is
  // connected — it is a reminder, never a nag.
  const connectorStrip = showConnectors && !isAmbient ? (
    <ChatConnectorStrip className="mt-1.5" />
  ) : null;

  if (singleRowTextarea || isAmbient) {
    return (
      <>
        {queueStrip}
        <SmartAgentInputSingleRow
          conversationId={conversationId}
          sendButtonVariant={sendButtonVariant}
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          enablePasteImages={enablePasteImages}
          showSendButton={showSendButton}
          showVariableIcon={showVariableIcon}
          surfaceKey={surfaceKey}
          disableSend={disableSend}
          variablesPanelStyle={variablesPanelStyle}
          extraRightControls={extraRightControls}
          presentation={presentation}
        />
        {connectorStrip}
      </>
    );
  }

  return (
    <>
      {queueStrip}
      <SmartAgentInputStacked
        conversationId={conversationId}
        sendButtonVariant={sendButtonVariant}
        showSubmitOnEnterToggle={showSubmitOnEnterToggle}
        uploadRoot={uploadRoot}
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
      {connectorStrip}
    </>
  );
}
