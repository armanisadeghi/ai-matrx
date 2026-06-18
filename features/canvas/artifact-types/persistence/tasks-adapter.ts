/**
 * Tasks persistence adapter for the artifact system.
 *
 * Domain table: ctx_tasks (one row per task item; grouped by source artifact
 * via settings->>'source_artifact_id').
 * Link: { externalSystem: 'ctx_tasks', externalId: <source_artifact_id> }
 *   (externalId is the artifactId itself, used as the group key stored in
 *   each task's settings JSONB — there is no separate group/list table.)
 *
 * onMaterialize: parses the rawContent task-list JSON and inserts one ctx_tasks
 *   row per item. Idempotent: first checks if any tasks already carry
 *   settings->>'source_artifact_id' == artifactId and skips creation if found.
 *
 * GAP — no source_artifact_id column on ctx_tasks:
 *   ctx_tasks has no dedicated column for the originating artifact. We embed it
 *   in the existing settings: Json JSONB column as { source_artifact_id: string }.
 *   This is inline — no migration needed, no new service method. A future
 *   migration adding ctx_tasks.source_artifact_id (with index) is recommended.
 *
 * GAP — task-list content shape is assumed:
 *   rawContent is expected to parse to one of:
 *     - string[]                             (bare title list)
 *     - { title: string, ... }[]             (object list, title field required)
 *     - { tasks: <above> }                   (wrapped)
 *     - { items: <above> }                   (wrapped)
 *   Any other shape logs a warning and materializes zero tasks.
 *
 * State shape: TasksArtifactState { tasks: TaskCompletion[] }
 *   Each TaskCompletion is { id, title, status } so the viewer can render a
 *   live checklist without re-parsing rawContent.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { createTask } from "@/features/tasks/services/taskService";
import type {
  ArtifactPersistenceAdapter,
  ArtifactLink,
  MaterializedArtifactInfo,
} from "./artifact-adapters";

// ── State shape ────────────────────────────────────────────────────────────────

export interface TaskCompletion extends Record<string, unknown> {
  id: string;
  title: string;
  status: "incomplete" | "completed";
}

export interface TasksArtifactState extends Record<string, unknown> {
  /** The artifactId used as group key in each task's settings. */
  sourceArtifactId: string;
  /** Live task list (title + completion status). */
  tasks: TaskCompletion[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse rawContent into an array of { title, description? } items.
 * Returns an empty array if the content cannot be parsed or is not a task list.
 */
function parseTaskList(
  rawContent: string,
): Array<{ title: string; description?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    // rawContent may be plain markdown / newline-separated list.
    // Treat each non-empty line as a task title.
    return rawContent
      .split("\n")
      .map((l) => l.replace(/^[-*]\s+|\d+\.\s+/, "").trim())
      .filter(Boolean)
      .map((title) => ({ title }));
  }

  // Unwrap { tasks: [...] } or { items: [...] }
  let list: unknown = parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    list = Array.isArray(obj.tasks)
      ? obj.tasks
      : Array.isArray(obj.items)
        ? obj.items
        : null;

    if (!list) {
      console.warn(
        "[TASKS_ADAPTER] rawContent is an object but has no tasks/items array",
      );
      return [];
    }
  }

  if (!Array.isArray(list)) return [];

  return (list as unknown[]).flatMap((item) => {
    if (typeof item === "string") return [{ title: item }];
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? obj.name ?? obj.text ?? "").trim();
      if (!title) return [];
      return [
        {
          title,
          description:
            typeof obj.description === "string" ? obj.description : undefined,
        },
      ];
    }
    return [];
  });
}

/**
 * Fetch all ctx_tasks rows whose settings contain source_artifact_id = artifactId.
 */
