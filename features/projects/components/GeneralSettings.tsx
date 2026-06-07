"use client";

/**
 * GeneralSettings — the project's General card on the Manage page.
 *
 * Clean read view (definition rows) with an inline Edit mode. Editable: name,
 * description, AND organization (an org picker — moving a project between orgs,
 * including the user's personal org, is a first-class action). Read-only: URL
 * slug + created date (with reasons). Rendered inside ManageSection, so it owns
 * no header/padding of its own.
 */

import React from "react";
import { Save, X, Loader2, Pencil, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { updateProject } from "../service";
import {
  validateProjectName,
  getRoleLabel,
  type Project,
  type ProjectRole,
} from "../types";

interface GeneralSettingsProps {
  project: Project;
  canEdit: boolean;
  userRole: ProjectRole;
}

export function GeneralSettings({ project, canEdit, userRole }: GeneralSettingsProps) {
  const dispatch = useAppDispatch();
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  // Live org id (kept in sync after a successful save so read mode is correct
  // without a full reload).
  const [orgId, setOrgId] = React.useState(project.organizationId ?? "");

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setOrgId(project.organizationId ?? "");
    setIsEditing(false);
  }, [project]);

  const currentOrg = organizations.find((o) => o.id === orgId) ?? null;

  const nameValidation = name
    ? validateProjectName(name)
    : { valid: false, error: "Name is required" };
  const hasChanges =
    name !== project.name ||
    description !== (project.description ?? "") ||
    orgId !== (project.organizationId ?? "");

  const handleSave = async () => {
    if (!nameValidation.valid) {
      toast.error(nameValidation.error ?? "Please fix the errors");
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateProject(project.id, {
        name,
        description: description || undefined,
        organizationId: orgId || undefined,
      });
      if (result.success) {
        dispatch(
          invalidateAndRefetchFullContext() as unknown as Parameters<typeof dispatch>[0],
        );
        toast.success("Project updated");
        setIsEditing(false);
      } else {
        toast.error(result.error ?? "Failed to update project");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(project.name);
    setDescription(project.description ?? "");
    setOrgId(project.organizationId ?? "");
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      {/* Action row */}
      {canEdit && (
        <div className="flex justify-end -mt-1">
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || !nameValidation.valid || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="grid gap-4 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={isSaving}
              className={!nameValidation.valid ? "border-red-500" : ""}
            />
            {!nameValidation.valid && (
              <p className="text-xs text-red-600 dark:text-red-400">{nameValidation.error}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-org">Organization</Label>
            <Select value={orgId} onValueChange={setOrgId} disabled={isSaving || orgsLoading}>
              <SelectTrigger id="project-org">
                <SelectValue placeholder={orgsLoading ? "Loading…" : "Select an organization"} />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="flex items-center gap-2">
                      {o.isPersonal ? (
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {o.isPersonal ? "Personal" : o.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Moving a project changes who can access it. Scopes from the previous
              organization may no longer apply.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={isSaving}
              placeholder="What is this project about?"
            />
          </div>
        </div>
      ) : (
        <dl className="divide-y divide-border rounded-lg border border-border">
          <ReadRow label="Name">
            <span className="font-medium text-foreground">{project.name}</span>
          </ReadRow>
          <ReadRow label="Organization">
            {currentOrg ? (
              <span className="inline-flex items-center gap-1.5">
                {currentOrg.isPersonal ? (
                  <>
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">Personal</span>
                  </>
                ) : (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{currentOrg.name}</span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{orgsLoading ? "Loading…" : "—"}</span>
            )}
          </ReadRow>
          <ReadRow label="Description">
            <span className={project.description ? "text-foreground" : "text-muted-foreground italic"}>
              {project.description || "No description"}
            </span>
          </ReadRow>
          {project.slug && (
            <ReadRow label="URL slug" hint="Cannot be changed after creation">
              <span className="font-mono text-muted-foreground">{project.slug}</span>
            </ReadRow>
          )}
          <ReadRow label="Your role">
            <Badge variant="secondary" className="capitalize">{getRoleLabel(userRole)}</Badge>
          </ReadRow>
          <ReadRow label="Created">
            <span className="text-muted-foreground">
              {project.createdAt ? format(new Date(project.createdAt), "MMMM d, yyyy") : "—"}
            </span>
          </ReadRow>
        </dl>
      )}
    </div>
  );
}

function ReadRow({
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
