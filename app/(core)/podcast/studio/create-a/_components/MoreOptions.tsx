"use client";

// app/(core)/podcast/studio/create-a/_components/MoreOptions.tsx
//
// One disclosure that holds everything a power user wants but a typical user
// shouldn't have to see first: the two processing pipelines, the extra
// instructions, the show blurb, and test mode. Processing options are
// first-class toggleable chips (not disabled placeholders) — this is the new
// UI, every feature is live.

import { useState } from "react";
import {
  ChevronDown,
  SlidersHorizontal,
  Workflow,
  ArrowRight,
  FlaskConical,
  Check,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import {
  PRE_SCRIPT_PROCESSING_OPTIONS,
  POST_SCRIPT_PROCESSING_OPTIONS,
} from "@/features/podcasts/generator/constants";

interface MoreOptionsProps {
  preProcessing: string[];
  onPreProcessing: (next: string[]) => void;
  postProcessing: string[];
  onPostProcessing: (next: string[]) => void;
  prepMessage: string;
  onPrepMessage: (v: string) => void;
  firstShowInfo: string;
  onFirstShowInfo: (v: string) => void;
  truncate: boolean;
  onTruncate: (v: boolean) => void;
}

export function MoreOptions({
  preProcessing,
  onPreProcessing,
  postProcessing,
  onPostProcessing,
  prepMessage,
  onPrepMessage,
  firstShowInfo,
  onFirstShowInfo,
  truncate,
  onTruncate,
}: MoreOptionsProps) {
  const [open, setOpen] = useState(false);

  const activeCount =
    preProcessing.length +
    postProcessing.length +
    (prepMessage.trim() ? 1 : 0) +
    (firstShowInfo.trim() ? 1 : 0);

  const toggle = (
    list: string[],
    setter: (next: string[]) => void,
    value: string,
  ) =>
    setter(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/50">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          More options
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 space-y-4 rounded-xl border border-border bg-card p-4">
        {/* Processing pipelines */}
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Workflow className="h-3.5 w-3.5" />
            Processing
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProcessingLayer
              caption="Source"
              target="Script"
              options={PRE_SCRIPT_PROCESSING_OPTIONS}
              selected={preProcessing}
              onToggle={(v) => toggle(preProcessing, onPreProcessing, v)}
            />
            <ProcessingLayer
              caption="Script"
              target="Audio"
              options={POST_SCRIPT_PROCESSING_OPTIONS}
              selected={postProcessing}
              onToggle={(v) => toggle(postProcessing, onPostProcessing, v)}
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border/70 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Extra instruction to the research / extraction agent
            </Label>
            <ProTextarea
              value={prepMessage}
              onChange={(e) => onPrepMessage(e.target.value)}
              placeholder="Optional — e.g. focus on the practical takeaways"
              rows={2}
              showCopyButton={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Show intro / blurb
            </Label>
            <ProTextarea
              value={firstShowInfo}
              onChange={(e) => onFirstShowInfo(e.target.value)}
              placeholder="Optional — a short intro for the show"
              rows={2}
              showCopyButton={false}
            />
          </div>

          {/* Test mode */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
              <FlaskConical className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="truncate-toggle-a"
                  className="text-sm font-medium text-foreground"
                >
                  Test mode — short audio
                </Label>
                <Switch
                  id="truncate-toggle-a"
                  checked={truncate}
                  onCheckedChange={onTruncate}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Trims audio to ~one line per host so runs stay fast and cheap.
                Script, cover art, and videos are always full quality.
              </p>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessingLayer({
  caption,
  target,
  options,
  selected,
  onToggle,
}: {
  caption: string;
  target: string;
  options: { value: string; label: string; helper: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
          {caption}
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
          {target}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.helper}
              onClick={() => onToggle(o.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
