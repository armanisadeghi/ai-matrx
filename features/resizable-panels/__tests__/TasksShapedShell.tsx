"use client";

// The /tasks shape (features/tasks/components/TasksDesktopShell.tsx): two
// adjacent collapsible columns + a non-collapsible filler, header toggles in a
// sibling subtree, Handles that hide beside a collapsed column. Every piece is
// the real shared-layer component; only the header button is a minimal stand-in
// for TasksHeaderControls (it renders the same isCollapsed()-driven label).

import type { ComponentProps } from "react";
import { Panel, type Layout, type PanelProps } from "react-resizable-panels";
import { ClientGroup } from "../ClientGroup";
import { Handle } from "../Handle";
import { PanelControlProvider, usePanelControls } from "../PanelControlProvider";
import { RegisteredPanel } from "../RegisteredPanel";

export function HeaderToggle({ name }: { name: string }) {
  const { toggle, isCollapsed } = usePanelControls();
  return (
    <button type="button" data-toggle={name} onClick={() => toggle(name)}>
      {isCollapsed(name) ? `Show ${name}` : `Hide ${name}`}
    </button>
  );
}

export function TasksShapedShell({
  defaultLayout,
  sidebar = { defaultSize: "16%", minSize: "8%" },
  providerProps,
}: {
  defaultLayout?: Layout;
  sidebar?: Pick<PanelProps, "defaultSize" | "minSize">;
  providerProps?: Omit<ComponentProps<typeof PanelControlProvider>, "children">;
}) {
  return (
    <PanelControlProvider {...providerProps}>
      <HeaderToggle name="sidebar" />
      <HeaderToggle name="list" />
      <ClientGroup
        id="tasks-shaped"
        groupKey="root"
        cookieName="panels:tasks-shaped-test"
        orientation="horizontal"
        defaultLayout={defaultLayout}
      >
        <RegisteredPanel
          registerAs="sidebar"
          groupKey="root"
          id="sidebar"
          collapsible
          collapsedSize="0%"
          {...sidebar}
        >
          <div>filters</div>
        </RegisteredPanel>
        <Handle hideWhenCollapsed={["sidebar"]} />
        <RegisteredPanel
          registerAs="list"
          groupKey="root"
          id="list"
          collapsible
          collapsedSize="0%"
          defaultSize="16%"
          minSize="8%"
        >
          <div>list</div>
        </RegisteredPanel>
        <Handle hideWhenCollapsed={["list"]} />
        <Panel id="editor" minSize="30%">
          <div>editor</div>
        </Panel>
      </ClientGroup>
    </PanelControlProvider>
  );
}
