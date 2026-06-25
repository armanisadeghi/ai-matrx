"use client";

// features/context-menu-v3/components/MobileMenuContent.tsx
//
// The MOBILE renderer (T1m) — loaded by the shell via next/dynamic on first
// open, inside a 70dvh bottom-sheet Drawer. Same engagement-gated cost model as
// the desktop MenuContent.
//
// Presentation differs from desktop, the DATA + LAUNCH path does NOT: this
// reuses the exact same hooks (useUnifiedAgentContextMenu, useSurfaceBoundAgents,
// useAgentLauncher, useQuickActions, the rich-document action registry, the
// overlay openers) and resolves the SAME ApplicationScope, so the agent menus
// (My / Org / System / Default) and the values that flow to a launched agent are
// identical to desktop. It renders an iPhone-style multi-tier DRILL-DOWN (tap a
// category → slide to its list with a back button) at a constant 70% height with
// one internal scroll area.
//
// KNOWN DEBT (tracked): the handlers below are ported 1:1 from `MenuContent.tsx`.
// The desktop + mobile renderers should both consume ONE `useContextMenuActions`
// hook; until that extraction lands, keep the two handler sets in lockstep.

import React, { useEffect, useState } from "react";
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
  Search,
  Share2,
  Link2,
  Bug,
  ChevronRight,
  ChevronLeft,
  X,
  Replace,
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
import {
  useUnifiedAgentContextMenu,
  type AgentMenuEntry,
  type AgentMenuCategoryGroup,
} from "@/features/context-menu-v2/hooks/useUnifiedAgentContextMenu";
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

export interface MobileMenuContentProps
  extends Omit<MenuContentProps, "variant"> {
  /** Close the bottom sheet (run after any terminal action). */
  onClose: () => void;
}

// ── Drill-down node model ────────────────────────────────────────────────────
type Icon = React.ComponentType<{ className?: string }>;

type MobileNode =
  | {
      kind: "action";
      id: string;
      label: string;
      icon: Icon;
      iconClass?: string;
      onSelect: () => void;
      disabled?: boolean;
      destructive?: boolean;
      hint?: string;
      sublabel?: string;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      icon: Icon;
      iconClass?: string;
      disabled?: boolean;
      loading?: boolean;
      children: MobileNode[];
      emptyLabel?: string;
    }
  | { kind: "section"; id: string; label: string }
  | { kind: "separator"; id: string };

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
const PLACEMENT_LABEL_OVERRIDE: Partial<Record<string, string>> = {
  [PLACEMENT_TYPES.USER_TOOL]: "My Items",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "Org Items",
};
function getPlacementIcon(placementType: string): Icon {
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
  return getIconComponent(iconName ?? fallback, fallback) as Icon;
}
function groupsByPlacement(
  groups: AgentMenuCategoryGroup[],
): Record<string, AgentMenuCategoryGroup[]> {
  const map: Record<string, AgentMenuCategoryGroup[]> = {};
  for (const g of groups) {
    (map[g.category.placementType] ??= []).push(g);
  }
  return map;
}
function hasItemsRecursive(group: AgentMenuCategoryGroup): boolean {
  if (group.items.length > 0) return true;
  return group.children.some(hasItemsRecursive);
}
function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 60) return t;
  return `${t.substring(0, 30)}…${t.substring(t.length - 20)}`;
}

