"use client";

/**
 * GeneralSettings — the project's General card on the Manage page.
 *
 * Directly editable, no Edit/Save mode toggle (matches the workspace: view ==
 * edit). Name, organization, status, priority, dates, and description all
 * autosave in place via the shared ProjectInlineEditors. Slug + created are
 * read-only with reasons. Rendered inside ManageSection, so it owns no
 * header/padding of its own.
 */

import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  InlineProjectName,
  InlineProjectDescription,
  ProjectMetaRow,
} from "./ProjectInlineEditors";
import { getRoleLabel, type Project, type ProjectRole } from "../types";

interface GeneralSettingsProps {
  project: Project;
  canEdit: boolean;
  userRole: ProjectRole;
}

export function GeneralSettings({ project, canEdit, userRole }: GeneralSettingsProps) {
  // Local copy so inline autosaves reflect immediately without a parent refetch.
  const [proj, setProj] = React.useState<Project>(project);
  React.useEffect(() => setProj(project), [project]);

  const applyPatch = React.useCallback(
    (patch: Partial<Project>) => setProj((prev) => ({ ...prev, ...patch })),
    [],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Name</Label>
        <InlineProjectName project={proj} canEdit={canEdit} onPatch={applyPatch} size="inline" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status, priority, dates &amp; organization</Label>
        <ProjectMetaRow project={proj} canEdit={canEdit} onPatch={applyPatch} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <InlineProjectDescription project={proj} canEdit={canEdit} onPatch={applyPatch} />
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {proj.slug && (
          <Row label="URL slug" hint="Cannot be changed after creation">
            <span className="font-mono text-muted-foreground">{proj.slug}</span>
          </Row>
        )}
        <Row label="Your role">
          <Badge variant="secondary" className="capitalize">{getRoleLabel(userRole)}</Badge>
        </Row>
        <Row label="Created">
          <span className="text-muted-foreground">
            {proj.createdAt ? format(new Date(proj.createdAt), "MMMM d, yyyy") : "—"}
          </span>
        </Row>
      </dl>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        {hint && <p className="text-xs text-muted-foreground/70 mt-0.5">{hint}</p>}
      </div>
      <dd className="text-sm text-right min-w-0">{children}</dd>
    </div>
  );
}
