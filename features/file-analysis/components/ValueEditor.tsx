/**
 * features/file-analysis/components/ValueEditor.tsx
 *
 * Per-value-type editor used inside the label picker + annotation list.
 *
 * Each label in the catalog declares a value_type: text | number | date |
 * currency | code | identifier | enum. This component renders the right
 * input control and returns a normalized_value shape compatible with the
 * server's `normalize_value` output.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LabelCatalogEntry } from "@/features/file-analysis/api/file-analysis";

interface ValueEditorProps {
  label: LabelCatalogEntry | null;
  initialRaw: string;
  initialNormalized?: Record<string, unknown> | null;
  onChange: (next: {
    raw: string;
    normalized: Record<string, unknown> | null;
  }) => void;
}

function normalizeNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(
  raw: string,
  unit: string,
): { kind: "currency"; value: number | null; unit: string; raw: string } {
  return { kind: "currency", value: normalizeNumber(raw), unit, raw };
}

export function ValueEditor({
  label,
  initialRaw,
  onChange,
}: ValueEditorProps) {
  const [raw, setRaw] = useState(initialRaw);

  // Update parent whenever raw or label changes.
  useEffect(() => {
    setRaw(initialRaw);
  }, [initialRaw]);

  const handleChange = useCallback(
    (next: string) => {
      setRaw(next);
      if (!label) {
        onChange({ raw: next, normalized: { kind: "text", value: next, raw: next } });
        return;
      }
      const vt = label.value_type;
      if (vt === "number") {
        onChange({
          raw: next,
          normalized: { kind: "number", value: normalizeNumber(next), raw: next },
        });
        return;
      }
      if (vt === "currency") {
        onChange({
          raw: next,
          normalized: normalizeCurrency(next, label.value_unit ?? "USD"),
        });
        return;
      }
      if (vt === "date") {
        onChange({
          raw: next,
          normalized: { kind: "date", value: next, raw: next },
        });
        return;
      }
      if (vt === "enum") {
        onChange({
          raw: next,
          normalized: {
            kind: "enum",
            value: next,
            raw: next,
            options: label.enum_options ?? [],
          },
        });
        return;
      }
      onChange({
        raw: next,
        normalized: { kind: vt ?? "text", value: next, raw: next },
      });
    },
    [label, onChange],
  );

  const vt = label?.value_type ?? "text";

  if (vt === "enum" && (label?.enum_options ?? []).length > 0) {
    return (
      <Select value={raw} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Pick a value…" />
        </SelectTrigger>
        <SelectContent>
          {label!.enum_options!.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (vt === "date") {
    return (
      <Input
        type="text"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="YYYY-MM-DD or MM/DD/YYYY"
        className="h-8 text-xs"
      />
    );
  }

  if (vt === "number" || vt === "currency") {
    const unit = vt === "currency" ? (label?.value_unit ?? "USD") : (label?.value_unit ?? "");
    return (
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => handleChange(e.target.value)}
          className="h-8 text-xs flex-1"
        />
        {unit ? (
          <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>
        ) : null}
      </div>
    );
  }

  // text / code / identifier / unknown — single-line by default.
  if ((raw?.length ?? 0) > 80) {
    return (
      <Textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        className="text-xs"
      />
    );
  }
  return (
    <Input
      type="text"
      value={raw}
      onChange={(e) => handleChange(e.target.value)}
      className="h-8 text-xs"
    />
  );
}
