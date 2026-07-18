"use client";

/**
 * The hardcoded kind loading-component library (~20 loaders, zero fetch
 * delay). Each accepts the early-key contract (kind-loading.types.ts) and
 * renders a small, enterprise-grade shimmer/skeleton while a kind instance
 * streams in and its schema/component cold-fetch resolves.
 *
 * Rules: semantic tokens only, Lucide only, no emojis, no heavy deps —
 * every loader is a handful of divs. Selection lives in
 * kind-loading-registry.ts (`kind_definition.metadata.loading_component`).
 */

import React from "react";
import {
  BarChart3,
  Code2,
  FileText,
  GalleryHorizontalEnd,
  GitBranch,
  Image as ImageIcon,
  Kanban,
  LayoutGrid,
  ListChecks,
  Loader2,
  Map as MapIcon,
  MessagesSquare,
  Network,
  Presentation,
  Shapes,
  Table as TableIcon,
  TextCursorInput,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import type { KindLoadingProps } from "./kind-loading.types";

type IconComponent = React.ComponentType<{ className?: string }>;

/** Icon-hint slugs an emitter may send via the early `icon` key. */
export const ICON_HINTS: Record<string, IconComponent> = {
  card: LayoutGrid,
  list: ListChecks,
  table: TableIcon,
  timeline: TimerReset,
  chart: BarChart3,
  deck: Presentation,
  form: TextCursorInput,
  media: ImageIcon,
  stats: TrendingUp,
  document: FileText,
  diagram: Network,
  chat: MessagesSquare,
  gallery: GalleryHorizontalEnd,
  kanban: Kanban,
  tree: GitBranch,
  code: Code2,
  map: MapIcon,
  shapes: Shapes,
};

function clampCount(count: number | undefined, fallback: number, max = 8): number {
  if (count === undefined) return fallback;
  return Math.max(1, Math.min(max, Math.round(count)));
}

/** One shimmer bar. */
const Sk: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />
);

/**
 * Shared chrome: spinner + the early keys (title / loading_message /
 * description / subtext) above a loader-specific skeleton body.
 */
const Shell: React.FC<
  KindLoadingProps & { defaultIcon: IconComponent; children?: React.ReactNode }
> = ({
  kind,
  title,
  description,
  loadingMessage,
  loadingSubtext,
  icon,
  defaultIcon,
  children,
}) => {
  const Icon = (icon && ICON_HINTS[icon]) || defaultIcon;
  const heading = title ?? loadingMessage;
  const sub = title ? (loadingMessage ?? description) : (description ?? loadingSubtext);
  return (
    <div
      className="my-3 rounded-lg border border-border bg-card/50 p-4"
      aria-busy="true"
      data-kind-loading={kind ?? "unknown"}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {heading ? (
              <span className="truncate text-sm font-medium text-foreground">
                {heading}
              </span>
            ) : (
              <Sk className="h-3.5 w-40" />
            )}
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          </div>
          {sub ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
          ) : null}
          {loadingSubtext && sub !== loadingSubtext ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
              {loadingSubtext}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
};

// ── The library ─────────────────────────────────────────────────────────────

export const CardLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={LayoutGrid}>
    <div className="space-y-2">
      <Sk className="h-3 w-2/3" />
      <Sk className="h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Sk className="h-5 w-16 rounded-full" />
        <Sk className="h-5 w-20 rounded-full" />
      </div>
    </div>
  </Shell>
);

