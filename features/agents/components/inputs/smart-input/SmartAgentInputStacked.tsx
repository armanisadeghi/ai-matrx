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
import { ArrowUp, CircleStop, Loader2 } from "lucide-react";
import { SmartAgentResourceChips } from "../resources/SmartAgentResourceChips";
import { SmartAgentVariables } from "../variable-input-variations/SmartAgentVariables";
import { AgentTextarea } from "./AgentTextarea";
import { InputActionButtons } from "./InputActionButtons";
import { UninitializedShell } from "./UninitializedShell";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectShowFreeformInput } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  // Hooks must run unconditionally — `conversationId` may be null on
  // first render, but the selectors short-circuit when it is and the
  // early-return below renders the uninitialized shell instead.
  const showFreeformInput = useAppSelector(
    selectShowFreeformInput(conversationId ?? ""),
  );
  const isExecuting = useAppSelector(selectIsExecuting(conversationId ?? ""));

  const sendBtnClass =
    sendButtonVariant === "blue"
      ? "h-9 w-9 p-0 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]"
      : "h-9 w-9 p-0 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:shadow-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

  if (!conversationId) {
    return <UninitializedShell sendBtnClass={sendBtnClass} singleRow={false} />;
  }

  const handleSubmit = () => {
    if (!disableSend) dispatch(smartExecute({ conversationId, surfaceKey }));
  };

  // Outer shell — matches the `/chat/new` landing pill so the two surfaces
  // feel like one continuous component as the conversation grows. The
  // `transition-[padding,border-color]` lets focus/expansion changes flow
  // smoothly; the textarea inside owns its own height transition.
  const shellClassName = cn(
    "w-full rounded-[28px] border border-border bg-card",
    "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
    "flex flex-col min-h-0 overflow-hidden",
    "transition-colors focus-within:border-foreground/25",
    compact ? "max-w-[500px]" : "max-w-[800px]",
  );

  // Variables-only mode: hide chips + textarea + full toolbar. Render the
  // variables panel and a single Run button. Apps that want a structured
  // form experience (no chat box) configure showFreeformInput = false.
  if (!showFreeformInput) {
    const handleStop = () => dispatch(cancelExecution(conversationId));
    return (
      <div className={shellClassName}>
        <SmartAgentVariables
          conversationId={conversationId}
          compact={compact}
          onSubmit={handleSubmit}
          styleOverride={variablesPanelStyle}
        />
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
          {extraRightControls}
          <Button
            size="sm"
            onClick={isExecuting ? handleStop : handleSubmit}
            disabled={disableSend && !isExecuting}
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

  return (
    <div className={cn(shellClassName, "px-2.5 pt-2 pb-1.5 gap-1")}>
      {/* Variable inputs — scrolls internally, never pushes textarea/toolbar off screen */}
      <SmartAgentVariables
        conversationId={conversationId}
        compact={compact}
        onSubmit={handleSubmit}
        styleOverride={variablesPanelStyle}
      />

      {/* Resource chips — pinned, never scrolls away */}
      <SmartAgentResourceChips conversationId={conversationId} />

      {/* Textarea — owns its own height transition for smooth flow */}
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
