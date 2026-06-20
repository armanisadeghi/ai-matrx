"use client";

// features/projects/components/ProjectContextSection.tsx
//
// Canonical context assignment for projects — organization (of record) plus
// scope types/scopes. Projects do not expose project/task FK dimensions on
// themselves.
//
//   • ProjectContextPicker  — compact summary + popover (workspace hero)
//   • ProjectContextSection — full inline field (settings / expanded panels)
//
// Writes:
//   • Scopes → ctx_scope_assignments via ContextAssignmentField (live).
//   • organization_id → updateProject from onSaved (explicit org dropdown).

import { useMemo } from "react";
import { ChevronDown, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  ContextAssignmentField,
  type ContextAssignmentDimension,
  type ContextAssignmentFieldProps,
  type ContextAssignmentSaveResult,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextAssignmentPopover } from "@/features/scopes/components/context-assignment/ContextAssignmentPopover";
import {
  ContextSummaryChips,
  type ContextSummaryInput,
} from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { getProject, updateProject } from "@/features/projects/service";
import type { Project } from "@/features/projects/types";
import { cn } from "@/utils/cn";
import type { AppDispatch } from "@/lib/redux/store";

/** Project tagging surfaces: org-of-record + scopes only. */
export const PROJECT_CONTEXT_DIMENSIONS: ContextAssignmentDimension[] = [
  "scopes",
];

function projectSaveAdapter(
  dispatch: AppDispatch,
  projectId: string,
  currentOrganizationId: string | null,
  onPatch?: (patch: Partial<Project>) => void,
  afterSave?: () => void,
) {
  return async (r: ContextAssignmentSaveResult) => {
    if (!r.ok) return;

    const nextOrgId = r.selection.organizationId;
    if (nextOrgId && nextOrgId !== currentOrganizationId) {
      const res = await updateProject(projectId, { organizationId: nextOrgId });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't save organization.");
        return;
      }
      onPatch?.({ organizationId: nextOrgId });
    }

    // Org may have been adopted when the first scope was assigned.
    if (r.wroteScopes) {
      const fresh = await getProject(projectId);
      if (
        fresh?.organizationId &&
        fresh.organizationId !== currentOrganizationId
      ) {
        onPatch?.({ organizationId: fresh.organizationId });
      }
    }

    await dispatch(invalidateAndRefetchFullContext());
    afterSave?.();
  };
}

function useProjectContextField(
  project: Project,
  onPatch?: (patch: Partial<Project>) => void,
) {
  const dispatch = useAppDispatch();
  const { organizations } = useScopeTree();
  const entityScopes = useEntityScopes({
    entityType: "project",
    entityId: project.id,
    organizationId: project.organizationId,
  });

  const orgName = useMemo(() => {
    if (!project.organizationId) return null;
    return (
      organizations.find((o) => o.id === project.organizationId)?.name ?? null
    );
  }, [organizations, project.organizationId]);

  const onSaved = useMemo(
    () =>
      projectSaveAdapter(
        dispatch,
        project.id,
        project.organizationId,
        onPatch,
        () => void entityScopes.refresh(),
      ),
    [
      dispatch,
      project.id,
      project.organizationId,
      onPatch,
      entityScopes.refresh,
    ],
  );

  const summary: ContextSummaryInput = useMemo(
    () => ({
      organizationId: project.organizationId,
      organizationName: orgName,
      scopeIds: entityScopes.scopeIds,
    }),
    [project.organizationId, orgName, entityScopes.scopeIds],
  );

  const fieldProps = {
    mode: "assignment" as const,
    writeMode: "live" as const,
    subject: {
      entityType: "project" as const,
      entityId: project.id,
      title: project.name,
      icon: FolderKanban,
    },
    dimensions: PROJECT_CONTEXT_DIMENSIONS,
    defaultOrganizationId: project.organizationId ?? undefined,
    hideSubject: true,
    onSaved,
  };

  return { summary, fieldProps, entityScopes };
}

export type ProjectContextPickerProps = {
  project: Project;
  onPatch?: (patch: Partial<Project>) => void;
  className?: string;
  size?: "sm" | "default";
  align?: "start" | "center" | "end";
  canEdit?: boolean;
};

/** Compact control: org + scope chips; click opens the canonical picker. */
export function ProjectContextPicker({
  project,
  onPatch,
  className,
  size = "sm",
  align = "start",
  canEdit = true,
}: ProjectContextPickerProps) {
  const { summary, fieldProps } = useProjectContextField(project, onPatch);

  if (!canEdit) {
    return (
      <ContextSummaryChips
        value={summary}
        size={size}
        emptyText="No context"
        className={className}
      />
    );
  }

  return (
    <ContextAssignmentPopover
      {...fieldProps}
      align={align}
      sectionHeight={320}
      trigger={
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            className,
          )}
        >
          <ContextSummaryChips
            value={summary}
            size={size}
            emptyText="Set context…"
            className="min-w-0 flex-1"
          />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

export type ProjectContextSectionProps = Pick<
  ContextAssignmentFieldProps,
  "hideSubject" | "sectionHeight" | "className" | "fill" | "checkboxVariant"
> & {
  project: Project;
  onPatch?: (patch: Partial<Project>) => void;
};

/** Full inline field — settings page and other expanded surfaces. */
export function ProjectContextSection({
  project,
  onPatch,
  hideSubject = true,
  sectionHeight = 280,
  className,
  fill,
  checkboxVariant,
}: ProjectContextSectionProps) {
  const { fieldProps } = useProjectContextField(project, onPatch);

  return (
    <ContextAssignmentField
      key={project.id}
      {...fieldProps}
      checkboxVariant={checkboxVariant}
      sectionHeight={sectionHeight}
      className={className}
      fill={fill}
      hideSubject={hideSubject}
    />
  );
}
