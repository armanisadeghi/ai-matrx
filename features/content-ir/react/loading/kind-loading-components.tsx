"use client";

/**
 * The hardcoded kind loading-component library (zero fetch delay). Each
 * accepts the early-key contract (kind-loading.types.ts) and renders a small,
 * enterprise-grade shimmer/skeleton while a kind instance streams in and its
 * schema/component cold-fetch resolves.
 *
 * Rules: semantic tokens for structure, Lucide only, no emojis, no heavy
 * deps — every loader is a handful of divs. Each loader carries ONE accent
 * tone (Arman, 2026-08-24: "everything has a little touch of color so things
 * feel and look alive — not overdoing it"): a tinted icon chip, a tinted
 * spinner, and a faint wash; bodies may tint ONE element class. Selection
 * lives in kind-loading-registry.ts (`kind_definition.metadata.loading_component`).
 */

import React from "react";
import {
  BarChart3,
  Code2,
  FileText,
  GalleryHorizontalEnd,
  GitBranch,
  Image as ImageIcon,
  CircleHelp,
  Kanban,
  Layers,
  LayoutGrid,
  ListChecks,
  Loader2,
  NotebookPen,
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

// ── Accent tones (static class strings — Tailwind needs full literals) ─────

interface Tone {
  chip: string;
  icon: string;
  spin: string;
  wash: string;
}

const TONES = {
  violet: {
    chip: "bg-violet-500/10",
    icon: "text-violet-600 dark:text-violet-400",
    spin: "text-violet-500",
    wash: "bg-gradient-to-br from-violet-500/[0.05] via-card/50 to-card/50",
  },
  sky: {
    chip: "bg-sky-500/10",
    icon: "text-sky-600 dark:text-sky-400",
    spin: "text-sky-500",
    wash: "bg-gradient-to-br from-sky-500/[0.05] via-card/50 to-card/50",
  },
  indigo: {
    chip: "bg-indigo-500/10",
    icon: "text-indigo-600 dark:text-indigo-400",
    spin: "text-indigo-500",
    wash: "bg-gradient-to-br from-indigo-500/[0.05] via-card/50 to-card/50",
  },
  amber: {
    chip: "bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    spin: "text-amber-500",
    wash: "bg-gradient-to-br from-amber-500/[0.05] via-card/50 to-card/50",
  },
  emerald: {
    chip: "bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    spin: "text-emerald-500",
    wash: "bg-gradient-to-br from-emerald-500/[0.05] via-card/50 to-card/50",
  },
  fuchsia: {
    chip: "bg-fuchsia-500/10",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
    spin: "text-fuchsia-500",
    wash: "bg-gradient-to-br from-fuchsia-500/[0.05] via-card/50 to-card/50",
  },
  blue: {
    chip: "bg-blue-500/10",
    icon: "text-blue-600 dark:text-blue-400",
    spin: "text-blue-500",
    wash: "bg-gradient-to-br from-blue-500/[0.05] via-card/50 to-card/50",
  },
  teal: {
    chip: "bg-teal-500/10",
    icon: "text-teal-600 dark:text-teal-400",
    spin: "text-teal-500",
    wash: "bg-gradient-to-br from-teal-500/[0.05] via-card/50 to-card/50",
  },
  cyan: {
    chip: "bg-cyan-500/10",
    icon: "text-cyan-600 dark:text-cyan-400",
    spin: "text-cyan-500",
    wash: "bg-gradient-to-br from-cyan-500/[0.05] via-card/50 to-card/50",
  },
  pink: {
    chip: "bg-pink-500/10",
    icon: "text-pink-600 dark:text-pink-400",
    spin: "text-pink-500",
    wash: "bg-gradient-to-br from-pink-500/[0.05] via-card/50 to-card/50",
  },
  orange: {
    chip: "bg-orange-500/10",
    icon: "text-orange-600 dark:text-orange-400",
    spin: "text-orange-500",
    wash: "bg-gradient-to-br from-orange-500/[0.05] via-card/50 to-card/50",
  },
  lime: {
    chip: "bg-lime-500/10",
    icon: "text-lime-600 dark:text-lime-500",
    spin: "text-lime-500",
    wash: "bg-gradient-to-br from-lime-500/[0.05] via-card/50 to-card/50",
  },
  rose: {
    chip: "bg-rose-500/10",
    icon: "text-rose-600 dark:text-rose-400",
    spin: "text-rose-500",
    wash: "bg-gradient-to-br from-rose-500/[0.05] via-card/50 to-card/50",
  },
} satisfies Record<string, Tone>;

type ToneName = keyof typeof TONES;

function clampCount(count: number | undefined, fallback: number, max = 8): number {
  if (count === undefined) return fallback;
  return Math.max(1, Math.min(max, Math.round(count)));
}

/** One shimmer bar. */
const Sk: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />
);

