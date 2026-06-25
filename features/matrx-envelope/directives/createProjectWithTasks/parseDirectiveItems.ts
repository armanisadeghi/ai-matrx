import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";

import type {
  CreateProjectTaskItem,
  CreateProjectWithTasksItem,
} from "./types";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseTask(raw: unknown): CreateProjectTaskItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = asString((raw as { name?: unknown }).name);
  if (!name) return null;
  const description =
    (raw as { description?: unknown }).description === null
      ? null
      : (asString((raw as { description?: unknown }).description) ?? null);
  const subtasksRaw = (raw as { subtasks?: unknown }).subtasks;
  const subtasks = Array.isArray(subtasksRaw)
    ? subtasksRaw
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const subName = asString((s as { name?: unknown }).name);
          if (!subName) return null;
          return {
            name: subName,
            description:
              (s as { description?: unknown }).description === null
                ? null
                : (asString((s as { description?: unknown }).description) ??
                  null),
          };
        })
        .filter(Boolean)
    : undefined;
  return {
    name,
    description,
    subtasks: subtasks as CreateProjectTaskItem["subtasks"],
  };
}

function parseItem(raw: unknown): CreateProjectWithTasksItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = asString((raw as { name?: unknown }).name);
  if (!name) return null;

  const slugRaw = (raw as { slug?: unknown }).slug;
  const slug = slugRaw === null ? null : (asString(slugRaw) ?? null);

  const descriptionRaw = (raw as { description?: unknown }).description;
  const description =
    descriptionRaw === null ? null : (asString(descriptionRaw) ?? null);

  const startRaw = (raw as { start_date?: unknown }).start_date;
  const endRaw = (raw as { end_date?: unknown }).end_date;

  const tasksRaw = (raw as { tasks?: unknown }).tasks;
  const tasks = Array.isArray(tasksRaw)
    ? tasksRaw.map(parseTask).filter(Boolean)
    : [];

  return {
    name,
    slug,
    description,
    start_date: startRaw === null ? null : (asString(startRaw) ?? null),
    end_date: endRaw === null ? null : (asString(endRaw) ?? null),
    tasks: tasks as CreateProjectTaskItem[],
  };
}

/** Tolerant parse of envelope items — never throws. */
export function parseCreateProjectWithTasksItems(
  envelope: MatrxEnvelope,
): CreateProjectWithTasksItem[] {
  if (!Array.isArray(envelope.items)) return [];
  return envelope.items
    .map(parseItem)
    .filter((item): item is CreateProjectWithTasksItem => item !== null);
}
