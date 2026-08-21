"use client";

import {
  PanelLeftTapButton,
  MenuTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { TasksAssistStrip } from "@/features/tasks/components/TasksAssistStrip";
import { MandateDoorLink } from "@/features/agents/mandates/components/MandateDoorLink";

/**
 * Header controls for the /tasks route. Lives inside the shell glass header
 * via <PageHeader/>. Toggles the two collapsible side columns through the
 * shared <PanelControlProvider/>.
 *
 * Layout: [sidebar toggle] [list toggle] [title "Tasks"] [assist chips] [agents]
 *  - Toggle buttons on the left (icons reflect collapsed state).
 *  - Title sits inline next to the toggles; the assist strip renders nothing
 *    when there are no chips, so the chrome stays compact.
 *  - Trailing "Task agents" icon is THE DOOR to /agents/mandates?feature=tasks.
 */
export function TasksHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const sidebarCollapsed = isCollapsed("sidebar");
  const listCollapsed = isCollapsed("list");

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      {/* Toggles only apply when the resizable panels are mounted (>= md).
          Below md the route renders <MobileTasksView/>, so the toggles are
          hidden — they would otherwise be no-ops in the shell header. */}
      <div className="hidden md:flex items-center gap-0 p-0 space-x-0 space-y-0">
        <PanelLeftTapButton
          onClick={() => toggle("sidebar")}
          variant={sidebarCollapsed ? "transparent" : "glass"}
          ariaLabel={sidebarCollapsed ? "Show filters" : "Hide filters"}
          tooltip={sidebarCollapsed ? "Show filters" : "Hide filters"}
        />
        <MenuTapButton
          onClick={() => toggle("list")}
          variant={listCollapsed ? "transparent" : "glass"}
          ariaLabel={listCollapsed ? "Show task list" : "Hide task list"}
          tooltip={listCollapsed ? "Show task list" : "Hide task list"}
        />
      </div>
      <h1 className="ml-0 md:ml-2 text-sm font-medium text-foreground truncate">
        Tasks
      </h1>
      {/* Page-layer assist chips (overdue pileup) — renders nothing when
          there are none, so the header stays exactly as before. */}
      <TasksAssistStrip className="ml-3 min-w-0 flex-nowrap overflow-hidden" />
      {/* THE DOOR LAW — the agent that triages tasks is a Mandate
          (`tasks.triage`) the user may swap for their own, with no deploy.
          Deep-linked to the `tasks` domain: the bare list is 264 mandates
          across 45 domains. */}
      <MandateDoorLink feature="tasks" label="Task agents" className="ml-auto" />
    </div>
  );
}