/**
 * Shared chrome: tinted icon chip + spinner + the early keys (title /
 * loading_message / description / subtext) above a loader-specific skeleton
 * body, on a faint accent wash.
 */
const Shell: React.FC<
  KindLoadingProps & {
    defaultIcon: IconComponent;
    tone?: ToneName;
    children?: React.ReactNode;
  }
> = ({
  kind,
  title,
  description,
  loadingMessage,
  loadingSubtext,
  icon,
  defaultIcon,
  tone = "violet",
  children,
}) => {
  const Icon = (icon && ICON_HINTS[icon]) || defaultIcon;
  const t = TONES[tone];
  const heading = title ?? loadingMessage;
  const sub = title ? (loadingMessage ?? description) : (description ?? loadingSubtext);
  return (
    <div
      className={`my-3 rounded-lg border border-border p-4 ${t.wash}`}
      aria-busy="true"
      data-kind-loading={kind ?? "unknown"}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.chip}`}
        >
          <Icon className={`h-4 w-4 ${t.icon}`} />
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
            <Loader2 className={`h-3 w-3 shrink-0 animate-spin ${t.spin}`} />
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
  <Shell {...p} defaultIcon={LayoutGrid} tone="violet">
    <div className="space-y-2">
      <Sk className="h-3 w-2/3" />
      <Sk className="h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Sk className="h-5 w-16 rounded-full bg-violet-500/15" />
        <Sk className="h-5 w-20 rounded-full" />
      </div>
    </div>
  </Shell>
);

export const ListLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={ListChecks} tone="sky">
    <div className="space-y-2">
      {Array.from({ length: clampCount(p.count, 4) }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Sk className="h-3.5 w-3.5 rounded-sm bg-sky-500/20" />
          <Sk className={`h-3 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
        </div>
      ))}
    </div>
  </Shell>
);

export const TableLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TableIcon} tone="indigo">
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="flex gap-px bg-indigo-500/10 p-2">
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} className="h-3 flex-1 bg-indigo-500/20" />
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
  <Shell {...p} defaultIcon={TimerReset} tone="amber">
    <div className="space-y-3 pl-1">
      {Array.from({ length: clampCount(p.count, 4, 6) }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Sk className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
            <div className="mt-1 h-6 w-px bg-amber-500/25" />
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
  <Shell {...p} defaultIcon={BarChart3} tone="emerald">
    <div className="flex h-24 items-end gap-2 px-1">
      {[40, 70, 55, 90, 62, 78, 45].map((h, i) => (
        <div
          key={i}
          className={`flex-1 animate-pulse rounded-t ${
            i % 2 ? "bg-emerald-500/20" : "bg-emerald-500/30"
          }`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  </Shell>
);

export const DeckLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Presentation} tone="fuchsia">
    <div className="flex gap-2">
      <div className="aspect-video flex-[3] space-y-2 rounded-md border border-fuchsia-500/25 bg-fuchsia-500/[0.04] p-3">
        <Sk className="h-3.5 w-1/2 bg-fuchsia-500/20" />
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
  <Shell {...p} defaultIcon={TextCursorInput} tone="cyan">
    <div className="space-y-3">
      {Array.from({ length: clampCount(p.count, 3, 5) }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Sk className="h-2.5 w-24 bg-cyan-500/20" />
          <Sk className="h-8 w-full rounded-md" />
        </div>
      ))}
    </div>
  </Shell>
);

export const MediaLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={ImageIcon} tone="pink">
    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-gradient-to-br from-pink-500/10 via-muted/60 to-muted/60">
      <ImageIcon className="h-6 w-6 animate-pulse text-pink-500/50" />
    </div>
  </Shell>
);

export const StatGridLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TrendingUp} tone="lime">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: clampCount(p.count, 4, 8) }).map((_, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/60 p-3">
          <Sk className="h-2.5 w-14" />
          <Sk className="h-5 w-10 bg-lime-500/25" />
        </div>
      ))}
    </div>
  </Shell>
);

