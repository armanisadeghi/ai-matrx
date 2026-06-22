/**
 * features/transcript-studio/service/sessionResourceContext.ts
 *
 * Builds the context objects that tell a studio/voice-studio assistant WHAT
 * project (and tasks) the current session is attached to — so the agent never
 * has to blind-query the database and GUESS which of the user's 50 tasks / 33
 * projects this thread is about. (It did exactly that, expensively, before this
 * existed: query all tasks → query all projects → pick "the most recent one".)
 *
 * The split, per the surface's job ("give the model the resources"):
 *   - `session_brief`    — INLINE. The core facts the agent must always know:
 *                          the project name, its overview, and the task list
 *                          (title + status) with counts. Sized to render
 *                          straight into the prompt (high `max_inline_chars`),
 *                          so the model reads it with ZERO tool calls.
 *   - `project_tasks`    — DEFERRED (`max_inline_chars: 0`). The full task list
 *                          WITH ids, so the agent can read a task's body via the
 *                          `data` tool or edit it via `data_action` by id —
 *                          precisely, never by guessing.
 *   - `project_overview` — DEFERRED, only when the inline overview was
 *                          truncated. The complete project description.
 *
 * Rich-form values (the dict-with-`content` shape the backend parses, mirroring
 * `buildWorkingDocumentContextValue`): every value is READ-ONLY (no `mutable` /
 * `source`), so the server exposes only `ctx_get` for them. Editing happens
 * through the agent's `data` / `data_action` tools, not by patching context.
 *
 * Returns `[]` when the session has no project (or nothing has hydrated yet),
 * so a project-less Scribe session is completely unchanged. Callers pass the
 * result into `buildAssistantContextEntries` as extra entries; keys never
 * collide with the studio keys (`recording_NN`, `session_cleaned`,
 * `working_document`) or the War Room `tile_*` keys.
 *
 * Data is read straight from Redux (the project via `fetchProject`, its tasks
 * via `loadProjectTasks` — both dispatched once per session by
 * `useStudioAssistant`). This never refetches what Redux already holds.
 */

