"use client";

import { useState, useTransition } from "react";
import { Zap, SlidersHorizontal, Hand, Check, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { updateTopic } from "../../../service";
import type { AutonomyLevel } from "../../../types";

const OPTIONS: {
  value: AutonomyLevel;
  label: string;
  icon: typeof Zap;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    icon: Zap,
    description:
      "Every step chains automatically — keywords, search, scrape, analysis, synthesis, and report all run end-to-end without prompts.",
  },
  {
    value: "semi",
    label: "Semi",
    icon: SlidersHorizontal,
    description:
      "Pauses at key junctions (after search, after analysis) so you can prune sources, edit content, or adjust direction before the next stage.",
  },
  {
    value: "manual",
    label: "Manual",
    icon: Hand,
    description:
      "Nothing runs without an explicit click. Use the play button on each node to advance the pipeline one stage at a time.",
  },
];

interface Props {
  topicId: string;
  value: AutonomyLevel;
  onSaved?: () => void;
}

export function AutonomyControl({ topicId, value, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const Current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const CurrentIcon = Current.icon;

  const handleSelect = (next: AutonomyLevel) => {
    if (next === value) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateTopic(topicId, { autonomy_level: next });
        toast.success(`Autonomy set to ${next}`);
        setOpen(false);
        onSaved?.();
      } catch (err) {
        toast.error((err as Error).message ?? "Could not change autonomy");
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-7 rounded-full px-2 text-[11px] font-medium",
            "matrx-glass-card text-muted-foreground hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          )}
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CurrentIcon className="h-3 w-3" />
          )}
          <span>{Current.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-1 rounded-xl border border-border/60 bg-popover/95 backdrop-blur"
      >
        <div className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Pipeline autonomy
        </div>
        <div className="space-y-px">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                disabled={pending}
                className={cn(
                  "w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left",
                  "hover:bg-accent/60 transition-colors",
                  isSelected && "bg-primary/8",
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isSelected && "text-primary",
                      )}
                    >
                      {opt.label}
                    </span>
                    {isSelected && (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
