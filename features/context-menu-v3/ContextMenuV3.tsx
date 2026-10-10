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

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Slot } from "@radix-ui/react-slot";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useSelectionZone } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import {
  CONTEXT_MENU_SELECTION_HOST_KEY,
  type ContextMenuSelectionHost,
} from "./selection-provider";
import {
  captureTextareaSelection,
  getEditableSelectionOffsets,
  captureDomSelection,
  getSelectionRect,
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
  CONTEXT_MENU_HEADING_KEY,
  type ContextMenuHeading,
  type ContextMenuEntityRef,
} from "./types";
import {
  joinRowAndSurfaceContext,
  mergeResolvedContextData,
  resolveEffectiveEntity,
  sniffEntityFromDom,
} from "./utils/per-row-entity";
import { MenuPresenceProvider, RegistryMenuSourceProvider, contentSourceKey } from "./menu-presence";

import { useOptionalWidgetHandle } from "@ai-matrx/chat/agents/hooks/useWidgetHandle";
import { buildEditableWidgetHandle } from "./utils/widget-handle";
import { resolveTableRowItem } from "./table-row-item";
import type { ResolvedItem } from "@ai-matrx/alchemy/declare";
import { recordMenusRevision, resolveRecordMenu, subscribeRecordMenus } from "./record-menu-registry";
import { joinExtraSections } from "./utils/join-extra-sections";
import { CONTEXT_REGION_TRIGGER_ATTRS } from "./region-trigger-attrs";
import { tableTextAtTarget } from "./utils/table-at-target";
import { findComboMatch } from "./utils/key-combo";
import { ReactReduxContext } from "react-redux";
import type { AppStore } from "@/lib/redux/store";
import { selectAllShortcutsArray } from "@ai-matrx/chat/agents/redux/agent-shortcuts/selectors";
import { fetchUnifiedMenu } from "@ai-matrx/chat/agents/redux/agent-shortcuts/thunks";

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

/**
 * A right-click on a live text field inside a READ-ONLY menu: the innermost
 * such shell, recorded in the capture phase so every shell sees the same
 * answer in the bubble phase (see `onContextMenuCapture`).
 */
const NATIVE_TEXT_YIELD = new WeakMap<Event, HTMLElement>();

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

/**
 * A gesture that reached this shell only through a React PORTAL: its target is
 * not in the shell's DOM subtree (an open menu, a dialog or popover rendered by
 * something inside the region). React bubbles portal events to every React
 * ancestor, so a right-click — or a Mac two-finger tap mid-scroll — on an OPEN
 * message menu reached the transcript's shell around it, which opened the page
 * menu over it with both engines mounted: 18 `DuplicateActionError`s and "the
 * menu swapped" (blind run PB-06, /chat, 2026-10-01). A portal surface that
 * wants a menu mounts its own.
 */
export function reachedThroughPortal(e: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
  const { target, currentTarget } = e;
  return target instanceof Node && currentTarget instanceof Node && !currentTarget.contains(target);
}

/** A right-click on an open menu: no native browser menu over ours. */
function isInsideOpenMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-alchemy-layout], [role="menu"]'));
}

// THE single heavy boundary (T1 + T1e). ssr:false keeps it — the engine hook,
// the agent fetch, the package renderers — off the server render and out of
// the shell's chunk; it mounts on first open only. One boundary for the
// right-click, the floating icon, the phone sheet and the palette (ALC-15 S3:
// the package draws all four from one registry).
const AlchemyMenuContent = dynamic(() => import("./components/AlchemyMenuContent"), {
  ssr: false,
});

/**
 * Warm THAT SAME chunk once per tab, when the browser is idle after the first
 * menu shell mounts — so the first right-click draws at once instead of
 * fetching (and, in dev, compiling) the engine under the pointer (G11A review,
 * 2026-10-07: the first open after a page load took 1–2 s). It is the same
 * specifier as the `dynamic()` above, so it adds no chunk and no boundary
 * (code-splitting rule 3); it only moves WHEN the browser fetches it. The
 * menu still renders only on open.
 */
