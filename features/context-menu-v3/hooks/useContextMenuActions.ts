"use client";

// features/context-menu-v3/hooks/useContextMenuActions.ts
//
// THE shared engine behind both menu renderers. Desktop (`MenuContent`) and
// mobile (`MobileMenuContent`) are pure PRESENTATION over this hook — Radix
// submenus vs a 70dvh drill-down — while every piece of behavior lives here
// exactly once: placement resolution, the single deduped data fetch, scope +
// action-text resolution, the rich-document action lists, and every handler
// (clipboard, history, compare, launch, insert, attach/share, admin).
//
// This extraction pays down the long-flagged "handlers ported 1:1, keep in
// lockstep" debt: a launch-path or handler change now lands in ONE place and
// both renderers inherit it. Do NOT add a handler to a renderer — add it here.
//
// Inline agent editing: both launch handlers pass `runtime.widgetHandleId`
// (registered by the shell for editable surfaces), so any agent/shortcut
// launched from the menu can stream `widget_text_*` edits into the surface.

import { useEffect } from "react";
import {
  Building,
  FileText,
  Rocket,
  User,
} from "lucide-react";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
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
import { useOpenFindReplace } from "@/features/overlays/openers/findReplace";
import { useOpenContextAssignment } from "@/features/overlays/openers/contextAssignment";
import { useOpenShareModalWindow } from "@/features/overlays/openers/shareModalWindow";
import { useOpenStateViewerOverlay } from "@/features/overlays/openers/adminStateAnalyzer";
import { useOpenSurfaceContextInspector } from "@/features/overlays/openers/surfaceContextInspector";
import { toast } from "@/components/ui/use-toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { insertTextAtCursor } from "@/utils/editor-text-insertion";
import { insertTextAtTextareaCursor } from "@/utils/text-insertion";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { resolveActions } from "@/features/rich-document/actions/registry";
import { getSourceAdapter } from "@/features/rich-document/actions/sources";
import { shortHash } from "@/features/rich-document/actions/sources/raw";
// Side-effect import: the copy/save/export/convert handlers self-register into
// the rich-document action registry on load, so resolveActions resolves them.
import "@/features/rich-document/actions/handlers";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
} from "@/features/rich-document/types";
import {
  PLACEMENT_TYPES,
  PLACEMENT_TYPE_META,
} from "@/features/agent-shortcuts/constants";
import type { ResultDisplayMode } from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import {
  useUnifiedAgentContextMenu,
  type AgentMenuEntry,
  type AgentMenuCategoryGroup,
} from "./useUnifiedAgentContextMenu";
import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import type {
  SurfaceBoundAgentEntry,
  SurfaceBoundAgentSection,
} from "@/features/surfaces/services/surface-bound-agents.service";
import {
  resolveApplicationScope,
  resolveActionText,
  reportMenuDiagnostics,
  type ResolvedActionText,
} from "../value-resolution";
import { spliceInputValue } from "../utils/selection-tracking";
import type {
  MenuContentProps,
  PlacementKey,
  PlacementVisibility,
} from "../types";
import { MANAGED_CONTEXT_MENU_AGENT_CONFIG } from "../managed-agent-launch";

// ─────────────────────────────────────────────────────────────────────────────
// Shared menu-model constants + pure helpers (used by both renderers).
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PLACEMENT_MODE: Record<PlacementKey, PlacementVisibility> =
  {
    "ai-action": "show",
    "bound-agent": "show",
    "content-block": "show",
    "organization-tool": "show",
    "user-tool": "show",
    "quick-action": "show",
  };

export const ALL_DB_PLACEMENTS: PlacementKey[] = [
  "ai-action",
  "content-block",
  "organization-tool",
  "user-tool",
];

/** User-facing relabels matching the v3 taxonomy (My Items / Org Items). */
export const PLACEMENT_LABEL_OVERRIDE: Partial<Record<string, string>> = {
  [PLACEMENT_TYPES.USER_TOOL]: "My Items",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "Org Items",
};

export const PLACEMENT_COLOR: Record<string, string> = {
  [PLACEMENT_TYPES.AI_ACTION]: "#0ea5e9",
  [PLACEMENT_TYPES.CONTENT_BLOCK]: "#8b5cf6",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "#f59e0b",
  [PLACEMENT_TYPES.USER_TOOL]: "#10b981",
};

