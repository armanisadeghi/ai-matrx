"use client";

/**
 * NumberInput — draft-buffered numeric input with optional slider, shared by
 * the agent builder (AgentSettingsCore) and the per-run overrides editor
 * (RunConfigOverrides). Commits on blur/Enter; invalid drafts revert to the
 * last committed value.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  onSliderChange?: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isInteger?: boolean;
  disabled?: boolean;
  withSlider?: boolean;
}

export function NumberInput({
  value,
  onChange,
  onSliderChange,
  min,
  max,
  step = 1,
  isInteger = false,
  disabled = false,
  withSlider = false,
}: NumberInputProps) {
  const [draftState, setDraftState] = useState(() => ({
    sourceValue: value,
    text: String(value),
  }));
  const draft =
    draftState.sourceValue === value ? draftState.text : String(value);
  const setDraft = (text: string) => setDraftState({ sourceValue: value, text });
  const sliderStep = isInteger ? Math.max(1, Math.trunc(step)) : step;

  const commit = (raw: string) => {
    if (raw === "" || raw === "-") return;
    const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    else setDraft(String(value));
  };

  if (withSlider) {
    return (
      <div className="grid grid-cols-[1fr_4rem] items-center gap-2">
        <Slider
          min={min}
          max={max}
          step={sliderStep}
          value={[value]}
          onValueChange={(val) => {
            const nextValue = isInteger ? Math.trunc(val[0]) : val[0];
            onSliderChange?.(nextValue);
            setDraft(String(nextValue));
          }}
          disabled={disabled}
        />
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={disabled}
          className="h-7 px-2 text-xs"
        />
      </div>
    );
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      disabled={disabled}
      className="h-7 px-2 text-xs w-full"
    />
  );
}