let menuContentWarm: Promise<unknown> | null = null;
export function warmMenuContent(): Promise<unknown> {
  if (!menuContentWarm) {
    menuContentWarm = import("./components/AlchemyMenuContent").catch((error: unknown) => {
      menuContentWarm = null;
      console.error("[ContextMenuV3] could not warm the menu; the first open will load it", error);
    });
  }
  return menuContentWarm;
}

// ── The one selectionchange listener ────────────────────────────────────────
interface SelectionTracker {
  owner: () => HTMLElement | null;
  locked: () => boolean;
  set: (text: string) => void;
}
const selectionTrackers = new Set<SelectionTracker>();
/** Trackers told they own the selection last time — the only ones to clear next time. */
let selectionHolders = new Set<SelectionTracker>();

function onDocumentSelectionChange(): void {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode ?? null;
  const active = document.activeElement;
  const field = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null;
  const holders = new Set<SelectionTracker>();
  if (anchor || field) {
    for (const tracker of selectionTrackers) {
      const owner = tracker.owner();
      if (!owner) continue;
      if ((anchor != null && owner.contains(anchor)) || (field != null && owner.contains(field))) holders.add(tracker);
    }
  }
  for (const tracker of selectionHolders) {
    if (!holders.has(tracker) && !tracker.locked()) tracker.set("");
  }
  if (holders.size > 0) {
    // A collapsed selection (a caret — every keystroke in an editor) has no
    // text. `toString()` is not free: it serializes like innerText and forces
    // a synchronous layout of the whole page (2026-09-26).
    const text = !selection || selection.isCollapsed ? "" : selection.toString().trim();
    for (const tracker of holders) if (!tracker.locked()) tracker.set(text);
  }
  selectionHolders = holders;
}

function trackSelection(tracker: SelectionTracker): () => void {
  if (selectionTrackers.size === 0) document.addEventListener("selectionchange", onDocumentSelectionChange);
  selectionTrackers.add(tracker);
  return () => {
    selectionTrackers.delete(tracker);
    selectionHolders.delete(tracker);
    if (selectionTrackers.size === 0) document.removeEventListener("selectionchange", onDocumentSelectionChange);
  };
}

/** Schedules the warm-up for an idle moment (never during the page's own load work). */
function useWarmMenuContentWhenIdle(): void {
  useEffect(() => {
    if (menuContentWarm) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => void warmMenuContent(), { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => void warmMenuContent(), 1500);
    return () => window.clearTimeout(id);
  }, []);
}

// One advertised key combo pressed → that shortcut runs through the SAME
// engine and launch handler as its menu item; mounted for one press only.
const ShortcutKeyRunner = dynamic(() => import("./components/ShortcutKeyRunner"), {
  ssr: false,
});
/** A key press an inner menu already answered (nested surfaces). */
const KEY_RUN_CLAIMED = "__alchemyShortcutKeyClaimed";

// The review-and-apply dialog behind "Clean up" / "Help with this…" when the
// menu sits over a record that can be saved (a note's Write / Plain / Split
// view, its tab, its list row) and the host supplied no dialog of its own. It must outlive the menu that asked, so the shell owns it —
// mounted only after the first request, like every document dialog.
const DocumentAgentReviewLazy = dynamic(
  () => import("@/features/rich-document/hosts/DocumentAgentReview"),
  { ssr: false, loading: () => null },
);
type TextAgentReviewRequest = {
  actionId: "cleanup" | "help" | "customAgent";
  ctx: import("@ai-matrx/rich-content/rich-document/types").RichDocumentActionContext;
};

