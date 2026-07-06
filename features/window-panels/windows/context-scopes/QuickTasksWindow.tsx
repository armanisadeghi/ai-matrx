"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  QuickTasksWorkspaceProvider,
  QuickTasksSidebar,
  QuickTasksMain,
} from "@/features/tasks/components/QuickTasksWorkspace";

interface QuickTasksWindowProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function QuickTasksWindow({
  isOpen,
  onClose,
}: QuickTasksWindowProps) {
  if (!isOpen) return null;

  return (
    <QuickTasksWorkspaceProvider>
      <WindowPanel
        title="Quick Tasks"
        width={850}
        height={650}
        sidebar={<QuickTasksSidebar />}
        sidebarDefaultSize={300}
        sidebarMinSize={225}
        sidebarClassName="bg-muted/10 border-r"
        urlSyncKey="quick_tasks"
        onClose={onClose}
        overlayId="quickTasksWindow"
      >
        <QuickTasksMain />
      </WindowPanel>
    </QuickTasksWorkspaceProvider>
  );
}
