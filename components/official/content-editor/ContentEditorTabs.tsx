// components/official/content-editor/ContentEditorTabs.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Plus, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTriggerLegacy as SelectTrigger,
} from "@/components/ui/select";
import { ContentEditor, MODE_CONFIGS } from "./ContentEditor";
import type { EditorMode, ContentEditorProps } from "./types";

export interface ContentEditorTab {
  id: string;
  title: string;
  value: string;
}

type SharedEditorProps = Omit<
  ContentEditorProps,
  | "value"
  | "onChange"
  | "title"
  | "collapsible"
  | "defaultCollapsed"
  | "collapseMode"
  | "collapsedPreviewHeight"
  | "mode"
  | "onModeChange"
  | "showModeSelector"
  | "className"
>;

export interface ContentEditorTabsProps extends SharedEditorProps {
  tabs: ContentEditorTab[];
  onTabsChange: (tabs: ContentEditorTab[]) => void;

  // Active tab (controlled or uncontrolled)
  activeTabId?: string;
  defaultActiveTabId?: string;
  onActiveTabChange?: (id: string) => void;

  // Collapse applies to the whole group (not per tab)
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapseMode?: "hide" | "fade";
  collapsedPreviewHeight?: number | string;

  // Tab management
  allowAddTab?: boolean;
  allowCloseTab?: boolean;
  onAddTab?: () => ContentEditorTab; // factory for new tab
  maxTabTitleLength?: number;

  /**
   * When true, the mode selector is rendered once in the tab bar (right side)
   * and applies to every tab. Per-tab selectors are hidden.
   */
  sharedModeSelector?: boolean;
  /**
   * Initial shared mode when sharedModeSelector is true.
   * Defaults to `initialMode` or "matrx-split".
   */
  defaultSharedMode?: EditorMode;

  className?: string;
}