export const DocumentLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={FileText} tone="orange">
    <div className="space-y-2">
      <Sk className="h-3.5 w-1/3 bg-orange-500/20" />
      <Sk className="h-2.5 w-full" />
      <Sk className="h-2.5 w-11/12" />
      <Sk className="h-2.5 w-4/5" />
      <Sk className="mt-3 h-3.5 w-1/4 bg-orange-500/20" />
      <Sk className="h-2.5 w-full" />
      <Sk className="h-2.5 w-3/4" />
    </div>
  </Shell>
);

// ── Study-shaped loaders ────────────────────────────────────────────────────
//
// A loader earns its place by having the SILHOUETTE of the component that
// replaces it, so the swap reads as the same object finishing rather than one
// thing becoming another. Arman, watching a live Study Pack run (2026-08-21):
// "I saw a generic loading component that was not for the specific individual
// kinds" — a study pack announces four distinct shapes, and a shared skeleton
// for all four tells the reader nothing about what is coming.

/** flashcard_set — one big card face, with the deck's pager beneath it. */
export const FlashcardsLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Layers} tone="violet">
    <div className="space-y-2.5">
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.04] p-4">
        <Sk className="h-3 w-2/5" />
        <Sk className="h-3 w-3/5" />
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: clampCount(p.count, 5, 8) }).map((_, i) => (
          <Sk
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-violet-500/50" : ""}`}
          />
        ))}
      </div>
    </div>
  </Shell>
);

/** quiz_set — a question, then its answer choices, then the next question. */
export const QuizLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={CircleHelp} tone="blue">
    <div className="space-y-4">
      {Array.from({ length: clampCount(p.count, 2, 4) }).map((_, q) => (
        <div key={q} className="space-y-2">
          <div className="flex items-start gap-2">
            <Sk className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-blue-500/25" />
            <Sk className="h-3 w-3/4" />
          </div>
          <div className="space-y-1.5 pl-6">
            {[0, 1, 2, 3].map((o) => (
              <div key={o} className="flex items-center gap-2">
                <Sk className="h-3 w-3 shrink-0 rounded-full bg-blue-500/15" />
                <Sk className={`h-2.5 ${["w-2/3", "w-1/2", "w-3/5", "w-5/12"][o]}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Shell>
);

/** study_notes — an overview paragraph, then headed sections with key points. */
export const NotesLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={NotebookPen} tone="teal">
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Sk className="h-2.5 w-full" />
        <Sk className="h-2.5 w-11/12" />
        <Sk className="h-2.5 w-3/4" />
      </div>
      {Array.from({ length: clampCount(p.count, 2, 4) }).map((_, section) => (
        <div key={section} className="space-y-1.5">
          <Sk className="h-3.5 w-1/3 bg-teal-500/20" />
          <Sk className="h-2.5 w-full" />
          <div className="space-y-1 pl-4">
            {[0, 1, 2].map((point) => (
              <div key={point} className="flex items-center gap-2">
                <Sk className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500/40" />
                <Sk className={`h-2.5 ${["w-3/4", "w-2/3", "w-4/5"][point]}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Shell>
);

export const DiagramLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Network} tone="indigo">
    <div className="flex flex-col items-center gap-2 py-2">
      <Sk className="h-8 w-28 rounded-md bg-indigo-500/15" />
      <div className="h-4 w-px bg-indigo-500/30" />
      <div className="flex gap-6">
        <Sk className="h-8 w-24 rounded-md" />
        <Sk className="h-8 w-24 rounded-md" />
      </div>
    </div>
  </Shell>
);

export const ChatLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={MessagesSquare} tone="sky">
    <div className="space-y-2">
      <div className="flex justify-start">
        <Sk className="h-8 w-1/2 rounded-lg rounded-bl-sm" />
      </div>
      <div className="flex justify-end">
        <Sk className="h-8 w-2/5 rounded-lg rounded-br-sm bg-sky-500/15" />
      </div>
      <div className="flex justify-start">
        <Sk className="h-8 w-3/5 rounded-lg rounded-bl-sm" />
      </div>
    </div>
  </Shell>
);

export const GalleryLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={GalleryHorizontalEnd} tone="pink">
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: clampCount(p.count, 6, 9) }).map((_, i) => (
        <Sk
          key={i}
          className={`aspect-square w-full rounded-md ${i === 0 ? "bg-pink-500/15" : ""}`}
        />
      ))}
    </div>
  </Shell>
);

