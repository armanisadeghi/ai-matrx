"use client";

/**
 * ChatAssistantVariableInputs
 *
 * Compact, collapsible variable input panel customized for the chat assistant widget.
 * Shows ALL variable definitions regardless of conversation state.
 * Minimal row-based layout — no individual card borders.
 */

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { ChevronDown, ChevronRight, Minus, Plus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppDispatch } from "@/lib/redux/store";

interface ChatAssistantVariableInputsProps {
  conversationId: string;
  onSubmit: () => void;
}

export function ChatAssistantVariableInputs({
  conversationId,
  onSubmit,
}: ChatAssistantVariableInputsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const variableDefs = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const userValues = useAppSelector(selectUserVariableValues(conversationId));
  const dispatch = useAppDispatch();

  if (variableDefs.length === 0) return null;

  const filledCount = variableDefs.filter((def) => {
    const val = userValues[def.name];
    return val !== undefined && val !== null && val !== "";
  }).length;

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <span className="font-medium uppercase tracking-wider">
          Quick Questions
        </span>
        <span className="text-muted-foreground/60 ml-auto">
          {filledCount}/{variableDefs.length}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {variableDefs.map((variable) => (
            <MicroVariableRow
              key={variable.name}
              conversationId={conversationId}
              variable={variable}
              value={userValues[variable.name]}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro variable row — label + input in one compact line
// ─────────────────────────────────────────────────────────────────────────────

interface MicroVariableRowProps {
  conversationId: string;
  variable: VariableDefinition;
  value: unknown;
  dispatch: AppDispatch;
}

function MicroVariableRow({
  conversationId,
  variable,
  value,
  dispatch,
}: MicroVariableRowProps) {
  const comp = variable.customComponent;
  const type = comp?.type ?? "textarea";

  const setValue = (v: unknown) => {
    dispatch(
      setUserVariableValue({ conversationId, name: variable.name, value: v }),
    );
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label
        className="text-[10px] font-medium text-muted-foreground shrink-0 w-16 truncate"
        title={variable.name}
      >
        {variable.name}
        {variable.required && <span className="text-destructive">*</span>}
      </label>
      <div className="flex-1 min-w-0">
        {type === "textarea" ? (
          <MicroText value={(value as string) ?? ""} onChange={setValue} />
        ) : type === "toggle" ? (
          <MicroToggle
            value={value as string}
            labels={comp?.toggleValues ?? ["On", "Off"]}
            onChange={setValue}
          />
        ) : type === "radio" ? (
          <MicroChips
            options={comp?.options ?? []}
            selected={(value as string) ?? ""}
            onSelect={setValue}
            multi={false}
          />
        ) : type === "checkbox" ? (
          <MicroChips
            options={comp?.options ?? []}
            selected={(value as string[]) ?? []}
            onSelect={setValue}
            multi
          />
        ) : type === "select" ? (
          <MicroSelect
            options={comp?.options ?? []}
            value={(value as string) ?? ""}
            onChange={setValue}
          />
        ) : type === "number" ? (
          <MicroNumber
            value={(value as number) ?? comp?.min ?? 0}
            min={comp?.min}
            max={comp?.max}
            step={comp?.step ?? 1}
            onChange={setValue}
          />
        ) : (
          <MicroText value={(value as string) ?? ""} onChange={setValue} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro input primitives — ultra compact, no card borders
// ─────────────────────────────────────────────────────────────────────────────

function MicroText({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className="w-full h-6 px-1.5 text-[11px] bg-muted/40 border border-border/60 rounded focus:outline-none focus:ring-1 focus:ring-primary/40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="..."
    />
  );
}

function MicroToggle({
  value,
  labels,
  onChange,
}: {
  value: unknown;
  labels: [string, string];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {labels.map((label) => (
        <button
          key={label}
          className={`flex-1 h-6 text-[10px] rounded border transition-colors ${
            value === label
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
          }`}
          onClick={() => onChange(label)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MicroChips({
  options,
  selected,
  onSelect,
  multi,
}: {
  options: string[];
  selected: string | string[];
  onSelect: (v: string | string[]) => void;
  multi: boolean;
}) {
  const isSelected = (opt: string) =>
    multi ? (selected as string[]).includes(opt) : selected === opt;

  const handleClick = (opt: string) => {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : [];
      onSelect(
        arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt],
      );
    } else {
      onSelect(opt);
    }
  };

  return (
    <div className="flex flex-wrap gap-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          className={`h-5 px-1.5 text-[9px] rounded border transition-colors ${
            isSelected(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
          }`}
          onClick={() => handleClick(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function MicroSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="w-full h-6 px-1.5 text-[11px] bg-muted/40 border border-border/60 rounded focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
      style={{ fontSize: "16px" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function MicroNumber({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const decrement = () => {
    const next = value - step;
    const clamped = min !== undefined ? Math.max(min, next) : next;
    onChange(clamped);
  };

  const increment = () => {
    const next = value + step;
    const clamped = max !== undefined ? Math.min(max, next) : next;
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        className="w-5 h-5 flex items-center justify-center rounded bg-muted/40 border border-border/60 hover:bg-muted"
        onClick={decrement}
      >
        <Minus className="w-2.5 h-2.5" />
      </button>
      <span className="w-8 text-center text-[10px] font-medium tabular-nums">
        {value}
      </span>
      <button
        className="w-5 h-5 flex items-center justify-center rounded bg-muted/40 border border-border/60 hover:bg-muted"
        onClick={increment}
      >
        <Plus className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}