export function getPlacementIcon(placementType: string) {
  switch (placementType) {
    case PLACEMENT_TYPES.AI_ACTION:
      return Rocket;
    case PLACEMENT_TYPES.CONTENT_BLOCK:
      return FileText;
    case PLACEMENT_TYPES.ORGANIZATION_TOOL:
      return Building;
    case PLACEMENT_TYPES.USER_TOOL:
      return User;
    default:
      return FileText;
  }
}

export function getPlacementLabel(placementType: string): string {
  return (
    PLACEMENT_LABEL_OVERRIDE[placementType] ??
    PLACEMENT_TYPE_META[placementType as keyof typeof PLACEMENT_TYPE_META]
      ?.label ??
    placementType
  );
}

export function resolveIcon(
  iconName: string | null | undefined,
  fallback = "FileText",
) {
  return getIconComponent(iconName ?? fallback, fallback);
}

export function groupsByPlacement(
  groups: AgentMenuCategoryGroup[],
): Record<string, AgentMenuCategoryGroup[]> {
  const map: Record<string, AgentMenuCategoryGroup[]> = {};
  for (const g of groups) {
    (map[g.category.placementType] ??= []).push(g);
  }
  return map;
}

export function hasItemsRecursive(group: AgentMenuCategoryGroup): boolean {
  if (group.items.length > 0) return true;
  return group.children.some(hasItemsRecursive);
}

