"use client";

// features/context-menu-v3/ContextMenuV3.tsx
//
// The INERT shell. Mounted on every surface that wants a context menu, it must
// stay near-empty on render — 99% of surface renders never open the menu, and
// they must pay almost nothing. The shell contains ONLY:
//   - the Radix ContextMenu trigger wrapping the surface's children,
//   - lightweight selection capture (the hard-won macOS-safe logic),
//   - the DOM-text fallback capture that makes Copy/AI work with zero wiring,
//   - the floating-icon button + open state,
//
// On the FIRST open it renders `MenuContent` via next/dynamic({ssr:false}).
// MenuContent owns ALL the weight — the unified-menu + bound-agent hooks (which
// fire the single, deduped fetch on its mount), the launchers, the handlers,
// the react-icons resolver, and every submenu. Every modal/window MenuContent
// needs is dispatched through the OverlayController, so the shell carries zero
// modal code. See `FEATURE.md` and the `code-splitting` skill.

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Slot } from "@radix-ui/react-slot";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  FloatingSelectionIcon,
  shouldRenderFloatingIcon,
} from "./components/FloatingSelectionIcon";
import {
  captureTextareaSelection,
  getEditableSelectionOffsets,
  captureDomSelection,
  getSelectionRect,
  mouseFallbackRect,
  restoreTextareaSelection,
  restoreDomSelection,
  extractElementText,
  type CapturedSelection,
  type SelectionRange,
} from "./utils/selection-tracking";
import {
  DEFAULT_MENU_DENSITY,
  DEFAULT_MENU_LAYOUT,
  type ContextMenuV3Props,
  type MenuContentProps,
  type ResolvedContextMenuContext,
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuEntityRef,
} from "./types";
import {
  mergeResolvedContextData,
  resolveEffectiveEntity,
  sniffEntityFromDom,
} from "./utils/per-row-entity";
import { MenuPresenceProvider, RegistryMenuSourceProvider, contentSourceKey } from "./menu-presence";

import { useOptionalWidgetHandle } from "@/features/agents/hooks/useWidgetHandle";
import { buildEditableWidgetHandle } from "./utils/widget-handle";
import { resolveTableRowMenuDescriptor } from "./table-row-context-registry";
import { CONTEXT_REGION_TRIGGER_ATTRS } from "./region-trigger-attrs";

