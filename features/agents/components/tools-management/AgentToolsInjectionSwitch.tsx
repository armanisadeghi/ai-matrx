"use client";

/**
 * AgentToolsInjectionSwitch — "Allow automated tool injection".
 *
 * THE TOOLS KILL SWITCH, the mirror of AgentContextInjectionSwitch: the same
 * AutoInjectionSwitch primitive, rendered compact on the builder's Tools row
 * and full-width inside the Agent Tools picker. One component, so the two
 * copies read and behave identically.
 *
 * A model that cannot use tools turns the switch off by itself when it is
 * picked (sagas/modelToolDefault.saga.ts); turning it back on there is the
 * person's override and the status says the server will drop the tools.
 * Persisted in `agent.definition.tool_config.auto_tools_disabled`
 * (auto-tools.thunks.ts). Rules: common-docs systems/agents/agent-tools/TOOL-SOURCES.md.
 */

import { Zap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentAutoToolsDisabled } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { AutoInjectionSwitch } from "@ai-matrx/chat/agents/components/shared/AutoInjectionSwitch";
import { useNormalizedControls } from "@ai-matrx/chat/agents/identity/settings-store";
import { supportsTools } from "@ai-matrx/chat/agents/hooks/useModelControls";
import { useAgentSettingsClassControls } from "@/features/ai-models/hooks/useModelClassControls";
import { setAgentAutoToolsDisabled } from "@/features/agents/redux/auto-tools.thunks";

interface AgentToolsInjectionSwitchProps {
  agentId: string;
  compact?: boolean;
  className?: string;
}

export function AgentToolsInjectionSwitch({
  agentId,
  compact = false,
  className,
}: AgentToolsInjectionSwitchProps) {
  const dispatch = useAppDispatch();
  const disabled = useAppSelector((state) =>
    selectAgentAutoToolsDisabled(state, agentId),
  );
  useAgentSettingsClassControls(agentId);
  const modelSupportsTools = supportsTools(useNormalizedControls(agentId));

  const statusText = !modelSupportsTools
    ? disabled
      ? "Off — this model can't use tools, so none are added."
      : "On by your choice — this model can't use tools, so they're dropped at run."
    : disabled
      ? "Off — this agent only ever gets the tools selected here. No surface or automatic tools are added."
      : "On — the active surface may add its default tools on top of your selection.";

  return (
    <AutoInjectionSwitch
      id={`allow-auto-tools-${agentId}${compact ? "-row" : ""}`}
      label="Allow automated tool injection"
      statusText={statusText}
      icon={<Zap className="w-3.5 h-3.5" />}
      disabled={disabled}
      warn={!modelSupportsTools && !disabled}
      compact={compact}
      onChange={(next) =>
        dispatch(setAgentAutoToolsDisabled({ agentId, disabled: next }))
      }
      className={className}
    />
  );
}
