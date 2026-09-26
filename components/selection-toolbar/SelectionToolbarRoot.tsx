"use client";

// components/selection-toolbar/SelectionToolbarRoot.tsx
//
// THE ONE SELECTION TOOLBAR (the Notion / Google Docs model). Mounted once,
// under the Alchemy host. It watches the one document selection, finds the
// zones holding it (selection-zones.ts), builds ONE composite ClickTarget and
// renders the Alchemy package's selection layout (`@ai-matrx/alchemy/react/
// selection`) over the ONE action registry — so every action it shows is a
// registered action, gated by the mode table in selection-actions.ts.
//
// This file owns the only look-independent behaviour a selection popup has:
//   • position: above the selection, flipped below when there is no room,
//     clamped to the viewport, following the selection on scroll;
//   • phone / touch: a bar docked at the bottom edge, never beside the
//     selection, so it never fights the native selection menu (Google Docs
//     mobile keeps its tools at the bottom and leaves the callout to the OS);
//   • keyboard: Ctrl/Cmd+Alt+M opens it with focus on the first control,
//     arrows move through it, Esc closes it and focus returns;
//   • panels: an action may swap the strip for its zone's panel (a comment
//     composer) inside the same frame.
// It floats (portal, fixed): it never adds rows or pushes content.

import * as React from "react";
import { createPortal } from "react-dom";
import { createClickTarget, type ClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { SelectionToolbar } from "@ai-matrx/alchemy/react/selection";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  zonesContaining,
  useSelectionZonesVersion,
  type ResolvedZone,
  type SelectionMode,
  type SelectionToolbarUi,
} from "./selection-zones";
import {
  HIGHLIGHT_WHILE_EDITING_DEFAULT,
  HIGHLIGHT_WHILE_EDITING_KNOB,
  ensureProvider,
  passageActionsProvider,
  type SelectionToolbarHost,
} from "./selection-actions";

interface Rect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

interface OpenState {
  /** Bumped per selection: a new target, a fresh resolve. */
  seq: number;
  zones: ResolvedZone[];
  mode: SelectionMode;
  text: string;
  /** Live range for positioning (null for a textarea selection). */
  range: Range | null;
  rect: Rect;
  /** Where focus was when the toolbar opened (restored on Esc). */
  returnFocus: HTMLElement | null;
  focusToolbar: boolean;
}

const GAP = 8;
const EDGE = 8;

function rectOf(r: DOMRect | Rect): Rect {
  return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
}

function isTextField(el: Element | null): el is HTMLTextAreaElement | HTMLInputElement {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && /^(text|search|url|email|tel)$/.test(el.type);
}

/**
 * The frame, or a menu / dialog the frame opened (the More menu, a panel's
 * record picker) — interaction there never re-reads the selection.
 */
function insideToolbar(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return false;
  if (el.closest("[data-selection-toolbar]")) return true;
  const frame = document.querySelector("[data-selection-toolbar]");
  if (!frame) return false;
  const layer = el.closest("[data-radix-popper-content-wrapper], [role='dialog'], [role='menu']");
  // A layer counts only while the frame has something open (its More menu or a panel).
  return Boolean(layer && (frame.querySelector("[aria-expanded='true']") || frame.querySelector("[data-selection-panel]")));
}

