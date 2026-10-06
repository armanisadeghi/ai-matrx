"use client";

/**
 * SmartAgentInputStacked
 *
 * The Smart Agent Input's layout (styles Full · Compact · Launcher), plus the
 * variables-only Run mode.
 * Self-contained — handles its own uninitialized shell fallback when
 * conversationId is missing, so it can be used directly without going
 * through SmartAgentInput.
 *
 * Required prop: conversationId (may be null/undefined while initializing).
 */

import React, { useState } from "react";
import { ArrowUp } from "lucide-react";
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { ComposerStopButton, InputActionButtons } from "./InputActionButtons";
import { ConversationContextRail } from "./ConversationContextRail";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import { UninitializedShell } from "./UninitializedShell";
import { SmartInputFileDropTarget } from "./SmartInputFileDropTarget";
import {
  smartExecute,
  cancelExecution,
} from "../../../redux/execution-system/thunks/smart-execute.thunk";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { selectShowFreeformInput } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "../../../redux/execution-system/selectors/aggregate.selectors";
import { selectAllResourcesResolved } from "../../../redux/execution-system/instance-resources/instance-resources.selectors";
import { Button } from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import type { VariablesPanelStyle } from "../../../types/instance.types";
import type { SmartAgentInputSurfaceValueAnchors } from "./SmartAgentInput";
import type { ComposerPresentation } from "./composer/composer-types";
import { composerShows } from "./composer/composer-mode-visibility";
import { ComposerChipsRow } from "./composer/ComposerChipsRow";
import { ComposerMetaRow, ComposerPills, ComposerScopeCluster, ComposerValueGroupChip } from "./composer/ComposerMetaRow";
import { useComposerFold } from "./composer/useComposerFold";
interface SmartAgentInputStackedProps {
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
  surfaceValueAnchors?: SmartAgentInputSurfaceValueAnchors;
  /** The Smart Agent Input's presentation (style, mode, meta). Required. */
  composer: ComposerPresentation;
}

