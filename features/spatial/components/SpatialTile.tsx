"use client";

/**
 * SpatialTile — one item on the plane, in WORLD coordinates.
 *
 * It owns:
 *   1. Registration: its rect goes into the store for culling, fit and minimap.
 *   2. Culling: off-screen it keeps its React state (a stream keeps its
 *      place) but skips layout and paint via `content-visibility: hidden`.
 *   3. Semantic zoom: at overview tier the body is replaced by a title card
 *      whose type is COUNTER-SCALED (`--spatial-z`), so a 300-tile board is
 *      still a readable map instead of grey confetti.
  4. Gestures: header drag moves it; a flick THROWS it (engine/throw.ts),
 *      with the action named before release.
 *   5. Focus: when focused its live card portals into the focus layer, full
 *      size, growing out of its on-board rect; a dashed outline holds its place.
 * The body is a render prop that receives the tile's pace tier, so each
 * content type decides how to use it (a stream paces commits, a video pauses
 * off-screen, an image swaps to a thumbnail…).
 */

import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rect } from "../engine/camera";
import type { PaceTier } from "../engine/lod";
import {
  FocusHostContext,
  useFocusedTile,
  usePaceTier,
  useSelectedTile,
  useSpatialStore,
} from "../engine/react";
import {
  DEFAULT_THROW_ACTIONS,
  THROW_ACTION_LABEL,
  type ThrowAction,
  type ThrowDirection,
  VelocityTracker,
  detectThrow,
} from "../engine/throw";
import { type StatusFrom, type TileStatus, useTileStatus } from "../streams/useSourceStatus";

const IDLE_STATUS: StatusFrom = { kind: "static", value: { status: "idle", progress: null } };

const STATUS_DOT: Record<TileStatus, string> = {
  idle: "bg-muted-foreground/40",
  queued: "bg-muted-foreground/60",
  streaming: "bg-primary",
  complete: "bg-success",
  error: "bg-destructive",
};

const STATUS_LABEL: Record<TileStatus, string> = {
  idle: "Idle",
  queued: "Queued",
  streaming: "Live",
  complete: "Done",
  error: "Failed",
};

export interface SpatialTileProps {
  id: string;
  rect: Rect;
  title: string;
  /** Small line under the title (kind, source, model…). */
  subtitle?: string;
  icon?: LucideIcon;
  /** Where the status dot and overview card read from. Read in leaf
   * components only, so progress never re-renders the body. */
  statusFrom?: StatusFrom;
  /** Header actions (screen-sized buttons live in world space too). */
  actions?: ReactNode;
  /** Moves the tile, in world px. Header drag calls it; omit to pin the tile. */
  onMove?: (id: string, x: number, y: number) => void;
  /** A header drag released with speed. The tile has already flown off and
   * returned to where the drag began; the host carries out the action (and
   * may keep the tile, e.g. when a delete is declined). */
  onThrow?: (id: string, direction: ThrowDirection) => void;
  /** What each direction does — drives the hint shown before release. */
  throwActions?: Record<ThrowDirection, ThrowAction>;
  children: (tier: PaceTier) => ReactNode;
}

const FLY_DISTANCE_PX = 900;
const FLY_MS = 220;
const FOCUS_IN_MS = 260;

