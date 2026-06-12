// Import Tasks Modal - Import AI-generated tasks into the task management system
"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CheckSquare, FolderPlus, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectProjects } from "@/features/tasks/redux/selectors";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import { toast } from "sonner";
import type { TaskItemType } from "@/components/mardown-display/blocks/tasks/TaskChecklist";

interface ImportTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItemType[];
  checkboxState: Record<string, boolean>;
}

type SelectionState = Record<string, boolean>;

export default function ImportTasksModal({
  isOpen,
  onClose,
  tasks,
  checkboxState,
}: ImportTasksModalProps) {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const refresh = () => dispatch(invalidateAndRefetchFullContext());

  const [selectedTasks, setSelectedTasks] = useState<SelectionState>({});
  const [projectSelection, setProjectSelection] = useState<
    "new" | "existing" | "draft"
  >("draft");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);

  // Initialize all tasks as selected
  useEffect(() => {
    if (isOpen) {
      const initialSelection: SelectionState = {};
      const initializeSelection = (items: TaskItemType[]) => {
        items.forEach((item) => {
          if (item.type !== "section") {
            initialSelection[item.id] = true;
          }
          if (item.children) {
            initializeSelection(item.children);
          }
        });
      };
      initializeSelection(tasks);
      setSelectedTasks(initialSelection);
    }
  }, [isOpen, tasks]);

  // Count total selected tasks
  const getSelectedCount = () => {
    return Object.values(selectedTasks).filter(Boolean).length;
  };

  // Toggle task selection
  const toggleTask = (taskId: string, includeChildren: boolean = false) => {
    setSelectedTasks((prev) => {
      const newState = { ...prev, [taskId]: !prev[taskId] };

      // If includeChildren, toggle all children too
      if (includeChildren) {
        const task = findTaskById(tasks, taskId);
        if (task?.children) {
          const toggleChildren = (children: TaskItemType[]) => {
            children.forEach((child) => {
              newState[child.id] = newState[taskId];
              if (child.children) {
                toggleChildren(child.children);
              }
            });
          };
          toggleChildren(task.children);
        }
      }

      return newState;
    });
  };

  // Find task by ID
  const findTaskById = (
    items: TaskItemType[],
    id: string,
  ): TaskItemType | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findTaskById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Handle import
  const handleImport = async () => {
    setIsImporting(true);
    setImportProgress(0);
    setImportedCount(0);

    try {
      // Step 1: Determine or create project
      let targetProjectId = selectedProjectId;

      if (projectSelection === "new") {
        if (!newProjectName.trim()) {
          toast.error("Please enter a project name");
          setIsImporting(false);
          return;
        }
        const project = await createProject(newProjectName);
        if (!project) {
          throw new Error("Failed to create project");
        }
        targetProjectId = project.id;
      } else if (projectSelection === "draft") {
        // Find or create "AI Tasks (Draft)" project
        let draftProject = projects.find((p) => p.name === "AI Tasks (Draft)");
        if (!draftProject) {
          const project = await createProject("AI Tasks (Draft)");
          if (!project) {
            throw new Error("Failed to create draft project");
          }
          targetProjectId = project.id;
        } else {
          targetProjectId = draftProject.id;
        }
      }

      // Step 2: Import selected tasks
      const selectedCount = getSelectedCount();
      let imported = 0;

      await importTasksRecursive(tasks, targetProjectId, null, (count) => {
        imported += count;
        setImportedCount(imported);
        setImportProgress((imported / selectedCount) * 100);
      });

      // Refresh and close
      await refresh();
      setTimeout(() => {
        setIsImporting(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error("Import failed:", error);
      toast.error("Failed to import tasks. Please try again.");
      setIsImporting(false);
    }
  };

  // Recursive import function
  const importTasksRecursive = async (
    items: TaskItemType[],
    projectId: string,
    parentTaskId: string | null,
    onProgress: (count: number) => void,
  ) => {
    const { createTask, createSubtask } =
      await import("../services/taskService");

    for (const item of items) {
      // Skip sections and unselected tasks
      if (item.type === "section") {
        if (item.children) {
          await importTasksRecursive(
            item.children,
            projectId,
            parentTaskId,
            onProgress,
          );
        }
        continue;
      }

      if (!selectedTasks[item.id]) {
        continue;
      }

      // Create the task
      const isCompleted = checkboxState[item.id] || item.checked || false;

      const newTask = parentTaskId
        ? await createSubtask(parentTaskId, item.title, "")
        : await createTask({
            title: item.title,
            description: "",
            project_id: projectId,
            status: isCompleted ? "completed" : "incomplete",
          });

      if (newTask) {
        onProgress(1);

        // Import children (subtasks)
        if (item.children && item.children.length > 0) {
          await importTasksRecursive(
            item.children,
            projectId,
            newTask.id,
            onProgress,
          );
        }
      }
    }
  };

  // Helper to create project
  const createProject = async (name: string) => {
    const { createProject: createProj } =
      await import("../services/projectService");
    return await createProj(name, "");
  };

  // Render task tree for selection
  const renderTaskTree = (items: TaskItemType[], depth = 0) => {
    return items.map((item) => {
      if (item.type === "section") {
        return (
          <div key={item.id} className={`${depth > 0 ? "ml-4" : ""}`}>
            <div className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 mt-3">
              {item.title}
            </div>
            {item.children && renderTaskTree(item.children, depth + 1)}
          </div>
        );
      }

      const isSelected = selectedTasks[item.id];
      const isCompleted = checkboxState[item.id] || item.checked;
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id} className={`${depth > 0 ? "ml-6" : ""} mb-2`}>
          <div className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <Checkbox
              id={item.id}
              checked={isSelected}
              onCheckedChange={() => toggleTask(item.id, hasChildren)}
              className="mt-0.5"
            />
            <label
              htmlFor={item.id}
              className={`text-sm cursor-pointer flex-1 ${
                isCompleted ? "text-muted-foreground line-through" : ""
              } ${item.bold ? "font-semibold" : ""}`}
            >
              {item.title}
              {hasChildren && (
                <span className="text-xs text-gray-500 ml-2">
                  ({item.children!.length} subtask
                  {item.children!.length !== 1 ? "s" : ""})
                </span>
              )}
            </label>
          </div>
          {hasChildren && item.children && (
            <div className="mt-1">
              {renderTaskTree(item.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-full max-h-[70dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Import Tasks to Task Manager
          </DialogTitle>
        </DialogHeader>

        {!isImporting ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* Project Selection */}
              <div className="space-y-3">
                <Label>Import to:</Label>
                <Select
                  value={projectSelection}
                  onValueChange={(v: any) => setProjectSelection(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">
                      <div className="flex items-center gap-2">
                        <FolderPlus size={16} />
                        AI Tasks (Draft) - Auto-create
                      </div>
                    </SelectItem>
                    <SelectItem value="new">New Project</SelectItem>
                    {projects.length > 0 && (
                      <SelectItem value="existing">Existing Project</SelectItem>
                    )}
                  </SelectContent>
                </Select>

                {projectSelection === "new" && (
                  <Input
                    placeholder="Enter new project name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                )}

                {projectSelection === "existing" && (
                  <HierarchyCascade
                    levels={["organization", "scope", "project"]}
                    value={{
                      ...EMPTY_SELECTION,
                      projectId: selectedProjectId,
                    }}
                    onChange={(sel) => {
                      if (sel.projectId) setSelectedProjectId(sel.projectId);
                    }}
                    layout="vertical"
                  />
                )}
              </div>

              {/* Task Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select tasks to import:</Label>
                  <span className="text-sm text-gray-500">
                    {getSelectedCount()} selected
                  </span>
                </div>
                <div className="border-border rounded-lg p-3 h-full overflow-y-auto">
                  {renderTaskTree(tasks)}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  getSelectedCount() === 0 ||
                  (projectSelection === "existing" && !selectedProjectId)
                }
              >
                Import {getSelectedCount()} Task
                {getSelectedCount() !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Importing tasks...</p>
              <p className="text-sm text-gray-500">
                {importedCount} of {getSelectedCount()} tasks imported
              </p>
            </div>
            <Progress value={importProgress} className="w-full max-w-md" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
