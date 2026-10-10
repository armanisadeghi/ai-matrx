"use client";

/**
 * BoardTile — one item on the plane, in WORLD coordinates.
 *
 * It owns:
 *   1. Registration: its rect goes into the store for culling, fit and minimap.
 *   2. Culling: off-screen it keeps its React state (a stream keeps its
 *      place) but skips layout and paint via `content-visibility: hidden`.
 *   3. Semantic zoom: at overview tier the body is replaced by a title card
 *      whose type is COUNTER-SCALED (`--board-z`), so a 300-tile board is
 *      still a readable map instead of grey confetti.
  4. Gestures: header drag moves it; a flick THROWS it (engine/throw.ts),
 *      with the action named before release.
 *   5. Focus: when focused its live card portals into the focus layer, full
 *      size, growing out of its on-board rect; a dashed outline holds its place.
 *   6. Frame gestures every item type inherits (engine/tile-gestures.ts):
 *      eight resize handles with a constant screen-size hit area, and the
 *      double-click rule (header → fly + live; idle body → fly + interact;
 *      content you are working in → native).
 * The body is a render prop that receives the tile's pace tier, so each
 * content type decides how to use it (a stream paces commits, a video pauses
 * off-screen, an image swaps to a thumbnail…).
 */

import { Activity, createContext, type ReactNode, useContext, useSyncExternalStore, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AfterFirstPaint, TileSkeleton } from "./AfterFirstPaint";
import type { Rect } from "../engine/camera";
import {
  RESIZE_CURSOR,
  RESIZE_HANDLES,
  MIN_TILE_SIZE,
  RESIZE_HANDLE_SCREEN_PX,
  type ResizeHandle,
  doubleClickAction,
  pressAction,
  resizeRect,
} from "../engine/tile-gestures";
import { type PaceTier, RESIZE_AFFORDANCE_ZOOM } from "../engine/lod";
import { beginSnap } from "../engine/snap-gesture";
import { boundsOf, groupMoveSet, shiftMoves } from "../engine/selection";
import {
  FocusHostContext,
  useIsAgentWorking,
  useIsEditing,
  useIsFocused,
  useIsSelected,
  useIsSoleSelected,
  usePaceTier,
  useBoardCameraStore,
  useTileLife,
} from "../engine/react";
import {
  DEFAULT_THROW_ACTIONS,
  THROW_ACTION_LABEL,
  type ThrowAction,
  type ThrowDirection,
  VelocityTracker,
  detectThrow,
} from "../engine/throw";
import { startPointerGesture } from "../engine/pointer-gesture";
import { TileNavigationBoundary } from "../engine/tile-navigation";
import { ErrorBoundaryWithCapture } from "@/lib/error-boundary/ErrorBoundaryWithCapture";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { type StatusFrom, type TileStatus, useTileStatus } from "../streams/useSourceStatus";
import type { BoardAccent } from "../items/types";
import { ConnectHandles, type ConnectPoint } from "./ConnectHandles";
import { OverviewCard, StatusChip } from "./TileFace";

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

