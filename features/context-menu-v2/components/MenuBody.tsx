"use client";

import React from "react";
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
  Search,
  Bug,
  Eye,
  EyeOff,
  Shield,
  Mic,
  Undo2,
  Redo2,
  History,
  GitCompareArrows,
  Clipboard as ClipboardIcon,
  Pin,
} from "lucide-react";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import {
  PLACEMENT_TYPES,
  PLACEMENT_TYPE_META,
} from "@/features/agent-shortcuts/constants";
import type {
  AgentMenuCategoryGroup,
  AgentMenuEntry,
} from "../hooks/useUnifiedAgentContextMenu";
import type {
  ContextMenuExtraSection,
  ContextMenuExtraItem,
  ExtraSectionAnchor,
} from "../extraSections";

export type MenuVariant = "context" | "dropdown";

export interface MenuBodyRenderProps {
  variant: MenuVariant;
  loading: boolean;
  selectedText: string;
  isEditable: boolean;
  /**
   * Per-placement visibility. Values:
   *   - "show"    → render submenu normally; submenu disabled only if it has no items
   *   - "hide"    → skip rendering entirely
   *   - "disable" → render greyed out, not clickable
   */
  placementMode: Record<
    | "ai-action"
    | "content-block"
    | "organization-tool"
    | "user-tool"
    | "quick-action",
    "show" | "hide" | "disable"
  >;
  categoryGroups: AgentMenuCategoryGroup[];
  onEntrySelect: (entry: AgentMenuEntry, placementType: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onFind: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoHint?: string;
  redoHint?: string;
  onViewHistory?: () => void;
  hasHistory: boolean;
  onCompareClipboard: () => void;
  onSetCompareBase: () => void;
  onCompareWithBase: () => void;
  hasCompareBase: boolean;
  /** Surface-specific items injected by a thin wrapper. */
  extraSections?: ContextMenuExtraSection[];
  isAdmin: boolean;
  isDebugMode: boolean;
  isAdminIndicatorOpen: boolean;
  onToggleDebugMode: () => void;
  onToggleAdminIndicator: () => void;
  onInspectContext: () => void;
  onOpenQuickNotes: () => void;
  onOpenQuickTasks: () => void;
  onOpenQuickChat: () => void;
  onOpenQuickData: () => void;
  onOpenQuickFiles: () => void;
  onOpenVoicePad: () => void;
}

function resolveIcon(
  iconName: string | null | undefined,
  fallback: string = "FileText",
) {
  if (!iconName) return getIconComponent(fallback, fallback);
  return getIconComponent(iconName, fallback);
}

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
    case "quick-action":
      return Zap;
    default:
      return FileText;
  }
}

/** Top-level icon colors so the menu reads at a glance (light + dark safe). */
const PLACEMENT_COLOR: Record<string, string> = {
  [PLACEMENT_TYPES.AI_ACTION]: "#0ea5e9", // sky
  [PLACEMENT_TYPES.CONTENT_BLOCK]: "#8b5cf6", // violet
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "#f59e0b", // amber
  [PLACEMENT_TYPES.USER_TOOL]: "#10b981", // emerald
  "quick-action": "#ec4899", // pink
};

function groupsByPlacement(
  groups: AgentMenuCategoryGroup[],
): Record<string, AgentMenuCategoryGroup[]> {
  const map: Record<string, AgentMenuCategoryGroup[]> = {};
  for (const g of groups) {
    const pt = g.category.placementType;
    if (!map[pt]) map[pt] = [];
    map[pt].push(g);
  }
  return map;
}

function hasItemsRecursive(group: AgentMenuCategoryGroup): boolean {
  if (group.items.length > 0) return true;
  return group.children.some((child) => hasItemsRecursive(child));
}

