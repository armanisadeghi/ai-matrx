"use client";

/**
 * TaskProvenanceChip — shows who/what created a task and deep-links back to
 * its source. Renders nothing for plain user-created tasks with no source;
 * agent/system tasks always show their origin so users can tell their own
 * work apart from machine-generated work at a glance.
 */

import React from "react";
import { Bot, Cog, Link as LinkIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import type { TaskOrigin } from "../constants/status";

const ORIGIN_META: Record<
  Exclude<TaskOrigin, "user">,
  { label: string; icon: typeof Bot }
> = {
  agent: { label: "Agent", icon: Bot },
  system: { label: "System", icon: Cog },
};

export function TaskProvenanceChip({
  origin,
  sourceType,
  sourceUrl,
  sourceLabel,
  className,
}: {
  origin: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  className?: string;
}) {
  const originMeta =
    origin === "agent" || origin === "system" ? ORIGIN_META[origin] : null;
  const hasSource = !!(sourceUrl || sourceLabel);
  if (!originMeta && !hasSource) return null;

  const label =
    sourceLabel ??
    (sourceType ? `From ${sourceType.replace(/[_-]/g, " ")}` : null);

  const body = (
    <>
      {originMeta ? (
        <originMeta.icon className="w-2.5 h-2.5" />
      ) : (
        <LinkIcon className="w-2.5 h-2.5" />
      )}
      {originMeta ? originMeta.label : null}
      {originMeta && label ? <span className="opacity-50">·</span> : null}
      {label}
    </>
  );

  const chipClass = cn(
    "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium",
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
    sourceUrl && "hover:bg-violet-500/20 transition-colors",
    className,
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target={sourceUrl.startsWith("/") ? undefined : "_blank"}
        rel="noreferrer"
        className={chipClass}
        title={`Open source: ${sourceLabel ?? sourceUrl}`}
        onClick={(e) => e.stopPropagation()}
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
