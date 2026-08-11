"use client";

/**
 * PageBriefBlock — renderer for the `page_brief` kind.
 *
 * Streaming-first by construction: every field is optional at render time
 * because mid-stream it genuinely is. The component mounts the instant the
 * discriminator parses, and the angle, brief, must-not-cover, concerns, and
 * word-count sections appear as their values close — a partially arrived
 * brief is a normal, readable state, never a spinner and never raw JSON.
 *
 * Consumes the bridge serverData from
 * features/content-ir/kinds/page-brief.ts. Rendered wherever the pipeline
 * routes the kind — today the content plan's "Draft brief" run in the generic
 * live-run window, and chat.
 */

import type { ReactNode } from "react";
import {
  Compass,
  FileText,
  Loader2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { PageBriefData } from "@/features/content-ir/kinds/page-brief";

export interface PageBriefBlockProps {
  serverData?: unknown;
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

function ListSection({
  icon,
  title,
  lines,
  tone,
}: {
  icon: ReactNode;
  title: string;
  lines: string[];
  tone: "default" | "warning";
}) {
  if (lines.length === 0) return null;
  return (
    <div className="animate-in fade-in rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {lines.map((line, index) => (
          <li
            key={`${index}-${line.slice(0, 24)}`}
            className={
              tone === "warning"
                ? "text-sm text-amber-700 dark:text-amber-400"
                : "text-sm text-foreground"
            }
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PageBriefBlock({ serverData }: PageBriefBlockProps) {
  const data = readPageBriefData(serverData);
  if (!data) return null;

  return (
    <div className="my-2 space-y-2">
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
        {data.suggestedWordCount !== null && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            ~{data.suggestedWordCount.toLocaleString()} words
          </span>
        )}
      </div>

      {data.angle && (
        <div className="animate-in fade-in rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Angle
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground">{data.angle}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The brief
          </span>
        </div>
        {data.brief.length > 0 ? (
          <ol className="mt-1.5 list-decimal space-y-1 pl-5">
            {data.brief.map((line, index) => (
              <li
                key={`${index}-${line.slice(0, 24)}`}
                className="animate-in fade-in text-sm text-foreground"
              >
                {line}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Waiting for the first instruction…
          </p>
        )}
      </div>

      <ListSection
        icon={<ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />}
        title="Must not cover"
        lines={data.mustNotCover}
        tone="default"
      />
      <ListSection
        icon={
          <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        }
        title="Concerns"
        lines={data.concerns}
        tone="warning"
      />
    </div>
  );
}
