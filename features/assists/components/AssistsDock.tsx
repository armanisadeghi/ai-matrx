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
 * While quiet the dock collapses to one small muted dot rather than vanishing:
 * `/assists` is not in the sidebar, so a total disappearance would be a dead
 * end with no way back (THE DOOR LAW).
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchMyAssists,
  selectAssistsLoaded,
  selectPendingAssists,
} from "../redux/assistsSlice";
import { AssistChip } from "./AssistChip";
import { useDockDrag } from "./useDockDrag";
import { useAssistsPrefs } from "../hooks/useAssistsPrefs";
import { ASSISTS_MANAGER_HREF, partitionByConfidence } from "../constants";
import {
  DEFAULT_QUIET_KEY,
  formatQuietRemaining,
  QUIET_WINDOWS,
  type QuietWindowKey,
} from "../quiet";

const MAX_VISIBLE = 6;

export default function AssistsDock() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const pending = useAppSelector(selectPendingAssists);
  const loaded = useAppSelector(selectAssistsLoaded);
  const [openRequested, setOpen] = useState(false);
  const { quiet, quietUntil, goQuiet, resume, dockPosition, setDockPosition } =
    useAssistsPrefs();
  // Derived, not an effect: a quiet dock must never sit open over the page it
  // was just told to get out of.
  const open = openRequested && !quiet;
  const { offset, dragging, onPointerDown, suppressClickRef } = useDockDrag(
    dockPosition,
    setDockPosition,
    true,
  );

  useEffect(() => {
    if (!userId) return;
    if (!loaded) {
      void dispatch(fetchMyAssists({ userId }));
    }
    const onFocus = () => void dispatch(fetchMyAssists({ userId }));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch, userId, loaded]);

  if (!userId) return null;
  if (pending.length === 0 && !quiet) return null;

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
  const style = { right: `${offset.right}px`, bottom: `${offset.bottom}px` };

  if (quiet) {
    const remaining = formatQuietRemaining(quietUntil);
    return (
      <div className="fixed z-40 pb-safe" style={style}>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onClick={() => {
            if (suppressClickRef.current) return;
            resume();
            toast.success("Assists are back on");
          }}
          title={
            remaining
              ? `Assists are quiet (${remaining}) — click to turn them back on`
              : "Assists are quiet — click to turn them back on"
          }
          className="flex items-center gap-1 rounded-full border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground opacity-50 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          <BellOff className="h-3 w-3" />
          <span className="sr-only">
            Assists are quiet. Turn them back on.
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            {remaining ?? "quiet"}
          </span>
        </button>
      </div>
    );
  }

  const { strong, weak } = partitionByConfidence(pending);
  const visible = strong.slice(0, MAX_VISIBLE);
  const overflow = strong.length - visible.length + weak.length;

  return (
    <div
      className={cn(
        "fixed z-40 flex flex-col items-end gap-1.5 pb-safe",
        dragging && "select-none",
      )}
      style={style}
    >
      {open && (
        <div className="flex max-h-[50dvh] w-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
          {visible.map((assist) => (
            <AssistChip key={assist.id} assist={assist} className="w-full" />
          ))}
          {/* A count is a door (THE DOOR LAW) — "+N more" reaches them. */}
          <Link
            href={ASSISTS_MANAGER_HREF}
            className="px-2 py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {overflow > 0 ? `+${overflow} more — ` : ""}Open all assists
          </Link>
        </div>
      )}
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-full border border-primary/30 bg-card pl-1 pr-1 shadow-md",
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
          {pending.length} assist{pending.length === 1 ? "" : "s"}
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