import type { RootState } from "@/lib/redux/store";
import type { AssistantContextEntry } from "./assistantContextBuilder";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import {
  selectTopLevelTasksByProjectId,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import { selectSessionById } from "../redux/selectors";

/** Comfortably below the backend's HARD_INLINE_CAP (50 000); the brief is far
 *  smaller than this, so it always renders inline. */
const INLINE_BRIEF_CEIL = 12_000;
/** Overview chars shown inline before we truncate + defer the full text. */
const OVERVIEW_INLINE_CHARS = 600;
/** Task rows listed inline before we summarise the tail ("+N more"). */
const MAX_TASKS_IN_BRIEF = 24;

// ── Read-only rich-form value shapes (dict + `content` ⇒ backend rich form) ──

interface SessionBriefValue {
  content: string;
  type: "text";
  label: string;
  description: string;
  /** High ⇒ renders INLINE in the prompt (no context-tool round trip). */
  max_inline_chars: number;
}

interface ProjectTasksValue {
  content: {
    project_id: string;
    project_name: string;
    total: number;
    tasks: {
      id: string;
      title: string;
      status: string;
      priority: string | null;
      due_date: string | null;
    }[];
  };
  type: "json";
  label: string;
  description: string;
  /** 0 ⇒ DEFERRED; only a manifest row shows, fetched via `context`/`data`. */
  max_inline_chars: 0;
}

interface ProjectOverviewValue {
  content: string;
  type: "text";
  label: string;
  description: string;
  max_inline_chars: 0;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** Tasks here use lifecycle `incomplete` | `completed`; treat anything that
 *  isn't an explicit done-state as open. */
function isDone(status: string): boolean {
  return status === "completed" || status === "done" || status === "complete";
}

function toTaskRow(t: TaskRecord): ProjectTasksValue["content"]["tasks"][number] {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority ?? null,
    due_date: t.due_date ?? null,
  };
}

/**
 * Build the read-only project/task context entries for a session. Empty when
 * the session has no project, or when neither the project nor its tasks have
 * hydrated yet (so we never ship a half-empty brief that names a bare id).
 */
export function buildSessionResourceContextEntries(
  state: RootState,
  sessionId: string,
): AssistantContextEntry[] {
  const session = selectSessionById(sessionId)(state);
  const projectId = session?.projectId ?? null;
  if (!projectId) return [];

  const project = selectProjectById(state, projectId);
  const topTasks = selectTopLevelTasksByProjectId(state, projectId);

  // Nothing hydrated → emit nothing; the load effect will trigger a rebuild
  // once the project/tasks land (the no-empty-push guard keeps context intact).
  if (!project && topTasks.length === 0) return [];

  const entries: AssistantContextEntry[] = [];
  const projectName = project?.name?.trim() || "this session's project";
  const overview = (project?.description ?? "").trim();

  const total = topTasks.length;
  const open = topTasks.filter((t) => !isDone(t.status)).length;

  // ── session_brief (INLINE) ────────────────────────────────────────────
  const lines: string[] = [
    "This voice session is attached to a project. Treat the facts below as " +
      "ground truth — do NOT query the database to rediscover the project or " +
      "its tasks; everything you need (including ids) is already here.",
    "",
    `PROJECT: ${projectName}`,
  ];
  if (overview) {
    lines.push(`Overview: ${truncate(overview, OVERVIEW_INLINE_CHARS)}`);
  }
  lines.push("");
  if (total > 0) {
    lines.push(`TASKS (${open} open / ${total} total):`);
    topTasks.slice(0, MAX_TASKS_IN_BRIEF).forEach((t) => {
      lines.push(`- ${t.title} [${t.status}]`);
    });
    if (total > MAX_TASKS_IN_BRIEF) {
      lines.push(
        `(+${total - MAX_TASKS_IN_BRIEF} more — full list with ids in the ` +
          "deferred `project_tasks` object)",
      );
    }
  } else {
    lines.push("TASKS: none yet.");
  }
  lines.push("");
  lines.push(
    "To read a task's full body or edit a task, use the `data` / " +
      "`data_action` tools with the ids in `project_tasks`.",
  );

  const briefValue: SessionBriefValue = {
    content: lines.join("\n"),
    type: "text",
    label: `Session brief — ${projectName}`,
    description:
      "The project and task list this voice session is attached to. Provided " +
      "inline so you never need to query for it.",
    max_inline_chars: INLINE_BRIEF_CEIL,
  };
  entries.push({
    key: "session_brief",
    value: briefValue,
    type: "text",
    label: briefValue.label,
  });

  // ── project_tasks (DEFERRED — full list with ids) ─────────────────────
  if (total > 0) {
    const tasksValue: ProjectTasksValue = {
      content: {
        project_id: projectId,
        project_name: projectName,
        total,
        tasks: topTasks.map(toTaskRow),
      },
      type: "json",
      label: "Project tasks (full list with ids)",
      description:
        "Every top-level task in this session's project, with ids. Use the " +
        "`data` tool with an id to read a task's full body, or `data_action` " +
        "to edit it.",
      max_inline_chars: 0,
    };
    entries.push({
      key: "project_tasks",
      value: tasksValue,
      type: "text",
      label: tasksValue.label,
    });
  }

  // ── project_overview (DEFERRED — only when the inline copy was truncated) ─
  if (overview.length > OVERVIEW_INLINE_CHARS) {
    const overviewValue: ProjectOverviewValue = {
      content: overview,
      type: "text",
      label: "Project overview (full)",
      description:
        "The complete project description/overview (the inline brief shows a " +
        "truncated version).",
      max_inline_chars: 0,
    };
    entries.push({
      key: "project_overview",
      value: overviewValue,
      type: "text",
      label: overviewValue.label,
    });
  }

  return entries;
}