export function MenuBody(props: MenuBodyRenderProps) {
  const {
    variant,
    loading,
    selectedText,
    isEditable,
    placementMode,
    categoryGroups,
    onEntrySelect,
    onCopy,
    onCut,
    onPaste,
    onSelectAll,
    onFind,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    undoHint,
    redoHint,
    onViewHistory,
    hasHistory,
    onCompareClipboard,
    onSetCompareBase,
    onCompareWithBase,
    hasCompareBase,
    extraSections,
    isAdmin,
    isDebugMode,
    isAdminIndicatorOpen,
    onToggleDebugMode,
    onToggleAdminIndicator,
    onInspectContext,
    onOpenQuickNotes,
    onOpenQuickTasks,
    onOpenQuickChat,
    onOpenQuickData,
    onOpenQuickFiles,
    onOpenVoicePad,
  } = props;

  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Label = variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  const grouped = groupsByPlacement(categoryGroups);

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
        <SubTrigger
          className={!hasContent ? "opacity-50 cursor-not-allowed" : ""}
        >
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
            const ItemIcon = resolveIcon(
              entry.entryType === "content_block"
                ? entry.iconName
                : entry.iconName,
            );
            const isDisabled =
              entry.entryType === "agent_shortcut" && !entry.agentId;
            // Legacy-only match (matched via enabledFeatures/untagged, not the
            // surface's surfaceName) — flag red so it's easy to find + backfill.
            const isLegacy = entry.legacyMatch === true;

            return (
              <Item
                key={entry.id}
                onSelect={() => onEntrySelect(entry, placementType)}
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
              {children.map((childGroup) =>
                renderCategoryGroup(childGroup, placementType),
              )}
            </>
          )}
        </SubContent>
      </Sub>
    );
  };

  return (
    <>
      {selectedText && (
        <div className="px-2 py-2 border-b border-border bg-primary/5">
          <div className="flex items-start gap-2">
            <Type className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-primary mb-0.5">
                Selected ({selectedText.length} char
                {selectedText.length !== 1 ? "s" : ""})
              </div>
              <div className="text-xs text-muted-foreground font-mono break-all leading-tight">
                {selectedText.length <= 50
                  ? `"${selectedText}"`
                  : `"${selectedText.substring(0, 20)}...${selectedText.substring(
                      selectedText.length - 20,
                    )}"`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stable shell: Undo / Redo / View History always render so the menu
          never reflows; they're disabled when the surface can't act. */}
      <Item onSelect={() => onUndo?.()} disabled={!onUndo || !canUndo}>
        <Undo2 className="h-4 w-4 mr-2 text-sky-500" />
        Undo
        {undoHint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {undoHint}
          </span>
        )}
      </Item>
      <Item onSelect={() => onRedo?.()} disabled={!onRedo || !canRedo}>
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
      <Separator />

      <Item onSelect={onCopy} disabled={!selectedText}>
        <Copy className="h-4 w-4 mr-2 text-emerald-500" />
        Copy
      </Item>
      <Item onSelect={onCut} disabled={!selectedText || !isEditable}>
        <Scissors className="h-4 w-4 mr-2 text-emerald-500" />
        Cut
      </Item>
      <Item onSelect={onPaste} disabled={!isEditable}>
        <Clipboard className="h-4 w-4 mr-2 text-emerald-500" />
        Paste
      </Item>
      <Item onSelect={onSelectAll}>
        <Type className="h-4 w-4 mr-2 text-muted-foreground" />
        Select All
      </Item>
      <Item onSelect={onFind}>
        <Search className="h-4 w-4 mr-2 text-muted-foreground" />
        Find...
      </Item>

      {renderExtraSections("after-clipboard")}

      <Sub>
        <SubTrigger>
          <GitCompareArrows className="h-4 w-4 mr-2 text-amber-500" />
          Compare
        </SubTrigger>
        <SubContent className="w-60">
          <Item onSelect={onCompareClipboard}>
            <ClipboardIcon className="h-4 w-4 mr-2" />
            Compare with clipboard
          </Item>
          <Item onSelect={onSetCompareBase}>
            <Pin className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Set as compare base</span>
              <span className="text-xs text-muted-foreground">
                {selectedText ? "Use selection" : "Use full content"}
              </span>
            </div>
          </Item>
          <Item onSelect={onCompareWithBase} disabled={!hasCompareBase}>
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

      <Separator />

      {renderExtraSections("after-compare")}

      {(
        [
          "ai-action",
          "content-block",
          "organization-tool",
          "user-tool",
        ] as const
      )
        .filter((p) => placementMode[p] !== "hide")
        .map((placementType) => {
          const mode = placementMode[placementType];
          const groups = grouped[placementType] || [];
          const hasItems =
            groups.length > 0 && groups.some((g) => hasItemsRecursive(g));
          const forcedDisabled = mode === "disable";
          const isDisabled = forcedDisabled || !hasItems || loading;
          const PlacementIcon = getPlacementIcon(placementType);
          const placementColor = PLACEMENT_COLOR[placementType];
          const placementMeta =
            PLACEMENT_TYPE_META[
              placementType as keyof typeof PLACEMENT_TYPE_META
            ];
          const label = placementMeta?.label || placementType;

          return (
            <Sub key={placementType}>
              <SubTrigger
                disabled={isDisabled}
                className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
              >
                <PlacementIcon
                  className="h-4 w-4 mr-2"
                  style={placementColor ? { color: placementColor } : undefined}
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
        })}

      {renderExtraSections("after-placements")}

      {placementMode["quick-action"] !== "hide" && (
        <Sub>
          <SubTrigger
            disabled={placementMode["quick-action"] === "disable"}
            className={
              placementMode["quick-action"] === "disable"
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          >
            <Zap className="h-4 w-4 mr-2 text-pink-500" />
            Quick Actions
          </SubTrigger>
          <SubContent className="w-56">
            <Item onSelect={onOpenQuickNotes}>
              <StickyNote className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Notes</span>
                <span className="text-xs text-muted-foreground">
                  Quick capture
                </span>
              </div>
            </Item>
            <Item onSelect={onOpenQuickTasks}>
              <CheckSquare className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Tasks</span>
                <span className="text-xs text-muted-foreground">
                  Manage tasks
                </span>
              </div>
            </Item>
            <Item onSelect={onOpenQuickChat}>
              <MessageSquare className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Chat</span>
                <span className="text-xs text-muted-foreground">
                  AI assistant
                </span>
              </div>
            </Item>
            <Item onSelect={onOpenQuickData}>
              <Database className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Data</span>
                <span className="text-xs text-muted-foreground">
                  View tables
                </span>
              </div>
            </Item>
            <Item onSelect={onOpenQuickFiles}>
              <FolderOpen className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Files</span>
                <span className="text-xs text-muted-foreground">
                  Browse files
                </span>
              </div>
            </Item>
            <Item onSelect={onOpenVoicePad}>
              <Mic className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span>Voice Input</span>
                <span className="text-xs text-muted-foreground">
                  Record &amp; transcribe
                </span>
              </div>
            </Item>
          </SubContent>
        </Sub>
      )}

      {isAdmin && (
        <>
          <Separator />
          <Sub>
            <SubTrigger>
              <Shield className="h-4 w-4 mr-2 text-rose-500" />
              Admin Tools
            </SubTrigger>
            <SubContent className="w-56">
              <Item onSelect={onToggleDebugMode}>
                {isDebugMode ? (
                  <EyeOff className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                <div className="flex flex-col">
                  <span>{isDebugMode ? "Disable" : "Enable"} Debug Mode</span>
                  <span className="text-xs text-muted-foreground">
                    {isDebugMode ? "Hide debug info" : "Show debug info"}
                  </span>
                </div>
              </Item>
              {isDebugMode && (
                <Item
                  onSelect={onInspectContext}
                  className="text-amber-600 dark:text-amber-400"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Inspect Context</span>
                    <span className="text-xs text-muted-foreground">
                      View available data
                    </span>
                  </div>
                </Item>
              )}
              <Separator />
              <Item onSelect={onToggleAdminIndicator}>
                {isAdminIndicatorOpen ? (
                  <Eye className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
                ) : (
                  <EyeOff className="h-4 w-4 mr-2" />
                )}
                <div className="flex flex-col">
                  <span>
                    {isAdminIndicatorOpen ? "Hide" : "Show"} Admin Indicator
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isAdminIndicatorOpen ? "Hide overlay" : "Show overlay"}
                  </span>
                </div>
              </Item>
            </SubContent>
          </Sub>
        </>
      )}
    </>
  );
}
