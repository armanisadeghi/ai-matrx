"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject, useProjectUserRole } from "@/features/projects/hooks";
import { ProjectSettings } from "@/features/projects/components/ProjectSettings";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { getProjectBySlug, getProject } from "@/features/projects/service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project Settings Page
 * Route: /organizations/[orgId]/projects/[projectId]/settings
 */
export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  const [resolvedProjectId, setResolvedProjectId] = React.useState<
    string | null
  >(null);
  const [orgSlug, setOrgSlug] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrgSlug(org.slug);

        let proj = null;
        if (UUID_REGEX.test(projectId)) {
          proj = await getProject(projectId);
        } else {
          proj = await getProjectBySlug(projectId, org.id);
        }
        if (!proj) {
          setError("Project not found");
          return;
        }
        setResolvedProjectId(proj.id);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load project";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId, projectId]);

  const { project, loading: projectLoading } = useProject(
    resolvedProjectId ?? undefined,
  );
  const {
    role,
    loading: roleLoading,
    isOwner,
    isAdmin,
  } = useProjectUserRole(resolvedProjectId ?? undefined);

  const isLoading = loading || projectLoading || roleLoading;
  const orgParam = orgSlug || orgId;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading project…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
              Project Not Found
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              {error ?? "This project doesn't exist or you don't have access."}
            </p>
            <Button
              onClick={() => router.push(`/organizations/${orgParam}/projects`)}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Access Denied
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              You are not a member of this project.
            </p>
            <Button
              onClick={() => router.push(`/organizations/${orgParam}/projects`)}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <ProjectSettings
        project={project}
        userRole={role}
        isOwner={isOwner}
        isAdmin={isAdmin}
        orgSlug={orgParam}
      />
    </div>
  );
}