export interface BoardTileProps {
  id: string;
  rect: Rect;
  title: string;
  /** Small line under the title (kind, source, model…). */
  subtitle?: string;
  icon?: LucideIcon;
  /** The item type's colour (its far-zoom card). Default `slate`. */
  accent?: BoardAccent;
  /** The item type's name on the far-zoom card ("Note", "War Room"). */
  typeLabel?: string;
  /** Connects this tile to whatever the pointer is released on (the host draws the bound arrow). Omit for none. */
  onConnect?: (id: string, from: ConnectPoint, to: ConnectPoint) => void;
  /** The item's picture for the far-zoom card (`BoardItemType.Face`). */
  faceSlot?: ReactNode;
  /** The item's own status chip (`BoardItemType.status`), drawn by the host in
   * the header (`header`) and on the far-zoom card (`face`). A leaf: its reads
   * never re-render the body. */
  renderStatus?: (variant: "header" | "face", animate: boolean) => ReactNode;
  /** Where the status dot and overview card read from. Read in leaf
   * components only, so progress never re-renders the body. */
  statusFrom?: StatusFrom;
  /** Replaces the plain title in the header (an item type's `TitleField`,
   * e.g. click to rename the note). Sized to its text, so the rest of the
   * header still moves the tile. */
  titleSlot?: ReactNode;
  /** Header actions (screen-sized buttons live in world space too). */
  actions?: ReactNode;
  /** Moves the tile, in world px. Header drag calls it; omit to pin the tile. */
  onMove?: (id: string, x: number, y: number) => void;
  /** Resizes the tile to a world rect; the eight handles call it. REQUIRED so
   * no board can forget resize: pass `useBoard.resizeTile` (it persists and
   * undoes like a move), or `null` only when the host's own layout model
   * cannot store a size — and say why at the call site
   * (`__tests__/resize-wiring.test.ts` holds every board to this). */
  onResize: ((id: string, rect: Rect) => void) | null;
  /** A header drag released with speed. The tile has already flown off and
   * returned to where the drag began; the host carries out the action (and
   * may keep the tile, e.g. when a delete is declined). */
  onThrow?: (id: string, direction: ThrowDirection) => void;
  /** What each direction does — drives the hint shown before release. */
  throwActions?: Record<ThrowDirection, ThrowAction>;
  /** The body may be FROZEN while not needed (`TileLife`). Only for content
   * proven to wake correctly: waking re-runs every effect. */
  sleeps?: boolean;
  /** The body may also be UNMOUNTED beyond the warm budget (it remounts from
   * its saved source). Only for content with nothing unsaved to lose. */
  discardable?: boolean;
  children: (tier: PaceTier) => ReactNode;
}

/** What counts as a control: a press here goes to the control, never the board. */
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "label",
  "video",
  "audio",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='button']",
  "[role='tab']",
  "[role='link']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='slider']",
  "[role='combobox']",
  "[role='textbox']",
  "[data-board-interactive]",
].join(", ");

/** At far zoom a 12px world radius is a square corner on screen: keep it a soft screen-sized one. */
const FACE_RADIUS = { borderRadius: "min(calc(7px / var(--board-z, 1)), 48px)" } as const;

const FLY_DISTANCE_PX = 900;
const FLY_MS = 220;
const FOCUS_IN_MS = 260;

