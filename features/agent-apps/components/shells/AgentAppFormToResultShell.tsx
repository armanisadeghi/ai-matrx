"use client";

/**
 * AgentAppFormToResultShell — Tier-0/1 "classic prompt-app" shell.
 *
 * Variables at top; on submit the response renders below via MarkdownStream
 * (which inherits all 37+ render-block types — quizzes, flashcards,
 * timelines, diagrams, artifacts, tool calls, etc.). When `allowChat` is
 * true, a follow-up text input appears beneath the response so the user
 * can continue the conversation without rebuilding the form.
 *
 * Tier-2 slot overrides: `variableInput`, `resultRenderer`,
 * `preExecutionGate`, `header`. When the app row sets
 * `slot_overrides[slot] = 'custom'`, the matching `slot_code[slot]` is
 * compiled in the Babel sandbox and rendered with the same hook output
 * the default would have received.
 */

import { useEffect, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { SmartAgentVariables } from "@/features/agents/components/inputs/variable-input-variations/SmartAgentVariables";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import {
  setAutoRun,
  setAllowChat,
  setShowVariablePanel,
  setInputPlaceholder,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";
import { SlotRenderer } from "./SlotRenderer";
import type { UseAgentAppReturn } from "@/features/agent-apps/hooks/useAgentApp";

interface AgentAppFormToResultShellProps {
  app: PublicAgentApp;
}

export function AgentAppFormToResultShell({
  app,
}: AgentAppFormToResultShellProps) {
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const allowChat = config.allowChat ?? false;
  const [gateDismissed, setGateDismissed] = useState(false);

  const ctx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat,
  });

  useEffect(() => {
    if (!ctx.conversationId) return;
    const cid = ctx.conversationId;
    dispatch(setAllowChat({ conversationId: cid, allowChat }));
    if (config.autoRun != null) {
      dispatch(setAutoRun({ conversationId: cid, autoRun: config.autoRun }));
    }
    dispatch(setShowVariablePanel({ conversationId: cid, show: true }));
    // Follow-up input placeholder lives in Redux (no more prop chain).
    dispatch(
      setInputPlaceholder({ conversationId: cid, value: "Ask a follow-up…" }),
    );
  }, [dispatch, ctx.conversationId, allowChat, config.autoRun]);

  const handleSubmit = () => {
    void ctx.submit();
  };

  const handleReset = () => {
    ctx.resetConversation();
    setGateDismissed(false);
  };

  if (!ctx.conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const hasResponse = ctx.response.length > 0;
  const overrides = app.slot_overrides;
  const slotCode = app.slot_code;
  const allowedImports = app.allowed_imports;

  // Pre-execution gate (Tier-2). Renders only when overridden AND the user
  // hasn't dismissed it yet; ungated apps skip straight to the form.
  const gateOverridden =
    (overrides as Record<string, string | undefined> | null)?.[
      "preExecutionGate"
    ] === "custom";
  if (gateOverridden && !gateDismissed) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <SlotRenderer
            slot="preExecutionGate"
            overrides={overrides}
            code={slotCode}
            allowedImports={allowedImports}
            appName={app.name}
            fallback={DefaultPreGate}
            props={{
              ...ctx,
              app,
              onContinue: () => setGateDismissed(true),
            } as unknown as Record<string, unknown>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[800px] mx-auto px-4 py-6 space-y-6">
        {/* Header (Tier-2 override slot) */}
        <SlotRenderer
          slot="header"
          overrides={overrides}
          code={slotCode}
          allowedImports={allowedImports}
          appName={app.name}
          fallback={DefaultHeader}
          props={{ ...ctx, app } as unknown as Record<string, unknown>}
        />

        {/* Variables (Tier-2 override slot) */}
        <div className="rounded-lg border border-border bg-card p-4">
          <SlotRenderer
            slot="variableInput"
            overrides={overrides}
            code={slotCode}
            allowedImports={allowedImports}
            appName={app.name}
            fallback={DefaultVariableInput}
            props={{
              ...ctx,
              app,
              config,
              onSubmit: handleSubmit,
            } as unknown as Record<string, unknown>}
          />
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60 mt-4">
            {hasResponse && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={ctx.isExecuting}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={ctx.isExecuting}
              className="gap-1.5"
            >
              {ctx.isExecuting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {hasResponse ? "Run again" : (app.name ?? "Run")}
            </Button>
          </div>
        </div>

        {/* Response (Tier-2 override slot) */}
        {(ctx.isStreaming || hasResponse || ctx.error) && (
          <div className="rounded-lg border border-border bg-card p-4 min-h-[120px]">
            {ctx.error && (
              <div className="text-sm text-destructive mb-2">{ctx.error}</div>
            )}
            {(ctx.isStreaming || hasResponse) && (
              <SlotRenderer
                slot="resultRenderer"
                overrides={overrides}
                code={slotCode}
                allowedImports={allowedImports}
                appName={app.name}
                fallback={DefaultResultRenderer}
                props={{ ...ctx, app } as unknown as Record<string, unknown>}
              />
            )}
          </div>
        )}

        {/* Follow-up input */}
        {allowChat && (hasResponse || ctx.isStreaming) && (
          <div className="rounded-lg border border-border bg-card">
            <SmartAgentInput
              conversationId={ctx.conversationId}
              compact
              singleRowTextarea
              surfaceKey={ctx.surfaceKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Default slot implementations ─────────────────────────────────────────
//
// These are what render when an app does NOT have a custom slot override.
// Custom code receives the same props (the hook + a few extras the slot
// needs), so a Tier-2 override is a drop-in replacement.

interface DefaultSlotProps extends UseAgentAppReturn {
  app: PublicAgentApp;
  config?: AgentAppShellConfigCommon;
  onSubmit?: () => void;
  onContinue?: () => void;
}

function DefaultHeader({ app }: DefaultSlotProps) {
  if (!app.name && !app.tagline) return null;
  return (
    <div>
      {app.name && <h1 className="text-lg font-semibold">{app.name}</h1>}
      {app.tagline && (
        <p className="text-sm text-muted-foreground">{app.tagline}</p>
      )}
    </div>
  );
}

function DefaultVariableInput({
  conversationId,
  config,
  onSubmit,
}: DefaultSlotProps) {
  if (!conversationId) return null;
  return (
    <SmartAgentVariables
      conversationId={conversationId}
      compact={config?.compact}
      onSubmit={onSubmit}
      styleOverride={config?.variableInputStyle}
    />
  );
}

function DefaultResultRenderer({
  response,
  isStreaming,
  requestId,
  conversationId,
}: DefaultSlotProps) {
  return (
    <MarkdownStream
      content={response}
      isStreamActive={isStreaming}
      requestId={requestId ?? undefined}
      conversationId={conversationId ?? undefined}
    />
  );
}

function DefaultPreGate({ onContinue, app }: DefaultSlotProps) {
  return (
    <div className="max-w-md mx-auto p-6 rounded-lg border border-border bg-card">
      <h2 className="text-lg font-semibold mb-2">{app.name ?? "Welcome"}</h2>
      <Button onClick={onContinue} size="sm">
        Continue
      </Button>
    </div>
  );
}
