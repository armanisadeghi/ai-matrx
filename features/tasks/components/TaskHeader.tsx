import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectShowAllProjects,
  selectActiveProject,
} from "@/features/tasks/redux/taskUiSlice";
import { selectProjects } from "@/features/tasks/redux/selectors";

export default function TaskHeader() {
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const projects = useAppSelector(selectProjects);

  return (
    <header className="bg-card border-b border-border p-4">
      <h1 className="text-xl font-semibold text-foreground">
        {showAllProjects
          ? "All Tasks"
          : projects.find((project) => project.id === activeProject)?.name ||
            "Tasks"}
      </h1>
    </header>
  );
}
