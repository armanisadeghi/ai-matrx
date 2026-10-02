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

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { setVariablesPanelStyle } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { SmartAgentInputStacked } from "./SmartAgentInputStacked";
import { SmartAgentInputSingleRow } from "./SmartAgentInputSingleRow";
import { InboxQueueStrip } from "./InboxQueueStrip";
import type { VariablesPanelStyle } from "../../../types/instance.types";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import type { ComposerPresentation } from "./composer/composer-types";
import { useTouchOnlyDevice } from "@host/components/official/composer/useTouchOnlyDevice";
import { selectViewerCanReply } from "../../../redux/execution-system/conversations/conversations.selectors";
import { ViewOnlyComposerBar } from "./ViewOnlyComposerBar";

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
  draftAlias,
  disableSend = false,
  variablesPanelStyle,
  contextRailPresentation = "default",
  contextRailAttachedItems,
  extraRightControls,
  surfaceValueAnchors,
  composer,
}: SmartAgentInputProps) {
  const isAmbient = presentation === "ambient";
  const touchOnly = useTouchOnlyDevice();
  const dispatch = useAppDispatch();
  // A host's style is the instance's style: written to the slice so every
  // reader (the empty state's "Fill in the fields below", the form gate
  // `selectIsVariableFormShown`) sees what the composer actually draws.
  // Compared against the slice, not fired once: the instance's creation lands
  // after this mount and writes its own default ("inline") over an earlier
  // write — seen live on the Masterwork interview — so any drift is re-applied.
  const sliceStyle = useAppSelector((state) =>
    conversationId
      ? state.instanceUIState.byConversationId[conversationId]
          ?.variablesPanelStyle
      : undefined,
  );
  useEffect(() => {
    if (conversationId && variablesPanelStyle && sliceStyle !== variablesPanelStyle) {
      dispatch(
        setVariablesPanelStyle({ conversationId, style: variablesPanelStyle }),
      );
    }
  }, [dispatch, conversationId, variablesPanelStyle, sliceStyle]);
  const viewerCanReply = useAppSelector((state) =>
    conversationId ? selectViewerCanReply(conversationId)(state) : true,
  );
  // A "Show Form Inputs" toggle over a style that never draws a form is a
  // dead control (cold walk 23, defect C review).
  const variableIconShown = showVariableIcon && variablesPanelStyle !== "hidden";
  // Queued-while-running message cards render above EITHER variant, so every
  // surface that mounts a composer also sees / edits / withdraws its queue
  // (/Users/armanisadeghi/code/common-docs/systems/architecture/execution-runtime/TURN-BOUNDARY-INBOX.md). Renders null when the queue is empty.
  const queueStrip =
    conversationId && !isAmbient ? (
      <InboxQueueStrip conversationId={conversationId} />
    ) : null;

  // A view-level share reads, never writes: the composer is ABSENT and the bar
  // says why (W-65). Unknown access reads as "may reply" — the server door
  // still rules, and an owner never waits on a check.
  if (conversationId && !viewerCanReply) {
    return <ViewOnlyComposerBar />;
  }

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
          showVariableIcon={variableIconShown}
          surfaceKey={surfaceKey}
          draftAlias={draftAlias}
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
        showSubmitOnEnterToggle={showSubmitOnEnterToggle && !touchOnly}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        compact={compact}
        showSendButton={showSendButton}
        showVariableIcon={variableIconShown}
        surfaceKey={surfaceKey}
          draftAlias={draftAlias}
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
