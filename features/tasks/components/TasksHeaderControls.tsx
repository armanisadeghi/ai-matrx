"use client";

import {
  PanelLeftTapButton,
  MenuTapButton,
} from "@ai-matrx/tap-target/buttons";
import { usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { TasksAssistStrip } from "@/features/tasks/components/TasksAssistStrip";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { HrTasksDoor } from "@/features/hr/entry-points/HrTasksDoor";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";

/**
 * Header controls for the /tasks route. Lives inside the shell glass header
 * via <PageHeader/>. Toggles the two collapsible side columns through the
 * shared <PanelControlProvider/>.
 *
 * Layout: [sidebar toggle] [list toggle] [title "Tasks"] [assist chips] [agents]
 *  - Toggle buttons on the left (icons reflect collapsed state).
 *  - Title sits inline next to the toggles; the assist strip renders nothing
 *    when there are no chips, so the chrome stays compact.
 *  - Trailing "Task agents" icon is THE DOOR to /mandates?feature=tasks.
 */
export function TasksHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const sidebarCollapsed = isCollapsed("sidebar");
  const listCollapsed = isCollapsed("list");

  return (
    <div className="flex items-center w-full min-w-0 gap-2 p-0 space-x-0 space-y-0">
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
        {selectedTaskId ? (
          <MenuTapButton
            onClick={() => toggle("list")}
            variant={listCollapsed ? "transparent" : "glass"}
            ariaLabel={listCollapsed ? "Show task list" : "Hide task list"}
            tooltip={listCollapsed ? "Show task list" : "Hide task list"}
          />
        ) : null}
      </div>
      <h1 className="ml-0 md:ml-2 shrink-0 text-sm font-medium text-foreground truncate">
        Tasks
      </h1>
      {/* Page-layer assist chips (overdue pileup) — renders nothing when
          there are none, so the header stays exactly as before. */}
      <TasksAssistStrip className="ml-1 min-w-0 flex-nowrap overflow-hidden" />
      {/* THE DOOR LAW — the agent that triages tasks is a Mandate
          (`tasks.triage`) the user may swap for their own, with no deploy.
          Deep-linked to the `tasks` domain: the bare list is 264 mandates
          across 45 domains. */}
      {/* SPEC-UI-IA §6 — HR decisions waiting on this person, as a BADGE that
          is a DOOR to /hr/tasks. HR does NOT build a second task store, so
          nothing is injected into the list; it renders nothing at all when
          there is no HR standing or nothing waiting. */}
      <span className="ml-1 shrink-0">
        <HrTasksDoor />
      </span>
      <MandateDoorLink feature="tasks" label="Task agents" className="ml-auto" />
    </div>
  );
}
