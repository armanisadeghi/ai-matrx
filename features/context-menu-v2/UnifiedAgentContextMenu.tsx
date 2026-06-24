"use client";

import React, { useCallback, useRef, useState } from "react";
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
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  toggleDebugMode,
} from "@/lib/redux/preferences/adminDebugSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import {
  setCompareBase,
  openCompareWithBase,
  selectHasCompareBase,
} from "@/lib/redux/slices/diffCompareSlice";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
// TextActionResultModal / FindReplaceModal / ContextDebugModal are heavy modals —
// dynamically imported ({ ssr: false }) + conditionally rendered below.
import { toast } from "@/components/ui/use-toast";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { insertTextAtTextareaCursor } from "@/utils/text-insertion";
import type { Scope } from "@/features/agents/redux/shared/scope";
import type {
  ResultDisplayMode,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import {
  useUnifiedAgentContextMenu,
  type AgentMenuEntry,
} from "./hooks/useUnifiedAgentContextMenu";
import { useSurfaceBoundAgents } from "./hooks/useSurfaceBoundAgents";
// MenuBody (the heavy menu body + its icon resolver / react-icons) is
// dynamically imported below so it never enters the shell's chunk.
import type { SurfaceBoundAgentEntry } from "@/features/surfaces/services/surface-bound-agents.service";
import type { ContextMenuExtraSection } from "./extraSections";
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
  type CapturedSelection,
  type SelectionRange,
} from "./utils/selection-tracking";
import { buildApplicationScopeFromMenuContext } from "./utils/build-application-scope";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";

// Tiny placeholder shown for the (~0.5s) MenuBody chunk load on first open.
function MenuBodySkeleton() {
  return (
    <div className="px-2 py-3 space-y-2" aria-busy="true">
      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      <div className="h-3 w-32 rounded bg-muted animate-pulse" />
      <div className="h-3 w-20 rounded bg-muted animate-pulse" />
    </div>
  );
}

// ── Heavy children, code-split so the menu SHELL stays near-empty on mount ──
// 99% of surface renders never open the menu; none of the below enters the
// shell's chunk. MenuBody (+ its icon resolver / react-icons) loads on first
// open; each modal loads only when its action fires. All render conditionally:
// Radix mounts ContextMenuContent only when open, and the modals are gated on
// their own open-state. This is the "lightweight outer shell" contract.
const MenuBody = dynamic(
  () => import("./components/MenuBody").then((m) => ({ default: m.MenuBody })),
  { ssr: false, loading: () => <MenuBodySkeleton /> },
);
const TextActionResultModal = dynamic(
  () =>
    import("@/components/modals/TextActionResultModal").then((m) => ({
      default: m.TextActionResultModal,
    })),
  { ssr: false },
);
const FindReplaceModal = dynamic(
  () =>
    import("@/components/modals/FindReplaceModal").then((m) => ({
      default: m.FindReplaceModal,
    })),
  { ssr: false },
);
const ContextDebugModal = dynamic(
  () =>
    import("@/components/debug/ContextDebugModal").then((m) => ({
      default: m.ContextDebugModal,
    })),
  { ssr: false },
);

export type PlacementVisibility = "show" | "hide" | "disable";

export type PlacementKey =
  | "ai-action"
  | "bound-agent"
  | "content-block"
  | "organization-tool"
  | "user-tool"
  | "quick-action";

export type PlacementMode = Partial<Record<PlacementKey, PlacementVisibility>>;

/**
 * Canonical context-menu version. Bump when the `UnifiedAgentContextMenu`
 * component's structure/behavior changes. Rendered as `C<n>` in the menu's
 * version footer, so any surface using the canonical menu shows e.g. `C1V1`.
 * A surface that wires the menu the way the demo shows is `V1`; a surface that
 * customizes its wiring passes a higher `menuVersion` (→ `V2`, …). A surface
 * still on a BESPOKE (non-canonical) menu shows no `C·V` tag at all — that
 * absence is the signal it hasn't been migrated yet.
 */
