"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import TasksContextSidebar from "@/features/tasks/components/TasksContextSidebar";
import TaskListPane from "@/features/tasks/components/TaskListPane";
import TaskEditor from "@/features/tasks/components/TaskEditor";

const MobileTasksView = dynamic(
  () => import("@/features/tasks/components/mobile/MobileTasksView"),
  { ssr: false, loading: () => null },
);

interface TasksDesktopShellProps {
  defaultLayout?: Layout;
  cookieName: string;
}

const GROUP_ID = "tasks";
const GROUP_KEY = "root";

/**
 * Client-side shell for /tasks. Decides between the mobile experience
 * (`<MobileTasksView/>`) and the three-column resizable desktop layout.
 *
 * The desktop layout follows `app/(dev)/demos/resizables/04-mac-mail`:
 *   ┌───────────────┬──────────────┬──────────────────────┐
 *   │ Filters       │ Task list    │ Editor (filler)      │
 *   │ (collapsible) │ (collapsible)│                      │
 *   └───────────────┴──────────────┴──────────────────────┘
 *
 * SSR: server reads the layout cookie and passes it as `defaultLayout` so
 * the first paint already has the user's saved widths baked into the
 * flex-grow values (no flash on resize).
 */
export function TasksDesktopShell({
  defaultLayout,
  cookieName,
}: TasksDesktopShellProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // First paint always renders desktop so SSR + initial client tree match.
  // After mount, swap to the mobile view if the viewport is below the
  // breakpoint. The brief desktop-on-mobile-first-paint is acceptable —
  // matches the agents builder pattern.
  if (hasMounted && isMobile) {
    // Mobile owns its own scroll/swipe, but still has to clear the shell's
    // transparent header glass — without this padding the list title slides
    // up under the shell controls.
    return (
      <div className="h-full pt-[var(--shell-header-h)]">
        <MobileTasksView />
      </div>
    );
  }

  return (
    <ClientGroup
      id={GROUP_ID}
      groupKey={GROUP_KEY}
      cookieName={cookieName}
      orientation="horizontal"
      defaultLayout={defaultLayout}
      className="h-full w-full"
    >
      <RegisteredPanel
        registerAs="sidebar"
        groupKey={GROUP_KEY}
        id="sidebar"
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="8%"
      >
        <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
          <TasksContextSidebar />
        </div>
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["sidebar"]} />

      <RegisteredPanel
        registerAs="list"
        groupKey={GROUP_KEY}
        id="list"
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="8%"
      >
        <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
          <TaskListPane />
        </div>
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["list"]} />

      <Panel id="editor" minSize="30%">
        <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
          <TaskEditor />
        </div>
      </Panel>
    </ClientGroup>
  );
}
