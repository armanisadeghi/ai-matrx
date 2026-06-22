"use client";

import { cn } from "@/lib/utils";
import { Zap, SlidersHorizontal, Hand } from "lucide-react";
import { AUTONOMY_CONFIG } from "../../constants";
import type { AutonomyLevel } from "../../types";

const ICON_MAP = { Zap, SlidersHorizontal, Hand } as const;

interface AutonomySelectorProps {
  value: AutonomyLevel;
  onChange: (level: AutonomyLevel) => void;
}

export function AutonomySelector({ value, onChange }: AutonomySelectorProps) {
  return (
    <div className="space-y-1.5">
      {(
        Object.entries(AUTONOMY_CONFIG) as [
          AutonomyLevel,
          (typeof AUTONOMY_CONFIG)[AutonomyLevel],
        ][]
      ).map(([level, config]) => {
        const Icon = ICON_MAP[config.icon as keyof typeof ICON_MAP];
        const isSelected = value === level;

        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              "w-full rounded-xl border p-2.5 text-left text-foreground transition-all min-h-[44px]",
              isSelected
                ? "border-primary/40 bg-primary/5"
                : "border-border/50 hover:border-primary/20 bg-card/40",
            )}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-xs text-foreground">
                  {config.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-px leading-snug line-clamp-1">
                  {config.description}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
