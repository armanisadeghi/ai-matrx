"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Menu, Puzzle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useProject } from "@/features/projects/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { getProjectBySlug, getProject } from "@/features/projects/service";
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

        let proj = null;
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
    <div className="h-[calc(100dvh-var(--header-height))] w-full bg-textured overflow-hidden flex flex-col">
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div className="h-12 px-3 md:px-4 flex items-center gap-3">
          <Link
            href={`/organizations/${orgParam}/projects`}
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back to Projects"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Puzzle className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <h1 className="text-base font-semibold truncate">
              {project?.name ?? "Project Settings"}
            </h1>
          </div>

          {isMobile && resolvedOrgId && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>Projects</SheetTitle>
                </SheetHeader>
                <div className="mt-4" onClick={() => setMobileMenuOpen(false)}>
                  <ProjectSidebar
                    organizationId={resolvedOrgId}
                    orgSlug={orgParam}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

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
  );
}
