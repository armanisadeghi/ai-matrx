"use client";

// features/context-menu-v3/components/MobileMenuContent.tsx
//
// The MOBILE renderer (T1m) — loaded by the shell via next/dynamic on first
// open, inside a 70dvh bottom-sheet Drawer. Same engagement-gated cost model as
// the desktop MenuContent.
//
// Pure PRESENTATION: every piece of behavior lives in `useContextMenuActions`
// (shared 1:1 with desktop), so the agent menus (My / Org / System / Default)
// and the values that flow to a launched agent are identical to desktop by
// construction — the old "handlers ported 1:1, keep in lockstep" debt is paid.
// This file only builds and renders the iPhone-style multi-tier DRILL-DOWN
// (tap a category → slide to its list with a back button) at a constant 70%
// height with one internal scroll area.

import React, { useState } from "react";
import {
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Rocket,
  FileText,
  Zap,
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
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type { RichDocumentAction } from "@/features/rich-document/types";
import type { AgentMenuCategoryGroup } from "../hooks/useUnifiedAgentContextMenu";
import {
  useContextMenuActions,
  getPlacementIcon,
  getPlacementLabel,
  resolveIcon,
  hasItemsRecursive,
  resolveRichActionView,
} from "../hooks/useContextMenuActions";
import type {
  MenuContentProps,
  PlacementKey,
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

function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 60) return t;
  return `${t.substring(0, 30)}…${t.substring(t.length - 20)}`;
}

