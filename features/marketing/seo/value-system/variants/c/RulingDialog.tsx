"use client";

/**
 * The considered-ruling dialog — set or clear keyword tier overrides (single
 * or bulk) with an optional note explaining WHY. The note matters: an
 * override is the highest-quality data in the model (value-system.md, law 3),
 * and the reason travels with it.
 */

import { useState } from "react";
import { Gavel, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/styles/themes/utils";
import type { BandMeta } from "./lib";

export interface RulingDraft {
  keywordIds: string[];
  /** What the toast/dialog calls the target ("battery recycling", "12 keywords"). */
  label: string;
  mode: "set" | "clear";
  /** Preselected tier for "set" mode; null forces a choice. */
  tier: string | null;
}

export function RulingDialog({
  draft,
  metas,
  busy,
  onCancel,
  onApply,
}: {
  draft: RulingDraft;
  metas: BandMeta[];
  busy: boolean;
  onCancel: () => void;
  onApply: (tier: string | null, notes: string) => void;
}) {
  const [tier, setTier] = useState<string | null>(draft.tier);
  const [notes, setNotes] = useState("");
  const count = draft.keywordIds.length;
  const clearing = draft.mode === "clear";
  // Rulable tiers: every band except the reserved Unvalued (clearing is how
  // a keyword returns to honest-unvalued).
  const options = metas.filter((meta) => meta.reserved !== "unvalued");

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" />
            {clearing ? "Clear your ruling" : "Rule the value tier"}
          </DialogTitle>
          <DialogDescription>
            {clearing ? (
              <>
                {count === 1 ? (
                  <>
                    <span className="font-medium text-foreground">
                      “{draft.label}”
                    </span>{" "}
                    goes back to what the arithmetic says
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {count} keywords
                    </span>{" "}
                    go back to what the arithmetic says
                  </>
                )}{" "}
                — computed where meaning reaches them, honestly Unvalued where
                it does not.
              </>
            ) : (
              <>
                Your ruling on{" "}
                <span className="font-medium text-foreground">
                  {count === 1 ? `“${draft.label}”` : `${count} keywords`}
                </span>{" "}
                beats every computed signal until you clear it.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!clearing ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Value tier</p>
            <Select value={tier ?? ""} onValueChange={(value) => setTier(value)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose a tier…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((meta) => (
                  <SelectItem key={meta.value} value={meta.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-px text-[10px] font-medium",
                          meta.chip,
                        )}
                      >
                        {meta.label}
                      </span>
                      {meta.description ? (
                        <span className="max-w-56 truncate text-xs text-muted-foreground">
                          {meta.description}
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">
            Why{" "}
            <span className="font-normal text-muted-foreground">
              (optional, travels with the ruling)
            </span>
          </p>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              clearing
                ? "Why the ruling no longer applies…"
                : "e.g. These are our highest-margin service inquiries."
            }
            className="min-h-16 text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || (!clearing && !tier)}
            onClick={() => onApply(clearing ? null : tier, notes.trim())}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {clearing
              ? `Clear ${count === 1 ? "ruling" : `${count} rulings`}`
              : `Apply to ${count === 1 ? "1 keyword" : `${count} keywords`}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
