"use client";

/**
 * SmartAgentVariables
 *
 * Renders the correct variable input UI based on the instance's variablesPanelStyle.
 * Only requires conversationId — reads style from Redux directly.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectVariableInputStyle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type { VariablesPanelStyle } from "./variable-input-options";
// FRAGMENTATION LAW (code-splitting skill rule 3): these six style variants are
// ONE small feature family, always reached beneath an existing ssr:false
// boundary (~65 of them). Six dynamics here fragmented the chunk graph for
// zero SSR/deferral benefit — static keeps the family one piece, built once.
import { AgentVariableForm as AgentVariableInputForm } from "./AgentVariableForm";
import { AgentVariablesInline as SmartAgentVariableInputs } from "../AgentVariablesInline";
import { AgentVariablesWizard as WizardAgentVariableInputs } from "./AgentVariablesWizard";
import { AgentVariablesStacked as AgentCompactVariableInputs } from "./AgentVariablesStacked";
import { AgentVariablesGuided as AgentGuidedVariableInputs } from "./AgentVariablesGuided";
import { AgentVariableCards as AgentVariableCardsInputs } from "./AgentVariableCards";

interface SmartAgentVariablesProps {
  conversationId: string;
  compact?: boolean;
  onSubmit?: () => void;
  /** Override the Redux-stored style (e.g. from parent props) */
  styleOverride?: VariablesPanelStyle;
}

export function SmartAgentVariables({
  conversationId,
  compact = false,
  onSubmit = () => {},
  styleOverride,
}: SmartAgentVariablesProps) {
  const reduxStyle = useAppSelector(selectVariableInputStyle(conversationId));
  const submitOnEnter = useAppSelector(
    (state) =>
      state.instanceUIState.byConversationId[conversationId]?.submitOnEnter ??
      true,
  );

  const style = styleOverride ?? reduxStyle;

  switch (style) {
    case "form":
      return <AgentVariableInputForm conversationId={conversationId} />;
    case "inline":
      return (
        <SmartAgentVariableInputs
          conversationId={conversationId}
          compact={compact}
          onSubmit={onSubmit}
          submitOnEnter={submitOnEnter}
        />
      );
    case "wizard":
      return (
        <WizardAgentVariableInputs
          conversationId={conversationId}
          onSubmit={onSubmit}
        />
      );
    case "compact":
      return <AgentCompactVariableInputs conversationId={conversationId} />;
    case "guided":
      return (
        <AgentGuidedVariableInputs conversationId={conversationId} seamless />
      );
    case "cards":
      return (
        <AgentVariableCardsInputs
          conversationId={conversationId}
          onSubmit={onSubmit}
        />
      );
    default:
      console.warn(`Unknown variable input style: ${style}`);
      return null;
  }
}
