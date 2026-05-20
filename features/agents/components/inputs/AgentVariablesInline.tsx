"use client";

/**
 * SmartAgentVariableInputs
 *
 * Renders inline variable input rows above the textarea.
 * Reads definitions and values from instanceVariableValues.
 * Manages expanded-variable popovers via instanceUIState.
 *
 * Only renders when showVariablePanel is true AND definitions exist.
 * Prop: conversationId only.
 */

import { useCallback } from "react";
import { ChevronRight, ChevronUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectExpandedVariableId,
  selectShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setExpandedVariableId } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { VariableInputComponent } from "./input-components/VariableInputComponent";
import { formatText } from "@/utils/text/text-case-converter";

interface AgentVariablesInlineProps {
  conversationId: string;
  /** Pass through to VariableInputComponent for compact display */
  compact?: boolean;
  /** Called when Enter is pressed on the last variable, or always on Enter if submitOnEnter */
  onSubmit?: () => void;
  submitOnEnter?: boolean;
}

export function AgentVariablesInline({
  conversationId,
  compact = false,
  onSubmit,
  submitOnEnter = true,
}: AgentVariablesInlineProps) {
  const dispatch = useAppDispatch();

  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const userValues = useAppSelector(selectUserVariableValues(conversationId));
  const expandedVariableId = useAppSelector(
    selectExpandedVariableId(conversationId),
  );

  const handleValueChange = useCallback(
    (name: string, value: unknown) => {
      dispatch(setUserVariableValue({ conversationId, name, value }));
    },
    [conversationId, dispatch],
  );

  const handleExpand = useCallback(
    (name: string | null) => {
      dispatch(setExpandedVariableId({ conversationId, variableId: name }));
    },
    [conversationId, dispatch],
  );

  const handleVariableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();

      const isLast = index === definitions.length - 1;
      if (!isLast) {
        // Move focus to next variable input
        const container = (e.currentTarget as HTMLElement).closest(
          "[data-variable-inputs]",
        );
        const next = container?.querySelector<HTMLInputElement>(
          `[data-variable-index="${index + 1}"]`,
        );
        next?.focus();
        return;
      }
      // Last variable: submit
      if (submitOnEnter) {
        onSubmit?.();
      }
    },
    [definitions.length, submitOnEnter, onSubmit],
  );

  if (!shouldShowVariables || !showVariablePanel || definitions.length === 0)
    return null;

  return (
    <div
      className="max-h-72 overflow-y-auto w-full shrink-0 divide-y divide-border/40"
      data-variable-inputs
    >
      {definitions.map((variable, index) => {
        const isExpanded = expandedVariableId === variable.name;
        const rawValue =
          userValues[variable.name] ?? variable.defaultValue ?? "";
        // Variable values are strings (text-style or URL for media). Coerce
        // defensively so legacy object shapes don't render as "[object Object]".
        const displayValue: string =
          typeof rawValue === "string" ? rawValue : String(rawValue ?? "");

        if (isExpanded) {
          return (
            <Popover
              key={variable.name}
              open
              modal={false}
              onOpenChange={(open) => {
                if (!open) handleExpand(null);
              }}
            >
              <PopoverTrigger asChild>
                <div
                  className="flex items-center gap-2 pl-2.5 pr-1.5 h-8 bg-transparent hover:bg-accent/40 transition-colors focus-within:bg-accent/30 group w-full cursor-pointer"
                  onClick={() => handleExpand(variable.name)}
                  tabIndex={index + 1}
                >
                  <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap flex-shrink-0 cursor-pointer">
                    {formatText(variable.name)}:
                  </Label>
                  <div className="flex-1 text-sm text-foreground min-w-0">
                    {displayValue ? (
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                        {displayValue.replace(/\n/g, " ↵ ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">
                        {variable.helpText ?? "Enter value..."}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full text-primary">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent
                className="max-h-[500px] p-2 border-border overflow-y-auto rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-8px_rgba(0,0,0,0.6)]"
                style={{ width: "var(--radix-popover-trigger-width)" }}
                align="start"
                side="top"
                sideOffset={6}
              >
                <VariableInputComponent
                  value={displayValue}
                  onChange={(v) => handleValueChange(variable.name, v)}
                  variableName={variable.name}
                  customComponent={variable.customComponent}
                  onRequestClose={() => handleExpand(null)}
                  helpText={variable.helpText}
                  compact={compact}
                />
              </PopoverContent>
            </Popover>
          );
        }

        return (
          <div
            key={variable.name}
            className="flex items-center gap-2 pl-2.5 pr-1.5 h-8 bg-transparent hover:bg-accent/40 transition-colors focus-within:bg-accent/30 group"
          >
            <Label
              className="text-xs font-medium text-muted-foreground whitespace-nowrap flex-shrink-0 cursor-pointer"
              onClick={() => handleExpand(variable.name)}
            >
              {formatText(variable.name)}:
            </Label>
            <input
              type="text"
              value={
                displayValue.includes("\n")
                  ? displayValue.replace(/\n/g, " ↵ ")
                  : displayValue
              }
              onChange={(e) => handleValueChange(variable.name, e.target.value)}
              onKeyDown={(e) => handleVariableKeyDown(e, index)}
              placeholder={variable.helpText ?? "Enter value..."}
              className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 min-w-0"
              data-variable-index={index}
              tabIndex={index + 1}
            />
            <button
              type="button"
              onClick={() => handleExpand(variable.name)}
              className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
              tabIndex={-1}
              title="Expand to full editor"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
