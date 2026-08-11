"use client";

/**
 * PageBriefBlock — THE renderer for the `page_brief` kind. There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component. If you need part of a brief
 * somewhere, import the PART exported below — `PageBriefAngle`,
 * `PageBriefPoints`, `PageBriefMustNotCover`, `PageBriefConcerns`. If you need
 * it editable, use `editable` + `onBriefChange`. If you need a verb on it, name
 * a surface write target with `acceptTarget` — the component runs it through
 * the one action path, so the button a human clicks and the target an agent
 * applies are the SAME operation. **Do not build a second brief renderer.**
 * One was built — the hand-rolled brief inside
 * `features/marketing/content-plan/components/BriefEditor.tsx` (deleted
 * 2026-08-11; that file survives only as the panel's composition shell for the
 * accept decision and the run history, neither of which is part of the shape)
 * — and it immediately diverged: it crushed full-paragraph directives into
 * one-line textareas while this component rendered the same data correctly in
 * the window beside it.
 *
 * Streaming-first by construction: every field is optional at render time
 * because mid-stream it genuinely is. The component mounts the instant the
 * discriminator parses, and each section appears as its value closes — a
 * partially arrived brief is a normal, readable state, never a spinner and
 * never raw JSON.
 *
 * Consumes the bridge serverData from `features/content-ir/kinds/page-brief.ts`.
 */