export function ContentEditorTabs({
  tabs,
  onTabsChange,
  activeTabId: controlledActiveId,
  defaultActiveTabId,
  onActiveTabChange,
  collapsible = false,
  defaultCollapsed = false,
  collapseMode = "hide",
  collapsedPreviewHeight = 120,
  allowAddTab = false,
  allowCloseTab = false,
  onAddTab,
  maxTabTitleLength = 24,
  sharedModeSelector = false,
  defaultSharedMode,
  availableModes = ["plain", "matrx-split", "wysiwyg", "markdown", "preview"],
  initialMode = "matrx-split",
  className,
  ...sharedEditorProps
}: ContentEditorTabsProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>(
    defaultActiveTabId ?? tabs[0]?.id ?? "",
  );
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [sharedMode, setSharedMode] = useState<EditorMode>(
    defaultSharedMode ?? initialMode,
  );

  const activeTabId = controlledActiveId ?? internalActiveId;

  // If the active tab gets removed externally, fall back to the first tab.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId) && tabs[0]) {
      const nextId = tabs[0].id;
      if (controlledActiveId === undefined) setInternalActiveId(nextId);
      onActiveTabChange?.(nextId);
    }
  }, [tabs, activeTabId, controlledActiveId, onActiveTabChange]);

  const setActiveTab = useCallback(
    (id: string) => {
      if (controlledActiveId === undefined) setInternalActiveId(id);
      onActiveTabChange?.(id);
    },
    [controlledActiveId, onActiveTabChange],
  );

  const handleContentChange = useCallback(
    (id: string) => (newValue: string) => {
      onTabsChange(
        tabs.map((t) => (t.id === id ? { ...t, value: newValue } : t)),
      );
    },
    [tabs, onTabsChange],
  );

  const handleCloseTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = tabs.filter((t) => t.id !== id);
      onTabsChange(next);
      if (id === activeTabId && next[0]) {
        setActiveTab(next[0].id);
      }
    },
    [tabs, onTabsChange, activeTabId, setActiveTab],
  );

  const handleAddTab = useCallback(() => {
    if (!onAddTab) return;
    const tab = onAddTab();
    onTabsChange([...tabs, tab]);
    setActiveTab(tab.id);
  }, [onAddTab, tabs, onTabsChange, setActiveTab]);

  const truncate = (s: string) =>
    s.length > maxTabTitleLength ? s.slice(0, maxTabTitleLength - 1) + "…" : s;

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const filteredModes = MODE_CONFIGS.filter((c) =>
    availableModes.includes(c.value),
  );
  const sharedModeConfig =
    MODE_CONFIGS.find((c) => c.value === sharedMode) ?? MODE_CONFIGS[0];
  const SharedModeIcon = sharedModeConfig?.icon ?? FileText;

  // When collapsed-in-fade: editor body stays mounted but clipped with fade.
  // When collapsed-in-hide: editor body is unmounted completely.
  const showBody = !isCollapsed || collapseMode === "fade";

  return (
    <div
      className={cn(
        "flex flex-col bg-textured border border-border rounded-lg overflow-hidden",
        className,
      )}
    >
      {/* Tab bar */}
      <div className="flex-none flex items-stretch bg-zinc-100 dark:bg-zinc-900 border-b border-border">
        {collapsible && (
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="flex items-center justify-center px-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            )}
          </button>
        )}

        <div className="flex-1 flex items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border select-none transition-colors max-w-[200px]",
                  isActive
                    ? "bg-white dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60",
                )}
                title={tab.title}
              >
                <span className="truncate">{truncate(tab.title)}</span>
                {allowCloseTab && tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className={cn(
                      "flex-none flex items-center justify-center h-4 w-4 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-opacity",
                      isActive
                        ? "opacity-70"
                        : "opacity-0 group-hover:opacity-70",
                    )}
                    title="Close tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {allowAddTab && onAddTab && (
            <button
              type="button"
              onClick={handleAddTab}
              className="flex-none flex items-center justify-center px-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors"
              title="New tab"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Shared mode selector — sits at the far right of the tab bar */}
        {sharedModeSelector && filteredModes.length > 1 && (
          <div className="flex-none flex items-center pr-2">
            <Select
              value={sharedMode}
              onValueChange={(v) => setSharedMode(v as EditorMode)}
            >
              <SelectTrigger
                hideArrow
                size="sm"
                className="w-auto gap-1 px-2 py-1 h-auto border-0 bg-transparent shadow-none rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:border-0 focus:ring-0 focus:border-0"
                title={`Mode: ${sharedModeConfig?.label ?? ""}`}
              >
                <SharedModeIcon className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent>
                {filteredModes.map((config) => (
                  <SelectItem
                    key={config.value}
                    value={config.value}
                    className="text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <config.icon className="h-3.5 w-3.5" />
                      <div className="flex flex-col">
                        <span className="font-medium">{config.label}</span>
                        <span className="text-[10px] text-zinc-500">
                          {config.description}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Active tab content */}
      {showBody && activeTab && (
        <div
          className={cn(
            "relative",
            isCollapsed && collapseMode === "fade"
              ? "overflow-hidden"
              : "overflow-visible",
          )}
          style={
            isCollapsed && collapseMode === "fade"
              ? {
                  maxHeight:
                    typeof collapsedPreviewHeight === "number"
                      ? `${collapsedPreviewHeight}px`
                      : collapsedPreviewHeight,
                }
              : undefined
          }
        >
          <ContentEditor
            // Remount when switching tabs so internal state stays tab-local.
            // (When sharedModeSelector is on, mode is controlled so remounting is fine.)
            key={activeTab.id}
            value={activeTab.value}
            onChange={handleContentChange(activeTab.id)}
            title={undefined}
            collapsible={false}
            availableModes={availableModes}
            initialMode={initialMode}
            {...(sharedModeSelector
              ? {
                  mode: sharedMode,
                  onModeChange: setSharedMode,
                  showModeSelector: false,
                }
              : {})}
            {...sharedEditorProps}
            className="border-0 rounded-none"
          />

          {isCollapsed && collapseMode === "fade" && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white dark:to-zinc-900"
              />
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                className="absolute left-1/2 bottom-1 -translate-x-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-border shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                title="Expand"
              >
                <ChevronDown className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