/**
 * Text-entry targets whose NATIVE menu we must never steal.
 *
 * A read-only menu (`isEditable === false`) offers Copy and AI actions; it
 * offers no Paste, no Undo, no spellcheck, no autofill — everything a user
 * right-clicks a live text field FOR. Swallowing that gesture makes the field
 * strictly less capable than an unwrapped one. Editable surfaces are the
 * opposite case: they wire text mutation into the menu deliberately, so they
 * keep it.
 *
 * Non-text `<input>` types (checkbox, button, range…) have no native text menu
 * to protect, so the record menu still wins there.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function yieldsToNativeTextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // A read-only or disabled field is NOT a live text field: its native menu
  // offers no Paste, no spellcheck, no autofill — nothing v3 lacks — so
  // yielding there trades a rich menu for a poorer one. Found live on the
  // notes tab strip (2026-08-29): the active tab's rename <input> swallowed
  // the tab's entire v3 menu even while the user wasn't renaming. Fields that
  // are only sometimes editable should render readOnly until editing intent
  // (e.g. focus) — then the yield correctly returns while they type.
  if (target instanceof HTMLTextAreaElement)
    return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement)
    return (
      !NON_TEXT_INPUT_TYPES.has(target.type) &&
      !target.readOnly &&
      !target.disabled
    );
  return false;
}

// THE single heavy boundary (T1 + T1e). ssr:false keeps it — the engine hook,
// the agent fetch, the package renderers — off the server render and out of
// the shell's chunk; it mounts on first open only. One boundary for the
// right-click, the floating icon, the phone sheet and the palette (ALC-15 S3:
// the package draws all four from one registry).
const AlchemyMenuContent = dynamic(() => import("./components/AlchemyMenuContent"), {
  ssr: false,
});

type OpenMenu = {
  mode: "context" | "sheet" | "palette";
  point: { x: number; y: number };
};

export function ContextMenuV3({
  children,
  sourceFeature,
  surfaceName,
  menuVersion = 1,
  getApplicationScope,
  contextData = {},
  resolveContextOnOpen,
  contentSource,
  entity,
  excludedRichActions,
  extraRichActions,
  richDocCtxExtras,
  placementMode,
  extraSections,
  resolveExtraSectionsOnOpen,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  undoHint,
  redoHint,
  onViewHistory,
  hasHistory = false,
  scope = "global",
  scopeId = null,
  enableFloatingIcon = true,
  className,
  menuLayout = DEFAULT_MENU_LAYOUT,
  menuDensity = DEFAULT_MENU_DENSITY,
  suppressed = false,
  onMenuOpenChange,
  onCloseAutoFocus,
  isEditable,
  editorId,
  getTextarea,
  onContentInserted,
  onTextReplace,
  onTextInsertBefore,
  onTextInsertAfter,
  onSave,
  onDelete,
}: ContextMenuV3Props) {
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(
    null,
  );
  const [fallbackContent, setFallbackContent] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [showFloatingIcon, setShowFloatingIcon] = useState(false);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Where the desktop menu anchors (pointer, ⋯ button, floating icon) and a
  // counter so every open mounts a fresh engine over a fresh click target.
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [openSeq, setOpenSeq] = useState(0);

  const capturedSelection = useRef<CapturedSelection | null>(null);
  const selectionLocked = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  // The DOM element this instance wraps — the child element itself on both
  // desktop (Radix `ContextMenuTrigger asChild`) and mobile (`Slot`), falling
  // back to the display:contents wrapper only when mobile cannot slot onto a
  // single child. Selection tracking is scoped to it — see handleSelection.
  const selectionOwnerRef = useRef<HTMLElement | null>(null);
  const setSelectionOwner = useCallback((node: HTMLElement | null) => {
    selectionOwnerRef.current = node;
  }, []);
  // Mobile long-press → bottom sheet (no right-click on touch).
  const longPressTimer = useRef<number | null>(null);
  const touchStart = useRef<{
    x: number;
    y: number;
    target: HTMLElement;
    container: HTMLElement;
  } | null>(null);
  // Per-invocation context resolved by `resolveContextOnOpen` (single-instance
  // delegation). State, not a ref — it's written only at right-click (which
  // re-renders to open the menu anyway), and the lazy MenuContent must read it
  // during render to build the effective scope (a ref read in render is banned).
  const [resolvedContext, setResolvedContext] =
    useState<ResolvedContextMenuContext | null>(null);
  const [resolvedExtraSections, setResolvedExtraSections] =
    useState<typeof extraSections>(undefined);
  /**
   * The entity read straight off the right-clicked element's `data-entity-*`
   * attributes (Phase 0, 2026-08-25). State for the same reason as
   * `resolvedContext`: the lazy MenuContent must read it during the render
   * that opens the menu. Only the SHELL sees the clicked element, so the sniff
   * has to happen here. Fills a silence — never overrides a surface answer.
   */
  const [sniffedEntity, setSniffedEntity] =
    useState<ContextMenuEntityRef | null>(null);
  // Set by MenuContent (via suppressSelectionRestore) when an action opens an
  // overlay that should keep focus — so closing the menu doesn't yank it back.
  const skipSelectionRestoreRef = useRef(false);

  // ── Inline agent editing (WidgetHandle) ──────────────────────────────────
  // Editable surfaces get a widget handle derived from the SAME callbacks they
  // already pass the menu, registered here in the shell (NOT in the lazy
  // MenuContent — that unmounts on close, and the handle must outlive the menu
  // for the whole agent stream). Read-only surfaces register nothing. The
  // launch handlers pass the id as `runtime.widgetHandleId`, so agents
  // launched from this menu can stream `widget_text_*` edits into the surface.
  // Weight check: buildEditableWidgetHandle + useOptionalWidgetHandle pull in
  // only types, the callbackManager map, and selection-tracking — no data
  // hooks, no icons; the shell stays inert.
  const widgetHandle = isEditable
    ? buildEditableWidgetHandle({
        getTextarea,
        onTextReplace,
        onTextInsertBefore,
        onTextInsertAfter,
        getApplicationScope,
      })
    : null;
  const widgetHandleId = useOptionalWidgetHandle(widgetHandle);

  // Effective contextData for THIS invocation: static prop + per-target merge,
  // minus the reserved `__entity` key (which is not a value — see below).
  const getEffectiveContextData = (): Record<string, unknown> =>
    mergeResolvedContextData(
      contextData as Record<string, unknown> | undefined,
      resolvedContext,
    );

  // Effective entity for THIS invocation. ONE menu serves N rows, so the row
  // the user actually right-clicked — not the pane — must own Attach To /
  // Share. `resolveContextOnOpen` supplies it via `CONTEXT_MENU_ENTITY_KEY`;
  // when it doesn't, the menu-level `entity` prop stands unchanged.
  // Precedence: an explicit `resolveContextOnOpen` answer (including a
  // deliberate `null`) wins; only when the surface said nothing about the
  // entity does the DOM sniff fill in; the menu-level prop is the floor.
  const surfaceSpokeAboutEntity =
    !!resolvedContext && CONTEXT_MENU_ENTITY_KEY in resolvedContext;
  const effectiveEntity = surfaceSpokeAboutEntity
    ? resolveEffectiveEntity(entity, resolvedContext)
    : (sniffedEntity ?? entity);

  // ── Selection tracking — SCOPED to this instance's wrapped subtree ───────
  // The listener is document-global (that's the only selectionchange there
  // is), but ALL work is gated on ownership: the selection's anchor node —
  // or, for textarea/input selections (where the DOM Range stays parked on
  // the host), the focused element — must live inside our wrapped children.
  // Without this gate every mounted instance on the page (on /notes: the
  // editor + EVERY sidebar row + folder headers) serialized the full
  // selected text via `selection.toString()` (O(document) on a triple-click
  // of a large paste), stored it in its own state, and rendered its own
  // FloatingSelectionIcon at the same coordinates — dozens of stacked
  // translucent buttons compounding into a black-shadowed blob, and N×
  // O(document) main-thread work per selection event: a browser-freeze
  // amplifier (2026-07 /notes freeze class).
  useEffect(() => {
    const handleSelection = () => {
      if (selectionLocked.current) return;
      const owner = selectionOwnerRef.current;
      const selection = window.getSelection();

      const anchor = selection?.anchorNode ?? null;
      const active = document.activeElement;
      const ownsSelection =
        owner != null &&
        ((anchor != null && owner.contains(anchor)) ||
          ((active instanceof HTMLTextAreaElement ||
            active instanceof HTMLInputElement) &&
            owner.contains(active)));

      if (!ownsSelection) {
        // Not ours — clear cheaply, WITHOUT serializing the selection.
        // (setState with an unchanged value bails out, so non-owning
        // instances do zero re-renders after the first clear.)
        setSelectedText("");
        setSelectionRect(null);
        return;
      }

      const text = selection?.toString().trim() || "";
      setSelectedText(text);
      if (text && selection && selection.rangeCount > 0) {
        const rect = getSelectionRect();
        if (rect) setSelectionRect(rect);
        else if (lastMousePos.current)
          setSelectionRect(
            mouseFallbackRect(lastMousePos.current.x, lastMousePos.current.y),
          );
      } else {
        setSelectionRect(null);
      }
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const shouldShow =
      enableFloatingIcon &&
      !suppressed &&
      selectedText.length > 0 &&
      selectionRect !== null &&
      !menuOpen &&
      !dropdownOpen;
    const timer = setTimeout(() => setShowFloatingIcon(shouldShow), 200);
    return () => clearTimeout(timer);
  }, [enableFloatingIcon, selectedText, selectionRect, menuOpen, dropdownOpen]);

  useEffect(() => {
    if (!showFloatingIcon) return undefined;
    const handleScroll = () => {
      setShowFloatingIcon(false);
      setSelectionRect(null);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showFloatingIcon]);

  // ── Capture handlers ─────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (suppressed) return; // yield to the native menu (e.g. streaming)
    if (e.button !== 2) return; // right-click only
    // Must mirror the capture guard exactly. Capturing here would set
    // `selectionLocked` for a menu that is never going to open, and only
    // `handleMenuClose` clears it — so selection tracking would stay frozen
    // for the rest of this instance's life.
    if (!isEditable && yieldsToNativeTextMenu(e.target)) return;
    const target = e.target as HTMLElement;
    resolvePerTargetContext(target);
    selectionLocked.current = true;

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const captured = captureTextareaSelection(target);
      capturedSelection.current = captured;
      if (captured.text) {
        const rect = getSelectionRect();
        if (rect) setSelectionRect(rect);
        else if (lastMousePos.current)
          setSelectionRect(
            mouseFallbackRect(lastMousePos.current.x, lastMousePos.current.y),
          );
      }
      setSelectedText(captured.text);
    } else {
      const captured = captureDomSelection();
      capturedSelection.current = captured;
      if (captured.text && captured.range) {
        try {
          const rect = captured.range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) setSelectionRect(rect);
        } catch {
          // best-effort
        }
      }
      setSelectedText(captured.text);
    }
  };

  // Per-target context resolution — MUST run on EVERY open path (right-click,
  // keyboard contextmenu, mobile long-press/sheet, floating icon), not just
  // button-2 mousedown: single-instance consumers (ItemContextMenu, markdown,
  // PDF regions) build their menu items from this. A double call on the plain
  // right-click path (mousedown then contextmenu) is deliberate — re-resolving
  // is idempotent and keeps lazy configs fresh.
  const resolvePerTargetContext = (target: HTMLElement | null) => {
    const rowMenu = resolveTableRowMenuDescriptor(target);
    setResolvedContext(
      rowMenu?.context ?? (resolveContextOnOpen ? resolveContextOnOpen(target) : null),
    );
    const surfaceSections = resolveExtraSectionsOnOpen?.(target);
    setResolvedExtraSections(
      rowMenu?.extraSections && surfaceSections
        ? [...rowMenu.extraSections, ...surfaceSections]
        : (rowMenu?.extraSections ?? surfaceSections),
    );
    setSniffedEntity(sniffEntityFromDom(target));
  };

  // Shared capture — populates selection/content state from a right-click target
  // OR a long-press target (mobile). Does not open anything; the caller does.
  const captureContext = (target: HTMLElement, containerEl: HTMLElement) => {
    resolvePerTargetContext(target);
    let captured = capturedSelection.current;
    if (!captured || !captured.text) {
      captured =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
          ? captureTextareaSelection(target)
          : captureDomSelection();
      capturedSelection.current = captured;
      selectionLocked.current = true;
    }

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const { start, end } = getEditableSelectionOffsets(target);
      setSelectedText(captured?.text || "");
      setSelectionRange({
        type: "editable",
        element: target,
        start,
        end,
        range: null,
        containerElement: null,
      });
      // Fallback content = the whole field, so Copy/AI work even with no selection.
      setFallbackContent(target.value ?? "");
    } else {
      let containerElement = containerEl;
      if (!containerElement.hasAttribute("data-alchemy-trigger")) {
        const trigger = containerElement.querySelector(
          "[data-alchemy-trigger]",
        );
        if (trigger instanceof HTMLElement) containerElement = trigger;
      }
      setSelectedText(captured?.text || "");
      setSelectionRange({
        type: "non-editable",
        element: null,
        start: 0,
        end: 0,
        range: captured?.range || null,
        containerElement,
      });
      // Fallback content = the right-clicked subtree's text — the net that
      // makes a read-only surface copyable with zero wiring (kills "fake menu").
      setFallbackContent(extractElementText(containerElement));
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (suppressed) return; // trigger is disabled; native menu shows
    // Radix's innermost trigger prevents the native event after it opens. Let
    // that event bubble so the inner Radix handler can run, then make every
    // outer shell yield when it sees the already-prevented event. Calling
    // stopPropagation here aborts the asChild-composed Radix handler on nested
    // rows, leaving the row with no menu at all.
    if (e.defaultPrevented) return;
    // The innermost eligible trigger owns the gesture: preventing here is what
    // makes every outer shell yield (and hides the native menu).
    e.preventDefault();
    captureContext(e.target as HTMLElement, e.currentTarget as HTMLElement);
    setMenuPoint({ x: e.clientX, y: e.clientY });
    setOpenSeq((n) => n + 1);
    setMenuOpen(true);
    onMenuOpenChange?.(true);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
    selectionLocked.current = false;
    capturedSelection.current = null;
    if (skipSelectionRestoreRef.current) {
      skipSelectionRestoreRef.current = false;
      return;
    }
    if (!selectionRange) return;
    if (selectionRange.type === "editable") {
      const { element, start, end } = selectionRange;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        restoreTextareaSelection(element, start, end);
      }
    } else if (selectionRange.range) {
      restoreDomSelection(selectionRange.range);
    }
  };

  const handleDropdownClose = (open: boolean) => {
    onMenuOpenChange?.(open);
    setDropdownOpen(open);
    if (!open) {
      selectionLocked.current = false;
      capturedSelection.current = null;
      setTimeout(() => {
        setShowFloatingIcon(false);
        setSelectionRect(null);
      }, 100);
    }
  };

  const handleOpenFloating = (
    e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
  ) => {
    if (suppressed) return;
    e.preventDefault();
    e.stopPropagation();
    selectionLocked.current = true;
    // For the floating icon there is always a selection; capture a DOM-text
    // fallback from its container too, for symmetry with the right-click path.
    const sel = window.getSelection();
    const container =
      sel && sel.rangeCount > 0
        ? (sel.getRangeAt(0).commonAncestorContainer.parentElement ?? null)
        : null;
    resolvePerTargetContext(container);
    setFallbackContent(extractElementText(container));
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPoint({ x: anchor.left, y: anchor.bottom + 4 });
    setOpenSeq((n) => n + 1);
    setDropdownOpen(true);
  };

  // ── Mobile triggers (no right-click on touch) ─────────────────────────────
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    if (suppressed) return;
    // The touch half of the native-menu rule. Long-press inside a text field IS
    // the OS text callout (Select / Paste / Look Up) — pre-empting it at 480ms
    // leaves a mobile user with no way to paste at all, which is worse than the
    // desktop case because there is no right-click to fall back to. The guard
    // shipped on the three pointer paths and missed this one, so the stated
    // invariant held on desktop only.
    if (!isEditable && yieldsToNativeTextMenu(e.target)) return;
    // Nested menus are deliberate (for example, a page-list menu around
    // per-row menus). The innermost eligible trigger owns the gesture; without
    // this both long-press timers fire and two mobile sheets open.
    e.stopPropagation();
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = {
      x: t.clientX,
      y: t.clientY,
      target: e.target as HTMLElement,
      container: e.currentTarget as HTMLElement,
    };
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      const info = touchStart.current;
      if (!info) return;
      captureContext(info.target, info.container);
      setOpenSeq((n) => n + 1);
      setSheetOpen(true);
    }, 480);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const info = touchStart.current;
    const t = e.touches[0];
    if (!info || !t) return;
    // A drag means the user is scrolling or selecting — not a long-press.
    if (Math.abs(t.clientX - info.x) > 10 || Math.abs(t.clientY - info.y) > 10)
      clearLongPress();
  };
  const handleTouchEnd = () => clearLongPress();

  // Floating selection icon → bottom sheet (the selection-driven mobile path).
  const handleOpenFloatingMobile = (
    e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
  ) => {
    if (suppressed) return;
    e.preventDefault();
    e.stopPropagation();
    selectionLocked.current = true;
    const sel = window.getSelection();
    const container =
      sel && sel.rangeCount > 0
        ? (sel.getRangeAt(0).commonAncestorContainer.parentElement ?? null)
        : null;
    setSelectedText(sel?.toString().trim() || selectedText);
    setSelectionRange({
      type: "non-editable",
      element: null,
      start: 0,
      end: 0,
      range: sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null,
      containerElement: container,
    });
    resolvePerTargetContext(container);
    setFallbackContent(extractElementText(container));
    setOpenSeq((n) => n + 1);
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    onMenuOpenChange?.(open);
    setSheetOpen(open);
    if (!open) {
      selectionLocked.current = false;
      capturedSelection.current = null;
      setShowFloatingIcon(false);
      setSelectionRect(null);
    }
  };

  // ── The single prop bag handed to the lazy MenuContent ───────────────────
  const menuContentProps: Omit<MenuContentProps, "variant"> = {
    sourceFeature,
    surfaceName,
    menuVersion,
    // A row descriptor owns this invocation's values. Preserve page-level live
    // values for empty space, but never let them overwrite the clicked row.
    getApplicationScope: resolvedContext
      ? () => ({ ...(getApplicationScope?.() ?? {}), ...getEffectiveContextData() })
      : getApplicationScope,
    contextData: getEffectiveContextData(),
    contentSource,
    entity: effectiveEntity,
    excludedRichActions,
    extraRichActions,
    richDocCtxExtras,
    selectedText,
    selectionRange,
    fallbackContent,
    placementMode,
    scope,
    scopeId,
    extraSections: resolvedExtraSections ?? extraSections,
    menuLayout,
    menuDensity,
    isEditable,
    editorId,
    getTextarea,
    onContentInserted,
    onTextReplace,
    onTextInsertBefore,
    onTextInsertAfter,
    onSave,
    onDelete,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    undoHint,
    redoHint,
    onViewHistory,
    hasHistory,
    widgetHandleId,
    suppressSelectionRestore: () => {
      skipSelectionRestoreRef.current = true;
    },
  };

  // Radix `asChild` is a strict one-element slot. Consumers may legitimately
  // wrap a surface plus sibling loading/empty states, so normalize that shape
  // to one layout-neutral element before either renderer reaches a Slot.
  const canSlotChildren =
    React.Children.count(children) === 1 &&
    React.isValidElement(children) &&
    children.type !== React.Fragment;

  // The version footer is gone (Arman, 2026-08-22: dev/testing info, not for
  // users). The surface name + revision now live in the surface submenu the
  // engine builds (`surfaceSection`), admin-only for the revision.

  // ── The palette (every action, type to filter — Linear) ──────────────────
  // ⌘/Ctrl+Shift+K inside the wrapped surface opens it over the same target.
  const handlePaletteKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (suppressed) return;
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== "k") return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    captureContext(e.target as HTMLElement, e.currentTarget);
    setOpenSeq((n) => n + 1);
    setPaletteOpen(true);
    onMenuOpenChange?.(true);
  };

  const mode: "context" | "sheet" | "palette" | null = sheetOpen
    ? "sheet"
    : paletteOpen
      ? "palette"
      : menuOpen || dropdownOpen
        ? "context"
        : null;
  const closeActive = () => {
    if (sheetOpen) handleSheetOpenChange(false);
    else if (paletteOpen) {
      setPaletteOpen(false);
      onMenuOpenChange?.(false);
      handleMenuClose();
    } else if (dropdownOpen) handleDropdownClose(false);
    else {
      onMenuOpenChange?.(false);
      handleMenuClose();
    }
  };

  // The trigger props — merged ONTO the single child via Radix `Slot` (no
  // wrapper element: a `<div>` between `<tbody>` and a wrapped `<tr>` is
  // illegal), falling back to a `display:contents` wrapper for a Fragment or
  // multi-child payload, where a `<div>` is always legal.
  const triggerProps = {
    ...CONTEXT_REGION_TRIGGER_ATTRS,
    // Radix-compatible open state, for styles that key on it.
    "data-state": mode ? "open" : "closed",
    // Lets a ⋯ beside (not inside) this content open THIS menu.
    "data-content-source": contentSource ? contentSourceKey(contentSource) : undefined,
    onContextMenuCapture: (e: React.MouseEvent<HTMLElement>) => {
      // CAPTURE: a read-only menu never steals a live text field's native menu.
      if (!isEditable && yieldsToNativeTextMenu(e.target)) e.stopPropagation();
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      if (isMobile) {
        if (suppressed) return;
        if (!isEditable && yieldsToNativeTextMenu(e.target)) return;
        // A nested row trigger wins over its surrounding list-level trigger.
        e.stopPropagation();
        e.preventDefault();
        captureContext(e.target as HTMLElement, e.currentTarget);
        setOpenSeq((n) => n + 1);
        setSheetOpen(true);
        return;
      }
      handleContextMenu(e);
    },
    onMouseDown: isMobile ? undefined : handleMouseDown,
    onKeyDown: handlePaletteKey,
    ...(isMobile
      ? {
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onTouchEnd: handleTouchEnd,
          onTouchCancel: handleTouchEnd,
        }
      : {}),
  };

  const floatingOpen = isMobile ? sheetOpen : dropdownOpen;

  return (
    <MenuPresenceProvider value={true}>
      <RegistryMenuSourceProvider value={contentSource ?? null}>
        {canSlotChildren ? (
          <Slot ref={setSelectionOwner} {...triggerProps}>
            {children}
          </Slot>
        ) : (
          <div ref={setSelectionOwner} style={{ display: "contents" }} {...triggerProps}>
            {children}
          </div>
        )}

        {enableFloatingIcon &&
          shouldRenderFloatingIcon(selectionRect, showFloatingIcon, floatingOpen) && (
            <FloatingSelectionIcon
              selectionRect={selectionRect}
              visible={showFloatingIcon}
              dropdownOpen={floatingOpen}
              onOpen={isMobile ? handleOpenFloatingMobile : handleOpenFloating}
              onDismiss={() => setShowFloatingIcon(false)}
            />
          )}

        {mode ? (
          <AlchemyMenuContent
            key={openSeq}
            {...menuContentProps}
            mode={mode}
            point={menuPoint}
            open
            onOpenChange={(open) => {
              if (!open) closeActive();
            }}
          />
        ) : null}
      </RegistryMenuSourceProvider>
    </MenuPresenceProvider>
  );
}
