/**
 * Lean xml-ish serialization for project/task "Copy for AI" payloads.
 *
 * One document, no duplicate summary+json dump. Omits empty collections,
 * inherited FKs, null fields, and internal metadata an agent doesn't need.
 */

import type {
  NoteExportRow,
  ProjectExportBundle,
  TaskExportBundle,
  TaskExportNode,
} from "@/features/tasks/services/aiExportService";
import type { TaskAttachment } from "@/features/tasks/services/taskService";
import type { DatabaseTaskComment } from "@/features/tasks/types/database";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAttrs(
  attrs: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function textBlock(tag: string, content: string, level: number): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return `${indent(level)}<${tag}>${escapeXml(trimmed)}</${tag}>\n`;
}

function countTasks(
  nodes: TaskExportNode[],
  predicate: (n: TaskExportNode) => boolean,
): number {
  let count = 0;
  const walk = (list: TaskExportNode[]) => {
    for (const n of list) {
      if (predicate(n)) count += 1;
      walk(n.subtasks);
    }
  };
  walk(nodes);
  return count;
}

function taskStatus(status: string | null | undefined): string {
  return status === "completed" ? "done" : "open";
}

function serializeComments(
  comments: DatabaseTaskComment[],
  level: number,
): string {
  if (comments.length === 0) return "";
  const lines = [`${indent(level)}<comments>\n`];
  for (const c of comments) {
    const body = (c.content ?? "").trim();
    if (!body) continue;
    lines.push(
      `${indent(level + 1)}<comment${renderAttrs({ at: c.created_at ?? undefined })}>${escapeXml(body)}</comment>\n`,
    );
  }
  if (lines.length === 1) return "";
  lines.push(`${indent(level)}</comments>\n`);
  return lines.join("");
}

function serializeNotes(notes: NoteExportRow[], level: number): string {
  if (notes.length === 0) return "";
  const lines = [`${indent(level)}<notes>\n`];
  for (const n of notes) {
    const title = n.label?.trim() || "Untitled";
    const body = (n.content ?? "").trim();
    if (!body && title === "Untitled") continue;
    lines.push(`${indent(level + 1)}<note${renderAttrs({ id: n.id, title })}>`);
    if (body) lines.push(escapeXml(body));
    lines.push(`</note>\n`);
  }
  if (lines.length === 1) return "";
  lines.push(`${indent(level)}</notes>\n`);
  return lines.join("");
}

function serializeAttachments(
  attachments: TaskAttachment[],
  level: number,
): string {
  if (attachments.length === 0) return "";
  const lines = [`${indent(level)}<attachments>\n`];
  for (const a of attachments) {
    lines.push(
      `${indent(level + 1)}<file${renderAttrs({
        name: a.file_name,
        type: a.file_type ?? undefined,
      })} />\n`,
    );
  }
  lines.push(`${indent(level)}</attachments>\n`);
  return lines.join("");
}

function serializeTaskNode(
  node: TaskExportNode,
  level: number,
  /** Inside a project export — omit redundant project/org FKs. */
  inProject: boolean,
): string {
  const { task, comments, notes, attachments, subtasks } = node;
  const attrs: Record<string, string | number | boolean | null | undefined> = {
    id: task.id,
    title: task.title,
    status: taskStatus(task.status),
  };
  if (task.priority) attrs.priority = task.priority;
  if (task.due_date) attrs.due = task.due_date;
  if (task.assignee_id) attrs.assignee = task.assignee_id;
  if (!inProject && task.project_id) attrs["project-id"] = task.project_id;

  const lines = [`${indent(level)}<task${renderAttrs(attrs)}>\n`];
  lines.push(textBlock("description", task.description ?? "", level + 1));
  lines.push(serializeComments(comments, level + 1));
  lines.push(serializeNotes(notes, level + 1));
  lines.push(serializeAttachments(attachments, level + 1));

  if (subtasks.length > 0) {
    lines.push(`${indent(level + 1)}<subtasks>\n`);
    for (const child of subtasks) {
      lines.push(serializeTaskNode(child, level + 2, inProject));
    }
    lines.push(`${indent(level + 1)}</subtasks>\n`);
  }

  lines.push(`${indent(level)}</task>\n`);
  return lines.join("");
}

