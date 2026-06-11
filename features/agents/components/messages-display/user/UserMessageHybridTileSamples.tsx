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
import {
  resolveResourceAttachmentTileTheme,
  resourceAttachmentTileAdaptiveSurface,
  RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
} from "./resourceAttachmentTile.theme";
import { ResourceAttachmentTile } from "./ResourceAttachmentTile";

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
const INPUT_TILE_THEME: Record<
  string,
  { bg: string; icon: string; gradient: string; borderTint: string }
> = {
  note: {
    bg: "bg-orange-100 dark:bg-orange-950/30",
    icon: "text-orange-600 dark:text-orange-400",
    gradient:
      "bg-gradient-to-br from-orange-100 via-orange-50/95 to-white/80 dark:from-orange-950/50 dark:via-orange-950/25 dark:to-orange-950/10",
    borderTint: "border-orange-200/80 dark:border-orange-800/45",
  },
  task: {
    bg: "bg-blue-100 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    gradient:
      "bg-gradient-to-br from-blue-100 via-blue-50/95 to-white/80 dark:from-blue-950/50 dark:via-blue-950/25 dark:to-blue-950/10",
    borderTint: "border-blue-200/80 dark:border-blue-800/45",
  },
  webpage: {
    bg: "bg-teal-100 dark:bg-teal-950/30",
    icon: "text-teal-600 dark:text-teal-400",
    gradient:
      "bg-gradient-to-br from-teal-100 via-teal-50/95 to-white/80 dark:from-teal-950/50 dark:via-teal-950/25 dark:to-teal-950/10",
    borderTint: "border-teal-200/80 dark:border-teal-800/45",
  },
  "image-legacy": {
    bg: "bg-blue-100 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    gradient:
      "bg-gradient-to-br from-blue-100 via-sky-50/95 to-white/80 dark:from-blue-950/50 dark:via-sky-950/20 dark:to-blue-950/10",
    borderTint: "border-blue-200/80 dark:border-blue-800/45",
  },
  "audio-legacy": {
    bg: "bg-pink-100 dark:bg-pink-950/30",
    icon: "text-pink-600 dark:text-pink-400",
    gradient:
      "bg-gradient-to-br from-pink-100 via-pink-50/95 to-white/80 dark:from-pink-950/50 dark:via-pink-950/25 dark:to-pink-950/10",
    borderTint: "border-pink-200/80 dark:border-pink-800/45",
  },
  youtube: {
    bg: "bg-red-100 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
    gradient:
      "bg-gradient-to-br from-red-100 via-red-50/95 to-white/80 dark:from-red-950/50 dark:via-red-950/25 dark:to-red-950/10",
    borderTint: "border-red-200/80 dark:border-red-800/45",
  },
};

const TILE_SHELL_INTERACTIVE =
  "overflow-hidden shrink-0 cursor-default transition-all hover:brightness-[0.98] dark:hover:brightness-110 active:scale-[0.98]";

/** Shared shell — default E3 baseline chrome. */
const TILE_SHELL = cn(
  "rounded-lg border border-border/60",
  TILE_SHELL_INTERACTIVE,
  "shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset,0_1px_2px_0_rgba(0,0,0,0.05)]",
  "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]",
);

function truncateLabel(label: string, max = 14) {
  return label.length <= max ? label : `${label.slice(0, max)}…`;
}

function tileTheme(spec: DemoAttachmentSpec) {
  return INPUT_TILE_THEME[spec.id] ?? INPUT_TILE_THEME.note;
}

