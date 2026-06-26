"use client";

// features/context-menu-v3/components/MenuContent.tsx
//
// The HEAVY layer (T1) — loaded by the shell via next/dynamic({ssr:false}) on
// the first open only. Everything expensive lives here so the shell stays
// inert: the unified-menu + bound-agent data hooks (which fire the single,
// deduped fetch on THIS component's mount), the launchers, the clipboard /
// launch / compare handlers, the react-icons resolver, and the full menu tree.
//
// Two failure classes are killed structurally here:
//   1. "Fake menu" — Copy is source-gated on `resolveActionText`, which falls
//      back to the DOM-captured content, so right-clicking read-only content
//      always copies. `reportMenuDiagnostics` SCREAMS in dev if a menu opens
//      with nothing to act on.
//   2. Lost values — `resolveApplicationScope` guarantees the 5 baselines and
//      passes every surface-declared value through; the audit screams on gaps.
//
// Modals/windows are dispatched through the OverlayController (no modal code
// here). Reuses v2's data hook + bound-agents renderer (pure logic, not the
// bloat source); these relocate into v3 when v2 is deleted.

import React, { useEffect } from "react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Rocket,
  FileText,
  Zap,
  Building,
  User,
  Scissors,
  Copy,
  Clipboard,
  Type,
  Undo2,
  Redo2,
  History,
  GitCompareArrows,
  Clipboard as ClipboardIcon,
  Pin,
  Shield,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Mic,
  Download,
  Replace,
  Search,
  Share2,
  Link2,
  Bug,
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
import { insertTextAtTextareaCursor } from "@/utils/text-insertion";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { resolveActions } from "@/features/rich-document/actions/registry";
import { getSourceAdapter } from "@/features/rich-document/actions/sources";
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
// Reused from v2 (frozen): the unified-menu data hook + bound-agents renderer
// are pure logic/render, NOT the build-bloat source (that was the static
// MenuBody import). They relocate into v3 when v2 is removed.
import {
  useUnifiedAgentContextMenu,
  type AgentMenuEntry,
  type AgentMenuCategoryGroup,
} from "@/features/context-menu-v2/hooks/useUnifiedAgentContextMenu";
import { BoundAgentsMenuSection } from "@/features/context-menu-v2/components/BoundAgentsMenuSection";
import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import type { SurfaceBoundAgentEntry } from "@/features/surfaces/services/surface-bound-agents.service";
import {
  resolveApplicationScope,
  resolveActionText,
  reportMenuDiagnostics,
} from "../value-resolution";
import { spliceInputValue } from "../utils/selection-tracking";
import type {
  MenuContentProps,
  PlacementKey,
  PlacementVisibility,
  ExtraSectionAnchor,
  ContextMenuExtraItem,
} from "../types";

const DEFAULT_PLACEMENT_MODE: Record<PlacementKey, PlacementVisibility> = {
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

/** User-facing relabels matching the v3 taxonomy (My Items / Org Items). */
const PLACEMENT_LABEL_OVERRIDE: Partial<Record<string, string>> = {
  [PLACEMENT_TYPES.USER_TOOL]: "My Items",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "Org Items",
};

const PLACEMENT_COLOR: Record<string, string> = {
  [PLACEMENT_TYPES.AI_ACTION]: "#0ea5e9",
  [PLACEMENT_TYPES.CONTENT_BLOCK]: "#8b5cf6",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "#f59e0b",
  [PLACEMENT_TYPES.USER_TOOL]: "#10b981",
};

function getPlacementIcon(placementType: string) {
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

function resolveIcon(iconName: string | null | undefined, fallback = "FileText") {
  return getIconComponent(iconName ?? fallback, fallback);
}

function groupsByPlacement(
  groups: AgentMenuCategoryGroup[],
): Record<string, AgentMenuCategoryGroup[]> {
  const map: Record<string, AgentMenuCategoryGroup[]> = {};
  for (const g of groups) {
    const pt = g.category.placementType;
    (map[pt] ??= []).push(g);
  }
  return map;
}

function hasItemsRecursive(group: AgentMenuCategoryGroup): boolean {
  if (group.items.length > 0) return true;
  return group.children.some(hasItemsRecursive);
}

function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 50) return `"${t}"`;
  return `"${t.substring(0, 20)}...${t.substring(t.length - 20)}"`;
}

