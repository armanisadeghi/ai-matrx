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

import { useCallback, useRef } from "react";
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
import { selectVisibleInputDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/bound-variable.selectors";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectExpandedVariableId,
  selectShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setExpandedVariableId } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { VariableInputComponent } from "./input-components/VariableInputComponent";
import { BoundVariableChips } from "./BoundVariableChips";
import { formatText } from "@/utils/text/text-case-converter";
import { variableValueToDisplay } from "@/features/agents/utils/variable-utils";

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
  const rootRef = useRef<HTMLDivElement>(null);

  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  // Visible inputs = plain vars + UNRESOLVED bound vars (with inherited component). Bound
  // vars that resolved to a scope value are shown as pills by BoundVariableChips instead.
  const visibleDefs = useAppSelector(
    selectVisibleInputDefinitions(conversationId),
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

  // Hand focus to the main composer textarea (if this panel sits above one).
  // Scoped to the enclosing input shell so multiple inputs on a page don't
  // cross-focus. Returns false when there is no freeform composer (e.g.
  // variables-only / Run-form mode), so callers can fall back to submitting.
  const focusMainInput = useCallback((): boolean => {
    const shell = rootRef.current?.closest("[data-agent-input-shell]");
    const main = (shell ?? document).querySelector<HTMLTextAreaElement>(
      "[data-agent-main-input]",
    );
    if (main) {
      main.focus();
      return true;
    }
    return false;
  }, []);

  // Enter walks forward: variable → next variable → … → main composer. Once in
  // the composer, its own Enter handling submits. In variables-only mode (no
  // composer) the last variable falls back to onSubmit when submitOnEnter.
  const advanceFromCollapsed = useCallback(
    (index: number) => {
      const isLast = index === visibleDefs.length - 1;
      if (!isLast) {
        const container = rootRef.current?.querySelector(
          "[data-variable-inputs]",
        );
        const next = container?.querySelector<HTMLElement>(
          `[data-variable-index="${index + 1}"]`,
        );
        if (next) {
          next.focus();
          return;
        }
      }
      const moved = focusMainInput();
      if (!moved && submitOnEnter) onSubmit?.();
    },
    [visibleDefs.length, focusMainInput, submitOnEnter, onSubmit],
  );

  const handleVariableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      advanceFromCollapsed(index);
    },
    [advanceFromCollapsed],
  );

  // Same walk, but from the EXPANDED big-textarea editor: advancing opens the
  // next variable's editor (its textarea auto-focuses); the last one closes
  // the popover and drops into the main composer.
  const advanceFromExpanded = useCallback(
    (index: number) => {
      const isLast = index === visibleDefs.length - 1;
      if (!isLast) {
        handleExpand(visibleDefs[index + 1].name);
        return;
      }
      handleExpand(null);
      requestAnimationFrame(() => {
        const moved = focusMainInput();
        if (!moved && submitOnEnter) onSubmit?.();
      });
    },
    [visibleDefs, handleExpand, focusMainInput, submitOnEnter, onSubmit],
  );

  if (!shouldShowVariables || !showVariablePanel || definitions.length === 0)
    return null;

  return (
    <div className="w-full shrink-0" ref={rootRef}>
      <BoundVariableChips conversationId={conversationId} />
      <div
        className="max-h-72 overflow-y-auto w-full divide-y divide-border/40"
        data-variable-inputs
      >
        {visibleDefs.map((variable, index) => {
          const isExpanded = expandedVariableId === variable.name;
          const rawValue =
            userValues[variable.name] ?? variable.defaultValue ?? "";
          // Envelope-aware: picklist values render as their public label, never
          // "[object Object]" and never the secret description.
          const displayValue: string = variableValueToDisplay(rawValue);
          const isPicklistBound = !!variable.customComponent?.picklist?.listId;

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
                    value={rawValue}
                    onChange={(v) => handleValueChange(variable.name, v)}
                    variableName={variable.name}
                    customComponent={variable.customComponent}
                    onRequestClose={() => handleExpand(null)}
                    onEnterAdvance={() => advanceFromExpanded(index)}
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
              {isPicklistBound ? (
                <button
                  type="button"
                  onClick={() => handleExpand(variable.name)}
                  className="flex-1 text-left text-sm bg-transparent text-foreground min-w-0 truncate cursor-pointer"
                  data-variable-index={index}
                  tabIndex={index + 1}
                >
                  {displayValue || (
                    <span className="text-muted-foreground/60">
                      {variable.helpText ?? "Choose…"}
                    </span>
                  )}
                </button>
              ) : (
                <input
                  type="text"
                  value={
                    displayValue.includes("\n")
                      ? displayValue.replace(/\n/g, " ↵ ")
                      : displayValue
                  }
                  onChange={(e) =>
                    handleValueChange(variable.name, e.target.value)
                  }
                  onKeyDown={(e) => handleVariableKeyDown(e, index)}
                  placeholder={variable.helpText ?? "Enter value..."}
                  className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 min-w-0"
                  data-variable-index={index}
                  tabIndex={index + 1}
                />
              )}
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
    </div>
  );
}
