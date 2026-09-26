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
 *
 * 🚨 A LINK ONLY WHERE THERE IS A PAGE. This chip used to turn ANY `source_url`
 * that did not start with `/` into `<a target="_blank">` titled "Open source",
 * and the Google Tasks import writes an API resource URL there — measured
 * unauthenticated: HTTP 401 with a JSON error body. Every imported Google task
 * therefore shipped a clickable chip that landed a non-technical expert on an API
 * error, while the only "do not render this as a page" warning lived as a comment
 * in the import panel that never renders it (VERIFY-B1-B2-R2 N5). The decision is
 * now `../provenance-door.ts`, in the shared layer, so every surface inherits it:
 * a source that is not a page renders as PROVENANCE WITHOUT A DOOR and says why
 * on hover — never hidden (it is true), never linked (it would not open).
 */

import React from "react";
import Link from "next/link";
import { ClipboardCheck, Cog, Link as LinkIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import { provenanceDoorFor } from "../provenance-door";
import type { TaskOrigin } from "../constants/status";
import { AGENT_ICON } from "@/components/icons/domain-icons";

const ORIGIN_META: Record<
  Exclude<TaskOrigin, "user">,
  { label: string; icon: typeof AGENT_ICON }
> = {
  agent: { label: "Agent", icon: AGENT_ICON },
  system: { label: "System", icon: Cog },
};

/**
 * Display-only icon per known producer, keyed on the generic `source_type`
 * value. Purely cosmetic: an unmapped source type falls back to the origin
 * icon, so a new producer needs no entry here to get a working badge.
 */
const SOURCE_TYPE_ICON: Record<string, typeof AGENT_ICON> = {
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
    // The hover affordance follows the DOOR, not the mere presence of a url: a
    // chip that lights up on hover and does nothing is the same lie in miniature.
    sourceUrl &&
      provenanceDoorFor(sourceUrl).kind !== "not-a-page" &&
      "hover:bg-violet-500/20 transition-colors",
    className,
  );

  if (sourceUrl) {
    const door = provenanceDoorFor(sourceUrl);
    const title = `Open source: ${sourceLabel ?? sourceUrl}`;
    // A row is a click target of its own — the door must never double as a
    // row selection.
    const stopRowClick = (e: React.MouseEvent) => e.stopPropagation();
    if (door.kind === "internal") {
      return (
        <Link
          href={door.href}
          className={chipClass}
          title={title}
          onClick={stopRowClick}
        >
          {body}
        </Link>
      );
    }
    if (door.kind === "external") {
      return (
        <a
          href={door.href}
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
    // not-a-page: the provenance is true, so it is shown; it is not a door, so
    // it does not pretend to be one, and the reason is on hover.
    return (
      <span
        className={cn(chipClass, "cursor-default")}
        title={`${sourceLabel ?? "Task provenance"} — ${door.reason}`}
      >
        {body}
      </span>
    );
  }
  return (
    <span className={chipClass} title="Task provenance">
      {body}
    </span>
  );
}