export function SpatialTile({
  id,
  rect,
  title,
  subtitle,
  icon: Icon,
  statusFrom = IDLE_STATUS,
  actions,
  onMove,
  onThrow,
  throwActions = DEFAULT_THROW_ACTIONS,
  children,
}: SpatialTileProps) {
  const store = useSpatialStore();
  const paceTier = usePaceTier(id);
  const selected = useSelectedTile() === id;
  const focused = useFocusedTile() === id;
  const focusHost = useContext(FocusHostContext);
  // A focused tile is read at full size whatever the board's zoom.
  const tier: PaceTier = focused ? "read" : paceTier;
  const headerRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<ThrowAction>("none");

  // The drag listeners read the latest props through refs. If the effect
  // depended on them, the first move would re-render the tile, tear the
  // listeners down mid-gesture and drop the drag.
  const rectRef = useRef(rect);
  const onMoveRef = useRef(onMove);
  const onThrowRef = useRef(onThrow);
  const throwActionsRef = useRef(throwActions);
  useEffect(() => {
    rectRef.current = rect;
    onMoveRef.current = onMove;
    onThrowRef.current = onThrow;
    throwActionsRef.current = throwActions;
  });

  const canMove = !!onMove;

  // Register once per id; rect changes UPDATE (re-registering would drop the
  // tile's selection and focus mid-drag).
  useEffect(() => store.registerItem(id, rectRef.current), [store, id]);
  useEffect(() => store.updateItem(id, rect), [store, id, rect]);

  // Header drag: move, or THROW (a release with speed — engine/throw.ts).
  useEffect(() => {
    const header = headerRef.current;
    if (!header || !canMove) return;
    const tracker = new VelocityTracker();
    let start: { px: number; py: number; x: number; y: number } | null = null;
    let shownHint: ThrowAction = "none";
    const showHint = (next: ThrowAction) => {
      if (next !== shownHint) {
        shownHint = next;
        setHint(next);
      }
    };
    const pending = (e: PointerEvent): ThrowDirection | null =>
      start
        ? detectThrow(tracker.velocity(), { dx: e.clientX - start.px, dy: e.clientY - start.py })
        : null;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      start = { px: e.clientX, py: e.clientY, x: rectRef.current.x, y: rectRef.current.y };
      tracker.reset({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      store.select(id);
      header.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      tracker.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const z = store.getCamera().z;
      onMoveRef.current?.(id, start.x + (e.clientX - start.px) / z, start.y + (e.clientY - start.py) / z);
      const dir = pending(e);
      showHint(dir && onThrowRef.current ? throwActionsRef.current[dir] : "none");
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const from = start;
      start = null;
      tracker.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const dir = detectThrow(tracker.velocity(), { dx: e.clientX - from.px, dy: e.clientY - from.py });
      showHint("none");
      const act = dir ? throwActionsRef.current[dir] : "none";
      if (!dir || act === "none" || !onThrowRef.current) return;
      // Fly off in the throw direction, return to where the drag began, then
      // let the host act (it may remove the tile, or keep it).
      onMoveRef.current?.(id, from.x, from.y);
      const el = tileRef.current;
      const z = store.getCamera().z;
      const d = FLY_DISTANCE_PX / z;
      const [tx, ty] = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
      const done = () => onThrowRef.current?.(id, dir);
      if (el && typeof el.animate === "function") {
        el.animate(
          [
            { transform: "translate(0, 0)", opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px)`, opacity: 0 },
          ],
          { duration: FLY_MS, easing: "cubic-bezier(0.4, 0, 1, 1)" },
        ).onfinish = done;
      } else done();
    };
    const cancel = () => {
      start = null;
      showHint("none");
    };
    header.addEventListener("pointerdown", down);
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", up);
    header.addEventListener("pointercancel", cancel);
    return () => {
      header.removeEventListener("pointerdown", down);
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", up);
      header.removeEventListener("pointercancel", cancel);
    };
  }, [store, id, canMove]);

  // Entering focus: the card grows out of the tile's on-board rect (FLIP).
  useEffect(() => {
    if (!focused) return;
    const card = cardRef.current;
    const placeholder = tileRef.current;
    if (!card || !placeholder || typeof card.animate !== "function") return;
    const a = placeholder.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    card.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`,
          opacity: 0.6,
        },
        { transformOrigin: "top left", transform: "none", opacity: 1 },
      ],
      { duration: FOCUS_IN_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [focused]);

  const culled = tier === "offscreen";
  const overview = tier === "overview";

  const card = (
    <div
      ref={cardRef}
      data-spatial-card={id}
      data-spatial-title={title}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card",
        focused ? "border-border shadow-2xl" : selected ? "border-primary" : "border-border",
      )}
    >
      <div
        ref={focused ? undefined : headerRef}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 border-b border-border px-3",
          onMove && !focused && "cursor-grab active:cursor-grabbing",
        )}
      >
        <StatusDot from={statusFrom} animate={tier === "read"} />
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        {subtitle && (
          <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
            {subtitle}
          </span>
        )}
        {actions}
        <button
          type="button"
          title={focused ? "Back to board (Esc)" : "Focus (Enter)"}
          aria-label={focused ? "Back to board" : "Focus"}
          onClick={() => (focused ? store.unfocus() : store.focus(id))}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {focused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="relative min-h-0 flex-1" aria-hidden={overview}>
        {/* At overview the body stays mounted (a stream keeps its place) but
            is skipped for style, layout and paint. */}
        <div
          data-spatial-body
          className="h-full"
          style={{ contentVisibility: overview ? "hidden" : "visible" }}
        >
          {children(tier)}
        </div>
        {overview && <OverviewCard title={title} from={statusFrom} icon={Icon} />}
      </div>
    </div>
  );

  return (
    <div
      ref={tileRef}
      data-spatial-tile={id}
      data-spatial-title={title}
      onPointerDown={() => store.select(id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-spatial-scroll], button")) return;
        store.fitItem(id);
      }}
      className={cn(
        "absolute max-w-none rounded-xl transition-shadow",
        focused
          ? "border-2 border-dashed border-primary/50"
          : selected
            ? "shadow-lg ring-2 ring-primary/30"
            : "shadow-sm",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: selected ? 5 : undefined,
        contentVisibility: culled && !focused ? "hidden" : "visible",
      }}
    >
      {focused && focusHost ? createPortal(card, focusHost) : card}
      {hint !== "none" && <ThrowHint action={hint} />}
    </div>
  );
}

/** Names the action a release would take, while the pointer is still down. */
function ThrowHint({ action }: { action: ThrowAction }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-foreground/10">
      <span
        className={cn(
          "rounded-full px-3 py-1.5 font-semibold shadow-lg",
          action === "delete" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
        )}
        style={{ fontSize: "max(13px, min(calc(13px / var(--spatial-z)), 64px))" }}
      >
        {THROW_ACTION_LABEL[action]}
      </span>
    </div>
  );
}