export const CANONICAL_MENU_VERSION = 1;

export interface UnifiedAgentContextMenuProps {
  children: React.ReactNode;
  /**
   * REQUIRED. Identifies the UI that mounted this context menu so every
   * shortcut launched from here can be attributed to its true caller.
   *
   * Never pass a generic label like "context-menu" — the context menu
   * itself is shared by many surfaces (notes editor, code editor, agent
   * builder, demos). Tag the surface instead, e.g. "code-editor",
   * "notes", "agent-builder", or "demo:context-menu-v2".
   */
  sourceFeature: SourceFeature;
  /**
   * OPTIONAL. The Surface Registry name (`<client>/<surface>`) for the UI
   * that hosts this menu, e.g. `"matrx-user/notes"` or `"matrx-user/code"`.
   *
   * When provided, every shortcut launched from this menu carries
   * `runtime.surfaceName` end-to-end. The launch thunk uses it to look up
   * the most-specific `agx_agent_surface.value_mappings` for
   * `(shortcut.agentId, surfaceName, caller scope)` and to apply those
   * explicit mappings instead of (or in addition to) the legacy
   * auto-name-match. When omitted, the launch thunk falls back to the
   * shortcut's persisted `scopeMappings` and `contextMappings` only.
   *
   * Surface names must match a row in `public.ui_surface` (synced from the
   * code-first SurfaceManifest registry). See `features/tool-registry/
   * surfaces/SKILL.md` for the full contract.
   */
  surfaceName?: string;
  /**
   * Per-surface menu-wiring version, shown as `V<n>` in the version footer.
   * `1` = standard (demo-equivalent) wiring; bump when this surface customizes
   * how it wires the canonical menu so the drift is visible at a glance.
   */
  menuVersion?: number;
  editorId?: string;
  getTextarea?: () => HTMLTextAreaElement | null;
  onContentInserted?: () => void;
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  isEditable?: boolean;
  /**
   * Per-placement visibility. Defaults to "show" for every placement type.
   * - "show"    → render normally
   * - "hide"    → don't render the submenu at all
   * - "disable" → render the submenu but greyed out and unclickable
   */
  placementMode?: PlacementMode;
  /** @deprecated Use `placementMode`. Anything not in this list is treated as "hide". */
  enabledPlacements?: string[];
  /**
   * Contexts added to the default {general} allow-set.
   * Example: `['code-editor']` lets code-editor shortcuts through alongside general.
   */
  addedContexts?: string[];
  /**
   * Contexts removed from the allow-set after `addedContexts` is applied.
   * Example: `excludedContexts: ['general']` with `addedContexts: ['code-editor']`
   * → only shortcuts tagged specifically with `code-editor` appear.
   */
  excludedContexts?: string[];
  contextData?: {
    content?: string;
    context?: string;
    /** @deprecated Use `addedContexts` / `excludedContexts` instead. */
    contextFilter?: string;
    [key: string]: unknown;
  };
  /**
   * Live scope builder — preferred over `contextData` at launch time. Mirrors
   * ProTextarea's `getApplicationScope`: read refs/DOM at click time so surface
   * values are not stale React state. When omitted, scope is assembled from
   * `contextData` + the menu's captured selection.
   */
  getApplicationScope?: () => ApplicationScope;
  /**
   * Delegation hook for SINGLE-INSTANCE menus that serve many targets (e.g.
   * one menu for a whole conversation of assistant messages). Called with the
   * right-clicked element the instant the context menu is summoned; return the
   * per-target context (messageId, blockId, blockType, tool, content, …) and
   * it is shallow-merged OVER `contextData` for that one invocation.
   *
   * This is what lets us mount the heavy menu ONCE and tag thousands of blocks
   * with cheap DOM attributes instead of mounting a menu per block. Return null
   * to fall back to the static `contextData`.
   */
  resolveContextOnOpen?: (
    target: HTMLElement | null,
  ) => Record<string, unknown> | null;
  className?: string;
  enableFloatingIcon?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoHint?: string;
  redoHint?: string;
  onViewHistory?: () => void;
  hasHistory?: boolean;
  scope?: Scope;
  scopeId?: string | null;
  /**
   * Surface-specific menu items injected by a thin wrapper. The core renders
   * them at the requested anchor — wrappers describe, they don't reimplement.
   * See `features/context-menu-v2/extraSections.ts`.
   */
  extraSections?: ContextMenuExtraSection[];
}

