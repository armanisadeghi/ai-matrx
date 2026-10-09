"use client";

/**
 * AssistsDock — the global, always-available stack of my pending assists.
 *
 * Mounted once in DeferredSingletonCore. Quiet by design: nothing renders at
 * count 0; at count > 0 a compact launcher pill expands into a card stack.
 * Fetches once per session + on window focus — no realtime channel
 * (deliberate: assists are ambient, not urgent).
 *
 * THE USER OWNS THIS CORNER (Arman, 2026-08-19, after fifty chips piled up in
 * one that could be neither moved nor closed). Three controls, and each one
 * has to be real:
 *
 *   - **Drag it** anywhere (desktop). The position is per-user and synced.
 *   - **X** — hover-revealed, and it does not merely hide the pixels: it goes
 *     quiet for the rest of the day, which STOPS CLIENT PRODUCERS EMITTING.
 *     Suggestions nobody will read cost real money to compute; a mute that
 *     only hides them would keep spending it.
 *   - **Quiet for…** — the standard windows, in the same menu as Reset
 *     position and the door to every assist.
 *
 * While quiet the dock renders NOTHING (Arman, 2026-10-02: a silenced dock that
 * still shows is a bug). The door back is the "turn on" control on `/assists`,
 * which is in the sidebar (THE DOOR LAW).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BellOff,
  ChevronDown,
  Clock,
  GripVertical,
  Lightbulb,
  ListChecks,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  fetchMyAssists,
  selectAssistsLoaded,
  selectPendingAssists,
} from "../redux/assistsSlice";
import { AssistChip } from "./AssistChip";
import { useDockDrag } from "./useDockDrag";
import { useAssistClearance } from "../assistClearance";
import { useAssistsPrefs } from "../hooks/useAssistsPrefs";
import { ASSISTS_MANAGER_HREF } from "../constants";
import {
  chooseAssistPresentationCycle,
  isAssistPresentationCycleCurrent,
  presentedAssists,
} from "../presentation-cycle";
import {
  DEFAULT_QUIET_KEY,
  QUIET_WINDOWS,
  type QuietWindowKey,
} from "../quiet";

export default function AssistsDock() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const authReady = useAppSelector(selectAuthReady);
  const accessToken = useAppSelector(selectAccessToken);
  const pending = useAppSelector(selectPendingAssists);
  const loaded = useAppSelector(selectAssistsLoaded);
  const [openRequested, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const {
    ready: preferencesReady,
    quiet,
    goQuiet,
    resume,
    dockPosition,
    setDockPosition,
    presentationCycle,
    setPresentationCycle,
  } = useAssistsPrefs();
  // Derived, not an effect: a quiet dock must never sit open over the page it
  // was just told to get out of.
  const open = openRequested && !quiet;
  const { offset, dragging, onPointerDown, suppressClickRef } = useDockDrag(
    dockPosition,
    setDockPosition,
    !isMobile,
  );

  useEffect(() => {
    if (!authReady || !userId || !accessToken) return;
    if (!loaded) {
      void dispatch(fetchMyAssists({ userId }));
    }
    const onFocus = () => void dispatch(fetchMyAssists({ userId }));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch, authReady, userId, accessToken, loaded]);

  useEffect(() => {
    if (!loaded || !preferencesReady) return;
    if (isAssistPresentationCycleCurrent(presentationCycle)) return;
    // Do not start an empty initial cycle: the first eligible treat should be
    // able to appear immediately. An existing non-empty cycle is replaced at
    // expiry even if its three rows were completed, preserving the no-refill
    // satisfaction within the cycle.
    if (!presentationCycle && pending.length === 0) return;
    setPresentationCycle(
      chooseAssistPresentationCycle(pending, presentationCycle),
    );
  }, [
    loaded,
    preferencesReady,
    pending,
    presentationCycle,
    setPresentationCycle,
  ]);

  // The scroll area under the floating control reserves room for it, so the
  // control never sits on a row's menu, a pager arrow or a card's answer
  // (list-shell fix D, 2026-09-28 — ../assistClearance.ts).
  useAssistClearance(Boolean(userId));

  if (!userId) return null;
  const visible = presentedAssists(pending, presentationCycle);

  if (visible.length === 0 && !quiet) return null;

  const quietFor = (window: QuietWindowKey, label: string) => {
    goQuiet(window);
    setOpen(false);
    toast.success(`Assists quiet for ${label.toLowerCase()}`, {
      action: { label: "Undo", onClick: resume },
    });
  };

  // Fixed positioning from the bottom-right corner; the drag hook already
  // clamped the offset to the current viewport. `pb-safe` keeps the default
  // resting place off the iOS home indicator.
  // A page with a bottom bar (a list's pager, a note's toolbar) publishes its
  // height as --page-bottom-dock-h; the desktop pill rests above it too
  // (page-pass 2026-09-27: it sat on the flashcards list's pager arrow).
  // When no spot near the work is free, the dock rests in the chrome's own slot (the pager bar, or
  // the header beside its right cluster) — `--assist-dock-slot-*`, written by ../assistClearance.ts;
  // unset, each falls back to the floating resting place.
  const style = {
    // The resting place is measured from the app's right edge, not the
    // viewport's: an open canvas column owns the strip beyond it. (A chrome
    // slot is already an absolute measurement and needs no inset.)
    right: `var(--assist-dock-slot-right, calc(${offset.right}px + var(--app-right-inset, 0px)))`,
    // + the auto-dock lift: off any control it would otherwise cover (../assistClearance.ts).
    bottom: `var(--assist-dock-slot-bottom, calc(${offset.bottom}px + var(--page-bottom-dock-h, 0px) + var(--assist-dock-lift, 0px)))`,
    top: "var(--assist-dock-slot-top, auto)",
  };

  // The mobile launcher follows the established inbox/chat-launcher pattern:
  // one 44pt edge button, never a content-width floating pill. The shell's
  // VisualViewportSync writes the keyboard inset; translating by that amount
  // moves this ambient control out of the visible viewport while the user is
  // typing instead of parking it above the keyboard and over the composer.
  const mobileLauncherStyle = {
    // A page with its own bottom dock (the phone note editor's toolbar)
    // publishes its height as --page-bottom-dock-h; the launcher sits above it
    // instead of covering the dock's last button.
    right: "var(--assist-dock-slot-right, calc(0.75rem + var(--app-right-inset, 0px)))",
    bottom:
      "var(--assist-dock-slot-bottom, calc(max(0.75rem, env(safe-area-inset-bottom, 0px)) + var(--page-bottom-dock-h, 0px) + var(--assist-dock-lift, 0px)))",
    top: "var(--assist-dock-slot-top, auto)",
    transform: "translateY(var(--keyboard-inset-height, 0px))",
  };

  // Quiet means invisible (Arman, 2026-10-02). The way back on lives on the
  // Assists page, which is in the sidebar.
  if (quiet) return null;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${visible.length} assist${visible.length === 1 ? "" : "s"}`}
          data-assists-dock=""
          data-assist-dock-pending=""
          data-matrx-floating-bottom=""
          data-matrx-floating-follows-page=""
          className="data-[assist-dock-pending]:invisible fixed right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-glass text-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass transition-[background-color,transform] hover:bg-glass-hover md:hidden data-[assist-dock-yield]:pointer-events-none data-[assist-dock-yield]:opacity-30"
          style={mobileLauncherStyle}
        >
          <Lightbulb className="h-5 w-5 text-primary" />
          <span className="absolute -left-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
            {visible.length}
          </span>
        </button>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent
            className="overflow-hidden"
            style={{
              height:
                "min(85dvh, var(--visual-viewport-height, 85dvh))",
              maxHeight:
                "min(85dvh, var(--visual-viewport-height, 85dvh))",
            }}
          >
            <DrawerHeader className="flex shrink-0 flex-row items-center gap-2 border-b border-border px-3 py-2 text-left">
              <DrawerClose asChild>
                <Button
                  icon={<X />}
                  type="button"
                  variant="quiet"
                  className="shrink-0"
                  aria-label="Close assists"
                />
              </DrawerClose>
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-base">
                  {visible.length} assist{visible.length === 1 ? "" : "s"}
                </DrawerTitle>
              </div>
              <Button
                icon={<BellOff />}
                type="button"
                variant="quiet"
                className="shrink-0"
                onClick={() =>
                  quietFor(
                    DEFAULT_QUIET_KEY,
                    QUIET_WINDOWS.find(
                      (window) => window.key === DEFAULT_QUIET_KEY,
                    )?.label ?? "the rest of today",
                  )
                }
              >
                Quiet 24h
              </Button>
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-safe">
              <div className="space-y-2">
                {visible.map((assist) => (
                  <AssistChip
                    key={assist.id}
                    assist={assist}
                    ambient
                    className="min-h-11 w-full py-0 pl-3 text-sm [&>button:first-of-type]:min-h-11 [&>button:last-of-type]:h-11 [&>button:last-of-type]:w-11 [&>button:last-of-type]:shrink-0"
                  />
                ))}
              </div>
              <Link
                href={ASSISTS_MANAGER_HREF}
                onClick={() => setOpen(false)}
                className="mt-3 flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                Want more? Explore all assists
              </Link>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <div
      className={cn(
        // pointer-events-none on the CONTAINER: it is a layout box larger than
        // its visible children, and it sat over page controls swallowing their
        // clicks (D225 — the record page's Log button). The panel and the pill
        // re-enable their own events below.
        "pointer-events-none fixed z-40 hidden flex-col items-end gap-1.5 pb-safe md:flex",
        // The container is the box that moves, so it is the box that must be hidden while the pill
        // is pending (assistClearance.ts PENDING_ATTR) — a visible container still scores the shift.
        "has-[[data-assist-dock-pending]]:invisible",
        // Docked in the header: the pill stays in the bar and the panel opens DOWN, never off-screen.
        "[:root[data-assist-dock-slot=header]_&]:flex-col-reverse [:root[data-assist-dock-slot=header]_&]:pb-0",
        dragging && "select-none",
      )}
      style={style}
    >
      {open && (
        <div className="pointer-events-auto flex max-h-[50dvh] w-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
          {visible.map((assist) => (
            <AssistChip
              key={assist.id}
              assist={assist}
              ambient
              className="w-full"
            />
          ))}
          {/* A count is a door (THE DOOR LAW) — "+N more" reaches them. */}
          <Link
            href={ASSISTS_MANAGER_HREF}
            className="px-2 py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Want more? Open all assists
          </Link>
        </div>
      )}
      {/* Floating chrome is the PILL only (lib/layout/floating-chrome.ts): the open panel is a
          transient overlay — measuring it grew every page's runway by up to 50dvh when it opened.
          It rests above a list's pager (--page-bottom-dock-h): a page-end surface must not pad for it. */}
      <div
        data-assists-dock=""
        data-assist-dock-pending=""
        data-matrx-floating-bottom=""
        data-matrx-floating-follows-page=""
        className={cn(
          "data-[assist-dock-pending]:invisible pointer-events-auto group flex items-center gap-0.5 rounded-full border border-primary/30 bg-card pl-1 pr-1 shadow-md transition-opacity data-[assist-dock-yield]:pointer-events-none data-[assist-dock-yield]:opacity-30",
          dragging && "ring-1 ring-primary/40",
        )}
      >
        {/* The grab handle is the whole pill on desktop, but the explicit
            gripper is what makes "you can move this" discoverable. */}
        <span
          onPointerDown={onPointerDown}
          className="hidden cursor-grab touch-none px-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing sm:block"
          aria-hidden="true"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onClick={() => {
            if (suppressClickRef.current) return;
            setOpen((v) => !v);
          }}
          className="flex touch-none items-center gap-1.5 py-1.5 pl-1 pr-1 text-xs font-medium text-foreground"
          aria-label={open ? "Collapse assists" : "Show assists"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
          )}
          {visible.length} assist{visible.length === 1 ? "" : "s"}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Assist options"
              className="rounded-full p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Clock className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Quiet every assist for…
              <span className="mt-0.5 block">
                Nothing new is suggested while quiet.
              </span>
            </DropdownMenuLabel>
            {QUIET_WINDOWS.map((window) => (
              <DropdownMenuItem
                key={window.key}
                className="text-xs"
                onSelect={() => quietFor(window.key, window.label)}
              >
                {window.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {dockPosition && (
              <DropdownMenuItem
                className="gap-2 text-xs"
                onSelect={() => setDockPosition(null)}
              >
                <RotateCcw className="h-3 w-3" />
                Reset position
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="gap-2 text-xs">
              <Link href={ASSISTS_MANAGER_HREF}>
                <ListChecks className="h-3 w-3" />
                Open all assists
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() =>
            quietFor(
              DEFAULT_QUIET_KEY,
              QUIET_WINDOWS.find((w) => w.key === DEFAULT_QUIET_KEY)?.label ??
                "the rest of today",
            )
          }
          aria-label="Quiet assists for the rest of today"
          title="Quiet assists for the rest of today — nothing new is suggested until then"
          className="rounded-full p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