/** The live dot pulses only where you can read the tile — 100 infinite
 * animations inside the transformed world repaint the board every frame. */
function StatusDot({ from, animate }: { from: StatusFrom; animate: boolean }) {
  const { status } = useTileStatus(from, useSpatialStore().isInteracting);
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        STATUS_DOT[status],
        animate && status === "streaming" && "animate-pulse",
      )}
      title={STATUS_LABEL[status]}
    />
  );
}

/** The far-zoom face of a tile: counter-scaled so it reads at any zoom. */
function OverviewCard({
  title,
  from,
  icon: Icon,
}: {
  title: string;
  from: StatusFrom;
  icon?: LucideIcon;
}) {
  const { status, progress } = useTileStatus(from, useSpatialStore().isInteracting);
  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-card p-4">
      <div className="flex items-start gap-2">
        {Icon && (
          <Icon
            className="shrink-0 text-muted-foreground"
            style={{ width: "calc(16px / var(--spatial-z))", height: "calc(16px / var(--spatial-z))" }}
          />
        )}
        <p
          className="line-clamp-3 font-semibold leading-tight text-foreground"
          style={{ fontSize: "min(calc(15px / var(--spatial-z)), 72px)" }}
        >
          {title}
        </p>
      </div>
      <div className="space-y-2">
        <p
          className="font-medium text-muted-foreground"
          style={{ fontSize: "min(calc(11px / var(--spatial-z)), 48px)" }}
        >
          {/* One string, one text node: a conditional second node is an
              insertion, and insertions are what the shell's :has() rules
              turn into whole-tree restyles. */}
          {`${STATUS_LABEL[status]}${progress !== null && status === "streaming" ? ` · ${Math.round(progress * 100)}%` : ""}`}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          {/* Steps, not a transition: at this zoom a 5% step needs no easing,
              and 100 bars easing at once invalidate the moving world layer
              every frame. scaleX, never width (width re-runs layout). */}
          <div
            className={cn(
              "h-full w-full origin-left rounded-full",
              status === "error" ? "bg-destructive" : "bg-primary",
            )}
            style={{ transform: `scaleX(${status === "complete" ? 1 : (progress ?? 0)})` }}
          />
        </div>
      </div>
    </div>
  );
}
