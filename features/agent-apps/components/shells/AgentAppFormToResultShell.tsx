"use client";

/**
 * AgentAppFormToResultShell — Tier-0/1 "classic prompt-app" shell.
 *
 * Variables at top; on submit the response renders below via MarkdownStream
 * (which inherits all 37+ render-block types — quizzes, flashcards,
 * timelines, diagrams, artifacts, tool calls, etc.). When `allowChat` is
 * true, a follow-up text input appears beneath the response so the user
 * can continue the conversation without rebuilding the form.
 */

import { useEffect } from "react";
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
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";

interface AgentAppFormToResultShellProps {
  app: PublicAgentApp;
}

export function AgentAppFormToResultShell({
  app,
}: AgentAppFormToResultShellProps) {
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const allowChat = config.allowChat ?? false;

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
  }, [dispatch, ctx.conversationId, allowChat, config.autoRun]);

  const handleSubmit = () => {
    void ctx.submit();
  };

  const handleReset = () => {
    ctx.resetConversation();
  };

  if (!ctx.conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const hasResponse = ctx.response.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Variables */}
        <div className="rounded-lg border border-border bg-card p-4">
          <SmartAgentVariables
            conversationId={ctx.conversationId}
            compact={config.compact}
            onSubmit={handleSubmit}
            styleOverride={config.variableInputStyle}
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

        {/* Response */}
        {(ctx.isStreaming || hasResponse || ctx.error) && (
          <div className="rounded-lg border border-border bg-card p-4 min-h-[120px]">
            {ctx.error && (
              <div className="text-sm text-destructive mb-2">{ctx.error}</div>
            )}
            {(ctx.isStreaming || hasResponse) && (
              <MarkdownStream
                content={ctx.response}
                isStreamActive={ctx.isStreaming}
                requestId={ctx.requestId ?? undefined}
                conversationId={ctx.conversationId ?? undefined}
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
              placeholder="Ask a follow-up…"
              surfaceKey={ctx.surfaceKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
