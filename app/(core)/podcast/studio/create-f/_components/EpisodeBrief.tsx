"use client";

// app/(core)/podcast/studio/create-f/_components/EpisodeBrief.tsx
//
// The right-pane "live brief" — a sticky preview of the episode the user is
// about to make. It fills in as the form is configured (the thing you're
// building, shown back to you), then carries the primary Generate action. This
// is what makes the composer feel like a studio rather than a settings form.

import {
  Mic,
  Languages,
  Users,
  Clock3,
  AudioLines,
  Disc3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  FORMAT_OPTIONS,
  HOST_OPTIONS,
  LENGTH_OPTIONS,
} from "../_mock/options";
import type { MockShow } from "../_mock/shows";
import type { EpisodeDraft } from "./types";

const TINT: Record<MockShow["tint"], string> = {
  primary: "bg-primary/15 text-primary",
  sky: "bg-sky-500/15 text-sky-500",
  violet: "bg-violet-500/15 text-violet-500",
  emerald: "bg-emerald-500/15 text-emerald-500",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
};

export function EpisodeBrief({
  draft,
  shows,
  canGenerate,
  busy,
  onGenerate,
}: {
  draft: EpisodeDraft;
  shows: MockShow[];
  canGenerate: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  const source = SOURCE_OPTIONS.find((s) => s.kind === draft.sourceKind);
  const language = LANGUAGE_OPTIONS.find((l) => l.code === draft.language);
  const format = FORMAT_OPTIONS.find((f) => f.value === draft.format);
  const hosts = HOST_OPTIONS.find((h) => h.value === draft.hosts);
  const length = LENGTH_OPTIONS.find((l) => l.value === draft.length);
  const show = shows.find((s) => s.id === draft.showId);

  // A derived "title" preview from the source text, like the studio sketching it.
  const titleGuess =
    draft.sourceText.trim().length > 0
      ? draft.sourceText.trim().slice(0, 64) + (draft.sourceText.trim().length > 64 ? "…" : "")
      : "Your episode title appears here";

  return (
    <div className="lg:sticky lg:top-4 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-glass-edge bg-glass backdrop-blur-glass backdrop-saturate-glass shadow-glass">
        {/* Cover preview */}
        <div className="relative flex aspect-video items-end overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/30 p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
              <Disc3 className="h-3 w-3" />
              Episode preview
            </span>
            <p
              className={cn(
                "mt-2 max-w-[24ch] text-balance text-base font-semibold leading-snug",
                draft.sourceText.trim() ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {titleGuess}
            </p>
          </div>
        </div>

        {/* Spec rows */}
        <div className="space-y-px bg-border/60">
          <SpecRow icon={source?.icon ?? Mic} label="Source" value={source?.label ?? "—"} />
          <SpecRow
            icon={format?.icon ?? AudioLines}
            label="Format"
            value={format?.label ?? "—"}
          />
          <SpecRow
            icon={Languages}
            label="Language"
            value={language ? `${language.label}` : "—"}
            sub={language?.native}
          />
          <SpecRow icon={Users} label="Hosts" value={hosts?.label ?? "—"} sub={hosts?.helper} />
          <SpecRow icon={Clock3} label="Length" value={length?.label ?? "—"} sub={length?.helper} />
          {show && (
            <div className="flex items-center gap-2.5 bg-card px-4 py-2.5">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  TINT[show.tint],
                )}
              >
                {show.title.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Publishing to
                </p>
                <p className="truncate text-sm font-medium text-foreground">{show.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="space-y-2 bg-card p-4">
          <Button
            size="lg"
            className="w-full gap-2 shadow-md"
            disabled={!canGenerate || busy}
            onClick={onGenerate}
          >
            <AudioLines className="h-4.5 w-4.5" />
            {busy ? "Starting…" : "Generate episode"}
          </Button>
          {!canGenerate && !busy && (
            <p className="text-center text-[11px] text-muted-foreground">
              Add your source material to begin.
            </p>
          )}
          {draft.testMode && canGenerate && !busy && (
            <p className="text-center text-[11px] text-amber-600 dark:text-amber-500">
              Test mode on — short sample audio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SpecRow({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-4 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto flex items-baseline gap-1.5 text-right">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}
