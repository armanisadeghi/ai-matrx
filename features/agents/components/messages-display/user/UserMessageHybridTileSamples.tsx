"use client";

/**
 * Hybrid attachment tile samples — input-bar colors + old-chat tile shape.
 * Dev gallery only; pick a variant before wiring into AgentUserMessage.
 */

import { createElement, type ComponentType } from "react";
import {
  Globe,
  StickyNote,
  CheckSquare,
  Youtube,
  Image as ImageIcon,
  Music,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoAttachmentSpec } from "./userMessageChipsDemoData";

const TILE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  webpage: Globe,
  note: StickyNote,
  task: CheckSquare,
  youtube: Youtube,
  "image-legacy": ImageIcon,
  "audio-legacy": Music,
  "doc-legacy": FileText,
};

/** Input-bar palette (SmartAgentResourceChips) — no per-type colored borders. */
const INPUT_TILE_THEME: Record<string, { bg: string; icon: string }> = {
  note: {
    bg: "bg-orange-100 dark:bg-orange-950/30",
    icon: "text-orange-600 dark:text-orange-400",
  },
  task: {
    bg: "bg-blue-100 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
  },
  webpage: {
    bg: "bg-teal-100 dark:bg-teal-950/30",
    icon: "text-teal-600 dark:text-teal-400",
  },
  "image-legacy": {
    bg: "bg-blue-100 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
  },
  "audio-legacy": {
    bg: "bg-pink-100 dark:bg-pink-950/30",
    icon: "text-pink-600 dark:text-pink-400",
  },
  youtube: {
    bg: "bg-red-100 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
  },
};

/** Shared shell — every variant uses the same radius, border, and shadow. */
const TILE_SHELL =
  "rounded-lg border border-border/60 overflow-hidden shrink-0 cursor-default transition-colors hover:brightness-[0.98] dark:hover:brightness-110 shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset,0_1px_2px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

function truncateLabel(label: string, max = 14) {
  return label.length <= max ? label : `${label.slice(0, max)}…`;
}

function tileTheme(spec: DemoAttachmentSpec) {
  return INPUT_TILE_THEME[spec.id] ?? INPUT_TILE_THEME.note;
}

function TileIcon({
  spec,
  className,
}: {
  spec: DemoAttachmentSpec;
  className?: string;
}) {
  const Icon = TILE_ICONS[spec.id] ?? FileText;
  const theme = tileTheme(spec);
  return createElement(Icon, {
    className: cn("shrink-0", theme.icon, className),
  });
}

/** A — Stacked: icon/thumb top, label band bottom. 72×72 uniform. */
function HybridTileStacked({ spec }: { spec: DemoAttachmentSpec }) {
  const theme = tileTheme(spec);
  const isImage = spec.id === "image-legacy";

  return (
    <button
      type="button"
      title={spec.title}
      className={cn(
        TILE_SHELL,
        "w-[4.5rem] h-[4.5rem] flex flex-col",
        theme.bg,
      )}
    >
      <div className="flex-1 flex items-center justify-center min-h-0 p-1.5">
        {isImage ? (
          <div className="h-full w-full rounded-md bg-gradient-to-br from-blue-200/80 to-indigo-300/60 dark:from-blue-800/50 dark:to-indigo-900/40 flex items-center justify-center">
            <ImageIcon className={cn("h-5 w-5", theme.icon)} />
          </div>
        ) : (
          <TileIcon spec={spec} className="h-5 w-5" />
        )}
      </div>
      <div className="px-1.5 py-1 border-t border-border/40 bg-background/30 dark:bg-black/10">
        <span className="block text-[10px] leading-tight font-medium text-foreground text-center truncate">
          {truncateLabel(spec.title, 12)}
        </span>
      </div>
    </button>
  );
}