export function SmartAgentInputStacked({
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
}: SmartAgentInputStackedProps) {
  const dispatch = useAppDispatch();
  // Gate send (button + Enter) while the mic is recording or finishing a
  // transcript — submitting mid-voice drops the trailing audio and leaves the
  // recorder running.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [expandRequestKey, setExpandRequestKey] = useState(0);
  // Scope and Output fold into + when the composer itself is narrow.
  const { ref: composerRootRef, folded } = useComposerFold();
  // Hooks must run unconditionally — `conversationId` may be null on
  // first render, but the selectors short-circuit when it is and the
  // early-return below renders the uninitialized shell instead.
  const showFreeformInput = useAppSelector(
    selectShowFreeformInput(conversationId ?? ""),
  );
  const isExecuting = useAppSelector(selectIsExecuting(conversationId ?? ""));
  const allResourcesResolved = useAppSelector(
    selectAllResourcesResolved(conversationId ?? ""),
  );
  const sendBlocked = disableSend || voiceBusy || !allResourcesResolved;

  if (!conversationId) {
    return <UninitializedShell />;
  }

  const handleSubmit = () => {
    if (!sendBlocked) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  // ── Form style: the agent takes no typed message (showFreeformInput off) —
  // its variables and ONE Run button, in the same card as every other style
  // (Arman, 2026-10-04: "just a fourth style"). Shortcuts and apps that are a
  // structured form, never a chat box, land here whatever size the host asked for.
  if (!showFreeformInput) {
    const handleStop = () => dispatch(cancelExecution(conversationId));
    const formCompact = composer.size === "compact" || composer.size === "launcher";
    return (
      <div
        className={cn(
          "matrx-touch-targets mx-auto flex w-full min-w-0 shrink-0 flex-col",
          formCompact ? undefined : "max-w-[768px]",
        )}
        data-composer-size={composer.size}
        data-composer-style="form"
        data-assist-dock-avoid=""
      >
        <SmartInputFileDropTarget
          conversationId={conversationId}
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          pasteFiles={enablePasteImages}
          className={cn(
            "relative flex w-full min-h-0 flex-col gap-1.5 border border-border bg-card transition-colors focus-within:border-foreground/25",
            "[&_[data-variable-row]]:px-1.5 [&_[data-variable-heading]]:px-1.5 [&>input[type=file]]:!hidden",
            formCompact ? "rounded-[14px] p-1.5" : "rounded-[22px] p-2 shadow-[0_2px_10px_rgba(0,0,0,0.05)]",
          )}
        >
          <ConversationContextRail
            conversationId={conversationId}
            className="px-0 pb-0"
            presentation={contextRailPresentation}
            attachedItems={contextRailAttachedItems}
            surfaceValueName={surfaceValueAnchors?.context}
            withAttachments
            attachmentsSurfaceValueName={surfaceValueAnchors?.resources}
            withValueGroupChip={false}
          />
          <SmartAgentVariables
            conversationId={conversationId}
            compact={formCompact}
            onSubmit={handleSubmit}
            styleOverride={variablesPanelStyle}
            surfaceValueName={surfaceValueAnchors?.variables}
          />
          {/* ONE row under the fields: the values count (the same eye every
              style shows) and Run — while running, the same stop control. */}
          <div className="flex min-w-0 items-center justify-between gap-1.5">
            <ComposerValueGroupChip conversationId={conversationId} />
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {extraRightControls}
              {isExecuting ? (
                <ComposerStopButton onStop={handleStop} />
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={sendBlocked}
                  className="h-8 gap-1.5 rounded-full px-3"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Run
                </Button>
              )}
            </div>
          </div>
        </SmartInputFileDropTarget>
      </div>
    );
  }

  // ── The Smart Agent Input ─────────────────────────────────────────────────
  // One drop target that wraps the variables and the textarea
  // (AgentVariablesInline finds the textarea through it), one draft notice
  // (inside AgentTextarea), the context rail (it owns the agent-lists realtime
  // subscription), the resource chips and the toolbar whose + trigger owns the
  // documents bridge.
  // TWO styles (Arman, 2026-10-04). Full (splash · page): two text rows and
  // a button row in the card, the meta row under it. Compact: the card holds
  // the text and ↵ ONLY; one row under it carries + · mic · live audio ·
  // scope · values | agent · output · effort. Narrow (useComposerFold):
  // Scope and Compact's live audio ride +, Output and Effort the agent menu.
  const isCompact = composer.size === "compact";
  const menuSide = composer.size === "splash" ? "bottom" : "top";
  const cardClassName = cn(
    "relative flex w-full min-h-0 flex-col border border-border bg-card transition-colors focus-within:border-foreground/25",
    // ONE inset (Arman, 2026-10-03): the send button's distance from the
    // card edge is every edge's distance. Variable labels and text start
    // where the + glyph does (6px in).
    isCompact
      ? "[&_[data-variable-row]]:px-2 [&_[data-variable-heading]]:px-2"
      : "[&_[data-variable-row]]:px-1.5 [&_[data-variable-heading]]:px-1.5",
    // The drop target's hidden file input is not a row (it took a gap), and
    // an inline-block textarea leaves a 7px baseline strip under itself.
    "[&>input[type=file]]:!hidden [&_textarea]:block",
    isCompact
      ? "rounded-[14px] p-1.5 gap-1.5"
      : "rounded-[22px] p-2 gap-0 shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
  );
  const textarea = (
    <AgentTextarea
      draftAlias={draftAlias}
      key={`composer-${composer.size}-${expandRequestKey}`}
      conversationId={conversationId}
      compact={isCompact}
      uploadRoot={uploadRoot}
      uploadPath={uploadPath}
      surfaceKey={surfaceKey}
      disableSend={sendBlocked}
      initiallyExpanded={expandRequestKey > 0}
      showExpandToggle={!isCompact}
      placeholder={composer.placeholder}
      maxHeightPx={composer.maxInputHeightPx}
      textMenu={composer.textMenu}
      // Full: two 32px rows sit still, the third grows it (Arman, 2026-10-03).
      // Compact: ONE 24px line (+ 4px top and bottom = the 32px ↵ beside it),
      // growing from the second; 8px side padding keeps a wrapped line clear
      // of the card's rounded corner (Arman, 2026-10-04).
      minHeightPx={isCompact ? 32 : 64}
      composerType
      composerRows={!isCompact}
      flush
    />
  );
  const buttonsProps = {
    conversationId,
    uploadRoot,
    uploadPath,
    showSendButton,
    showVariableIcon,
    surfaceKey,
    disableSend: sendBlocked,
  };
  const composerParts = { size: composer.size, mode: composer.mode, folded };
  // ── Launcher: the quiet box at the foot of a page — text · mic · send ──
  // The SAME engine: one drop target around the variables and the text, the
  // context rail (it owns the page-follow rule and the realtime list), the
  // same textarea and the same send/stop. Glass, because it floats.
  if (composer.size === "launcher") {
    return (
      <div
        ref={composerRootRef}
        className="matrx-touch-targets mx-auto flex w-full min-w-0 max-w-[420px] shrink-0 flex-col"
        data-composer-size={composer.size}
        data-composer-mode={composer.mode}
        data-assist-dock-avoid=""
      >
        <SmartInputFileDropTarget
          conversationId={conversationId}
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          pasteFiles={enablePasteImages}
          className={cn(
            "relative flex w-full min-h-0 flex-col gap-1 rounded-[18px] border p-1.5",
            "border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass transition-[border-color,background-color,box-shadow]",
            "focus-within:border-primary/70 focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-glass-lg",
            "[&_[data-variable-row]]:px-2 [&_[data-variable-heading]]:px-2",
            "[&>input[type=file]]:!hidden [&_textarea]:block",
          )}
        >
          <ConversationContextRail
            conversationId={conversationId}
            presentation="overflow-only"
            attachedItems={contextRailAttachedItems}
            surfaceValueName={surfaceValueAnchors?.context}
            withValueGroupChip={false}
            className="px-0 pb-0"
          />
          <SmartAgentVariables
            conversationId={conversationId}
            compact
            onSubmit={handleSubmit}
            styleOverride={variablesPanelStyle}
            surfaceValueName={surfaceValueAnchors?.variables}
          />
          <div className="flex min-w-0 items-end gap-1.5">
            <div className="min-w-0 flex-1">
              <AgentTextarea
                draftAlias={draftAlias}
                key={`composer-launcher-${expandRequestKey}`}
                conversationId={conversationId}
                compact
                uploadRoot={uploadRoot}
                uploadPath={uploadPath}
                surfaceKey={surfaceKey}
                disableSend={sendBlocked}
                autoFocus={false}
                showExpandToggle={false}
                placeholder={composer.placeholder}
                maxHeightPx={composer.maxInputHeightPx}
                minHeightPx={32}
                composerType
                flush
              />
            </div>
            <InputActionButtons
              {...buttonsProps}
              onVoiceBusyChange={setVoiceBusy}
              composer={{ ...composerParts, part: "launcher" }}
            />
          </div>
        </SmartInputFileDropTarget>
      </div>
    );
  }
  return (
    <div
      ref={composerRootRef}
      className={cn(
        // THE 44px FLOOR for every control on a touch layout (globals.css);
        // desktop density is untouched.
        "matrx-touch-targets mx-auto flex w-full min-w-0 shrink-0 flex-col gap-1",
        isCompact ? undefined : "max-w-[768px]",
      )}
      data-composer-size={composer.size}
      data-composer-mode={composer.mode}
      data-composer-folded={folded ? "" : undefined}
      // The floating assists control never rests on any of the composer's controls.
      data-assist-dock-avoid=""
    >
      {composer.meta !== "none" && composerShows(composer.mode, "chips.row") ? (
        <ComposerChipsRow conversationId={conversationId} mode={composer.mode} menuSide={menuSide} chipShape={composer.chipShape} />
      ) : null}
      <SmartInputFileDropTarget
        conversationId={conversationId}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        pasteFiles={enablePasteImages}
        className={cardClassName}
      >
        {/* Attachments; the value-group chip rides the meta row. */}
        <ConversationContextRail
          conversationId={conversationId}
          presentation={contextRailPresentation}
          attachedItems={contextRailAttachedItems}
          surfaceValueName={surfaceValueAnchors?.context}
          withAttachments
          attachmentsSurfaceValueName={surfaceValueAnchors?.resources}
          withValueGroupChip={false}
          className="px-0 pb-1"
        />
        <SmartAgentVariables
          conversationId={conversationId}
          compact={isCompact}
          onSubmit={handleSubmit}
          styleOverride={variablesPanelStyle}
          surfaceValueName={surfaceValueAnchors?.variables}
        />
        {isCompact ? (
          <div className="flex min-w-0 items-end gap-1.5">
            <div className="min-w-0 flex-1">{textarea}</div>
            <InputActionButtons {...buttonsProps} composer={{ ...composerParts, part: "send" }} />
          </div>
        ) : (
          <>
            {textarea}
            <InputActionButtons
              {...buttonsProps}
              onVoiceBusyChange={setVoiceBusy}
              extraRightControls={extraRightControls}
              onRequestInputExpand={() => setExpandRequestKey((key) => key + 1)}
              composer={composerParts}
            />
          </>
        )}
      </SmartInputFileDropTarget>
      {isCompact ? (
        <InputActionButtons
          {...buttonsProps}
          onVoiceBusyChange={setVoiceBusy}
          extraRightControls={extraRightControls}
          onRequestInputExpand={() => setExpandRequestKey((key) => key + 1)}
          composer={{
            ...composerParts,
            part: "controls",
            leading:
              composer.meta === "none" ? undefined : (
                <ComposerScopeCluster conversationId={conversationId} composer={composer} folded={folded} />
              ),
            trailing:
              composer.meta === "none" ? undefined : (
                <ComposerPills conversationId={conversationId} composer={composer} menuSide={menuSide} folded={folded} />
              ),
          }}
        />
      ) : composer.meta === "none" ? null : (
        <ComposerMetaRow conversationId={conversationId} composer={composer} menuSide={menuSide} folded={folded} />
      )}
    </div>
  );

}