export function SelectionToolbarRoot(): React.ReactElement | null {
  const { registry } = useAlchemyActions();
  ensureProvider(registry, passageActionsProvider);
  const isMobile = useIsMobile();
  const zonesVersion = useSelectionZonesVersion();
  const userId = useAppSelector(selectUserId);
  const orgId = useAppSelector(selectOrganizationId);
  const highlightKnob = useEffectiveKnob(orgId, userId, HIGHLIGHT_WHILE_EDITING_KNOB);
  const highlightWhileEditing =
    typeof highlightKnob === "boolean" ? highlightKnob : HIGHLIGHT_WHILE_EDITING_DEFAULT;

  const [open, setOpen] = React.useState<OpenState | null>(null);
  const [panel, setPanel] = React.useState<string | null>(null);
  const openRef = React.useRef(open);
  openRef.current = open;
  const panelRef = React.useRef(panel);
  panelRef.current = panel;
  const frameRef = React.useRef<HTMLDivElement>(null);
  const pointerDown = React.useRef(false);
  const lastPointer = React.useRef<{ x: number; y: number } | null>(null);
  const seq = React.useRef(0);

  const close = React.useCallback((options?: { clearSelection?: boolean; restoreFocus?: boolean }) => {
    const current = openRef.current;
    setOpen(null);
    setPanel(null);
    if (options?.clearSelection) window.getSelection()?.removeAllRanges();
    if (options?.restoreFocus && current?.returnFocus?.isConnected) current.returnFocus.focus({ preventScroll: true });
  }, []);

  /** Read the current selection into an open state (or close). */
  const evaluate = React.useCallback(
    (opts: { focusToolbar?: boolean } = {}) => {
      const active = document.activeElement;
      let node: Node | null = null;
      let text = "";
      let range: Range | null = null;
      let rect: Rect | null = null;
      let fieldEditable = false;
      if (isTextField(active) && active.selectionStart !== null && active.selectionEnd !== null && active.selectionEnd > active.selectionStart) {
        node = active;
        text = active.value.slice(active.selectionStart, active.selectionEnd);
        fieldEditable = !active.readOnly && !active.disabled;
        const p = lastPointer.current;
        const box = active.getBoundingClientRect();
        rect = p && p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom
          ? { left: p.x, top: p.y - 10, bottom: p.y + 10, width: 1 }
          : rectOf(box);
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          range = sel.getRangeAt(0);
          node = range.commonAncestorContainer;
          text = sel.toString();
          const measured = range.getBoundingClientRect();
          rect = measured.width || measured.height ? rectOf(measured) : null;
        }
      }
      if (!node || !text.trim() || insideToolbar(node)) {
        // Interaction inside the toolbar (a composer, a menu) keeps it open.
        if (openRef.current && (insideToolbar(document.activeElement) || panelRef.current)) return;
        if (openRef.current) close();
        return;
      }
      const zones = zonesContaining(node);
      if (zones.length === 0) {
        if (openRef.current) close();
        return;
      }
      if (!rect) rect = rectOf(zones[0].element.getBoundingClientRect());
      const editable =
        fieldEditable ||
        zones.some((z) => z.contribution.editable) ||
        Boolean((node instanceof Element ? node : node.parentElement)?.closest("[contenteditable='true']"));
      const previous = openRef.current;
      const sameSelection = previous && previous.text === text && previous.zones.length === zones.length &&
        previous.zones.every((z, i) => z.id === zones[i].id);
      seq.current += sameSelection ? 0 : 1;
      const initial = zones.map((z) => z.contribution.initialPanel?.() ?? null).find(Boolean) ?? null;
      setOpen({
        seq: seq.current,
        zones,
        mode: editable ? "edit" : "read",
        text,
        range,
        rect,
        returnFocus: previous?.returnFocus ?? (active instanceof HTMLElement && !insideToolbar(active) ? active : null),
        focusToolbar: Boolean(opts.focusToolbar),
      });
      if (!sameSelection) setPanel(initial);
    },
    [close],
  );

  // Selection lifecycle: settle after the pointer lifts (desktop), or after
  // the selection stops moving (touch handles, keyboard).
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!pointerDown.current) evaluate();
      }, ms);
    };
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const collapsed = !sel || sel.rangeCount === 0 || sel.isCollapsed;
      if (collapsed && !isTextField(document.activeElement)) {
        // Collapsing closes promptly (a click elsewhere), unless the person is
        // working inside the toolbar (typing a comment).
        schedule(80);
        return;
      }
      schedule(isMobile ? 450 : 250);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (insideToolbar(e.target as Node)) return;
      pointerDown.current = true;
      // A press anywhere else ends an open panel (a half-typed comment is the
      // composer's own draft to keep; the toolbar does not linger over the page).
      if (panelRef.current) close();
    };
    const onPointerUp = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (insideToolbar(e.target as Node)) return;
      pointerDown.current = false;
      schedule(isMobile ? 350 : 10);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Alt+M — the Google Docs comment chord — opens the toolbar with focus in it.
      if (e.altKey && (e.ctrlKey || e.metaKey) && (e.code === "KeyM" || e.key.toLowerCase() === "m")) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        if (zonesContaining(sel.getRangeAt(0).commonAncestorContainer).length === 0) return;
        e.preventDefault();
        evaluate({ focusToolbar: true });
        return;
      }
      if (e.key === "Escape" && openRef.current) {
        e.preventDefault();
        e.stopPropagation();
        close({ restoreFocus: true });
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [evaluate, close, isMobile]);

  // A zone that unmounts under an open toolbar (the note closed) closes it.
  React.useEffect(() => {
    const current = openRef.current;
    if (current && current.zones.some((z) => !z.element.isConnected)) close();
  }, [zonesVersion, close]);

  const ui: SelectionToolbarUi = React.useMemo(
    () => ({
      openPanel: (p: string) => setPanel(p),
      closePanel: () => setPanel(null),
      close: (options) => close(options),
    }),
    [close],
  );

  // ONE target per selection (a new object only when the selection changes),
  // so the engine resolves once per selection, not per render.
  const target = React.useMemo<ClickTarget | null>(() => {
    if (!open) return null;
    const halves = Object.assign({}, ...[...open.zones].reverse().map((z) => z.contribution.host ?? {}));
    const toolbar: SelectionToolbarHost = {
      kind: "selection-toolbar",
      mode: open.mode,
      knobs: { highlightWhileEditing },
      ui,
    };
    return createClickTarget({
      readOnly: open.mode === "read",
      writable: [],
      selection: { text: open.text, type: open.mode === "edit" ? "editable" : "non-editable", start: 0, end: 0, handle: open.range },
      payloadKinds: ["text"],
      organizationId: orgId ?? null,
      auth: { authenticated: Boolean(userId) },
      host: { ...halves, selectionToolbar: toolbar },
    });
    // `open.seq` is the selection identity; a knob or mode flip re-targets too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.seq, open?.mode, highlightWhileEditing, ui, orgId, userId]);

  // Position (desktop): above the selection, flipped below, clamped; follows scroll.
  const [position, setPosition] = React.useState<{ left: number; top: number; hidden: boolean } | null>(null);
  const place = React.useCallback(() => {
    const current = openRef.current;
    const frame = frameRef.current;
    if (!current || !frame) return;
    let rect = current.rect;
    if (current.range) {
      const live = current.range.getBoundingClientRect();
      if (live.width || live.height) rect = rectOf(live);
    }
    const w = frame.offsetWidth;
    const h = frame.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hidden = rect.bottom < 0 || rect.top > vh;
    let top = rect.top - h - GAP;
    if (top < EDGE) top = rect.bottom + GAP;
    top = Math.max(EDGE, Math.min(vh - h - EDGE, top));
    const center = rect.left + rect.width / 2;
    const left = Math.max(EDGE, Math.min(vw - w - EDGE, center - w / 2));
    setPosition((p) => (p && p.left === left && p.top === top && p.hidden === hidden ? p : { left, top, hidden }));
  }, []);

  React.useLayoutEffect(() => {
    if (!open || isMobile) return;
    place();
    const frame = frameRef.current;
    const ro = frame && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    if (frame) ro?.observe(frame);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, panel, isMobile, place]);

  // Keyboard-opened: focus the first control.
  React.useEffect(() => {
    if (!open?.focusToolbar) return;
    const id = requestAnimationFrame(() => {
      frameRef.current?.querySelector<HTMLElement>("button:not([disabled]), [tabindex='0']")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open?.seq, open?.focusToolbar]);

  if (!open || !target || typeof document === "undefined") return null;

  const panelNode = panel
    ? open.zones.map((z) => z.contribution.renderPanel?.(panel, ui) ?? null).find((n) => n !== null) ?? null
    : null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (panelNode) return; // a panel (composer) owns its keys
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const list = [...(frameRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? list.length - 1
      : e.key === "ArrowRight" || e.key === "ArrowDown" ? (at + 1) % list.length
      : (at - 1 + list.length) % list.length;
    list[next].focus();
  };

  const docked = isMobile;
  return createPortal(
    <div
      ref={frameRef}
      data-selection-toolbar={docked ? "docked" : "floating"}
      data-selection-mode={open.mode}
      onKeyDown={onKeyDown}
      className={
        docked
          ? "fixed inset-x-2 z-[9999] flex justify-center"
          : "fixed z-[9999]"
      }
      style={
        docked
          ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }
          : {
              left: position?.left ?? -10_000,
              top: position?.top ?? -10_000,
              visibility: position && !position.hidden ? "visible" : "hidden",
            }
      }
    >
      {panelNode ? (
        <div data-selection-panel="" className="w-[min(340px,calc(100vw-16px))] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {panelNode}
        </div>
      ) : (
        <SelectionToolbar
          key={open.seq}
          target={target}
          content={open.text}
          className={docked ? "max-w-full overflow-x-auto" : undefined}
        />
      )}
    </div>,
    document.body,
  );
}
