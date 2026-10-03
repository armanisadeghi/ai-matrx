"use client";

// features/workflow-runtime/simple-builder/ValueText.tsx
//
// One value of a step: typed text with placeholders inside it. The variables picker is the
// platform's existing `VariableSelector` (the agent builder's), fed this Workflow's values —
// `{{trigger.record.<key>}}`, `{{trigger.before.<key>}}`, `{{steps.<n>.output.<x>}}` — and
// showing each as words, never as the token.

import { useRef } from "react";
import { BasicInput, Textarea } from "@ai-matrx/design-system";
import { VariableSelector } from "@/features/agents/components/variables-management/VariableSelector";
import type { ValueChoice } from "./builderSpec";

export function ValueText({
  value,
  onChange,
  choices,
  placeholder,
  multiline = false,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  choices: ValueChoice[];
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const caret = useRef<number | null>(null);
  const labels = new Map(choices.map((c) => [c.token, c.label]));

  const insert = (token: string) => {
    const at = caret.current ?? value.length;
    const next = value.slice(0, at) + token + value.slice(at);
    onChange(next);
    caret.current = at + token.length;
  };
  const remember = () => {
    caret.current = ref.current?.selectionStart ?? null;
  };

  const field = multiline ? (
    <Textarea
      ref={ref as React.Ref<HTMLTextAreaElement>}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      onSelect={remember}
      onBlur={remember}
      className="min-h-[4.5rem] text-base sm:text-sm"
    />
  ) : (
    <BasicInput
      ref={ref as React.Ref<HTMLInputElement>}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onSelect={remember}
      onBlur={remember}
      className="text-base sm:text-sm"
    />
  );

  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">{field}</div>
      {disabled ? null : (
        <VariableSelector
          variables={choices.map((c) => c.token)}
          labelFor={(token) => labels.get(token) ?? token}
          onVariableSelected={insert}
          onBeforeOpen={remember}
          ariaLabel="Insert a value"
        />
      )}
    </div>
  );
}