export default function MobileMenuContent(props: MobileMenuContentProps) {
  const {
    onClose,
    surfaceName,
    extraSections,
    isEditable,
    onSave,
    onDelete,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onViewHistory,
    hasHistory,
  } = props;

  const m = useContextMenuActions(props);
  const {
    actionText,
    resolvedPlacementMode,
    grouped,
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
    quickActions,
  } = m;
  const entity = props.entity;

  // Wrap a terminal action so it closes the sheet after firing.
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // ── Build the drill-down model ──────────────────────────────────────────────
  const richActionNode = (a: RichDocumentAction): MobileNode => {
    const { label, disabled } = resolveRichActionView(a, richDocCtx);
    return {
      kind: "action",
      id: a.id,
      label,
      icon: a.icon as Icon,
      iconClass: a.iconColor ?? "",
      disabled,
      onSelect: close(() => void a.run(richDocCtx)),
    };
  };

  const categoryGroupToNodes = (
    group: AgentMenuCategoryGroup,
  ): MobileNode[] => {
    const nodes: MobileNode[] = [];
    for (const entry of group.items) {
      const ItemIcon = resolveIcon(entry.iconName) as Icon;
      const isDisabled = entry.entryType === "agent_shortcut" && !entry.agentId;
      nodes.push({
        kind: "action",
        id: entry.id,
        label: entry.label,
        icon: ItemIcon,
        disabled: isDisabled,
        sublabel: isDisabled ? "Not configured" : undefined,
        onSelect: close(() => m.handleEntrySelect(entry)),
      });
    }
    for (const child of group.children) {
      const ChildIcon = resolveIcon(child.category.iconName) as Icon;
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

  const placementSubmenu = (placementType: string): MobileNode | null => {
    if (resolvedPlacementMode[placementType as PlacementKey] === "hide")
      return null;
    const groups = grouped[placementType] || [];
    const hasItems = groups.length > 0 && groups.some(hasItemsRecursive);
    const label = getPlacementLabel(placementType);
    const children: MobileNode[] = [];
    for (const g of groups) {
      const CatIcon = resolveIcon(g.category.iconName) as Icon;
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
      icon: getPlacementIcon(placementType) as Icon,
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
      children.push({
        kind: "section",
        id: `sec-${section.label}`,
        label: section.label,
      });
      for (const agent of section.agents) {
        children.push({
          kind: "action",
          id: `${section.label}:${agent.agentId}`,
          label: agent.name,
          icon: Rocket,
          iconClass: "text-indigo-500",
          onSelect: close(() => void m.handleBoundAgentExecute(agent)),
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
        out.push({
          kind: "section",
          id: `xl-${section.id}`,
          label: section.label,
        });
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
    onSelect: close(() => void m.handleCopy()),
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
      disabled: !props.selectedText,
      onSelect: close(() => void m.handleCut()),
    });
    push({
      kind: "action",
      id: "paste",
      label: "Paste",
      icon: Clipboard,
      iconClass: "text-emerald-500",
      onSelect: close(() => void m.handlePaste()),
    });
  }
  push({
    kind: "action",
    id: "select-all",
    label: "Select All",
    icon: Type,
    iconClass: "text-muted-foreground",
    onSelect: close(m.handleSelectAll),
  });
  push({
    kind: "action",
    id: "find",
    label: "Find & Replace",
    icon: Search,
    iconClass: "text-muted-foreground",
    onSelect: close(m.handleFind),
  });
  for (const n of extraNodes("after-clipboard")) push(n);
  push({ kind: "separator", id: "sep-1" });

  // Core platform panels
  push({
    kind: "action",
    id: "chat-window",
    label: "Chat",
    icon: MessageSquare,
    iconClass: "text-primary",
    onSelect: close(() => quickActions.openChatWindow()),
  });
  push({ kind: "separator", id: "sep-1b" });

  // History
  push({
    kind: "action",
    id: "undo",
    label: "Undo",
    icon: Undo2,
    iconClass: "text-sky-500",
    disabled: onUndo ? !canUndo : !canNativeUndo,
    onSelect: close(m.handleUndo),
  });
  push({
    kind: "action",
    id: "redo",
    label: "Redo",
    icon: Redo2,
    iconClass: "text-sky-500",
    disabled: onRedo ? !canRedo : !canNativeUndo,
    onSelect: close(m.handleRedo),
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
        onSelect: close(() => void m.handleCompareClipboard()),
      },
      {
        kind: "action",
        id: "cmp-set",
        label: "Set as compare base",
        icon: Pin,
        sublabel:
          actionText.source === "selection" ? "Use selection" : "Use content",
        onSelect: close(m.handleSetCompareBase),
      },
      {
        kind: "action",
        id: "cmp-with",
        label: "Compare with base",
        icon: GitCompareArrows,
        disabled: !hasCompareBase,
        sublabel: !hasCompareBase ? "No base set yet" : undefined,
        onSelect: close(() => void m.handleCompareWithBase()),
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
      onSelect: close(m.handleAttach),
    });
  if (entity?.resourceType)
    push({
      kind: "action",
      id: "share",
      label: "Share",
      icon: Share2,
      iconClass: "text-emerald-500",
      onSelect: close(m.handleShare),
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
        {
          kind: "action",
          id: "q-notes",
          label: "Notes",
          icon: StickyNote,
          onSelect: close(() => quickActions.openQuickNotes()),
        },
        {
          kind: "action",
          id: "q-tasks",
          label: "Tasks",
          icon: CheckSquare,
          onSelect: close(() => quickActions.openQuickTasks()),
        },
        {
          kind: "action",
          id: "q-chat",
          label: "Chat",
          icon: MessageSquare,
          onSelect: close(() => quickActions.openQuickChat()),
        },
        {
          kind: "action",
          id: "q-data",
          label: "Data",
          icon: Database,
          onSelect: close(() => quickActions.openQuickData()),
        },
        {
          kind: "action",
          id: "q-files",
          label: "Files",
          icon: FolderOpen,
          onSelect: close(() => quickActions.openQuickFiles()),
        },
        {
          kind: "action",
          id: "q-voice",
          label: "Voice Input",
          icon: Mic,
          onSelect: close(() => quickActions.openVoicePad()),
        },
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
        onSelect: close(() => void m.handleDelete()),
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
        onSelect: close(m.handleInspectValues),
      },
      {
        kind: "action",
        id: "debug-toggle",
        label: `${isDebugMode ? "Disable" : "Enable"} Debug Mode`,
        icon: isDebugMode ? EyeOff : Eye,
        onSelect: m.handleToggleDebugMode,
      },
    ];
    if (isDebugMode)
      adminChildren.push({
        kind: "action",
        id: "redux-state",
        label: "Redux State",
        icon: Database,
        iconClass: "text-amber-600 dark:text-amber-400",
        onSelect: close(m.handleInspectState),
      });
    adminChildren.push({
      kind: "action",
      id: "admin-indicator",
      label: `${isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator`,
      icon: isAdminIndicatorOpen ? Eye : EyeOff,
      onSelect: m.handleToggleAdminIndicator,
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
