"use client";

/**
 * The Build-with-AI intake — a FEW quick questions answered as HINTS, never
 * commitments. The user does not pick a structure here: the Shape Planner
 * decides from the research evidence, steered (not bound) by these answers.
 * Submitting runs the whole bounded flow — research first when none exists,
 * then shape → counts → names → topics, all STAGED; nothing touches the live
 * plan until the user reviews the routes and hits "Create N pages".
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { DEFAULT_SETUP_GUIDANCE, type SetupGuidance } from "../ai";

const SIZE_OPTIONS: Array<{
  value: SetupGuidance["sizeHint"];
  label: string;
  hint: string;
}> = [
  { value: "ai", label: "Let the AI decide", hint: "from the research" },
  { value: "micro", label: "Micro", hint: "~5-8 pages" },
  { value: "small", label: "Small", hint: "~10-15 pages" },
  { value: "medium", label: "Medium", hint: "~18-30 pages" },
  { value: "large", label: "Large", hint: "30+ pages" },
];

const LOCATION_OPTIONS: Array<{
  value: SetupGuidance["locationsHint"];
  label: string;
}> = [
  { value: "ai", label: "Let the AI decide" },
  { value: "single", label: "Single location" },
  { value: "multiple", label: "Multiple locations" },
];

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
              value === option.value
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.hint ? (
              <span className="ml-1 text-[11px] opacity-70">{option.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BuildWithAiDialog({
  open,
  onOpenChange,
  siteName,
  reportReady,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteName: string;
  /** A research report is already loaded — no pipeline run needed. */
  reportReady: boolean;
  busy: boolean;
  onSubmit: (guidance: SetupGuidance) => void;
}) {
  const [guidance, setGuidance] = useState<SetupGuidance>(DEFAULT_SETUP_GUIDANCE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Build {siteName} with AI</DialogTitle>
          <DialogDescription>
            Answer what you know — everything here is a hint, not a commitment.
            The AI reads the research, picks the shape and counts, names the
            pages, and stages it all for your review. Nothing is created until
            you approve the routes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ChoiceRow
            label="How big should this site feel?"
            options={SIZE_OPTIONS}
            value={guidance.sizeHint}
            onChange={(sizeHint) => setGuidance((g) => ({ ...g, sizeHint }))}
            disabled={busy}
          />
          <ChoiceRow
            label="Locations"
            options={LOCATION_OPTIONS}
            value={guidance.locationsHint}
            onChange={(locationsHint) =>
              setGuidance((g) => ({ ...g, locationsHint }))
            }
            disabled={busy}
          />
          {guidance.locationsHint === "multiple" ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Roughly how many?</p>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                value={guidance.locationCount}
                placeholder="e.g. 4"
                disabled={busy}
                className="h-7 w-24 px-2 text-base sm:text-sm"
                onChange={(event) =>
                  setGuidance((g) => ({ ...g, locationCount: event.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                (optional — the AI can count them)
              </p>
            </div>
          ) : null}
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">
              Anything to emphasize, avoid, or that the AI should know?
            </p>
            <Textarea
              value={guidance.notes}
              disabled={busy}
              rows={3}
              placeholder="e.g. Lead with commercial services; skip pricing pages; the Phoenix office is closing."
              className="text-base sm:text-sm"
              onChange={(event) =>
                setGuidance((g) => ({ ...g, notes: event.target.value }))
              }
            />
          </div>
          {!reportReady ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-foreground">
              No research report is loaded, so this will FIRST research the
              company (full pipeline — several minutes, real AI credits), then
              build the work order from the report. Keep this tab open.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onSubmit(guidance)}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {reportReady ? "Build it" : "Research + build it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
