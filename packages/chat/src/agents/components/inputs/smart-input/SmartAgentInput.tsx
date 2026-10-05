"use client";

/**
 * SmartAgentInput — the Smart Agent Input.
 *
 * Styles (composer.size): Full (splash · page), Compact, Launcher. Modes:
 * Chat · Work · Advanced. Self-contained, including its uninitialized-shell
 * fallback. Required props: conversationId, composer.
 */

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { setVariablesPanelStyle } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { SmartAgentInputStacked } from "./SmartAgentInputStacked";
import { InboxQueueStrip } from "./InboxQueueStrip";
import type { VariablesPanelStyle } from "../../../types/instance.types";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import type { ComposerPresentation } from "./composer/composer-types";
import { selectViewerCanReply } from "../../../redux/execution-system/conversations/conversations.selectors";
import { ViewOnlyComposerBar } from "./ViewOnlyComposerBar";
import { selectHasUserInput } from "../../../redux/execution-system/instance-user-input/instance-user-input.selectors";

export interface SmartAgentInputSurfaceValueAnchors {
  variables?: string;
  resources?: string;
  context?: string;
}

interface SmartAgentInputProps {
  conversationId: string | null | undefined;
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
   * The Smart Agent Input's presentation: style (Full · Compact · Launcher)
   * and mode (Chat · Work · Advanced). Required.
   */
  composer: ComposerPresentation;
}

export function SmartAgentInput({
  conversationId,
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
  // The page launcher (composer size `launcher`): the quiet box at a page's foot.
  const isLauncher = composer.size === "launcher";
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
  // THE PAGE ASSISTANT ANSWERS WHAT THE PERSON SAYS. Its dock rises under a
  // cursor resting at the bottom of the page, and its live Send arrow on an
  // empty box sent an empty first turn (2026-10-03, conversation d6c14d03:
  // an empty user row + "messages: at least one message is required").
  // The launcher's Send is live only when the box holds something.
  const ambientHasNothingToSend = useAppSelector((state) =>
    isLauncher && conversationId
      ? !selectHasUserInput(conversationId)(state)
      : false,
  );
  const sendDisabled = disableSend || ambientHasNothingToSend;
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
    conversationId && !isLauncher ? (
      <InboxQueueStrip conversationId={conversationId} />
    ) : null;

  // A view-level share reads, never writes: the composer is ABSENT and the bar
  // says why (W-65). Unknown access reads as "may reply" — the server door
  // still rules, and an owner never waits on a check.
  if (conversationId && !viewerCanReply) {
    return <ViewOnlyComposerBar />;
  }

  return (
    <>
      {queueStrip}
      <SmartAgentInputStacked
        conversationId={conversationId}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        compact={compact}
        showSendButton={showSendButton}
        showVariableIcon={variableIconShown}
        surfaceKey={surfaceKey}
        draftAlias={draftAlias}
        disableSend={sendDisabled}
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