function serializeMeta(location: string, level = 1): string {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const route = typeof window !== "undefined" ? window.location.pathname : "";
  const copiedAt = new Date().toISOString();

  const lines = [`${indent(level)}<meta>\n`];
  lines.push(
    `${indent(level + 1)}<location>${escapeXml(location)}</location>\n`,
  );
  if (url) lines.push(`${indent(level + 1)}<url>${escapeXml(url)}</url>\n`);
  if (route)
    lines.push(`${indent(level + 1)}<route>${escapeXml(route)}</route>\n`);
  lines.push(`${indent(level + 1)}<copied-at>${copiedAt}</copied-at>\n`);
  lines.push(`${indent(level)}</meta>\n`);
  return lines.join("");
}

/** Single lean document — no duplicate summary/json blocks. */
export function serializeProjectForAi(
  bundle: ProjectExportBundle,
  location: string,
): string {
  const { project, members, notes, tasks } = bundle;
  const projectNotes = notes.filter((n) => !n.task_id);
  const openCount = countTasks(tasks, (n) => n.task.status !== "completed");
  const totalCount = countTasks(tasks, () => true);

  const rootAttrs: Record<
    string,
    string | number | boolean | null | undefined
  > = {
    id: project.id,
    name: project.name,
    status: project.status,
    "open-tasks": openCount,
    "total-tasks": totalCount,
  };
  if (project.slug) rootAttrs.slug = project.slug;
  if (project.priority) rootAttrs.priority = project.priority;
  if (project.organizationId)
    rootAttrs["organization-id"] = project.organizationId;
  if (project.startDate) rootAttrs["start-date"] = project.startDate;
  if (project.targetDate) rootAttrs["target-date"] = project.targetDate;

  const lines = [`<project${renderAttrs(rootAttrs)}>\n`];
  lines.push(serializeMeta(location));
  lines.push(textBlock("description", project.description ?? "", 1));

  if (members.length > 0) {
    lines.push(`${indent(1)}<members>\n`);
    for (const m of members) {
      const email = m.user?.email?.trim();
      const name = m.user?.displayName?.trim();
      lines.push(
        `${indent(2)}<member${renderAttrs({
          role: m.role,
          email: email || undefined,
          name: name || undefined,
        })} />\n`,
      );
    }
    lines.push(`${indent(1)}</members>\n`);
  }

  lines.push(serializeNotes(projectNotes, 1));

  if (tasks.length > 0) {
    lines.push(`${indent(1)}<tasks>\n`);
    for (const t of tasks) {
      lines.push(serializeTaskNode(t, 2, true));
    }
    lines.push(`${indent(1)}</tasks>\n`);
  }

  lines.push(`</project>`);
  return lines.join("");
}

/** Single lean document for one task (includes project ref when present). */
export function serializeTaskForAi(
  bundle: TaskExportBundle,
  location: string,
): string {
  const { task, project, comments, notes, attachments, subtasks } = bundle;

  const rootAttrs: Record<
    string,
    string | number | boolean | null | undefined
  > = {
    id: task.id,
    title: task.title,
    status: taskStatus(task.status),
  };
  if (task.priority) rootAttrs.priority = task.priority;
  if (task.due_date) rootAttrs.due = task.due_date;
  if (task.assignee_id) rootAttrs.assignee = task.assignee_id;

  const lines = [`<task${renderAttrs(rootAttrs)}>\n`];
  lines.push(serializeMeta(location));

  if (project) {
    lines.push(
      `${indent(1)}<project${renderAttrs({
        id: project.id,
        name: project.name,
        status: project.status,
      })} />\n`,
    );
  } else if (task.project_id) {
    lines.push(
      `${indent(1)}<project${renderAttrs({ id: task.project_id })} />\n`,
    );
  }

  lines.push(textBlock("description", task.description ?? "", 1));
  lines.push(serializeComments(comments, 1));
  lines.push(serializeNotes(notes, 1));
  lines.push(serializeAttachments(attachments, 1));

  if (subtasks.length > 0) {
    lines.push(`${indent(1)}<subtasks>\n`);
    for (const st of subtasks) {
      lines.push(serializeTaskNode(st, 2, !!project || !!task.project_id));
    }
    lines.push(`${indent(1)}</subtasks>\n`);
  }

  lines.push(`</task>`);
  return lines.join("");
}
