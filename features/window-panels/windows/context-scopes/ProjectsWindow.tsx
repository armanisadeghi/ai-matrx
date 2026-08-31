"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ProjectsWorkspace } from "@/features/projects/components/ProjectsWorkspace";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

interface ProjectsWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProjectsWindow({
  isOpen,
  onClose,
}: ProjectsWindowProps) {
  if (!isOpen) return null;

  return (
    <NonEditableContextMenu
      sourceFeature="projects"
      contentSource={{ type: "raw" }}
      contextData={{ content: "Projects" }}
    >
      <WindowPanel
        title="Projects"
        onClose={onClose}
        position="center"
        width={320}
        height={500}
        minWidth={280}
        maxWidth={600}
        overlayId="projectsWindow"
      >
        <ProjectsWorkspace />
      </WindowPanel>
    </NonEditableContextMenu>
  );
}
