/**
 * Project JSON import
 *
 * The single client-side entry point for the "project JSON" shape that the
 * agent backend emits and that users can paste into the create-project window's
 * "Paste JSON" tab. Both validation (pure, no network) and creation (the
 * `create_project_from_json` RPC) live here so there is one source of truth for
 * the contract — the backend and the UI agree by construction.
 *
 * The whole project + tasks + subtasks tree is written in ONE transaction by
 * the RPC (see migrations/create_project_from_json.sql), so a paste either
 * fully lands or not at all.
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { Json } from "@/types/database.types";

// ─────────────────────────────────────────────────────────────────────────────
// Contract types — mirror the agent payload exactly
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectJsonSubtask {
  name: string;
  description?: string | null;
}

export interface ProjectJsonTask {
  name: string;
  description?: string | null;
  subtasks?: ProjectJsonSubtask[];
}

export interface ProjectJsonPayload {
  name: string;
  slug?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  tasks?: ProjectJsonTask[];
}

export interface ProjectJsonValidation {
  valid: boolean;
  /** Hard errors that block creation. */
  errors: string[];
  /** Non-blocking notes (ignored extra keys, derived slug, etc.). */
  warnings: string[];
  /** Parsed payload when JSON parsed (even if validation later fails). */
  payload?: ProjectJsonPayload;
  /** Quick rollup for the UI summary. */
  summary?: {
    name: string;
    taskCount: number;
    subtaskCount: number;
  };
}

export interface CreateProjectFromJsonResult {
  success: boolean;
  error?: string;
  projectId?: string;
  slug?: string;
  organizationId?: string | null;
  taskCount?: number;
  subtaskCount?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse + validate a raw JSON string against the project payload contract.
 * Pure: never touches the network. Returns structured errors/warnings so the
 * UI can show exactly what's wrong before the user commits.
 */
export function validateProjectJson(raw: string): ProjectJsonValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      errors: ["Paste the project JSON to validate."],
      warnings,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return { valid: false, errors: [`Not valid JSON: ${msg}`], warnings };
  }

  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      errors: ["Top-level value must be a JSON object."],
      warnings,
    };
  }

  // Name (required)
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!name) errors.push("`name` is required and must be a non-empty string.");

  // Slug (optional)
  if (parsed.slug != null && typeof parsed.slug !== "string") {
    errors.push("`slug` must be a string or null.");
  } else if (typeof parsed.slug !== "string" || !parsed.slug.trim()) {
    warnings.push("No `slug` provided — one will be generated from the name.");
  }

  // Description (optional)
  if (parsed.description != null && typeof parsed.description !== "string") {
    errors.push("`description` must be a string or null.");
  }

  // Dates (optional)
  for (const key of ["start_date", "end_date"] as const) {
    const val = parsed[key];
    if (val != null && val !== "") {
      if (typeof val !== "string" || !ISO_DATE.test(val.trim())) {
        errors.push(`\`${key}\` must be in YYYY-MM-DD format or null.`);
      }
    }
  }

  // Tasks (optional array)
  let taskCount = 0;
  let subtaskCount = 0;
  const rawTasks = parsed.tasks;
  if (rawTasks != null) {
    if (!Array.isArray(rawTasks)) {
      errors.push("`tasks` must be an array.");
    } else {
      rawTasks.forEach((t, i) => {
        if (!isPlainObject(t)) {
          errors.push(`tasks[${i}] must be an object.`);
          return;
        }
        const tName = typeof t.name === "string" ? t.name.trim() : "";
        if (!tName) {
          errors.push(`tasks[${i}].name is required.`);
        } else {
          taskCount += 1;
        }
        if (t.description != null && typeof t.description !== "string") {
          errors.push(`tasks[${i}].description must be a string or null.`);
        }
        const subs = t.subtasks;
        if (subs != null) {
          if (!Array.isArray(subs)) {
            errors.push(`tasks[${i}].subtasks must be an array.`);
          } else {
            subs.forEach((s, j) => {
              if (!isPlainObject(s)) {
                errors.push(`tasks[${i}].subtasks[${j}] must be an object.`);
                return;
              }
              const sName = typeof s.name === "string" ? s.name.trim() : "";
              if (!sName) {
                errors.push(`tasks[${i}].subtasks[${j}].name is required.`);
              } else {
                subtaskCount += 1;
              }
              if (s.description != null && typeof s.description !== "string") {
                errors.push(
                  `tasks[${i}].subtasks[${j}].description must be a string or null.`,
                );
              }
            });
          }
        }
      });
    }
  } else {
    warnings.push("No `tasks` provided — the project will be created empty.");
  }

  const payload = parsed as unknown as ProjectJsonPayload;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    payload,
    summary: { name, taskCount, subtaskCount },
  };
}

/**
 * Create a project (and its full task/subtask tree) from the JSON payload via
 * the `create_project_from_json` RPC — one transaction, RLS-respecting.
 *
 * @param organizationId  null = personal project (no org).
 */
export async function createProjectFromJson(
  payload: ProjectJsonPayload,
  organizationId: string | null,
): Promise<CreateProjectFromJsonResult> {
  try {
    const { data, error } = await supabase.rpc("create_project_from_json", {
      p_payload: payload as unknown as Json,
      // The RPC defaults p_organization_id to NULL (personal project) when
      // omitted; passing undefined drops the key so the default applies.
      ...(organizationId ? { p_organization_id: organizationId } : {}),
    });

    if (error) throw pgErrorToError(error);

    const result = (data ?? {}) as {
      project_id?: string;
      slug?: string;
      organization_id?: string | null;
      task_count?: number;
      subtask_count?: number;
    };

    if (!result.project_id) {
      return {
        success: false,
        error: "Project was not created (no id returned).",
      };
    }

    return {
      success: true,
      projectId: result.project_id,
      slug: result.slug,
      organizationId: result.organization_id ?? null,
      taskCount: result.task_count ?? 0,
      subtaskCount: result.subtask_count ?? 0,
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to create project from JSON";
    console.error("Error creating project from JSON:", error);
    return { success: false, error: msg };
  }
}
