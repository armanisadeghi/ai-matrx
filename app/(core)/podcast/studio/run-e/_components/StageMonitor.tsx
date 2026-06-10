"use client";

// app/(core)/podcast/studio/run-e/_components/StageMonitor.tsx
//
// The central "monitor" of the production console — a single large surface that
// always shows what is happening RIGHT NOW, like a control-room screen:
//   • preparing/researching → the prepared source text streams in
//   • scripting             → the script preview types out
//   • metadata              → the title + description land
//   • images/video          → producing slots shimmer, then resolve to art
//   • audio                 → a live equalizer
// It reads straight off the real PodcastRunState so it stays honest.

import {
  FileSearch,
  Globe,
  FileText,
  LayoutGrid,
  ImageIcon,
  Clapperboard,
  AudioLines,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { stageKind, STAGE_KIND_COLOR } from "@/features/podcasts/generator/constants";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { Equalizer } from "./Equalizer";

export function StageMonitor({ state }: { state: PodcastRunState }) {
  const running = state.stages.filter((s) => s.status === "running");
  const focus = running[running.length - 1] ?? null;
  const kind = focus ? stageKind(focus.stage) : "other";
  const color = STAGE_KIND_COLOR[kind];

  // Decide the monitor's "channel".
  const producingImages =
    running.some((s) => s.stage.startsWith("image")) ||
    state.images.some((m) => m.status === "running");
  const producingVideo =
    running.some((s) => s.stage.startsWith("video")) ||
    state.videos.some((m) => m.status === "running");
  const producingAudio = running.some((s) => s.stage === "create_audio");
  const scripting = running.some((s) => s.stage === "create_script");
  const metadata = running.some((s) => s.stage === "generate_metadata");

  let channel: React.ReactNode;
  let header: { icon: LucideIcon; label: string };

  if (producingAudio) {
    header = { icon: AudioLines, label: "Producing the audio" };
    channel = <AudioChannel />;
  } else if (producingVideo) {
    header = { icon: Clapperboard, label: "Producing video clip" };
    channel = (
      <MediaChannel
        icon={Clapperboard}
        prompt={
          state.videos.find((v) => v.status === "running")?.prompt ??
          "Rendering motion…"
        }
        tone={color.text}
      />
    );
  } else if (producingImages) {
    header = { icon: ImageIcon, label: "Rendering cover art" };
    channel = (
      <MediaChannel
        icon={ImageIcon}
        prompt={
          state.images.find((i) => i.status === "running")?.prompt ??
          "Painting cover art…"
        }
        tone={color.text}
      />
    );
  } else if (metadata) {
    header = { icon: LayoutGrid, label: "Generating title & concepts" };
    channel = <MetadataChannel state={state} tone={color.text} />;
  } else if (scripting) {
    header = { icon: FileText, label: "Writing the script" };
    channel = <TextChannel text={state.scriptPreview} placeholder="Drafting the dialogue…" tone={color.text} />;
  } else if (focus?.stage.includes("research")) {
    header = { icon: Globe, label: "Researching the topic" };
    channel = <TextChannel text={state.sourcePreview} placeholder="Gathering and verifying sources…" tone={color.text} />;
  } else {
    header = { icon: FileSearch, label: focus?.label ?? "Preparing content" };
    channel = <TextChannel text={state.sourcePreview} placeholder="Reading and structuring your source…" tone={color.text} />;
  }

  const HeaderIcon = header.icon;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Monitor header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <span className={cn("relative flex h-2.5 w-2.5 shrink-0", color.text)}>
          <span className="runE-pulse-ring absolute inset-0 rounded-full" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-current" />
        </span>
        <HeaderIcon className={cn("h-4 w-4 shrink-0", color.text)} />
        <p className="truncate text-sm font-medium text-foreground">
          {header.label}
        </p>
        {focus && (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Step {focus.step} of {state.totalSteps || focus.total}
          </span>
        )}
      </div>

      {/* Channel content */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
        {channel}
      </div>
    </div>
  );
}

// ── Channels ────────────────────────────────────────────────────────────────

function TextChannel({
  text,
  placeholder,
  tone,
}: {
  text: string;
  placeholder: string;
  tone: string;
}) {
  if (!text) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="runE-shimmer relative h-3.5 overflow-hidden rounded bg-muted"
            style={{ width: `${[92, 100, 84, 60][i]}%` }}
          />
        ))}
        <p className={cn("pt-2 text-xs", tone)}>{placeholder}</p>
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
      {text}
      <span className={cn("ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current", tone)} />
    </p>
  );
}

function MetadataChannel({
  state,
  tone,
}: {
  state: PodcastRunState;
  tone: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Title
        </p>
        {state.title ? (
          <h3 className="text-lg font-semibold leading-snug text-foreground">
            {state.title}
          </h3>
        ) : (
          <div className="runE-shimmer relative mt-1 h-5 w-3/4 overflow-hidden rounded bg-muted" />
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </p>
        {state.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {state.description}
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            <div className="runE-shimmer relative h-3.5 w-full overflow-hidden rounded bg-muted" />
            <div className="runE-shimmer relative h-3.5 w-5/6 overflow-hidden rounded bg-muted" />
          </div>
        )}
      </div>
      <p className={cn("text-xs", tone)}>Designing cover &amp; video concepts…</p>
    </div>
  );
}

function MediaChannel({
  icon: Icon,
  prompt,
  tone,
}: {
  icon: LucideIcon;
  prompt: string;
  tone: string;
}) {
  return (
    <div className="space-y-3">
      <div className="runE-shimmer relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted via-card to-muted">
        <Icon className={cn("h-10 w-10", tone)} />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Prompt: </span>
        {prompt}
      </p>
    </div>
  );
}

function AudioChannel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-emerald-500">
      <div className="flex h-20 items-center">
        <Equalizer bars={9} className="h-full text-emerald-500" />
      </div>
      <p className="text-sm font-medium text-foreground">
        Mixing the two-host audio track
      </p>
      <p className="text-xs text-muted-foreground">
        Voices, pacing, and emphasis are being rendered.
      </p>
    </div>
  );
}
