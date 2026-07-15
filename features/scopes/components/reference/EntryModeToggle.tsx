"use client";

import { Link2, Type } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type EntryMode = "direct" | "reference";

interface EntryModeToggleProps {
  value: EntryMode;
  onChange: (mode: EntryMode) => void;
  disabled?: boolean;
  className?: string;
  /** Wires `<Field htmlFor>` — pass the same id the Field owns. */
  id?: string;
}

/**
 * THE first decision when defining a context item's value: does it hold a
 * typed-in value ("Direct" — string/number/date/etc.) or does it point at
 * another Matrx entity ("Reference" — file/scope/note/…)? Every value-type
 * picker routes through this fork FIRST — never a flat dropdown that lists
 * "Reference" as if it were just another primitive.
 *
 * Sized to match `ReferenceConfigFields` type chips (`Button size="sm"` /
 * `h-7 text-xs`) so the Direct/Reference control and the allowed-type chips
 * read as one control family. Built on the canonical `ToggleGroup`.
 */
export function EntryModeToggle({
  value,
  onChange,
  disabled,
  className,
  id,
}: EntryModeToggleProps) {
  return (
    <ToggleGroup
      id={id}
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === "direct" || v === "reference") onChange(v);
      }}
      aria-label="Value entry mode"
      className={cn(
        "inline-flex w-auto justify-start gap-0 rounded-md border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      <ToggleGroupItem
        value="direct"
        aria-label="Direct entry"
        className="h-7 gap-1 rounded px-2 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
      >
        <Type className="!size-3" />
        Direct
      </ToggleGroupItem>
      <ToggleGroupItem
        value="reference"
        aria-label="Reference"
        className="h-7 gap-1 rounded px-2 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
      >
        <Link2 className="!size-3" />
        Reference
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export default EntryModeToggle;
