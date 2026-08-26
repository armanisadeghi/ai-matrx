"use client";

/**
 * TaskProvenanceChip — shows who/what created a task and deep-links back to
 * its source. Renders nothing for plain user-created tasks with no source;
 * agent/system tasks always show their origin so users can tell their own
 * work apart from machine-generated work at a glance.
 *
 * This is the ONE provenance badge — detail panes and list rows all render
 * it, and it is driven purely by the generic `origin` / `source_type` /
 * `source_url` / `source_label` columns every projector already writes. A
 * producer never needs its own chip and a list never needs its own query:
 * project the task with a source and the badge + door appear everywhere.
 */

import React from "react";
import Link from "next/link";
import { Bot, ClipboardCheck, Cog, Link as LinkIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import type { TaskOrigin } from "../constants/status";

const ORIGIN_META: Record<
  Exclude<TaskOrigin, "user">,
  { label: string; icon: typeof Bot }
> = {
  agent: { label: "Agent", icon: Bot },
  system: { label: "System", icon: Cog },
};

/**
 * Display-only icon per known producer, keyed on the generic `source_type`
 * value. Purely cosmetic: an unmapped source type falls back to the origin
 * icon, so a new producer needs no entry here to get a working badge.
 */
const SOURCE_TYPE_ICON: Record<string, typeof Bot> = {
  hr_workflow_step: ClipboardCheck,
};

export function TaskProvenanceChip({
  origin,
  sourceType,
  sourceUrl,
  sourceLabel,
  compact = false,
  className,
}: {
  origin: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  /**
   * Dense list rows: drop the origin word and keep icon + source only. The
   * icon already says "machine-made", so the word costs width it can't earn
   * beside a project name and a due date.
   */
  compact?: boolean;
  className?: string;
}) {
  const originMeta =
    origin === "agent" || origin === "system" ? ORIGIN_META[origin] : null;
  const hasSource = !!(sourceUrl || sourceLabel);
  if (!originMeta && !hasSource) return null;

  const label =
    sourceLabel ??
    (sourceType ? `From ${sourceType.replace(/[_-]/g, " ")}` : null);

  const Icon =
    (sourceType ? SOURCE_TYPE_ICON[sourceType] : undefined) ??
    originMeta?.icon ??
    LinkIcon;

  const showOrigin = !!originMeta && (!compact || !label);

  const body = (
    <>
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {originMeta && showOrigin ? originMeta.label : null}
      {originMeta && showOrigin && label ? (
        <span className="opacity-50">·</span>
      ) : null}
      {label ? <span className="truncate">{label}</span> : null}
    </>
  );

  const chipClass = cn(
    "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium max-w-full align-middle",
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
    sourceUrl && "hover:bg-violet-500/20 transition-colors",
    className,
  );

  if (sourceUrl) {
    const title = `Open source: ${sourceLabel ?? sourceUrl}`;
    // A row is a click target of its own — the door must never double as a
    // row selection.
    const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
    if (sourceUrl.startsWith("/")) {
      return (
        <Link
          href={sourceUrl}
          className={chipClass}
          title={title}
          onClick={stopRowClick}
        >
          {body}
        </Link>
      );
    }
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        className={chipClass}
        title={title}
        onClick={stopRowClick}
      >
        {body}
      </a>
    );
  }
  return (
    <span className={chipClass} title="Task provenance">
      {body}
    </span>
  );
}