async function fetchTasksByArtifactId(
  userId: string,
  artifactId: string,
): Promise<Array<{ id: string; title: string; status: string }>> {
  const { data, error } = await supabase
    .from("ctx_tasks")
    .select("id, title, status")
    .eq("user_id", userId)
    .contains("settings", { source_artifact_id: artifactId });

  if (error) {
    console.error("[TASKS_ADAPTER] fetchTasksByArtifactId error:", error);
    return [];
  }
  return (data ?? []) as Array<{ id: string; title: string; status: string }>;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const TASKS_ADAPTER: ArtifactPersistenceAdapter<TasksArtifactState> = {
  /**
   * Create ctx_tasks rows from the parsed task-list content.
   * Idempotent: if any rows with settings->>'source_artifact_id' == artifactId
   * already exist, we skip creation entirely (reconcile-safe).
   */
  async onMaterialize(
    info: MaterializedArtifactInfo,
  ): Promise<ArtifactLink | void> {
    const { artifactId, rawContent, title, conversationId } = info;

    try {
      const userId = requireUserId();

      // Idempotency check — skip if already materialized for this artifact.
      const existing = await fetchTasksByArtifactId(userId, artifactId);
      if (existing.length > 0) {
        return {
          externalSystem: "ctx_tasks",
          externalId: artifactId,
        };
      }

      const items = parseTaskList(rawContent);
      if (items.length === 0) {
        console.warn(
          "[TASKS_ADAPTER.onMaterialize] no tasks parsed from rawContent; nothing to create",
        );
        return;
      }

      // Create tasks sequentially to preserve order (parallel inserts would
      // have non-deterministic created_at ordering in a single millisecond).
      let anyCreated = false;
      for (const item of items) {
        // createTask signature: (input: CreateTaskInput) => Promise<DatabaseTask | null>
        const task = await createTask({
          title: item.title,
          description: item.description ?? null,
          status: "incomplete",
          // settings.source_artifact_id is the group key; createTask's input does
          // not expose settings — we patch it via a follow-up update below.
        });

        if (!task) {
          console.error(
            `[TASKS_ADAPTER.onMaterialize] createTask failed for "${item.title}"`,
          );
          continue;
        }

        // Patch settings to embed the source_artifact_id group key.
        // CreateTaskInput doesn't pass settings directly, so we update after insert.
        await supabase
          .from("ctx_tasks")
          .update({
            settings: {
              source_artifact_id: artifactId,
              source_conversation_id: conversationId,
              source_title: title,
            },
          })
          .eq("id", task.id);

        anyCreated = true;
      }

      if (!anyCreated) return;

      return {
        externalSystem: "ctx_tasks",
        externalId: artifactId,
      };
    } catch (err) {
      console.error("[TASKS_ADAPTER.onMaterialize] error:", err);
      return;
    }
  },

  /**
   * Load the current completion state of all tasks for this artifact.
   * Uses link.externalId (= artifactId) as the group key.
   */
  async loadState(
    artifactId: string,
    link?: ArtifactLink,
  ): Promise<TasksArtifactState | null> {
    try {
      const userId = requireUserId();
      const groupKey = link?.externalId ?? artifactId;

      const rows = await fetchTasksByArtifactId(userId, groupKey);

      return {
        sourceArtifactId: groupKey,
        tasks: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: (r.status === "completed" ? "completed" : "incomplete") as
            | "completed"
            | "incomplete",
        })),
      };
    } catch (err) {
      console.error("[TASKS_ADAPTER.loadState] error:", err);
      return null;
    }
  },

  /**
   * Persist task-completion changes.
   *
   * patch.tasks is expected to be a (partial or full) list of { id, status }.
   * Only rows present in patch.tasks are updated — missing rows are left alone.
   * This supports partial saves (e.g. toggling one checkbox at a time).
   */
  async saveState(
    artifactId: string,
    patch: Partial<TasksArtifactState>,
    link?: ArtifactLink,
  ): Promise<boolean> {
    try {
      const userId = requireUserId();
      const groupKey = link?.externalId ?? artifactId;

      if (!patch.tasks || patch.tasks.length === 0) {
        // Nothing to write.
        return true;
      }

      // Verify these tasks actually belong to the group before updating
      // (guard against cross-artifact state leaks).
      const ownedIds = new Set(
        (await fetchTasksByArtifactId(userId, groupKey)).map((r) => r.id),
      );

      let allOk = true;
      for (const item of patch.tasks) {
        if (!ownedIds.has(item.id)) {
          console.warn(
            `[TASKS_ADAPTER.saveState] task ${item.id} does not belong to artifact ${groupKey} — skipping`,
          );
          continue;
        }

        const { error } = await supabase
          .from("ctx_tasks")
          .update({ status: item.status })
          .eq("id", item.id)
          .eq("user_id", userId);

        if (error) {
          console.error(
            `[TASKS_ADAPTER.saveState] update failed for task ${item.id}:`,
            error,
          );
          allOk = false;
        }
      }

      return allOk;
    } catch (err) {
      console.error("[TASKS_ADAPTER.saveState] error:", err);
      return false;
    }
  },
};