const DEFAULT_PLACEMENT_MODE: Required<PlacementMode> = {
  "ai-action": "show",
  "bound-agent": "show",
  "content-block": "show",
  "organization-tool": "show",
  "user-tool": "show",
  "quick-action": "show",
};

const ALL_DB_PLACEMENTS: PlacementKey[] = [
  "ai-action",
  "content-block",
  "organization-tool",
  "user-tool",
];

function resolvePlacementMode(
  placementMode: PlacementMode | undefined,
  enabledPlacements: string[] | undefined,
): Required<PlacementMode> {
  // Explicit placementMode wins; callers migrating can drop `enabledPlacements`.
  if (placementMode) {
    return { ...DEFAULT_PLACEMENT_MODE, ...placementMode };
  }
  // Legacy path: anything not in enabledPlacements is hidden.
  if (enabledPlacements) {
    const enabledSet = new Set(enabledPlacements);
    return {
      "ai-action": enabledSet.has("ai-action") ? "show" : "hide",
      // Bound agents is synthetic (not a DB placement) — always on when
      // surfaceName is set unless the caller explicitly hides via placementMode.
      "bound-agent": placementMode?.["bound-agent"] ?? "show",
      "content-block": enabledSet.has("content-block") ? "show" : "hide",
      "organization-tool": enabledSet.has("organization-tool")
        ? "show"
        : "hide",
      "user-tool": enabledSet.has("user-tool") ? "show" : "hide",
      "quick-action": enabledSet.has("quick-action") ? "show" : "hide",
    };
  }
  return DEFAULT_PLACEMENT_MODE;
}

