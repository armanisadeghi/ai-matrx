"use client";

/**
 * Typed value input for one rule field, driven by the `ai.setting` value_type
 * and the resolved bounds/vocabulary. boolean → Switch, enum → Select,
 * number/integer → bounded number Input, string → Input, complex → JSON Input.
 */

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const UNSET_SENTINEL = "__unset__";

interface RuleValueInputProps {
  valueType: string;
  enumValues?: unknown[] | null;
  min?: number | null;
  max?: number | null;
  value: unknown;
  /** undefined = clear the field (fall back to inherited/setting default). */
  onChange: (value: unknown | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function RuleValueInput({
  valueType,
  enumValues,
  min,
  max,
  value,
  onChange,
  placeholder,
  disabled,
}: RuleValueInputProps) {
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState(false);

  if (valueType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          disabled={disabled}
        />
        {value === undefined && (
          <span className="text-[10px] text-muted-foreground">unset</span>
        )}
      </div>
    );
  }

  if (enumValues && enumValues.length > 0) {
    return (
      <Select
        value={value === undefined || value === null ? UNSET_SENTINEL : String(value)}
        onValueChange={(v) => onChange(v === UNSET_SENTINEL ? undefined : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-7 w-44 text-xs">
          <SelectValue placeholder={placeholder ?? "unset"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET_SENTINEL} className="text-xs text-muted-foreground">
            unset
          </SelectItem>
          {enumValues.map((v) => (
            <SelectItem key={String(v)} value={String(v)} className="text-xs">
              {String(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (valueType === "number" || valueType === "integer") {
    return (
      <Input
        type="number"
        className="h-7 w-32 text-xs"
        value={value === undefined || value === null ? "" : String(value)}
        min={min ?? undefined}
        max={max ?? undefined}
        step={valueType === "integer" ? 1 : "any"}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const n = valueType === "integer" ? parseInt(raw, 10) : Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    );
  }

  if (valueType === "string" || valueType === "enum") {
    return (
      <Input
        className="h-7 w-44 text-xs"
        value={value === undefined || value === null ? "" : String(value)}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    );
  }

  // Complex types (object / array / string_array): JSON-in-a-line editor.
  const display =
    jsonDraft ?? (value === undefined ? "" : JSON.stringify(value));
  return (
    <Input
      className={cn("h-7 w-56 text-xs font-mono", jsonError && "border-destructive")}
      value={display}
      placeholder={placeholder ?? "JSON value"}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        setJsonDraft(raw);
        if (raw.trim() === "") {
          setJsonError(false);
          onChange(undefined);
          return;
        }
        try {
          onChange(JSON.parse(raw) as unknown);
          setJsonError(false);
        } catch {
          setJsonError(true);
        }
      }}
      onBlur={() => {
        if (!jsonError) setJsonDraft(null);
      }}
    />
  );
}
