"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Puzzle, Settings, ArrowLeft, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import {
  getProjectBySlug,
  getProject,
  getProjectUserRole,
} from "@/features/projects/service";
import type { Project, ProjectRole } from "@/features/projects/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project Detail Page
 * Route: /organizations/[orgId]/projects/[projectId]
 * [orgId] and [projectId] each accept either a UUID or a slug.
 */
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  const [project, setProject] = React.useState<Project | null>(null);
  const [orgSlug, setOrgSlug] = React.useState<string>("");
  const [projectSlug, setProjectSlug] = React.useState<string>("");
  const [userRole, setUserRole] = React.useState<ProjectRole | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrgSlug(org.slug);

        let proj: Project | null = null;
        if (UUID_REGEX.test(projectId)) {
          proj = await getProject(projectId);
        } else {
          proj = await getProjectBySlug(projectId, org.id);
        }

        if (!proj) {
          setError("Project not found");
          return;
        }
        setProject(proj);
        setProjectSlug(proj.slug ?? proj.id);

        const role = await getProjectUserRole(proj.id);
        setUserRole(role);
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

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading project…</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <Puzzle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-2">
              Project Not Found
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-6">
              {error ?? "This project doesn't exist or you don't have access."}
            </p>
            <Button
              onClick={() =>
                router.push(`/organizations/${orgSlug || orgId}/projects`)
              }
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

  const canManage = userRole === "owner" || userRole === "admin";
  const orgParam = orgSlug || orgId;
  const projectParam = projectSlug || projectId;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-textured">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(`/organizations/${orgParam}/projects`)
                }
                className="flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Projects
              </Button>
              <span className="text-sm text-muted-foreground">/</span>
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span className="text-sm font-medium truncate">
                  {project.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userRole && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {userRole}
                </Badge>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/organizations/${orgParam}/projects/${projectParam}/settings`,
                    )
                  }
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">
                {project.description}
              </p>
            )}
          </div>

          <Card className="p-8 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Project Tasks</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Task management for this project will appear here.
              </p>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/organizations/${orgParam}/projects/${projectParam}/settings`,
                    )
                  }
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Project
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
