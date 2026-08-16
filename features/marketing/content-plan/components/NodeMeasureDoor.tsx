"use client";

/**
 * features/marketing/content-plan/components/NodeMeasureDoor.tsx
 *
 * THE AFTER badge for one plan row — the tree's and the table's shared door
 * into what the live page is actually doing
 * (`docs/handoffs/cms-page-hub.md` item 6: before, during and after are all
 * captured, and a plan surface may never show only the *during*).
 *
 * Beside the existing CMS-page badge (the DURING door — the editor), this
 * renders the page's 28-day Search Console standing and, per THE DOOR LAW,
 * opens the editor's Measure tab, which mounts the canonical page workspace.
 * One component so the tree and the table can never disagree about the number
 * or the destination.
 *
 * Renders NOTHING when the CMS page has no `web_page_id`: no measured page is
 * joined to it yet, so there is no measurement to show and no honest door to
 * offer. That is the state every production row is in today — an absent badge,
 * never a zero.
 */
import { LineChart } from "lucide-react";

import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import type { PageSearchPerformance } from "@/features/marketing/types";
import { cn } from "@/lib/utils";

import { measureDoorModel } from "../lib/measure-door";

export interface NodeMeasureDoorProps {
  /** The paired CMS site — without it the badge is text, not a door. */
  cmsSiteId?: string | null;
  cmsPageId: string;
  /** `client_pages.web_page_id`; null/absent renders nothing at all. */
  webPageId: string | null;
  /** This page's row from `usePlanMeasureOverlay`, if the view has one. */
  performance?: PageSearchPerformance;
  className?: string;
}

export function NodeMeasureDoor({
  cmsSiteId,
  cmsPageId,
  webPageId,
  performance,
  className,
}: NodeMeasureDoorProps) {
  const model = measureDoorModel(webPageId, performance);
  if (!model) return null;
  const { label, title, hasSearchData } = model;

  const badgeClass = cn(
    "inline-flex items-center gap-0.5 rounded px-1 align-middle text-[10px] font-medium leading-4",
    hasSearchData
      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
      : "bg-muted text-muted-foreground",
    className,
  );

  const content = (
    <>
      <LineChart className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {label}
    </>
  );

  if (!cmsSiteId) {
    return (
      <span className={badgeClass} title={title}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={cmsPageEditorHref(cmsSiteId, cmsPageId, "measure")}
      target="_blank"
      rel="noopener noreferrer"
      title={`${title} — open this page's measurement`}
      className={cn(badgeClass, "hover:underline")}
      // Tree rows are selectable AND draggable; table rows open a panel. The
      // badge is a door out of both — swallow the row's gestures.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  );
}
