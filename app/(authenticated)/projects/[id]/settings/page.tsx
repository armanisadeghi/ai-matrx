"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProject, useProjectUserRole } from "@/features/projects/hooks";
import {
  getProject,
  getPersonalProjectBySlug,
} from "@/features/projects/service";
import { ProjectSettings } from "@/features/projects/components/ProjectSettings";

// `/projects/[id]` is the canonical personal-project route. The segment is a
// UUID for new links; older slug-shaped links still resolve via the personal-
// scope slug lookup as a fallback.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Personal Project Settings Page
 * Route: /projects/[id]/settings
 */
export default function PersonalProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectIdParam = params.id as string;

  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const proj = UUID_PATTERN.test(projectIdParam)
          ? await getProject(projectIdParam)
          : await getPersonalProjectBySlug(projectIdParam);
        if (!proj) {
          setError("Project not found");
          return;
        }
        setProjectId(proj.id);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load project";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectIdParam]);

  const { project, loading: projectLoading } = useProject(
    projectId ?? undefined,
  );
  const {
    role,
    loading: roleLoading,
    isOwner,
    isAdmin,
  } = useProjectUserRole(projectId ?? undefined);

  const isLoading = loading || projectLoading || roleLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
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
              onClick={() => router.push("/projects")}
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
              onClick={() => router.push("/projects")}
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
      />
    </div>
  );
}
