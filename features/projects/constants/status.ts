/**
 * Canonical project status words — the ONE place a project status's label
 * lives, mirroring `features/tasks/constants/status.ts`. Free of React and
 * icons so forms and non-component code (the directive form's pick-lists) read
 * the same words the project screens show. Icons and pill styles stay with the
 * component (`components/ProjectInlineEditors.tsx` → `PROJECT_STATUS_META`).
 */

import type { ProjectStatus } from "../types";

export const PROJECT_STATUS_LABEL: Readonly<Record<ProjectStatus, string>> = {
  planning: "Planning",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};
