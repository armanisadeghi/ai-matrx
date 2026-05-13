"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Puzzle, Crown, Shield, User as UserIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgProjects } from "../hooks";
import type { ProjectWithRole } from "../types";

interface ProjectSidebarProps {
  organizationId: string;
  orgSlug: string;
}

export function ProjectSidebar({
  organizationId,
  orgSlug,
}: ProjectSidebarProps) {
  const params = useParams();
  const activeProjectSlug = (params.projectId ??
    params["project-slug"]) as string;
  const { projects, loading } = useOrgProjects(organizationId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <nav className="space-y-1">
      <div className="px-2 mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Projects
      </div>
      {projects.map((project) => (
        <ProjectNavItem
          key={project.id}
          project={project}
          orgSlug={orgSlug}
          isActive={
            project.slug === activeProjectSlug ||
            project.id === activeProjectSlug
          }
        />
      ))}
    </nav>
  );
}

function ProjectNavItem({
  project,
  orgSlug,
  isActive,
}: {
  project: ProjectWithRole;
  orgSlug: string;
  isActive: boolean;
}) {
  const RoleIcon = getRoleIcon(project.role);

  return (
    <Link
      href={`/organizations/${orgSlug}/projects/${project.slug ?? project.id}/settings`}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-sm",
        "hover:bg-muted",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <div className="flex-shrink-0 w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
        <Puzzle className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <span className="flex-1 truncate">{project.name}</span>
      <RoleIcon
        className={cn(
          "h-3 w-3 flex-shrink-0",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      />
    </Link>
  );
}

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return UserIcon;
  }
}
