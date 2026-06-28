"use client";

import React, { useState, useCallback } from "react";
import { ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatText } from "@/utils/text/text-case-converter";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";

// ============================================================================
// TYPES
// ============================================================================

interface StackedVariableInputsProps {
  conversationId: string;
  disabled?: boolean;
  compact?: boolean;
  /** Hide the outer wrapper (for embedding in custom layouts) */
  minimal?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * StackedVariableInputs - Variable input component that self-manages via Redux
 */
export function StackedVariableInputs({
  conversationId,
  disabled = false,
  compact = false,
  minimal = false,
}: StackedVariableInputsProps) {
  const dispatch = useAppDispatch();
  const variableDefaults = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const values = useAppSelector(selectUserVariableValues(conversationId));

  const [expandedVariable, setExpandedVariable] = useState<string | null>(null);

  const handleVariableChange = useCallback(
    (variableName: string, value: string) => {
      dispatch(
        setUserVariableValue({ conversationId, name: variableName, value }),
      );
    },
    [dispatch, conversationId],
  );

  const handleExpandedVariableChange = useCallback(
    (variable: string | null) => {
      setExpandedVariable(variable);
    },
    [],
  );

  // Handle Enter key on collapsed variable inputs: cycle to next input
  const handleVariableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const isLast = index === variableDefaults.length - 1;
        if (!isLast) {
          const container = (e.currentTarget as HTMLElement).closest(
            "[data-variable-inputs]",
          );
          const nextInput = container?.querySelector<HTMLInputElement>(
            `[data-variable-index="${index + 1}"]`,
          );
          if (nextInput) {
            nextInput.focus();
          }
        }
      }
    },
    [variableDefaults.length],
  );

  if (variableDefaults.length === 0) {
    return null;
  }

  const variableInputs = (
    <>
      {variableDefaults.map((variable, index) => {
        const isExpanded = expandedVariable === variable.name;
        const rawValue = values[variable.name] ?? variable.defaultValue ?? "";
        const value =
          typeof rawValue === "string" ? rawValue : String(rawValue ?? "");

        return (
          <div key={variable.name}>
            {isExpanded ? (
              <Popover
                open={expandedVariable === variable.name}
                onOpenChange={(open) => {
                  if (!open) {
                    handleExpandedVariableChange(null);
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <div
                    className="w-full flex items-center gap-2 pl-3 pr-3 h-10 bg-background border-b border-border cursor-pointer hover:bg-accent transition-colors group"
                    onClick={() => handleExpandedVariableChange(variable.name)}
                  >
                    <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap flex-shrink-0 cursor-pointer">
                      {formatText(variable.name)}:
                    </Label>
                    <div className="flex-1 text-xs text-foreground min-w-0">
                      {value ? (
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                          {value.replace(/\n/g, " ↵ ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {variable.helpText || "Enter value..."}
                        </span>
                      )}
                    </div>
                    <ChevronUp className="w-3.5 h-3.5 text-primary flex-shrink-0 transition-colors" />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[500px] max-h-[500px] p-3 border-border overflow-y-auto scrollbar-thin"
                  align="center"
                  side="top"
                  sideOffset={8}
                >
                  <VariableInputComponent
                    value={value}
                    onChange={(newValue) =>
                      handleVariableChange(variable.name, newValue as string)
                    }
                    variableName={variable.name}
                    customComponent={
                      variable.customComponent as unknown as never
                    }
                    onRequestClose={() => handleExpandedVariableChange(null)}
                    helpText={variable.helpText}
                    compact={compact}
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-center gap-2 pl-3 pr-3 h-10 bg-background border-b border-border hover:bg-accent transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 group">
                <Label
                  className="text-xs font-medium text-muted-foreground whitespace-nowrap flex-shrink-0 cursor-pointer"
                  onClick={() => handleExpandedVariableChange(variable.name)}
                >
                  {formatText(variable.name)}:
                </Label>
                <input
                  type="text"
                  value={
                    value.includes("\n") ? value.replace(/\n/g, " ↵ ") : value
                  }
                  onChange={(e) =>
                    handleVariableChange(variable.name, e.target.value)
                  }
                  onKeyDown={(e) => handleVariableKeyDown(e, index)}
                  placeholder={variable.helpText || "Enter value..."}
                  className="flex-1 text-base md:text-xs bg-transparent border-none outline-none focus:outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                  data-variable-index={index}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => handleExpandedVariableChange(variable.name)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={disabled}
                  title="Expand to full editor"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  if (minimal) {
    // Minimal mode: no outer wrapper, direct border on each item
    return (
      <div
        className="bg-card rounded-xl border border-border overflow-hidden"
        data-variable-inputs
      >
        {variableInputs}
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-variable-inputs
    >
      {variableInputs}
    </div>
  );
}

export default StackedVariableInputs;