// ── The palette opens from ANYWHERE on a surface with a menu (ALC-15) ───────
// ⌘/Ctrl+Shift+K with focus on the page body (a read-only note) or over a grid
// cell (cells are not focusable) opens the palette of the INNERMOST surface
// under the pointer, resolved for the element under the pointer. One document
// listener for the whole page (on globalThis — module state is per bundle).
type PaletteOpener = (element: HTMLElement) => void;
type SurfaceClaim = { id: symbol; element: HTMLElement; seq: number; at: number };
interface PaletteRegistry {
  openers: Map<symbol, PaletteOpener>;
  /** Innermost surface under the pointer (where a right-click would land). */
  pointer: SurfaceClaim | null;
  /** Innermost surface holding focus. */
  focus: SurfaceClaim | null;
  /** Last press — a focus it caused never outranks the pointer. */
  pointerDown: { element: HTMLElement; at: number } | null;
  seq: number;
  installed: boolean;
}
const PALETTE_KEY = Symbol.for("ai-matrx.context-menu.palette");
function paletteRegistry(): PaletteRegistry {
  const g = globalThis as unknown as Record<symbol, PaletteRegistry | undefined>;
  let reg = g[PALETTE_KEY];
  if (!reg) {
    reg = { openers: new Map(), pointer: null, focus: null, pointerDown: null, seq: 0, installed: false };
    g[PALETTE_KEY] = reg;
  }
  if (!reg.installed && typeof document !== "undefined") {
    reg.installed = true;
    const r = reg;
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== "k") return;
      const target = paletteTarget(r);
      const open = target ? r.openers.get(target.id) : undefined;
      if (!target || !open) return;
      e.preventDefault();
      open(target.element);
    });
  }
  return reg;
}
/**
 * Where the palette opens — exactly where right-click would: the innermost
 * surface under the pointer. Focus wins only when it moved AFTER the pointer
 * by the keyboard (Tab), never the focus a click itself caused (clicking an
 * answer focuses its outer message article; round 2, finding 1).
 */
