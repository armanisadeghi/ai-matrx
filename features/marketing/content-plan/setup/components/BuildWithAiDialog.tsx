"use client";

/**
 * The Build-with-AI intake AND live progress view — a FEW quick questions
 * answered as HINTS (never commitments), then the dialog STAYS OPEN as a live
 * activity feed while the run happens: research stream events and draft
 * milestones append in real time, so the user watches the work instead of
 * staring at a spinner. Closing mid-run is allowed — the run continues and
 * the AI bar keeps showing status.
 *
 * The user does not pick a structure here: the Shape Planner decides from the
 * research evidence, steered by these answers. Nothing touches the live plan
 * until the user reviews the routes and hits "Create N pages".
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

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

import { ResearchTopicSelect } from "../../components/ResearchTopicSelect";
import { DEFAULT_SETUP_GUIDANCE, type SetupGuidance } from "../ai";

export interface BuildLogEntry {
  text: string;
  done: boolean;
}

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

/** The live feed — every step visible, newest active, auto-scrolled. */
function ActivityFeed({
  log,
  busy,
  failed,
}: {
  log: BuildLogEntry[];
  busy: boolean;
  failed: boolean;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [log.length]);
  return (
    <div
      className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 px-2.5 py-2"
      aria-live="polite"
      aria-label="Build activity"
    >
      {log.map((entry, index) => {
        const last = index === log.length - 1;
        const active = busy && last && !entry.done;
        const isFailure = failed && last && !busy;
        return (
          <div
            key={`${index}-${entry.text}`}
            className={cn(
              "flex items-start gap-1.5 text-xs leading-relaxed",
              isFailure
                ? "font-medium text-destructive"
                : active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {isFailure ? (
              <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
            ) : active ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" />
            ) : (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
            )}
            <span className="min-w-0">{entry.text}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

export function BuildWithAiDialog({
  open,
  onOpenChange,
  siteName,
  reportReady,
  reportPending = false,
  selectedTopicId,
  onSelectTopic,
  log,
  failed = false,
  onReset,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteName: string;
  /** A research report is already loaded — no pipeline run needed. */
  reportReady: boolean;
  /**
   * A topic IS selected but no report is in memory (still loading, or the
   * topic may genuinely have none). The build checks the DB first and only
   * runs new research if no finished report exists.
   */
  reportPending?: boolean;
  /** The site's linked research topic — pickable RIGHT HERE, no cancel-out. */
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  /** The live activity feed (SetupView owns it — it outlives this dialog). */
  log: BuildLogEntry[];
  /** The last run ended in an error (its message is the feed's last line). */
  failed?: boolean;
  /** Clear the finished/failed feed so the intake questions come back. */
  onReset: () => void;
  busy: boolean;
  onSubmit: (guidance: SetupGuidance) => void;
}) {
  const [guidance, setGuidance] = useState<SetupGuidance>(DEFAULT_SETUP_GUIDANCE);
  const finished = !busy && log.length > 0 && !failed;
  const errored = !busy && log.length > 0 && Boolean(failed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Build {siteName} with AI</DialogTitle>
          <DialogDescription>
            {busy
              ? "Building — watch every step below. Closing this window does not stop the run."
              : errored
                ? "The build stopped — the last step below says why. Nothing broken was staged; you can try again."
                : finished
                  ? "Done — the drafted work order is staged. Review the routes on the right, then Create pages."
                  : "Answer what you know — everything here is a hint, not a commitment. The AI reads the research, picks the shape and counts, names the pages, and stages it all for your review. Nothing is created until you approve the routes."}
          </DialogDescription>
        </DialogHeader>

        {log.length > 0 ? (
          <ActivityFeed log={log} busy={busy} failed={errored} />
        ) : null}

        {!busy && !finished && !errored ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">
                Ground it in research
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ResearchTopicSelect
                  value={selectedTopicId}
                  onChange={onSelectTopic}
                  ariaLabel="Research topic grounding this build"
                />
                <span className="text-[11px] text-muted-foreground">
                  {reportReady
                    ? "Report loaded — the build starts immediately."
                    : reportPending
                      ? "Selected — the build uses its report if one is finished."
                      : "None selected — the AI researches the company first."}
                </span>
              </div>
            </div>
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
                    setGuidance((g) => ({
                      ...g,
                      locationCount: event.target.value,
                    }))
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
                {reportPending
                  ? "The build uses the selected topic's finished report if one exists, and only runs NEW research (several minutes, real AI credits) if none does. Keep this tab open."
                  : "No research is linked, so this will FIRST research the company (full pipeline — several minutes, real AI credits), then build the work order from the report. You can watch every step here."}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {busy
              ? "Hide (keeps running)"
              : finished || errored
                ? "Close"
                : "Cancel"}
          </Button>
          {!busy && !finished && !errored ? (
            <Button size="sm" onClick={() => onSubmit(guidance)}>
              {reportReady || reportPending ? "Build it" : "Research + build it"}
            </Button>
          ) : null}
          {errored ? (
            <Button size="sm" onClick={onReset}>
              Try again
            </Button>
          ) : null}
          {finished ? (
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Review the routes
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