function tileSurface(spec: DemoAttachmentSpec, mode: "flat" | "gradient") {
  const theme = tileTheme(spec);
  return mode === "gradient" ? theme.gradient : theme.bg;
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

type StackedRowsConfig = {
  /** Tailwind padding on the tile body */
  body: string;
  /** Gap between header row and title row */
  rowGap: string;
  /** Fixed icon slot width — title row aligns to this column */
  iconSlot: string;
  /** Lucide icon size inside the slot */
  iconSize: string;
  /** Optional inset behind the icon */
  iconInset?: boolean;
  typeClass: string;
  titleClass: string;
  width: string;
};

function StackedRowsIcon({
  spec,
  iconSlot,
  iconSize,
}: {
  spec: DemoAttachmentSpec;
  iconSlot: string;
  iconSize: string;
  iconInset?: boolean;
}) {
  return (
    <span className={cn(iconSlot, "shrink-0 flex items-center justify-center")}>
      <TileIcon spec={spec} className={iconSize} />
    </span>
  );
}

function HybridTileStackedRowsBase({
  spec,
  config,
  shellClassName,
  surfaceClassName,
}: {
  spec: DemoAttachmentSpec;
  config: StackedRowsConfig;
  shellClassName?: string;
  surfaceClassName?: string;
}) {
  const theme = tileTheme(spec);

  return (
    <button
      type="button"
      title={spec.title}
      className={cn(
        shellClassName ?? TILE_SHELL,
        config.width,
        "flex flex-col text-left min-w-0",
        config.body,
        config.rowGap,
        surfaceClassName ?? theme.bg,
      )}
    >
      {/* Row 1: icon slot + type — title row below aligns to icon slot left */}
      <span className="flex items-center gap-1 min-w-0 w-full">
        <StackedRowsIcon
          spec={spec}
          iconSlot={config.iconSlot}
          iconSize={config.iconSize}
          iconInset={config.iconInset}
        />
        <span
          className={cn(
            config.typeClass,
            "min-w-0 flex-1 truncate whitespace-nowrap text-muted-foreground uppercase tracking-wide",
          )}
        >
          {spec.label}
        </span>
      </span>
      <span
        className={cn(
          config.titleClass,
          "block w-full min-w-0 truncate whitespace-nowrap text-foreground font-medium",
        )}
      >
        {spec.title}
      </span>
    </button>
  );
}

const STACKED_ROWS_E: StackedRowsConfig = {
  body: "px-1.5 py-1",
  rowGap: "gap-0.5",
  iconSlot: "h-4 w-4",
  iconSize: "h-3.5 w-3.5",
  iconInset: false,
  typeClass: "text-[9px] font-semibold leading-none",
  titleClass: "text-[10px] leading-none",
  width: "w-[7.5rem]",
};

const STACKED_ROWS_E2: StackedRowsConfig = {
  ...STACKED_ROWS_E,
  body: "px-1 py-0.5",
  rowGap: "gap-px",
  iconSlot: "h-4 w-4",
  iconSize: "h-4 w-4",
};

const STACKED_ROWS_E3: StackedRowsConfig = {
  ...STACKED_ROWS_E,
  iconInset: true,
  iconSlot: "h-[1.125rem] w-[1.125rem]",
  iconSize: "h-3.5 w-3.5",
};

/** E — Stacked rows: icon + type, then title — single-line truncate, left-aligned. */
function HybridTileStackedRows({ spec }: { spec: DemoAttachmentSpec }) {
  return <HybridTileStackedRowsBase spec={spec} config={STACKED_ROWS_E} />;
}

function HybridTileStackedRowsTight({ spec }: { spec: DemoAttachmentSpec }) {
  return <HybridTileStackedRowsBase spec={spec} config={STACKED_ROWS_E2} />;
}

function HybridTileStackedRowsInset({ spec }: { spec: DemoAttachmentSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.id);
  return (
    <HybridTileStackedRowsBase
      spec={spec}
      config={STACKED_ROWS_E3}
      shellClassName={RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE}
      surfaceClassName={resourceAttachmentTileAdaptiveSurface(theme)}
    />
  );
}

function DemoResourceAttachmentTile({ spec }: { spec: DemoAttachmentSpec }) {
  const Icon = TILE_ICONS[spec.id] ?? FileText;
  return (
    <ResourceAttachmentTile
      typeLabel={spec.label}
      title={spec.title}
      icon={Icon}
      themeKey={spec.id}
    />
  );
}

/** E3 layout + swappable surface / chrome for style exploration. */
function E3StyleTile({
  spec,
  shellClassName,
  surfaceMode = "flat",
}: {
  spec: DemoAttachmentSpec;
  shellClassName: string;
  surfaceMode?: "flat" | "gradient";
}) {
  return (
    <HybridTileStackedRowsBase
      spec={spec}
      config={STACKED_ROWS_E3}
      shellClassName={shellClassName}
      surfaceClassName={tileSurface(spec, surfaceMode)}
    />
  );
}

const E3_STYLE_VARIANTS = [
  {
    id: "baseline",
    title: "S0 · Baseline",
    description: "Current E3 winner — flat tint, lg radius, soft inset shadow.",
    shellClassName: TILE_SHELL,
    surfaceMode: "flat" as const,
  },
  {
    id: "rounder",
    title: "S1 · Rounder",
    description: "rounded-xl — softer tile silhouette, same border weight.",
    shellClassName: cn(
      "rounded-xl border border-border/60",
      TILE_SHELL_INTERACTIVE,
      "shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset,0_1px_2px_0_rgba(0,0,0,0.05)]",
      "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]",
    ),
    surfaceMode: "flat" as const,
  },
  {
    id: "hairline",
    title: "S2 · Hairline",
    description: "Ultra-light border + xl radius. Minimal chrome.",
    shellClassName: cn(
      "rounded-xl border border-black/[0.07] dark:border-white/[0.11]",
      TILE_SHELL_INTERACTIVE,
      "shadow-sm shadow-black/[0.04] dark:shadow-black/30",
    ),
    surfaceMode: "flat" as const,
  },
  {
    id: "gradient",
    title: "S3 · Gradient wash",
    description: "Per-type gradient surface — light depth without 3D.",
    shellClassName: cn(
      "rounded-xl border border-border/50",
      TILE_SHELL_INTERACTIVE,
      "shadow-sm shadow-black/[0.05] dark:shadow-black/35",
    ),
    surfaceMode: "gradient" as const,
  },
  {
    id: "lifted",
    title: "S4 · Lifted",
    description: "Drop shadow below the tile — floats slightly off the bubble.",
    shellClassName: cn(
      "rounded-lg border border-border/45",
      TILE_SHELL_INTERACTIVE,
      "shadow-md shadow-black/10 dark:shadow-black/50",
    ),
    surfaceMode: "flat" as const,
  },
  {
    id: "raised-3d",
    title: "S5 · 3D raised",
    description: "Top highlight + thicker bottom edge — physical button feel.",
    shellClassName: cn(
      "rounded-lg border border-black/10 dark:border-white/10",
      "border-b-2 border-b-black/15 dark:border-b-black/45",
      TILE_SHELL_INTERACTIVE,
      "shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.12)]",
      "dark:shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_2px_5px_rgba(0,0,0,0.5)]",
    ),
    surfaceMode: "flat" as const,
  },
  {
    id: "tinted-edge",
    title: "S6 · Tinted edge",
    description: "Border picks up the resource type color at low opacity.",
    shellClassName: cn("rounded-xl border", TILE_SHELL_INTERACTIVE),
    surfaceMode: "flat" as const,
    tintedBorder: true,
  },
  {
    id: "glass",
    title: "S7 · Glass ring",
    description: "Inset ring + soft outer glow — polished UI chip.",
    shellClassName: cn(
      "rounded-xl border border-white/40 dark:border-white/10",
      "ring-1 ring-inset ring-white/60 dark:ring-white/10",
      TILE_SHELL_INTERACTIVE,
      "shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.45)]",
    ),
    surfaceMode: "gradient" as const,
  },
] as const;

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
    id: "stacked-rows",
    title: "E · Stacked rows (B variant)",
    description:
      "Icon + type on row 1; title below, left-aligned with icon. Single-line truncate only.",
    Tile: HybridTileStackedRows,
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            S8 · Adaptive — ship candidate
          </h3>
          <span className="text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
            Light 3D + dark glass
          </span>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Combines S5 (3D raised) in light mode and S7 (glass ring + gradient)
          in dark mode. Icons sit directly on the tile — no inset plate. Wired
          into <code className="text-[10px]">AgentUserMessage</code> via{" "}
          <code className="text-[10px]">ResourceAttachmentTile</code>.
        </p>
        <SampleBubble
          title="Production tile"
          description="Same component used in live user messages."
        >
          <div className="flex flex-wrap gap-1.5">
            {specs.map((spec) => (
              <DemoResourceAttachmentTile key={`s8-${spec.id}`} spec={spec} />
            ))}
          </div>
        </SampleBubble>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            E3 · Style polish (exploration)
          </h3>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Historical S0–S7 chrome on the E3 layout. Ship candidate is S8 above
          (adaptive shell + transparent icons).
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {E3_STYLE_VARIANTS.map((variant) => (
            <SampleBubble
              key={variant.id}
              title={variant.title}
              description={variant.description}
            >
              <div className="flex flex-wrap gap-1.5">
                {specs.map((spec) => {
                  const theme = tileTheme(spec);
                  const shell =
                    "tintedBorder" in variant && variant.tintedBorder
                      ? cn(variant.shellClassName, theme.borderTint)
                      : variant.shellClassName;
                  return (
                    <E3StyleTile
                      key={`${variant.id}-${spec.id}`}
                      spec={spec}
                      shellClassName={shell}
                      surfaceMode={variant.surfaceMode}
                    />
                  );
                })}
              </div>
            </SampleBubble>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          E refinements — layout pick (done)
        </h3>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Same layout: icon + type, then title. No wrap — truncate only. Title
          left edge aligns with icon left edge.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <SampleBubble
            title="E · Default"
            description="px-1.5 py-1, bare icon h-3.5 in h-4 slot."
          >
            <div className="flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <HybridTileStackedRows
                  key={`e-default-${spec.id}`}
                  spec={spec}
                />
              ))}
            </div>
          </SampleBubble>
          <SampleBubble
            title="E2 · Tighter"
            description="Less padding, icon bumped to h-4, minimal gap."
          >
            <div className="flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <HybridTileStackedRowsTight
                  key={`e-tight-${spec.id}`}
                  spec={spec}
                />
              ))}
            </div>
          </SampleBubble>
          <SampleBubble
            title="E3 · Adaptive inset layout"
            description="Same as S8 — adaptive chrome, transparent icon, truncate-only rows."
          >
            <div className="flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <HybridTileStackedRowsInset
                  key={`e-inset-${spec.id}`}
                  spec={spec}
                />
              ))}
            </div>
          </SampleBubble>
        </div>
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
