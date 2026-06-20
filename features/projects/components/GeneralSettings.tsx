"use client";

/**
 * GeneralSettings — the project's editable General form on the Manage page.
 *
 * A clean, stacked, labeled form (no Edit/Save mode toggle — every field
 * autosaves in place via the shared ProjectInlineEditors). Label sits ABOVE each
 * control, never overlapping. Status+Priority and Start+Target share two-column
 * rows that stack on mobile. Rendered directly on the Manage page (no section
 * header chrome of its own).
 */

import React from "react";
import { Label } from "@/components/ui/label";
import {
  InlineProjectName,
  InlineProjectDescription,
  ProjectStatusPicker,
  ProjectPriorityPicker,
  ProjectDateField,
} from "./ProjectInlineEditors";
import { ProjectContextPicker } from "./ProjectContextSection";
import type { Project, ProjectRole } from "../types";

interface GeneralSettingsProps {
  project: Project;
  canEdit: boolean;
  userRole: ProjectRole;
  /** Lets the parent keep its local Project in sync as fields autosave. */
  onPatch?: (patch: Partial<Project>) => void;
}

export function GeneralSettings({
  project,
  canEdit,
  onPatch,
}: GeneralSettingsProps) {
  // Local copy so inline autosaves reflect immediately without a parent refetch.
  const [proj, setProj] = React.useState<Project>(project);
  React.useEffect(() => setProj(project), [project]);

  const applyPatch = (patch: Partial<Project>) => {
    setProj((prev) => ({ ...prev, ...patch }));
    onPatch?.(patch);
  };

  return (
    <div className="space-y-5">
      <Field label="Name" htmlFor="project-name">
        <InlineProjectName
          project={proj}
          canEdit={canEdit}
          onPatch={applyPatch}
          size="inline"
        />
      </Field>

      <Field label="Description">
        <InlineProjectDescription
          project={proj}
          canEdit={canEdit}
          onPatch={applyPatch}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status">
          <ProjectStatusPicker
            project={proj}
            canEdit={canEdit}
            onPatch={applyPatch}
          />
        </Field>
        <Field label="Priority">
          <ProjectPriorityPicker
            project={proj}
            canEdit={canEdit}
            onPatch={applyPatch}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Start date">
          <ProjectDateField
            project={proj}
            field="startDate"
            canEdit={canEdit}
            onPatch={applyPatch}
          />
        </Field>
        <Field label="Target date">
          <ProjectDateField
            project={proj}
            field="targetDate"
            canEdit={canEdit}
            onPatch={applyPatch}
          />
        </Field>
      </div>

      <Field label="Context">
        <ProjectContextPicker
          project={proj}
          canEdit={canEdit}
          onPatch={applyPatch}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