export function UniversalContextMenuV2({
  children,
  sourceFeature,
  surfaceName,
  menuVersion = 1,
  editorId,
  getTextarea,
  onContentInserted,
  onTextReplace,
  onTextInsertBefore,
  onTextInsertAfter,
  isEditable = false,
  placementMode,
  enabledPlacements,
  addedContexts,
  excludedContexts,
  contextData = {},
  getApplicationScope,
  className,
  enableFloatingIcon = true,
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
  extraSections,
  resolveContextOnOpen,
}: UnifiedAgentContextMenuProps) {
  const dispatch = useAppDispatch();

  // Per-invocation context resolved by `resolveContextOnOpen` (single-instance
  // delegation). Captured on right-click before the menu opens; read by the
  // compare + launch handlers. A ref (not state) so resolving never triggers a
  // re-render of this hot component.
  const resolvedContextRef = useRef<Record<string, unknown> | null>(null);

  const resolvedPlacementMode = resolvePlacementMode(
    placementMode,
    enabledPlacements,
  );

  // Placements the hook should fetch items for: anything not "hide".
  // "disable" still fetches so the row count is available; "hide" skips.
  const dbPlacementTypes = ALL_DB_PLACEMENTS.filter(
    (p) => resolvedPlacementMode[p] !== "hide",
  );

  // Legacy support: contextFilter becomes a single-entry addedContexts +
  // excludedContexts: ['general'] — i.e. "only this one context".
  const legacyContextFilter = contextData?.contextFilter as string | undefined;
  const resolvedAddedContexts =
    addedContexts ?? (legacyContextFilter ? [legacyContextFilter] : undefined);
  const resolvedExcludedContexts =
    excludedContexts ?? (legacyContextFilter ? ["general"] : undefined);

  const { categoryGroups, loading, refresh } = useUnifiedAgentContextMenu({
    placementTypes: dbPlacementTypes,
    addedContexts: resolvedAddedContexts,
    excludedContexts: resolvedExcludedContexts,
    surfaceName,
    enabled: dbPlacementTypes.length > 0,
    scope,
    scopeId,
  });

  const {
    sections: boundAgentSections,
    loading: boundAgentsLoading,
    refresh: refreshBoundAgents,
  } = useSurfaceBoundAgents(surfaceName);

  // Lazy first-fetch: the unified-menu RPC is expensive (full join over
  // categories × shortcuts × agent/version) so we never kick it off on
  // render. Fire on the first engagement (right-click or icon open) only.
  // The thunk itself dedupes, so even if multiple menus open back-to-back
  // there's at most one HTTP call per scope per session.
  const hasRefreshedRef = useRef(false);
  const ensureMenuLoaded = useCallback(() => {
    if (surfaceName) {
      void refreshBoundAgents();
    }
    if (hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;
    void refresh();
  }, [refresh, refreshBoundAgents, surfaceName]);

  const { launchShortcut, launchAgent } = useAgentLauncher();
  const {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openVoicePad,
  } = useQuickActions();

  const openDiffWindow = useOpenDiffViewerWindow();
  const hasCompareBase = useAppSelector(selectHasCompareBase);

  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  const [contextDebugOpen, setContextDebugOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const capturedSelection = useRef<CapturedSelection | null>(null);
  const selectionLocked = useRef(false);

  const [textResultModalOpen, setTextResultModalOpen] = useState(false);
  const [textResultData, setTextResultData] = useState<{
    original: string;
    result: string;
    promptName: string;
  } | null>(null);

  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [skipSelectionRestore, setSkipSelectionRestore] = useState(false);
  const findReplaceOpenRef = useRef(false);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showFloatingIcon, setShowFloatingIcon] = useState(false);

  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  // Effective contextData for THIS invocation: static prop with any
  // per-target resolution (single-instance delegation) merged over it.
  const getEffectiveContextData = useCallback((): Record<string, unknown> => {
    const base = (contextData ?? {}) as Record<string, unknown>;
    const resolved = resolvedContextRef.current;
    return resolved ? { ...base, ...resolved } : base;
  }, [contextData]);

  const resolveLaunchApplicationScope = useCallback((): ApplicationScope => {
    if (getApplicationScope) {
      return getApplicationScope();
    }

    const selectionText = capturedSelection.current?.text || selectedText || "";

    return buildApplicationScopeFromMenuContext({
      selectedText: selectionText,
      selectionRange,
      contextData: getEffectiveContextData(),
    });
  }, [
    getApplicationScope,
    getEffectiveContextData,
    selectedText,
    selectionRange,
  ]);

  // The content a Compare action operates on: the current selection if there
  // is one, otherwise the whole field/content passed via contextData.content.
  const getCompareContent = useCallback((): {
    content: string;
    label: string;
  } => {
    const sel = capturedSelection.current?.text || selectedText || "";
    if (sel.trim()) return { content: sel, label: "Selection" };
    const cd = getEffectiveContextData();
    const content = typeof cd.content === "string" ? cd.content : "";
    return { content, label: "Current" };
  }, [selectedText, getEffectiveContextData]);

  const handleCompareClipboard = useCallback(async () => {
    const { content, label } = getCompareContent();
    let clip = "";
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      toast({
        title: "Couldn't read the clipboard",
        variant: "destructive",
      });
      return;
    }
    if (!clip) {
      toast({ title: "Clipboard is empty" });
      return;
    }
    openDiffWindow({
      original: clip,
      modified: content,
      originalLabel: "Clipboard",
      modifiedLabel: label,
      title: "Compare with clipboard",
      engine: "light",
    });
  }, [getCompareContent, openDiffWindow]);

  const handleSetCompareBase = useCallback(() => {
    const { content, label } = getCompareContent();
    dispatch(setCompareBase({ content, label, language: null }));
    toast({
      title: "Set as compare base",
      description: "Open another item and choose “Compare with base”.",
    });
  }, [getCompareContent, dispatch]);

  const handleCompareWithBase = useCallback(async () => {
    const { content, label } = getCompareContent();
    const opened = await dispatch(
      openCompareWithBase({ current: content, currentLabel: label }),
    ).unwrap();
    if (!opened) {
      toast({
        title: "No compare base set",
        description: "Choose “Set as compare base” on another item first.",
      });
    }
  }, [getCompareContent, dispatch]);

  React.useEffect(() => {
    const handleSelection = () => {
      if (selectionLocked.current) return;
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      setSelectedText(text);

      if (text && selection && selection.rangeCount > 0) {
        const rect = getSelectionRect();
        if (rect) {
          setSelectionRect(rect);
        } else if (lastMousePos.current) {
          setSelectionRect(
            mouseFallbackRect(lastMousePos.current.x, lastMousePos.current.y),
          );
        }
      } else {
        setSelectionRect(null);
      }
    };
    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    const target = e.target as HTMLElement;
    // Single-instance delegation: resolve per-target context (message/block/
    // tool/content) from the element being right-clicked, before the menu opens.
    resolvedContextRef.current = resolveContextOnOpen
      ? resolveContextOnOpen(target)
      : null;
    selectionLocked.current = true;

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const captured = captureTextareaSelection(target);
      capturedSelection.current = captured;

      if (captured.text) {
        const rect = getSelectionRect();
        if (rect) {
          setSelectionRect(rect);
        } else if (lastMousePos.current) {
          setSelectionRect(
            mouseFallbackRect(lastMousePos.current.x, lastMousePos.current.y),
          );
        }
      }
      setSelectedText(captured.text);
    } else {
      const captured = captureDomSelection();
      capturedSelection.current = captured;

      if (captured.text && captured.range) {
        try {
          const rect = captured.range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setSelectionRect(rect);
          }
        } catch {
          // best-effort
        }
      }
      setSelectedText(captured.text);
    }
  };

  React.useEffect(() => {
    findReplaceOpenRef.current = findReplaceOpen;
  }, [findReplaceOpen]);

  React.useEffect(() => {
    const shouldShow =
      enableFloatingIcon &&
      selectedText.length > 0 &&
      selectionRect !== null &&
      !menuOpen &&
      !dropdownOpen;
    const timer = setTimeout(() => {
      setShowFloatingIcon(shouldShow);
    }, 200);
    return () => clearTimeout(timer);
  }, [enableFloatingIcon, selectedText, selectionRect, menuOpen, dropdownOpen]);

  React.useEffect(() => {
    if (!showFloatingIcon) return;
    const handleScroll = () => {
      setShowFloatingIcon(false);
      setSelectionRect(null);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showFloatingIcon]);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    let captured = capturedSelection.current;

    if (!captured || !captured.text) {
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        captured = captureTextareaSelection(target);
      } else {
        captured = captureDomSelection();
      }
      capturedSelection.current = captured;
      selectionLocked.current = true;
    }

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const text = captured?.text || "";
      setSelectedText(text);
      setSelectionRange({
        type: "editable",
        element: target,
        start,
        end,
        range: null,
        containerElement: null,
      });
      setMenuOpen(true);
    } else {
      const text = captured?.text || "";
      const range = captured?.range || null;
      let containerElement = e.currentTarget as HTMLElement;
      if (!containerElement.hasAttribute("data-radix-context-menu-trigger")) {
        const trigger = containerElement.querySelector(
          "[data-radix-context-menu-trigger]",
        );
        if (trigger instanceof HTMLElement) containerElement = trigger;
      }
      setSelectedText(text);
      setSelectionRange({
        type: "non-editable",
        element: null,
        start: 0,
        end: 0,
        range,
        containerElement,
      });
      setMenuOpen(true);
    }
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
    selectionLocked.current = false;
    capturedSelection.current = null;

    if (skipSelectionRestore) {
      setSkipSelectionRestore(false);
      return;
    }
    if (findReplaceOpen) return;
    if (!selectionRange) return;

    if (selectionRange.type === "editable") {
      const { element, start, end } = selectionRange;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        restoreTextareaSelection(element, start, end);
      }
    } else {
      const { range } = selectionRange;
      if (range) restoreDomSelection(range);
    }
  };

  const handleCut = async () => {
    if (!selectionRange || selectionRange.type !== "editable") return;
    const element = selectionRange.element;
    if (
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLInputElement)
    )
      return;
    const { start, end } = selectionRange;
    const cutText = element.value.substring(start, end);
    try {
      await navigator.clipboard.writeText(cutText);
      const newValue =
        element.value.substring(0, start) + element.value.substring(end);
      if (onTextReplace) {
        onTextReplace(newValue);
      } else {
        element.value = newValue;
        element.setSelectionRange(start, start);
      }
      setSelectionRange(null);
    } catch (err) {
      console.error("Failed to cut:", err);
    }
  };

  const handleCopy = async () => {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handlePaste = async () => {
    if (!selectionRange || !isEditable) return;
    if (selectionRange.type !== "editable") return;
    const element = selectionRange.element;
    if (
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLInputElement)
    )
      return;
    try {
      const text = await navigator.clipboard.readText();
      const { start, end } = selectionRange;
      const before = element.value.substring(0, start);
      const after = element.value.substring(end);
      const newValue = before + text + after;
      if (onTextReplace) {
        onTextReplace(newValue);
      } else {
        element.value = newValue;
        element.setSelectionRange(start + text.length, start + text.length);
      }
    } catch (err) {
      console.error("Failed to paste:", err);
    }
  };

  const handleSelectAll = () => {
    if (!selectionRange) return;
    const selectionToUse = selectionRange;
    setSelectionRange(null);

    if (selectionToUse.type === "editable") {
      const element = selectionToUse.element;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        requestAnimationFrame(() => {
          element.focus();
          element.select();
        });
      }
    } else {
      const container = selectionToUse.containerElement;
      if (!container) return;
      requestAnimationFrame(() => {
        try {
          const range = document.createRange();
          range.selectNodeContents(container);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch {
          // best-effort
        }
      });
    }
  };

  const handleFind = () => {
    setSkipSelectionRestore(true);
    setFindReplaceOpen(true);
    findReplaceOpenRef.current = true;
  };

  const handleShortcutExecute = useCallback(
    async (entry: Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>) => {
      if (!entry.agentId) {
        toast({
          title: "Agent Not Connected",
          description: `"${entry.label}" has no connected agent. Please configure it in the admin panel.`,
          variant: "destructive",
        });
        return;
      }

      const selectionText =
        capturedSelection.current?.text || selectedText || "";

      const applicationScope = resolveLaunchApplicationScope();

      const resultDisplay = (entry.displayMode ??
        "modal-full") as ResultDisplayMode;

      try {
        // The shortcut's persisted config is loaded by createInstanceFromShortcut
        // in the launch thunk. We forward only minimal overrides — the bundle
        // wins. Runtime values go in `runtime`.
        //
        // `runtime.surfaceName` is what triggers the surface-mapping
        // resolution in launchAgentExecution. When set, the thunk looks up
        // `agx_agent_surface.value_mappings` for (shortcut.agentId,
        // surfaceName, caller scope) and applies them via
        // mapScopeToInstanceWithSurface — falling back to the shortcut's
        // own scopeMappings when no surface binding exists.
        await launchShortcut(entry.id, applicationScope, {
          surfaceKey: `${sourceFeature}:${entry.id}`,
          sourceFeature,
          config: {
            displayMode: resultDisplay,
          },
          runtime: {
            originalText: selectionText,
            surfaceName,
          },
        });
      } catch (error) {
        console.error(
          "[UnifiedAgentContextMenu] shortcut execution failed",
          error,
        );
        const message =
          error instanceof Error ? error.message : "An unknown error occurred";
        toast({
          title: "Execution Failed",
          description: `${entry.label}: ${message}`,
          variant: "destructive",
        });
      }
    },
    [
      launchShortcut,
      resolveLaunchApplicationScope,
      selectedText,
      sourceFeature,
      surfaceName,
    ],
  );

  const handleBoundAgentExecute = useCallback(
    async (entry: SurfaceBoundAgentEntry) => {
      const selectionText =
        capturedSelection.current?.text || selectedText || "";

      const applicationScope = resolveLaunchApplicationScope();

      try {
        await launchAgent(entry.agentId, {
          surfaceKey: `${sourceFeature}:bound-agent:${entry.agentId}`,
          sourceFeature,
          config: {
            displayMode: "modal-full",
            autoRun: true,
            allowChat: true,
            showVariablePanel: true,
          },
          runtime: {
            applicationScope,
            originalText: selectionText,
            surfaceName,
          },
        });
      } catch (error) {
        console.error(
          "[UnifiedAgentContextMenu] bound agent launch failed",
          error,
        );
        const message =
          error instanceof Error ? error.message : "An unknown error occurred";
        toast({
          title: "Execution Failed",
          description: `${entry.name}: ${message}`,
          variant: "destructive",
        });
      }
    },
    [
      launchAgent,
      resolveLaunchApplicationScope,
      selectedText,
      sourceFeature,
      surfaceName,
    ],
  );

  const handleContentBlockInsert = useCallback(
    (entry: Extract<AgentMenuEntry, { entryType: "content_block" }>) => {
      const template = entry.template;

      if (editorId) {
        try {
          const { insertTextAtCursor } =
            require("@/features/rich-text-editor/utils/insertTextUtils") as {
              insertTextAtCursor: (id: string, text: string) => boolean;
            };
          const success = insertTextAtCursor(editorId, template);
          if (success) onContentInserted?.();
        } catch (err) {
          console.error("Failed to insert content block into editor:", err);
        }
        return;
      }

      if (getTextarea) {
        const textarea = getTextarea();
        if (textarea) {
          const success = insertTextAtTextareaCursor(textarea, template);
          if (success) onContentInserted?.();
        }
      }
    },
    [editorId, getTextarea, onContentInserted],
  );

  const handleEntrySelect = useCallback(
    (entry: AgentMenuEntry) => {
      if (entry.entryType === "agent_shortcut") {
        void handleShortcutExecute(entry);
      } else {
        handleContentBlockInsert(entry);
      }
    },
    [handleShortcutExecute, handleContentBlockInsert],
  );

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
    setDropdownOpen(true);
  };

  const menuBodyProps = {
    loading,
    selectedText,
    isEditable,
    placementMode: resolvedPlacementMode,
    categoryGroups,
    boundAgentSections,
    boundAgentsLoading,
    showBoundAgents:
      Boolean(surfaceName) && resolvedPlacementMode["bound-agent"] !== "hide",
    onBoundAgentSelect: (entry) => void handleBoundAgentExecute(entry),
    onEntrySelect: handleEntrySelect,
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handlePaste,
    onSelectAll: handleSelectAll,
    onFind: handleFind,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    undoHint,
    redoHint,
    onViewHistory,
    hasHistory,
    onCompareClipboard: handleCompareClipboard,
    onSetCompareBase: handleSetCompareBase,
    onCompareWithBase: handleCompareWithBase,
    hasCompareBase,
    extraSections,
    isAdmin,
    isDebugMode,
    isAdminIndicatorOpen,
    onToggleDebugMode: () => dispatch(toggleDebugMode()),
    onToggleAdminIndicator: () =>
      dispatch(toggleOverlay({ overlayId: "adminIndicator" })),
    onInspectContext: () => setContextDebugOpen(true),
    onOpenQuickNotes: () => openQuickNotes(),
    onOpenQuickTasks: () => openQuickTasks(),
    onOpenQuickChat: () => openQuickChat(),
    onOpenQuickData: () => openQuickData(),
    onOpenQuickFiles: () => openQuickFiles(),
    onOpenVoicePad: () => openVoicePad(),
  };

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) ensureMenuLoaded();
          else handleMenuClose();
        }}
      >
        <ContextMenuTrigger
          asChild
          onMouseDown={handleMouseDown}
          onContextMenu={(e) => {
            ensureMenuLoaded();
            handleContextMenu(e);
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className={`w-64 ${className ?? ""}`}>
          <MenuBody variant="context" {...menuBodyProps} />
          <div className="select-none border-t border-border/50 px-2 py-1 text-[10px] leading-none text-muted-foreground/70">
            {surfaceName ?? "(no surface)"} · C{CANONICAL_MENU_VERSION}V{menuVersion}
          </div>
        </ContextMenuContent>
      </ContextMenu>

      {enableFloatingIcon && (
        <DropdownMenu
          open={dropdownOpen}
          onOpenChange={(open) => {
            if (open) ensureMenuLoaded();
            handleDropdownClose(open);
          }}
        >
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
                onOpen={(e) => {
                  ensureMenuLoaded();
                  handleOpenFloating(e);
                }}
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
            <MenuBody variant="dropdown" {...menuBodyProps} />
            <div className="select-none border-t border-border/50 px-2 py-1 text-[10px] leading-none text-muted-foreground/70">
              {surfaceName ?? "(no surface)"} · C{CANONICAL_MENU_VERSION}V{menuVersion}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {isDebugMode && (
        <ContextDebugModal
          isOpen={contextDebugOpen}
          onClose={() => setContextDebugOpen(false)}
          contextData={{
            selection: capturedSelection.current?.text || selectedText,
            content:
              typeof contextData?.content === "string"
                ? contextData.content
                : "",
            context:
              typeof contextData?.context === "string"
                ? contextData.context
                : "",
            ...contextData,
          }}
        />
      )}

      {textResultModalOpen && textResultData && (
        <TextActionResultModal
          isOpen={textResultModalOpen}
          onClose={() => {
            setTextResultModalOpen(false);
            setTextResultData(null);
            setSelectionRange(null);
            setSelectedText("");
          }}
          originalText={textResultData.original}
          aiResponse={textResultData.result}
          promptName={textResultData.promptName}
          onReplace={(newText) => {
            onTextReplace?.(newText);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertBefore={(text) => {
            onTextInsertBefore?.(text);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertAfter={(text) => {
            onTextInsertAfter?.(text);
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
        />
      )}

      {findReplaceOpen && (
        <FindReplaceModal
          isOpen={findReplaceOpen}
          onClose={() => {
            setFindReplaceOpen(false);
            findReplaceOpenRef.current = false;
          }}
          targetElement={
            selectionRange?.type === "editable"
              ? (selectionRange.element as
                  | HTMLTextAreaElement
                  | HTMLInputElement
                  | null)
              : null
          }
          onReplace={onTextReplace}
        />
      )}
    </>
  );
}

/**
 * Back-compat alias. `UniversalContextMenuV2` is the canonical name — this
 * component is NOT agent-specific; "Agent" referred only to the shortcut/AI
 * engine that powers AI Actions on every surface. Existing call sites import
 * `UnifiedAgentContextMenu`; keep this export until they're migrated.
 */
export const UnifiedAgentContextMenu = UniversalContextMenuV2;
