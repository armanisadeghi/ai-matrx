"use client";

// features/education/classes/components/AccessModeField.tsx
//
// The create/edit form control for a class's access mode. Three selectable cards
// (open | closed | paid) sourced from ACCESS_MODES (constants.ts). Owner-only —
// the ClassFormDialog is only reachable by the class owner.

import { Globe, Lock, CreditCard, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ACCESS_MODES } from "../constants";
import type { AccessMode } from "../types";

const ICONS: Record<AccessMode, LucideIcon> = {
  open: Globe,
  closed: Lock,
  paid: CreditCard,
};

export function AccessModeField({
  value,
  onChange,
}: {
  value: AccessMode;
  onChange: (mode: AccessMode) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Who can join</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ACCESS_MODES.map((mode) => {
          const Icon = ICONS[mode.value];
          const active = value === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange(mode.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4" />
                {mode.label}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">
                {mode.short}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {ACCESS_MODES.find((m) => m.value === value)?.description}
      </p>
    </div>
  );
}
