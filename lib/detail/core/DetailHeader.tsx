// lib/detail/core/DetailHeader.tsx
//
// The header's two halves, filled into whichever shell is showing the record:
//   <DetailTitle>   icon · name · type chip · the record's own doors
//   <DetailActions> previous / next · open-as (window / docked / page) · copy id
//
// 🚨 TWO RULES THIS FILE EXISTS TO HOLD (VERIFY-U-P1, D2 and D4):
//
// 1. THE NAME IS THE ONE THING THE HEADER ALWAYS SHOWS. At 390px the page
//    header used to reduce to icon + type chip + icons, with the record's name
//    gone and the id chip colliding with the shell's own right-hand cluster —
//    a person could not tell WHICH record they were looking at. The type chip
//    and the record's doors now step aside below `sm` and reappear in the
//    body's meta line (`DetailRecordMeta`), which is where "below or into
//    overflow" lands. The name never steps aside.
//
// 2. THE ACTION CLUSTER IS ICONS ONLY, AT EVERY WIDTH. A `WindowPanel` centres
//    its title across the whole bar, so a wide action cluster is drawn on top
//    of it. The old copy control carried the full uuid behind a `sm:` class —
//    and `sm:` answers the VIEWPORT, not the 540px window, so on a 1440px
//    screen the id text was always there and always overlapped. The id lives
//    in the body meta line instead; up here it is one copy icon.
//
// 3. A stand-in title (loading / not found / failed) is rendered AS a stand-in:
//    muted, with no doors beside it, because there is no record to open.

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

const TYPE_CHIP =
  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset";

const PRESENTATIONS: {
  value: DetailPresentation;
  label: string;
  Icon: typeof AppWindow;
}[] = [
  { value: "window", label: "Open as window", Icon: AppWindow },
  { value: "docked", label: "Open docked to the side", Icon: PanelRight },
  { value: "page", label: "Open as page", Icon: Expand },
];

function TypeChip({ core, className }: { core: DetailCore; className?: string }) {
  const accent = core.recordType?.accent ?? null;
  return (
    <span
      className={cn(
        TYPE_CHIP,
        accent?.bg ?? "bg-muted",
        accent?.text ?? "text-muted-foreground",
        accent?.ring ?? "ring-border",
        className,
      )}
      data-detail-type-chip
    >
      {core.typeLabel}
    </span>
  );
}

export function DetailTitle({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const Icon = core.recordType?.icon ?? null;
  const accent = core.recordType?.accent ?? null;
  const RecordDoors = host.doors.RecordDoors;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {Icon ? <Icon className={cn("h-4 w-4 shrink-0", accent?.text)} /> : null}
      {/* The name. Never hidden, never truncated away to nothing. */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-medium",
          core.titleIsStandIn ? "text-muted-foreground" : "text-foreground",
        )}
        data-detail-title
        data-detail-title-standin={core.titleIsStandIn ? "true" : undefined}
      >
        {core.title}
      </span>
      {/* Type chip: desktop only — `DetailRecordMeta` carries it on a phone. */}
      <TypeChip core={core} className="hidden sm:inline-block" />
      {/* The record's own doors — a SIBLING of the title, never inside a button.
          Absent while the title is a stand-in: there is no record to open yet.
          The host's control renders nothing when the token has no route and no
          peek, so an unregistered type keeps the name and nothing else. */}
      {core.entityToken && !core.titleIsStandIn ? (
        <span className="hidden shrink-0 sm:inline-flex">
          <RecordDoors token={core.entityToken} id={core.ref.id} name={core.title} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The type, the id and the record's doors, in the BODY — where the header
 * hands them off below `sm`, and where the id lives at every width now that
 * the header cluster is icons only.
 */
export function DetailRecordMeta({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const RecordDoors = host.doors.RecordDoors;
  const trimmedFrom = core.list.context?.trimmedFrom;
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2"
      data-detail-record-meta
    >
      <TypeChip core={core} className="sm:hidden" />
      {core.entityToken && !core.titleIsStandIn ? (
        <span className="inline-flex sm:hidden">
          <RecordDoors token={core.entityToken} id={core.ref.id} name={core.title} />
        </span>
      ) : null}
      <span className="truncate font-mono text-[10px] text-muted-foreground" data-detail-id>
        {core.ref.id}
      </span>
      {/* 🚨 NEW-7 — A TRIMMED LIST SAYS SO. The page presentation carries its
          list in the URL, capped by `ui.detail.list_context_max_ids`; beyond the
          cap it holds the window around this record. Presenting that window as
          the whole list would be the screen quietly lying about what the arrows
          can reach. */}
      {trimmedFrom ? (
        <span className="w-full text-[10px] text-muted-foreground" data-detail-list-trimmed>
          {`Stepping through ${core.list.context?.items.length} of the ${trimmedFrom} records in the list this was opened from — a link can only carry that many, so the rest are not reachable from here. Open the list again to reach them.`}
        </span>
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
    <div className="flex shrink-0 items-center gap-0.5" data-detail-actions>
      {list.context ? (
        <>
          <button
            type="button"
            className={ICON_BUTTON}
            onClick={list.prev}
            disabled={!list.hasPrev}
            aria-label="Previous record (Up arrow, or left bracket)"
            title="Previous record  ↑ or ["
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
            aria-label="Next record (Down arrow, or right bracket)"
            title="Next record  ↓ or ]"
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

      {/* Icons only: the id itself is in the body meta line (see rule 2). */}
      <button
        type="button"
        onClick={() => void copyId()}
        className={ICON_BUTTON}
        aria-label="Copy record id"
        title="Copy record id"
        data-detail-copy-id
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
