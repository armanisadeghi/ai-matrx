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

import React, { useState } from "react";
import { ArrowUp, CircleStop, Loader2 } from "lucide-react";
import { SmartAgentResourceChips } from "../resources/SmartAgentResourceChips";
import { AttachedDocumentChips } from "../resources/AttachedDocumentChips";
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { InputActionButtons } from "./InputActionButtons";
import { SingleRowActionButtons } from "./SingleRowActionButtons";
import { ConversationContextRail } from "./ConversationContextRail";
import type { AttachedContextRailItem } from "./ConversationContextRail";
import { UninitializedShell } from "./UninitializedShell";
import { SmartInputFileDropTarget } from "./SmartInputFileDropTarget";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectShowFreeformInput } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectAllResourcesResolved } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";
import type { SmartAgentInputSurfaceValueAnchors } from "./SmartAgentInput";
import type { ComposerPresentation } from "./composer/composer-types";
import { composerShows } from "./composer/composer-mode-visibility";
import { ComposerChipsRow } from "./composer/ComposerChipsRow";
import { ComposerMetaRow, ComposerPills } from "./composer/ComposerMetaRow";
interface SmartAgentInputStackedProps {
  conversationId: string | null | undefined;
  presentation?: "default" | "ambient";
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
  surfaceValueAnchors?: SmartAgentInputSurfaceValueAnchors;
  /** The three-mode composer. Absent = the classic stacked composer, unchanged. */
  composer?: ComposerPresentation;
}

