"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BatchFieldDef } from "./batchModel";

export interface ScalarControlProps {
  def: BatchFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Options for `dynamic-select` fields (e.g. categories). */
  dynamicOptions?: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  /** Compact = grid cell; default = set-all panel. */
  compact?: boolean;
}

/**
 * Renders the correct input for a single scalar shortcut field. Shared by the
 * "set for all" panel and per-row grid cells so the affordance is identical.
 */
export function ScalarValueControl({
  def,
  value,
  onChange,
  dynamicOptions,
  disabled,
  compact,
}: ScalarControlProps) {
  const c = def.control;
  const h = compact ? "h-7 text-xs" : "h-8 text-sm";

  if (c.kind === "boolean") {
    return (
      <div className="flex items-center">
        <Switch
          checked={value === true}
          onCheckedChange={(v) => onChange(v === true)}
          disabled={disabled}
        />
      </div>
    );
  }

  if (c.kind === "select" || c.kind === "dynamic-select") {
    const options = c.kind === "select" ? c.options : (dynamicOptions ?? []);
    const current = value == null ? "" : String(value);
    return (
      <Select
        value={current || undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn(h, "w-full")}>
          <SelectValue placeholder="Pick…" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <SelectItem value="__none__" disabled>
              No options
            </SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (c.kind === "number") {
    return (
      <Input
        type="number"
        min={c.min}
        max={c.max}
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? 0 : Number(raw));
        }}
        className={cn(h, "w-full")}
        style={{ fontSize: compact ? "13px" : "16px" }}
        disabled={disabled}
      />
    );
  }

  if (c.kind === "json") {
    return <JsonControl value={value} onChange={onChange} disabled={disabled} compact={compact} />;
  }

  // text
  const str = value == null ? "" : String(value);
  if (c.multiline && !compact) {
    return (
      <Textarea
        value={str}
        onChange={(e) => onChange(e.target.value || null)}
        rows={2}
        placeholder={c.placeholder}
        className="text-sm resize-none"
        style={{ fontSize: "16px" }}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      value={str}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={c.placeholder}
      className={cn(h, "w-full")}
      style={{ fontSize: compact ? "13px" : "16px" }}
      disabled={disabled}
    />
  );
}

function JsonControl({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [raw, setRaw] = useState(() =>
    value == null ? "" : JSON.stringify(value, null, compact ? 0 : 2),
  );
  const [error, setError] = useState<string | null>(null);

  const onRaw = (next: string) => {
    setRaw(next);
    if (next.trim() === "") {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="space-y-1 w-full">
      <Textarea
        value={raw}
        onChange={(e) => onRaw(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder="{ }"
        className="font-mono text-[11px] resize-none"
        style={{ fontSize: "13px" }}
        disabled={disabled}
      />
      {error && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5" />
          {error}
        </p>
      )}
    </div>
  );
}
