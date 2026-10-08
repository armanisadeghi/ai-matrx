"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Menu, Puzzle } from "lucide-react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@ai-matrx/design-system";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useProject } from "@/features/projects/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { getProjectBySlug, getProject } from "@/features/projects/service";
import type { Project } from "@/features/projects/types";
import { ReadFailure } from "@ai-matrx/design-system";
import { ProjectSidebar } from "@/features/projects/components/ProjectSidebar";
import { isUuidShape } from "@ai-matrx/kit/uuid";

export function OrgProjectSettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);
  const [orgSlug, setOrgSlug] = React.useState<string>("");
  const [resolvedProjectId, setResolvedProjectId] = React.useState<
    string | null
  >(null);
  // The organization/project read failing is said where the sidebar would be
  // (RC-B12 r13) — it used to only log, leaving the chrome silently absent.
  const [layoutReadError, setLayoutReadError] = React.useState<unknown>(null);
  const [layoutReadAttempt, setLayoutReadAttempt] = React.useState(0);

  React.useEffect(() => {
    async function load() {
      setLayoutReadError(null);
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) return;
        setResolvedOrgId(org.id);
        setOrgSlug(org.slug);

        let proj: Project | null = null;
        if (isUuidShape(projectId)) {
          proj = await getProject(projectId);
        } else {
          proj = await getProjectBySlug(projectId, org.id);
        }
        if (proj) setResolvedProjectId(proj.id);
      } catch (err) {
        console.error("Error loading project settings layout:", err);
        setLayoutReadError(err ?? new Error("The project read failed"));
      }
    }
    load();
  }, [orgId, projectId, layoutReadAttempt]);

  const { project } = useProject(resolvedProjectId ?? undefined);

  const orgParam = orgSlug || orgId;

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href={`/organizations/${orgParam}/projects`}
              ariaLabel="Back to projects"
            />
            <span className="flex min-w-0 items-center gap-1.5 px-1.5">
              <Puzzle className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate max-w-[55vw] sm:max-w-[220px] text-sm font-medium text-foreground">
                {project?.name ?? "Project Settings"}
              </span>
            </span>
          </>
        }
        right={
          isMobile && resolvedOrgId ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          ) : undefined
        }
      />
      {isMobile && resolvedOrgId && (
        <MatrxDynamicPanelHost
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
          title="Projects"
          position="left"
          defaultSize={72}
          contentClassName="overflow-y-auto"
        >
          <div onClick={() => setMobileMenuOpen(false)}>
            <ProjectSidebar organizationId={resolvedOrgId} orgSlug={orgParam} />
          </div>
        </MatrxDynamicPanelHost>
      )}
      <div className="h-full w-full bg-textured overflow-hidden flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {resolvedOrgId && (
          <aside className="hidden md:flex w-52 flex-shrink-0 border-r border-border bg-card overflow-y-auto">
            <div className="p-3 w-full">
              <ProjectSidebar
                organizationId={resolvedOrgId}
                orgSlug={orgParam}
              />
            </div>
          </aside>
        )}
        <main className="flex-1 overflow-y-auto">
          {layoutReadError != null && (
            <ReadFailure
              error={layoutReadError}
              what="this project's organization"
              onRetry={() => setLayoutReadAttempt((n) => n + 1)}
            />
          )}
          {children}
        </main>
      </div>
      </div>
    </>
  );
}