/** B — Horizontal: icon left, title right. Fixed 7rem × 2.75rem. */
function HybridTileHorizontal({ spec }: { spec: DemoAttachmentSpec }) {
  const theme = tileTheme(spec);

  return (
    <button
      type="button"
      title={spec.title}
      className={cn(
        TILE_SHELL,
        "w-[7rem] h-11 flex items-center gap-2 px-2",
        theme.bg,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/40 dark:bg-black/15">
        <TileIcon spec={spec} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[9px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">
          {spec.label}
        </span>
        <span className="block text-[10px] font-medium text-foreground leading-tight truncate">
          {truncateLabel(spec.title, 16)}
        </span>
      </span>
    </button>
  );
}

/** C — Wide card: type + title on two lines, icon in corner. 8.5rem × 3rem. */
function HybridTileWide({ spec }: { spec: DemoAttachmentSpec }) {
  const theme = tileTheme(spec);

  return (
    <button
      type="button"
      title={spec.title}
      className={cn(
        TILE_SHELL,
        "w-[8.5rem] h-12 flex items-start gap-2 p-2 text-left",
        theme.bg,
      )}
    >
      <TileIcon spec={spec} className="h-4 w-4 mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-medium text-muted-foreground leading-none">
          {spec.label}
        </span>
        <span className="block text-[11px] font-medium text-foreground leading-snug line-clamp-2 mt-1">
          {truncateLabel(spec.title, 22)}
        </span>
      </span>
    </button>
  );
}

/** D — Square thumb + caption: 64×64 visual, label below tile (outside border). */
function HybridTileCaption({ spec }: { spec: DemoAttachmentSpec }) {
  const theme = tileTheme(spec);
  const isImage = spec.id === "image-legacy";

  return (
    <div className="flex flex-col items-center gap-1 w-[4rem] shrink-0">
      <button
        type="button"
        title={spec.title}
        className={cn(
          TILE_SHELL,
          "w-16 h-16 flex items-center justify-center p-1.5",
          theme.bg,
        )}
      >
        {isImage ? (
          <div className="h-full w-full rounded-md bg-gradient-to-br from-blue-200/80 to-indigo-300/60 dark:from-blue-800/50 dark:to-indigo-900/40 flex items-center justify-center">
            <ImageIcon className={cn("h-6 w-6", theme.icon)} />
          </div>
        ) : (
          <TileIcon spec={spec} className="h-6 w-6" />
        )}
      </button>
      <span className="w-full text-[10px] text-foreground font-medium text-center leading-tight line-clamp-2 px-0.5">
        {truncateLabel(spec.title, 18)}
      </span>
    </div>
  );
}

const HYBRID_VARIANTS = [
  {
    id: "stacked",
    title: "A · Stacked square",
    description:
      "72×72 tile. Icon or thumb on top, label band below. Same footprint for every type.",
    Tile: HybridTileStacked,
    gap: "gap-1.5",
  },
  {
    id: "horizontal",
    title: "B · Horizontal pill-box",
    description:
      "7rem × 2.75rem. Icon inset + type label + title. Reads more like a chip with tile corners.",
    Tile: HybridTileHorizontal,
    gap: "gap-1.5",
  },
  {
    id: "wide",
    title: "C · Wide mini-card",
    description:
      "8.5rem × 3rem. Two lines of text (type + title). Most readable label.",
    Tile: HybridTileWide,
    gap: "gap-1.5",
  },
  {
    id: "caption",
    title: "D · Thumb + caption",
    description:
      "64×64 square tile + caption under the border. Old-chat shape, input colors, extra text room.",
    Tile: HybridTileCaption,
    gap: "gap-2",
  },
] as const;

function SampleBubble({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="bg-muted border border-border rounded-lg px-2 py-2">
        <div className="space-y-1.5">
          {children}
          <p className="text-xs text-foreground whitespace-pre-wrap pt-1">
            Can you review these attachments and summarize next steps?
          </p>
        </div>
      </div>
    </div>
  );
}

interface UserMessageHybridTileSamplesProps {
  specs: DemoAttachmentSpec[];
}

export function UserMessageHybridTileSamples({
  specs,
}: UserMessageHybridTileSamplesProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
          Hybrid tile samples
        </h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
          Input-bar tints + old-chat{" "}
          <code className="text-[10px]">rounded-lg</code> shape. Every variant
          uses the same border, radius, and shadow shell — only layout differs.
          Slightly larger than legacy 40px tiles, with room for a short label.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {HYBRID_VARIANTS.map(({ id, title, description, Tile, gap }) => (
          <SampleBubble key={id} title={title} description={description}>
            <div className={cn("flex flex-wrap items-start", gap)}>
              {specs.map((spec) => (
                <Tile key={`${id}-${spec.id}`} spec={spec} />
              ))}
            </div>
          </SampleBubble>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card/50 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Shared rules:</span>{" "}
          <code className="text-[10px]">rounded-lg</code>,{" "}
          <code className="text-[10px]">border-border/60</code>, input-bar{" "}
          <code className="text-[10px]">bg-*-100</code> tints, no rainbow
          borders. Images use an inner thumb area; other types use the type icon
          at the same tile size.
        </p>
      </div>
    </section>
  );
}