export const KanbanLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={Kanban} tone="amber">
    <div className="flex gap-2">
      {[0, 1, 2].map((col) => (
        <div
          key={col}
          className={`flex-1 space-y-2 rounded-md p-2 ${
            col === 0 ? "bg-amber-500/10" : "bg-muted/40"
          }`}
        >
          <Sk className="h-2.5 w-16" />
          <Sk className="h-10 w-full rounded-md" />
          {col !== 2 ? <Sk className="h-10 w-full rounded-md" /> : null}
        </div>
      ))}
    </div>
  </Shell>
);

export const TreeLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={GitBranch} tone="emerald">
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sk className="h-3.5 w-3.5 rounded-sm bg-emerald-500/25" />
        <Sk className="h-3 w-1/3" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="ml-5 flex items-center gap-2">
          <Sk className="h-3.5 w-3.5 rounded-sm bg-emerald-500/15" />
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
  <Shell {...p} defaultIcon={Code2} tone="cyan">
    <div className="space-y-1.5 rounded-md bg-muted/40 p-3 font-mono">
      <Sk className="h-2.5 w-1/3 bg-cyan-500/25" />
      <Sk className="ml-4 h-2.5 w-1/2" />
      <Sk className="ml-4 h-2.5 w-2/5 bg-fuchsia-500/15" />
      <Sk className="ml-8 h-2.5 w-1/3" />
      <Sk className="h-2.5 w-1/6 bg-cyan-500/25" />
    </div>
  </Shell>
);

export const MapLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={MapIcon} tone="emerald">
    <div className="relative flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-emerald-500/10 via-muted/50 to-muted/50">
      <MapIcon className="h-6 w-6 animate-pulse text-emerald-500/50" />
      <Sk className="absolute left-1/4 top-1/3 h-2.5 w-2.5 rounded-full bg-rose-500/50" />
      <Sk className="absolute right-1/3 top-1/2 h-2.5 w-2.5 rounded-full bg-rose-500/40" />
      <Sk className="absolute bottom-1/4 left-1/2 h-2.5 w-2.5 rounded-full bg-rose-500/30" />
    </div>
  </Shell>
);

export const ProgressLoading: React.FC<KindLoadingProps> = (p) => (
  <Shell {...p} defaultIcon={TrendingUp} tone="blue">
    <div className="space-y-3">
      {Array.from({ length: clampCount(p.count, 3, 5) }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <Sk className="h-2.5 w-24" />
            <Sk className="h-2.5 w-8" />
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full animate-pulse rounded-full bg-blue-500/40"
              style={{ width: `${[62, 38, 80, 25, 55][i % 5]}%` }}
            />
          </div>
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
      <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
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
  <Shell {...p} defaultIcon={Shapes} tone="violet">
    <div className="space-y-2">
      <Sk className="h-2.5 w-2/3" />
      <Sk className="h-2.5 w-1/2 bg-violet-500/10" />
      <Sk className="h-2.5 w-5/6" />
    </div>
  </Shell>
);
