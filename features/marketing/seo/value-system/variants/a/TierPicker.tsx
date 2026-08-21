"use client";

/**
 * The one control that writes: pick a value tier (site vocabulary), add an
 * optional note, apply — or clear back to computed. Wraps any trigger.
 */

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ValueBandDef } from "../../types";
import { RESERVED_UNVALUED, bandInfo, type BandTone } from "./lib";

export function TierPicker({
  vocab,
  index,
  currentBand,
  canClear,
  applying,
  onApply,
  children,
  align = "end",
}: {
  vocab: ValueBandDef[];
  index: Map<string, { label: string; tone: BandTone; sort: number }>;
  /** Band of the single row being ruled on (bulk passes null). */
  currentBand: string | null;
  /** Show "clear override" (single: only when overridden; bulk: always). */
  canClear: boolean;
  applying: boolean;
  onApply: (tier: string | null, note: string) => Promise<boolean>;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null | "clear">(null);

  const choices = [...vocab]
    .filter((b) => b.value !== RESERVED_UNVALUED)
    .sort((a, b) => a.sort - b.sort);

  const apply = async (tier: string | null) => {
    setPending(tier === null ? "clear" : tier);
    const ok = await onApply(tier, note.trim());
    setPending(null);
    if (ok) {
      setNote("");
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-2">
        <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Rule what this is worth
        </p>
        <div className="space-y-0.5">
          {choices.map((b) => {
            const tone = bandInfo(index, b.value).tone;
            const isCurrent = currentBand === b.value;
            const isPending = pending === b.value && applying;
            return (
              <button
                key={b.value}
                type="button"
                disabled={applying}
                onClick={() => void apply(b.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60",
                  isCurrent && "bg-accent/60",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                <span className="flex-1 truncate text-foreground">{b.label}</span>
                {isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                {isCurrent && !isPending && (
                  <span className="text-[10px] text-muted-foreground">current</span>
                )}
              </button>
            );
          })}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why? (optional — saved with your ruling)"
          className="mt-2 min-h-14 resize-none text-xs"
        />
        {canClear && (
          <Button
            variant="ghost"
            size="sm"
            disabled={applying}
            onClick={() => void apply(null)}
            className="mt-1.5 h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground"
          >
            {pending === "clear" && applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eraser className="h-3.5 w-3.5" />
            )}
            Clear my ruling — back to computed
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
