"use client";

/**
 * AgentCompactVariableInputs
 *
 * Stacked full VariableInputComponent rows (no collapsed single-line + popover).
 */

import { formatText } from "@/utils/text/text-case-converter";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectShowVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { useCallback } from "react";

interface AgentVariablesStackedProps {
  conversationId: string;
}

export function AgentVariablesStacked({
  conversationId,
}: AgentVariablesStackedProps) {
  const dispatch = useAppDispatch();
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const variableDefaults = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const variableValues = useAppSelector(
    selectUserVariableValues(conversationId),
  );

  const handleVariableValueChange = useCallback(
    (variableName: string, value: unknown) => {
      dispatch(
        setUserVariableValue({ conversationId, name: variableName, value }),
      );
    },
    [conversationId, dispatch],
  );

  if (
    !shouldShowVariables ||
    !showVariablePanel ||
    variableDefaults.length === 0
  ) {
    return null;
  }

  return (
    <div className="max-h-72 overflow-y-auto bg-transparent border-b border-border">
      {variableDefaults.map((variable, index) => {
        const value =
          variableValues[variable.name] ?? variable.defaultValue ?? "";
        const isLast = index === variableDefaults.length - 1;
        const isFirst = index === 0;

        return (
          <div
            key={variable.name}
            className={!isLast ? "py-1  border-b-2 border-border" : ""}
          >
            <div
              className={`px-3 bg-transparent ${isFirst ? "pt-2.5" : "pt-2"} ${!isLast ? "pb-2" : "pb-2.5"}`}
            >
              <VariableInputComponent
                value={value}
                onChange={(newValue) =>
                  handleVariableValueChange(variable.name, newValue)
                }
                variableName={formatText(variable.name)}
                customComponent={variable.customComponent}
                helpText={variable.helpText}
                compact
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
