"use client";

// features/context-menu-v3/components/MenuContent.tsx
//
// The DESKTOP renderer (T1) — loaded by the shell via next/dynamic({ssr:false})
// on the first open only. Pure PRESENTATION: every piece of behavior (the
// single deduped fetch, scope resolution, rich-document actions, launch /
// clipboard / compare / overlay handlers) lives in `useContextMenuActions`,
// shared 1:1 with the mobile renderer. Do NOT add a handler here — add it to
// the hook so both renderers inherit it.
//
// Two failure classes are killed structurally in the hook:
//   1. "Fake menu" — Copy is source-gated on `resolveActionText`, which falls
//      back to the DOM-captured content, so right-clicking read-only content
//      always copies. `reportMenuDiagnostics` SCREAMS in dev if a menu opens
//      with nothing to act on.
//   2. Lost values — `resolveApplicationScope` guarantees the 5 baselines and
//      passes every surface-declared value through; the audit screams on gaps.
//
// Modals/windows are dispatched through the OverlayController (no modal code
// here).

import React from "react";
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenuCheckboxItem,
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
  Replace,
  Search,
  Share2,
  Link2,
  Bug,
} from "lucide-react";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type { RichDocumentAction } from "@/features/rich-document/types";
import type { AgentMenuCategoryGroup } from "../hooks/useUnifiedAgentContextMenu";
import { BoundAgentsMenuSection } from "./BoundAgentsMenuSection";
import {
  useContextMenuActions,
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
} from "../types";

function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 50) return `"${t}"`;
  return `"${t.substring(0, 20)}...${t.substring(t.length - 20)}"`;
}

