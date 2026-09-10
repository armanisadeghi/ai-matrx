"use client";

/**
 * CodeEditorTabBar
 *
 * VS Code-style scrollable tab strip for the CodeEditorWindow.
 * Each tab shows a language icon + file name + hover close button.
 * Active tab has a blue top border and lighter background.
 */

import React, { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CodeEditorTabBarProps {
  openTabs: string[];
  activeTab: string | null;
  files: CodeFile[];
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeEditorTabBar({
  openTabs,
  activeTab,
  files,
  onTabClick,
  onTabClose,
}: CodeEditorTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active tab into view when it changes.
  useEffect(() => {
    if (!scrollRef.current || !activeTab) return;
    const el = scrollRef.current.querySelector<HTMLElement>(
      "[data-active='true']",
    );
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTab]);

  if (openTabs.length === 0) return null;

  const getFile = (path: string) => files.find((f) => f.path === path);

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Open files"
      className="flex items-stretch h-[34px] min-h-[34px] overflow-x-auto overflow-y-hidden bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 shrink-0"
      style={{ scrollbarWidth: "none" }}
    >
      {openTabs.map((path) => {
        const file = getFile(path);
        if (!file) return null;
        const isActive = path === activeTab;

        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            className={cn(
              "relative flex items-center gap-1.5 px-3 h-full border-r border-gray-300 dark:border-gray-700 shrink-0 cursor-pointer select-none group transition-colors",
              isActive
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                : "bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60",
            )}
            onClick={() => onTabClick(path)}
          >
            {/* Active indicator — blue top border */}
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-500 rounded-b-none" />
            )}

            {/* Language icon */}
            <span className="shrink-0 flex items-center">
              {getLanguageIconNode(file.language, true, file.icon)}
            </span>

            {/* File name */}
            <span className="text-xs font-medium truncate max-w-[120px] leading-none">
              {file.name}
            </span>

            {/* Close button */}
            <button
              type="button"
              aria-label={`Close ${file.name}`}
              onClick={(e) => onTabClose(path, e)}
              className={cn(
                "w-4 h-4 ml-0.5 rounded flex items-center justify-center shrink-0 transition-all",
                "opacity-0 group-hover:opacity-100",
                isActive && "opacity-60",
                "hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600",
              )}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}

      {/* Right gutter — fills remaining space and matches the tab bar bg */}
      <div className="flex-1 min-w-0" />
    </div>
  );
}
