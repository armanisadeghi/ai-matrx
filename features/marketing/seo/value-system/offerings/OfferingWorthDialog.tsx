"use client";

/**
 * What one offering is worth TO THIS SITE, in points (brand-offerings D9).
 *
 * Three things this dialog never blurs:
 *  1. The offering belongs to the brand; the worth ruling belongs to this site.
 *  2. With no ruling of its own, an offering takes its worth from the nearest
 *     offering above it that has one; the dialog names that offering and its
 *     points, so the person can see they may not need a ruling here at all.
 *  3. "We do not offer this", "we turn this work away" and "leads we do not
 *     want" are not a low score. They force every keyword beneath this offering
 *     to Negative, and the dialog says so the moment one is chosen.
 */

import { useState, type ReactNode } from "react";
import { CornerDownRight, Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/styles/themes/utils";
import { isNegativeRuling, type CatalogNode } from "./catalog-tree";
import {
  LEAD_QUALITY_OPTIONS,
  OFFERING_MATCH_OPTIONS,
  formatPoints,
} from "./vocabulary";

export interface OfferingWorthValues {
  worthPoints: number;
  leadQuality: string | null;
  offeringMatch: string | null;
  notes: string;
}

export function OfferingWorthDialog({
  node,
  inheritedFrom,
  busy,
  onCancel,
  onSave,
  onClear,
}: {
  node: CatalogNode;
  /** The nearest ANCESTOR (never self) carrying a ruling on this site. */
  inheritedFrom: CatalogNode | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: OfferingWorthValues) => void;
  onClear: () => void;
}) {
  const own = node.offering;
  const hasOwn = own.worthPoints !== null;
  const [points, setPoints] = useState(hasOwn ? String(own.worthPoints) : "");
  const [leadQuality, setLeadQuality] = useState<string | null>(own.leadQuality);
  const [offeringMatch, setOfferingMatch] = useState<string | null>(own.offeringMatch);
  const [notes, setNotes] = useState(own.worthNotes ?? "");

  const trimmed = points.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const invalid = parsed === null || !Number.isFinite(parsed);
  const negative = isNegativeRuling(leadQuality, offeringMatch);
  const inherited = inheritedFrom?.offering ?? null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-base">
            What “{own.name}” is worth to this site
          </DialogTitle>
          <DialogDescription>
            The offering belongs to the brand. This ruling is this site&apos;s
            alone, and it flows down to every offering beneath it that has no
            ruling of its own.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CornerDownRight className="h-3 w-3" />
            With no ruling here
          </span>
          {inherited ? (
            <>
              keywords on this offering take{" "}
              <span className="font-semibold text-foreground">
                {formatPoints(inherited.worthPoints)} points
              </span>{" "}
              from{" "}
              <span className="font-semibold text-foreground">{inherited.name}</span>
              , the nearest offering above it that carries one.
              {isNegativeRuling(inherited.leadQuality, inherited.offeringMatch)
                ? " That offering is ruled negative, so keywords here never count as wins."
                : ""}
            </>
          ) : (
            <>
              no offering above this one carries a ruling either, so its
              keywords get the site baseline and nothing added.
            </>
          )}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="offering-worth-points" className="text-xs">
              Points added to the baseline
            </Label>
            <Input
              id="offering-worth-points"
              inputMode="decimal"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder={inherited ? String(inherited.worthPoints) : "0"}
              className={cn(
                "h-9 w-32 text-base sm:text-sm",
                trimmed !== "" && invalid && "border-destructive",
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              Every keyword placed on this offering, or beneath it, starts at
              the site baseline plus these points. Use a negative number to
              count it down. There is no upper limit.
            </p>
          </div>

          <OptionRow
            label="How good are these leads?"
            options={LEAD_QUALITY_OPTIONS}
            value={leadQuality}
            onChange={setLeadQuality}
          />
          <OptionRow
            label="Do you actually do this?"
            options={OFFERING_MATCH_OPTIONS}
            value={offeringMatch}
            onChange={setOfferingMatch}
          />

          {negative ? (
            <p className="flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Keywords under this never count as wins. This ruling forces
                every keyword beneath it to the Negative level, whatever the
                points say.
              </span>
            </p>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="offering-worth-notes" className="text-xs">
              Why is it worth this?
            </Label>
            <ProTextarea
              id="offering-worth-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Enterprise work is where the money is; household drop-off costs more than it earns."
              rows={2}
              className="text-base sm:text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Kept with the ruling, so the next person and every agent reads
              your reason instead of guessing it.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 pb-safe sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !hasOwn}
            onClick={onClear}
            className={cn("text-destructive hover:text-destructive", !hasOwn && "invisible")}
            title={
              inherited
                ? `Its keywords then take ${formatPoints(inherited.worthPoints)} points from ${inherited.name}.`
                : "Its keywords then get the site baseline only."
            }
          >
            Remove this site&apos;s ruling
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || invalid}
              onClick={() =>
                parsed !== null &&
                onSave({ worthPoints: parsed, leadQuality, offeringMatch, notes })
              }
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string; guard?: boolean }[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        <Chip selected={value === null} onClick={() => onChange(null)}>
          Not said
        </Chip>
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={value === option.value}
            guard={option.guard}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  selected,
  guard,
  onClick,
  children,
}: {
  selected: boolean;
  guard?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-9 rounded border px-2 py-1 text-xs transition-colors sm:min-h-0",
        selected
          ? guard
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}
