"use client";

// app/(core)/podcast/studio/create-refine/_components/PipelineVisual.tsx
//
// The "understand the system" visual the brief asks for. It makes the whole
// production pipeline legible at a glance so a user knows what every option in
// the form actually feeds:
//
//   Idea → Source → Research → Enrich → Script → Enhance → Final script ──┬─► Audio
//                                                                          ├─► Cover art
//                                                                          ├─► Video
//                                                                          └─► Related content
//
// It is presentation-only: it drives no state and submits nothing. A compact
// summary rail is always visible; an "How it works" expander reveals the full
// stage-by-stage map with the fan-out of outputs. Lucide icons + semantic
// tokens only.

import { useState } from "react";
import {
  Lightbulb,
  Globe,
  FileSearch,
  FileText,
  Workflow,
  ChevronDown,
  ArrowRight,
  AudioLines,
  ImageIcon,
  Clapperboard,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Stage {
  icon: LucideIcon;
  label: string;
  detail: string;
  /** Wired today vs. a previewed capability. */
  live: boolean;
}

const STAGES: Stage[] = [
  {
    icon: Lightbulb,
    label: "Source",
    detail: "Your idea, notes, file, link, or transcript.",
    live: true,
  },
  {
    icon: Globe,
    label: "Research",
    detail: "Our agent reads the web and gathers sources.",
    live: true,
  },
  {
    icon: FileSearch,
    label: "Enrich",
    detail: "Clean, structure, fact-check and expand the material.",
    live: true,
  },
  {
    icon: FileText,
    label: "Script",
    detail: "A two-host dialogue in your language and format.",
    live: true,
  },
  {
    icon: Workflow,
    label: "Enhance",
    detail: "Polish tone, pacing and emphasis before recording.",
    live: false,
  },
];

interface Output {
  icon: LucideIcon;
  label: string;
  live: boolean;
}

const OUTPUTS: Output[] = [
  { icon: AudioLines, label: "Audio", live: true },
  { icon: ImageIcon, label: "Cover art", live: true },
  { icon: Clapperboard, label: "Video", live: true },
  { icon: LayoutGrid, label: "Related content", live: false },
];

export function PipelineVisual() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-2xl border border-border bg-card-textured shadow-sm"
    >
      {/* Always-visible summary rail: the five big stages, compact. */}
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30">
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex min-w-0 items-center gap-1.5">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-xs font-medium text-foreground">
                    {s.label}
                  </span>
                </span>
                {i < STAGES.length - 1 && (
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            );
          })}
        </div>
        <span className="flex flex-1 items-center gap-2 text-sm font-medium text-foreground sm:hidden">
          <Workflow className="h-4 w-4 text-primary" />
          How your episode is made
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          How it works
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border p-4 sm:p-5">
          {/* The pipeline: stages in a flowing row, then the fan-out of outputs. */}
          <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.label}
                  className="flex flex-1 items-start gap-2 sm:flex-col sm:items-stretch"
                >
                  <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {s.label}
                      </span>
                      {!s.live && (
                        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {s.detail}
                    </p>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span
                      className="flex shrink-0 items-center justify-center self-center px-1 text-muted-foreground/40 sm:px-0 sm:py-1"
                      aria-hidden
                    >
                      <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Fan-out: the final script becomes every deliverable. */}
          <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary/15 to-secondary/15 px-3 py-2 text-xs font-semibold text-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Final script
            </span>
            <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground/40 sm:rotate-0" />
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              {OUTPUTS.map((o) => {
                const Icon = o.icon;
                return (
                  <div
                    key={o.label}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-xs font-medium text-foreground">
                      {o.label}
                    </span>
                    {!o.live && (
                      <span className="ml-auto rounded-full bg-muted px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
