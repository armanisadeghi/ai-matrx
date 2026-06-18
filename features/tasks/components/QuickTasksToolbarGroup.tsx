"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  PanelLeftTapButton,
  ArrowDownUpTapButton,
  CheckSquareTapButton,
  PlusTapButton,
  ExternalLinkTapButton,
  XTapButton,
} from "@/components/icons/tap-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TASK_SORT_OPTIONS, type TaskSortField } from "../types/sort";

export interface QuickTasksToolbarGroupProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  showCompleted: boolean;
  onShowCompletedToggle: () => void;
  sortBy: TaskSortField;
  onSortChange: (sort: TaskSortField) => void;
  onNewProject: () => void;
  className?: string;
}

/**
 * Glass pill toolbar: sidebar toggle, inline search, sort, completed toggle,
 * new project, and open-full-page — mirrors header actions for layout trials.
 */
export function QuickTasksToolbarGroup({
  searchQuery,
  onSearchChange,
  sidebarOpen,
  onSidebarToggle,
  showCompleted,
  onShowCompletedToggle,
  sortBy,
  onSortChange,
  onNewProject,
  className,
}: QuickTasksToolbarGroupProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <TapTargetButtonGroup
      className={cn(
        "w-full min-w-0",
        "[&>div:last-child]:w-full [&>div:last-child]:min-w-0",
        className,
      )}
    >
      <PanelLeftTapButton
        variant="group"
        onClick={onSidebarToggle}
        ariaLabel={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        tooltip={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        className={sidebarOpen ? "text-primary" : undefined}
      />

      <div className="flex-1 min-w-0 flex items-center gap-1 h-8 px-1">
        <svg
          className="flex-shrink-0 w-3.5 h-3.5 text-muted-foreground opacity-60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground placeholder:text-sm placeholder:text-muted-foreground/70"
          style={{ fontSize: "16px", lineHeight: 1 }}
          autoComplete="off"
        />
        {searchQuery ? (
          <XTapButton
            variant="group"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            ariaLabel="Clear search"
            tooltip="Clear"
          />
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ArrowDownUpTapButton
            variant="group"
            ariaLabel="Sort tasks"
            tooltip="Sort"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {TASK_SORT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = sortBy === opt.field;
            return (
              <DropdownMenuItem
                key={opt.field}
                onClick={() => onSortChange(opt.field)}
                className="text-xs"
              >
                <Icon className="mr-2 h-3.5 w-3.5" />
                {opt.label}
                {selected ? (
                  <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <CheckSquareTapButton
        variant="group"
        onClick={onShowCompletedToggle}
        ariaLabel={showCompleted ? "Hide completed" : "Show completed"}
        tooltip={showCompleted ? "Hide completed" : "Show completed"}
        className={showCompleted ? "text-primary" : undefined}
      />

      <PlusTapButton
        variant="group"
        onClick={onNewProject}
        ariaLabel="New project"
        tooltip="New project"
      />

      <ExternalLinkTapButton
        variant="group"
        href="/tasks"
        target="_blank"
        ariaLabel="Open tasks in new tab"
        tooltip="Open in new tab"
      />
    </TapTargetButtonGroup>
  );
}
