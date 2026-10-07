import type { Note } from "@/features/notes/types";
import type { DatabaseTask } from "@/features/tasks/types";
import type {
  NoteResourceData,
  TaskResourceData,
} from "@ai-matrx/chat/agents/resources/types";

type NoteResourceInput = Pick<Note, "id" | "label" | "content" | "folder_name" | "tags">;
type TaskResourceInput = Pick<
  DatabaseTask,
  "id" | "title" | "status" | "priority" | "due_date" | "project_id" | "description"
>;

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
