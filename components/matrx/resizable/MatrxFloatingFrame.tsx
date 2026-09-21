"use client";

/**
 * MatrxFloatingFrame — the FLOATING presentation of `MatrxDynamicPanelHost`.
 *
 * This is the "lightweight window" Arman asked for on 2026-09-18: *"a slightly
 * more lightweight version of the window panel … doesn't minimize and stuff
 * like that but carries the basics of dragging"*. It exists so a picker or a
 * form never has to live in a blocking modal
 * (`common-docs/policies/every-picker-takes-new-input.md` §4).
 *
 * It is NOT a second floating-surface family. It is one more presentation of
 * the panel host this repo already has in 59 files; the host routes to it on
 * `presentation="floating"` and keeps every other call site on the docked
 * branch untouched.
 *
 * CARRIES: drag by header, edge/corner resize, Escape when topmost, focus in
 * on open and back to the opener on close, z-order shared with `WindowPanel`
 * (same `nextZIndex` counter — see `windowManagerSlice.transientZ`), a bottom
 * drawer below 768, and a nested portal container so a `CreatablePicker`
 * popover mounts INSIDE the window instead of behind it.
 *
 * NEVER GETS: minimize, the tray, persistence/restore, pop-out, URL sync,
 * sidebars, a focus trap, `aria-modal`, `inert` on the page, or a body scroll
 * lock. Each one is either the modal disease or a lost-work trap.
 *
 * 🚨 THE NEVER-LOSE-INPUT CONTRACT (the law's §5, and finding C1 of
 * `common-docs/projects/every-picker-takes-new-input/recon/plan-attack-1.md`,
 * where crossing 768 with the agent-variable editor open destroyed the editor
 * and everything typed into it). The floating frame and the drawer are THE
 * SAME DOM NODE and the same React subtree: crossing the breakpoint changes
 * `className` and `style` on one `<div>` and nothing else. There is no
 * `isNarrow ? <Drawer>{children}</Drawer> : <Floating>{children}</Floating>`
 * anywhere in this file, and there must never be — that ternary is exactly
 * what unmounts the body and eats the person's work. `children` is rendered
 * in one place, once.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PortalContainerProvider } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  raiseTransientWindow,
  releaseTransientWindow,
  selectTransientZIndex,
} from "@/lib/redux/slices/windowManagerSlice";

export type FloatingFrameSize = "sm" | "md" | "lg";

const SIZE_PX: Record<FloatingFrameSize, { width: number; height: number }> = {
  sm: { width: 380, height: 420 },
  md: { width: 560, height: 560 },
  lg: { width: 780, height: 680 },
};

const VIEWPORT_PADDING = 8;
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MIN_HEIGHT = 200;
/** Keyboard drag step; a modifier drops it to 1px. */
const KEY_DRAG_STEP = 20;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeEdge = "e" | "s" | "se";

export type FloatingCloseReason = "escape" | "close-button" | "programmatic";

export interface MatrxFloatingFrameProps {
  /** Stable id — the key this window holds in the shared z-order lane. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: (reason: FloatingCloseReason) => void;
  size?: FloatingFrameSize;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  draggable?: boolean;
  resizable?: boolean;
  /** Blocks Escape and the header close button while true. */
  dismissDisabled?: boolean;
  headerActions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Move focus into the body on open, and back to the opener on close. */
  initialFocus?: boolean;
}

const FIELD_SELECTOR = [
  "[data-panel-initial-focus]",
  "input:not([disabled]):not([type='hidden'])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[contenteditable='true']",
].join(",");

const FALLBACK_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function firstVisibleMatch(root: HTMLElement, selector: string) {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
      (el) =>
        el.getAttribute("aria-hidden") !== "true" &&
        el.getClientRects().length > 0,
    ) ?? null
  );
}

/**
 * The open lite windows, newest last. Escape belongs to the TOPMOST one only —
 * two open windows must not both close on one key. Module scope, because a
 * per-component ref cannot see its siblings (the same mistake that opened two
 * Google consent windows for one intent, `check:google-auth-gate`).
 */
const OPEN_STACK: string[] = [];

/**
 * True when a Radix popper (a `CreatablePicker` list, a Select, a Popover) is
 * open anywhere. That layer owns the Escape; we must not close the window out
 * from under a person who was only dismissing a dropdown.
 */
