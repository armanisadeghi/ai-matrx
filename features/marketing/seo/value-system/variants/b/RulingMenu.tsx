"use client";

/**
 * The gavel — ONE control for issuing and clearing tier rulings, reused by
 * the docket rows, the bulk bar, and triage mode. Tier choices come from the
 * site's own value-band vocabulary (never hardcoded); a note rides along so
 * the ruling explains itself to the next person who reads the receipt.
 */

import { useState } from "react";
import { Gavel, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { ValueBandDef } from "../../types";
import { NEGATIVE, UNVALUED, bandColorClasses } from "./lib";

export function RulingMenu({
  vocab,
  currentBand,
  isOverride,
  pending,
  onRule,
  onClear,
  trigger,
  align = "end",
}: {
  vocab: ValueBandDef[];
  currentBand?: string;
  isOverride?: boolean;
  pending?: boolean;
  onRule: (tier: string, tierLabel: string, notes?: string) => void;
  onClear?: () => void;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const choices = vocab.filter((b) => b.value !== UNVALUED);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNotes("");
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Gavel className="h-3 w-3" />
            )}
            Rule
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What is this really worth?
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {choices.map((b) => {
            const color = bandColorClasses(b.value, vocab);
            const active = isOverride && currentBand === b.value;
            return (
              <button
                key={b.value}
                type="button"
                title={b.description ?? undefined}
                disabled={pending}
                onClick={() => {
                  onRule(b.value, b.label, notes.trim() || undefined);
                  setOpen(false);
                  setNotes("");
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/50 disabled:opacity-50 ${
                  active ? "ring-2 ring-primary/40" : ""
                } ${color.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${color.swatch}`} />
                {b.label}
              </button>
            );
          })}
          {!choices.some((b) => b.value === NEGATIVE) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onRule(NEGATIVE, "Negative", notes.trim() || undefined);
                setOpen(false);
                setNotes("");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:border-destructive/60 disabled:opacity-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
              Negative
            </button>
          )}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why? (optional — travels with the ruling)"
          className="mt-2.5 min-h-[52px] resize-none text-xs"
        />
        {isOverride && onClear && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            className="mt-2 h-7 w-full gap-1.5 text-xs text-muted-foreground"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Clear my ruling — back to the computed value
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