/** Resolve a rich-document action's label + disabled state for rendering. */
export function resolveRichActionView(
  action: RichDocumentAction,
  ctx: RichDocumentActionContext,
): { label: string; disabled: boolean } {
  const label =
    typeof action.label === "function" ? action.label(ctx) : action.label;
  const disabledResult = action.disabled?.(ctx);
  const disabled =
    typeof disabledResult === "object" ? true : Boolean(disabledResult);
  return { label, disabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// The engine hook.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextMenuActions {
  // Resolved model
  scope: ApplicationScope;
  actionText: ResolvedActionText;
  resolvedPlacementMode: Record<PlacementKey, PlacementVisibility>;
  categoryGroups: AgentMenuCategoryGroup[];
  grouped: Record<string, AgentMenuCategoryGroup[]>;
  loading: boolean;
  boundAgentSections: SurfaceBoundAgentSection[];
  boundAgentsLoading: boolean;
  richDocCtx: RichDocumentActionContext;
  copyVariantActions: RichDocumentAction[];
  exportActions: RichDocumentAction[];
  convertActions: RichDocumentAction[];
  // Flags
  hasCompareBase: boolean;
  isAdmin: boolean;
  isDebugMode: boolean;
  isAdminIndicatorOpen: boolean;
  canNativeUndo: boolean;
  // Handlers
  handleCopy: () => Promise<void>;
  handleCut: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleSelectAll: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCompareClipboard: () => Promise<void>;
  handleSetCompareBase: () => void;
  handleCompareWithBase: () => Promise<void>;
  handleShortcutExecute: (
    entry: Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>,
  ) => Promise<void>;
  handleBoundAgentExecute: (entry: SurfaceBoundAgentEntry) => Promise<void>;
  handleContentBlockInsert: (
    entry: Extract<AgentMenuEntry, { entryType: "content_block" }>,
  ) => void;
  handleEntrySelect: (entry: AgentMenuEntry) => void;
  handleDelete: () => Promise<void>;
  handleFind: () => void;
  handleAttach: () => void;
  handleShare: () => void;
  handleInspectValues: () => void;
  handleInspectState: () => void;
  handleToggleDebugMode: () => void;
  handleToggleAdminIndicator: () => void;
  // Quick actions (pass-through so renderers need no extra hook)
  quickActions: ReturnType<typeof useQuickActions>;
}

export function useContextMenuActions(
  props: Omit<MenuContentProps, "variant">,
): ContextMenuActions {
  const {
    sourceFeature,
    surfaceName,
    getApplicationScope,
    contextData,
    selectedText,
    selectionRange,
    fallbackContent,
    addedContexts,
    excludedContexts,
    placementMode,
    scope: shortcutScope,
    scopeId,
    extraSections,
    isEditable,
    editorId,
    getTextarea,
    onContentInserted,
    onTextReplace,
    onDelete,
    onUndo,
    onRedo,
    widgetHandleId,
  } = props;

  const dispatch = useAppDispatch();
  const entity = props.entity;

  const resolvedPlacementMode: Record<PlacementKey, PlacementVisibility> = {
    ...DEFAULT_PLACEMENT_MODE,
    ...(placementMode ?? {}),
  };
  const dbPlacementTypes = ALL_DB_PLACEMENTS.filter(
    (p) => resolvedPlacementMode[p] !== "hide",
  );

  const { categoryGroups, loading, refresh } = useUnifiedAgentContextMenu({
    placementTypes: dbPlacementTypes,
    addedContexts,
    excludedContexts,
    surfaceName,
    enabled: dbPlacementTypes.length > 0,
    scope: shortcutScope,
    scopeId,
  });

  const {
    sections: boundAgentSections,
    loading: boundAgentsLoading,
    refresh: refreshBoundAgents,
  } = useSurfaceBoundAgents(surfaceName, { isEditable });

  const { launchShortcut, launchAgent } = useAgentLauncher();
  const quickActions = useQuickActions();
  const openDiffWindow = useOpenDiffViewerWindow();
  const openFindReplace = useOpenFindReplace();
  const openContextAssignment = useOpenContextAssignment();
  const openShareModalWindow = useOpenShareModalWindow();
  const openStateViewer = useOpenStateViewerOverlay();
  const openSurfaceInspector = useOpenSurfaceContextInspector();

  const hasCompareBase = useAppSelector(selectHasCompareBase);
  const currentUserId = useAppSelector(selectUserId);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // The single, deduped fetch — fires on the renderer's mount (= on open).
  // Both the unified-menu thunk and the bound-agents service dedupe, so reopen
  // never refetches. A double fetch is structurally impossible.
  useEffect(() => {
    void refresh();
    // Default-contract agents (matrx-default/*) apply even with no surfaceName,
    // so always fetch — a bare/undeclared surface still gets its default agents.
    void refreshBoundAgents();
  }, []);

  // Assemble the scope the menu acts on. Stable for this open (the shell
  // captured selection before mount), so computing it in render is cheap.
  const scope = resolveApplicationScope({
    getApplicationScope,
    contextData,
    selectedText,
    selectionRange,
    fallbackContent,
  });
  const actionText = resolveActionText(scope);

  // Rich-document action context — reuses the canonical copy / export / convert
  // handlers (NOT a fork). Only populated when there is content to act on, so
  // the submenus self-hide on an inert menu.
  const richDocSource: ContentSource = props.contentSource ?? { type: "raw" };
  const richDocAdapter = getSourceAdapter(richDocSource.type);
  // Raw sources fold a content hash into the instance prefix so two raw
  // documents on one page never share overlay instance IDs (parity with
  // useActionSurfaceProvider's ctx builder).
  const richPrefix =
    richDocSource.type === "raw"
      ? `${richDocAdapter.instanceKeyPrefix(richDocSource)}-${shortHash(actionText.text).slice(0, 8)}`
      : richDocAdapter.instanceKeyPrefix(richDocSource);
  const richDocCtx: RichDocumentActionContext = {
    content: actionText.text,
    source: richDocSource,
    metadata: null,
    dispatch,
    isAuthenticated: Boolean(currentUserId),
    isAdmin,
    isCreator: false,
    surfaceKey: surfaceName ?? null,
    onClose: () => {},
    instanceKey: (prefix) => `${richPrefix}-${prefix}`,
    sourceAdapter: richDocAdapter,
    ...(props.richDocCtxExtras ?? {}),
  };
  const richActions =
    actionText.source !== "none"
      ? resolveActions(
          richDocCtx,
          props.excludedRichActions?.length
            ? { exclude: props.excludedRichActions }
            : undefined,
        )
      : [];
  const copyVariantActions = richActions.filter((a) => a.category === "copy");
  const exportActions = richActions.filter(
    (a) => a.category === "export" || a.id === "save-as-file",
  );
  const convertActions = richActions.filter(
    (a) => a.category === "save" && a.id !== "save-as-file",
  );

  // Loud guards — dev-only scream for inert menus + value-mapping gaps.
  useEffect(() => {
    reportMenuDiagnostics({
      surfaceName,
      scope,
      isEditable,
      hasExtraSections: Boolean(extraSections && extraSections.length > 0),
    });
  }, []);

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!actionText.text) return;
    try {
      await navigator.clipboard.writeText(actionText.text);
    } catch (err) {
      console.error("[ContextMenuV3] copy failed", err);
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
      if (onTextReplace) {
        onTextReplace(
          element.value.substring(0, start) + element.value.substring(end),
        );
      } else {
        spliceInputValue(element, start, end, "");
      }
    } catch (err) {
      console.error("[ContextMenuV3] cut failed", err);
    }
  };

  const handlePaste = async () => {
    if (!isEditable || !selectionRange || selectionRange.type !== "editable")
      return;
    const element = selectionRange.element;
    if (
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLInputElement)
    )
      return;
    try {
      const text = await navigator.clipboard.readText();
      const { start, end } = selectionRange;
      if (onTextReplace) {
        onTextReplace(
          element.value.substring(0, start) +
            text +
            element.value.substring(end),
        );
      } else {
        spliceInputValue(element, start, end, text);
      }
    } catch (err) {
      console.error("[ContextMenuV3] paste failed", err);
    }
  };

  const handleSelectAll = () => {
    if (!selectionRange) return;
    if (selectionRange.type === "editable") {
      const element = selectionRange.element;
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
      const container = selectionRange.containerElement;
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

  // ── History ───────────────────────────────────────────────────────────────
  // Native per-field Undo/Redo. When the surface provides no richer history
  // (`onUndo`/`onRedo`), an editable field still gets the browser's built-in
  // undo stack — "offer undo" without standing up a history system. There is no
  // non-deprecated API to trigger a textarea's native undo, so `execCommand` is
  // the intentional (and only) mechanism here.
  const editableElement: HTMLTextAreaElement | HTMLInputElement | null =
    (() => {
      const fromRange =
        selectionRange?.type === "editable" ? selectionRange.element : null;
      const el = fromRange ?? getTextarea?.() ?? null;
      return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el
        : null;
    })();
  const canNativeUndo = Boolean(isEditable && editableElement);
  const runNativeEdit = (command: "undo" | "redo") => {
    if (!editableElement) return;
    editableElement.focus();
    try {
      document.execCommand(command);
    } catch (err) {
      console.error(`[ContextMenuV3] native ${command} failed`, err);
    }
  };
  const handleUndo = () => (onUndo ? onUndo() : runNativeEdit("undo"));
  const handleRedo = () => (onRedo ? onRedo() : runNativeEdit("redo"));

  // ── Compare — reuses the existing diff-viewer window + compare-base slice ──
  const compareContent = (): { content: string; label: string } =>
    actionText.source === "selection"
      ? { content: actionText.text, label: "Selection" }
      : { content: actionText.text, label: "Current" };

  const handleCompareClipboard = async () => {
    const { content, label } = compareContent();
    let clip = "";
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      toast({ title: "Couldn't read the clipboard", variant: "destructive" });
      return;
    }
    if (!clip) {
      toast({ title: "Clipboard is empty" });
      return;
    }
    // Current content is the baseline (old); the clipboard is the incoming
    // version the user is about to paste (new). Clipboard-only text => addition.
    openDiffWindow({
      original: content,
      modified: clip,
      originalLabel: label,
      modifiedLabel: "Clipboard",
      title: "Compare with clipboard",
      engine: "light",
    });
  };

  const handleSetCompareBase = () => {
    const { content, label } = compareContent();
    dispatch(setCompareBase({ content, label, language: null }));
    toast({
      title: "Set as compare base",
      description: "Open another item and choose “Compare with base”.",
    });
  };

  const handleCompareWithBase = async () => {
    const { content, label } = compareContent();
    const opened = await dispatch(
      openCompareWithBase({ current: content, currentLabel: label }),
    ).unwrap();
    if (!opened) {
      toast({
        title: "No compare base set",
        description: "Choose “Set as compare base” on another item first.",
      });
    }
  };

  // ── Launch (AI actions / bound agents / content blocks) ──────────────────
  const handleShortcutExecute = async (
    entry: Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>,
  ) => {
    if (!entry.agentId) {
      toast({
        title: "Agent Not Connected",
        description: `"${entry.label}" has no connected agent. Configure it in the admin panel.`,
        variant: "destructive",
      });
      return;
    }
    const resultDisplay = (entry.displayMode ??
      "modal-full") as ResultDisplayMode;
    try {
      await launchShortcut(entry.id, scope, {
        surfaceKey: `${sourceFeature}:${entry.id}`,
        sourceFeature,
        config: { displayMode: resultDisplay },
        runtime: {
          originalText: actionText.text,
          surfaceName,
          // Editable surfaces: let the agent stream widget_text_* edits
          // straight into the surface (undefined on read-only — no tools).
          widgetHandleId: widgetHandleId ?? undefined,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Execution Failed",
        description: `${entry.label}: ${message}`,
        variant: "destructive",
      });
    }
  };

  const handleBoundAgentExecute = async (entry: SurfaceBoundAgentEntry) => {
    try {
      await launchAgent(entry.agentId, {
        surfaceKey: `${sourceFeature}:bound-agent:${entry.agentId}`,
        sourceFeature,
        // Managed entries share the WindowPanel default. autoRun is deliberately
        // absent so the safe open-and-wait default remains authoritative.
        config: MANAGED_CONTEXT_MENU_AGENT_CONFIG,
        runtime: {
          applicationScope: scope,
          originalText: actionText.text,
          surfaceName,
          widgetHandleId: widgetHandleId ?? undefined,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Execution Failed",
        description: `${entry.name}: ${message}`,
        variant: "destructive",
      });
    }
  };

  const handleContentBlockInsert = (
    entry: Extract<AgentMenuEntry, { entryType: "content_block" }>,
  ) => {
    const template = entry.template;
    if (editorId) {
      if (insertTextAtCursor(editorId, template)) onContentInserted?.();
      return;
    }
    if (getTextarea) {
      const textarea = getTextarea();
      if (textarea && insertTextAtTextareaCursor(textarea, template))
        onContentInserted?.();
    }
  };

  const handleEntrySelect = (entry: AgentMenuEntry) => {
    if (entry.entryType === "agent_shortcut") void handleShortcutExecute(entry);
    else handleContentBlockInsert(entry);
  };

  // ── Editable Save / Delete — Delete always via ConfirmDialog ─────────────
  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: "Delete this item?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) onDelete();
  };

  // ── Overlay-opening actions ───────────────────────────────────────────────
  // Find & Replace carries the live target element + onReplace through the
  // callback registry (never Redux). Suppress the shell's selection-restore so
  // the modal keeps focus after the menu closes (applies on BOTH renderers —
  // the mobile sheet closes into the same overlay).
  const handleFind = () => {
    props.suppressSelectionRestore();
    openFindReplace({
      getTargetElement: () =>
        selectionRange?.type === "editable" ? selectionRange.element : null,
      onReplace: onTextReplace,
    });
  };

  const handleAttach = () => {
    if (!entity) return;
    openContextAssignment({
      subject: {
        entityType: entity.type,
        entityId: entity.id,
        title: entity.title,
      },
    });
  };

  const handleShare = () => {
    if (!entity?.resourceType) return;
    openShareModalWindow({
      resourceType: entity.resourceType,
      resourceId: entity.id,
      resourceName: entity.title,
    });
  };

  // ── Admin ─────────────────────────────────────────────────────────────────
  const handleInspectValues = () => {
    openSurfaceInspector({
      surfaceName: surfaceName ?? null,
      scope,
      isEditable: Boolean(isEditable),
    });
  };
  const handleInspectState = () => {
    openStateViewer();
  };
  const handleToggleDebugMode = () => {
    dispatch(toggleDebugMode());
  };
  const handleToggleAdminIndicator = () => {
    dispatch(toggleOverlay({ overlayId: "adminIndicator" }));
  };

  return {
    scope,
    actionText,
    resolvedPlacementMode,
    categoryGroups,
    grouped: groupsByPlacement(categoryGroups),
    loading,
    boundAgentSections,
    boundAgentsLoading,
    richDocCtx,
    copyVariantActions,
    exportActions,
    convertActions,
    hasCompareBase,
    isAdmin,
    isDebugMode,
    isAdminIndicatorOpen,
    canNativeUndo,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleUndo,
    handleRedo,
    handleCompareClipboard,
    handleSetCompareBase,
    handleCompareWithBase,
    handleShortcutExecute,
    handleBoundAgentExecute,
    handleContentBlockInsert,
    handleEntrySelect,
    handleDelete,
    handleFind,
    handleAttach,
    handleShare,
    handleInspectValues,
    handleInspectState,
    handleToggleDebugMode,
    handleToggleAdminIndicator,
    quickActions,
  };
}
