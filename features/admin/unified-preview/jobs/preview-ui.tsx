"use client";

/**
 * Shared presentation primitives for the unified-management PREVIEW.
 *
 * THE NO-DEAD-END RULE, applied to a mockup: a control that cannot do the real
 * thing yet must still answer the click. Every control here either says what it
 * WOULD do (`previewToast`) or is visibly inert-styled. Nothing silently does
 * nothing.
 *
 * Icons are Lucide (repo law: Lucide only, no emojis anywhere a user can see) —
 * the harvest's "🤖 / 🔀" shorthand renders as Bot / Workflow.
 */

import type { ReactNode } from "react";
import { Bot, CircleAlert, CircleCheck, TriangleAlert, Workflow } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CoverageState,
  GoalGrounding,
  HolderType,
  JobAtAltitude,
} from "./mock-data";

/** The single honest answer for every control this mockup does not implement. */
export function previewToast(what: string): void {
  toast.info("Preview only — nothing was changed", {
    description: what,
  });
}

export const COVERAGE_META: Record<
  CoverageState,
  {
    label: string;
    tileLabel: string;
    description: string;
    icon: typeof CircleCheck;
    /** Tone: green is silent, orange and red are loud. */
    tile: string;
    badge: string;
    accent: string;
  }
> = {
  met: {
    label: "Met",
    tileLabel: "Met",
    description:
      "An explicit intelligence is assigned. Nothing to say — met is silent.",
    icon: CircleCheck,
    tile: "border-border bg-card hover:bg-muted/40",
    badge:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  fallback: {
    label: "Running on fallback",
    tileLabel: "Running on fallback",
    description:
      "No explicit assignment, but a fallback resolves. It runs — counted, named and visible every single time.",
    icon: TriangleAlert,
    tile: "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 dark:border-amber-400/40",
    badge:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400",
    accent: "text-amber-700 dark:text-amber-400",
  },
  unmet: {
    label: "Unmet",
    tileLabel: "Unmet",
    description:
      "No explicit assignment and no fallback. This errors at runtime, every time.",
    icon: CircleAlert,
    tile: "border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 dark:border-rose-400/40",
    badge: "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-400",
    accent: "text-rose-700 dark:text-rose-400",
  },
};

export function CoverageBadge({
  state,
  className,
}: {
  state: CoverageState;
  className?: string;
}) {
  const meta = COVERAGE_META[state];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      title={meta.description}
      className={cn("gap-1 whitespace-nowrap", meta.badge, className)}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </Badge>
  );
}

export const GROUNDING_META: Record<
  GoalGrounding,
  { letter: string; label: string; className: string }
> = {
  human: {
    letter: "H",
    label: "Human-written goal — a person wrote this sentence.",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  verified: {
    letter: "V",
    label: "AI-drafted, human-verified — a person read it and kept it.",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  ai: {
    letter: "A",
    label: "AI-drafted, unverified — nobody has confirmed this is the job.",
    className:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
};

export function GroundingBadge({ grounding }: { grounding: GoalGrounding }) {
  const meta = GROUNDING_META[grounding];
  return (
    <Badge
      variant="outline"
      title={meta.label}
      className={cn("h-5 w-5 justify-center p-0 font-semibold", meta.className)}
    >
      {meta.letter}
    </Badge>
  );
}

/**
 * The holder chip — an agent or a workflow. In the real board this is an
 * `EntityRef` carrying Open / new tab / Peek. Here it is a preview door: it
 * still answers, and it still names the kind of thing it points at.
 */
export function HolderChip({
  at,
  className,
}: {
  at: JobAtAltitude;
  className?: string;
}) {
  if (!at.holder_name) {
    return (
      <span className="text-xs italic text-muted-foreground">
        nothing holds this job
      </span>
    );
  }
  const Icon: Record<HolderType, typeof Bot> = { agent: Bot, workflow: Workflow };
  const HolderIcon = at.holder_type ? Icon[at.holder_type] : Bot;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        previewToast(`Would open the ${at.holder_type} “${at.holder_name}”.`);
      }}
      title={`Open ${at.holder_name}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs transition-colors hover:bg-accent",
        className,
      )}
    >
      <HolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{at.holder_name}</span>
      {at.version_policy ? (
        <span
          className={cn(
            "shrink-0 rounded px-1 text-[10px] uppercase tracking-wide",
            at.version_policy === "pinned"
              ? "bg-muted text-muted-foreground"
              : "bg-sky-500/10 text-sky-700 dark:text-sky-400",
          )}
        >
          {at.version_policy}
        </span>
      ) : null}
    </button>
  );
}

/** A titled block used throughout the workbench drawer. */
export function PreviewSection({
  title,
  subtitle,
  tone = "plain",
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "plain" | "warn" | "danger";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border p-3",
        tone === "plain" && "border-border bg-card",
        tone === "warn" && "border-amber-500/50 bg-amber-500/5",
        tone === "danger" && "border-rose-500/50 bg-rose-500/5",
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
