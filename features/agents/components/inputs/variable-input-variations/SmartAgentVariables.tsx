"use client";

/**
 * SmartAgentVariables
 *
 * Renders the correct variable input UI based on the instance's variablesPanelStyle.
 * Only requires conversationId — reads style from Redux directly.
 */

import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectVariableInputStyle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type { VariablesPanelStyle } from "./variable-input-options";

const AgentVariableInputForm = dynamic(() =>
  import("./AgentVariableForm").then((m) => m.AgentVariableForm),
);

const SmartAgentVariableInputs = dynamic(() =>
  import("../AgentVariablesInline").then((m) => m.AgentVariablesInline),
);

const WizardAgentVariableInputs = dynamic(() =>
  import("./AgentVariablesWizard").then((m) => m.AgentVariablesWizard),
);

const AgentCompactVariableInputs = dynamic(() =>
  import("./AgentVariablesStacked").then((m) => m.AgentVariablesStacked),
);

const AgentGuidedVariableInputs = dynamic(() =>
  import("./AgentVariablesGuided").then((m) => m.AgentVariablesGuided),
);

const AgentVariableCardsInputs = dynamic(() =>
  import("./AgentVariableCards").then((m) => m.AgentVariableCards),
);

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