export default function MobileMenuContent(props: MobileMenuContentProps) {
  const {
    onClose,
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
    onSave,
    onDelete,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onViewHistory,
    hasHistory,
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

  const hasCompareBase = useAppSelector(selectHasCompareBase);
  const currentUserId = useAppSelector(selectUserId);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // The single, deduped fetch — fires on mount (= on open). Same guards as desktop.
  useEffect(() => {
    void refresh();
    void refreshBoundAgents();
  }, []);

  const scope = resolveApplicationScope({
    getApplicationScope,
    contextData,
    selectedText,
    selectionRange,
    fallbackContent,
  });
  const actionText = resolveActionText(scope);

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

  useEffect(() => {
    reportMenuDiagnostics({
      surfaceName,
      scope,
      isEditable,
      hasExtraSections: Boolean(extraSections && extraSections.length > 0),
    });
  }, []);

  // ── Handlers (ported 1:1 from MenuContent — keep in lockstep) ───────────────
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
          element.value.substring(0, start) + text + element.value.substring(end),
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
    openDiffWindow({
      original: clip,
      modified: content,
      originalLabel: "Clipboard",
      modifiedLabel: label,
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
      toast({
        title: "Execution Failed",
        description: `${entry.label}: ${
          error instanceof Error ? error.message : "An unknown error occurred"
        }`,
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
        runtime: { applicationScope: scope, originalText: actionText.text, surfaceName },
      });
    } catch (error) {
      toast({
        title: "Execution Failed",
        description: `${entry.name}: ${
          error instanceof Error ? error.message : "An unknown error occurred"
        }`,
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
  const handleFind = () => {
    openFindReplace({
      getTargetElement: () =>
        selectionRange?.type === "editable" ? selectionRange.element : null,
      onReplace: onTextReplace,
    });
  };
  const handleAttach = () => {
    if (!entity) return;
    openContextAssignment({
      subject: { entityType: entity.type, entityId: entity.id, title: entity.title },
    });
  };
  const handleShare = () => {
    if (!entity?.resourceType) return;
    openShareModalWindow({
      resourceType: entity.resourceType,
      resourceId: entity.id,
      resourceName: entity.title,
      isOwner: entity.isOwner ?? false,
    });
  };
  const handleInspectValues = () => {
    openSurfaceInspector({
      surfaceName: surfaceName ?? null,
      scope,
      isEditable: Boolean(isEditable),
    });
  };

  // Wrap a terminal action so it closes the sheet after firing.
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // ── Build the drill-down model ──────────────────────────────────────────────
  const richActionNode = (a: RichDocumentAction): MobileNode => {
    const label = typeof a.label === "function" ? a.label(richDocCtx) : a.label;
    const disabledResult = a.disabled?.(richDocCtx);
    const isDisabled =
      typeof disabledResult === "object" ? true : Boolean(disabledResult);
    return {
      kind: "action",
      id: a.id,
      label,
      icon: a.icon as Icon,
      iconClass: a.iconColor ?? "",
      disabled: isDisabled,
      onSelect: close(() => void a.run(richDocCtx)),
    };
  };

  const categoryGroupToNodes = (group: AgentMenuCategoryGroup): MobileNode[] => {
    const nodes: MobileNode[] = [];
    for (const entry of group.items) {
      const ItemIcon = resolveIcon(entry.iconName);
      const isDisabled =
        entry.entryType === "agent_shortcut" && !entry.agentId;
      nodes.push({
        kind: "action",
        id: entry.id,
        label: entry.label,
        icon: ItemIcon,
        disabled: isDisabled,
        sublabel: isDisabled ? "Not configured" : undefined,
        onSelect: close(() => handleEntrySelect(entry)),
      });
    }
    for (const child of group.children) {
      const ChildIcon = resolveIcon(child.category.iconName);
      nodes.push({
        kind: "submenu",
        id: child.category.id,
        label: child.category.label,
        icon: ChildIcon,
        iconClass: "",
        children: categoryGroupToNodes(child),
        emptyLabel: `No items in ${child.category.label}`,
      });
    }
    return nodes;
  };

  const grouped = groupsByPlacement(categoryGroups);
  const placementSubmenu = (placementType: string): MobileNode | null => {
    if (resolvedPlacementMode[placementType as PlacementKey] === "hide")
      return null;
    const groups = grouped[placementType] || [];
    const hasItems = groups.length > 0 && groups.some(hasItemsRecursive);
    const label =
      PLACEMENT_LABEL_OVERRIDE[placementType] ??
      PLACEMENT_TYPE_META[placementType as keyof typeof PLACEMENT_TYPE_META]
        ?.label ??
      placementType;
    const children: MobileNode[] = [];
    for (const g of groups) {
      const CatIcon = resolveIcon(g.category.iconName);
      children.push({
        kind: "submenu",
        id: g.category.id,
        label: g.category.label,
        icon: CatIcon,
        children: categoryGroupToNodes(g),
        emptyLabel: `No items in ${g.category.label}`,
      });
    }
    return {
      kind: "submenu",
      id: placementType,
      label,
      icon: getPlacementIcon(placementType),
      disabled:
        resolvedPlacementMode[placementType as PlacementKey] === "disable" ||
        !hasItems ||
        loading,
      loading,
      children,
      emptyLabel: `No ${label}`,
    };
  };

  const agentsSubmenu = (): MobileNode | null => {
    if (resolvedPlacementMode["bound-agent"] === "hide") return null;
    const children: MobileNode[] = [];
    for (const section of boundAgentSections) {
      if (section.agents.length === 0) continue;
      children.push({ kind: "section", id: `sec-${section.label}`, label: section.label });
      for (const agent of section.agents) {
        children.push({
          kind: "action",
          id: `${section.label}:${agent.agentId}`,
          label: agent.name,
          icon: Rocket,
          iconClass: "text-indigo-500",
          onSelect: close(() => void handleBoundAgentExecute(agent)),
        });
      }
    }
    return {
      kind: "submenu",
      id: "agents",
      label: "Agents",
      icon: Rocket,
      iconClass: "text-indigo-500",
      disabled:
        resolvedPlacementMode["bound-agent"] === "disable" ||
        (children.length === 0 && !boundAgentsLoading),
      loading: boundAgentsLoading,
      children,
      emptyLabel: "No agents available",
    };
  };

  const extraNodes = (anchor: ExtraSectionAnchor): MobileNode[] => {
    const sections = (extraSections ?? []).filter(
      (s) => (s.anchor ?? "after-compare") === anchor,
    );
    const out: MobileNode[] = [];
    for (const section of sections) {
      if (section.label)
        out.push({ kind: "section", id: `xl-${section.id}`, label: section.label });
      for (const item of section.items) out.push(...extraItemToNodes(item));
    }
    return out;
  };
  const extraItemToNodes = (item: ContextMenuExtraItem): MobileNode[] => {
    if (item.kind === "separator") return [{ kind: "separator", id: item.id }];
    if (item.kind === "submenu") {
      return [
        {
          kind: "submenu",
          id: item.id,
          label: item.label,
          icon: (item.icon as Icon) ?? FileText,
          disabled: item.disabled,
          children: item.children.flatMap(extraItemToNodes),
        },
      ];
    }
    return [
      {
        kind: "action",
        id: item.id,
        label: item.label,
        icon: (item.icon as Icon) ?? FileText,
        disabled: item.disabled,
        destructive: item.destructive,
        hint: item.hint,
        sublabel: item.description,
        onSelect: close(() => item.onSelect?.()),
      },
    ];
  };

  const rootNodes: MobileNode[] = [];
  const push = (n: MobileNode | null) => {
    if (n) rootNodes.push(n);
  };

  // Clipboard
  push({
    kind: "action",
    id: "copy",
    label: "Copy",
    icon: Copy,
    iconClass: "text-emerald-500",
    disabled: actionText.source === "none",
    onSelect: close(() => void handleCopy()),
  });
  if (copyVariantActions.length > 0)
    push({
      kind: "submenu",
      id: "copy-as",
      label: "Copy as",
      icon: Copy,
      iconClass: "text-emerald-500",
      children: copyVariantActions.map(richActionNode),
    });
  if (isEditable) {
    push({
      kind: "action",
      id: "cut",
      label: "Cut",
      icon: Scissors,
      iconClass: "text-emerald-500",
      disabled: !selectedText,
      onSelect: close(() => void handleCut()),
    });
    push({
      kind: "action",
      id: "paste",
      label: "Paste",
      icon: Clipboard,
      iconClass: "text-emerald-500",
      onSelect: close(() => void handlePaste()),
    });
  }
  push({
    kind: "action",
    id: "select-all",
    label: "Select All",
    icon: Type,
    iconClass: "text-muted-foreground",
    onSelect: close(handleSelectAll),
  });
  push({
    kind: "action",
    id: "find",
    label: "Find & Replace",
    icon: Search,
    iconClass: "text-muted-foreground",
    onSelect: close(handleFind),
  });
  for (const n of extraNodes("after-clipboard")) push(n);
  push({ kind: "separator", id: "sep-1" });

  // History
  push({
    kind: "action",
    id: "undo",
    label: "Undo",
    icon: Undo2,
    iconClass: "text-sky-500",
    disabled: onUndo ? !canUndo : !canNativeUndo,
    onSelect: close(handleUndo),
  });
  push({
    kind: "action",
    id: "redo",
    label: "Redo",
    icon: Redo2,
    iconClass: "text-sky-500",
    disabled: onRedo ? !canRedo : !canNativeUndo,
    onSelect: close(handleRedo),
  });
  push({
    kind: "action",
    id: "view-history",
    label: "View History",
    icon: History,
    iconClass: "text-violet-500",
    disabled: !onViewHistory || !hasHistory,
    onSelect: close(() => onViewHistory?.()),
  });
  push({
    kind: "submenu",
    id: "compare",
    label: "Compare",
    icon: GitCompareArrows,
    iconClass: "text-amber-500",
    children: [
      {
        kind: "action",
        id: "cmp-clip",
        label: "Compare with clipboard",
        icon: ClipboardIcon,
        onSelect: close(() => void handleCompareClipboard()),
      },
      {
        kind: "action",
        id: "cmp-set",
        label: "Set as compare base",
        icon: Pin,
        sublabel:
          actionText.source === "selection" ? "Use selection" : "Use content",
        onSelect: close(handleSetCompareBase),
      },
      {
        kind: "action",
        id: "cmp-with",
        label: "Compare with base",
        icon: GitCompareArrows,
        disabled: !hasCompareBase,
        sublabel: !hasCompareBase ? "No base set yet" : undefined,
        onSelect: close(() => void handleCompareWithBase()),
      },
    ],
  });
  if (exportActions.length > 0)
    push({
      kind: "submenu",
      id: "export",
      label: "Export",
      icon: Download,
      iconClass: "text-amber-500",
      children: exportActions.map(richActionNode),
    });
  if (convertActions.length > 0)
    push({
      kind: "submenu",
      id: "convert",
      label: "Convert",
      icon: Replace,
      iconClass: "text-violet-500",
      children: convertActions.map(richActionNode),
    });
  if (entity)
    push({
      kind: "action",
      id: "attach",
      label: "Attach To",
      icon: Link2,
      iconClass: "text-sky-500",
      onSelect: close(handleAttach),
    });
  if (entity?.resourceType)
    push({
      kind: "action",
      id: "share",
      label: "Share",
      icon: Share2,
      iconClass: "text-emerald-500",
      onSelect: close(handleShare),
    });
  push({ kind: "separator", id: "sep-2" });
  for (const n of extraNodes("after-compare")) push(n);

  // Agent placements
  push(placementSubmenu(PLACEMENT_TYPES.AI_ACTION));
  push(agentsSubmenu());
  push(placementSubmenu(PLACEMENT_TYPES.CONTENT_BLOCK));
  push(placementSubmenu(PLACEMENT_TYPES.USER_TOOL));
  push(placementSubmenu(PLACEMENT_TYPES.ORGANIZATION_TOOL));
  for (const n of extraNodes("after-placements")) push(n);

  // Quick Actions
  if (resolvedPlacementMode["quick-action"] !== "hide")
    push({
      kind: "submenu",
      id: "quick",
      label: "Quick Actions",
      icon: Zap,
      iconClass: "text-pink-500",
      disabled: resolvedPlacementMode["quick-action"] === "disable",
      children: [
        { kind: "action", id: "q-notes", label: "Notes", icon: StickyNote, onSelect: close(() => openQuickNotes()) },
        { kind: "action", id: "q-tasks", label: "Tasks", icon: CheckSquare, onSelect: close(() => openQuickTasks()) },
        { kind: "action", id: "q-chat", label: "Chat", icon: MessageSquare, onSelect: close(() => openQuickChat()) },
        { kind: "action", id: "q-data", label: "Data", icon: Database, onSelect: close(() => openQuickData()) },
        { kind: "action", id: "q-files", label: "Files", icon: FolderOpen, onSelect: close(() => openQuickFiles()) },
        { kind: "action", id: "q-voice", label: "Voice Input", icon: Mic, onSelect: close(() => openVoicePad()) },
      ],
    });

  // Editable Save / Delete
  if (isEditable && (onSave || onDelete)) {
    push({ kind: "separator", id: "sep-3" });
    if (onSave)
      push({
        kind: "action",
        id: "save",
        label: "Save",
        icon: Save,
        iconClass: "text-emerald-500",
        onSelect: close(() => onSave()),
      });
    if (onDelete)
      push({
        kind: "action",
        id: "delete",
        label: "Delete",
        icon: Trash2,
        destructive: true,
        onSelect: close(() => void handleDelete()),
      });
  }

  // Admin
  if (isAdmin) {
    push({ kind: "separator", id: "sep-4" });
    const adminChildren: MobileNode[] = [
      {
        kind: "action",
        id: "ctx-values",
        label: "Context Values",
        icon: Bug,
        iconClass: "text-amber-600 dark:text-amber-400",
        onSelect: close(handleInspectValues),
      },
      {
        kind: "action",
        id: "debug-toggle",
        label: `${isDebugMode ? "Disable" : "Enable"} Debug Mode`,
        icon: isDebugMode ? EyeOff : Eye,
        onSelect: () => dispatch(toggleDebugMode()),
      },
    ];
    if (isDebugMode)
      adminChildren.push({
        kind: "action",
        id: "redux-state",
        label: "Redux State",
        icon: Database,
        iconClass: "text-amber-600 dark:text-amber-400",
        onSelect: close(() => openStateViewer()),
      });
    adminChildren.push({
      kind: "action",
      id: "admin-indicator",
      label: `${isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator`,
      icon: isAdminIndicatorOpen ? Eye : EyeOff,
      onSelect: () => dispatch(toggleOverlay({ overlayId: "adminIndicator" })),
    });
    push({
      kind: "submenu",
      id: "admin",
      label: "Admin Tools",
      icon: Shield,
      iconClass: "text-rose-500",
      children: adminChildren,
    });
  }

  // ── Drill-down navigation ───────────────────────────────────────────────────
  // The path is a list of submenu ids. The current page is re-derived from the
  // freshly-built rootNodes every render, so a page reflects LIVE data (agents
  // finishing loading, debug toggling) instead of a stale snapshot.
  const [path, setPath] = useState<string[]>([]);
  let levelNodes: MobileNode[] = rootNodes;
  let currentTitle: string | null = null;
  let currentEmpty: string | undefined;
  const validPath: string[] = [];
  for (const id of path) {
    const found = levelNodes.find(
      (n): n is Extract<MobileNode, { kind: "submenu" }> =>
        n.kind === "submenu" && n.id === id,
    );
    if (!found) break;
    levelNodes = found.children;
    currentTitle = found.label;
    currentEmpty = found.emptyLabel;
    validPath.push(id);
  }
  const nodes = levelNodes;
  const atRoot = validPath.length === 0;

  const headerLabel =
    actionText.source === "selection"
      ? "Selected"
      : actionText.source === "content"
        ? "Content"
        : null;

  const renderRow = (node: MobileNode): React.ReactElement => {
    if (node.kind === "separator")
      return <div key={node.id} className="my-1 h-px bg-border" />;
    if (node.kind === "section")
      return (
        <div
          key={node.id}
          className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {node.label}
        </div>
      );
    const Icon = node.icon;
    if (node.kind === "submenu") {
      const disabled = node.disabled;
      return (
        <button
          key={node.id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setPath((p) => [...p, node.id])}
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px] transition-colors active:bg-accent disabled:opacity-40 min-h-[48px]"
        >
          <Icon className={`h-5 w-5 shrink-0 ${node.iconClass ?? ""}`} />
          <span className="flex-1 truncate">{node.label}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      );
    }
    return (
      <button
        key={node.id}
        type="button"
        disabled={node.disabled}
        onClick={node.onSelect}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px] transition-colors active:bg-accent disabled:opacity-40 min-h-[48px] ${
          node.destructive ? "text-destructive" : ""
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${node.iconClass ?? ""}`} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{node.label}</span>
          {node.sublabel && (
            <span className="truncate text-xs text-muted-foreground">
              {node.sublabel}
            </span>
          )}
        </span>
        {node.hint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {node.hint}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — back / title / close. Constant chrome; the list scrolls. */}
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        {!atRoot ? (
          <button
            type="button"
            onClick={() => setPath((p) => p.slice(0, -1))}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-primary active:bg-accent"
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </button>
        ) : (
          <span className="px-2 text-sm font-semibold text-foreground">
            {surfaceName ?? "Menu"}
          </span>
        )}
        <span className="flex-1 truncate text-center text-sm font-semibold">
          {currentTitle ?? ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-muted-foreground active:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Selection / content preview — root level only. */}
      {atRoot && headerLabel && (
        <div className="border-b border-border bg-primary/5 px-3 py-2">
          <div className="text-[11px] font-medium text-primary">
            {headerLabel} ({actionText.text.length} char
            {actionText.text.length !== 1 ? "s" : ""})
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {truncatePreview(actionText.text)}
          </div>
        </div>
      )}

      {/* The single internal scroll area. Height stays constant (70dvh shell). */}
      <div className="flex-1 overflow-y-auto px-1 py-1 pb-safe">
        {nodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {currentEmpty ?? "Nothing here"}
          </div>
        ) : (
          nodes.map(renderRow)
        )}
      </div>
    </div>
  );
}
