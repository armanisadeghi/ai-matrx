"use client";

/**
 * AgentContextInjectionSwitch — "Allow automated context injection".
 *
 * THE CONTEXT KILL SWITCH, and the exact mirror of the tools switch in
 * `AgentToolsManager` (same primitive, same placement, same copy style).
 *
 * Context is the third input channel into an agent (declared input, user text,
 * context). It arrives from two places, neither of which the calling code
 * names: Item Values for the selected Scope (ABC Co's brand voice) and ambient
 * values the running Surface holds (`current_page_content`, `selection`,
 * `open_tabs`). That is the point — it changes how the agent behaves without
 * anyone prompting it. It is also the one input whose absence or excess never
 * raises, which is why it needs a visible, declared setting rather than an
 * unexamined default.
 *
 * The three states, and what the Expert sees for each:
 *
 *   | Declared        | Switch | Behaviour                                    |
 *   |-----------------|--------|----------------------------------------------|
 *   | nothing         | on     | all context flows, delivered normally        |
 *   | context policies| on     | those govern their keys; extras still flow   |
 *   | anything        | OFF    | ONLY declared policies deliver               |
 *
 * The fourth combination — nothing declared AND the switch off — means no
 * context reaches the agent at all. That is legal and occasionally wanted, but
 * it is a dead end far more often than it is intentional, so it is called out
 * in the warning tone rather than described in the same neutral voice as the
 * others.
 *
 * Persisted in `agent.definition.auto_context_disabled` (see
 * `setAgentAutoContextDisabled`). Cross-repo system of record:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md § Context.
 */

import { Layers } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentAutoContextDisabled,
  selectAgentContextPolicies,
} from "@/features/agents/redux/agent-definition/selectors";
import { setAgentAutoContextDisabled } from "@/features/agents/redux/agent-definition/thunks";
import { AutoInjectionSwitch } from "@/features/agents/components/shared/AutoInjectionSwitch";

interface AgentContextInjectionSwitchProps {
  agentId: string;
  className?: string;
}

export function AgentContextInjectionSwitch({
  agentId,
  className,
}: AgentContextInjectionSwitchProps) {
  const dispatch = useAppDispatch();
  const disabled = useAppSelector((state) =>
    selectAgentAutoContextDisabled(state, agentId),
  );
  const policies = useAppSelector((state) =>
    selectAgentContextPolicies(state, agentId),
  );
  const count = policies?.length ?? 0;
  const plural = count === 1 ? "policy" : "policies";

  // Nothing declared AND injection off — the agent gets no context at all.
  const starved = disabled && count === 0;

  const statusText = starved
    ? "Off, and nothing is declared — no context reaches this agent at all. Add a context policy below, or turn this back on."
    : disabled
      ? `Off — only the ${count} context ${plural} below reach this agent. Nothing from the selected scope or the page is added.`
      : count === 0
        ? "On — everything the scope and the page provide reaches this agent, delivered normally."
        : `On — the ${count} context ${plural} below control how their own values arrive; anything else the scope or the page provides still reaches this agent.`;

  return (
    <AutoInjectionSwitch
      id={`allow-auto-context-${agentId}`}
      label="Allow automated context injection"
      statusText={statusText}
      icon={<Layers className="w-3.5 h-3.5" />}
      disabled={disabled}
      warn={starved}
      onChange={(next) =>
        dispatch(setAgentAutoContextDisabled({ agentId, disabled: next }))
      }
      className={className}
    />
  );
}
