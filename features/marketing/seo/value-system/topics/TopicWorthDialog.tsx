"use client";

/**
 * What one topic is worth TO THIS SITE.
 *
 * Three things this screen must never blur:
 *  1. Worth is per-site. The topic is shared; the ruling is yours.
 *  2. A node with no ruling of its own INHERITS from its nearest ruled
 *     ancestor — the panel names that ancestor and its number, so the user can
 *     see they may not need to rule this node at all.
 *  3. "We do not offer this" / "we turn this work away" / "leads we do not
 *     want" are not a low score. They force every keyword under this node to
 *     Negative no matter the arithmetic — so the screen says exactly that,
 *     in those words, the moment one is chosen.
 */

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import {
  isNegativeGuard,
  LEAD_QUALITY_OPTIONS,
  SERVICE_MATCH_OPTIONS,
} from "./types";
import { DEFAULT_TOPIC_WEIGHT, type TopicTreeNode } from "./lib";

export function TopicWorthDialog({
  node,
  busy,
  onCancel,
  onSave,
  onClear,
}: {
  node: TopicTreeNode;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: {
    weight: number | null;
    leadQuality: string | null;
    serviceMatch: string | null;
    notes: string;
  }) => void;
  onClear: () => void;
}) {
  const own = node.ownWorth;
  const [weight, setWeight] = useState(
    own?.weight === null || own?.weight === undefined ? "" : String(own.weight),
  );
  const [leadQuality, setLeadQuality] = useState<string | null>(
    own?.lead_quality ?? null,
  );
  const [serviceMatch, setServiceMatch] = useState<string | null>(
    own?.service_match ?? null,
  );
  const [notes, setNotes] = useState(own?.notes ?? "");

  const parsedWeight = weight.trim() === "" ? null : Number(weight);
  const weightInvalid =
    parsedWeight !== null &&
    (Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 100);
  const guard = isNegativeGuard(leadQuality, serviceMatch);

  const inheritedWeight =
    node.inheritedWorth?.weight === null ||
    node.inheritedWorth?.weight === undefined
      ? null
      : Number(node.inheritedWorth.weight);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            What “{node.topic.name}” is worth to this site
          </DialogTitle>
          <DialogDescription>
            The topic is shared across every site. This ruling is yours alone,
            and it flows down to every topic beneath it.
          </DialogDescription>
        </DialogHeader>

        {/* What happens if this node has no ruling of its own. */}
        <div className="rounded border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CornerDownRight className="h-3 w-3" />
            With no ruling here
          </span>
          {node.inheritedFrom ? (
            <>
              this topic inherits{" "}
              <span className="font-semibold text-foreground">
                {inheritedWeight ?? DEFAULT_TOPIC_WEIGHT}
              </span>{" "}
              from{" "}
              <span className="font-semibold text-foreground">
                {node.inheritedFrom.name}
              </span>
              , the nearest parent above it that carries one.
              {isNegativeGuard(
                node.inheritedWorth?.lead_quality ?? null,
                node.inheritedWorth?.service_match ?? null,
              )
                ? " That parent is ruled negative, so keywords here never count as wins."
                : ""}
            </>
          ) : (
            <>
              no parent above this topic carries a ruling either, so the
              resolver falls back to its neutral default of{" "}
              <span className="font-semibold text-foreground">
                {DEFAULT_TOPIC_WEIGHT}
              </span>
              .
            </>
          )}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="topic-weight" className="text-xs">
              Worth, 0–100
            </Label>
            <Input
              id="topic-weight"
              inputMode="numeric"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder={String(node.effectiveWeight)}
              className={cn("h-9 w-28", weightInvalid && "border-destructive")}
            />
            <p className="text-[11px] text-muted-foreground">
              100 is your best work. 0 is worth nothing. Leave it blank to keep
              only the rulings below.
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
            options={SERVICE_MATCH_OPTIONS}
            value={serviceMatch}
            onChange={setServiceMatch}
          />

          {guard ? (
            <p className="flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Keywords under this never count as wins. This ruling forces
                every keyword beneath it to the Negative band, whatever the
                score says.
              </span>
            </p>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="topic-notes" className="text-xs">
              Why (optional, and worth writing)
            </Label>
            <Textarea
              id="topic-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="CRT and TV are consumer signals; corporations are where the money is."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !own}
            onClick={onClear}
            className="text-destructive hover:text-destructive"
          >
            Remove this site&apos;s ruling
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || weightInvalid}
              onClick={() =>
                onSave({
                  weight: parsedWeight,
                  leadQuality,
                  serviceMatch,
                  notes,
                })
              }
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-2 py-1 text-xs transition-colors",
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
