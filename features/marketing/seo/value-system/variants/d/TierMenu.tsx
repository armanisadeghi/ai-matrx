"use client";

/**
 * The ruling control — set or clear a keyword's tier with an optional note.
 * One component drives both the per-row control and the bulk action bar;
 * choices come from the site's vocabulary, never a hardcoded list.
 */

import { useState } from "react";
import { Eraser, Gavel, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BandMeta } from "./lib";

export function TierMenu({
  bands,
  hasOverride,
  count,
  pending,
  onApply,
  trigger,
}: {
  /** Settable tiers, vocabulary order (reserved `unvalued` excluded upstream). */
  bands: BandMeta[];
  /** Whether any selected keyword currently carries an override (enables Clear). */
  hasOverride: boolean;
  /** How many keywords the ruling covers. */
  count: number;
  pending: boolean;
  onApply: (tier: string | null, notes?: string) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const apply = (chosen: string | null) => {
    onApply(chosen, notes.trim() || undefined);
    setOpen(false);
    setTier(null);
    setNotes("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTier(null);
          setNotes("");
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Rule {count === 1 ? "this keyword" : `${count} keywords`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 p-2">
          {bands.map((band) => (
            <button
              key={band.slug}
              type="button"
              disabled={pending}
              onClick={() => setTier(tier === band.slug ? null : band.slug)}
              title={band.description ?? undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                tier === band.slug
                  ? "border-primary bg-accent text-foreground ring-1 ring-primary/40"
                  : "border-border bg-card text-foreground hover:bg-accent/50",
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", band.tone.dot)} />
              {band.label}
            </button>
          ))}
        </div>
        <div className="px-2 pb-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why? (optional, but future-you will thank you)"
            className="min-h-[52px] resize-none text-xs"
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            disabled={pending || !hasOverride}
            title={
              hasOverride
                ? "Remove the hand ruling — the computed value takes back over"
                : "Nothing selected carries a hand ruling"
            }
            onClick={() => apply(null)}
          >
            <Eraser className="h-3 w-3" />
            Clear override
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={pending || tier === null}
            onClick={() => apply(tier)}
          >
            {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Apply ruling
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
