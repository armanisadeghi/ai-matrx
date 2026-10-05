"use client";

/**
 * WizardAgentVariableInputs
 *
 * One-variable-at-a-time wizard UI for agent variable inputs.
 * Shows a counter, the variable label + help text, and the input component.
 * Maintains a fixed outer height; input area scrolls internally when needed.
 * Footer has Back, Skip, and Skip All buttons.
 *
 * Prop: conversationId only.
 */

import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronsRight, ChevronRight } from "lucide-react";
import { useAppSelector, useAppDispatch } from "../../../../store/hooks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "../../../redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectVisibleInputDefinitions } from "../../../redux/execution-system/instance-variable-values/bound-variable.selectors";
import { selectShouldShowVariables } from "../../../redux/execution-system/selectors/aggregate.selectors";
import { setUserVariableValue } from "../../../redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectShowVariablePanel,
  selectVariableInputStyle,
} from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { VariableInputComponent } from "../input-components/VariableInputComponent";
import { BoundVariableChips } from "../BoundVariableChips";
import { variableRunLabel } from "@ai-matrx/agents";
import { Button } from "@ai-matrx/design-system/controls";

interface AgentVariablesWizardProps {
  conversationId: string;
  /** Called when all variables are answered (or skipped) */
  onComplete?: () => void;
  /** Called when submit is triggered from the last variable */
  onSubmit?: () => void;
}

export function AgentVariablesWizard({
  conversationId,
  onComplete,
  onSubmit,
}: AgentVariablesWizardProps) {
  const dispatch = useAppDispatch();
  const [currentIndex, setCurrentIndex] = useState(0);

  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const variablesPanelStyle = useAppSelector(
    selectVariableInputStyle(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  // Wizard steps through plain + unresolved bound vars; resolved bound vars show as pills.
  const visibleDefs = useAppSelector(
    selectVisibleInputDefinitions(conversationId),
  );
  const userValues = useAppSelector(selectUserVariableValues(conversationId));

  const handleValueChange = useCallback(
    (name: string, value: unknown) => {
      dispatch(setUserVariableValue({ conversationId, name, value }));
    },
    [conversationId, dispatch],
  );

  const goNext = useCallback(() => {
    if (currentIndex < visibleDefs.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onSubmit?.();
      onComplete?.();
    }
  }, [currentIndex, visibleDefs.length, onSubmit, onComplete]);

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  // Clamp when a variable resolves mid-session and visibleDefs shrinks past the cursor.
  useEffect(() => {
    if (currentIndex > visibleDefs.length - 1 && visibleDefs.length > 0) {
      setCurrentIndex(visibleDefs.length - 1);
    }
  }, [visibleDefs.length, currentIndex]);

  const skipAll = useCallback(() => {
    onSubmit?.();
    onComplete?.();
  }, [onSubmit, onComplete]);

  if (
    !shouldShowVariables ||
    !showVariablePanel ||
    definitions.length === 0 ||
    variablesPanelStyle !== "wizard"
  ) {
    return null;
  }

  const variable = visibleDefs[currentIndex];

  // All variables are resolved from scope → no wizard steps, just the informative pills.
  if (!variable) {
    return <BoundVariableChips conversationId={conversationId} />;
  }

  const rawValue = userValues[variable.name] ?? variable.defaultValue ?? "";
  // VariableInputComponent now accepts `unknown` so MediaRef objects flow
  // through for media-typed variables without coercion-to-string.
  const value: unknown = rawValue;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === visibleDefs.length - 1;
  const total = visibleDefs.length;
  const current = currentIndex + 1;

  return (
    <div className="flex flex-col w-full overflow-hidden border-b border-border">
      <BoundVariableChips conversationId={conversationId} />
      <div className="flex flex-col h-72 max-h-72 w-full overflow-hidden">
      {/* Header — variable name + counter */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start px-3 pt-3 pb-0.5 shrink-0">
        <p className="text-[11px] text-muted-foreground leading-snug">
          <span className="font-semibold uppercase tracking-widest whitespace-nowrap">
            {variableRunLabel(variable)}
          </span>
          {variable.helpText && (
            <span className="font-normal">
              {": "}
              {variable.helpText}
            </span>
          )}
        </p>
        <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap pt-px">
          {current} / {total}
        </span>
      </div>

      {/* Input area — scrollable, takes remaining height */}
      <div className="flex-1 overflow-y-scroll px-2 py-2 min-h-0">
        <VariableInputComponent
          conversationId={conversationId}
          value={value}
          onChange={(v) => handleValueChange(variable.name, v)}
          variableName={variable.name}
          label={variableRunLabel(variable)}
          customComponent={variable.customComponent}
          helpText={undefined}
          compact={true}
          wizardMode={true}
          hideLabel={true}
        />
      </div>

      {/* Footer — delicate inline nav */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <Button variant="quiet" icon={<ChevronLeft />} onClick={goBack} disabled={isFirst}>Back</Button>

        <div className="flex items-center gap-3">
          {!isLast && (
            <Button variant="quiet" iconEnd={<ChevronRight />} onClick={goNext}>Next</Button>
          )}

          {isLast && (
            <Button variant="quiet" tone="primary" iconEnd={<ChevronRight />} onClick={goNext}>Done</Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
