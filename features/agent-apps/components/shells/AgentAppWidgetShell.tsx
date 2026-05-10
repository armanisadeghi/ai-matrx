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
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import {
  setAutoRun,
  setAllowChat,
  setShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";

interface AgentAppWidgetShellProps {
  app: PublicAgentApp;
}

export function AgentAppWidgetShell({ app }: AgentAppWidgetShellProps) {
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;

  const ctx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    // Default to single-shot in widget mode — most embeds are not chats.
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
