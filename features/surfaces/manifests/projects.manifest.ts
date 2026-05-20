/**
 * Surface manifest — Projects (`matrx-user/projects`).
 *
 * Project management views (route `/projects`). The user browses projects in
 * the active organization (or personal space) and opens one to work on it.
 *
 * Agents bound here operate on the active project (draft a plan, summarize
 * status) or on the project list (prioritize, group). Lightweight surface —
 * mostly identity + org context.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_project_id",
    label: "Active project ID",
    description:
      "UUID of the project the user has open. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "active_project_name",
    label: "Active project name",
    description:
      "Name of the active project. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "active_project_description",
    label: "Active project description",
    description:
      "Description of the active project. Empty when unset or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 320,
  },
  {
    name: "is_personal_project",
    label: "Is personal project",
    description:
      "True when the active project belongs to the user's personal space rather than an organization. False otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
  },
  {
    name: "active_organization_id",
    label: "Active organization ID",
    description:
      "UUID of the organization context the projects are scoped to. Empty when in personal space.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
  },
  {
    name: "active_organization_name",
    label: "Active organization name",
    description:
      "Name of the active organization. Empty when in personal space.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 345,
  },
  {
    name: "selected_project_ids",
    label: "Selected project IDs",
    description:
      "Array of UUIDs of multi-selected projects. Empty array when nothing is multi-selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 360,
  },
  {
    name: "project_count",
    label: "Project count",
    description:
      "Total number of projects visible to the user in the current context. Zero when none.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 370,
  },
];

export const projectsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/projects",
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createProjectsScope(values: {
  selection?: string;
  context?: Record<string, unknown>;
  active_project_id?: string;
  active_project_name?: string;
  active_project_description?: string;
  is_personal_project?: boolean;
  active_organization_id?: string;
  active_organization_name?: string;
  selected_project_ids?: string[];
  project_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
