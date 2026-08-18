"use client";

import { Eye, EyeOff, LockKeyhole, type LucideIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/utils/cn";

import type { VaultHandling } from "../types";

interface HandlingPresentation {
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Human vocabulary for the three real Vault protection levels. Every value is
 * encrypted at rest; this choice controls who may turn ciphertext back into a
 * human-visible value.
 */
export const HANDLING_PRESENTATION: Record<
  VaultHandling,
  HandlingPresentation
> = {
  visible: {
    label: "Standard",
    description: "Anyone who can use this credential may show or copy it.",
    icon: Eye,
  },
  revealable: {
    label: "Restricted",
    description: "Showing or copying requires extra reveal access.",
    icon: EyeOff,
  },
  sealed: {
    label: "Automation only",
    description: "No person can reveal it. Trusted automation can still use it.",
    icon: LockKeyhole,
  },
};

const HANDLING_OPTIONS: VaultHandling[] = [
  "visible",
  "revealable",
  "sealed",
];

interface VaultHandlingControlProps {
  value: VaultHandling;
  onValueChange: (value: VaultHandling) => void;
  disabled?: boolean;
  /** A stored sealed value is a one-way state, so edit surfaces render its
   *  status rather than pretending it is still an interactive option. */
  sealedLocked?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function VaultHandlingControl({
  value,
  onValueChange,
  disabled,
  sealedLocked = false,
  className,
  ariaLabel = "Value protection",
}: VaultHandlingControlProps) {
  if (value === "sealed" && sealedLocked) {
    const presentation = HANDLING_PRESENTATION.sealed;
    const Icon = presentation.icon;
    return (
      <div
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-lg border border-border bg-muted/35 px-3 py-2",
          className,
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            {presentation.label}
          </p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {presentation.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ToggleGroup
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (
          next === "visible" ||
          next === "revealable" ||
          next === "sealed"
        ) {
          onValueChange(next);
        }
      }}
      aria-label={ariaLabel}
      className={cn(
        "grid w-full grid-cols-3 gap-0 rounded-lg border border-border bg-muted/35 p-0.5",
        className,
      )}
    >
      {HANDLING_OPTIONS.map((handling) => {
        const presentation = HANDLING_PRESENTATION[handling];
        const Icon = presentation.icon;
        return (
          <ToggleGroupItem
            key={handling}
            value={handling}
            aria-label={presentation.label}
            title={presentation.description}
            className="h-8 min-w-0 gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            <Icon className="!h-3.5 !w-3.5" />
            <span className="min-w-0 whitespace-normal leading-3.5">
              {presentation.label}
            </span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