function aDismissableLayerIsOpen(): boolean {
  return document.querySelector("[data-radix-popper-content-wrapper]") !== null;
}

function clampRect(rect: Rect, vw: number, vh: number): Rect {
  const width = Math.min(rect.width, Math.max(240, vw - VIEWPORT_PADDING * 2));
  const height = Math.min(
    rect.height,
    Math.max(180, vh - VIEWPORT_PADDING * 2),
  );
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, VIEWPORT_PADDING), vw - width - VIEWPORT_PADDING),
    y: Math.min(
      Math.max(rect.y, VIEWPORT_PADDING),
      vh - height - VIEWPORT_PADDING,
    ),
  };
}

export function MatrxFloatingFrame({
  id,
  title,
  description,
  children,
  onClose,
  size = "md",
  width,
  height,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  draggable = true,
  resizable = true,
  dismissDisabled = false,
  headerActions,
  footer,
  className,
  contentClassName = "px-4 py-3",
  initialFocus = true,
}: MatrxFloatingFrameProps) {
  const dispatch = useAppDispatch();
  const zIndex = useAppSelector(selectTransientZIndex(id));
  const isNarrow = useIsMobile();
  /**
   * THE OPENER — captured in the very first render, before this window's body
   * has mounted. It cannot be read later: a form whose first field carries
   * `autoFocus` (the real Add-a-scope-type form does) has already taken focus
   * by the time an effect runs, and the "opener" we would return focus to is
   * then a field inside the window that is about to be destroyed. That is
   * exactly how the first live pass closed with focus on nothing.
   */
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const [rect, setRect] = useState<Rect>(() => {
    const base = SIZE_PX[size];
    return {
      width: width ?? base.width,
      height: height ?? base.height,
      x: 0,
      y: 0,
    };
  });
  const [placed, setPlaced] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  /** What actually gets drawn: the person's rect, kept on screen. */
  const view = clampRect(rect, viewport.w, viewport.h);

  useEffect(() => {
    setPortalTarget(document.getElementById("glass-layer") ?? document.body);
  }, []);

  // Join the shared z-order on mount, leave it on unmount.
  useEffect(() => {
    dispatch(raiseTransientWindow(id));
    OPEN_STACK.push(id);
    return () => {
      dispatch(releaseTransientWindow(id));
      const at = OPEN_STACK.lastIndexOf(id);
      if (at !== -1) OPEN_STACK.splice(at, 1);
    };
  }, [dispatch, id]);

  /**
   * Centre on first paint, and track the viewport.
   *
   * `rect` is the size and place the PERSON chose; it is never shrunk by a
   * viewport change. The clamp happens at render time only, so a window
   * squeezed at 375 comes back at its own size when there is room again —
   * a window that returned from a phone width permanently 359px wide was
   * the first thing this cost us.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!placed) {
      setRect((current) => ({
        ...current,
        x: Math.round((window.innerWidth - current.width) / 2),
        y: Math.round(
          Math.max(56, (window.innerHeight - current.height) / 2.4),
        ),
      }));
      setPlaced(true);
    }
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [placed]);

  // Escape closes the TOPMOST lite window, and only when no inner dismissable
  // layer is holding the key.
  useEffect(() => {
    if (dismissDisabled) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (OPEN_STACK[OPEN_STACK.length - 1] !== id) return;
      if (aDismissableLayerIsOpen()) return;
      e.stopPropagation();
      onClose("escape");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismissDisabled, id, onClose]);

  // Focus in on open; back to the opener on close.
  useEffect(() => {
    if (!initialFocus || !frameEl) return undefined;
    const frame = requestAnimationFrame(() => {
      const content =
        frameEl.querySelector<HTMLElement>("[data-panel-content]") ?? frameEl;
      const target =
        firstVisibleMatch(content, FIELD_SELECTOR) ??
        firstVisibleMatch(content, FALLBACK_SELECTOR) ??
        frameEl;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (opener?.isConnected && !frameEl.contains(opener)) {
        requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      }
    };
  }, [initialFocus, frameEl, opener]);

  const raise = useCallback(() => {
    dispatch(raiseTransientWindow(id));
    const at = OPEN_STACK.lastIndexOf(id);
    if (at !== -1 && at !== OPEN_STACK.length - 1) {
      OPEN_STACK.splice(at, 1);
      OPEN_STACK.push(id);
    }
  }, [dispatch, id]);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!draggable || isNarrow) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // A control in the header bar is a control, not a drag handle.
      if (target.closest("button,a,input,[role='button']")) return;
      e.preventDefault();
      raise();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...view };
      const onMove = (move: PointerEvent) => {
        setRect({
          ...origin,
          x: origin.x + (move.clientX - startX),
          y: origin.y + (move.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [draggable, isNarrow, raise, view],
  );

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLElement>, edge: ResizeEdge) => {
      if (!resizable || isNarrow || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      raise();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...view };
      const onMove = (move: PointerEvent) => {
        const next = { ...origin };
        if (edge === "e" || edge === "se") {
          next.width = Math.max(minWidth, origin.width + (move.clientX - startX));
        }
        if (edge === "s" || edge === "se") {
          next.height = Math.max(
            minHeight,
            origin.height + (move.clientY - startY),
          );
        }
        setRect(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isNarrow, minHeight, minWidth, raise, resizable, view],
  );

  /** Drag is never mouse-only: the handle is focusable and arrow keys move it. */
  const onHandleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (isNarrow || !draggable) return;
      const step = e.shiftKey || e.altKey ? 1 : KEY_DRAG_STEP;
      const delta =
        e.key === "ArrowLeft"
          ? { x: -step, y: 0 }
          : e.key === "ArrowRight"
            ? { x: step, y: 0 }
            : e.key === "ArrowUp"
              ? { x: 0, y: -step }
              : e.key === "ArrowDown"
                ? { x: 0, y: step }
                : null;
      if (!delta) return;
      e.preventDefault();
      setRect((current) => ({
        ...current,
        x: current.x + delta.x,
        y: current.y + delta.y,
      }));
    },
    [draggable, isNarrow],
  );

  if (!portalTarget) return null;

  // ── THE ONE NODE ──────────────────────────────────────────────────────────
  // Floating and drawer differ ONLY in these two values. Same element, same
  // subtree, same children — so crossing 768 is a re-render, never an unmount.
  const style: CSSProperties = isNarrow
    ? { zIndex }
    : {
        zIndex,
        left: view.x,
        top: view.y,
        width: view.width,
        height: view.height,
      };

  const frameClass = isNarrow
    ? "fixed inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl border-t"
    : "fixed rounded-xl border";

  const canDismiss = !dismissDisabled;

  const panel = (
    <div
      ref={setFrameEl}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      data-matrx-lite-window={id}
      data-presentation={isNarrow ? "drawer" : "floating"}
      onPointerDownCapture={raise}
      style={style}
      className={cn(
        "flex flex-col overflow-hidden border-border bg-card text-card-foreground shadow-2xl outline-none",
        "transition-[border-radius] duration-150",
        frameClass,
        className,
      )}
    >
      <div
        onPointerDown={startDrag}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2",
          !isNarrow && draggable && "cursor-grab active:cursor-grabbing",
        )}
      >
        {!isNarrow && draggable ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Move ${typeof title === "string" ? title : "window"} (arrow keys)`}
            onKeyDown={onHandleKeyDown}
            className="h-4 w-1.5 shrink-0 rounded-full bg-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="truncate text-sm font-semibold text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        {headerActions ? (
          <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
        ) : null}
        {canDismiss ? (
          <button
            type="button"
            onClick={() => onClose("close-button")}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div
        data-panel-content
        className={cn("min-h-0 flex-1 overflow-auto", contentClassName)}
      >
        {/*
          The nested portal container: a CreatablePicker popover, a Select or a
          Tooltip opened in here mounts INSIDE this window instead of at
          document.body, where it would land behind the window that opened it.
        */}
        <PortalContainerProvider container={frameEl}>
          {children}
        </PortalContainerProvider>
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2">
          {footer}
        </div>
      ) : null}

      {resizable && !isNarrow ? (
        <>
          <span
            onPointerDown={(e) => startResize(e, "e")}
            className="absolute right-0 top-8 h-[calc(100%-3rem)] w-1.5 cursor-ew-resize"
          />
          <span
            onPointerDown={(e) => startResize(e, "s")}
            className="absolute bottom-0 left-4 h-1.5 w-[calc(100%-2rem)] cursor-ns-resize"
          />
          <span
            onPointerDown={(e) => startResize(e, "se")}
            aria-hidden
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          />
        </>
      ) : null}
    </div>
  );

  return createPortal(panel, portalTarget);
}
