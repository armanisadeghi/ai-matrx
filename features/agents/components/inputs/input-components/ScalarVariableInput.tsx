"use client";

/**
 * ScalarVariableInput — the single string-valued input for the typed scalar
 * component kinds that all share the "one native control, plain string value"
 * contract: datetime, time, email, url, phone, percent, color, markdown.
 *
 * Kept in one file (rather than eight near-identical ones) because they differ
 * only by input `type` + a little chrome. Media/number/currency have their own
 * components because their value shape or affordances genuinely differ.
 *
 * Value contract: a plain string in, a plain string out — same as the other
 * text-style inputs routed through VariableInputComponent.
 */

import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

export type ScalarInputKind =
  | "datetime"
  | "time"
  | "email"
  | "url"
  | "phone"
  | "percent"
  | "color"
  | "markdown";

interface ScalarVariableInputProps {
  kind: ScalarInputKind;
  value: string;
  onChange: (value: string) => void;
  variableName: string;
  compact?: boolean;
  disabled?: boolean;
}

const NATIVE_TYPE: Record<
  Exclude<ScalarInputKind, "percent" | "color" | "markdown">,
  string
> = {
  datetime: "datetime-local",
  time: "time",
  email: "email",
  url: "url",
  phone: "tel",
};

const PLACEHOLDER: Record<ScalarInputKind, string> = {
  datetime: "",
  time: "",
  email: "name@example.com",
  url: "https://…",
  phone: "+1 555 123 4567",
  percent: "0–100",
  color: "#000000",
  markdown: "Write Markdown…",
};

export function ScalarVariableInput({
  kind,
  value,
  onChange,
  variableName,
  compact = false,
  disabled,
}: ScalarVariableInputProps) {
  if (kind === "markdown") {
    return (
      <ProTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER.markdown}
        minHeight={compact ? 40 : 120}
        maxHeight={600}
        autoGrow
        disabled={disabled}
        enableTextStats={false}
        aria-label={variableName}
      />
    );
  }

  if (kind === "percent") {
    return (
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={PLACEHOLDER.percent}
          disabled={disabled}
          aria-label={variableName}
          style={{ fontSize: "16px" }}
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
    );
  }

  if (kind === "color") {
    const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${variableName} color`}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-transparent p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={PLACEHOLDER.color}
          disabled={disabled}
          aria-label={variableName}
          style={{ fontSize: "16px" }}
          className={cn("flex-1 font-mono")}
        />
      </div>
    );
  }

  // datetime / time / email / url / phone — one native input. datetime-local
  // wants "YYYY-MM-DDTHH:mm"; a stored ISO timestamp is sliced to fit.
  const current =
    kind === "datetime" && value.length > 16 ? value.slice(0, 16) : value;
  return (
    <Input
      type={NATIVE_TYPE[kind]}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      placeholder={PLACEHOLDER[kind]}
      disabled={disabled}
      aria-label={variableName}
      style={{ fontSize: "16px" }}
    />
  );
}

export default ScalarVariableInput;
