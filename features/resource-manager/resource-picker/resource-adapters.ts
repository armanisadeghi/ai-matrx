import type { Note } from "@/features/notes/types";
import type { DatabaseTask } from "@/features/tasks/types";
import type {
  NoteResourceData,
  ProjectResourceData,
  TaskResourceData,
} from "@ai-matrx/chat/agents/resources/types";

type NoteResourceInput = Pick<Note, "id" | "label" | "content" | "folder_name" | "tags">;
type TaskResourceInput = Pick<
  DatabaseTask,
  "id" | "title" | "status" | "priority" | "due_date" | "project_id" | "description"
>;
type ProjectResourceInput = {
  id: string;
  name: string;
  description: string | null;
  tasks: TaskResourceInput[];
};

export function noteResourceData(note: NoteResourceInput): NoteResourceData {
  return {
    id: note.id,
    label: note.label,
    content: note.content,
    folder_name: note.folder_name,
    tags: note.tags,
  };
}

export function taskResourceData(task: TaskResourceInput): TaskResourceData {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    project_id: task.project_id,
    description: task.description,
  };
}

export function projectResourceData(project: ProjectResourceInput): ProjectResourceData {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    tasks: project.tasks.map(taskResourceData),
  };
}