import { useState, type ReactNode } from "react";
import {
  Check,
  Compass,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { PageBriefData } from "@/features/content-ir/kinds/page-brief";
import { useKindActionRunner } from "@/features/content-ir/react/actions/useKindActionRunner";
import { cn } from "@/lib/utils";

export interface PageBriefBlockProps {
  serverData?: unknown;
  /**
   * Edit the brief points in place — add, remove, rewrite. Requires
   * `onBriefChange`. The other three fields are the RUN's output, not the
   * user's document, so they stay read-only.
   */
  editable?: boolean;
  onBriefChange?: (lines: string[]) => void;
  /**
   * Name of the surface write target that accepts this brief. When set, the
   * component renders its own "Use this brief" button and runs it through the
   * ONE action path — `runAction("apply_surface_write", …)` → the mounted
   * surface's declared write target. There is no second mechanism: the same
   * target is what an agent applies, so a human click and an agent write are
   * literally the same operation.
   */
  acceptTarget?: string;
  /** Button copy. Defaults to "Use this brief". */
  acceptLabel?: string;
  /** Hide the accept button when there is nothing pending to accept. */
  canAccept?: boolean;
  /** Copy for the empty state when the brief has no points and is editable. */
  emptyHint?: string;
  className?: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps, so a stale/foreign `serverData` renders
 * nothing rather than throwing inside the stream.
 */
export function readPageBriefData(serverData: unknown): PageBriefData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PageBriefData>;
  if (!Array.isArray(candidate.brief)) return null;
  return {
    brief: strings(candidate.brief),
    angle: typeof candidate.angle === "string" ? candidate.angle : null,
    mustNotCover: strings(candidate.mustNotCover),
    concerns: strings(candidate.concerns),
    suggestedWordCount:
      typeof candidate.suggestedWordCount === "number"
        ? candidate.suggestedWordCount
        : null,
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS — importable on their own so a surface can render one section without
// re-implementing it. This is the ONLY sanctioned way to render part of a
// shape.
// ---------------------------------------------------------------------------

function SectionShell({
  icon,
  title,
  tone = "default",
  headerExtra,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: "default" | "primary";
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in rounded-lg border p-3",
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            tone === "primary" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        {headerExtra ? <div className="ml-auto">{headerExtra}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PageBriefAngle({ angle }: { angle: string | null }) {
  if (!angle) return null;
  return (
    <SectionShell
      icon={<Compass className="h-3.5 w-3.5 text-primary" />}
      title="Angle"
      tone="primary"
    >
      <p className="mt-1 text-sm leading-relaxed text-foreground">{angle}</p>
    </SectionShell>
  );
}

/**
 * The brief itself. Read-only by default; `editable` turns each point into a
 * field that GROWS WITH ITS CONTENT.
 *
 * 🚨 `field-sizing-content` + `min-h-*`, never `rows={1}`. A brief point is a
 * full sentence or a paragraph; a fixed one-row textarea shows the user four
 * words of their own directive and hides the rest behind a scroll nub. That
 * exact bug is why the bespoke duplicate of this component was deleted.
 */
export function PageBriefPoints({
  lines,
  editable = false,
  onChange,
  emptyHint,
}: {
  lines: string[];
  editable?: boolean;
  onChange?: (next: string[]) => void;
  emptyHint?: string;
}) {
  const canEdit = editable && typeof onChange === "function";

  const setLine = (index: number, value: string) =>
    onChange?.(lines.map((line, position) => (position === index ? value : line)));
  const removeLine = (index: number) =>
    onChange?.(lines.filter((_, position) => position !== index));

  return (
    <SectionShell
      icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
      title="The brief"
      headerExtra={
        canEdit ? (
          <button
            type="button"
            onClick={() => onChange?.([...lines, ""])}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add point
          </button>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {emptyHint ?? "Waiting for the first instruction…"}
        </p>
      ) : canEdit ? (
        <ul className="mt-1.5 space-y-1.5">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <span className="mt-2 w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <textarea
                value={line}
                onChange={(event) => setLine(index, event.target.value)}
                placeholder="What this page must cover…"
                className="min-h-9 flex-1 resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground shadow-xs transition-[color,box-shadow] outline-none [field-sizing:content] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <button
                type="button"
                onClick={() => removeLine(index)}
                aria-label={`Remove point ${index + 1}`}
                className="mt-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-1.5 list-decimal space-y-1 pl-5">
          {lines.map((line, index) => (
            <li
              key={`${index}-${line.slice(0, 24)}`}
              className="animate-in fade-in text-sm leading-relaxed text-foreground"
            >
              {line}
            </li>
          ))}
        </ol>
      )}
    </SectionShell>
  );
}

function ReadOnlyList({
  icon,
  title,
  hint,
  lines,
  tone,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  lines: string[];
  tone: "default" | "warning";
}) {
  if (lines.length === 0) return null;
  return (
    <SectionShell icon={icon} title={title}>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {lines.map((line, index) => (
          <li
            key={`${index}-${line.slice(0, 24)}`}
            className={cn(
              "text-sm leading-relaxed",
              tone === "warning"
                ? "text-amber-700 dark:text-amber-400"
                : "text-foreground",
            )}
          >
            {line}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export function PageBriefMustNotCover({ lines }: { lines: string[] }) {
  return (
    <ReadOnlyList
      icon={<ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />}
      title="Must not cover"
      hint="Covering these here is the cannibalization the plan exists to prevent."
      lines={lines}
      tone="default"
    />
  );
}

export function PageBriefConcerns({ lines }: { lines: string[] }) {
  return (
    <ReadOnlyList
      icon={
        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      }
      title="Concerns"
      lines={lines}
      tone="warning"
    />
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts. Nothing here that a part could own.
// ---------------------------------------------------------------------------

export default function PageBriefBlock({
  serverData,
  editable = false,
  onBriefChange,
  acceptTarget,
  acceptLabel = "Use this brief",
  canAccept = true,
  emptyHint,
  className,
}: PageBriefBlockProps) {
  const runAction = useKindActionRunner();
  const [accepting, setAccepting] = useState(false);
  const data = readPageBriefData(serverData);
  if (!data) return null;

  const accept = async () => {
    if (!acceptTarget || accepting) return;
    setAccepting(true);
    // The runner never throws and owns its own loud failure reporting; a
    // declined `ask` policy comes back as not-applied, which is not an error.
    await runAction("apply_surface_write", {
      target: acceptTarget,
      value: true,
      origin: "user",
    });
    setAccepting(false);
  };

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Page brief</span>
        {data.brief.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {data.brief.length}
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Writing
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {data.suggestedWordCount !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              ~{data.suggestedWordCount.toLocaleString()} words
            </span>
          )}
          {acceptTarget && canAccept ? (
            <button
              type="button"
              onClick={() => void accept()}
              disabled={accepting}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {accepting ? "Applying…" : acceptLabel}
            </button>
          ) : null}
        </div>
      </div>

      <PageBriefAngle angle={data.angle} />
      <PageBriefPoints
        lines={data.brief}
        editable={editable}
        onChange={onBriefChange}
        emptyHint={emptyHint}
      />
      <PageBriefMustNotCover lines={data.mustNotCover} />
      <PageBriefConcerns lines={data.concerns} />
    </div>
  );
}
