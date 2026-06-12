"use client";

// app/(core)/podcast/studio/create-e/_components/EpisodePreview.tsx
//
// The right rail — a LIVE artifact preview of the episode you're about to make.
// As the user configures, this renders the thing they'll get: a cover slot, a
// derived title, format/language/host badges, and a production manifest of the
// assets that will be produced. Modeled after Spotify for Podcasters' episode
// card preview — turning configuration into "watching it take shape".

import {
  Mic,
  Languages,
  Users,
  ImageIcon,
  Clapperboard,
  FileText,
  AudioLines,
  Telescope,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_OPTIONS,
  FORMAT_OPTIONS,
  SOURCE_OPTIONS,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastLanguageCode,
  PodcastFormat,
  PodcastSourceKind,
} from "@/features/podcasts/generator/types";
import { MOCK_SHOWS } from "../_mock/shows";

interface Props {
  title: string;
  sourceKind: PodcastSourceKind;
  language: PodcastLanguageCode;
  format: PodcastFormat;
  hostCount: string;
  showId: string | null;
  hasSource: boolean;
}

export function EpisodePreview({
  title,
  sourceKind,
  language,
  format,
  hostCount,
  showId,
  hasSource,
}: Props) {
  const fmt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const lang = LANGUAGE_OPTIONS.find((l) => l.code === language)!;
  const source = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const show = MOCK_SHOWS.find((s) => s.id === showId);
  const hostLabel =
    hostCount === "4-20"
      ? "4–20"
      : `${hostCount} ${Number(hostCount) === 1 ? "host" : "hosts"}`;

  const manifest = [
    { icon: Telescope, label: "Research & script", tone: "text-blue-500" },
    { icon: FileText, label: "Show notes", tone: "text-pink-500" },
    { icon: ImageIcon, label: "Cover art ×2", tone: "text-fuchsia-500" },
    { icon: Clapperboard, label: "Video clip", tone: "text-orange-500" },
    { icon: AudioLines, label: "Two-host audio", tone: "text-emerald-500" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Radio className="h-3.5 w-3.5 text-primary" />
        Live preview
      </p>

      {/* The episode card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Cover slot */}
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-primary/15 via-muted to-card">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass">
              <ImageIcon className="h-7 w-7 text-muted-foreground" />
            </div>
          </div>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-glass-edge bg-glass px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur-glass backdrop-saturate-glass">
            <fmt.icon className="h-3 w-3 text-primary" />
            {fmt.label}
          </span>
        </div>

        {/* Title + meta */}
        <div className="space-y-3 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {show ? show.title : "Matrx Mix"}
            </p>
            <h3
              className={cn(
                "mt-0.5 line-clamp-2 text-sm font-semibold leading-snug",
                title ? "text-foreground" : "text-muted-foreground/60 italic",
              )}
            >
              {title || "Your episode title will appear here"}
            </h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <MetaBadge icon={Languages} label={lang.label} />
            <MetaBadge icon={Users} label={hostLabel} />
            <MetaBadge icon={source.icon} label={source.label.replace(/^From (an? )?/i, "")} />
          </div>
        </div>
      </div>

      {/* Production manifest */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Will produce
        </p>
        <ul className="space-y-2">
          {manifest.map((m) => (
            <li key={m.label} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                <m.icon className={cn("h-3.5 w-3.5", m.tone)} />
              </span>
              <span className="text-sm text-foreground">{m.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Readiness hint */}
      <div
        className={cn(
          "rounded-xl border px-3.5 py-3 text-xs leading-snug",
          hasSource
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted/30 text-muted-foreground",
        )}
      >
        {hasSource ? (
          <span className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 shrink-0" />
            Ready to generate. Estimated 5–15 min.
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 shrink-0" />
            Add your source to begin.
          </span>
        )}
      </div>
    </div>
  );
}

function MetaBadge({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}
