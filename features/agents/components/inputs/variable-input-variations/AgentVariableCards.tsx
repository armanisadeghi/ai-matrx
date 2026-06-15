"use client";

/**
 * Renders one AgentVariableInputCard per definition (micro card UX), gated like other variable layouts.
 */

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectVisibleInputDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/bound-variable.selectors";
import { BoundVariableChips } from "@/features/agents/components/inputs/BoundVariableChips";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectShowVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { isMediaVariableType } from "@/features/agents/types/agent-definition.types";
import { ImageVariableInput } from "@/features/agents/components/inputs/input-components/ImageVariableInput";
import { AudioVariableInput } from "@/features/agents/components/inputs/input-components/AudioVariableInput";
import { VideoVariableInput } from "@/features/agents/components/inputs/input-components/VideoVariableInput";
import { DocumentVariableInput } from "@/features/agents/components/inputs/input-components/DocumentVariableInput";
import { YoutubeVariableInput } from "@/features/agents/components/inputs/input-components/YoutubeVariableInput";
import { Button } from "@/components/ui/button";
import { ArrowRight, Minus, Plus } from "lucide-react";

interface AgentVariableInputCardProps {
  conversationId: string;
  variable: VariableDefinition;
  onSubmit: () => void;
}

function AgentVariableInputCard({
  conversationId,
  variable,
  onSubmit,
}: AgentVariableInputCardProps) {
  const dispatch = useAppDispatch();
  const userValues = useAppSelector(selectUserVariableValues(conversationId));
  const currentValue = userValues[variable.name];
  const comp = variable.customComponent;
  const type = comp?.type ?? "textarea";

  const setValue = (value: unknown) => {
    dispatch(
      setUserVariableValue({ conversationId, name: variable.name, value }),
    );
  };

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-sm animate-in slide-in-from-bottom-2 duration-200 overflow-hidden">
      <div className="px-3 py-2">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
          {variable.name}
          {variable.required && (
            <span className="text-destructive ml-0.5">*</span>
          )}
        </label>
        {variable.helpText && (
          <p className="text-[10px] text-muted-foreground/70 mb-1.5">
            {variable.helpText}
          </p>
        )}

        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            {type === "textarea" ? (
              <TextMicroInput
                value={(currentValue as string) ?? ""}
                onChange={setValue}
              />
            ) : type === "toggle" || type === "light-switch" ? (
              <ToggleMicroInput
                value={currentValue as string}
                labels={comp?.toggleValues ?? ["On", "Off"]}
                onChange={setValue}
              />
            ) : type === "radio" ||
              type === "pill-toggle" ||
              type === "selection-list" ||
              type === "buttons" ? (
              <ChipsMicroInput
                options={comp?.options ?? []}
                selected={(currentValue as string) ?? ""}
                onSelect={setValue}
                multi={false}
              />
            ) : type === "checkbox" ? (
              <ChipsMicroInput
                options={comp?.options ?? []}
                selected={(currentValue as string[]) ?? []}
                onSelect={setValue}
                multi
              />
            ) : type === "select" ? (
              <SelectMicroInput
                options={comp?.options ?? []}
                value={(currentValue as string) ?? ""}
                onChange={setValue}
              />
            ) : type === "number" || type === "slider" ? (
              <NumberMicroInput
                value={(currentValue as number) ?? comp?.min ?? 0}
                min={comp?.min}
                max={comp?.max}
                step={comp?.step ?? 1}
                onChange={setValue}
              />
            ) : isMediaVariableType(type) ? (
              type === "image" ? (
                <ImageVariableInput
                  value={currentValue}
                  onChange={setValue}
                  variableName={variable.name}
                  compact
                />
              ) : type === "audio" ? (
                <AudioVariableInput
                  value={currentValue}
                  onChange={setValue}
                  variableName={variable.name}
                  compact
                />
              ) : type === "video" ? (
                <VideoVariableInput
                  value={currentValue}
                  onChange={setValue}
                  variableName={variable.name}
                  compact
                />
              ) : type === "document" ? (
                <DocumentVariableInput
                  value={currentValue}
                  onChange={setValue}
                  variableName={variable.name}
                  compact
                />
              ) : (
                <YoutubeVariableInput
                  value={currentValue}
                  onChange={setValue}
                  variableName={variable.name}
                  compact
                />
              )
            ) : (
              <TextMicroInput
                value={(currentValue as string) ?? ""}
                onChange={setValue}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitArrow({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="icon"
      className="w-6 h-6 rounded-full bg-primary text-primary-foreground shrink-0"
      onClick={onClick}
    >
      <ArrowRight className="w-3 h-3" />
    </Button>
  );
}

function TextMicroInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
      style={{ fontSize: "16px" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type here..."
    />
  );
}

function ToggleMicroInput({
  value,
  labels,
  onChange,
}: {
  value: unknown;
  labels: [string, string];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {labels.map((label) => (
        <button
          key={label}
          className={`flex-1 h-7 text-[11px] rounded-lg border transition-colors ${
            value === label
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/50 text-foreground border-border hover:bg-muted"
          }`}
          onClick={() => onChange(label)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChipsMicroInput({
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
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          className={`h-6 px-2 text-[10px] rounded-md border transition-colors ${
            isSelected(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/50 text-foreground border-border hover:bg-muted"
          }`}
          onClick={() => handleClick(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SelectMicroInput({
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
      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none"
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

function NumberMicroInput({
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
  const [localValue, setLocalValue] = useState(value);

  const decrement = () => {
    const next = localValue - step;
    const clamped = min !== undefined ? Math.max(min, next) : next;
    setLocalValue(clamped);
    onChange(clamped);
  };

  const increment = () => {
    const next = localValue + step;
    const clamped = max !== undefined ? Math.min(max, next) : next;
    setLocalValue(clamped);
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        className="w-6 h-6 flex items-center justify-center rounded-md bg-muted/50 border border-border hover:bg-muted"
        onClick={decrement}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-10 text-center text-xs font-medium tabular-nums">
        {localValue}
      </span>
      <button
        className="w-6 h-6 flex items-center justify-center rounded-md bg-muted/50 border border-border hover:bg-muted"
        onClick={increment}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

interface AgentVariableCardsProps {
  conversationId: string;
  onSubmit?: () => void;
}

export function AgentVariableCards({
  conversationId,
  onSubmit,
}: AgentVariableCardsProps) {
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  // Plain + unresolved bound vars (inherited component) as cards; resolved bound vars as pills.
  const defs = useAppSelector(selectVisibleInputDefinitions(conversationId));

  if (!shouldShowVariables || !showVariablePanel || definitions.length === 0) {
    return null;
  }

  const fire = onSubmit ?? (() => {});

  return (
    <div className="flex flex-col gap-2 border-b border-border px-2 py-2 max-h-64 overflow-y-auto">
      <BoundVariableChips conversationId={conversationId} />
      {defs.map((variable) => (
        <div
          key={variable.name}
          className="flex justify-center sm:justify-start"
        >
          <AgentVariableInputCard
            conversationId={conversationId}
            variable={variable}
            onSubmit={fire}
          />
        </div>
      ))}
    </div>
  );
}
