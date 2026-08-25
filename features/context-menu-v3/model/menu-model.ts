// features/context-menu-v3/model/menu-model.ts
//
// The MENU MODEL — a declarative tree of everything the desktop menu can show,
// built ONCE from the shared engine (`useContextMenuActions`) and the props.
// The renderer never decides what exists; it only decides how the model is
// ARRANGED (`layouts.ts`) and how dense it is drawn.
//
// Why a model: the menu had grown to ~30 top-level rows rendered by hand in
// JSX. Every "make it less overwhelming" idea (fold the tail into submenus,
// an icon strip for the universal verbs, a type-to-filter box) needs to walk
// the same set of nodes. A model makes each of those a pure function over
// one tree instead of a second renderer — and keeps the engine as the ONLY
// place behavior lives.
//
// Nodes are closures over the engine's handlers, so a node is directly
// actionable wherever a layout puts it (top level, inside a fold, in a
// filtered flat list).

import type React from "react";
import {
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Zap,
  Scissors,
  Copy,
  Clipboard,
  Type,
  Undo2,
  Redo2,
  History,
  GitCompareArrows,
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
  Braces,
  BrainCircuit,
  Volume2,
  Headphones,
  type LucideIcon,
} from "lucide-react";
import type { IconComponentType } from "@/components/official/icons/IconResolver";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type { RichDocumentAction } from "@/features/rich-document/types";
import type { AgentMenuCategoryGroup } from "../hooks/useUnifiedAgentContextMenu";
import { jsonSectionLabel } from "../utils/json-menu-actions";
import {
  type ContextMenuActions,
  getPlacementIcon,
  getPlacementLabel,
  resolveIcon,
  hasItemsRecursive,
  resolveRichActionView,
  PLACEMENT_COLOR,
} from "../hooks/useContextMenuActions";
import type {
  MenuContentProps,
  PlacementKey,
  ExtraSectionAnchor,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "../types";

// ---------------------------------------------------------------------------
// Node types (internal — the public surface contract stays `ContextMenuExtraItem`).
// ---------------------------------------------------------------------------

interface MenuNodeBase {
  id: string;
}

export interface MenuItemNode extends MenuNodeBase {
  kind: "item";
  label: string;
  icon?: IconComponentType;
  /** Tailwind classes for the icon (colour). */
  iconClassName?: string;
  /** Inline style for the icon (data-driven category colours). */
  iconStyle?: React.CSSProperties;
  /** Second muted line. */
  description?: string;
  /** Right-aligned muted hint (shortcut, count, …). */
  hint?: string;
  /** Native tooltip. */
  title?: string;
  disabled?: boolean;
  destructive?: boolean;
  /** Extra classes on the row (admin amber, …). */
  className?: string;
  onSelect: () => void;
}

export interface MenuSubmenuNode extends MenuNodeBase {
  kind: "submenu";
  label: string;
  icon?: IconComponentType;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  disabled?: boolean;
  /** Spinner in the trigger while the data loads. */
  loading?: boolean;
  /** Rendered centred when `children` has no actionable node. */
  emptyLabel?: string;
  /** Tailwind width class for the panel. Default `w-60`. */
  width?: string;
  /** Layout hint: which placement this submenu is (for re-grouping). */
  placement?: string;
  children: MenuNode[];
}

export interface MenuCheckboxNode extends MenuNodeBase {
  kind: "checkbox";
  label: string;
  icon?: IconComponentType;
  description?: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}

export interface MenuLinkNode extends MenuNodeBase {
  kind: "link";
  label: string;
  icon?: IconComponentType;
  description?: string;
  hint?: string;
  href: string;
  target?: string;
  disabled?: boolean;
}

export interface MenuLabelNode extends MenuNodeBase {
  kind: "label";
  label: string;
}

export interface MenuSeparatorNode extends MenuNodeBase {
  kind: "separator";
}

export type MenuNode =
  | MenuItemNode
  | MenuSubmenuNode
  | MenuCheckboxNode
  | MenuLinkNode
  | MenuLabelNode
  | MenuSeparatorNode;

/** Actionable leaf kinds (what a filter can match and run). */
export type MenuLeafNode = MenuItemNode | MenuCheckboxNode | MenuLinkNode;

/**
 * Coarse group a section belongs to. Layouts regroup by this, never by id
 * string-matching, so a surface's `extraSections` ("surface") and the
 * data-driven placements ("ai") stay distinguishable from the core verbs.
 */
export type MenuGroup =
  | "clipboard"
  | "tools"
  | "history"
  | "document"
  | "surface"
  | "ai"
  | "quick"
  | "editable"
  | "admin"
  | "surface-info";

export interface MenuSection {
  id: string;
  group: MenuGroup;
  /** Muted heading rendered above the section (surface sections). */
  label?: string;
  /** Icon for the fold a layout may collapse this section into. */
  icon?: LucideIcon;
  /** Classic rendering: no separator between this and the previous section. */
  joinPrevious?: boolean;
  nodes: MenuNode[];
}

export interface MenuHeader {
  label: "Selected" | "Content";
  text: string;
}

export interface MenuModel {
  header: MenuHeader | null;
  /** Classic order — exactly the historical top-to-bottom arrangement. */
  sections: MenuSection[];
  /** Well-known nodes layouts pull out by role (never by label). */
  roles: MenuRoles;
}

/** The nodes a layout needs to address individually. */
export interface MenuRoles {
  copy: MenuItemNode;
  speak: MenuItemNode;
  spokenSummary: MenuItemNode;
  copyAs: MenuSubmenuNode | null;
  json: MenuSubmenuNode | null;
  cut: MenuItemNode;
  paste: MenuItemNode;
  selectAll: MenuItemNode;
  find: MenuItemNode;
  chat: MenuItemNode;
  undo: MenuItemNode;
  redo: MenuItemNode;
  viewHistory: MenuItemNode;
  compare: MenuSubmenuNode;
  exportMenu: MenuSubmenuNode | null;
  convert: MenuSubmenuNode | null;
  attach: MenuItemNode | null;
  share: MenuItemNode | null;
  placements: MenuSubmenuNode[];
  quickActions: MenuSubmenuNode | null;
  save: MenuItemNode | null;
  del: MenuItemNode | null;
  admin: MenuSubmenuNode | null;
  /** The engine-built surface submenu section (location / context / agents / related). */
  surfaceInfo: MenuSection;
  /** Surface `extraSections`, by anchor, already converted to model nodes. */
  extras: Record<ExtraSectionAnchor, MenuSection[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Does the subtree contain anything the user can act on? */
export function hasActionable(nodes: MenuNode[]): boolean {
  return nodes.some((n) => {
    if (n.kind === "separator" || n.kind === "label") return false;
    if (n.kind === "submenu") return hasActionable(n.children);
    return true;
  });
}

function compactNodes(nodes: Array<MenuNode | null>): MenuNode[] {
  return nodes.filter((node) => node !== null);
}

// Surface ids are namespaced (`x:`) so they can never collide with a core
// node id — notes' "export" item vs the core "export" submenu was a duplicate
// React key the moment both rendered in one list.
function fromExtraItem(item: ContextMenuExtraItem): MenuNode {
  const id = `x:${item.id}`;
  switch (item.kind) {
    case "separator":
      return { kind: "separator", id };
    case "submenu":
      return {
        kind: "submenu",
        id,
        label: item.label,
        icon: item.icon,
        disabled: item.disabled,
        children: item.children.map(fromExtraItem),
      };
    case "checkbox":
      return {
        kind: "checkbox",
        id,
        label: item.label,
        icon: item.icon,
        description: item.description,
        hint: item.hint,
        checked: item.checked,
        disabled: item.disabled,
        onCheckedChange: item.onCheckedChange,
      };
    case "link":
      return {
        kind: "link",
        id,
        label: item.label,
        icon: item.icon,
        description: item.description,
        hint: item.hint,
        href: item.href,
        target: item.target,
        disabled: item.disabled,
      };
    case "item":
    default:
      return {
        kind: "item",
        id,
        label: item.label,
        icon: item.icon,
        description: item.description,
        hint: item.hint,
        disabled: item.disabled,
        destructive: item.destructive,
        onSelect: item.onSelect,
      };
  }
}

function extrasByAnchor(
  extraSections: ContextMenuExtraSection[] | undefined,
): Record<ExtraSectionAnchor, MenuSection[]> {
  const out: Record<ExtraSectionAnchor, MenuSection[]> = {
    "after-clipboard": [],
    "after-compare": [],
    "after-placements": [],
  };
  for (const s of extraSections ?? []) {
    const anchor = s.anchor ?? "after-compare";
    out[anchor].push({
      id: `extra:${s.id}`,
      group: "surface",
      label: s.label,
      icon: s.icon,
      nodes: s.items.map(fromExtraItem),
    });
  }
  return out;
}

function richActionNode(
  action: RichDocumentAction,
  ctx: ContextMenuActions["richDocCtx"],
): MenuItemNode {
  const { label, disabled } = resolveRichActionView(action, ctx);
  return {
    kind: "item",
    id: `rich:${action.id}`,
    label,
    icon: action.icon,
    iconClassName: action.iconColor ?? undefined,
    disabled,
    onSelect: () => void action.run(ctx),
  };
}

function categoryGroupNode(
  group: AgentMenuCategoryGroup,
  m: ContextMenuActions,
): MenuSubmenuNode {
  const { category, items, children } = group;
  const children_: MenuNode[] = items.map((entry) => {
    const isDisabled = entry.entryType === "agent_shortcut" && !entry.agentId;
    const isLegacy = entry.legacyMatch === true;
    const hint =
      entry.entryType === "agent_shortcut" && entry.keyboardShortcut
        ? entry.keyboardShortcut
        : isDisabled
          ? "Not configured"
          : undefined;
    return {
      kind: "item",
      id: `entry:${entry.id}`,
      label: entry.label,
      icon: resolveIcon(entry.iconName),
      iconClassName: isLegacy ? "text-red-600 dark:text-red-400" : undefined,
      title: isLegacy
        ? "Legacy match: shown via enabledFeatures/untagged, not surfaceName. Needs backfill."
        : undefined,
      hint,
      disabled: isDisabled,
      onSelect: () => m.handleEntrySelect(entry),
    } satisfies MenuItemNode;
  });
  if (children.length > 0) {
    if (items.length > 0) children_.push({ kind: "separator", id: `${category.id}:sep` });
    for (const child of children) children_.push(categoryGroupNode(child, m));
  }
  return {
    kind: "submenu",
    id: `cat:${category.id}`,
    label: category.label,
    icon: resolveIcon(category.iconName),
    iconStyle: { color: category.color || "currentColor" },
    disabled: items.length === 0 && children.length === 0,
    emptyLabel: `No items in ${category.label}`,
    width: "w-64",
    children: children_,
  };
}

function placementNode(
  placementType: string,
  m: ContextMenuActions,
): MenuSubmenuNode | null {
  const mode = m.resolvedPlacementMode[placementType as PlacementKey];
  if (mode === "hide") return null;
  const groups = m.grouped[placementType] || [];
  const hasItems = groups.length > 0 && groups.some(hasItemsRecursive);
  const label = getPlacementLabel(placementType);
  const color = PLACEMENT_COLOR[placementType];
  return {
    kind: "submenu",
    id: `placement:${placementType}`,
    label,
    icon: getPlacementIcon(placementType),
    iconStyle: color ? { color } : undefined,
    disabled: mode === "disable" || !hasItems || m.loading,
    loading: m.loading && !hasItems,
    emptyLabel: `No ${label}`,
    width: "w-64",
    placement: placementType,
    children: hasItems ? groups.map((g) => categoryGroupNode(g, m)) : [],
  };
}

function boundAgentsNode(m: ContextMenuActions): MenuSubmenuNode | null {
  const mode = m.resolvedPlacementMode["bound-agent"];
  if (mode === "hide") return null;
  const sections = m.boundAgentSections.filter((s) => s.agents.length > 0);
  const hasAgents = sections.length > 0;
  const children: MenuNode[] = [];
  sections.forEach((section, idx) => {
    if (idx > 0) children.push({ kind: "separator", id: `agents:${section.key}:sep` });
    children.push({
      kind: "label",
      id: `agents:${section.key}:label`,
      label: section.label.toUpperCase(),
    });
    for (const agent of section.agents) {
      children.push({
        kind: "item",
        id: `agent:${section.key}:${agent.agentId}`,
        label: agent.name,
        icon: BrainCircuit,
        iconClassName: "text-indigo-500/80",
        onSelect: () => void m.handleBoundAgentExecute(agent),
      });
    }
  });
  return {
    kind: "submenu",
    id: "placement:bound-agent",
    label: "Agents",
    icon: BrainCircuit,
    iconClassName: "text-indigo-500",
    disabled: mode === "disable" || (!hasAgents && !m.boundAgentsLoading),
    loading: m.boundAgentsLoading,
    emptyLabel: m.boundAgentsLoading && !hasAgents ? "Loading…" : "No agents available",
    width: "w-64",
    placement: "bound-agent",
    children,
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildMenuModel(
  m: ContextMenuActions,
  props: Pick<
    MenuContentProps,
    | "extraSections"
    | "isEditable"
    | "onSave"
    | "onDelete"
    | "onUndo"
    | "onRedo"
    | "canUndo"
    | "canRedo"
    | "undoHint"
    | "redoHint"
    | "onViewHistory"
    | "hasHistory"
    | "selectedText"
    | "entity"
  >,
): MenuModel {
  const {
    extraSections,
    isEditable,
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
    selectedText,
    entity,
  } = props;
  const { actionText, quickActions } = m;

  const header: MenuHeader | null =
    actionText.source === "selection"
      ? { label: "Selected", text: actionText.text }
      : actionText.source === "content"
        ? { label: "Content", text: actionText.text }
        : null;

  // ── Clipboard ───────────────────────────────────────────────────────────
  const copy: MenuItemNode = {
    kind: "item",
    id: "copy",
    label: "Copy",
    icon: Copy,
    iconClassName: "text-emerald-500",
    disabled: actionText.source === "none",
    onSelect: () => void m.handleCopy(),
  };
  const speak: MenuItemNode = {
    kind: "item",
    id: "speak",
    label: "Speak",
    icon: Volume2,
    iconClassName: "text-sky-500",
    disabled: actionText.source === "none",
    onSelect: m.handleSpeak,
  };
  const spokenSummary: MenuItemNode = {
    kind: "item",
    id: "spoken-summary",
    label: "Summarize for listening",
    icon: Headphones,
    iconClassName: "text-violet-500",
    disabled: actionText.source === "none" || !m.spokenSummaryAvailable,
    onSelect: m.handleSpokenSummary,
  };
  const copyAs: MenuSubmenuNode | null =
    m.copyVariantActions.length > 0
      ? {
          kind: "submenu",
          id: "copy-as",
          label: "Copy as",
          icon: Copy,
          iconClassName: "text-emerald-500",
          children: m.copyVariantActions.map((a) => richActionNode(a, m.richDocCtx)),
        }
      : null;
  const json: MenuSubmenuNode | null = m.jsonSection
    ? {
        kind: "submenu",
        id: "json",
        label: jsonSectionLabel(m.jsonSection),
        icon: Braces,
        iconClassName: "text-amber-500",
        width: "w-72",
        children: m.jsonSection.actions.map((action) => ({
          kind: "item",
          id: `json:${action.id}`,
          label: action.label,
          hint: action.hint,
          disabled: action.disabled,
          onSelect: () => void action.run(),
        })),
      }
    : null;
  const cut: MenuItemNode = {
    kind: "item",
    id: "cut",
    label: "Cut",
    icon: Scissors,
    iconClassName: "text-emerald-500",
    disabled: !isEditable || !selectedText,
    onSelect: () => void m.handleCut(),
  };
  const paste: MenuItemNode = {
    kind: "item",
    id: "paste",
    label: "Paste",
    icon: Clipboard,
    iconClassName: "text-emerald-500",
    disabled: !isEditable,
    onSelect: () => void m.handlePaste(),
  };
  const selectAll: MenuItemNode = {
    kind: "item",
    id: "select-all",
    label: "Select All",
    icon: Type,
    iconClassName: "text-muted-foreground",
    onSelect: m.handleSelectAll,
  };
  const find: MenuItemNode = {
    kind: "item",
    id: "find",
    label: "Find & Replace",
    icon: Search,
    iconClassName: "text-muted-foreground",
    onSelect: m.handleFind,
  };

  // ── Tools ───────────────────────────────────────────────────────────────
  const chat: MenuItemNode = {
    kind: "item",
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    iconClassName: "text-primary",
    onSelect: () => quickActions.openChatWindow(),
  };

  // ── History ─────────────────────────────────────────────────────────────
  const undo: MenuItemNode = {
    kind: "item",
    id: "undo",
    label: "Undo",
    icon: Undo2,
    iconClassName: "text-sky-500",
    hint: undoHint,
    disabled: onUndo ? !canUndo : !m.canNativeUndo,
    onSelect: m.handleUndo,
  };
  const redo: MenuItemNode = {
    kind: "item",
    id: "redo",
    label: "Redo",
    icon: Redo2,
    iconClassName: "text-sky-500",
    hint: redoHint,
    disabled: onRedo ? !canRedo : !m.canNativeUndo,
    onSelect: m.handleRedo,
  };
  const viewHistory: MenuItemNode = {
    kind: "item",
    id: "view-history",
    label: "View History",
    icon: History,
    iconClassName: "text-violet-500",
    disabled: !onViewHistory || !hasHistory,
    onSelect: () => onViewHistory?.(),
  };
  const compare: MenuSubmenuNode = {
    kind: "submenu",
    id: "compare",
    label: "Compare",
    icon: GitCompareArrows,
    iconClassName: "text-amber-500",
    children: [
      {
        kind: "item",
        id: "compare:clipboard",
        label: "Compare with clipboard",
        icon: Clipboard,
        onSelect: () => void m.handleCompareClipboard(),
      },
      {
        kind: "item",
        id: "compare:set-base",
        label: "Set as compare base",
        icon: Pin,
        description:
          actionText.source === "selection" ? "Use selection" : "Use content",
        onSelect: m.handleSetCompareBase,
      },
      {
        kind: "item",
        id: "compare:with-base",
        label: "Compare with base",
        icon: GitCompareArrows,
        description: m.hasCompareBase ? undefined : "No base set yet",
        disabled: !m.hasCompareBase,
        onSelect: () => void m.handleCompareWithBase(),
      },
    ],
  };

  // ── Document ────────────────────────────────────────────────────────────
  const exportMenu: MenuSubmenuNode | null =
    m.exportActions.length > 0
      ? {
          kind: "submenu",
          id: "export",
          label: "Export",
          icon: Download,
          iconClassName: "text-amber-500",
          children: m.exportActions.map((a) => richActionNode(a, m.richDocCtx)),
        }
      : null;
  const convert: MenuSubmenuNode | null =
    m.convertActions.length > 0
      ? {
          kind: "submenu",
          id: "convert",
          label: "Convert",
          icon: Replace,
          iconClassName: "text-violet-500",
          children: m.convertActions.map((a) => richActionNode(a, m.richDocCtx)),
        }
      : null;
  const attach: MenuItemNode | null = entity
    ? {
        kind: "item",
        id: "attach",
        label: "Attach To",
        icon: Link2,
        iconClassName: "text-sky-500",
        onSelect: m.handleAttach,
      }
    : null;
  const share: MenuItemNode | null = entity?.resourceType
    ? {
        kind: "item",
        id: "share",
        label: "Share",
        icon: Share2,
        iconClassName: "text-emerald-500",
        onSelect: m.handleShare,
      }
    : null;

  // ── Placements (data-driven) ────────────────────────────────────────────
  const placements = [
    placementNode(PLACEMENT_TYPES.AI_ACTION, m),
    boundAgentsNode(m),
    placementNode(PLACEMENT_TYPES.CONTENT_BLOCK, m),
    placementNode(PLACEMENT_TYPES.USER_TOOL, m),
    placementNode(PLACEMENT_TYPES.ORGANIZATION_TOOL, m),
  ].filter((n): n is MenuSubmenuNode => n !== null);

  // ── Quick actions ───────────────────────────────────────────────────────
  const quickMode = m.resolvedPlacementMode["quick-action"];
  const quick: MenuSubmenuNode | null =
    quickMode === "hide"
      ? null
      : {
          kind: "submenu",
          id: "quick-actions",
          label: "Quick Actions",
          icon: Zap,
          iconClassName: "text-pink-500",
          disabled: quickMode === "disable",
          width: "w-56",
          children: [
            { kind: "item", id: "qa:notes", label: "Notes", icon: StickyNote, onSelect: () => quickActions.openQuickNotes() },
            { kind: "item", id: "qa:tasks", label: "Tasks", icon: CheckSquare, onSelect: () => quickActions.openQuickTasks() },
            { kind: "item", id: "qa:chat", label: "Chat", icon: MessageSquare, onSelect: () => quickActions.openQuickChat() },
            { kind: "item", id: "qa:data", label: "Data", icon: Database, onSelect: () => quickActions.openQuickData() },
            { kind: "item", id: "qa:files", label: "Files", icon: FolderOpen, onSelect: () => quickActions.openQuickFiles() },
            { kind: "item", id: "qa:voice", label: "Voice Input", icon: Mic, onSelect: () => quickActions.openVoicePad() },
          ],
        };

  // ── Editable ────────────────────────────────────────────────────────────
  const save: MenuItemNode | null =
    isEditable && onSave
      ? {
          kind: "item",
          id: "save",
          label: "Save",
          icon: Save,
          iconClassName: "text-emerald-500",
          onSelect: () => onSave(),
        }
      : null;
  const del: MenuItemNode | null =
    isEditable && onDelete
      ? {
          kind: "item",
          id: "delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: () => void m.handleDelete(),
        }
      : null;

  // ── Admin ───────────────────────────────────────────────────────────────
  const admin: MenuSubmenuNode | null = m.isAdmin
    ? {
        kind: "submenu",
        id: "admin",
        label: "Admin Tools",
        icon: Shield,
        iconClassName: "text-rose-500",
        width: "w-56",
        children: [
          {
            kind: "item",
            id: "admin:debug",
            label: `${m.isDebugMode ? "Disable" : "Enable"} Debug Mode`,
            icon: m.isDebugMode ? EyeOff : Eye,
            iconClassName: m.isDebugMode ? "text-amber-600 dark:text-amber-400" : undefined,
            onSelect: m.handleToggleDebugMode,
          },
          {
            kind: "item",
            id: "admin:values",
            label: "Context Values",
            icon: Bug,
            className: "text-amber-600 dark:text-amber-400",
            onSelect: m.handleInspectValues,
          },
          ...(m.isDebugMode
            ? ([
                {
                  kind: "item",
                  id: "admin:state",
                  label: "Redux State",
                  icon: Database,
                  className: "text-amber-600 dark:text-amber-400",
                  onSelect: m.handleInspectState,
                },
              ] satisfies MenuNode[])
            : []),
          { kind: "separator", id: "admin:sep" },
          {
            kind: "item",
            id: "admin:indicator",
            label: `${m.isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator`,
            icon: m.isAdminIndicatorOpen ? Eye : EyeOff,
            iconClassName: m.isAdminIndicatorOpen ? "text-green-600 dark:text-green-400" : undefined,
            onSelect: m.handleToggleAdminIndicator,
          },
        ],
      }
    : null;

  const extras = extrasByAnchor(extraSections);
  // The surface submenu (engine-built, shared with mobile) — always LAST, where
  // the version footer used to sit.
  const surfaceInfo: MenuSection = {
    id: "surface-info",
    group: "surface-info",
    nodes: m.surfaceSection.items.map(fromExtraItem),
  };

  // ── Classic order (the historical arrangement, separator for separator) ──
  const sections: MenuSection[] = [];
  sections.push({
    id: "clipboard",
    group: "clipboard",
    nodes: compactNodes([
      copy,
      speak,
      spokenSummary,
      copyAs,
      json,
      cut,
      paste,
      selectAll,
      find,
    ]),
  });
  sections.push(...extras["after-clipboard"]);
  sections.push({ id: "tools", group: "tools", nodes: [chat] });
  sections.push({
    id: "history",
    group: "history",
    nodes: compactNodes([
      undo,
      redo,
      viewHistory,
      compare,
      exportMenu,
      convert,
      attach,
      share,
    ]),
  });
  sections.push(...extras["after-compare"]);
  sections.push({ id: "placements", group: "ai", nodes: placements });
  sections.push(...extras["after-placements"]);
  if (quick) {
    sections.push({
      id: "quick",
      group: "quick",
      joinPrevious: extras["after-placements"].length === 0,
      nodes: [quick],
    });
  }
  if (save || del) {
    sections.push({
      id: "editable",
      group: "editable",
      nodes: compactNodes([save, del]),
    });
  }
  if (admin) sections.push({ id: "admin", group: "admin", nodes: [admin] });
  sections.push(surfaceInfo);

  return {
    header,
    sections,
    roles: {
      copy,
      speak,
      spokenSummary,
      copyAs,
      json,
      cut,
      paste,
      selectAll,
      find,
      chat,
      undo,
      redo,
      viewHistory,
      compare,
      exportMenu,
      convert,
      attach,
      share,
      placements,
      quickActions: quick,
      save,
      del,
      admin,
      extras,
      surfaceInfo,
    },
  };
}
