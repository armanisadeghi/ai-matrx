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
//   - the version footer.
//
// On the FIRST open it renders `MenuContent` via next/dynamic({ssr:false}).
// MenuContent owns ALL the weight — the unified-menu + bound-agent hooks (which
// fire the single, deduped fetch on its mount), the launchers, the handlers,
// the react-icons resolver, and every submenu. Every modal/window MenuContent
// needs is dispatched through the OverlayController, so the shell carries zero
// modal code. See `FEATURE.md` and the `code-splitting` skill.

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  FloatingSelectionIcon,
  shouldRenderFloatingIcon,
} from "./components/FloatingSelectionIcon";
import {
  captureTextareaSelection,
  captureDomSelection,
  getSelectionRect,
  mouseFallbackRect,
  restoreTextareaSelection,
  restoreDomSelection,
  extractElementText,
  type CapturedSelection,
  type SelectionRange,
} from "./utils/selection-tracking";
import type { ContextMenuV3Props, MenuContentProps } from "./types";

/**
 * Canonical v3 menu revision. Rendered in the footer as
 * `v3.<n> · V<menuVersion>` (e.g. `v3.1 · V1`) so a v3 surface is INSTANTLY
 * distinguishable from a v2 one (which renders `C1V1`). Bump when the v3 menu's
 * structure/behavior changes. A surface on a bespoke (non-v3) menu shows no
 * `v3.·V` tag at all — that absence flags it as un-migrated.
 */
export const CANONICAL_MENU_VERSION_V3 = 1;

// Tiny placeholder for the (~0.5s) MenuContent chunk load on first open only.
function MenuContentSkeleton() {
  return (
    <div className="px-2 py-3 space-y-2" aria-busy="true">
      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      <div className="h-3 w-32 rounded bg-muted animate-pulse" />
      <div className="h-3 w-20 rounded bg-muted animate-pulse" />
    </div>
  );
}

// The single heavy boundary. ssr:false keeps it (and everything beneath:
// react-icons, launchers, data hooks) off the server render and out of the
// shell's chunk; the conditional mount (Radix renders content only when open)
// defers the client fetch to first engagement. One boundary, no stacking.
const MenuContent = dynamic(() => import("./components/MenuContent"), {
  ssr: false,
  loading: () => <MenuContentSkeleton />,
});

// The mobile renderer — a 70dvh bottom-sheet drill-down. Same lazy boundary as
// MenuContent; only one of the two is rendered (the shell picks by viewport).
const MobileMenuContent = dynamic(
  () => import("./components/MobileMenuContent"),
  { ssr: false, loading: () => <MenuContentSkeleton /> },
);

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
  addedContexts,
  excludedContexts,
  placementMode,
  extraSections,
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

  const capturedSelection = useRef<CapturedSelection | null>(null);
  const selectionLocked = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
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
  const [resolvedContext, setResolvedContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  // Set by MenuContent (via suppressSelectionRestore) when an action opens an
  // overlay that should keep focus — so closing the menu doesn't yank it back.
  const skipSelectionRestoreRef = useRef(false);

  // Effective contextData for THIS invocation: static prop + per-target merge.
  const getEffectiveContextData = (): Record<string, unknown> => {
    const base = (contextData ?? {}) as Record<string, unknown>;
    return resolvedContext ? { ...base, ...resolvedContext } : base;
  };

  // ── Selection tracking (lightweight; the only always-on work) ────────────
  useEffect(() => {
    const handleSelection = () => {
      if (selectionLocked.current) return;
      const selection = window.getSelection();
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
    if (e.button !== 2) return; // right-click only
    const target = e.target as HTMLElement;
    setResolvedContext(resolveContextOnOpen ? resolveContextOnOpen(target) : null);
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

  // Shared capture — populates selection/content state from a right-click target
  // OR a long-press target (mobile). Does not open anything; the caller does.
  const captureContext = (target: HTMLElement, containerEl: HTMLElement) => {
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
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
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
      if (!containerElement.hasAttribute("data-radix-context-menu-trigger")) {
        const trigger = containerElement.querySelector(
          "[data-radix-context-menu-trigger]",
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
    captureContext(e.target as HTMLElement, e.currentTarget as HTMLElement);
    setMenuOpen(true);
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
    setFallbackContent(extractElementText(container));
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
    setFallbackContent(extractElementText(container));
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
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
    getApplicationScope,
    contextData: getEffectiveContextData(),
    contentSource,
    entity,
    selectedText,
    selectionRange,
    fallbackContent,
    addedContexts,
    excludedContexts,
    placementMode,
    scope,
    scopeId,
    extraSections,
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
    suppressSelectionRestore: () => {
      skipSelectionRestoreRef.current = true;
    },
  };

  const footer = (
    <div className="select-none border-t border-border/50 px-2 py-1 text-[10px] leading-none text-muted-foreground/70">
      {surfaceName ?? "(no surface)"} · v3.{CANONICAL_MENU_VERSION_V3} · V
      {menuVersion}
    </div>
  );

  // ── Mobile: a 70dvh bottom-sheet drill-down (long-press / floating icon) ──
  if (isMobile) {
    return (
      <>
        {/* display:contents → no layout box, but still receives bubbled touch
            events from the wrapped children (preserves the surface's layout). */}
        <div
          style={{ display: "contents" }}
          onContextMenu={(e) => {
            e.preventDefault();
            captureContext(
              e.target as HTMLElement,
              e.currentTarget as HTMLElement,
            );
            setSheetOpen(true);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {children}
        </div>

        {enableFloatingIcon &&
          shouldRenderFloatingIcon(
            selectionRect,
            showFloatingIcon,
            sheetOpen,
          ) && (
            <FloatingSelectionIcon
              selectionRect={selectionRect}
              visible={showFloatingIcon}
              dropdownOpen={sheetOpen}
              onOpen={handleOpenFloatingMobile}
              onDismiss={() => setShowFloatingIcon(false)}
            />
          )}

        <Drawer open={sheetOpen} onOpenChange={handleSheetOpenChange}>
          <DrawerContent className="flex h-[70dvh] flex-col p-0">
            <DrawerTitle className="sr-only">Context menu</DrawerTitle>
            {sheetOpen && (
              <div className="min-h-0 flex-1">
                <MobileMenuContent
                  {...menuContentProps}
                  onClose={() => setSheetOpen(false)}
                />
              </div>
            )}
            {footer}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (!open) handleMenuClose();
        }}
      >
        <ContextMenuTrigger
          asChild
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className={`w-64 ${className ?? ""}`}>
          <MenuContent variant="context" {...menuContentProps} />
          {footer}
        </ContextMenuContent>
      </ContextMenu>

      {enableFloatingIcon && (
        <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownClose}>
          <DropdownMenuTrigger asChild>
            {shouldRenderFloatingIcon(
              selectionRect,
              showFloatingIcon,
              dropdownOpen,
            ) ? (
              <FloatingSelectionIcon
                selectionRect={selectionRect}
                visible={showFloatingIcon}
                dropdownOpen={dropdownOpen}
                onOpen={handleOpenFloating}
                onDismiss={() => setShowFloatingIcon(false)}
              />
            ) : (
              <span style={{ display: "none" }} aria-hidden="true" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64"
            align="center"
            side="bottom"
            sideOffset={5}
          >
            <MenuContent variant="dropdown" {...menuContentProps} />
            {footer}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
