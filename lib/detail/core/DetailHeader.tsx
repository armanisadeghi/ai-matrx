// lib/detail/core/DetailHeader.tsx
//
// The header's two halves, filled into whichever shell is showing the record:
//   <DetailTitle>   icon · name · type chip · the record's own doors
//   <DetailActions> previous / next · open-as (window / docked / page) · copy id
// Compact on purpose: a WindowPanel centres its title across the whole bar and
// a wide action cluster overlaps it.

"use client";

import { useState } from "react";
import {
  AppWindow,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  PanelRight,
} from "lucide-react";
import { cn } from "@ai-matrx/design-system";

import { useDetailHost } from "../host";
import type { DetailPresentation } from "../types";
import type { DetailCore } from "./useDetailCore";

const ICON_BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors " +
  "hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:h-10 pointer-coarse:w-10";

const PRESENTATIONS: {
  value: DetailPresentation;
  label: string;
  Icon: typeof AppWindow;
}[] = [
  { value: "window", label: "Open as window", Icon: AppWindow },
  { value: "docked", label: "Open docked to the side", Icon: PanelRight },
  { value: "page", label: "Open as page", Icon: Expand },
];

export function DetailTitle({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const Icon = core.recordType?.icon ?? null;
  const accent = core.recordType?.accent ?? null;
  const label = core.recordType?.label ?? core.ref.type;
  const RecordDoors = host.doors.RecordDoors;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {Icon ? <Icon className={cn("h-4 w-4 shrink-0", accent?.text)} /> : null}
      <span className="truncate text-sm font-medium text-foreground">{core.title}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
          accent?.bg ?? "bg-muted",
          accent?.text ?? "text-muted-foreground",
          accent?.ring ?? "ring-border",
        )}
      >
        {label}
      </span>
      {/* The record's own doors — a SIBLING of the title, never inside a button.
          The host's control renders nothing when the token has no route and no
          peek, so an unregistered type keeps the copy chip and nothing else. */}
      {core.entityToken ? (
        <RecordDoors token={core.entityToken} id={core.ref.id} name={core.title} />
      ) : null}
    </div>
  );
}

export function DetailActions({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    const ok = await host.copyText(core.ref.id);
    if (!ok) {
      host.notify.error("Could not copy the record id to the clipboard.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const list = core.list;

  return (
    <div className="flex items-center gap-0.5" data-detail-actions>
      {list.context ? (
        <>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={list.prev}
            disabled={!list.hasPrev}
            aria-label="Previous record ( [ )"
            title="Previous record  [ "
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
            {list.context.index + 1}/{list.context.items.length}
          </span>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={list.next}
            disabled={!list.hasNext}
            aria-label="Next record ( ] )"
            title="Next record  ] "
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        </>
      ) : null}

      {PRESENTATIONS.filter((p) => p.value !== core.presentation).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={ICON_BUTTON}
          onClick={() => core.switchTo(value)}
          aria-label={label}
          title={label}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}

      <button
        type="button"
        onClick={() => void copyId()}
        className="ml-1 inline-flex h-7 max-w-[160px] items-center gap-1 rounded-md bg-muted px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10"
        aria-label="Copy record id"
        title="Copy record id"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
        <span className="hidden truncate sm:inline">{core.ref.id}</span>
      </button>
    </div>
  );
}
