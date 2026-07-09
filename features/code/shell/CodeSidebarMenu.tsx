"use client";

// CodeSidebarMenu — activity-view switcher for `/code`, rendered INSIDE
// the app shell sidebar (registered in `route-menu-registry`).
//
// Mirrors ChatSidebarMenu chrome rows:
//   · Always-rendered `.shell-nav-item` rows (identical DOM collapsed/expanded)
//   · Clicking a view drives `setActiveView` so the in-workspace side panel
//     (Library / Explorer / …) opens, switches, or collapses — same toggle
//     contract as the embedded ActivityBar.
//
// The file tree itself stays in the workspace's resizable side panel so
// large libraries remain readable and adjustable. This menu is only the
// icon/label chrome.
//
// Lazy: this module is only imported when pathname matches `/code`.

import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveView, setActiveView } from "../redux/codeWorkspaceSlice";
import { ACTIVITY_VIEWS } from "../activity-bar/activity-views";
import type { ActivityViewId } from "../types";

const NAV_ITEM_CLASS = "shell-nav-item shell-nav-stable shell-tactile-subtle";
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

interface CodeSidebarMenuProps {
  expanded: boolean;
}

export default function CodeSidebarMenu({
  expanded: _expanded,
}: CodeSidebarMenuProps) {
  const dispatch = useAppDispatch();
  const activeView = useAppSelector(selectActiveView);

  const selectView = (id: ActivityViewId) => {
    dispatch(setActiveView(id));
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-0.5">
      {ACTIVITY_VIEWS.map((view) => {
        const Icon = view.icon;
        const isActive = activeView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            title={
              view.shortcut ? `${view.label} (${view.shortcut})` : view.label
            }
            aria-label={view.label}
            aria-current={isActive ? "page" : undefined}
            className={cn(NAV_ITEM_CLASS, isActive && "shell-active-pill")}
            onClick={() => selectView(view.id)}
          >
            <span className="shell-nav-icon">
              <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            </span>
            <span className="shell-nav-label">{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}
