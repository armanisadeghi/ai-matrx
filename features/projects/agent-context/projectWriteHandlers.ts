"use client";

/**
 * projectWriteHandlers — the live handlers behind the write targets that
 * `features/surfaces/manifests/projects.manifest.ts` declares for
 * `matrx-user/projects`.
 *
 * This is the receiving end of the 360 loop on the project workspace: an agent
 * calls `apply_surface_write("project_description", …)`, the user confirms in
 * place, and the value lands here — through `updateProject`, the project
 * feature's CANONICAL write path (it validates the name and is the only writer
 * of the project row), never a raw supabase call and never a second write path
 * beside the one the hero's inline editors already use.
 *
 * Every target is `mode: "entity"`, matching how the workspace really behaves:
 * the hero autosaves in place, so an applied write persists and the local
 * `Project` is patched so the user SEES it land in the same beat.
 *
 * Handlers throw on bad input, on a permission the viewer doesn't have, and on
 * a failed save — the writeback runtime turns a throw into the loud toast plus
 * a captured error the agent reads back.
 */

import { updateProject } from "@/features/projects/service";
import {
  PROJECT_STATUS_META,
  PROJECT_PRIORITY_META,
} from "@/features/projects/components/ProjectInlineEditors";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type {
  Project,
  ProjectStatus,
  ProjectPriority,
  UpdateProjectOptions,
} from "@/features/projects/types";

/** Date-only (`YYYY-MM-DD`) — the shape `target_date` is stored and rendered in. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireString(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(`${target} expects a plain string value.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      `${target}: the value is empty. Clearing this field is a user action, not an agent one.`,
    );
  }
  return trimmed;
}

/**
 * `null` (or the string "null"/"none") means "clear it" for the nullable
 * targets. Models routinely send the word rather than the JSON literal, and
 * refusing that would be pedantry, not safety.
 */
function isClear(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "" || v === "null" || v === "none";
}

/** The real vocabularies, read off the constants the pickers themselves use. */
function assertStatus(value: string, target: string): ProjectStatus {
  const allowed = Object.keys(PROJECT_STATUS_META);
  if (!allowed.includes(value)) {
    throw new Error(
      `${target}: "${value}" is not a project status. One of: ${allowed.join(" | ")}.`,
    );
  }
  return value as ProjectStatus;
}

function assertPriority(value: string, target: string): ProjectPriority {
  const allowed = Object.keys(PROJECT_PRIORITY_META);
  if (!allowed.includes(value)) {
    throw new Error(
      `${target}: "${value}" is not a project priority. One of: ${allowed.join(" | ")}, or null to clear.`,
    );
  }
  return value as ProjectPriority;
}

export interface ProjectWriteHandlerDeps {
  /** The project currently open on the workspace. */
  project: Project;
  /** The viewer's settings permission — the same gate the inline editors use. */
  canEdit: boolean;
  /** Patch the workspace's local `Project` so the hero shows the new value. */
  onPatch: (patch: Partial<Project>) => void;
}

/**
 * Build the handler map for the open project. Called by the workspace's
 * `getWriteHandlers`, which the provider re-reads on every apply — so the
 * handlers always close over the CURRENT project and permission, never a
 * snapshot from mount.
 */
export function buildProjectWriteHandlers({
  project,
  canEdit,
  onPatch,
}: ProjectWriteHandlerDeps): SurfaceWriteHandlers {
  /** One canonical save. Persists, then patches local state on success. */
  const save = async (
    target: string,
    updates: UpdateProjectOptions,
    optimistic: Partial<Project>,
  ): Promise<void> => {
    if (!canEdit) {
      throw new Error(
        `${target}: you don't have permission to change this project's settings.`,
      );
    }
    const res = await updateProject(project.id, updates);
    if (!res.success) {
      throw new Error(res.error ?? `${target}: the project could not be saved.`);
    }
    onPatch(optimistic);
  };

  return {
    project_name: async (value: unknown) => {
      // Length/emptiness is `validateProjectName`'s call inside updateProject —
      // we pass the trimmed string and surface its verdict verbatim.
      const name = requireString(value, "project_name");
      await save("project_name", { name }, { name });
    },

    project_description: async (value: unknown) => {
      const description = requireString(value, "project_description");
      await save("project_description", { description }, { description });
    },

    project_status: async (value: unknown) => {
      const status = assertStatus(
        requireString(value, "project_status").toLowerCase(),
        "project_status",
      );
      await save("project_status", { status }, { status });
    },

    project_priority: async (value: unknown) => {
      if (isClear(value)) {
        await save("project_priority", { priority: null }, { priority: null });
        return;
      }
      const priority = assertPriority(
        requireString(value, "project_priority").toLowerCase(),
        "project_priority",
      );
      await save("project_priority", { priority }, { priority });
    },

    project_target_date: async (value: unknown) => {
      if (isClear(value)) {
        await save(
          "project_target_date",
          { targetDate: null },
          { targetDate: null },
        );
        return;
      }
      const raw = requireString(value, "project_target_date");
      if (!DATE_ONLY_RE.test(raw)) {
        throw new Error(
          `project_target_date: "${raw}" is not a date-only string. Use YYYY-MM-DD, or null to clear.`,
        );
      }
      // Catches a well-formed but unreal date (2026-02-31) before it reaches
      // the column, where it would come back as an opaque Postgres error.
      const [y, m, d] = raw.split("-").map(Number);
      const parsed = new Date(Date.UTC(y, m - 1, d));
      if (
        parsed.getUTCFullYear() !== y ||
        parsed.getUTCMonth() !== m - 1 ||
        parsed.getUTCDate() !== d
      ) {
        throw new Error(`project_target_date: "${raw}" is not a real date.`);
      }
      await save(
        "project_target_date",
        { targetDate: raw },
        { targetDate: raw },
      );
    },
  };
}
