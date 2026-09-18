"use client";

/**
 * features/capture-ladder/NeedsYouTray.tsx
 *
 * THE TRAY — "3 pages need your browser — open extension". CONTRACT.md §8.1.
 *
 * Small and quiet on purpose. This is not a notification and not a task list:
 * it is a standing count of pages the platform genuinely cannot read without
 * the person's own logged-in Chrome, and the one door to the full list.
 *
 * 🚨 ABSENT AT ZERO. When nothing needs a person, this component renders
 * NOTHING — no greyed pill, no "0 waiting", no disabled-looking control. A
 * screen is absent or honest; a dead chip that says zero is furniture people
 * stop seeing, and it would be the first thing to lie the day the read fails.
 * The failure states are the deliberate exception: when the queue cannot be
 * read at all, the chip appears and says so, because silence there IS the lie.
 *
 * Mounted once, globally, in `app/DeferredSingletonCore.tsx` — the app's one
 * place for small always-on status chrome, beside `LiveCaptureIndicator` and
 * `ErrorInspectorBadge`, and following the same shape as those two: a leaf that
 * owns its own read and returns `null` for everyone it has nothing to say to.
 * It is not scoped to `/scraper/batch`: a handoff is created there but arrives
 * minutes later, on whatever route the person is on.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  GripVertical,
  Hand,
  MonitorSmartphone,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFixedControlScrollPassthrough } from "@/hooks/use-fixed-control-scroll-passthrough";
import { cn } from "@/lib/utils";
import { useDockDrag } from "@/features/assists/components/useDockDrag";
import type { DockOffset } from "@/features/assists/dock-position";
import { NeedsYouList } from "@/features/capture-ladder/NeedsYouList";
import { useNeedsYou } from "@/features/capture-ladder/useNeedsYou";

export const NEEDS_YOU_ROUTE = "/capture/needs-you";

/** The chip's sentence. One line, plain words, no codes. */
export function trayLabel(count: number, needsDriveCount: number): string {
  const pages = count === 1 ? "1 page needs" : `${count} pages need`;
  if (needsDriveCount === 0) return `${pages} your browser — open extension`;
  if (needsDriveCount === count) {
    return count === 1
      ? "1 page needs you to open it — open extension"
      : `${count} pages need you to open them — open extension`;
  }
  return `${pages} your browser — ${needsDriveCount} need you — open extension`;
}

export function NeedsYouTray() {
  const {
    state,
    handoffs,
    count,
    needsDriveCount,
    livenessSentence,
    droppedSentence,
  } = useNeedsYou();
  const [open, setOpen] = useState(false);
  const [dockPosition, setDockPosition] = useState<DockOffset | null>({
    right: 16,
    bottom: 16,
  });
  const isMobile = useIsMobile();
  const { offset, dragging, onPointerDown, suppressClickRef } = useDockDrag(
    dockPosition,
    setDockPosition,
    !isMobile,
  );
  const mobileScroll = useFixedControlScrollPassthrough(isMobile);

  const broken = state.kind === "failed";

  // ABSENT at zero, while loading, and with no workspace. The queue not being
  // provisioned yet is not a fault the person can act on either — the batch
  // screen already says so at the moment they try to use it.
  if (!broken && count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-40 right-3 z-[55] flex max-w-[min(26rem,calc(100vw-1.5rem))] flex-col items-end gap-2 md:bottom-auto md:right-auto",
        dragging && "select-none",
      )}
      style={
        isMobile
          ? undefined
          : { right: `${offset.right}px`, bottom: `${offset.bottom}px` }
      }
    >
      {open ? (
        <div className="max-h-[min(60vh,32rem)] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              Waiting for your browser
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the list"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <NeedsYouList
            state={state}
            handoffs={handoffs}
            livenessSentence={livenessSentence}
            droppedSentence={droppedSentence}
          />
          <Link
            href={NEEDS_YOU_ROUTE}
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open the full list
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        onPointerDown={isMobile ? undefined : onPointerDown}
        onTouchStart={mobileScroll.onTouchStart}
        onTouchMove={mobileScroll.onTouchMove}
        onTouchEnd={mobileScroll.onTouchEnd}
        onTouchCancel={mobileScroll.onTouchEnd}
        onClick={() => {
          if (suppressClickRef.current || mobileScroll.suppressClickRef.current)
            return;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={cn(
          "group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors",
          isMobile
            ? "touch-none"
            : "touch-none cursor-grab active:cursor-grabbing",
          dragging && "ring-1 ring-primary/40",
          broken
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : needsDriveCount > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border bg-card/95 text-foreground hover:bg-accent",
        )}
      >
        <GripVertical
          className="hidden h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50 sm:block"
          aria-hidden="true"
        />
        {broken ? (
          <>
            <AlertTriangle
              className="h-3.5 w-3.5 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">
              Could not check what needs your browser
            </span>
          </>
        ) : (
          <>
            {needsDriveCount > 0 ? (
              <Hand className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            ) : (
              <MonitorSmartphone
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="truncate">
              {trayLabel(count, needsDriveCount)}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

export default NeedsYouTray;
