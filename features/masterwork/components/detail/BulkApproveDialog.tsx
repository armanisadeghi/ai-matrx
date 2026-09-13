"use client";

// features/masterwork/components/detail/BulkApproveDialog.tsx
//
// 🚨 A BULK APPROVE THAT CANNOT LIE (2026-09-12).
//
// What it replaced: "Approve all", a button with no selection, no count and no
// record. On the one Rulebook where the volume actually occurred it fired on
// all 416 rules (Newsroom Desk: 416 rules, zero drafts), and on Watson's 206
// twice — each recorded as a cheat. The rules it touched were then
// indistinguishable on screen from 416 rules a person had read.
//
// This dialog does the two things the design's attack found were missing:
//
//   1. it NAMES every `disagrees_with` pair in the selection before anything
//      fires. Approving both sides of a disagreement in one gesture, without
//      reading either, is precisely the consensus collapse the whole lane
//      exists to prevent — so the pair is shown, by name, above the button;
//   2. it asks how many of the batch were actually read, and writes that number
//      onto every rule (`reviewed: {mode: "sampled", sample_size, of}`), which
//      is what lets each rule say "approved in bulk, 12 of 416 read" on its own
//      face afterwards.
//
// The read count is NOT a gate. An Expert who read none of them can say zero
// and proceed; the point is that the Rulebook records what happened rather than
// pretending. Nothing fails silently, and nothing here refuses the Expert.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { AlertTriangle } from "lucide-react";
import type { RulebookRule } from "../../types";

export function BulkApproveDialog({
  open,
  onOpenChange,
  rules,
  pairs,
  readCount,
  onReadCountChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected rules that are actually waiting on the Expert. */
  rules: RulebookRule[];
  /** `disagrees_with` pairs BOTH of whose sides are in this selection. */
  pairs: [RulebookRule, RulebookRule][];
  readCount: string;
  onReadCountChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const total = rules.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve {total} selected rules?</DialogTitle>
          <DialogDescription>
            They stop waiting on you and start powering every Masterwork built
            from this Rulebook.
          </DialogDescription>
        </DialogHeader>

        {pairs.length > 0 ? (
          <div
            className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3"
            data-testid="bulk-approve-disagreements"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              {pairs.length === 1
                ? "This selection contains a disagreement"
                : `This selection contains ${pairs.length} disagreements`}
            </div>
            <p className="text-xs text-muted-foreground">
              Both sides are in what you are about to approve. That is allowed —
              two positions that disagree can both be yours — but it should be a
              choice you made, not one you swept up.
            </p>
            <ul className="space-y-1.5">
              {pairs.map(([a, b]) => (
                <li key={`${a.id}|${b.id}`} className="text-xs">
                  <span className="font-medium text-foreground">{a.name}</span>
                  <span className="text-muted-foreground"> disagrees with </span>
                  <span className="font-medium text-foreground">{b.name}</span>
                  {a.relates_to?.find(
                    (r) => r.rule_id === b.id && r.kind === "disagrees_with",
                  )?.condition ? (
                    <span className="block text-muted-foreground">
                      Separated by:{" "}
                      {
                        a.relates_to.find(
                          (r) =>
                            r.rule_id === b.id && r.kind === "disagrees_with",
                        )?.condition
                      }
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor="bulk-approve-read-count"
            className="text-sm font-medium text-foreground"
          >
            How many of these {total} did you actually read?
          </label>
          <Input
            id="bulk-approve-read-count"
            inputMode="numeric"
            value={readCount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onReadCountChange(e.target.value)
            }
            placeholder="0"
            className="max-w-28"
          />
          <p className="text-xs text-muted-foreground">
            Every rule you approve here will say “approved in bulk,{" "}
            {Math.max(0, Math.min(total, Number.parseInt(readCount, 10) || 0))}{" "}
            of {total} read”, so nobody later mistakes this for {total}{" "}
            decisions. Zero is a perfectly honest answer.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Approve {total} rules</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
