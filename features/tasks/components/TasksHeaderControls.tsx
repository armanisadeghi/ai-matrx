"use client";

import {
  PanelLeftTapButton,
  MenuTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { TasksAssistStrip } from "@/features/tasks/components/TasksAssistStrip";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { HrTasksDoor } from "@/features/hr/entry-points/HrTasksDoor";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { useOrganizationGatedControl } from "@/features/organizations/useOrganizationGatedControl";
import { useOpenGoogleTasksImport } from "@/features/overlays/openers/googleImportWindows";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

/**
 * Header controls for the /tasks route, on the shared RouteHeader (it injects
 * into the shell glass header itself; the actions fold into "…" by the main
 * column's width, so the row fits beside an open canvas). Toggles the two collapsible side columns through the
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
  // The organization the import writes into is the one the person selected —
  // never a personal-workspace fallback. FOUR states, not two: while boot is
  // still resolving the control waits and says it is checking; once boot has
  // SETTLED with nothing selected it refuses honestly with the remedy; when the
  // READ ITSELF FAILED it stays pressable and the press asks again; only with
  // an organization does it open the import. Reading the bare id told a person who HAS an
  // organization to "Select an organization" for thirteen seconds of every cold
  // load (VERIFY-R7-FIX-WAVE NEW-1, seat-proven 2026-09-18) — the exact class
  // the three-state hook exists to kill, re-armed in this file.
  const importGate = useOrganizationGatedControl("importing Google Tasks");
  const openGoogleTasksImport = useOpenGoogleTasksImport();
  const sidebarCollapsed = isCollapsed("sidebar");
  const listCollapsed = isCollapsed("list");

  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          {/* Toggles only apply when the resizable panels are mounted (>= md).
              Below md the route renders <MobileTasksView/>, so the toggles are
              hidden — they would otherwise be no-ops in the shell header.
              Both stay glass (all glass or none); `pressed` says which is open. */}
          <div className="hidden shrink-0 items-center md:flex">
            <PanelLeftTapButton
              onClick={() => toggle("sidebar")}
              pressed={!sidebarCollapsed}
              ariaLabel={sidebarCollapsed ? "Show filters" : "Hide filters"}
              tooltip={sidebarCollapsed ? "Show filters" : "Hide filters"}
            />
            {selectedTaskId ? (
              <MenuTapButton
                onClick={() => toggle("list")}
                pressed={!listCollapsed}
                ariaLabel={listCollapsed ? "Show task list" : "Hide task list"}
                tooltip={listCollapsed ? "Show task list" : "Hide task list"}
              />
            ) : null}
          </div>
          <h1 className="ml-1 shrink-0 text-sm font-medium text-foreground md:ml-2">
            Tasks
          </h1>
          {/* Page-layer assist chips (overdue pileup) — renders nothing when
              there are none, so the header stays exactly as before. */}
          <TasksAssistStrip className="ml-1 min-w-0 flex-nowrap overflow-hidden" />
          {/* SPEC-UI-IA §6 — HR decisions waiting on this person, as a BADGE that
              is a DOOR to /hr/tasks. HR does NOT build a second task store, so
              nothing is injected into the list; it renders nothing at all when
              there is no HR standing or nothing waiting. */}
          <span className="ml-1 shrink-0">
            <HrTasksDoor />
          </span>
          {/* THE DOOR LAW — the agent that triages tasks is a Mandate
              (`tasks.triage`) the user may swap for their own, with no deploy.
              It draws nothing in the row (disclosure lives in the shell's
              Agents menu), so it stays out of the folding actions. */}
          <MandateDoorLink feature="tasks" label="Task agents" />
        </div>
      }
      right={
        <>
          {/* Google-native PLAN §4.7 — the import opens IN PLACE as a window, so
              the list stays where it was. Read-only toward Google. The one
              action: below its width it goes icon-only. */}
          <Button
            icon={<CalendarCheck />}
            variant="quiet"
            className="shrink-0"
            aria-label="Import from Google Tasks"
            disabled={importGate.disabled}
            title={importGate.title}
            // THE REMEDY IS THE PRESS (V-24 NEW-3). The gate's own handler opens the
            // import when the organization is known and, when the READ FAILED, runs
            // the read again — so the posture's "Press to try again." names this
            // button and not the task list's Try again, which is the only other one
            // on this page and does nothing for the organization.
            onClick={importGate.press((organizationId) =>
              openGoogleTasksImport({ organizationId }),
            )}
          >
            <span className="max-sm:sr-only" data-header-compact-label>Import</span>
          </Button>
        </>
      }
    />
  );
}