function paletteTarget(r: PaletteRegistry): SurfaceClaim | null {
  const live = (c: SurfaceClaim | null) => (c && c.element.isConnected && r.openers.has(c.id) ? c : null);
  const pointer = live(r.pointer);
  const focus = live(r.focus);
  if (!focus) return pointer;
  if (!pointer) return focus;
  if (focus.seq < pointer.seq) return pointer;
  // A focus the last press caused (the pressed element sits inside what took
  // focus, moments later) is the click's side effect, not a keyboard move.
  const down = r.pointerDown;
  const causedByPress =
    !!down && focus.element.contains(down.element) && focus.at - down.at < 1000;
  return causedByPress ? pointer : focus;
}
const CLAIMED = "__alchemyPaletteClaimed";

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
  recordActionsOnly = false,
  subjectFold,
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
  className,
  menuLayout = DEFAULT_MENU_LAYOUT,
  menuDensity = DEFAULT_MENU_DENSITY,
  suppressed = false,
  onMenuOpenChange,
  onCloseAutoFocus,
  isEditable,
  editorId,
  getTextarea,
  insertAtCaret,
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
  const [textAgentReview, setTextAgentReview] = useState<TextAgentReviewRequest | null>(null);
  const requestTextAgentReview = useCallback(
    (actionId: TextAgentReviewRequest["actionId"], ctx: TextAgentReviewRequest["ctx"]) =>
      setTextAgentReview({ actionId, ctx }),
    [],
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [keyRun, setKeyRun] = useState<{ id: string; label: string } | null>(null);
  // Read without subscribing, and without requiring a Provider (the shell also
  // renders in isolated hosts and tests).
  const store = React.useContext(ReactReduxContext)?.store as AppStore | undefined;
  // Where the desktop menu anchors (pointer, ⋯ button, floating icon) and a
  // counter so every open mounts a fresh engine over a fresh click target.
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [openSeq, setOpenSeq] = useState(0);
  useWarmMenuContentWhenIdle();

  const capturedSelection = useRef<CapturedSelection | null>(null);
  const selectionLocked = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  // The DOM element this instance wraps — the child element itself on both
  // desktop (Radix `ContextMenuTrigger asChild`) and mobile (`Slot`), falling
  // back to the display:contents wrapper only when mobile cannot slot onto a
  // single child. Selection tracking is scoped to it — see handleSelection.
  const selectionOwnerRef = useRef<HTMLElement | null>(null);
  // The same element, as state: it is this menu's zone of the ONE selection
  // toolbar (components/selection-toolbar), which replaced the floating icon.
  const [selectionOwner, setSelectionOwnerState] = useState<HTMLElement | null>(null);
  const setSelectionOwner = useCallback((node: HTMLElement | null) => {
    selectionOwnerRef.current = node;
    setSelectionOwnerState(node);
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
  /** The element the menu was opened on — its record's NAME is read live. */
  const [openTarget, setOpenTarget] = useState<HTMLElement | null>(null);
  // Bumps when a registered record's rows change (a rename) — an argument of
  // the heading read below, so it is re-read.
  // Only an OPEN menu listens: a closed one reads the rows fresh at its next
  // open anyway. Every mounted menu listening re-rendered every sidebar row and
  // folder header each time a new note's auto-label moved while typing — O(notes)
  // work per label change (the Write-mode freeze sweep, 2026-10-10).
  const anyMenuOpen = menuOpen || dropdownOpen || sheetOpen || paletteOpen;
  const subscribeWhileOpen = useCallback(
    (listener: () => void) => (anyMenuOpen ? subscribeRecordMenus(listener) : () => {}),
    [anyMenuOpen],
  );
  const recordRevision = useSyncExternalStore(
    subscribeWhileOpen,
    recordMenusRevision,
    recordMenusRevision,
  );
  const [resolvedContext, setResolvedContext] =
    useState<ResolvedContextMenuContext | null>(null);
  /** The declared item this open is on (a table row), handed to the click target. */
  const [resolvedItem, setResolvedItem] = useState<ResolvedItem | null>(null);
  const [resolvedExtraSections, setResolvedExtraSections] =
    useState<typeof extraSections>(undefined);
  /** This open is on a table row whose surface draws its own row sections (see resolvePerTargetContext). */
  const [rowJoinsSurfaceSections, setRowJoinsSurfaceSections] = useState(false);
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
  // floating selection icon (since replaced by the ONE selection toolbar) at the same coordinates — dozens of stacked
  // translucent buttons compounding into a black-shadowed blob, and N×
  // O(document) main-thread work per selection event: a browser-freeze
  // amplifier (2026-07 /notes freeze class).
  useEffect(() => {
    // ONE document listener for every instance (selectionTracker below): a
    // selection change walks up from the anchor to the instances that own it,
    // so a keystroke costs O(depth), not O(mounted menus) — /notes mounts one
    // per sidebar row and folder header (the Write-mode freeze sweep, 2026-10-10).
    return trackSelection({
      owner: () => selectionOwnerRef.current,
      locked: () => selectionLocked.current,
      set: setSelectedText,
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // ── Capture handlers ─────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (suppressed) return; // yield to the native menu (e.g. streaming)
    if (reachedThroughPortal(e)) return;
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
      setSelectedText(captured.text);
    } else {
      const captured = captureDomSelection();
      capturedSelection.current = captured;
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
    const rowHit = resolveTableRowItem(target);
    const rowMenu = rowHit?.menu ?? null;
    setResolvedItem(rowHit?.item ?? null);
    // A table row has two owners: the table's descriptor names the row's values, the surface
    // names which RECORD the row is (and builds its own row doors from that same call). Both
    // are asked, always — `rowMenu?.context ?? surface` skipped the surface on every table row.
    const answered = joinRowAndSurfaceContext(
      rowMenu?.context,
      resolveContextOnOpen ? resolveContextOnOpen(target) : null,
    );
    // A record the content belongs to names the header when the target
    // names nothing itself (record-menu-registry.ts `heading`) — read at
    // RENDER from this target (`recordHeadingAt`), so a rename while the menu
    // is open or mounted reaches the header.
    setOpenTarget(target);
    setResolvedContext(answered);
    const surfaceSections = resolveExtraSectionsOnOpen?.(target);
    // Several owners, one menu: joined so a row id is drawn once (utils/join-extra-sections.ts).
    const ownSections = joinExtraSections(rowMenu?.extraSections, surfaceSections);
    // A surface that resolves per target draws its row's doors through the `extraSections` PROP
    // (rebuilt from the state its resolver just set), so on a table row they join the table's
    // own at RENDER, when the prop is fresh — never from this closure's previous row.
    // A surface's own STATIC sections (a per-row menu wrapping a table row: Files' Preview,
    // Rename, Move…) join the table's too — they used to be replaced by the row's sections.
    setRowJoinsSurfaceSections(!!rowMenu && !surfaceSections);
    // The record whose content this is (a note's tab rows, drawn apart from its
    // content): its rows join THIS menu, so the record's ⋯ and a right-click on
    // its content are one menu (record-menu-registry.ts, R26). The content's own
    // row wins over the record's row with the same id — never both.
    const record = resolveRecordMenu(target);
    setResolvedExtraSections(
      record?.extraSections.length
        ? joinExtraSections(ownSections ?? extraSections ?? [], record.extraSections)
        : ownSections,
    );
    // The record's entity fills a silence only — never over this menu's own.
    setSniffedEntity(sniffEntityFromDom(target) ?? (entity ? null : (record?.entity ?? null)));
  };

  // Shared capture — populates selection/content state from a right-click target
  // OR a long-press target (mobile). Does not open anything; the caller does.
  const captureContext = (target: HTMLElement, containerEl: HTMLElement) => {
    resolvePerTargetContext(target);
    let captured = capturedSelection.current;
    // A selection made somewhere ELSE is not what this right-click is about:
    // the Subject field's menu headed itself with the Message's selected text
    // (page-pass 2026-09-27). Keep a remembered selection only when it lies in
    // the field under the pointer (or, outside any field, in this menu's own
    // region); otherwise read afresh from the target.
    const scopeEl: Node =
      target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
        ? target
        : (target.closest('[contenteditable="true"], [contenteditable=""]') ?? containerEl);
    if (captured?.range && !scopeEl.contains(captured.range.commonAncestorContainer)) {
      captured = null;
    }
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
      // THE SELECTION THE MENU OPENED ON IS THE ONE EVERY READER SEES. A right
      // mousedown outside the highlight moves the caret AFTER the mousedown
      // capture: the header said "Selected: …" while a surface's live scope
      // builder (notes reads the field's selectionStart/End) saw a caret, so
      // selection shortcuts vanished or ran on nothing (2026-10-02). Put the
      // captured range back on the field so the header, the scope, and the
      // restore-on-close all name the same text.
      const remembered =
        captured?.editable &&
        captured.editable.element === target &&
        captured.editable.start !== captured.editable.end
          ? captured.editable
          : null;
      const { start, end } = remembered ?? getEditableSelectionOffsets(target);
      if (remembered) {
        const live = getEditableSelectionOffsets(target);
        if (live.start !== start || live.end !== end) {
          try {
            target.setSelectionRange(start, end);
          } catch {
            // A field without a selection API keeps its whole-value range.
          }
        }
      }
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
        // A contenteditable FIELD the right-click landed in (a rich or chip
        // editor): recorded so the menu header can name the field instead of
        // dumping its raw text. Every reader of `.element` gates on
        // `type === "editable"`, so this changes nothing else.
        element: target.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]'),
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
    }
  };

  // Opened from the ONE selection toolbar's "Ask AI" (components/selection-
  // toolbar; it replaced the floating selection icon): the same menu over the
  // selected text — a panel under the selection on desktop, the sheet on a phone.
  const openFromSelection = () => {
    if (suppressed) return;
    selectionLocked.current = true;
    const sel = window.getSelection();
    const container =
      sel && sel.rangeCount > 0
        ? (sel.getRangeAt(0).commonAncestorContainer.parentElement ?? null)
        : null;
    resolvePerTargetContext(container);
    setFallbackContent(extractElementText(container));
    if (isMobile) {
      setSelectedText(sel?.toString().trim() || selectedText);
      setSelectionRange({
        type: "non-editable",
        element: null,
        start: 0,
        end: 0,
        range: sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null,
        containerElement: container,
      });
      setOpenSeq((n) => n + 1);
      setSheetOpen(true);
      return;
    }
    const rect = getSelectionRect();
    const at = rect
      ? { x: rect.left, y: rect.bottom + 4 }
      : (lastMousePos.current ?? { x: 16, y: 16 });
    setMenuPoint(at);
    setOpenSeq((n) => n + 1);
    setDropdownOpen(true);
  };

  const selectionHost: ContextMenuSelectionHost = { kind: "context-menu-selection", open: openFromSelection };
  // No `editable` flag: an editable menu often wraps a read-only preview too
  // (a note's split view), so the toolbar reads editing from the DOM (a text
  // field or contenteditable under the selection), never from the wrapper.
  useSelectionZone(selectionOwner, {
    // A suppressed menu (the text is streaming) keeps the toolbar away until it settles.
    suppress: suppressed,
    host: { [CONTEXT_MENU_SELECTION_HOST_KEY]: selectionHost },
  });

  // ── Mobile triggers (no right-click on touch) ─────────────────────────────
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    if (suppressed) return;
    if (reachedThroughPortal(e)) return;
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

  const handleSheetOpenChange = (open: boolean) => {
    onMenuOpenChange?.(open);
    setSheetOpen(open);
    if (!open) {
      selectionLocked.current = false;
      capturedSelection.current = null;
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
    heading:
      readContextMenuHeading(resolvedContext) ??
      recordHeadingAt(openTarget, recordRevision),
    item: resolvedItem,
    contentSource,
    entity: effectiveEntity,
    excludedRichActions,
    recordActionsOnly,
    subjectFold,
    // The hook adds it only where the source can be saved and no host supplied one.
    requestTextAgentReview,
    extraRichActions,
    // The table the click landed on rides to "Save to a table" beside the host's own extras.
    richDocCtxExtras: {
      ...richDocCtxExtras,
      callbacks: {
        ...richDocCtxExtras?.callbacks,
        tableAtTarget: () => tableTextAtTarget(openTarget),
      },
      // Spreading an optional bag leaves its Pick'd keys optional; the hook spreads it over defaults.
    } as NonNullable<MenuContentProps["richDocCtxExtras"]>,
    selectedText,
    selectionRange,
    fallbackContent,
    placementMode,
    scope,
    scopeId,
    extraSections: resolvedExtraSections
      ? rowJoinsSurfaceSections
        ? joinExtraSections(resolvedExtraSections, extraSections)
        : resolvedExtraSections
      : extraSections,
    menuLayout,
    menuDensity,
    isEditable,
    editorId,
    getTextarea,
    insertAtCaret,
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
  //
  // THE ATTACH POINT (verify round 1, the ref-forwarding class): the menu's handlers
  // and its selection zone need a real DOM element. A slot onto a COMPONENT that does
  // not forward its ref (or spread its props) leaves none — the right-click menu and the
  // selection toolbar then silently do nothing. So the menu slots only onto an intrinsic
  // DOM element (`<div>`, `<tr>` — they always take a ref and props) and otherwise owns
  // its own `display: contents` wrapper. Guard: __tests__/attach-point.test.tsx.
  const canSlotChildren =
    React.Children.count(children) === 1 &&
    React.isValidElement(children) &&
    typeof children.type === "string";

  // The version footer is gone (Arman, 2026-08-22: dev/testing info, not for
  // users). The surface name + revision now live in the surface submenu the
  // engine builds (`surfaceSection`), admin-only for the revision.


  // Register this surface's palette opener; the innermost trigger under the
  // pointer (or holding focus) claims "last surface" for the page listener.
  const paletteIdRef = useRef<symbol | null>(null);
  paletteIdRef.current ??= Symbol("context-menu-surface");
  const openPaletteAt = (element: HTMLElement) => {
    if (suppressed) return;
    const container = selectionOwnerRef.current ?? element;
    captureContext(element, container);
    setOpenSeq((n) => n + 1);
    setPaletteOpen(true);
    onMenuOpenChange?.(true);
  };
  const openPaletteRef = useRef(openPaletteAt);
  useEffect(() => {
    openPaletteRef.current = openPaletteAt;
  });
  useEffect(() => {
    const reg = paletteRegistry();
    const id = paletteIdRef.current as symbol;
    reg.openers.set(id, (el) => openPaletteRef.current(el));
    return () => {
      reg.openers.delete(id);
      if (reg.pointer?.id === id) reg.pointer = null;
      if (reg.focus?.id === id) reg.focus = null;
    };
  }, []);
  const claim = (kind: "pointer" | "focus") => (e: React.SyntheticEvent<HTMLElement>) => {
    const native = e.nativeEvent as Event & { [CLAIMED]?: boolean };
    if (native[CLAIMED]) return; // an inner surface already claimed it
    native[CLAIMED] = true;
    const reg = paletteRegistry();
    const now = Date.now();
    if (e.type === "pointerdown") reg.pointerDown = { element: e.target as HTMLElement, at: now };
    reg.seq += 1;
    reg[kind] = { id: paletteIdRef.current as symbol, element: e.target as HTMLElement, seq: reg.seq, at: now };
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

  // ── Advertised key combos run their shortcut ─────────────────────────────
  // The menu prints a shortcut's `keyboard_shortcut` ("Alt+Shift+S"); a press
  // with focus inside this surface runs it. Matched on `code` (key-combo.ts):
  // macOS Option turns Alt+Shift+S into "Í". The rows are read from the store
  // at press time (no subscription — the shell stays inert); an editable
  // surface loads them on first focus so the first press already works.
  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const native = e.nativeEvent as Event & { [KEY_RUN_CLAIMED]?: boolean };
    if (native[KEY_RUN_CLAIMED] || e.defaultPrevented || suppressed || e.repeat) return;
    if (reachedThroughPortal(e)) return;
    if (!store || (!e.altKey && !e.ctrlKey && !e.metaKey)) return;
    const matchOf = (event: KeyboardEvent) =>
      findComboMatch(
        event,
        selectAllShortcutsArray(store.getState()).filter((s) => s.isActive !== false),
        (s) => s.keyboardShortcut,
      );
    const target = e.target as HTMLElement;
    const owner = selectionOwnerRef.current ?? e.currentTarget;
    const run = (match: { id: string; label: string }) => {
      captureContext(target, owner);
      setOpenSeq((n) => n + 1);
      setKeyRun({ id: match.id, label: match.label });
    };
    // The shortcut list loads on the first modifier press (the modifier key's
    // own keydown usually lands it before the combo key), never on focus — an
    // autofocused composer would otherwise read it on every page load.
    const loading = loadShortcuts();
    const match = matchOf(e.nativeEvent);
    if (!match) {
      // A combo pressed before the list arrived still runs, once it arrives.
      if (loading) {
        const event = e.nativeEvent;
        void loading.then(() => {
          const late = matchOf(event);
          if (late) run(late);
        });
      }
      return;
    }
    native[KEY_RUN_CLAIMED] = true;
    e.preventDefault();
    e.stopPropagation();
    run(match);
  };
  const shortcutsLoad = useRef<Promise<unknown> | null>(null);
  const shortcutsLoaded = useRef(false);
  /** The in-flight first load of the shortcut list, or null once it has landed. */
  const loadShortcuts = (): Promise<unknown> | null => {
    if (!store || !isEditable || shortcutsLoaded.current) return null;
    if (!shortcutsLoad.current) {
      // Deduped + condition-gated in the thunk: one request page-wide.
      shortcutsLoad.current = store
        .dispatch(fetchUnifiedMenu({ scope, scopeId }))
        .catch(() => undefined)
        .finally(() => {
          shortcutsLoaded.current = true;
        });
    }
    return shortcutsLoad.current;
  };
  const finishKeyRun = () => {
    setKeyRun(null);
    // The launched run owns focus now (its panel); only release the capture.
    selectionLocked.current = false;
    capturedSelection.current = null;
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
      if (reachedThroughPortal(e)) return;
      // CAPTURE: a read-only menu never steals a live text field's native menu.
      // It MARKS the gesture instead of stopping it: a stopPropagation here
      // also killed the field's OWN editable menu nested inside (every window
      // body is a read-only menu, so every window's text box lost its menu).
      if (!isEditable && yieldsToNativeTextMenu(e.target))
        NATIVE_TEXT_YIELD.set(e.nativeEvent, e.currentTarget);
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      if (reachedThroughPortal(e)) {
        if (isInsideOpenMenu(e.target)) e.preventDefault();
        return;
      }
      // A read-only shell over a live field yields; so does an editable shell
      // OUTSIDE the innermost read-only shell that asked to yield. An editable
      // menu nested inside that shell owns its own field.
      const yielder = NATIVE_TEXT_YIELD.get(e.nativeEvent);
      if (yielder && (!isEditable || !yielder.contains(e.currentTarget))) return;
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
    // The palette key is answered by the ONE page listener (paletteTarget), so
    // a click that focused an OUTER surface cannot steal it from the inner one.
    onPointerOver: claim("pointer"),
    onPointerDown: claim("pointer"),
    onFocus: claim("focus"),
    onKeyDown: handleShortcutKeyDown,
    ...(isMobile
      ? {
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onTouchEnd: handleTouchEnd,
          onTouchCancel: handleTouchEnd,
        }
      : {}),
  };

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
        {keyRun && !mode ? (
          <ShortcutKeyRunner
            key={`key-run-${openSeq}`}
            {...menuContentProps}
            shortcutId={keyRun.id}
            shortcutLabel={keyRun.label}
            onDone={finishKeyRun}
          />
        ) : null}
        {textAgentReview ? (
          <DocumentAgentReviewLazy
            actionId={textAgentReview.actionId}
            ctx={textAgentReview.ctx}
            onClose={() => setTextAgentReview(null)}
          />
        ) : null}
      </RegistryMenuSourceProvider>
    </MenuPresenceProvider>
  );
}

/**
 * The name of the record whose content holds `target`, read NOW from its
 * registered rows. `_revision` is the registry's change counter: passing it
 * makes every caller (and the React Compiler's memo) re-read after a rename.
 */
function recordHeadingAt(
  target: HTMLElement | null,
  _revision: number,
): ContextMenuHeading | null {
  return readContextMenuHeading({
    [CONTEXT_MENU_HEADING_KEY]: resolveRecordMenu(target)?.heading ?? null,
  });
}

/** The header name a `resolveContextOnOpen` answer gave, when it is well-formed. */
function readContextMenuHeading(resolved: unknown): ContextMenuHeading | null {
  if (!resolved || typeof resolved !== "object") return null;
  const heading = (resolved as Record<string, unknown>)[CONTEXT_MENU_HEADING_KEY];
  if (!heading || typeof heading !== "object") return null;
  const { label, text } = heading as Record<string, unknown>;
  return typeof label === "string" && typeof text === "string" && label.trim()
    ? { label: label.trim(), text }
    : null;
}