export function BoardTile({
  id,
  rect,
  title,
  subtitle,
  icon: Icon,
  accent = "slate",
  typeLabel,
  onConnect,
  faceSlot,
  renderStatus,
  statusFrom = IDLE_STATUS,
  titleSlot,
  actions,
  onMove,
  onResize,
  onThrow,
  throwActions = DEFAULT_THROW_ACTIONS,
  sleeps = false,
  discardable = false,
  children,
}: BoardTileProps) {
  const store = useBoardCameraStore();
  const paceTier = usePaceTier(id);
  // In the selection (alone or with others); `sole` = the only one (resize, the live tile).
  const selected = useIsSelected(id);
  const lift = useTileLift(id, selected);
  const sole = useIsSoleSelected(id);
  const focused = useIsFocused(id);
  // Content receives input natively only while interacting (or focused).
  const interacting = useIsEditing(id) || focused;
  const focusHost = useContext(FocusHostContext);
  // Live, frozen (kept, paused) or discarded — `TileLife` in engine/camera-store.ts.
  const life = useTileLife(id);

  // A focused tile is read at full size whatever the board's zoom.
  const tier: PaceTier = focused ? "read" : paceTier;
  const headerRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<ThrowAction>("none");
  // Where the last press landed. A header press captures the pointer, so the
  // browser fires the following dblclick at the TILE — the double-click rule
  // reads the real target from here.
  const lastPressRef = useRef<HTMLElement | null>(null);

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

  // Press handling — ONE capture listener on the tile decides what a press is:
  //   · on a control (button, field, link, tab…) → the control gets it, and
  //     the tile becomes INTERACTING, so the first click always works;
  //   · anywhere else while not interacting → select, and drag MOVES the tile
  //     (a release with speed THROWS it — engine/throw.ts);
  //   · inside an interacting tile's body → native (type, select, scroll).
  // The header always moves the tile.
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    const tracker = new VelocityTracker();
    // The drag in flight, if any (`startPointerGesture` ends it on every way a
    // press can end, so a missed release never leaves a tile glued to the cursor).
    let gesture: (() => void) | null = null;
    let shownHint: ThrowAction = "none";
    const showHint = (next: ThrowAction) => {
      if (next !== shownHint) {
        shownHint = next;
        setHint(next);
      }
    };

    const release = (from: { px: number; py: number; x: number; y: number }, e: PointerEvent) => {
      tracker.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const dir = detectThrow(tracker.velocity(), { dx: e.clientX - from.px, dy: e.clientY - from.py });
      const act = dir ? throwActionsRef.current[dir] : "none";
      if (!dir || act === "none" || !onThrowRef.current) return;
      // Fly off in the throw direction, return to where the drag began, then
      // let the host act (it may remove the tile, or keep it).
      onMoveRef.current?.(id, from.x, from.y);
      const z = store.getCamera().z;
      const d = FLY_DISTANCE_PX / z;
      const [tx, ty] = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
      const done = () => onThrowRef.current?.(id, dir);
      if (typeof tile.animate === "function") {
        tile.animate(
          [
            { transform: "translate(0, 0)", opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px)`, opacity: 0 },
          ],
          { duration: FLY_MS, easing: "cubic-bezier(0.4, 0, 1, 1)" },
        ).onfinish = done;
      } else done();
    };

    // A multi-selection drag: everything selected moves together, a selected
    // frame carrying its contents; the smart guides snap the group's bounds.
    // ONE undo step (`dragMany` coalesces); Esc puts it all back; a press that
    // never moves narrows the selection to this tile (unless it just joined).
    const groupDrag = (e: PointerEvent, mover: NonNullable<ReturnType<typeof store.getMover>>, keepOnClick: boolean) => {
      const set = groupMoveSet(store.getSelection(), store.getItems());
      const box = boundsOf(set.values());
      if (!box) return null;
      const px = e.clientX;
      const py = e.clientY;
      let moved = false;
      const snap = beginSnap(store, new Set(set.keys()));
      return startPointerGesture(e, tile, {
        onMove: (m) => {
          if (!moved && Math.hypot(m.clientX - px, m.clientY - py) < 3) return;
          moved = true;
          const z = store.getCamera().z;
          const at = snap.move({ ...box, x: box.x + (m.clientX - px) / z, y: box.y + (m.clientY - py) / z }, m);
          mover.dragMany(shiftMoves(set, at.x - box.x, at.y - box.y));
        },
        onEnd: (how) => {
          gesture = null;
          snap.end();
          if (how === "escape" && moved) mover.dragMany(shiftMoves(set, 0, 0));
          else if (how === "up" && !moved && !keepOnClick) store.select(id);
        },
      });
    };

    // A click that no press led to (assistive tech, a script, a keyboard
    // activation) selects from the click's OWN modifier flags — the same
    // Shift / ⌘ rule a press follows. A press already did its work.
    let pressedAt = 0;
    const click = (e: MouseEvent) => {
      const pressed = pressedAt > 0 && Date.now() - pressedAt < 10_000;
      pressedAt = 0;
      if (pressed || e.button !== 0 || e.ctrlKey || store.getFocused() === id) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-board-resize]") || target.closest("[data-board-connect]") || target.closest(INTERACTIVE_SELECTOR)) return;
      if (e.shiftKey || e.metaKey) store.toggleSelected(id);
      else store.select(id);
    };
    tile.addEventListener("click", click, true);

    const down = (e: PointerEvent) => {
      if (e.button === 0) pressedAt = Date.now();
      // ctrl+click is the macOS right-click: the menu's, never a drag.
      if (e.button !== 0 || e.ctrlKey || store.getFocused() === id) return;
      const target = e.target as HTMLElement;
      lastPressRef.current = target;
      if (target.closest("[data-board-resize]") || target.closest("[data-board-connect]")) return; // the handle owns it
      // The far-zoom card stands in for the whole tile: a press on it moves it, like the header.
      const inHeader = !!headerRef.current?.contains(target) || !!target.closest("[data-board-overview]");
      const press = pressAction({
        pointerType: e.pointerType,
        inHeader,
        onControl: !!target.closest(INTERACTIVE_SELECTOR),
        interacting: store.getEditing() === id,
      });
      if (press === "control") {
        if (!inHeader) store.setEditing(id);
        else store.select(id);
        return; // the control handles its own press
      }
      if (press === "native") return; // native inside
      // Shift / ⌘-click adds the tile to the selection or takes it out (Figma);
      // a press on a tile already in a multi-selection keeps it, so the drag
      // moves them all, and a click there without moving narrows to this one.
      const additive = (e.shiftKey || e.metaKey) && press !== "select-native";
      const inGroup = store.isSelected(id) && store.getSelection().length > 1;
      if (additive) {
        store.toggleSelected(id);
        if (!store.isSelected(id)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      } else if (!inGroup) store.select(id);
      if (press === "select-native") return; // a finger scrolls the content
      if (!canMove) return;
      const mover = store.getMover();
      if (store.getSelection().length > 1 && mover) {
        e.preventDefault();
        e.stopPropagation();
        gesture?.();
        gesture = groupDrag(e, mover, additive || !inGroup);
        return;
      }
      const from = { px: e.clientX, py: e.clientY, x: rectRef.current.x, y: rectRef.current.y };
      tracker.reset({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      e.preventDefault(); // a move never starts a text selection
      e.stopPropagation();
      gesture?.();
      // Smart guides / snap to grid: the pointer proposes, the snap session
      // answers; the store only ever sees the answer (one undo step as before).
      const snap = beginSnap(store, id);
      gesture = startPointerGesture(e, tile, {
        onMove: (m) => {
          tracker.push({ x: m.clientX, y: m.clientY, t: m.timeStamp });
          const z = store.getCamera().z;
          const r = rectRef.current;
          const at = snap.move(
            { x: from.x + (m.clientX - from.px) / z, y: from.y + (m.clientY - from.py) / z, w: r.w, h: r.h },
            m,
          );
          onMoveRef.current?.(id, at.x, at.y);
          const dir = detectThrow(tracker.velocity(), { dx: m.clientX - from.px, dy: m.clientY - from.py });
          showHint(dir && onThrowRef.current ? throwActionsRef.current[dir] : "none");
        },
        onEnd: (how, end) => {
          gesture = null;
          snap.end();
          showHint("none");
          if (how === "escape") onMoveRef.current?.(id, from.x, from.y);
          else if (how === "up" && end) release(from, end);
        },
      });
    };
    tile.addEventListener("pointerdown", down, true);
    return () => {
      tile.removeEventListener("pointerdown", down, true);
      tile.removeEventListener("click", click, true);
      gesture?.();
    };
  // The card keeps its elements through full screen (it is moved, not
  // re-rendered); rebinding on a focus change only ends a stale press.
  }, [store, id, canMove, focused, focusHost]);

  // Full screen MOVES the card's element into the focus layer and back; React
  // keeps it where it always is in the tree. Rendering it in two places (inline,
  // then a portal) remounted everything in it — editors rebuilt, iframes
  // reloaded, a chat lost its place — on every enter and exit. The card is the
  // tile's first child, and its siblings (throw hint, handles) are inserted
  // after it, so React never needs the card's position while it is away.
  // The field the person last typed in inside this card: moving the card drops
  // the browser's focus (without moveBefore), so it is given back after a move.
  const lastFieldRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const tile = tileRef.current;
    const card = cardRef.current;
    if (!tile || !card) return;
    const parent = focused && focusHost ? focusHost : tile;
    if (card.parentElement === parent) return;
    moveInto(parent, card, parent === tile ? tile.firstChild : null);
    const field = lastFieldRef.current;
    if (field && card.contains(field) && document.activeElement !== field) field.focus({ preventScroll: true });
  }, [focused, focusHost]);
  // Keyboard focus inside the tile (a field the person clicked into without the
  // tile becoming "interacting") keeps it awake: it never sleeps under a caret.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let release: (() => void) | null = null;
    const onIn = (e: FocusEvent) => {
      if (!release) release = store.holdAwake(id);
      const t = e.target;
      if (t instanceof HTMLElement && t.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']")) {
        lastFieldRef.current = t;
      }
    };
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && card.contains(e.relatedTarget)) return;
      release?.();
      release = null;
    };
    card.addEventListener("focusin", onIn);
    card.addEventListener("focusout", onOut);
    return () => {
      card.removeEventListener("focusin", onIn);
      card.removeEventListener("focusout", onOut);
      release?.();
    };
  }, [store, id]);

  // Unmounted while full screen: take the card out of the focus layer too.
  useLayoutEffect(
    () => () => {
      const card = cardRef.current;
      if (card && card.parentElement !== tileRef.current) card.remove();
    },
    [],
  );

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
      data-board-card={id}
      data-board-title={title}
      style={overview && !focused ? FACE_RADIUS : undefined}
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden overscroll-contain rounded-xl border bg-card",
        focused ? "border-border shadow-2xl" : selected ? "border-primary" : "border-border",
      )}
    >
      <div
        ref={headerRef}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 border-b border-border px-3",
          onMove && !focused && "cursor-grab active:cursor-grabbing",
        )}
      >
        <StatusDot from={statusFrom} animate={tier === "read"} />
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="flex min-w-0 flex-1">
          {titleSlot ?? <p className="truncate text-sm font-medium text-foreground">{title}</p>}
        </div>
        {!overview && <TileStatus id={id} variant="header" animate={tier === "read"} renderStatus={renderStatus} />}
        {subtitle && (
          <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
            {subtitle}
          </span>
        )}
        {interacting && !focused && (
          <button
            type="button"
            onClick={() => store.setEditing(null)}
            title="Stop interacting (Esc)"
            className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary-ink hover:bg-primary/25"
          >
            Interacting · Esc
          </button>
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
          data-board-body
          className={cn("h-full", interacting ? "select-text" : "select-none")}
          // The board root is `touch-action: none` (its own pan/pinch); a
          // finger on a tile body scrolls the content natively instead.
          style={{ contentVisibility: overview ? "hidden" : "visible", touchAction: "pan-x pan-y" }}
        >
          {life === "discarded" && discardable && !focused ? null : (
            // A frozen tile keeps its state and DOM but runs nothing: effects,
            // store subscriptions, channels and timers are torn down until it
            // is needed again (React's Activity, Chrome's tab freezing).
            <Activity mode={sleeps && life !== "live" && !focused ? "hidden" : "visible"}>
              <TileNavigationBoundary>
                {/* One tile's crash stays in that tile: the board and every other
                    tile keep working, and this one offers a retry. */}
                <ErrorBoundaryWithCapture
                  boundary="BoardTile"
                  relation={id}
                  fallback={(error, reset) => (
                    <div className="p-3">
                      <ErrorNotice
                        size="compact"
                        title="This tile could not be shown"
                        error={error}
                        operation={`Show ${title}`}
                        actions={
                          <Button type="button" variant="outline" onClick={reset}>
                            Try again
                          </Button>
                        }
                      />
                    </div>
                  )}
                >
                  <AfterFirstPaint placeholder={<TileSkeleton typeLabel={typeLabel ?? ""} />}>{children(tier)}</AfterFirstPaint>
                </ErrorBoundaryWithCapture>
              </TileNavigationBoundary>
            </Activity>
          )}
        </div>
      </div>
      {overview && (
        <OverviewCard
          title={title}
          typeLabel={typeLabel}
          media={faceSlot}
          icon={Icon}
          accent={accent}
          selected={selected}
          from={statusFrom}
          status={<TileStatus id={id} variant="face" animate={false} renderStatus={renderStatus} />}
        />
      )}
    </div>
  );

  return (
    <div
      ref={tileRef}
      data-board-tile={id}
      data-board-title={title}
      onDoubleClick={(e) => {
        const direct = e.target as HTMLElement;
        const pressed = lastPressRef.current;
        // Pointer capture retargets the dblclick to the tile itself; the
        // press that began it knows where it really landed.
        const target = direct === tileRef.current && pressed && tileRef.current?.contains(pressed) ? pressed : direct;
        const action = doubleClickAction({
          focused,
          // The frame edge (a resize handle) is chrome, like the header — at
          // far zoom the edge handles cover most of a tiny header.
          inHeader:
            !!headerRef.current?.contains(target) ||
            !!target.closest("[data-board-resize]") ||
            !!target.closest("[data-board-connect]") ||
            !!target.closest("[data-board-overview]"),
          onControl: !!target.closest(INTERACTIVE_SELECTOR),
          interacting,
        });
        if (action === "native") return;
        window.getSelection()?.removeAllRanges();
        // The state board_focus "fly" produces: selected (live), camera fitted.
        store.select(id);
        if (action === "fly-and-interact") store.setEditing(id);
        store.fitItem(id);
      }}
      className={cn(
        "group/tile absolute max-w-none rounded-xl transition-shadow",
        focused
          ? "border-2 border-dashed border-primary/50"
          : interacting
            ? "shadow-xl ring-2 ring-primary"
            : selected
              ? "shadow-lg ring-2 ring-primary/30"
              : "shadow-sm",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        // The selection rises above the drawings layer (z 6) so the tile you work in is never covered —
        // by its place in the order (`useTileLift`), so Send to back / Bring to front show at once.
        zIndex: lift,
        ...(overview && !focused ? FACE_RADIUS : null),
        contentVisibility: culled && !focused ? "hidden" : "visible",
      }}
    >
      {card}
      {hint !== "none" && <ThrowHint action={hint} />}
      {/* At far zoom a tile is a few px on screen and the handles would cover
          it, so a drag would resize instead of move: there, only the
          selected tile shows them (Figma). */}
      {/* Resizing is one tile at a time: a tile in a multi-selection shows none. */}
      {onConnect && !focused && !interacting && tier !== "offscreen" && store.getCamera().z >= RESIZE_AFFORDANCE_ZOOM && (
        <ConnectHandles id={id} rect={rect} onConnect={onConnect} />
      )}
      {onResize && !focused && (sole || interacting || (!selected && tier !== "offscreen" && store.getCamera().z >= RESIZE_AFFORDANCE_ZOOM)) && (
        <ResizeHandles id={id} rect={rect} selected={sole || interacting} onResize={onResize} />
      )}
    </div>
  );
}

/**
 * Tile -> place in the board's order (0 = back). A host that mounts tiles in order provides it so a
 * selected tile's lift respects Bring to front / Send to back.
 */
export const TileLayersContext = createContext<ReadonlyMap<string, number> | null>(null);

/** First z-index above the drawings layer (z 6). */
export const TILE_LIFT_BASE = 7;

/**
 * The z-index of a tile: undefined (natural order, under drawings) unless the selection lifts it. A
 * selected tile rises above the drawings, and so does every tile in FRONT of it in the order — a
 * selected tile is never drawn over a tile that is in front of it. Without a layer map (a host that
 * does not provide one) the selected tile alone lifts.
 */
export function useTileLift(id: string, selected: boolean): number | undefined {
  const store = useBoardCameraStore();
  const layers = useContext(TileLayersContext);
  const get = (): number | undefined => {
    const mine = layers?.get(id);
    if (mine === undefined) return selected ? TILE_LIFT_BASE : undefined;
    let min = Infinity;
    for (const s of store.getSelection()) {
      const l = layers!.get(s);
      if (l !== undefined && l < min) min = l;
    }
    return mine >= min ? TILE_LIFT_BASE + mine : undefined;
  };
  return useSyncExternalStore(store.subscribeSelection, get, get);
}

/** What the agent is doing to this item right now. */
const AGENT_WORKING_STATUS = { tone: "active", label: "Agent working" } as const;

/**
 * The tile's status chip — a leaf, so a status tick never re-renders the body.
 * While an agent's tool call acts on this item (`beginAgentWork`) that says so
 * first; otherwise the item's own status (`BoardItemType.status`).
 */
function TileStatus({
  id,
  variant,
  animate,
  renderStatus,
}: {
  id: string;
  variant: "header" | "face";
  animate: boolean;
  renderStatus?: (variant: "header" | "face", animate: boolean) => ReactNode;
}) {
  const working = useIsAgentWorking(id);
  if (working) return <StatusChip status={AGENT_WORKING_STATUS} variant={variant} animate={animate} />;
  return <>{renderStatus?.(variant, animate)}</>;
}

/**
 * The eight resize handles. Each hit area is RESIZE_HANDLE_SCREEN_PX on screen
 * at any zoom (sized in world px as `px / --board-z`), straddling the edge
 * mostly outside so it never covers a scrollbar. A drag captures the pointer
 * and lays a shield over the whole page, so an iframe or editor inside the
 * tile can never steal it.
 */
export function ResizeHandles({
  id,
  rect,
  selected,
  onResize,
  min = MIN_TILE_SIZE,
}: {
  id: string;
  rect: Rect;
  selected: boolean;
  onResize: (id: string, rect: Rect) => void;
  /** Smallest size a drag may reach (tiles: `MIN_TILE_SIZE`; a drawn shape is smaller). */
  min?: { w: number; h: number };
}) {
  const store = useBoardCameraStore();
  const [active, setActive] = useState<ResizeHandle | null>(null);
  // The gesture lives outside React (`startPointerGesture`): it ends on every
  // way a press can end, so the page-wide shield can never be left up.
  const gesture = useRef<(() => void) | null>(null);
  const onResizeRef = useRef(onResize);
  const rectRef = useRef(rect);
  useEffect(() => {
    onResizeRef.current = onResize;
    rectRef.current = rect;
  });
  // Unmounting mid-resize (the tile removed, focused, culled) ends it.
  useEffect(() => () => gesture.current?.(), []);

  const begin = (handle: ResizeHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey) return; // ctrl+click is the macOS right-click (the menu)
    e.preventDefault();
    e.stopPropagation();
    gesture.current?.();
    const start = rectRef.current;
    const px = e.clientX;
    const py = e.clientY;
    store.select(id);
    setActive(handle);
    const snap = beginSnap(store, id);
    gesture.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      onMove: (m) =>
        onResizeRef.current(
          id,
          snap.resize(
            resizeRect(start, handle, m.clientX - px, m.clientY - py, {
              z: store.getCamera().z,
              keepAspect: m.shiftKey,
              min,
            }),
            handle,
            m,
            min,
          ),
        ),
      onEnd: (how) => {
        gesture.current = null;
        snap.end();
        setActive(null);
        if (how === "escape") onResizeRef.current(id, start);
      },
    });
  };

  const edge = `calc(${RESIZE_HANDLE_SCREEN_PX}px / var(--board-z, 1))`;
  const out = `calc(${-RESIZE_HANDLE_SCREEN_PX * 0.7}px / var(--board-z, 1))`;
  const corner = `calc(${RESIZE_HANDLE_SCREEN_PX * 1.5}px / var(--board-z, 1))`;
  const cornerOut = `calc(${-RESIZE_HANDLE_SCREEN_PX}px / var(--board-z, 1))`;
  const place: Record<ResizeHandle, React.CSSProperties> = {
    n: { top: out, left: corner, right: corner, height: edge },
    s: { bottom: out, left: corner, right: corner, height: edge },
    w: { left: out, top: corner, bottom: corner, width: edge },
    e: { right: out, top: corner, bottom: corner, width: edge },
    nw: { top: cornerOut, left: cornerOut, width: corner, height: corner },
    ne: { top: cornerOut, right: cornerOut, width: corner, height: corner },
    sw: { bottom: cornerOut, left: cornerOut, width: corner, height: corner },
    se: { bottom: cornerOut, right: cornerOut, width: corner, height: corner },
  };
  const dot = `calc(8px / var(--board-z, 1))`;

  return (
    <>
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h}
          data-board-resize={h}
          aria-hidden
          onPointerDown={begin(h)}
          className="absolute z-10 flex max-w-none touch-none items-center justify-center"
          style={{ ...place[h], cursor: RESIZE_CURSOR[h] }}
        >
          {selected && h.length === 2 && (
            <span
              className="pointer-events-none block max-w-none rounded-[2px] border border-primary bg-card"
              style={{ width: dot, height: dot, borderWidth: `calc(1.5px / var(--board-z, 1))` }}
            />
          )}
        </div>
      ))}
      {active &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-board-resize-shield
            aria-hidden
            className="fixed inset-0 z-[2147483647]"
            style={{ cursor: RESIZE_CURSOR[active] }}
          />,
          document.body,
        )}
    </>
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
        style={{ fontSize: "max(13px, min(calc(13px / var(--board-z)), 64px))" }}
      >
        {THROW_ACTION_LABEL[action]}
      </span>
    </div>
  );
}

/** The live dot pulses only where you can read the tile — 100 infinite
 * animations inside the transformed world repaint the board every frame. */
function StatusDot({ from, animate }: { from: StatusFrom; animate: boolean }) {
  const { status } = useTileStatus(from, useBoardCameraStore().isInteracting);
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

/** Move `node` into `parent` before `before`, keeping an iframe's page and an
 * editor's state where the browser can (`moveBefore`, Chrome 133+). */
function moveInto(parent: Element, node: Element, before: Node | null): void {
  const atomic = (parent as Element & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  if (typeof atomic === "function" && node.isConnected && parent.isConnected) {
    try {
      atomic.call(parent, node, before);
      return;
    } catch {
      // Falls back to an ordinary insert (the node reattaches).
    }
  }
  parent.insertBefore(node, before);
}