export default function MenuContent(props: MenuContentProps) {
  const {
    variant,
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
    onTextInsertBefore: _onTextInsertBefore,
    onTextInsertAfter: _onTextInsertAfter,
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
    // suppressSelectionRestore — used by overlay-opening actions, wired in the
    // overlay pass; read via `props` there to avoid an unused binding now.
  } = props;

  const dispatch = useAppDispatch();

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
  const {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openVoicePad,
  } = useQuickActions();
  const openDiffWindow = useOpenDiffViewerWindow();
  const openFindReplace = useOpenFindReplace();
  const openContextAssignment = useOpenContextAssignment();
  const openShareModalWindow = useOpenShareModalWindow();
  const openStateViewer = useOpenStateViewerOverlay();
  const openSurfaceInspector = useOpenSurfaceContextInspector();
  const entity = props.entity;

  const hasCompareBase = useAppSelector(selectHasCompareBase);
  const currentUserId = useAppSelector(selectUserId);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // The single, deduped fetch — fires on THIS component's mount (= on open).
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
  // handlers (NOT a fork). Built from the menu's resolved content + the
  // surface's content source (defaults to raw). Only populated when there is
  // content to act on, so the submenus self-hide on an inert menu.
  const richDocSource: ContentSource = props.contentSource ?? { type: "raw" };
  const richDocAdapter = getSourceAdapter(richDocSource.type);
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
    instanceKey: (prefix) =>
      `${richDocAdapter.instanceKeyPrefix(richDocSource)}-${prefix}`,
    sourceAdapter: richDocAdapter,
  };
  const richActions =
    actionText.source !== "none" ? resolveActions(richDocCtx) : [];
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

  // ── Variant-aware menu primitives ────────────────────────────────────────
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Label = variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  // ── Handlers ─────────────────────────────────────────────────────────────
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

  // Native per-field Undo/Redo. When the surface provides no richer history
  // (`onUndo`/`onRedo`), an editable field still gets the browser's built-in
  // undo stack — "offer undo" without standing up a history system. There is no
  // non-deprecated API to trigger a textarea's native undo, so `execCommand` is
  // the intentional (and only) mechanism here.
  const editableElement: HTMLTextAreaElement | HTMLInputElement | null = (() => {
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

  // Compare — reuses the existing diff-viewer window + compare-base slice.
  const compareContent = (): { content: string; label: string } => {
    if (actionText.source === "selection")
      return { content: actionText.text, label: "Selection" };
    return { content: actionText.text, label: "Current" };
  };

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

  // AI Actions + content blocks.
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
    const resultDisplay = (entry.displayMode ?? "modal-full") as ResultDisplayMode;
    try {
      await launchShortcut(entry.id, scope, {
        surfaceKey: `${sourceFeature}:${entry.id}`,
        sourceFeature,
        config: { displayMode: resultDisplay },
        runtime: { originalText: actionText.text, surfaceName },
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
        config: {
          displayMode: "modal-full",
          autoRun: true,
          allowChat: true,
          showVariablePanel: true,
        },
        runtime: {
          applicationScope: scope,
          originalText: actionText.text,
          surfaceName,
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
      try {
        const { insertTextAtCursor } =
          require("@/features/rich-text-editor/utils/insertTextUtils") as {
            insertTextAtCursor: (id: string, text: string) => boolean;
          };
        if (insertTextAtCursor(editorId, template)) onContentInserted?.();
      } catch (err) {
        console.error("[ContextMenuV3] content block insert failed", err);
      }
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

  // Editable Save / Delete — surface-provided; Delete via ConfirmDialog.
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

  // Find & Replace → the findReplace overlay. Carries the live target element
  // + onReplace through the callback registry (never Redux). Suppress the
  // shell's selection-restore so the modal keeps focus after the menu closes.
  const handleFind = () => {
    props.suppressSelectionRestore();
    openFindReplace({
      getTargetElement: () =>
        selectionRange?.type === "editable" ? selectionRange.element : null,
      onReplace: onTextReplace,
    });
  };

  // Attach To → the contextAssignment overlay (writes ctx_scope_assignments).
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

  // Share → the shareModalWindow overlay.
  const handleShare = () => {
    if (!entity?.resourceType) return;
    openShareModalWindow({
      resourceType: entity.resourceType,
      resourceId: entity.id,
      resourceName: entity.title,
      isOwner: entity.isOwner ?? false,
    });
  };

  // Inspect the live surface value contract (admin) — the surface's declared
  // SurfaceValues laid against the resolved scope, with Always/Sometimes flags
  // and loud contract-violation highlighting. This is the surface-debugging
  // tool; the raw Redux state analyzer below is a separate thing.
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

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderExtraItem = (item: ContextMenuExtraItem): React.ReactElement => {
    if (item.kind === "separator") return <Separator key={item.id} />;
    if (item.kind === "submenu") {
      return (
        <Sub key={item.id}>
          <SubTrigger
            disabled={item.disabled}
            className={item.disabled ? "opacity-50 cursor-not-allowed" : ""}
          >
            {item.icon && <item.icon className="h-4 w-4 mr-2" />}
            {item.label}
          </SubTrigger>
          <SubContent className="w-60">
            {item.children.map(renderExtraItem)}
          </SubContent>
        </Sub>
      );
    }
    return (
      <Item
        key={item.id}
        onSelect={item.onSelect}
        disabled={item.disabled}
        className={
          item.destructive
            ? "text-destructive focus:text-destructive"
            : undefined
        }
      >
        {item.icon && <item.icon className="h-4 w-4 mr-2" />}
        {item.description ? (
          <div className="flex flex-col">
            <span>{item.label}</span>
            <span className="text-xs text-muted-foreground">
              {item.description}
            </span>
          </div>
        ) : (
          item.label
        )}
        {item.hint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {item.hint}
          </span>
        )}
      </Item>
    );
  };

  const renderExtraSections = (anchor: ExtraSectionAnchor) => {
    const sections = (extraSections ?? []).filter(
      (s) => (s.anchor ?? "after-compare") === anchor,
    );
    if (sections.length === 0) return null;
    return (
      <>
        {sections.map((section) => (
          <React.Fragment key={section.id}>
            {section.label && (
              <Label className="text-xs text-muted-foreground">
                {section.label}
              </Label>
            )}
            {section.items.map(renderExtraItem)}
          </React.Fragment>
        ))}
        <Separator />
      </>
    );
  };

  const renderCategoryGroup = (
    group: AgentMenuCategoryGroup,
    placementType: string,
  ): React.ReactElement => {
    const { category, items, children } = group;
    const CategoryIcon = resolveIcon(category.iconName);
    const hasContent = items.length > 0 || children.length > 0;
    return (
      <Sub key={category.id}>
        <SubTrigger className={!hasContent ? "opacity-50 cursor-not-allowed" : ""}>
          <CategoryIcon
            className="h-4 w-4 mr-2"
            style={{ color: category.color || "currentColor" }}
          />
          {category.label}
        </SubTrigger>
        <SubContent className="w-64">
          {!hasContent && (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No items in {category.label}
              </p>
            </div>
          )}
          {items.map((entry) => {
            const ItemIcon = resolveIcon(entry.iconName);
            const isDisabled =
              entry.entryType === "agent_shortcut" && !entry.agentId;
            const isLegacy = entry.legacyMatch === true;
            return (
              <Item
                key={entry.id}
                onSelect={() => handleEntrySelect(entry)}
                disabled={isDisabled}
                title={
                  isLegacy
                    ? "Legacy match: shown via enabledFeatures/untagged, not surfaceName. Needs backfill."
                    : undefined
                }
              >
                <ItemIcon
                  className={`h-4 w-4 mr-2 ${
                    isLegacy ? "text-red-600 dark:text-red-400" : ""
                  }`}
                />
                {entry.label}
                {entry.entryType === "agent_shortcut" &&
                  entry.keyboardShortcut && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {entry.keyboardShortcut}
                    </span>
                  )}
                {isDisabled && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Not configured
                  </span>
                )}
              </Item>
            );
          })}
          {children.length > 0 && (
            <>
              {items.length > 0 && <Separator />}
              {children.map((child) => renderCategoryGroup(child, placementType))}
            </>
          )}
        </SubContent>
      </Sub>
    );
  };

  const renderRichAction = (action: RichDocumentAction): React.ReactElement => {
    const label =
      typeof action.label === "function"
        ? action.label(richDocCtx)
        : action.label;
    const ActionIcon = action.icon;
    const disabledResult = action.disabled?.(richDocCtx);
    const isDisabled =
      typeof disabledResult === "object" ? true : Boolean(disabledResult);
    return (
      <Item
        key={action.id}
        onSelect={() => void action.run(richDocCtx)}
        disabled={isDisabled}
      >
        <ActionIcon className={`h-4 w-4 mr-2 ${action.iconColor ?? ""}`} />
        {label}
      </Item>
    );
  };

  const grouped = groupsByPlacement(categoryGroups);

  const renderPlacementSubmenu = (placementType: string) => {
    const mode = resolvedPlacementMode[placementType as PlacementKey];
    if (mode === "hide") return null;
    const groups = grouped[placementType] || [];
    const hasItems = groups.length > 0 && groups.some(hasItemsRecursive);
    const isDisabled = mode === "disable" || !hasItems || loading;
    const PlacementIcon = getPlacementIcon(placementType);
    const color = PLACEMENT_COLOR[placementType];
    const label =
      PLACEMENT_LABEL_OVERRIDE[placementType] ??
      PLACEMENT_TYPE_META[placementType as keyof typeof PLACEMENT_TYPE_META]
        ?.label ??
      placementType;
    return (
      <Sub key={placementType}>
        <SubTrigger
          disabled={isDisabled}
          className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
        >
          <PlacementIcon
            className="h-4 w-4 mr-2"
            style={color ? { color } : undefined}
          />
          {label}
        </SubTrigger>
        <SubContent className="w-64">
          {groups.length === 0 || !hasItems ? (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">No {label}</p>
            </div>
          ) : (
            groups.map((g) => renderCategoryGroup(g, placementType))
          )}
        </SubContent>
      </Sub>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const headerLabel =
    actionText.source === "selection"
      ? "Selected"
      : actionText.source === "content"
        ? "Content"
        : null;

  return (
    <>
      {headerLabel && (
        <div className="px-2 py-2 border-b border-border bg-primary/5">
          <div className="flex items-start gap-2">
            <Type className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-primary mb-0.5">
                {headerLabel} ({actionText.text.length} char
                {actionText.text.length !== 1 ? "s" : ""})
              </div>
              <div className="text-xs text-muted-foreground font-mono break-all leading-tight">
                {truncatePreview(actionText.text)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clipboard */}
      <Item onSelect={handleCopy} disabled={actionText.source === "none"}>
        <Copy className="h-4 w-4 mr-2 text-emerald-500" />
        Copy
      </Item>
      {copyVariantActions.length > 0 && (
        <Sub>
          <SubTrigger>
            <Copy className="h-4 w-4 mr-2 text-emerald-500" />
            Copy as
          </SubTrigger>
          <SubContent className="w-60">
            {copyVariantActions.map(renderRichAction)}
          </SubContent>
        </Sub>
      )}
      <Item onSelect={handleCut} disabled={!isEditable || !selectedText}>
        <Scissors className="h-4 w-4 mr-2 text-emerald-500" />
        Cut
      </Item>
      <Item onSelect={handlePaste} disabled={!isEditable}>
        <Clipboard className="h-4 w-4 mr-2 text-emerald-500" />
        Paste
      </Item>
      <Item onSelect={handleSelectAll}>
        <Type className="h-4 w-4 mr-2 text-muted-foreground" />
        Select All
      </Item>

      <Item onSelect={handleFind}>
        <Search className="h-4 w-4 mr-2 text-muted-foreground" />
        Find &amp; Replace
      </Item>

      {renderExtraSections("after-clipboard")}

      <Separator />

      {/* History (Undo / Redo / View History / Compare) */}
      <Item onSelect={handleUndo} disabled={onUndo ? !canUndo : !canNativeUndo}>
        <Undo2 className="h-4 w-4 mr-2 text-sky-500" />
        Undo
        {undoHint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {undoHint}
          </span>
        )}
      </Item>
      <Item onSelect={handleRedo} disabled={onRedo ? !canRedo : !canNativeUndo}>
        <Redo2 className="h-4 w-4 mr-2 text-sky-500" />
        Redo
        {redoHint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {redoHint}
          </span>
        )}
      </Item>
      <Item
        onSelect={() => onViewHistory?.()}
        disabled={!onViewHistory || !hasHistory}
      >
        <History className="h-4 w-4 mr-2 text-violet-500" />
        View History
      </Item>
      <Sub>
        <SubTrigger>
          <GitCompareArrows className="h-4 w-4 mr-2 text-amber-500" />
          Compare
        </SubTrigger>
        <SubContent className="w-60">
          <Item onSelect={handleCompareClipboard}>
            <ClipboardIcon className="h-4 w-4 mr-2" />
            Compare with clipboard
          </Item>
          <Item onSelect={handleSetCompareBase}>
            <Pin className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Set as compare base</span>
              <span className="text-xs text-muted-foreground">
                {actionText.source === "selection"
                  ? "Use selection"
                  : "Use content"}
              </span>
            </div>
          </Item>
          <Item onSelect={handleCompareWithBase} disabled={!hasCompareBase}>
            <GitCompareArrows className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Compare with base</span>
              {!hasCompareBase && (
                <span className="text-xs text-muted-foreground">
                  No base set yet
                </span>
              )}
            </div>
          </Item>
        </SubContent>
      </Sub>

      {exportActions.length > 0 && (
        <Sub>
          <SubTrigger>
            <Download className="h-4 w-4 mr-2 text-amber-500" />
            Export
          </SubTrigger>
          <SubContent className="w-60">
            {exportActions.map(renderRichAction)}
          </SubContent>
        </Sub>
      )}
      {convertActions.length > 0 && (
        <Sub>
          <SubTrigger>
            <Replace className="h-4 w-4 mr-2 text-violet-500" />
            Convert
          </SubTrigger>
          <SubContent className="w-60">
            {convertActions.map(renderRichAction)}
          </SubContent>
        </Sub>
      )}

      {entity && (
        <Item onSelect={handleAttach}>
          <Link2 className="h-4 w-4 mr-2 text-sky-500" />
          Attach To
        </Item>
      )}
      {entity?.resourceType && (
        <Item onSelect={handleShare}>
          <Share2 className="h-4 w-4 mr-2 text-emerald-500" />
          Share
        </Item>
      )}

      <Separator />

      {renderExtraSections("after-compare")}

      {/* Dynamic, data-driven placements (from the single fetch). */}
      {renderPlacementSubmenu(PLACEMENT_TYPES.AI_ACTION)}
      {resolvedPlacementMode["bound-agent"] !== "hide" && (
        <BoundAgentsMenuSection
          variant={variant}
          loading={boundAgentsLoading}
          sections={boundAgentSections}
          onSelect={(entry) => void handleBoundAgentExecute(entry)}
          disabled={resolvedPlacementMode["bound-agent"] === "disable"}
        />
      )}
      {renderPlacementSubmenu(PLACEMENT_TYPES.CONTENT_BLOCK)}
      {renderPlacementSubmenu(PLACEMENT_TYPES.USER_TOOL)}
      {renderPlacementSubmenu(PLACEMENT_TYPES.ORGANIZATION_TOOL)}

      {renderExtraSections("after-placements")}

      {/* Quick Actions */}
      {resolvedPlacementMode["quick-action"] !== "hide" && (
        <Sub>
          <SubTrigger
            disabled={resolvedPlacementMode["quick-action"] === "disable"}
            className={
              resolvedPlacementMode["quick-action"] === "disable"
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          >
            <Zap className="h-4 w-4 mr-2 text-pink-500" />
            Quick Actions
          </SubTrigger>
          <SubContent className="w-56">
            <Item onSelect={() => openQuickNotes()}>
              <StickyNote className="h-4 w-4 mr-2" />
              Notes
            </Item>
            <Item onSelect={() => openQuickTasks()}>
              <CheckSquare className="h-4 w-4 mr-2" />
              Tasks
            </Item>
            <Item onSelect={() => openQuickChat()}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Item>
            <Item onSelect={() => openQuickData()}>
              <Database className="h-4 w-4 mr-2" />
              Data
            </Item>
            <Item onSelect={() => openQuickFiles()}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Files
            </Item>
            <Item onSelect={() => openVoicePad()}>
              <Mic className="h-4 w-4 mr-2" />
              Voice Input
            </Item>
          </SubContent>
        </Sub>
      )}

      {/* Editable-only: Save / Delete */}
      {isEditable && (onSave || onDelete) && (
        <>
          <Separator />
          {onSave && (
            <Item onSelect={() => onSave()}>
              <Save className="h-4 w-4 mr-2 text-emerald-500" />
              Save
            </Item>
          )}
          {onDelete && (
            <Item
              onSelect={() => void handleDelete()}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Item>
          )}
        </>
      )}

      {/* Admin Tools */}
      {isAdmin && (
        <>
          <Separator />
          <Sub>
            <SubTrigger>
              <Shield className="h-4 w-4 mr-2 text-rose-500" />
              Admin Tools
            </SubTrigger>
            <SubContent className="w-56">
              <Item onSelect={() => dispatch(toggleDebugMode())}>
                {isDebugMode ? (
                  <EyeOff className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                {isDebugMode ? "Disable" : "Enable"} Debug Mode
              </Item>
              <Item
                onSelect={handleInspectValues}
                className="text-amber-600 dark:text-amber-400"
              >
                <Bug className="h-4 w-4 mr-2" />
                Context Values
              </Item>
              {isDebugMode && (
                <Item
                  onSelect={handleInspectState}
                  className="text-amber-600 dark:text-amber-400"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Redux State
                </Item>
              )}
              <Separator />
              <Item
                onSelect={() =>
                  dispatch(toggleOverlay({ overlayId: "adminIndicator" }))
                }
              >
                {isAdminIndicatorOpen ? (
                  <Eye className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
                ) : (
                  <EyeOff className="h-4 w-4 mr-2" />
                )}
                {isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator
              </Item>
            </SubContent>
          </Sub>
        </>
      )}
    </>
  );
}
