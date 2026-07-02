/**
 * aiExportService — fetch full project/task trees for "Copy for AI" payloads.
 *
 * Loads tasks (nested via parent_task_id), comments, attachments, and linked
 * notes so an agent receives the complete container context in one copy.
 */

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { getProject, getProjectMembers } from "@/features/projects/service";
import type { Project, ProjectMemberWithUser } from "@/features/projects/types";
import {
  getProjectTasks,
  getTaskComments,
  getTaskAttachments,
  type TaskAttachment,
} from "@/features/tasks/services/taskService";
import type { DatabaseTask } from "@/features/tasks/types/database";
import type { Comment } from "@/features/comments/types";

export interface NoteExportRow {
  id: string;
  label: string | null;
  content: string | null;
  updated_at: string | null;
  task_id: string | null;
  project_id: string | null;
  tags: string[] | null;
}

export interface TaskExportNode {
  task: DatabaseTask;
  comments: Comment[];
  attachments: TaskAttachment[];
  notes: NoteExportRow[];
  subtasks: TaskExportNode[];
}

export interface ProjectExportBundle {
  project: Project;
  members: ProjectMemberWithUser[];
  notes: NoteExportRow[];
  tasks: TaskExportNode[];
}

export interface TaskExportBundle {
  task: DatabaseTask;
  project: Project | null;
  comments: Comment[];
  attachments: TaskAttachment[];
  notes: NoteExportRow[];
  subtasks: TaskExportNode[];
}

async function fetchNotesForProject(
  projectId: string,
): Promise<NoteExportRow[]> {
  try {
    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select("id, label, content, updated_at, task_id, project_id, tags")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("aiExportService: project notes", error.message);
      return [];
    }
    return (data ?? []) as NoteExportRow[];
  } catch (error) {
    console.error("aiExportService: project notes exception", error);
    return [];
  }
}

async function fetchNotesForTask(taskId: string): Promise<NoteExportRow[]> {
  try {
    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select("id, label, content, updated_at, task_id, project_id, tags")
      .eq("task_id", taskId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("aiExportService: task notes", error.message);
      return [];
    }
    return (data ?? []) as NoteExportRow[];
  } catch (error) {
    console.error("aiExportService: task notes exception", error);
    return [];
  }
}

async function buildTaskExportNode(
  task: DatabaseTask,
): Promise<TaskExportNode> {
  const [comments, attachments, notes, subtaskRows] = await Promise.all([
    getTaskComments(task.id),
    getTaskAttachments(task.id),
    fetchNotesForTask(task.id),
    workspaceDb(supabase)
      .from("tasks")
      .select("*")
      .eq("parent_task_id", task.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("aiExportService: subtasks", error.message);
          return [] as DatabaseTask[];
        }
        return (data ?? []) as DatabaseTask[];
      }),
  ]);

  const subtasks = await Promise.all(subtaskRows.map(buildTaskExportNode));

  return {
    task,
    comments,
    attachments,
    notes,
    subtasks,
  };
}

function groupTasksByParent(
  tasks: DatabaseTask[],
): Map<string | null, DatabaseTask[]> {
  const byParent = new Map<string | null, DatabaseTask[]>();
  for (const task of tasks) {
    const key = task.parent_task_id ?? null;
    const bucket = byParent.get(key);
    if (bucket) {
      bucket.push(task);
    } else {
      byParent.set(key, [task]);
    }
  }
  return byParent;
}

async function buildTaskForest(
  allTasks: DatabaseTask[],
): Promise<TaskExportNode[]> {
  const byParent = groupTasksByParent(allTasks);
  const roots = byParent.get(null) ?? [];

  async function nodeFromTask(task: DatabaseTask): Promise<TaskExportNode> {
    const children = byParent.get(task.id) ?? [];
    const [comments, attachments, notes] = await Promise.all([
      getTaskComments(task.id),
      getTaskAttachments(task.id),
      fetchNotesForTask(task.id),
    ]);
    const subtasks = await Promise.all(children.map(nodeFromTask));
    return {
      task,
      comments,
      attachments,
      notes,
      subtasks,
    };
  }

  return Promise.all(roots.map(nodeFromTask));
}

/** Full project export: metadata, members, notes, and nested task tree. */
export async function fetchProjectExportBundle(
  projectId: string,
): Promise<ProjectExportBundle | null> {
  const [project, members, allTasks, notes] = await Promise.all([
    getProject(projectId),
    getProjectMembers(projectId),
    getProjectTasks(projectId),
    fetchNotesForProject(projectId),
  ]);

  if (!project) return null;

  const tasks = await buildTaskForest(allTasks);

  return {
    project,
    members,
    notes,
    tasks,
  };
}

/** Full task export: task row, optional project, comments, attachments, notes, nested subtasks. */
export async function fetchTaskExportBundle(
  taskId: string,
): Promise<TaskExportBundle | null> {
  const { data: task, error } = await workspaceDb(supabase)
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error || !task) {
    if (error) console.error("aiExportService: task", error.message);
    return null;
  }

  const row = task as DatabaseTask;
  const [project, comments, attachments, notes, tree] = await Promise.all([
    row.project_id ? getProject(row.project_id) : Promise.resolve(null),
    getTaskComments(taskId),
    getTaskAttachments(taskId),
    fetchNotesForTask(taskId),
    buildTaskExportNode(row),
  ]);

  return {
    task: row,
    project,
    comments,
    attachments,
    notes,
    subtasks: tree.subtasks,
  };
}