export default function MenuContent(props: MenuContentProps) {
  const {
    variant,
    surfaceName: _surfaceName,
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

  // ── Variant-aware menu primitives ────────────────────────────────────────
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const CheckboxItem =
    variant === "context" ? ContextMenuCheckboxItem : DropdownMenuCheckboxItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Label = variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderExtraItem = (item: ContextMenuExtraItem): React.ReactElement => {
    if (item.kind === "separator") return <Separator key={item.id} />;
    if (item.kind === "checkbox") {
      return (
        <CheckboxItem
          key={item.id}
          checked={item.checked}
          disabled={item.disabled}
          // preventDefault keeps the menu OPEN across toggles (checkbox UX).
          onSelect={(e: Event) => e.preventDefault()}
          onCheckedChange={(next: boolean) => item.onCheckedChange(next)}
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
        </CheckboxItem>
      );
    }
    if (item.kind === "link") {
      return (
        <Item key={item.id} asChild disabled={item.disabled}>
          <a
            href={item.href}
            target={item.target}
            rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
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
          </a>
        </Item>
      );
    }
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
          <SubContent className="z-[9999] w-60">
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
        <SubContent className="z-[9999] w-64">
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
                onSelect={() => m.handleEntrySelect(entry)}
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
              {children.map((child) =>
                renderCategoryGroup(child, placementType),
              )}
            </>
          )}
        </SubContent>
      </Sub>
    );
  };

  const renderRichAction = (action: RichDocumentAction): React.ReactElement => {
    const { label, disabled } = resolveRichActionView(action, richDocCtx);
    const ActionIcon = action.icon;
    return (
      <Item
        key={action.id}
        onSelect={() => void action.run(richDocCtx)}
        disabled={disabled}
      >
        <ActionIcon className={`h-4 w-4 mr-2 ${action.iconColor ?? ""}`} />
        {label}
      </Item>
    );
  };

  const renderPlacementSubmenu = (placementType: string) => {
    const mode = resolvedPlacementMode[placementType as PlacementKey];
    if (mode === "hide") return null;
    const groups = grouped[placementType] || [];
    const hasItems = groups.length > 0 && groups.some(hasItemsRecursive);
    const isDisabled = mode === "disable" || !hasItems || loading;
    const PlacementIcon = getPlacementIcon(placementType);
    const color = PLACEMENT_COLOR[placementType];
    const label = getPlacementLabel(placementType);
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
        <SubContent className="z-[9999] w-64">
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
      <Item
        onSelect={() => void m.handleCopy()}
        disabled={actionText.source === "none"}
      >
        <Copy className="h-4 w-4 mr-2 text-emerald-500" />
        Copy
      </Item>
      {copyVariantActions.length > 0 && (
        <Sub>
          <SubTrigger>
            <Copy className="h-4 w-4 mr-2 text-emerald-500" />
            Copy as
          </SubTrigger>
          <SubContent className="z-[9999] w-60">
            {copyVariantActions.map(renderRichAction)}
          </SubContent>
        </Sub>
      )}
      <Item
        onSelect={() => void m.handleCut()}
        disabled={!isEditable || !props.selectedText}
      >
        <Scissors className="h-4 w-4 mr-2 text-emerald-500" />
        Cut
      </Item>
      <Item onSelect={() => void m.handlePaste()} disabled={!isEditable}>
        <Clipboard className="h-4 w-4 mr-2 text-emerald-500" />
        Paste
      </Item>
      <Item onSelect={m.handleSelectAll}>
        <Type className="h-4 w-4 mr-2 text-muted-foreground" />
        Select All
      </Item>

      <Item onSelect={m.handleFind}>
        <Search className="h-4 w-4 mr-2 text-muted-foreground" />
        Find &amp; Replace
      </Item>

      {renderExtraSections("after-clipboard")}

      <Separator />

      {/* Core platform panels */}
      <Item onSelect={() => quickActions.openChatWindow()}>
        <MessageSquare className="h-4 w-4 mr-2 text-primary" />
        Chat
      </Item>

      <Separator />

      {/* History (Undo / Redo / View History / Compare) */}
      <Item
        onSelect={m.handleUndo}
        disabled={onUndo ? !canUndo : !canNativeUndo}
      >
        <Undo2 className="h-4 w-4 mr-2 text-sky-500" />
        Undo
        {undoHint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {undoHint}
          </span>
        )}
      </Item>
      <Item
        onSelect={m.handleRedo}
        disabled={onRedo ? !canRedo : !canNativeUndo}
      >
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
        <SubContent className="z-[9999] w-60">
          <Item onSelect={() => void m.handleCompareClipboard()}>
            <ClipboardIcon className="h-4 w-4 mr-2" />
            Compare with clipboard
          </Item>
          <Item onSelect={m.handleSetCompareBase}>
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
          <Item
            onSelect={() => void m.handleCompareWithBase()}
            disabled={!hasCompareBase}
          >
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
          <SubContent className="z-[9999] w-60">
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
          <SubContent className="z-[9999] w-60">
            {convertActions.map(renderRichAction)}
          </SubContent>
        </Sub>
      )}

      {entity && (
        <Item onSelect={m.handleAttach}>
          <Link2 className="h-4 w-4 mr-2 text-sky-500" />
          Attach To
        </Item>
      )}
      {entity?.resourceType && (
        <Item onSelect={m.handleShare}>
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
          onSelect={(entry) => void m.handleBoundAgentExecute(entry)}
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
          <SubContent className="z-[9999] w-56">
            <Item onSelect={() => quickActions.openQuickNotes()}>
              <StickyNote className="h-4 w-4 mr-2" />
              Notes
            </Item>
            <Item onSelect={() => quickActions.openQuickTasks()}>
              <CheckSquare className="h-4 w-4 mr-2" />
              Tasks
            </Item>
            <Item onSelect={() => quickActions.openQuickChat()}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Item>
            <Item onSelect={() => quickActions.openQuickData()}>
              <Database className="h-4 w-4 mr-2" />
              Data
            </Item>
            <Item onSelect={() => quickActions.openQuickFiles()}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Files
            </Item>
            <Item onSelect={() => quickActions.openVoicePad()}>
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
              onSelect={() => void m.handleDelete()}
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
            <SubContent className="z-[9999] w-56">
              <Item onSelect={m.handleToggleDebugMode}>
                {isDebugMode ? (
                  <EyeOff className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                {isDebugMode ? "Disable" : "Enable"} Debug Mode
              </Item>
              <Item
                onSelect={m.handleInspectValues}
                className="text-amber-600 dark:text-amber-400"
              >
                <Bug className="h-4 w-4 mr-2" />
                Context Values
              </Item>
              {isDebugMode && (
                <Item
                  onSelect={m.handleInspectState}
                  className="text-amber-600 dark:text-amber-400"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Redux State
                </Item>
              )}
              <Separator />
              <Item onSelect={m.handleToggleAdminIndicator}>
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
