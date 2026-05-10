"use client";

/**
 * AgentAppWidgetShell — embed-friendly compact runner.
 *
 * Designed to drop into an iframe on a third-party page. No history
 * sidebar, no top chrome, minimal padding; the underlying AgentRunner
 * still drives variables + Smart Input + MarkdownStream the same way as
 * the other shells, so users get the full agent capability inside the
 * embed. The `?embed=widget` URL switch on /p/<slug> renders this shell
 * regardless of the app's configured shell_kind (Phase 1h).
 *
 * Tier-2 slot overrides: `variableInput` + `resultRenderer`. When set,
 * the widget falls back to a hand-rolled compact form/result layout that
 * delegates the two slots to the override system (so the embed renders
 * the user's custom code, not AgentRunner's defaults).
 */

import { useEffect } from "react";
import { Loader2, Play } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { SmartAgentVariables } from "@/features/agents/components/inputs/variable-input-variations/SmartAgentVariables";
import {
  setAutoRun,
  setAllowChat,
  setShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";
import { SlotRenderer } from "./SlotRenderer";
import type { UseAgentAppReturn } from "@/features/agent-apps/hooks/useAgentApp";

interface AgentAppWidgetShellProps {
  app: PublicAgentApp;
}

export function AgentAppWidgetShell({ app }: AgentAppWidgetShellProps) {
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const overrides = (app.slot_overrides ?? {}) as Record<
    string,
    string | undefined
  >;
  const hasOverride =
    overrides.variableInput === "custom" ||
    overrides.resultRenderer === "custom";

  const ctx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? false,
  });

  useEffect(() => {
    if (!ctx.conversationId) return;
    const cid = ctx.conversationId;
    dispatch(
      setAllowChat({
        conversationId: cid,
        allowChat: config.allowChat ?? false,
      }),
    );
    if (config.autoRun != null) {
      dispatch(setAutoRun({ conversationId: cid, autoRun: config.autoRun }));
    }
    dispatch(setShowVariablePanel({ conversationId: cid, show: true }));
  }, [dispatch, ctx.conversationId, config.autoRun, config.allowChat]);

  if (!ctx.conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  // No overrides → drop straight into AgentRunner (richest default UX).
  if (!hasOverride) {
    return (
      <div className="h-full bg-background">
        <AgentRunner
          conversationId={ctx.conversationId}
          surfaceKey={ctx.surfaceKey}
          compact
          showTitle={!config.hideTitle}
        />
      </div>
    );
  }

  // Override path: render a custom-friendly compact layout that exposes
  // the two override slots inside the same surface.
  const handleSubmit = () => void ctx.submit();
  const hasResponse = ctx.response.length > 0;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-3">
        {!config.hideTitle && app.name && (
          <h1 className="text-sm font-semibold">{app.name}</h1>
        )}
        <div className="rounded-md border border-border bg-card p-3">
          <SlotRenderer
            slot="variableInput"
            overrides={app.slot_overrides}
            code={app.slot_code}
            allowedImports={app.allowed_imports}
            appName={app.name}
            fallback={WidgetDefaultVariableInput}
            props={{
              ...ctx,
              app,
              config,
              onSubmit: handleSubmit,
            } as unknown as Record<string, unknown>}
          />
          <div className="flex justify-end pt-2">
            <Button
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
              Run
            </Button>
          </div>
        </div>
        {(ctx.isStreaming || hasResponse || ctx.error) && (
          <div className="rounded-md border border-border bg-card p-3 min-h-[80px]">
            {ctx.error && (
              <div className="text-xs text-destructive mb-2">{ctx.error}</div>
            )}
            {(ctx.isStreaming || hasResponse) && (
              <SlotRenderer
                slot="resultRenderer"
                overrides={app.slot_overrides}
                code={app.slot_code}
                allowedImports={app.allowed_imports}
                appName={app.name}
                fallback={WidgetDefaultResultRenderer}
                props={{ ...ctx, app } as unknown as Record<string, unknown>}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DefaultSlotProps extends UseAgentAppReturn {
  app: PublicAgentApp;
  config?: AgentAppShellConfigCommon;
  onSubmit?: () => void;
}

function WidgetDefaultVariableInput({
  conversationId,
  config,
  onSubmit,
}: DefaultSlotProps) {
  if (!conversationId) return null;
  return (
    <SmartAgentVariables
      conversationId={conversationId}
      compact
      onSubmit={onSubmit}
      styleOverride={config?.variableInputStyle ?? "compact"}
    />
  );
}

function WidgetDefaultResultRenderer({
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
