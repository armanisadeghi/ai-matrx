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
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { SingleRowActionButtons } from "./SingleRowActionButtons";
import { ConversationContextRail } from "./ConversationContextRail";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import { UninitializedShell } from "./UninitializedShell";
import { SmartInputFileDropTarget } from "./SmartInputFileDropTarget";
import { smartExecute } from "../../../redux/execution-system/thunks/smart-execute.thunk";
import { selectAllResourcesResolved } from "../../../redux/execution-system/instance-resources/instance-resources.selectors";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import type { VariablesPanelStyle } from "../../../types/instance.types";
import type { SmartAgentInputSurfaceValueAnchors } from "./SmartAgentInput";

interface SmartAgentInputSingleRowProps {
  conversationId: string | null | undefined;
  sendButtonVariant?: "default" | "blue";
  uploadRoot?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  showSendButton?: boolean;
  showVariableIcon?: boolean;
  surfaceKey?: string;
  /**
   * The key an unsent draft is also kept under, so it survives a reload of a
   * composer whose conversation id is re-minted. Defaults to `surfaceKey`. A
   * page that shows several different records on one surface (each saved
   * Agent Battle) passes one per record, so one record's draft never appears
   * in another.
   */
  draftAlias?: string;
  disableSend?: boolean;
  variablesPanelStyle?: VariablesPanelStyle;
  contextRailPresentation?: "default" | "overflow-only";
  contextRailAttachedItems?: readonly AttachedContextRailItem[];
  extraRightControls?: React.ReactNode;
  surfaceValueAnchors?: SmartAgentInputSurfaceValueAnchors;
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
  draftAlias,
  disableSend = false,
  variablesPanelStyle,
  contextRailPresentation = "default",
  contextRailAttachedItems,
  extraRightControls,
  surfaceValueAnchors,
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
      className="matrx-touch-targets flex w-full flex-col gap-1"
    >
      <ConversationContextRail
        conversationId={conversationId}
        presentation={contextRailPresentation}
        attachedItems={contextRailAttachedItems}
        surfaceValueName={surfaceValueAnchors?.context}
        withAttachments
        attachmentsSurfaceValueName={surfaceValueAnchors?.resources}
      />

      {/* Variable inputs (stacked above the row when present) */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
        surfaceValueName={surfaceValueAnchors?.variables}
      />

      {/* Resource + durable document chips ride the rail's row above. */}

      {/* Single horizontal row */}
      <div
        className="flex w-full min-w-0 items-center gap-1 rounded-none border border-border bg-card px-2 py-1"
      >
        {/* Textarea — flex-1 so it fills available width */}
        <div className="flex-1 min-w-0">
          <AgentTextarea
            draftAlias={draftAlias}
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