export const ListLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={ListChecks}>
    <div className="space-y-2">
      {Array.from({ length: clampCount(p.count, 4) }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Sk className="h-3.5 w-3.5 rounded-sm" />
          <Sk className={`h-3 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
        </div>
      ))}
    </div>
  </Shell>
);

export const TableLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TableIcon}>
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="flex gap-px bg-muted/60 p-2">
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: clampCount(p.count, 3, 6) }).map((_, r) => (
        <div key={r} className="flex gap-px border-t border-border/40 p-2">
          {[0, 1, 2, 3].map((c) => (
            <Sk key={c} className="h-2.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  </Shell>
);

export const TimelineLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TimerReset}>
    <div className="space-y-3 pl-1">
      {Array.from({ length: clampCount(p.count, 4, 6) }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Sk className="h-2.5 w-2.5 rounded-full" />
            <div className="mt-1 h-6 w-px bg-border" />
          </div>
          <div className="flex-1 space-y-1.5">
            <Sk className="h-3 w-1/3" />
            <Sk className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  </Shell>
);

export const ChartLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={BarChart3}>
    <div className="flex h-24 items-end gap-2 px-1">
      {[40, 70, 55, 90, 62, 78, 45].map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t bg-muted"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  </Shell>
);

export const DeckLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Presentation}>
    <div className="flex gap-2">
      <div className="aspect-video flex-[3] space-y-2 rounded-md border border-border/60 p-3">
        <Sk className="h-3.5 w-1/2" />
        <Sk className="h-2.5 w-3/4" />
        <Sk className="h-2.5 w-2/3" />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Sk key={i} className="aspect-video w-full rounded-md" />
        ))}
      </div>
    </div>
  </Shell>
);

export const FormLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TextCursorInput}>
    <div className="space-y-3">
      {Array.from({ length: clampCount(p.count, 3, 5) }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Sk className="h-2.5 w-24" />
          <Sk className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  </Shell>
);

export const MediaLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={ImageIcon}>
    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted/60">
      <ImageIcon className="h-6 w-6 animate-pulse text-muted-foreground/60" />
    </div>
  </Shell>
);

export const StatGridLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TrendingUp}>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: clampCount(p.count, 4, 8) }).map((_, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/60 p-3">
          <Sk className="h-2.5 w-14" />
          <Sk className="h-5 w-10" />
        </div>
      ))}
    </div>
  </Shell>
);

export const DocumentLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={FileText}>
    <div className="space-y-2">
      <Sk className="h-3.5 w-1/3" />
      <Sk className="h-2.5 w-full" />
      <Sk className="h-2.5 w-11/12" />
      <Sk className="h-2.5 w-4/5" />
      <Sk className="mt-3 h-3.5 w-1/4" />
      <Sk className="h-2.5 w-full" />
      <Sk className="h-2.5 w-3/4" />
    </div>
  </Shell>
);

export const DiagramLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Network}>
    <div className="flex flex-col items-center gap-2 py-2">
      <Sk className="h-8 w-28 rounded-md" />
      <div className="h-4 w-px bg-border" />
      <div className="flex gap-6">
        <Sk className="h-8 w-24 rounded-md" />
        <Sk className="h-8 w-24 rounded-md" />
      </div>
    </div>
  </Shell>
);

export const ChatLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={MessagesSquare}>
    <div className="space-y-2">
      <div className="flex justify-start">
        <Sk className="h-8 w-1/2 rounded-lg rounded-bl-sm" />
      </div>
      <div className="flex justify-end">
        <Sk className="h-8 w-2/5 rounded-lg rounded-br-sm" />
      </div>
      <div className="flex justify-start">
        <Sk className="h-8 w-3/5 rounded-lg rounded-bl-sm" />
      </div>
    </div>
  </Shell>
);

export const GalleryLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={GalleryHorizontalEnd}>
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: clampCount(p.count, 6, 9) }).map((_, i) => (
        <Sk key={i} className="aspect-square w-full rounded-md" />
      ))}
    </div>
  </Shell>
);

export const KanbanLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Kanban}>
    <div className="flex gap-2">
      {[0, 1, 2].map((col) => (
        <div key={col} className="flex-1 space-y-2 rounded-md bg-muted/40 p-2">
          <Sk className="h-2.5 w-16" />
          <Sk className="h-10 w-full rounded-md" />
          {col !== 2 ? <Sk className="h-10 w-full rounded-md" /> : null}
        </div>
      ))}
    </div>
  </Shell>
);

export const TreeLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={GitBranch}>
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sk className="h-3.5 w-3.5 rounded-sm" />
        <Sk className="h-3 w-1/3" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="ml-5 flex items-center gap-2">
          <Sk className="h-3.5 w-3.5 rounded-sm" />
          <Sk className="h-3 w-2/5" />
        </div>
      ))}
      <div className="ml-10 flex items-center gap-2">
        <Sk className="h-3.5 w-3.5 rounded-sm" />
        <Sk className="h-3 w-1/4" />
      </div>
    </div>
  </Shell>
);

export const CodeLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Code2}>
    <div className="space-y-1.5 rounded-md bg-muted/40 p-3 font-mono">
      <Sk className="h-2.5 w-1/3" />
      <Sk className="ml-4 h-2.5 w-1/2" />
      <Sk className="ml-4 h-2.5 w-2/5" />
      <Sk className="ml-8 h-2.5 w-1/3" />
      <Sk className="h-2.5 w-1/6" />
    </div>
  </Shell>
);

export const MapLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={MapIcon}>
    <div className="relative flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-md bg-muted/50">
      <MapIcon className="h-6 w-6 animate-pulse text-muted-foreground/60" />
      <Sk className="absolute left-1/4 top-1/3 h-2.5 w-2.5 rounded-full" />
      <Sk className="absolute right-1/3 top-1/2 h-2.5 w-2.5 rounded-full" />
      <Sk className="absolute bottom-1/4 left-1/2 h-2.5 w-2.5 rounded-full" />
    </div>
  </Shell>
);

export const ProgressLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TrendingUp}>
    <div className="space-y-3">
      {Array.from({ length: clampCount(p.count, 3, 5) }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <Sk className="h-2.5 w-24" />
            <Sk className="h-2.5 w-8" />
          </div>
          <Sk className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  </Shell>
);

export const MinimalLoading: React.FC<KindLoadingProps> = (p) => {
  const label = p.title ?? p.loadingMessage;
  return (
    <div
      className="my-2 inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5"
      aria-busy="true"
      data-kind-loading={p.kind ?? "unknown"}
    >
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : (
        <Sk className="h-2.5 w-28" />
      )}
    </div>
  );
};

/** The generic default — the early-key-aware successor of the old skeleton. */
export const GenericLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Shapes}>
    <div className="space-y-2">
      <Sk className="h-2.5 w-2/3" />
      <Sk className="h-2.5 w-1/2" />
      <Sk className="h-2.5 w-5/6" />
    </div>
  </Shell>
);
