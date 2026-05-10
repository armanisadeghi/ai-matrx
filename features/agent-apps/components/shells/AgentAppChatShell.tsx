"use client";

/**
 * AgentAppChatShell — Tier-0/1 default shell.
 *
 * Mounts the universal AgentRunner with history sidebar, Smart Input
 * (variables + resources + textarea), and the message-display column —
 * exactly the same composition `/agents/[id]/run` uses. With zero config
 * an app on this shell is functionally identical to the agent runner.
 *
 * Tier-1 settings (shell_config) flow into the per-instance UI state so
 * AgentRunner's existing selectors honour them automatically. Only the
 * keys that have a real Redux setter today are wired here; the rest
 * (e.g. variableInputStyle, title) are revisited as those setters land.
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

interface AgentAppChatShellProps {
  app: PublicAgentApp;
}

export function AgentAppChatShell({ app }: AgentAppChatShellProps) {
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;

  const agentAppCtx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? true,
  });

  // Push shell_config settings into the per-instance UI state so
  // AgentRunner's selectors see them.
  useEffect(() => {
    if (!agentAppCtx.conversationId) return;
    const cid = agentAppCtx.conversationId;
    if (config.autoRun != null) {
      dispatch(setAutoRun({ conversationId: cid, autoRun: config.autoRun }));
    }
    if (config.allowChat != null) {
      dispatch(
        setAllowChat({ conversationId: cid, allowChat: config.allowChat }),
      );
    }
    // Apps almost always want the variables panel visible up-front.
    dispatch(setShowVariablePanel({ conversationId: cid, show: true }));
  }, [
    dispatch,
    agentAppCtx.conversationId,
    config.autoRun,
    config.allowChat,
  ]);

  if (!agentAppCtx.conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <AgentRunner
      conversationId={agentAppCtx.conversationId}
      surfaceKey={agentAppCtx.surfaceKey}
      compact={config.compact}
      showTitle={!config.hideTitle}
    />
  );
}
