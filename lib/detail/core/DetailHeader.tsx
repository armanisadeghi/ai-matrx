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
//    muted, with no doors beside it, because there is no record to open. A
//    record that exists but stores nothing more here is NOT that case: it is
//    named from its type and id and keeps its doors (NEW-9).
//
// 4. THE NAME HAS A FLOOR AND THE CLUSTER COLLAPSES FIRST (NEW-8). At the
//    window's own 360px minimum the cluster left the name ~60px. The name now
//    carries a minimum width and the optional controls (open-as, copy) move into
//    an overflow menu below a CONTAINER width — never a `sm:` viewport class,
//    which cannot know a window's size. See `headerGeometry.ts`.

"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  AppWindowIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ExpandIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  type DetailIconProps,
} from "./icons";
import { cn } from "@ai-matrx/design-system";

import { useDetailHost } from "../host";
import type { DetailPresentation } from "../types";
import type { DetailCore } from "./useDetailCore";

const ICON_BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors " +
  "hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:h-10 pointer-coarse:w-10";

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring pointer-coarse:py-2.5";

const TYPE_CHIP =
  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset";

const PRESENTATIONS: {
  value: DetailPresentation;
  label: string;
  Icon: ComponentType<DetailIconProps>;
}[] = [
  { value: "window", label: "Open as window", Icon: AppWindowIcon },
  { value: "docked", label: "Open docked to the side", Icon: PanelRightIcon },
  { value: "page", label: "Open as page", Icon: ExpandIcon },
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
      {/* What THIS ROW is (chair, 2026-09-18): `recordLabel`, not the type's own
          label — one registered type is regularly a family, and the chip is the
          place a company was called a Person. */}
      {core.recordLabel}
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
        /* `min-w-[6rem]` is DETAIL_TITLE_MIN_WIDTH_CLASS, written out so
            Tailwind compiles it (NEW-8). */
        className={cn(
          "flex-1 truncate text-sm font-medium min-w-[6rem]",
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
      {core.entityToken && core.doorsAvailable ? (
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
      {core.entityToken && core.doorsAvailable ? (
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const copyId = async () => {
    const ok = await host.copyText(core.ref.id);
    if (!ok) {
      host.notify.error("Could not copy the record id to the clipboard.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  // A click anywhere else, or Escape, closes the overflow menu. Escape is left
  // to the menu by the keyboard model precisely because it is a `role="menu"`
  // (NEW-11), so the menu must be the thing that closes on it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  const list = core.list;
  const others = PRESENTATIONS.filter((p) => p.value !== core.presentation);

  return (
    <div className="flex shrink-0 items-center gap-0.5" data-detail-actions>
      {/* Previous / next stay in the bar at every width: they are what the
          person is DOING while stepping through a list. */}
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
            <ChevronLeftIcon className="h-4 w-4" />
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
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        </>
      ) : null}

      {/* 🚨 NEW-8 — THE OPTIONAL CONTROLS YIELD BEFORE THE NAME DOES. Below the
          window header's container width these become one overflow button; the
          classes are the literals `headerGeometry.ts` names, written out so
          Tailwind compiles them, and the guard asserts they agree. */}
      <span
        className="flex items-center gap-0.5 @max-[26rem]/window-header:hidden"
        data-detail-actions-collapsible
      >
        {others.map(({ value, label, Icon }) => (
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
            <CheckIcon className="h-3.5 w-3.5 text-primary" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </span>

      <span className="relative hidden @max-[26rem]/window-header:inline-flex" ref={menuRef}>
        <button
          type="button"
          className={cn(ICON_BUTTON, "hidden @max-[26rem]/window-header:inline-flex")}
          onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
          aria-label="More record actions"
          title="More record actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-detail-actions-overflow
        >
          <MoreHorizontalIcon className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            aria-label="Record actions"
            className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md border border-border bg-card p-1 shadow-md"
            data-detail-actions-menu
          >
            {others.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={() => {
                  setMenuOpen(false);
                  core.switchTo(value);
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                void copyId();
              }}
            >
              <CopyIcon className="h-3.5 w-3.5 shrink-0" />
              Copy record id
            </button>
          </div>
        ) : null}
      </span>
    </div>
  );
}
