"use client";

import { Button } from "@/components/ui/button";

/** Compact mode switch used by the site and workspace cost explorers. */
export function CostModeButtons({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "secondary" : "ghost"}
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
