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
 *   ambient           — either quiet single-line or multiline launcher chrome
 *
 * Required prop: conversationId.
 */

import React from "react";
import { SmartAgentInputStacked } from "./SmartAgentInputStacked";
import { SmartAgentInputSingleRow } from "./SmartAgentInputSingleRow";
import { InboxQueueStrip } from "./InboxQueueStrip";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import type { ComposerPresentation } from "./composer/composer-types";

export interface SmartAgentInputSurfaceValueAnchors {
  variables?: string;
  resources?: string;
  context?: string;
}

interface SmartAgentInputProps {
  conversationId: string | null | undefined;
  /**
   * `ambient` is the quiet, single-line launcher used by scroll-revealed page
   * assistants. It keeps the canonical composer/execution path while hiding
   * context, variable, resource, voice, and connector chrome until the full
   * conversation surface opens.
   */
  presentation?: "default" | "ambient";
  /** Choose the ambient launcher's footprint without changing its behavior. */
  ambientLayout?: "single-line" | "multiline";
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
  contextRailPresentation?: "default" | "overflow-only";
  contextRailAttachedItems?: readonly AttachedContextRailItem[];
  extraRightControls?: React.ReactNode;
  /** Optional Locate anchors supplied by an owning surface. */
  surfaceValueAnchors?: SmartAgentInputSurfaceValueAnchors;
  /**
   * The three-mode, three-size composer (Chat · Work · Advanced; splash · page
   * · compact) — common-docs/projects/ai-matrx-composer/MAP.md. ABSENT = this
   * component renders exactly as it always has; every existing host is
   * untouched. Present = the same engine in the composer's arrangement.
   */
  composer?: ComposerPresentation;
}

export function SmartAgentInput({
  conversationId,
  presentation = "default",
  ambientLayout = "single-line",
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
  contextRailPresentation = "default",
  contextRailAttachedItems,
  extraRightControls,
  surfaceValueAnchors,
  composer,
}: SmartAgentInputProps) {
  const isAmbient = presentation === "ambient";
  // Queued-while-running message cards render above EITHER variant, so every
  // surface that mounts a composer also sees / edits / withdraws its queue
  // (/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md). Renders null when the queue is empty.
  const queueStrip =
    conversationId && !isAmbient ? (
      <InboxQueueStrip conversationId={conversationId} />
    ) : null;

  if (
    !composer &&
    (singleRowTextarea || (isAmbient && ambientLayout === "single-line"))
  ) {
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
          contextRailPresentation={contextRailPresentation}
          contextRailAttachedItems={contextRailAttachedItems}
          extraRightControls={extraRightControls}
          surfaceValueAnchors={surfaceValueAnchors}
          presentation={presentation}
        />
      </>
    );
  }

  return (
    <>
      {queueStrip}
      <SmartAgentInputStacked
        conversationId={conversationId}
        presentation={presentation}
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
        contextRailPresentation={contextRailPresentation}
        contextRailAttachedItems={contextRailAttachedItems}
        extraRightControls={extraRightControls}
        surfaceValueAnchors={surfaceValueAnchors}
        composer={composer}
      />
    </>
  );
}