export function SmartAgentInputStacked({
  conversationId,
  presentation = "default",
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
}: SmartAgentInputStackedProps) {
  const dispatch = useAppDispatch();
  const isAmbient = presentation === "ambient";
  // Gate send (button + Enter) while the mic is recording or finishing a
  // transcript — submitting mid-voice drops the trailing audio and leaves the
  // recorder running.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [expandRequestKey, setExpandRequestKey] = useState(0);
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

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-9 w-9 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]"
      : "h-9 w-9 p-0 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:shadow-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

  if (!conversationId) {
    return <UninitializedShell sendBtnClass={sendBtnClass} singleRow={false} />;
  }

  const handleSubmit = () => {
    if (!sendBlocked) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  // Outer shell — matches the `/chat/new` landing pill so the two surfaces
  // feel like one continuous component as the conversation grows. The
  // `transition-[padding,border-color]` lets focus/expansion changes flow
  // smoothly; the textarea inside owns its own height transition.
  const shellClassName = cn(
    // A composer is content-sized chrome. `shrink-0` is a layout backstop for
    // constrained flex hosts (windows, battle columns, split panes): spare
    // column height always belongs to the transcript, never the input shell.
    "w-full shrink-0 border",
    "flex flex-col min-h-0 overflow-hidden",
    isAmbient
      ? "min-h-[72px] rounded-[20px] border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass transition-[border-color,background-color,box-shadow] focus-within:border-primary/70 focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-glass-lg"
      : "rounded-[20px] border-border bg-card shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] transition-colors focus-within:border-foreground/25 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
    // Centered within its cap. `compact` is density, not width: a compact
    // host wider than 500px (a resized agent window) used to get a 500px
    // composer pinned to its left edge while the transcript used the full
    // width. The host decides the width; below the cap this changes nothing.
    "mx-auto",
    isAmbient ? "max-w-[420px]" : "max-w-[800px]",
  );

  if (isAmbient) {
    return (
      <SmartInputFileDropTarget
        conversationId={conversationId}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        className={cn(shellClassName, "gap-0.5 px-2.5 py-1.5")}
        data-ambient-input="multiline"
      >
        <AgentTextarea
          conversationId={conversationId}
          compact
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          enablePasteImages={enablePasteImages}
          surfaceKey={surfaceKey}
          disableSend={sendBlocked}
          autoFocus={false}
          showExpandToggle={false}
        />
        <div className="flex min-h-6 items-center justify-end">
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
            minimal
          />
        </div>
      </SmartInputFileDropTarget>
    );
  }

  // Variables-only mode: hide chips + textarea + full toolbar. Render the
  // variables panel and a single Run button. Apps that want a structured
  // form experience (no chat box) configure showFreeformInput = false.
  if (!showFreeformInput) {
    const handleStop = () => dispatch(cancelExecution(conversationId));
    return (
      <div className={shellClassName}>
        <ConversationContextRail
          conversationId={conversationId}
          className="px-3 pt-2"
          presentation={contextRailPresentation}
          attachedItems={contextRailAttachedItems}
          surfaceValueName={surfaceValueAnchors?.context}
        />
        <SmartAgentVariables
          conversationId={conversationId}
          compact={compact}
          onSubmit={handleSubmit}
          styleOverride={variablesPanelStyle}
          surfaceValueName={surfaceValueAnchors?.variables}
        />
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
          {extraRightControls}
          <Button
            size="sm"
            onClick={isExecuting ? handleStop : handleSubmit}
            disabled={sendBlocked && !isExecuting}
            className={cn(
              "gap-1.5 rounded-full",
              "shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]",
              "disabled:shadow-none",
            )}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Stop
              </>
            ) : (
              <>
                <ArrowUp className="w-3.5 h-3.5" />
                Run
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── The three-mode composer (composer/composer-types.ts) ──────────────────
  // The SAME engine pieces as the classic layout below — one drop target that
  // wraps the variables and the textarea (AgentVariablesInline finds the
  // textarea through it), one draft notice (inside AgentTextarea), the context
  // rail (it owns the agent-lists realtime subscription), the resource chips
  // and the toolbar whose + trigger owns the documents bridge — arranged as the
  // design draws them.
  if (composer) {
    const compact = composer.size === "compact";
    const menuSide = composer.size === "splash" ? "bottom" : "top";
    const cardClassName = cn(
      "relative flex w-full min-h-0 flex-col border border-border bg-card transition-colors focus-within:border-foreground/25",
      compact
        ? "rounded-[14px] px-1.5 py-1 gap-1"
        : "rounded-[22px] px-2.5 pt-3 pb-2 gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
    );
    const textarea = (
      <AgentTextarea
        key={`composer-${composer.size}-${expandRequestKey}`}
        conversationId={conversationId}
        compact={compact}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        surfaceKey={surfaceKey}
        disableSend={sendBlocked}
        initiallyExpanded={expandRequestKey > 0}
        showExpandToggle={!compact}
        placeholder={composer.placeholder}
        maxHeightPx={composer.maxInputHeightPx}
        textMenu={composer.textMenu}
      />
    );
    const toolbar = (
      <InputActionButtons
        conversationId={conversationId}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        showSendButton={showSendButton}
        showSubmitOnEnterToggle={false}
        showVariableIcon={showVariableIcon}
        sendButtonVariant="blue"
        surfaceKey={surfaceKey}
        disableSend={sendBlocked}
        onVoiceBusyChange={setVoiceBusy}
        extraRightControls={extraRightControls}
        onRequestInputExpand={() => setExpandRequestKey((key) => key + 1)}
        composer={{
          size: composer.size,
          mode: composer.mode,
          trailing: compact ? (
            <ComposerPills conversationId={conversationId} composer={composer} menuSide={menuSide} />
          ) : undefined,
        }}
      />
    );
    return (
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 shrink-0 flex-col",
          compact ? "gap-1.5" : "max-w-[760px] gap-2",
        )}
        data-composer-size={composer.size}
        data-composer-mode={composer.mode}
      >
        {composerShows(composer.mode, "chips.row") ? (
          <ComposerChipsRow conversationId={conversationId} menuSide={menuSide} />
        ) : null}
        <SmartInputFileDropTarget
          conversationId={conversationId}
          uploadRoot={uploadRoot}
          uploadPath={uploadPath}
          className={cardClassName}
        >
          <ConversationContextRail
            conversationId={conversationId}
            presentation={contextRailPresentation}
            attachedItems={contextRailAttachedItems}
            surfaceValueName={surfaceValueAnchors?.context}
          />
          <SmartAgentVariables
            conversationId={conversationId}
            compact={compact}
            onSubmit={handleSubmit}
            styleOverride={variablesPanelStyle}
            surfaceValueName={surfaceValueAnchors?.variables}
          />
          <SmartAgentResourceChips
            conversationId={conversationId}
            surfaceValueName={surfaceValueAnchors?.resources}
          />
          <AttachedDocumentChips conversationId={conversationId} />
          {textarea}
          {compact ? null : toolbar}
        </SmartInputFileDropTarget>
        {compact ? (
          toolbar
        ) : (
          <ComposerMetaRow conversationId={conversationId} composer={composer} menuSide={menuSide} />
        )}
      </div>
    );
  }

  return (
    <SmartInputFileDropTarget
      conversationId={conversationId}
      uploadRoot={uploadRoot}
      uploadPath={uploadPath}
      className={cn(shellClassName, "px-2 pt-1.5 pb-1 gap-1")}
    >
      {/* Conversation context rail — surfaces the working document, scratchpad,
          agent lists, and active context so they're openable without scrolling
          the transcript. Renders nothing when there's nothing to show. */}
      <ConversationContextRail
        conversationId={conversationId}
        presentation={contextRailPresentation}
        attachedItems={contextRailAttachedItems}
        surfaceValueName={surfaceValueAnchors?.context}
      />

      {/* Variable inputs — scrolls internally, never pushes textarea/toolbar off screen */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact={compact}
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
        surfaceValueName={surfaceValueAnchors?.variables}
      />

      {/* Resource chips — pinned, never scrolls away */}
      <SmartAgentResourceChips
        conversationId={conversationId}
        surfaceValueName={surfaceValueAnchors?.resources}
      />
      {/* Durable document attachments (association edges) — persist across turns/reloads */}
      <AttachedDocumentChips conversationId={conversationId} />

      {/* Textarea — owns its own height transition for smooth flow */}
      <AgentTextarea
        key={`composer-${expandRequestKey}`}
        conversationId={conversationId}
        compact={compact}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        enablePasteImages={enablePasteImages}
        surfaceKey={surfaceKey}
        disableSend={sendBlocked}
        initiallyExpanded={expandRequestKey > 0}
      />

      {/* Toolbar — always pinned at the bottom */}
      <InputActionButtons
        conversationId={conversationId}
        uploadRoot={uploadRoot}
        uploadPath={uploadPath}
        showSendButton={showSendButton}
        showSubmitOnEnterToggle={showSubmitOnEnterToggle}
        showVariableIcon={showVariableIcon}
        sendButtonVariant={sendButtonVariant}
        surfaceKey={surfaceKey}
        disableSend={sendBlocked}
        onVoiceBusyChange={setVoiceBusy}
        extraRightControls={extraRightControls}
        onRequestInputExpand={() => setExpandRequestKey((key) => key + 1)}
      />
    </SmartInputFileDropTarget>
  );
}
