"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Menu, Puzzle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useProject } from "@/features/projects/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { getProjectBySlug, getProject } from "@/features/projects/service";
import type { Project } from "@/features/projects/types";
import { ProjectSidebar } from "@/features/projects/components/ProjectSidebar";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  React.useEffect(() => {
    async function load() {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) return;
        setResolvedOrgId(org.id);
        setOrgSlug(org.slug);

        let proj: Project | null = null;
        if (UUID_REGEX.test(projectId)) {
          proj = await getProject(projectId);
        } else {
          proj = await getProjectBySlug(projectId, org.id);
        }
        if (proj) setResolvedProjectId(proj.id);
      } catch (err) {
        console.error("Error loading project settings layout:", err);
      }
    }
    load();
  }, [orgId, projectId]);

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
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      </div>
    </>
  );
}
